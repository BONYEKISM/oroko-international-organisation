import "server-only";

import { createHash, randomUUID } from "node:crypto";
import OrgSettings from "@/models/OrgSettings";
import PayPalPlan from "@/models/PayPalPlan";

type PayPalLink = { href: string; rel: string };
type PayPalOrder = {
  id: string;
  status: string;
  links?: PayPalLink[];
  purchase_units?: {
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    payments?: {
      captures?: {
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
      }[];
    };
  }[];
};

let accessToken: { value: string; expiresAt: number } | null = null;
const zeroDecimalCurrencies = new Set(["JPY", "KRW", "VND", "XAF", "XOF"]);

export function formatAmountForPayPal(amount: number, currency: string) {
  return zeroDecimalCurrencies.has(currency.toUpperCase())
    ? String(Math.round(amount))
    : amount.toFixed(2);
}

function getApiBase() {
  return process.env.PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken() {
  if (accessToken && accessToken.expiresAt > Date.now() + 60_000) {
    return accessToken.value;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be configured.");
  }

  const response = await fetch(`${getApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const payload = (await response.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? "PayPal authentication failed.");
  }

  accessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 300) * 1000,
  };
  return accessToken.value;
}

export async function paypalRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const responseBody = await response.text();
  const payload = (responseBody ? JSON.parse(responseBody) : {}) as T & {
    message?: string;
    details?: { description?: string }[];
  };
  if (!response.ok) {
    const detail = payload.details?.[0]?.description ?? payload.message;
    throw new Error(detail ?? `PayPal request failed (${response.status}).`);
  }
  return payload;
}

export async function createPayPalOrder(input: {
  amount: number;
  currency: string;
  description: string;
  customId: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const order = await paypalRequest<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": randomUUID() },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.customId,
          custom_id: input.customId,
          description: input.description.slice(0, 127),
          amount: {
            currency_code: input.currency.toUpperCase(),
            value: formatAmountForPayPal(input.amount, input.currency),
          },
        },
      ],
      application_context: {
        brand_name: "OROKO International",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    }),
  });

  const approvalUrl = order.links?.find((link) =>
    ["approve", "payer-action"].includes(link.rel)
  )?.href;
  if (!order.id || !approvalUrl) {
    throw new Error("PayPal did not return an order approval link.");
  }
  return { orderId: order.id, approvalUrl };
}

export async function capturePayPalOrder(orderId: string) {
  const orderPath = `/v2/checkout/orders/${encodeURIComponent(orderId)}`;
  const getOrder = () =>
    paypalRequest<PayPalOrder>(orderPath, {
      headers: { Prefer: "return=representation" },
    });
  const existing = await getOrder();
  if (existing.status === "COMPLETED") return existing;

  const captured = await paypalRequest<PayPalOrder>(
    `${orderPath}/capture`,
    {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `capture-${orderId}`.slice(0, 38),
        Prefer: "return=representation",
      },
      body: "{}",
    }
  );
  const hasCompletedCapture = captured.purchase_units?.some((unit) =>
    unit.payments?.captures?.some((capture) => capture.status === "COMPLETED")
  );
  return captured.status === "COMPLETED" && hasCompletedCapture
    ? captured
    : getOrder();
}

async function getMonthlyDonationProductId() {
  let settings = await OrgSettings.findOne({}).select("+paypalDonationProductId");
  if (!settings) {
    settings = await OrgSettings.create({});
    settings = await OrgSettings.findById(settings._id).select("+paypalDonationProductId");
  }
  if (!settings) throw new Error("Organization payment settings could not be loaded.");
  if (settings.paypalDonationProductId) return settings.paypalDonationProductId;

  const product = await paypalRequest<{ id: string }>("/v1/catalogs/products", {
    method: "POST",
    headers: { "PayPal-Request-Id": "oroko-monthly-donation-product-v1" },
    body: JSON.stringify({
      name: "OROKO International Monthly Donation",
      description: "Recurring monthly donation to OROKO International.",
      type: "SERVICE",
      category: "CHARITY",
    }),
  });
  await OrgSettings.updateOne(
    { _id: settings._id, paypalDonationProductId: { $exists: false } },
    { $set: { paypalDonationProductId: product.id } }
  );

  const saved = await OrgSettings.findById(settings._id).select("+paypalDonationProductId");
  return saved?.paypalDonationProductId ?? product.id;
}

async function getMonthlyDonationPlan(amount: number, currency: string) {
  const normalizedCurrency = currency.toUpperCase();
  const normalizedAmount = formatAmountForPayPal(amount, normalizedCurrency);
  const key = `monthly-donation-${normalizedCurrency}-${normalizedAmount}`;
  const existing = await PayPalPlan.findOne({ key });
  if (existing) return existing.paypalId;

  const productId = await getMonthlyDonationProductId();
  const requestId = `oroko-plan-${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
  const plan = await paypalRequest<{ id: string }>("/v1/billing/plans", {
    method: "POST",
    headers: { "PayPal-Request-Id": requestId },
    body: JSON.stringify({
      product_id: productId,
      name: `Monthly donation ${normalizedCurrency} ${normalizedAmount}`,
      description: "Monthly donation to OROKO International.",
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: normalizedAmount, currency_code: normalizedCurrency },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        payment_failure_threshold: 3,
      },
    }),
  });

  try {
    await PayPalPlan.create({ key, paypalId: plan.id });
    return plan.id;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const saved = await PayPalPlan.findOne({ key });
    if (!saved) throw error;
    return saved.paypalId;
  }
}

export async function createPayPalDonationSubscription(input: {
  donationId: string;
  donorName: string;
  donorEmail: string;
  amount: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const planId = await getMonthlyDonationPlan(input.amount, input.currency);
  const [givenName, ...familyNames] = input.donorName.trim().split(/\s+/);
  const subscription = await paypalRequest<{
    id: string;
    links?: PayPalLink[];
  }>("/v1/billing/subscriptions", {
    method: "POST",
    headers: { "PayPal-Request-Id": randomUUID() },
    body: JSON.stringify({
      plan_id: planId,
      custom_id: input.donationId,
      subscriber: {
        name: { given_name: givenName, surname: familyNames.join(" ") || givenName },
        email_address: input.donorEmail,
      },
      application_context: {
        brand_name: "OROKO International",
        user_action: "SUBSCRIBE_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    }),
  });
  const approvalUrl = subscription.links?.find((link) => link.rel === "approve")?.href;
  if (!subscription.id || !approvalUrl) {
    throw new Error("PayPal did not return a subscription approval link.");
  }
  return { subscriptionId: subscription.id, planId, approvalUrl };
}

export async function verifyPayPalWebhook(request: Request, body: unknown) {
  const eventType =
    body !== null &&
    typeof body === "object" &&
    "event_type" in body &&
    typeof body.event_type === "string"
      ? body.event_type
      : undefined;
  const webhookIdVariableByEventType: Record<string, string> = {
    "PAYMENT.CAPTURE.COMPLETED": "PAYPAL_WEBHOOK_ID_CAPTURE",
    "BILLING.SUBSCRIPTION.ACTIVATED": "PAYPAL_WEBHOOK_ID_SUBSCRIPTION",
    "PAYMENT.SALE.COMPLETED": "PAYPAL_WEBHOOK_ID_COMPLETED",
    "BILLING.SUBSCRIPTION.CANCELLED": "PAYPAL_WEBHOOK_ID_CANCELLED",
    "BILLING.SUBSCRIPTION.SUSPENDED": "PAYPAL_WEBHOOK_ID_SUSPENDED",
  };
  const webhookIdVariable = eventType
    ? webhookIdVariableByEventType[eventType]
    : undefined;
  const webhookId =
    (webhookIdVariable && process.env[webhookIdVariable]) ||
    process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error(
      `${webhookIdVariable ?? "PAYPAL_WEBHOOK_ID"} is not configured.`
    );
  }

  const header = (name: string) => request.headers.get(name);
  const authAlgo = header("paypal-auth-algo");
  const certUrl = header("paypal-cert-url");
  const transmissionId = header("paypal-transmission-id");
  const transmissionSig = header("paypal-transmission-sig");
  const transmissionTime = header("paypal-transmission-time");
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return false;
  }

  const result = await paypalRequest<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: body,
      }),
    }
  );
  return result.verification_status === "SUCCESS";
}

export async function getPayPalSubscription(subscriptionId: string) {
  return paypalRequest<{
    id: string;
    status: string;
    plan_id: string;
    custom_id?: string;
  }>(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export async function cancelPayPalSubscription(subscriptionId: string) {
  await paypalRequest<Record<string, never>>(
    `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ reason: "Cancelled by donor" }),
    }
  );
}
