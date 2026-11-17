"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelMonthlyDonation } from "@/actions/donation.actions";

export function CancelMonthlyDonationButton({ donationId }: { donationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function cancelDonation() {
    if (!window.confirm("Cancel this monthly donation? No future payments will be collected.")) return;
    setError(null);
    setIsLoading(true);
    const result = await cancelMonthlyDonation(donationId);
    setIsLoading(false);
    if (!result.success) {
      setError(result.error ?? "Could not cancel this monthly donation.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={cancelDonation}
        disabled={isLoading}
        className="text-xs font-semibold text-destructive underline-offset-2 hover:underline disabled:opacity-50"
      >
        {isLoading ? "Cancelling…" : "Cancel monthly donation"}
      </button>
      {error && <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
