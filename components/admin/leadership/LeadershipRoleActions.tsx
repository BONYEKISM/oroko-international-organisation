"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteLeadershipRole, updateLeadershipRole } from "@/actions/admin/leadership.actions";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Role = {
  id: string;
  name: string;
  description: string;
  responsibilities: string[];
  order: number;
  isActive: boolean;
  isPresident: boolean;
};

export function LeadershipRoleActions({ role }: { role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [responsibilities, setResponsibilities] = useState(role.responsibilities.join("\n"));
  const [order, setOrder] = useState(String(role.order));
  const [isActive, setIsActive] = useState(role.isActive);
  const [isPresident, setIsPresident] = useState(role.isPresident);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await updateLeadershipRole(role.id, {
        name,
        description,
        responsibilities: responsibilities.split("\n").map((item) => item.trim()).filter(Boolean),
        order: Number(order),
        isActive,
        isPresident,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to update position");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Unable to update the position. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="xs" variant="outline">Edit</Button>} />
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Executive Council position</DialogTitle>
            <DialogDescription>Changes are reflected on the public council page.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`role-name-${role.id}`}>Position title</Label>
              <Input id={`role-name-${role.id}`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`role-description-${role.id}`}>Description</Label>
              <Textarea id={`role-description-${role.id}`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`role-responsibilities-${role.id}`}>Responsibilities (one per line)</Label>
              <Textarea id={`role-responsibilities-${role.id}`} value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)} rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`role-order-${role.id}`}>Display order</Label>
              <Input id={`role-order-${role.id}`} type="number" min={0} step={1} value={order} onChange={(e) => setOrder(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={role.isPresident} className="size-4 accent-oroko-gold" />
                Active and visible on the public page
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isPresident} onChange={(e) => setIsPresident(e.target.checked)} disabled={role.isPresident} className="size-4 accent-oroko-gold" />
                This is the President role
              </label>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || !name.trim()}>{isSubmitting ? "Saving…" : "Save position"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmButton
        label="Remove"
        title="Remove position?"
        description="A position with assignment history cannot be deleted. Inactive positions can be restored later."
        variant="destructive"
        size="xs"
        onConfirm={() => deleteLeadershipRole(role.id)}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
