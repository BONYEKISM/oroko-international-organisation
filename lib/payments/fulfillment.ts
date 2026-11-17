import "server-only";

import type Stripe from "stripe";
import { connectDB } from "@/lib/db";
import { formatAmountForStripe, formatAmountFromStripe } from "@/lib/stripe";
import { formatAmountForPayPal } from "@/lib/payments/paypal";
import Donation from "@/models/Donation";
import Event from "@/models/Event";
import EventRegistration from "@/models/EventRegistration";
import Membership from "@/models/Membership";
import Project from "@/models/Project";

function isMatchingAmount(amount: number, currency: string, expectedAmount: number, expectedCurrency: string) {
  return (
    amount === formatAmountForStripe(expectedAmount, expectedCurrency) &&
    currency.toLowerCase() === expectedCurrency.toLowerCase()
  );
}

async function finalizeDonationPayment(paymentIntent: Stripe.PaymentIntent) {
  const donation = await Donation.findOne({ stripePaymentIntentId: paymentIntent.id });
  if (!donation) return false;
  if (
    paymentIntent.status !== "succeeded" ||
    !isMatchingAmount(paymentIntent.amount_received, paymentIntent.currency, donation.amount, donation.currency)
  ) {
    throw new Error("Stripe donation amount or status did not match the pending donation.");
  }

  const updated = await Donation.findOneAndUpdate(
    { _id: donation._id, status: "pending" },
    {
      $set: {
        status: "succeeded",
        receiptNumber: `OROKO-${Date.now()}`,
      },
    },
    { new: true }
  );
  if (updated?.project) {
    await Project.findByIdAndUpdate(updated.project, {
      $inc: { fundingRaised: updated.amount },
    });
  }
  return true;
}

async function finalizeEventPayment(paymentIntent: Stripe.PaymentIntent) {
  const registration = await EventRegistration.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });
  if (!registration) return false;
  if (
    paymentIntent.status !== "succeeded" ||
    !isMatchingAmount(paymentIntent.amount_received, paymentIntent.currency, registration.totalAmount, registration.currency)
  ) {
    throw new Error("Stripe event payment amount or status did not match the pending registration.");
  }

  await EventRegistration.findOneAndUpdate(
    { _id: registration._id, status: "pending" },
    { $set: { status: "confirmed" } }
  );
  return true;
}

async function finalizeMembershipPayment(paymentIntent: Stripe.PaymentIntent) {
  const membership = await Membership.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });
  if (!membership) return false;
  if (
    paymentIntent.status !== "succeeded" ||
    membership.duesAmount == null ||
    !isMatchingAmount(paymentIntent.amount_received, paymentIntent.currency, membership.duesAmount, membership.duesCurrency ?? "EUR")
  ) {
    throw new Error("Stripe membership payment amount or status did not match the pending dues.");
  }

  await Membership.findOneAndUpdate(
    { _id: membership._id, paymentStatus: "unpaid" },
    {
      $set: {
        paymentStatus: "paid",
        paidAt: new Date(),
        applicationStatus:
          membership.applicationStatus === "pending_payment"
            ? "pending"
            : membership.applicationStatus,
      },
    }
  );
  return true;
}

export async function fulfillStripePaymentIntent(paymentIntent: Stripe.PaymentIntent) {
  await connectDB();
  if (await finalizeDonationPayment(paymentIntent)) return;
  if (await finalizeEventPayment(paymentIntent)) return;
  if (await finalizeMembershipPayment(paymentIntent)) return;
}

export async function activateStripeDonationSubscription(
  donationId: string,
  subscriptionId: string
) {
  await connectDB();
  const donation = await Donation.findOneAndUpdate(
    {
      _id: donationId,
      frequency: "monthly",
      status: { $in: ["pending", "active"] },
    },
    {
      $set: {
        stripeSubscriptionId: subscriptionId,
        paymentProvider: "stripe",
        status: "active",
      },
    },
    { new: true }
  );
  return donation;
}

export async function activatePayPalDonationSubscription(
  donationId: string,
  subscriptionId: string,
  planId: string
) {
  await connectDB();
  const donation = await Donation.findOneAndUpdate(
    {
      _id: donationId,
      frequency: "monthly",
      paypalSubscriptionId: subscriptionId,
      paypalPlanId: planId,
      status: { $in: ["pending", "active"] },
    },
    { $set: { paymentProvider: "paypal", status: "active" } },
    { new: true }
  );
  return donation;
}

export async function recordRecurringDonationPayment(input: {
  subscriptionId: string;
  donationId?: string;
  provider: "stripe" | "paypal";
  paymentId: string;
  amount: number;
  currency: string;
}) {
  await connectDB();
  const subscriptionField =
    input.provider === "stripe" ? "stripeSubscriptionId" : "paypalSubscriptionId";
  const donation = await Donation.findOne({
    ...(input.donationId
      ? { _id: input.donationId }
      : { [subscriptionField]: input.subscriptionId }),
    frequency: "monthly",
    status: { $in: ["active", "pending"] },
  }).select("+stripeSubscriptionId +paypalSubscriptionId");
  if (!donation) return false;
  if (donation[subscriptionField] && donation[subscriptionField] !== input.subscriptionId) {
    throw new Error("Recurring payment subscription did not match the donation.");
  }
  if (
    input.amount !== donation.amount ||
    input.currency.toUpperCase() !== donation.currency.toUpperCase()
  ) {
    throw new Error("Recurring payment amount or currency did not match the donation.");
  }

  const updated = await Donation.findOneAndUpdate(
    {
      _id: donation._id,
      subscriptionPaymentIds: { $ne: input.paymentId },
      status: { $in: ["active", "pending"] },
    },
    {
      $addToSet: { subscriptionPaymentIds: input.paymentId },
      $set: {
        status: "active",
        [subscriptionField]: input.subscriptionId,
      },
    },
    { new: true }
  );
  if (!updated) return false;

  if (updated.project) {
    await Project.findByIdAndUpdate(updated.project, {
      $inc: { fundingRaised: input.amount },
    });
  }
  return true;
}

export async function cancelDonationSubscription(input: {
  provider: "stripe" | "paypal";
  subscriptionId: string;
}) {
  await connectDB();
  const field =
    input.provider === "stripe" ? "stripeSubscriptionId" : "paypalSubscriptionId";
  await Donation.findOneAndUpdate(
    { [field]: input.subscriptionId, frequency: "monthly", status: "active" },
    { $set: { status: "cancelled" } }
  );
}

export async function fulfillPayPalOrder(order: {
  id: string;
  status: string;
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
}) {
  await connectDB();
  if (order.status !== "COMPLETED") {
    throw new Error("PayPal has not completed this payment.");
  }

  const units = order.purchase_units ?? [];
  const capture = units
    .flatMap((unit) => unit.payments?.captures ?? [])
    .find((item) => item.status === "COMPLETED");
  if (!capture) {
    throw new Error("PayPal completed the order but returned no completed capture details.");
  }

  const customId = units.find((unit) =>
    unit.payments?.captures?.some((item) => item.id === capture.id)
  )?.custom_id;
  const orderReference = customId
    ? { _id: customId, $or: [{ paypalOrderId: order.id }, { paypalOrderIds: order.id }] }
    : { $or: [{ paypalOrderId: order.id }, { paypalOrderIds: order.id }] };

  const donation = await Donation.findOne(orderReference);
  if (donation) {
    if (donation.status !== "pending" && donation.status !== "succeeded") {
      throw new Error("This donation is no longer available.");
    }
    if (
      capture.amount.value !== formatAmountForPayPal(donation.amount, donation.currency) ||
      capture.amount.currency_code.toUpperCase() !== donation.currency.toUpperCase()
    ) {
      throw new Error("PayPal donation amount or currency did not match the pending donation.");
    }
    const updated =
      donation.status === "pending"
        ? await Donation.findOneAndUpdate(
            { _id: donation._id, status: "pending" },
            {
              $set: {
                status: "succeeded",
                receiptNumber: `OROKO-${Date.now()}`,
              },
            },
            { new: true }
          )
        : null;
    if (updated?.project) {
      await Project.findByIdAndUpdate(updated.project, {
        $inc: { fundingRaised: updated.amount },
      });
    }
    return { nextUrl: "/donate?payment=success", kind: "donation" as const };
  }

  const registration = await EventRegistration.findOne(orderReference);
  if (registration) {
    if (
      capture.amount.value !== formatAmountForPayPal(registration.totalAmount, registration.currency) ||
      capture.amount.currency_code.toUpperCase() !== registration.currency.toUpperCase()
    ) {
      throw new Error("PayPal ticket amount or currency did not match the pending registration.");
    }
    if (registration.status === "pending") {
      await EventRegistration.findOneAndUpdate(
        { _id: registration._id, status: "pending" },
        { $set: { status: "confirmed" } }
      );
    } else if (registration.status !== "confirmed") {
      throw new Error("This event registration is no longer available.");
    }
    const event = await Event.findById(registration.event).select("slug");
    return {
      nextUrl: event ? `/events/${event.slug}?payment=success` : "/events?payment=success",
      kind: "event" as const,
    };
  }

  const membership = await Membership.findOne(orderReference);
  if (membership) {
    if (
      membership.duesAmount == null ||
      capture.amount.value !== formatAmountForPayPal(membership.duesAmount, membership.duesCurrency ?? "EUR") ||
      capture.amount.currency_code.toUpperCase() !== (membership.duesCurrency ?? "EUR").toUpperCase()
    ) {
      throw new Error("PayPal membership amount or currency did not match the pending dues.");
    }
    if (membership.paymentStatus === "unpaid") {
      await Membership.findOneAndUpdate(
        { _id: membership._id, paymentStatus: "unpaid" },
        {
          $set: {
            paymentStatus: "paid",
            paidAt: new Date(),
            applicationStatus:
              membership.applicationStatus === "pending_payment"
                ? "pending"
                : membership.applicationStatus,
          },
        }
      );
    } else if (membership.paymentStatus !== "paid") {
      throw new Error("This membership payment is no longer available.");
    }
    return { nextUrl: "/payments/complete?flow=membership", kind: "membership" as const };
  }

  throw new Error("No pending payment was found for this PayPal order.");
}

export function stripeAmountToMajor(amount: number, currency: string) {
  return formatAmountFromStripe(amount, currency);
}
