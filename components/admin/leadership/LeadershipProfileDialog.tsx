"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CldUploadWidget } from "next-cloudinary";
import { updateLeadershipProfile } from "@/actions/admin/leadership.actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud } from "lucide-react";

type Props = {
  id: string;
  roleName: string;
  userName: string;
  bio: string;
  photoUrl: string;
  isPublished: boolean;
};

export function LeadershipProfileDialog({ id, roleName, userName, bio, photoUrl, isPublished }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileBio, setProfileBio] = useState(bio);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(photoUrl);
  const [isProfilePublished, setIsProfilePublished] = useState(isPublished);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await updateLeadershipProfile(id, {
        bio: profileBio,
        photoUrl: profilePhotoUrl,
        isPublished: isProfilePublished,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to update profile");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Unable to update this profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xs" variant="outline">Edit bio &amp; portrait</Button>} />
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {roleName} profile</DialogTitle>
          <DialogDescription>Review the content before publishing {userName}&apos;s profile.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`officer-photo-${id}`}>Portrait URL</Label>
            <div className="flex gap-2">
              <Input
                id={`officer-photo-${id}`}
                type="url"
                value={profilePhotoUrl}
                onChange={(e) => setProfilePhotoUrl(e.target.value)}
                placeholder="https://…"
                className="min-w-0 flex-1"
              />
              {cloudName && (
                <CldUploadWidget
                  uploadPreset="oroko_documents"
                  options={{ maxFiles: 1, resourceType: "image" }}
                  onSuccess={(result) => {
                    const info = result.info;
                    if (
                      typeof info === "object" &&
                      info !== null &&
                      "secure_url" in info &&
                      typeof info.secure_url === "string"
                    ) {
                      setProfilePhotoUrl(info.secure_url);
                    }
                  }}
                >
                  {({ open: openUpload }) => (
                    <Button type="button" variant="outline" size="icon" aria-label="Upload portrait" onClick={() => openUpload()}>
                      <UploadCloud className="size-4" />
                    </Button>
                  )}
                </CldUploadWidget>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Use a secure Cloudinary image URL or upload a portrait.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`officer-bio-${id}`}>Biography</Label>
            <Textarea id={`officer-bio-${id}`} value={profileBio} onChange={(e) => setProfileBio(e.target.value)} rows={6} maxLength={2000} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={isProfilePublished}
              onChange={(e) => setIsProfilePublished(e.target.checked)}
              className="mt-0.5 size-4 accent-oroko-gold"
            />
            Publish this officer&apos;s name and approved profile on the public page
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save profile"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
