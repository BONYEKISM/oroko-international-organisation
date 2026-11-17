import "server-only";

import { connectDB } from "@/lib/db";
import {
  activatePayPalDonationSubscription,
  activateStripeDonationSubscription,
  fulfillPayPalOrder,
} from "@/lib/payments/fulfillment";
import {
  capturePayPalOrder,
  getPayPalSubscription,
} from "@/lib/payments/paypal";
import { formatAmountForStripe, stripe } from "@/lib/stripe";
import Donation from "@/models/Donation";
import Event from "@/models/Event";
import EventRegistration from "@/models/EventRegistration";
import Membership from "@/models/Membership";

export async function completePayPalOrder(orderId: string) {
  await connectDB();

  const donation = await Donation.findOne({
    $or: [{ paypalOrderId: orderId }, { paypalOrderIds: orderId }],
  });
  if (donation && donation.status === "succeeded") {
    return { nextUrl: "/donate?payment=success" };
  }
  if (donation && donation.status !== "pending") {
    throw new Error("This donation order is no longer available.");
  }

  const registration = await EventRegistration.findOne({
    $or: [{ paypalOrderId: orderId }, { paypalOrderIds: orderId }],
  });
  if (registration && registration.status === "confirmed") {
    const event = await Event.findById(registration.event).select("slug");
    return { nextUrl: event ? `/events/${event.slug}?payment=success` : "/events?payment=success" };
  }
  if (registration && registration.status !== "pending") {
    throw new Error("This ticket order is no longer available.");
  }

  const membership = await Membership.findOne({
    $or: [{ paypalOrderId: orderId }, { paypalOrderIds: orderId }],
  });
  if (membership && membership.paymentStatus === "paid") {
    return { nextUrl: "/payments/complete?flow=membership" };
  }
  if (membership && membership.paymentStatus !== "unpaid") {
    throw new Error("This membership order is no longer available.");
  }
  if (!donation && !registration && !membership) {
    throw new Error("No pending payment was found for this PayPal order.");
  }

  const order = await capturePayPalOrder(orderId);
  return fulfillPayPalOrder(order);
}

export async function completePayPalSubscription(subscriptionId: string) {
  await connectDB();
  const donation = await Donation.findOne({
    paypalSubscriptionId: subscriptionId,
    frequency: "monthly",
    status: { $in: ["pending", "active"] },
  }).select("+paypalPlanId");
  if (!donation?.paypalPlanId) {
    throw new Error("No pending monthly donation was found for this PayPal subscription.");
  }

  const subscription = await getPayPalSubscription(subscriptionId);
  if (
    subscription.id !== subscriptionId ||
    subscription.custom_id !== donation._id.toString() ||
    subscription.plan_id !== donation.paypalPlanId ||
    subscription.status !== "ACTIVE"
  ) {
    throw new Error("PayPal has not activated the expected monthly donation.");
  }
  const updated = await activatePayPalDonationSubscription(
    donation._id.toString(),
    subscriptionId,
    donation.paypalPlanId
  );
  if (!updated) throw new Error("Monthly donation activation could not be verified.");
  return { nextUrl: "/donate?payment=success" };
}

export async function completeStripeSubscription(sessionId: string) {
  const checkout = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
  const donationId = checkout.metadata?.donationId;
  const subscription =
    typeof checkout.subscription === "string"
      ? await stripe.subscriptions.retrieve(checkout.subscription)
      : checkout.subscription;
  if (
    checkout.mode !== "subscription" ||
    checkout.status !== "complete" ||
    !["paid", "no_payment_required"].includes(checkout.payment_status) ||
    !donationId ||
    !subscription ||
    subscription.status !== "active" ||
    subscription.metadata.donationId !== donationId
  ) {
    throw new Error("Stripe has not completed this monthly donation.");
  }

  await connectDB();
  const donation = await Donation.findById(donationId);
  const price = subscription.items.data[0]?.price;
  if (
    !donation ||
    donation.frequency !== "monthly" ||
    price?.unit_amount !== formatAmountForStripe(donation.amount, donation.currency) ||
    price?.currency.toLowerCase() !== donation.currency.toLowerCase() ||
    price.recurring?.interval !== "month"
  ) {
    throw new Error("Stripe subscription amount did not match the donation.");
  }

  const updated = await activateStripeDonationSubscription(donationId, subscription.id);
  if (!updated) throw new Error("Monthly donation activation could not be saved.");
  return { nextUrl: "/donate?payment=success" };
}
