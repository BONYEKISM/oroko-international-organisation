import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";

export const metadata: Metadata = { title: "Payment Complete" };

export default async function PaymentCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>;
}) {
  const { flow } = await searchParams;
  const membershipPayment = flow === "membership";
  const session = membershipPayment ? await auth() : null;
  const profileUrl = "/portal/profile?onboarding=1";
  const loginUrl = `/auth/login?registered=true&callbackUrl=${encodeURIComponent(profileUrl)}`;
  const continueUrl = membershipPayment
    ? session?.user
      ? profileUrl
      : loginUrl
    : "/";

  return (
    <main className="min-h-[65vh] px-4 py-20">
      <div className="mx-auto max-w-lg space-y-4 rounded-sm border border-border bg-white p-8 text-center shadow-sm">
        <h1 className="font-heading text-2xl font-bold text-oroko-black">Payment complete</h1>
        <p className="text-sm text-muted-foreground">
          {membershipPayment
            ? "Your annual dues are paid. Complete your membership profile before admin review."
            : "Your payment has been confirmed."}
        </p>
        <Link
          href={continueUrl}
          className="inline-flex rounded-sm bg-oroko-gold px-5 py-3 text-xs font-bold uppercase tracking-wider text-oroko-black transition-colors hover:bg-oroko-gold-light"
        >
          {membershipPayment ? (session?.user ? "Complete your profile" : "Sign in to continue") : "Return to OROKO"}
        </Link>
      </div>
    </main>
  );
}
