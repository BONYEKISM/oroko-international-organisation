"use client";

import { useState, type ChangeEvent } from "react";
import { CldImage } from "next-cloudinary";
import { Camera, Loader2, CheckCircle, X } from "lucide-react";
import Image from "next/image";
import { updateProfilePhoto } from "@/actions/profile.actions";

type Props = {
  currentPhoto?: string;
  userName: string;
  initials: string;
};

export function PhotoUpload({ currentPhoto, userName, initials }: Props) {
  const [savedPhoto, setSavedPhoto] = useState(currentPhoto);
  // pendingUrl is set after a Cloudinary upload, before the user confirms save
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  const displayPhoto = pendingUrl ?? savedPhoto;

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setPhotoError("Choose a JPG or PNG image.");
      return;
    }
    if (file.size > 5_000_000) {
      setPhotoError("Photo must be 5 MB or smaller.");
      return;
    }

    setPhotoError(null);
    setSaving(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("upload_preset", "oroko_profiles");

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body }
      );
      const result = (await response.json()) as {
        secure_url?: unknown;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(result.error?.message ?? "Cloudinary rejected the upload.");
      }
      if (typeof result.secure_url !== "string") {
        throw new Error("Cloudinary did not return a secure photo URL.");
      }

      setPendingUrl(result.secure_url);
    } catch (error) {
      console.error("[PhotoUpload] Cloudinary upload failed", error);
      setPhotoError(
        error instanceof Error ? error.message : "Photo upload failed. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const savePhoto = async () => {
    if (!pendingUrl) return;
    setSaving(true);
    setPhotoError(null);
    try {
      const res = await updateProfilePhoto(pendingUrl);
      if (!res.success) {
        setPhotoError(res.error ?? "Failed to save photo.");
        return;
      }

      setSavedPhoto(pendingUrl);
      setPendingUrl(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("[PhotoUpload] Failed to save profile photo", error);
      setPhotoError(
        error instanceof Error ? error.message : "Failed to save photo. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const discardPending = () => {
    setPendingUrl(null);
    setPhotoError(null);
  };

  if (!cloudName) {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="size-24 rounded-full bg-oroko-green flex items-center justify-center">
          <span className="font-heading text-3xl font-bold text-white">{initials}</span>
        </div>
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          Set{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">
            NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
          </code>{" "}
          to enable photo upload.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Photo preview */}
      <div className="relative">
        <div className="size-28 rounded-full overflow-hidden border-4 border-border bg-oroko-green">
          {displayPhoto ? (
            displayPhoto.includes("cloudinary") ? (
              <CldImage
                src={displayPhoto}
                alt={userName}
                width={112}
                height={112}
                crop="fill"
                gravity="face"
                className="object-cover w-full h-full"
              />
            ) : (
              <Image
                src={displayPhoto}
                alt={userName}
                width={112}
                height={112}
                className="object-cover w-full h-full"
              />
            )
          ) : (
            <div className="size-full flex items-center justify-center">
              <span className="font-heading text-3xl font-bold text-white">
                {initials}
              </span>
            </div>
          )}
        </div>

        {pendingUrl && (
          <div className="absolute -top-1 -right-1 size-5 rounded-full bg-oroko-gold flex items-center justify-center">
            <span className="text-oroko-black text-[9px] font-bold">!</span>
          </div>
        )}
      </div>

      {/* Pending state — new photo uploaded but not yet saved */}
      {pendingUrl ? (
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <p className="text-xs text-muted-foreground text-center">
            New photo ready — save to keep it.
          </p>
          {photoError && (
            <p className="text-xs text-destructive text-center" role="alert">
              {photoError}
            </p>
          )}
          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={savePhoto}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-oroko-gold text-oroko-black text-xs tracking-[0.15em] uppercase font-bold hover:bg-oroko-gold-light disabled:opacity-50 transition-colors rounded-sm"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {saving ? "Saving…" : "Save Photo"}
            </button>
            <button
              type="button"
              onClick={discardPending}
              disabled={saving}
              className="px-3 py-2.5 border border-border text-muted-foreground hover:text-oroko-black hover:border-oroko-black/30 transition-colors rounded-sm"
              aria-label="Discard new photo"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle className="size-4" /> Photo saved
            </span>
          )}
          {photoError && (
            <p className="max-w-xs text-center text-xs text-destructive" role="alert">
              {photoError}
            </p>
          )}

          <label
            htmlFor="profile-photo-file"
            className={`flex items-center gap-2 px-4 py-2 border border-border text-xs tracking-wider uppercase text-muted-foreground transition-colors rounded-sm ${
              saving
                ? "opacity-50 cursor-not-allowed"
                : "cursor-pointer hover:text-oroko-black hover:border-oroko-black/30"
            }`}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Camera className="size-3.5" />
            )}
            {saving ? "Uploading…" : savedPhoto ? "Change Photo" : "Upload Photo"}
          </label>
          <input
            id="profile-photo-file"
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            disabled={saving}
            onChange={uploadPhoto}
          />

          <p className="text-xs text-muted-foreground">JPG or PNG · Max 5 MB</p>
        </>
      )}
    </div>
  );
}
