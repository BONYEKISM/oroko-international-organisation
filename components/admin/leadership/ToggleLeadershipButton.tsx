"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { toggleLeadershipPosition } from "@/actions/admin/leadership.actions";

export function ToggleLeadershipButton({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  return (
    <ConfirmButton
      label={isActive ? "Mark vacant" : "Reinstate officer"}
      title={isActive ? "Mark position vacant?" : "Reinstate officer?"}
      description={isActive
        ? "This ends the current officer assignment today. The position remains active and will appear as vacant."
        : "This restores the officer assignment and ends any other active assignment for this position."}
      variant={isActive ? "destructive" : "outline"}
      onConfirm={() => toggleLeadershipPosition(id, !isActive)}
      onDone={() => router.refresh()}
    />
  );
}
