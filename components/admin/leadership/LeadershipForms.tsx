"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  assignLeadershipPosition,
  createLeadershipRole,
  updateExecutivePresidentMessage,
} from "@/actions/admin/leadership.actions";
import { CountrySelect } from "@/components/admin/leadership/CountrySelect";

interface LeadershipFormsProps {
  roles: { id: string; name: string; isActive: boolean; isPresident: boolean }[];
  presidentMessage: string;
}

export function LeadershipForms({ roles, presidentMessage }: LeadershipFormsProps) {
  const router = useRouter();
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [isPresident, setIsPresident] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleSubmitting, setRoleSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(roles.find((role) => role.isActive)?.id ?? "");
  const [countryCode, setCountryCode] = useState("");
  const [term, setTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const [message, setMessage] = useState(presidentMessage);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageSubmitting, setMessageSubmitting] = useState(false);

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    setRoleError(null);
    setRoleSubmitting(true);
    try {
      const result = await createLeadershipRole({
        name: roleName,
        description: roleDescription,
        responsibilities: responsibilities.split("\n").map((item) => item.trim()).filter(Boolean),
        isPresident,
      });
      if (!result.success) {
        setRoleError(result.error ?? "Failed to create position");
        return;
      }
      setRoleName("");
      setRoleDescription("");
      setResponsibilities("");
      setIsPresident(false);
      router.refresh();
    } catch {
      setRoleError("Unable to create position. Please try again.");
    } finally {
      setRoleSubmitting(false);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setAssignError(null);
    setAssignSubmitting(true);
    try {
      const result = await assignLeadershipPosition({
        email,
        roleId,
        countryCode,
        term,
        startDate,
        endDate,
        bio,
        photoUrl,
      });
      if (!result.success) {
        setAssignError(result.error ?? "Failed to assign position");
        return;
      }
      setEmail("");
      setCountryCode("");
      setTerm("");
      setStartDate("");
      setEndDate("");
      setBio("");
      setPhotoUrl("");
      router.refresh();
    } catch {
      setAssignError("Unable to assign this member. Please try again.");
    } finally {
      setAssignSubmitting(false);
    }
  }

  async function handleMessageSave(e: React.FormEvent) {
    e.preventDefault();
    setMessageError(null);
    setMessageSubmitting(true);
    try {
      const result = await updateExecutivePresidentMessage(message);
      if (!result.success) {
        setMessageError(result.error ?? "Failed to save message");
        return;
      }
      router.refresh();
    } catch {
      setMessageError("Unable to save the presidential message. Please try again.");
    } finally {
      setMessageSubmitting(false);
    }
  }

  const activeRoles = roles.filter((role) => role.isActive);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-oroko-black">Create a position</h2>
            <p className="text-sm text-muted-foreground">New positions appear on the public council page.</p>
          </div>
          <form onSubmit={handleCreateRole} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="leadership-role-name">Position title</Label>
              <Input id="leadership-role-name" value={roleName} onChange={(e) => setRoleName(e.target.value)} required maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leadership-role-description">Description</Label>
              <Textarea id="leadership-role-description" value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} rows={2} maxLength={1000} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leadership-role-responsibilities">Responsibilities (one per line)</Label>
              <Textarea id="leadership-role-responsibilities" value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)} rows={2} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isPresident} onChange={(e) => setIsPresident(e.target.checked)} className="size-4 accent-oroko-gold" />
              Designate as the President role
            </label>
            {roleError && <p role="alert" className="text-sm text-destructive">{roleError}</p>}
            <Button type="submit" disabled={roleSubmitting || !roleName.trim()}>
              {roleSubmitting ? "Creating…" : "Create position"}
            </Button>
          </form>
        </section>

        <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-oroko-black">Assign an officer</h2>
            <p className="text-sm text-muted-foreground">An existing assignment is archived when a successor is assigned.</p>
          </div>
          <form onSubmit={handleAssign} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="leadership-member-email">Member email</Label>
              <Input id="leadership-member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Select value={roleId} onValueChange={(value) => setRoleId(value ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select position" /></SelectTrigger>
              <SelectContent>
                {activeRoles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <CountrySelect
              id="leadership-member-country"
              value={countryCode}
              onChange={setCountryCode}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="leadership-term">Term of office (optional)</Label>
                <Input id="leadership-term" value={term} onChange={(e) => setTerm(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leadership-photo">Portrait URL (optional)</Label>
                <Input id="leadership-photo" type="url" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leadership-start-date">Start date (optional)</Label>
                <Input id="leadership-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leadership-end-date">End date (optional)</Label>
                <Input id="leadership-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leadership-bio">Biography (optional)</Label>
              <Textarea id="leadership-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={2000} />
            </div>
            {assignError && <p role="alert" className="text-sm text-destructive">{assignError}</p>}
            <Button type="submit" disabled={assignSubmitting || activeRoles.length === 0 || !roleId}>
              {assignSubmitting ? "Assigning…" : "Assign position"}
            </Button>
          </form>
        </section>

        <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-oroko-black">Presidential message</h2>
            <p className="text-sm text-muted-foreground">Optional statement displayed in the President&apos;s feature.</p>
          </div>
          <form onSubmit={handleMessageSave} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="executive-president-message">Message</Label>
              <Textarea id="executive-president-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={7} maxLength={1000} />
            </div>
            {messageError && <p role="alert" className="text-sm text-destructive">{messageError}</p>}
            <Button type="submit" disabled={messageSubmitting}>
              {messageSubmitting ? "Saving…" : "Save message"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
