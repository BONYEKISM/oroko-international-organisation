"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import GalleryAlbum from "@/models/GalleryAlbum";
import { requireAdminSession } from "@/lib/admin-auth";
import { PERMISSIONS } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/types";

const albumSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(150),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

const albumImageSchema = z.object({
  url: z.string().trim().url("Enter a valid image URL").max(500),
  caption: z.string().trim().max(200).optional().or(z.literal("")),
});

export async function createAlbum(
  data: unknown
): Promise<{ success: true; id: string } | { success: false; error?: string }> {
  const parsed = albumSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };

  try {
    const admin = await requireAdminSession(PERMISSIONS.GALLERY_MANAGE);
    await connectDB();

    const album = await GalleryAlbum.create(parsed.data);

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "gallery.album_created", entityType: "GalleryAlbum", entityId: album._id.toString(),
      description: `Created gallery album "${album.title}"`,
    });

    revalidatePath("/admin/gallery");
    return { success: true, id: album._id.toString() };
  } catch (err) {
    console.error("[createAlbum]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to create album" };
  }
}

export async function updateAlbum(id: string, data: unknown): Promise<ActionResult> {
  const parsed = albumSchema.safeParse(data);
  if (!Types.ObjectId.isValid(id)) return { success: false, error: "Invalid album" };
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };

  try {
    const admin = await requireAdminSession(PERMISSIONS.GALLERY_MANAGE);
    await connectDB();

    const album = await GalleryAlbum.findById(id);
    if (!album) return { success: false, error: "Album not found" };

    album.title = parsed.data.title;
    album.description = parsed.data.description || undefined;
    await album.save();

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "gallery.album_updated", entityType: "GalleryAlbum", entityId: id,
      description: `Updated gallery album "${album.title}"`,
    });

    revalidatePath("/admin/gallery");
    revalidatePath(`/admin/gallery/${id}`);
    revalidatePath("/gallery");
    return { success: true };
  } catch (err) {
    console.error("[updateAlbum]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to update album" };
  }
}

export async function togglePublishAlbum(id: string, isPublished: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdminSession(PERMISSIONS.GALLERY_MANAGE);
    await connectDB();

    const album = await GalleryAlbum.findByIdAndUpdate(id, { $set: { isPublished } });
    if (!album) return { success: false, error: "Album not found" };

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "gallery.album_toggled", entityType: "GalleryAlbum", entityId: id,
      description: `${isPublished ? "Published" : "Unpublished"} gallery album "${album.title}"`,
    });

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    return { success: true };
  } catch (err) {
    console.error("[togglePublishAlbum]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to update album" };
  }
}

export async function addImageToAlbum(albumId: string, url: string, caption?: string): Promise<ActionResult> {
  const parsed = z.string().min(1, "Image URL is required").safeParse(url);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  try {
    const admin = await requireAdminSession(PERMISSIONS.GALLERY_MANAGE);
    await connectDB();

    const album = await GalleryAlbum.findById(albumId);
    if (!album) return { success: false, error: "Album not found" };

    album.images.push({ url: parsed.data, caption, order: album.images.length });
    if (!album.coverImage) album.coverImage = parsed.data;
    await album.save();

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "gallery.image_added", entityType: "GalleryAlbum", entityId: albumId,
      description: `Added image to album "${album.title}"`,
    });

    revalidatePath(`/admin/gallery/${albumId}`);
    revalidatePath("/gallery");
    return { success: true };
  } catch (err) {
    console.error("[addImageToAlbum]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to add image" };
  }
}

export async function updateAlbumImage(
  albumId: string,
  imageId: string,
  data: unknown
): Promise<ActionResult> {
  const parsed = albumImageSchema.safeParse(data);
  if (!Types.ObjectId.isValid(albumId) || !Types.ObjectId.isValid(imageId)) {
    return { success: false, error: "Invalid album image" };
  }
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };

  try {
    const admin = await requireAdminSession(PERMISSIONS.GALLERY_MANAGE);
    await connectDB();

    const album = await GalleryAlbum.findById(albumId);
    if (!album) return { success: false, error: "Album not found" };

    const image = album.images.find((candidate) => candidate._id?.toString() === imageId);
    if (!image) return { success: false, error: "Image not found" };

    const previousUrl = image.url;
    image.url = parsed.data.url;
    image.caption = parsed.data.caption || undefined;
    if (album.coverImage === previousUrl) album.coverImage = image.url;
    await album.save();

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "gallery.image_updated", entityType: "GalleryAlbum", entityId: albumId,
      description: `Updated an image in gallery album "${album.title}"`,
    });

    revalidatePath(`/admin/gallery/${albumId}`);
    revalidatePath("/gallery");
    return { success: true };
  } catch (err) {
    console.error("[updateAlbumImage]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to update image" };
  }
}

export async function removeImageFromAlbum(albumId: string, imageId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdminSession(PERMISSIONS.GALLERY_MANAGE);
    await connectDB();

    const album = await GalleryAlbum.findByIdAndUpdate(albumId, { $pull: { images: { _id: imageId } } });
    if (!album) return { success: false, error: "Album not found" };

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "gallery.image_removed", entityType: "GalleryAlbum", entityId: albumId,
      description: `Removed image from album "${album.title}"`,
    });

    revalidatePath(`/admin/gallery/${albumId}`);
    revalidatePath("/gallery");
    return { success: true };
  } catch (err) {
    console.error("[removeImageFromAlbum]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to remove image" };
  }
}
