"use server";

import { connectDB } from "@/lib/db";
import Donation from "@/models/Donation";
import { stripe, formatAmountForStripe } from "@/lib/stripe";
import { auth } from "@/auth";
import { z } from "zod";
import type { ActionResult } from "@/types";
import {
  cancelDonationSubscription,
  fulfillStripePaymentIntent,
} from "@/lib/payments/fulfillment";
import {
  cancelPayPalSubscription,
  createPayPalDonationSubscription as createPayPalBillingSubscription,
  createPayPalOrder,
} from "@/lib/payments/paypal";
import {
  getPaymentCancelUrl,
  getPaymentReturnUrl,
} from "@/lib/payments/origin";

const donationSchema = z.object({
  donorName: z.string().min(2, "Name is required").max(100),
  donorEmail: z.string().email("Valid email required"),
  amount: z.number().min(1, "Minimum donation is $1").max(50000)
    .transform((amount) => Math.round(amount * 100) / 100),
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "AUD"]).default("USD"),
  type: z.enum(["general", "project"]).default("general"),
  projectId: z.string().optional(),
  message: z.string().max(500).optional(),
  isAnonymous: z.boolean().default(false),
  frequency: z.enum(["once", "monthly", "annually"]).default("once"),
});

export type DonationInput = z.infer<typeof donationSchema>;

async function createDonationRecord(
  data: DonationInput,
  paymentProvider: "stripe" | "paypal"
) {
  const session = await auth();
  await connectDB();
  return Donation.create({
    donorName: data.isAnonymous ? "Anonymous" : data.donorName,
    donorEmail: data.donorEmail,
    userId: session?.user?.id ?? undefined,
    amount: data.amount,
    currency: data.currency.toUpperCase(),
    type: data.type,
    project: data.projectId ?? undefined,
    message: data.message,
    isAnonymous: data.isAnonymous,
    frequency: data.frequency,
    paymentProvider,
    status: "pending",
  });
}

export async function createPaymentIntent(
  data: unknown
): Promise<ActionResult & { clientSecret?: string; donationId?: string }> {
  const parsed = donationSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const { donorName, donorEmail, amount, currency, type, projectId, isAnonymous, frequency } = parsed.data;
  if (frequency !== "once") {
    return { success: false, error: "Select one-time donation for card payments." };
  }

  try {
    await connectDB();
    const stripeAmount = formatAmountForStripe(amount, currency);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: stripeAmount,
      currency: currency.toLowerCase(),
      metadata: {
        donorName: isAnonymous ? "Anonymous" : donorName,
        donorEmail,
        type,
        projectId: projectId ?? "",
        frequency,
      },
      receipt_email: donorEmail,
    });
    if (!paymentIntent.client_secret) {
      throw new Error("Stripe did not return a payment client secret.");
    }

    const donation = await createDonationRecord(parsed.data, "stripe");
    donation.stripePaymentIntentId = paymentIntent.id;
    await donation.save();

    return {
      success: true,
      clientSecret: paymentIntent.client_secret ?? undefined,
      donationId: donation._id.toString(),
    };
  } catch (err) {
    console.error("[createPaymentIntent]", err);
    const msg = err instanceof Error ? err.message : "Payment setup failed";
    return { success: false, error: msg };
  }
}

export async function createPayPalDonationOrder(
  data: unknown
): Promise<ActionResult & { approvalUrl?: string; donationId?: string }> {
  const parsed = donationSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  if (parsed.data.frequency !== "once") {
    return { success: false, error: "Select one-time donation for PayPal checkout." };
  }

  try {
    const donation = await createDonationRecord(parsed.data, "paypal");
    const order = await createPayPalOrder({
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      description: parsed.data.type === "project" ? "OROKO project donation" : "OROKO donation",
      customId: donation._id.toString(),
      returnUrl: getPaymentReturnUrl("paypal", "donation"),
      cancelUrl: getPaymentCancelUrl("donation"),
    });
    donation.paypalOrderId = order.orderId;
    donation.paypalOrderIds.push(order.orderId);
    await donation.save();

    return {
      success: true,
      approvalUrl: order.approvalUrl,
      donationId: donation._id.toString(),
    };
  } catch (err) {
    console.error("[createPayPalDonationOrder]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "PayPal checkout setup failed.",
    };
  }
}

export async function createStripeDonationSubscription(
  data: unknown
): Promise<ActionResult & { checkoutUrl?: string }> {
  const parsed = donationSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  if (parsed.data.frequency !== "monthly") {
    return { success: false, error: "Select monthly donations to start a recurring payment." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return {
      success: false,
      error: "Sign in to manage and cancel a monthly donation.",
    };
  }

  try {
    const donation = await createDonationRecord(parsed.data, "stripe");
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: parsed.data.donorEmail,
      line_items: [
        {
          price_data: {
            currency: parsed.data.currency.toLowerCase(),
            unit_amount: formatAmountForStripe(parsed.data.amount, parsed.data.currency),
            recurring: { interval: "month" },
            product_data: { name: "Monthly donation to OROKO International" },
          },
          quantity: 1,
        },
      ],
      metadata: { donationId: donation._id.toString() },
      subscription_data: { metadata: { donationId: donation._id.toString() } },
      success_url: `${getPaymentReturnUrl("stripe", "donation")}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: getPaymentCancelUrl("donation"),
    });
    if (!checkout.url) throw new Error("Stripe did not return a subscription checkout URL.");

    donation.stripeCustomerId = typeof checkout.customer === "string" ? checkout.customer : undefined;
    await donation.save();
    return { success: true, checkoutUrl: checkout.url };
  } catch (err) {
    console.error("[createStripeDonationSubscription]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Recurring donation setup failed.",
    };
  }
}

export async function createPayPalDonationSubscription(
  data: unknown
): Promise<ActionResult & { approvalUrl?: string }> {
  const parsed = donationSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  if (parsed.data.frequency !== "monthly") {
    return { success: false, error: "Select monthly donations to start a recurring payment." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return {
      success: false,
      error: "Sign in to manage and cancel a monthly donation.",
    };
  }

  try {
    const donation = await createDonationRecord(parsed.data, "paypal");
    const subscription = await createPayPalBillingSubscription({
      donationId: donation._id.toString(),
      donorName: parsed.data.donorName,
      donorEmail: parsed.data.donorEmail,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      returnUrl: getPaymentReturnUrl("paypal", "donation"),
      cancelUrl: getPaymentCancelUrl("donation"),
    });
    donation.paypalSubscriptionId = subscription.subscriptionId;
    donation.paypalPlanId = subscription.planId;
    await donation.save();
    return { success: true, approvalUrl: subscription.approvalUrl };
  } catch (err) {
    console.error("[createPayPalDonationSubscription]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Recurring donation setup failed.",
    };
  }
}

export async function confirmDonation(donationId: string): Promise<ActionResult> {
  try {
    await connectDB();
    const donation = await Donation.findOne({
      _id: donationId,
      frequency: "once",
      status: { $in: ["pending", "succeeded"] },
    }).select("+stripePaymentIntentId");
    if (!donation?.stripePaymentIntentId) {
      return { success: false, error: "Stripe donation payment not found." };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(donation.stripePaymentIntentId);
    await fulfillStripePaymentIntent(paymentIntent);
    return { success: true };
  } catch (err) {
    console.error("[confirmDonation]", err);
    return { success: false, error: "Failed to confirm donation payment." };
  }
}

export async function cancelMonthlyDonation(donationId: string): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Sign in to manage your donation." };
    await connectDB();
    const donation = await Donation.findOne({
      _id: donationId,
      userId: session.user.id,
      frequency: "monthly",
      status: "active",
    }).select("+stripeSubscriptionId +paypalSubscriptionId");
    if (!donation) return { success: false, error: "Active monthly donation not found." };

    if (donation.paymentProvider === "stripe" && donation.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(donation.stripeSubscriptionId);
      await cancelDonationSubscription({
        provider: "stripe",
        subscriptionId: donation.stripeSubscriptionId,
      });
    } else if (donation.paymentProvider === "paypal" && donation.paypalSubscriptionId) {
      await cancelPayPalSubscription(donation.paypalSubscriptionId);
      await cancelDonationSubscription({
        provider: "paypal",
        subscriptionId: donation.paypalSubscriptionId,
      });
    } else {
      return { success: false, error: "The recurring donation could not be located with its provider." };
    }

    return { success: true };
  } catch (err) {
    console.error("[cancelMonthlyDonation]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Could not cancel the recurring donation.",
    };
  }
}

export async function getDonationHistory(): Promise<{
  id: string; amount: number; currency: string; type: string;
  projectTitle?: string; status: string; receiptNumber?: string; createdAt: string;
  frequency: string; paymentProvider: string;
}[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  await connectDB();

  const donations = await Donation.find({ userId: session.user.id })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate("project", "title")
    .lean();

  return donations.map((d) => ({
    id: d._id.toString(),
    amount: d.amount,
    currency: d.currency,
    type: d.type,
    projectTitle: (d.project as { title?: string } | null)?.title,
    status: d.status,
    receiptNumber: d.receiptNumber,
    createdAt: d.createdAt.toISOString(),
    frequency: d.frequency,
    paymentProvider: d.paymentProvider,
  }));
}
