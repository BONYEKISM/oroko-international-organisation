import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import {
  cancelDonationSubscription,
  fulfillStripePaymentIntent,
  recordRecurringDonationPayment,
  stripeAmountToMajor,
} from "@/lib/payments/fulfillment";
import { completeStripeSubscription } from "@/lib/payments/return";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!process.env.STRIPE_WEBHOOK_SECRET || !signature) {
    return NextResponse.json({ error: "Webhook configuration missing" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe webhook signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await fulfillStripePaymentIntent(event.data.object as Stripe.PaymentIntent);
        break;

      case "checkout.session.completed": {
        const checkout = event.data.object as Stripe.Checkout.Session;
        if (checkout.mode === "subscription" && checkout.subscription) {
          await completeStripeSubscription(checkout.id);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionDetails = invoice.parent?.subscription_details;
        const subscriptionValue = subscriptionDetails?.subscription;
        const subscriptionId =
          typeof subscriptionValue === "string" ? subscriptionValue : subscriptionValue?.id;
        if (subscriptionId && invoice.amount_paid > 0) {
          await recordRecurringDonationPayment({
            provider: "stripe",
            subscriptionId,
            donationId: subscriptionDetails?.metadata?.donationId,
            paymentId: invoice.id,
            amount: stripeAmountToMajor(invoice.amount_paid, invoice.currency),
            currency: invoice.currency,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await cancelDonationSubscription({
          provider: "stripe",
          subscriptionId: subscription.id,
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[stripe webhook ${event.type}]`, error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
