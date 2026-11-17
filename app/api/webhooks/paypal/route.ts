import { NextResponse } from "next/server";
import {
  cancelDonationSubscription,
  recordRecurringDonationPayment,
} from "@/lib/payments/fulfillment";
import { completePayPalOrder, completePayPalSubscription } from "@/lib/payments/return";
import { verifyPayPalWebhook } from "@/lib/payments/paypal";

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  let body: PayPalWebhookEvent;
  try {
    body = await request.json() as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 });
  }

  try {
    if (!(await verifyPayPalWebhook(request, body))) {
      return NextResponse.json({ error: "Invalid PayPal webhook signature." }, { status: 400 });
    }

    const resource = asRecord(body.resource);
    switch (body.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        const supplementary = asRecord(resource?.supplementary_data);
        const relatedIds = asRecord(supplementary?.related_ids);
        const orderId = stringValue(relatedIds?.order_id);
        if (orderId) await completePayPalOrder(orderId);
        break;
      }

      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        const subscriptionId = stringValue(resource?.id);
        if (subscriptionId) await completePayPalSubscription(subscriptionId);
        break;
      }

      case "PAYMENT.SALE.COMPLETED": {
        const subscriptionId = stringValue(resource?.billing_agreement_id);
        const paymentId = stringValue(resource?.id);
        const amount = asRecord(resource?.amount);
        const currency = stringValue(amount?.currency);
        const value = stringValue(amount?.total);
        if (subscriptionId && paymentId && currency && value) {
          await recordRecurringDonationPayment({
            provider: "paypal",
            subscriptionId,
            paymentId,
            amount: Number(value),
            currency,
          });
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.SUSPENDED": {
        const subscriptionId = stringValue(resource?.id);
        if (subscriptionId) {
          await cancelDonationSubscription({
            provider: "paypal",
            subscriptionId,
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[paypal webhook ${body.event_type ?? "unknown"}]`, error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
