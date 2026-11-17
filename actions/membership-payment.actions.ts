"use server";

import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import { fulfillStripePaymentIntent } from "@/lib/payments/fulfillment";
import { beginMembershipCheckout } from "@/lib/payments/membership";
import { stripe } from "@/lib/stripe";
import Membership from "@/models/Membership";
import { Types } from "mongoose";
import { z } from "zod";
import type { ActionResult } from "@/types";

export async function createMembershipPayment(
  provider: unknown
): Promise<ActionResult & { clientSecret?: string; approvalUrl?: string; alreadyPaid?: boolean }> {
  try {
    const parsedProvider = z.enum(["stripe", "paypal"]).safeParse(provider);
    if (!parsedProvider.success) {
      return { success: false, error: "Select a valid payment method." };
    }
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Sign in to pay membership dues." };
    await connectDB();

    const membership = await Membership.findOne({ user: new Types.ObjectId(session.user.id) });
    if (!membership) return { success: false, error: "Membership application not found." };
    const checkout = await beginMembershipCheckout(membership._id.toString(), parsedProvider.data);
    if (!checkout.success) return { success: false, error: checkout.error };
    return {
      success: true,
      clientSecret: checkout.clientSecret,
      approvalUrl: checkout.approvalUrl,
      alreadyPaid: checkout.alreadyPaid,
    };
  } catch (error) {
    console.error("[createMembershipPayment]", error);
    return { success: false, error: "Could not start membership payment." };
  }
}

export async function confirmMembershipPayment(membershipId?: string): Promise<ActionResult> {
  try {
    await connectDB();
    let membership;
    if (membershipId) {
      if (!Types.ObjectId.isValid(membershipId)) {
        return { success: false, error: "Invalid membership application." };
      }
      membership = await Membership.findById(membershipId).select("+stripePaymentIntentId");
    } else {
      const session = await auth();
      if (!session?.user?.id) return { success: false, error: "Sign in to confirm membership payment." };
      membership = await Membership.findOne({
        user: new Types.ObjectId(session.user.id),
      }).select("+stripePaymentIntentId");
    }
    if (!membership?.stripePaymentIntentId) {
      return { success: false, error: "Stripe membership payment not found." };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(membership.stripePaymentIntentId);
    await fulfillStripePaymentIntent(paymentIntent);
    return { success: true };
  } catch (error) {
    console.error("[confirmMembershipPayment]", error);
    return { success: false, error: "Could not confirm membership payment." };
  }
}
