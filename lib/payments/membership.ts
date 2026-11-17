import "server-only";

import { connectDB } from "@/lib/db";
import { formatAmountForStripe, stripe } from "@/lib/stripe";
import { createPayPalOrder } from "@/lib/payments/paypal";
import {
  getPaymentCancelUrl,
  getPaymentReturnUrl,
} from "@/lib/payments/origin";
import { fulfillStripePaymentIntent } from "@/lib/payments/fulfillment";
import Membership from "@/models/Membership";
import User from "@/models/User";

export type MembershipCheckoutResult = {
  success: boolean;
  error?: string;
  clientSecret?: string;
  approvalUrl?: string;
  alreadyPaid?: boolean;
};

export async function beginMembershipCheckout(
  membershipId: string,
  provider: "stripe" | "paypal"
): Promise<MembershipCheckoutResult> {
  await connectDB();
  const membership = await Membership.findById(membershipId)
    .select("+stripePaymentIntentId +paypalOrderId +paypalOrderIds");
  if (!membership) return { success: false, error: "Membership application not found." };
  if (membership.paymentStatus !== "unpaid") {
    return { success: false, error: "Membership dues are already paid or waived." };
  }
  if (membership.duesAmount == null || membership.duesAmount <= 0) {
    return { success: false, error: "Annual membership dues are not configured." };
  }

  const user = await User.findById(membership.user).select("email");
  if (!user?.email) return { success: false, error: "Applicant email could not be found." };

  if (provider === "stripe") {
    if (membership.stripePaymentIntentId) {
      const previous = await stripe.paymentIntents.retrieve(membership.stripePaymentIntentId);
      if (previous.status === "succeeded") {
        await fulfillStripePaymentIntent(previous);
        return { success: true, alreadyPaid: true };
      }
      if (previous.status !== "canceled") {
        if (!["requires_payment_method", "requires_confirmation", "requires_action"].includes(previous.status)) {
          return {
            success: false,
            error: "A previous payment is still processing. Please wait before trying again.",
          };
        }
        await stripe.paymentIntents.cancel(previous.id);
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: formatAmountForStripe(membership.duesAmount, membership.duesCurrency ?? "EUR"),
      currency: (membership.duesCurrency ?? "EUR").toLowerCase(),
      receipt_email: user.email,
      metadata: {
        paymentType: "membership",
        membershipId: membership._id.toString(),
      },
    });
    if (!paymentIntent.client_secret) {
      throw new Error("Stripe did not return a payment client secret.");
    }
    membership.paymentProvider = "stripe";
    membership.stripePaymentIntentId = paymentIntent.id;
    await membership.save();
    return { success: true, clientSecret: paymentIntent.client_secret ?? undefined };
  }

  const order = await createPayPalOrder({
    amount: membership.duesAmount,
    currency: membership.duesCurrency ?? "EUR",
    description: "OROKO annual membership dues",
    customId: membership._id.toString(),
    returnUrl: getPaymentReturnUrl("paypal", "membership"),
    cancelUrl: getPaymentCancelUrl("membership"),
  });
  membership.paymentProvider = "paypal";
  membership.paypalOrderId = order.orderId;
  membership.paypalOrderIds.push(order.orderId);
  await membership.save();
  return { success: true, approvalUrl: order.approvalUrl };
}
