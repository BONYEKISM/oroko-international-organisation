"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteMemberAccount } from "@/actions/admin/members.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteMemberButtonProps {
  memberId: string;
  memberName: string;
  returnTo: string;
}

export function DeleteMemberButton({
  memberId,
  memberName,
  returnTo,
}: DeleteMemberButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (confirmation !== "DELETE") return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteMemberAccount(memberId);
        if (!result.success) {
          setError(result.error ?? "Could not delete this member.");
          return;
        }
        router.replace(returnTo);
        router.refresh();
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "The deletion request failed. Please try again."
        );
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        Delete Member
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!isPending) {
            setOpen(nextOpen);
            if (!nextOpen) {
              setConfirmation("");
              setError(null);
            }
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete {memberName}?</DialogTitle>
            <DialogDescription>
              This permanently removes the account and linked app records,
              including membership, donation, event, and welfare data. Any
              active recurring donations will be cancelled first. This does
              not refund payments or delete payment-provider history or uploaded
              media held by external providers. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`delete-member-${memberId}`}>
              Type DELETE to confirm
            </Label>
            <Input
              id={`delete-member-${memberId}`}
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={isPending}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending || confirmation !== "DELETE"}
            >
              {isPending ? "Deleting…" : "Permanently Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
