import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Membership from "@/models/Membership";
import { getOrgSettings } from "@/lib/dal/org-settings";
import { MembershipPaymentForm } from "@/components/portal/MembershipPaymentForm";
import Link from "next/link";

export const metadata: Metadata = { title: "Membership Dues" };

export default async function PortalMembershipPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");
  await connectDB();

  const [membership, settings] = await Promise.all([
    Membership.findOne({ user: session.user.id })
      .select("paymentStatus applicationStatus duesAmount duesCurrency")
      .lean(),
    getOrgSettings(),
  ]);
  if (!membership) redirect("/portal");

  const amount = membership.duesAmount ?? settings.membershipDuesAmount;
  const currency = membership.duesCurrency ?? settings.membershipDuesCurrency;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-oroko-gold">My Account</p>
        <h1 className="mt-1 font-heading text-3xl font-bold text-oroko-black">Membership Dues</h1>
      </div>
      <div className="space-y-3 rounded-sm border border-border bg-white p-5">
        <p className="text-sm text-muted-foreground">
          Annual dues: <span className="font-semibold text-oroko-black">{currency} {amount.toFixed(2)}</span>
        </p>
        {membership.paymentStatus === "paid" || membership.paymentStatus === "waived" ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700">
              {membership.paymentStatus === "paid" ? "Your annual dues are paid." : "Your dues have been waived."}
              {membership.applicationStatus !== "approved" && " Complete your profile before admin review."}
            </p>
            {membership.applicationStatus !== "approved" && (
              <Link
                href="/portal/profile?onboarding=1"
                className="inline-flex rounded-sm bg-oroko-gold px-5 py-3 text-xs font-bold uppercase tracking-wider text-oroko-black transition-colors hover:bg-oroko-gold-light"
              >
                Complete membership profile
              </Link>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Complete payment to submit your membership application for review.
            </p>
            <MembershipPaymentForm amount={amount} currency={currency} />
          </>
        )}
      </div>
    </div>
  );
}
