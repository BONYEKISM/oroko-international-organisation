"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { addImageToAlbum, removeImageFromAlbum, updateAlbumImage } from "@/actions/admin/gallery.actions";
import { Pencil } from "lucide-react";

interface AlbumImage {
  id: string;
  url: string;
  caption?: string;
}

export function AlbumImagesManager({ albumId, images }: { albumId: string; images: AlbumImage[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingImage, setEditingImage] = useState<AlbumImage | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) { setError("Image URL is required"); return; }
    setError(null);
    setIsSubmitting(true);
    const result = await addImageToAlbum(albumId, url.trim(), caption.trim() || undefined);
    setIsSubmitting(false);
    if (!result.success) { setError(result.error ?? "Failed"); return; }
    setUrl(""); setCaption("");
    router.refresh();
  }

  function startEditingImage(image: AlbumImage) {
    setEditingImage(image);
    setEditUrl(image.url);
    setEditCaption(image.caption ?? "");
    setEditError(null);
  }

  async function handleUpdateImage(e: React.FormEvent) {
    e.preventDefault();
    if (!editingImage) return;
    setEditError(null);
    setIsUpdating(true);
    try {
      const result = await updateAlbumImage(albumId, editingImage.id, {
        url: editUrl,
        caption: editCaption,
      });
      if (!result.success) { setEditError(result.error ?? "Failed to update image"); return; }
      setEditingImage(null);
      router.refresh();
    } catch {
      setEditError("Unable to update this image. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Image URL" className="flex-1" />
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" className="flex-1" />
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Adding…" : "Add Image"}</Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">No images in this album yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
              <div className="relative aspect-square">
                <Image src={img.url} alt={img.caption ?? ""} fill className="object-cover" unoptimized />
              </div>
              <div className="flex items-center justify-between gap-2 p-2">
                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{img.caption || "No caption"}</p>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="xs" variant="outline" onClick={() => startEditingImage(img)}>
                    <Pencil className="size-3" /> Edit
                  </Button>
                  <ConfirmButton
                    label="Remove"
                    title="Remove image"
                    description="This removes the image from the album."
                    variant="destructive"
                    size="xs"
                    onConfirm={() => removeImageFromAlbum(albumId, img.id)}
                    onDone={() => router.refresh()}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={editingImage !== null}
        onOpenChange={(open) => {
          if (!open && !isUpdating) setEditingImage(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit gallery image</DialogTitle>
            <DialogDescription>Update the image URL and its public caption.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateImage} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`gallery-image-url-${albumId}`}>Image URL</Label>
              <Input
                id={`gallery-image-url-${albumId}`}
                type="url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                required
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`gallery-image-caption-${albumId}`}>Caption</Label>
              <Input
                id={`gallery-image-caption-${albumId}`}
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                maxLength={200}
              />
            </div>
            {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingImage(null)} disabled={isUpdating}>Cancel</Button>
              <Button type="submit" disabled={isUpdating}>{isUpdating ? "Saving…" : "Save Changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
