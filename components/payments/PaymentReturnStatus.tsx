"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, Loader2, XCircle } from "lucide-react";

type Props = {
  provider: "paypal" | "stripe";
  flow: string;
  token?: string;
  subscriptionId?: string;
  sessionId?: string;
};

export function PaymentReturnStatus({
  provider,
  flow,
  token,
  subscriptionId,
  sessionId,
}: Props) {
  const started = useRef(false);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your payment securely…");
  const [nextUrl, setNextUrl] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function verifyPayment() {
      try {
        const response = await fetch("/api/payments/return", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, token, subscriptionId, sessionId }),
        });
        const result = (await response.json()) as { success?: boolean; nextUrl?: string; error?: string };
        if (!response.ok || !result.success || !result.nextUrl) {
          throw new Error(result.error ?? "We could not verify this payment.");
        }
        setNextUrl(result.nextUrl);
        setMessage("Your payment has been confirmed.");
        setStatus("success");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "We could not verify this payment.");
        setStatus("error");
      }
    }

    void verifyPayment();
  }, [provider, token, subscriptionId, sessionId]);

  const backUrl = flow === "membership" ? "/portal/membership" : flow === "event" ? "/events" : "/donate";

  return (
    <main className="min-h-[65vh] px-4 py-20">
      <div className="mx-auto max-w-lg space-y-5 rounded-sm border border-border bg-white p-8 text-center shadow-sm">
        {status === "loading" && <Loader2 className="mx-auto size-10 animate-spin text-oroko-gold" />}
        {status === "success" && <CheckCircle className="mx-auto size-10 text-emerald-600" />}
        {status === "error" && <XCircle className="mx-auto size-10 text-destructive" />}
        <h1 className="font-heading text-2xl font-bold text-oroko-black">
          {status === "loading" ? "Confirming payment" : status === "success" ? "Payment complete" : "Payment not confirmed"}
        </h1>
        <p className="text-sm text-muted-foreground" role="status">{message}</p>
        {status !== "loading" && (
          <div className="flex flex-wrap justify-center gap-3">
            {status === "success" && nextUrl && (
              <Link
                href={nextUrl}
                className="rounded-sm bg-oroko-gold px-5 py-3 text-xs font-bold uppercase tracking-wider text-oroko-black transition-colors hover:bg-oroko-gold-light"
              >
                Continue
              </Link>
            )}
            <Link href={backUrl} className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-oroko-green hover:underline">
              {status === "success" ? "Return to site" : "Try again"}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
