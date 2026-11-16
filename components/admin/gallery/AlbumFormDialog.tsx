"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { createAlbum, updateAlbum } from "@/actions/admin/gallery.actions";
import { Pencil, Plus } from "lucide-react";

type AlbumFormInitial = {
  id: string;
  title: string;
  description?: string;
};

export function AlbumFormDialog({ album }: { album?: AlbumFormInitial } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(album?.title ?? "");
  const [description, setDescription] = useState(album?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(album);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setTitle(album?.title ?? "");
      setDescription(album?.description ?? "");
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (album) {
        const result = await updateAlbum(album.id, { title, description });
        if (!result.success) { setError(result.error ?? "Failed"); return; }
        setOpen(false);
        router.refresh();
      } else {
        const result = await createAlbum({ title, description });
        if (!result.success) { setError(result.error ?? "Failed"); return; }
        setOpen(false);
        router.push(`/admin/gallery/${result.id}`);
      }
    } catch {
      setError(`Unable to ${isEditing ? "update" : "create"} the album. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm">{isEditing ? <Pencil className="size-4" /> : <Plus className="size-4" />}{isEditing ? "Edit Album" : "New Album"}</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Album" : "New Album"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update this album’s title and description." : "Create an album, then add images to it."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`al-title-${album?.id ?? "new"}`}>Title</Label>
            <Input id={`al-title-${album?.id ?? "new"}`} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={150} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`al-description-${album?.id ?? "new"}`}>Description</Label>
            <Textarea id={`al-description-${album?.id ?? "new"}`} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : isEditing ? "Save Changes" : "Create Album"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
