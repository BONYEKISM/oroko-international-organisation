import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Payment Cancelled" };

export default async function PaymentCancelledPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>;
}) {
  const { flow } = await searchParams;
  const backUrl =
    flow === "membership" ? "/portal/membership" : flow === "event" ? "/events" : "/donate";

  return (
    <main className="min-h-[65vh] px-4 py-20">
      <div className="mx-auto max-w-lg space-y-4 rounded-sm border border-border bg-white p-8 text-center shadow-sm">
        <h1 className="font-heading text-2xl font-bold text-oroko-black">Payment cancelled</h1>
        <p className="text-sm text-muted-foreground">
          No payment was completed. You can return and try again whenever you are ready.
        </p>
        <Link
          href={backUrl}
          className="inline-flex rounded-sm bg-oroko-gold px-5 py-3 text-xs font-bold uppercase tracking-wider text-oroko-black transition-colors hover:bg-oroko-gold-light"
        >
          Return
        </Link>
      </div>
    </main>
  );
}
