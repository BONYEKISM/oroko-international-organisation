import type { Metadata } from "next";
import { PaymentReturnStatus } from "@/components/payments/PaymentReturnStatus";

export const metadata: Metadata = { title: "Confirming Payment" };

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{
    provider?: string;
    flow?: string;
    token?: string;
    subscription_id?: string;
    session_id?: string;
  }>;
}) {
  const params = await searchParams;
  const provider = params.provider === "stripe" ? "stripe" : "paypal";
  return (
    <PaymentReturnStatus
      provider={provider}
      flow={params.flow ?? "donation"}
      token={params.token}
      subscriptionId={params.subscription_id}
      sessionId={params.session_id}
    />
  );
}
