"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";
import { confirmMembershipPayment, createMembershipPayment } from "@/actions/membership-payment.actions";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

export function MembershipPaymentForm({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<"stripe" | "paypal">("stripe");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaid, setIsPaid] = useState(false);

  async function startPayment() {
    setError(null);
    setIsLoading(true);
    try {
      const result = await createMembershipPayment(provider);
      if (!result.success) {
        setError(result.error ?? "Could not start membership payment.");
        return;
      }
      if (result.alreadyPaid) {
        setIsPaid(true);
        router.refresh();
        return;
      }
      if (result.approvalUrl) {
        window.location.assign(result.approvalUrl);
        return;
      }
      if (result.clientSecret) {
        setClientSecret(result.clientSecret);
        return;
      }
      setError("The payment provider did not return checkout details.");
    } catch (paymentError) {
      console.error("[MembershipPaymentForm]", paymentError);
      setError("Could not start payment. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isPaid) {
    return <p className="text-sm text-emerald-700">Your dues are paid. Your application is awaiting review.</p>;
  }

  if (clientSecret) {
    return (
      <Elements
        stripe={stripePromise}
        options={{ clientSecret, appearance: { theme: "stripe" } }}
      >
        <StripeMembershipPayment amount={amount} currency={currency} />
      </Elements>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        {(["stripe", "paypal"] as const).map((method) => (
          <button
            key={method}
            type="button"
            aria-pressed={provider === method}
            onClick={() => setProvider(method)}
            className={`rounded-sm border px-3 py-2.5 text-sm font-medium transition-colors ${
              provider === method
                ? "border-oroko-gold bg-oroko-gold/10 text-oroko-black"
                : "border-border text-muted-foreground hover:border-oroko-gold/40"
            }`}
          >
            {method === "paypal" ? "PayPal" : "Card (Stripe)"}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={startPayment}
        disabled={isLoading}
        className="inline-flex items-center gap-2 rounded-sm bg-oroko-gold px-5 py-3 text-xs font-bold uppercase tracking-wider text-oroko-black transition-colors hover:bg-oroko-gold-light disabled:opacity-50"
      >
        {isLoading && <Loader2 className="size-4 animate-spin" />}
        {isLoading ? "Starting checkout…" : `Pay ${currency} ${amount.toFixed(2)}`}
      </button>
    </div>
  );
}

function StripeMembershipPayment({ amount, currency }: { amount: number; currency: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaid, setIsPaid] = useState(false);

  if (isPaid) {
    return <p className="text-sm text-emerald-700">Your dues are paid. Your application is awaiting review.</p>;
  }

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setIsProcessing(true);
    setError(null);
    const confirmation = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (confirmation.error) {
      setError(confirmation.error.message ?? "Payment failed.");
      setIsProcessing(false);
      return;
    }
    const result = await confirmMembershipPayment();
    if (!result.success) {
      setError(result.error ?? "Payment was received but could not be confirmed.");
      setIsProcessing(false);
      return;
    }
    setIsPaid(true);
    router.refresh();
    setIsProcessing(false);
  }

  return (
    <form onSubmit={submitPayment} className="space-y-4">
      <p className="text-sm text-muted-foreground">Annual dues: {currency} {amount.toFixed(2)}</p>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="flex w-full items-center justify-center gap-2 rounded-sm bg-oroko-gold px-5 py-3 text-xs font-bold uppercase tracking-wider text-oroko-black transition-colors hover:bg-oroko-gold-light disabled:opacity-50"
      >
        {isProcessing && <Loader2 className="size-4 animate-spin" />}
        {isProcessing ? "Processing…" : "Pay annual dues"}
      </button>
    </form>
  );
}
