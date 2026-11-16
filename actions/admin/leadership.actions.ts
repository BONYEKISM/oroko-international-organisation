"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin-auth";
import { logAudit } from "@/lib/audit";
import { connectDB } from "@/lib/db";
import ExecutiveMember from "@/models/ExecutiveMember";
import GovernanceRole, { type IGovernanceRole } from "@/models/GovernanceRole";
import OrgSettings from "@/models/OrgSettings";
import User from "@/models/User";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types";

const roleSchema = z.object({
  name: z.string().trim().min(2, "Position title is required").max(100),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  responsibilities: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isPresident: z.boolean().default(false),
});

function isValidId(id: string) {
  return Types.ObjectId.isValid(id);
}

function revalidateLeadership() {
  revalidatePath("/admin/leadership");
  revalidatePath("/governance/executive");
  revalidatePath("/portal/governance/executive");
}

export async function createLeadershipRole(data: unknown): Promise<ActionResult> {
  const parsed = roleSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  if (parsed.data.isPresident && parsed.data.isActive === false) {
    return { success: false, error: "The President role must remain active so the presidential feature stays visible." };
  }

  try {
    const admin = await requireAdminSession(PERMISSIONS.LEADERSHIP_MANAGE);
    await connectDB();

    const duplicate = await GovernanceRole.findOne({
      organ: "executive",
      name: { $regex: `^${parsed.data.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (duplicate) return { success: false, error: "That position already exists" };

    const count = await GovernanceRole.countDocuments({ organ: "executive" });

    const role = await GovernanceRole.create({
      ...parsed.data,
      responsibilities: parsed.data.responsibilities?.filter(Boolean) ?? [],
      description: parsed.data.description || undefined,
      organ: "executive",
      order: parsed.data.order ?? count,
      isActive: parsed.data.isActive ?? true,
    });

    if (role.isPresident) {
      await GovernanceRole.updateMany(
        { organ: "executive", isPresident: true, _id: { $ne: role._id } },
        { $set: { isPresident: false, isActive: false } }
      );
    }

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "leadership.role_created", entityType: "GovernanceRole", entityId: role._id.toString(),
      description: `Created leadership position "${role.name}"`,
    });

    revalidateLeadership();
    return { success: true };
  } catch (err) {
    console.error("[createLeadershipRole]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to create position" };
  }
}

export async function updateLeadershipRole(id: string, data: unknown): Promise<ActionResult> {
  const parsed = roleSchema.safeParse(data);
  if (!isValidId(id)) return { success: false, error: "Invalid position" };
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  if (parsed.data.isPresident && parsed.data.isActive === false) {
    return { success: false, error: "The President role must remain active so the presidential feature stays visible." };
  }

  try {
    const admin = await requireAdminSession(PERMISSIONS.LEADERSHIP_MANAGE);
    await connectDB();

    const role = await GovernanceRole.findOne({ _id: id, organ: "executive" });
    if (!role) return { success: false, error: "Position not found" };
    if (role.isPresident && !parsed.data.isPresident) {
      return { success: false, error: "The Council must always have a designated President role." };
    }
    if (role.isPresident && parsed.data.isActive === false) {
      return { success: false, error: "The President role must remain active so the presidential feature stays visible." };
    }

    const duplicate = await GovernanceRole.findOne({
      _id: { $ne: id },
      organ: "executive",
      name: { $regex: `^${parsed.data.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (duplicate) return { success: false, error: "That position already exists" };

    role.name = parsed.data.name;
    role.description = parsed.data.description || undefined;
    role.responsibilities = parsed.data.responsibilities?.filter(Boolean) ?? [];
    role.order = parsed.data.order ?? role.order;
    role.isActive = parsed.data.isActive ?? role.isActive;
    role.isPresident = parsed.data.isPresident;
    await role.save();

    if (role.isPresident) {
      await GovernanceRole.updateMany(
        { organ: "executive", isPresident: true, _id: { $ne: role._id } },
        { $set: { isPresident: false, isActive: false } }
      );
    }

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "leadership.role_updated", entityType: "GovernanceRole", entityId: id,
      description: `Updated leadership position "${role.name}"`,
    });

    revalidateLeadership();
    return { success: true };
  } catch (err) {
    console.error("[updateLeadershipRole]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to update position" };
  }
}

export async function deleteLeadershipRole(id: string): Promise<ActionResult> {
  if (!isValidId(id)) return { success: false, error: "Invalid position" };

  try {
    const admin = await requireAdminSession(PERMISSIONS.LEADERSHIP_MANAGE);
    await connectDB();

    const role = await GovernanceRole.findOne({ _id: id, organ: "executive" });
    if (!role) return { success: false, error: "Position not found" };
    if (role.isPresident) {
      return { success: false, error: "Transfer the President designation before removing this position." };
    }
    if (role.systemKey) {
      return { success: false, error: "Core Interim Government positions cannot be removed. Deactivate the position instead." };
    }
    if (await ExecutiveMember.exists({ role: id })) {
      return {
        success: false,
        error: "This position has assignment history. Deactivate it to preserve the record.",
      };
    }

    await role.deleteOne();
    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "leadership.role_deleted", entityType: "GovernanceRole", entityId: id,
      description: `Removed leadership position "${role.name}"`,
    });

    revalidateLeadership();
    return { success: true };
  } catch (err) {
    console.error("[deleteLeadershipRole]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to remove position" };
  }
}

const optionalDate = z.string().refine(
  (value) => !value || !Number.isNaN(Date.parse(value)),
  "Enter a valid date"
).optional().or(z.literal(""));

function isSecureCloudinaryUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "res.cloudinary.com"
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

const secureUrl = z.string().url().refine(
  (value) => !value || isSecureCloudinaryUrl(value),
  "Use a secure Cloudinary image URL"
).optional().or(z.literal(""));

const assignSchema = z.object({
  email: z.string().email(),
  roleId: z.string().min(1, "Select a position"),
  term: z.string().trim().max(100).optional().or(z.literal("")),
  startDate: optionalDate,
  endDate: optionalDate,
  bio: z.string().trim().max(2000).optional().or(z.literal("")),
  photoUrl: secureUrl,
}).refine(
  (value) => !value.startDate || !value.endDate || Date.parse(value.endDate) >= Date.parse(value.startDate),
  { message: "End date must be on or after the start date", path: ["endDate"] }
);

export async function assignLeadershipPosition(data: unknown): Promise<ActionResult> {
  const parsed = assignSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  if (!isValidId(parsed.data.roleId)) return { success: false, error: "Invalid position" };

  try {
    const admin = await requireAdminSession(PERMISSIONS.LEADERSHIP_MANAGE);
    await connectDB();

    const [user, role] = await Promise.all([
      User.findOne({ email: parsed.data.email.toLowerCase().trim() }),
      GovernanceRole.findOne({ _id: parsed.data.roleId, organ: "executive", isActive: true }),
    ]);
    if (!user) return { success: false, error: "No member found with this email" };
    if (!role) return { success: false, error: "Select an active Executive Council position" };

    const exec = await ExecutiveMember.create({
      user: user._id,
      role: role._id,
      term: parsed.data.term || undefined,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
      bio: parsed.data.bio || undefined,
      photoUrl: parsed.data.photoUrl || undefined,
      isActive: true,
      isPublished: true,
    });

    await ExecutiveMember.updateMany(
      { role: role._id, isActive: true, _id: { $ne: exec._id } },
      { $set: { isActive: false, endDate: new Date() } }
    );

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "leadership.assigned", entityType: "ExecutiveMember", entityId: exec._id.toString(),
      description: `Assigned ${user.firstName} ${user.lastName} to ${role.name}`,
    });

    revalidateLeadership();
    return { success: true };
  } catch (err) {
    console.error("[assignLeadershipPosition]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to assign position" };
  }
}

const profileSchema = z.object({
  term: z.string().trim().max(100).optional().or(z.literal("")),
  bio: z.string().trim().max(2000).optional().or(z.literal("")),
  photoUrl: secureUrl,
  isPublished: z.boolean(),
});

export async function updateLeadershipProfile(id: string, data: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(data);
  if (!isValidId(id)) return { success: false, error: "Invalid officer profile" };
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };

  try {
    const admin = await requireAdminSession(PERMISSIONS.LEADERSHIP_MANAGE);
    await connectDB();

    const member = await ExecutiveMember.findById(id).populate<{
      role: Pick<IGovernanceRole, "organ" | "name"> & { _id: Types.ObjectId };
    }>("role", "organ name");
    if (!member || !member.role || member.role.organ !== "executive") {
      return { success: false, error: "Executive officer profile not found" };
    }

    member.term = parsed.data.term || undefined;
    member.bio = parsed.data.bio || undefined;
    member.photoUrl = parsed.data.photoUrl || undefined;
    member.isPublished = parsed.data.isPublished;
    await member.save();
    console.info("[updateLeadershipProfile] Saved officer profile", {
      profileId: id,
      hasPortrait: Boolean(member.photoUrl),
    });

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "leadership.profile_updated", entityType: "ExecutiveMember", entityId: id,
      description: `${parsed.data.isPublished ? "Published" : "Unpublished"} the ${member.role.name} profile`,
    });

    revalidateLeadership();
    return { success: true };
  } catch (err) {
    console.error("[updateLeadershipProfile]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to update officer profile" };
  }
}

const presidentMessageSchema = z.string().trim().max(1000);

export async function updateExecutivePresidentMessage(message: string): Promise<ActionResult> {
  const parsed = presidentMessageSchema.safeParse(message);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid message" };

  try {
    const admin = await requireAdminSession(PERMISSIONS.LEADERSHIP_MANAGE);
    await connectDB();

    const update = parsed.data
      ? { $set: { executiveCouncilPresidentMessage: parsed.data } }
      : { $unset: { executiveCouncilPresidentMessage: 1 } };
    await OrgSettings.findOneAndUpdate(
      {},
      { ...update, $setOnInsert: { organizationName: "OROKO International" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "leadership.president_message_updated", entityType: "OrgSettings", entityId: "organization",
      description: "Updated the Executive Council presidential message",
    });

    revalidateLeadership();
    return { success: true };
  } catch (err) {
    console.error("[updateExecutivePresidentMessage]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to update presidential message" };
  }
}

export async function toggleLeadershipPosition(id: string, isActive: boolean): Promise<ActionResult> {
  if (!isValidId(id)) return { success: false, error: "Invalid assignment" };

  try {
    const admin = await requireAdminSession(PERMISSIONS.LEADERSHIP_MANAGE);
    await connectDB();

    const exec = await ExecutiveMember.findById(id).populate<{
      role: Pick<IGovernanceRole, "organ" | "name"> & { _id: Types.ObjectId };
    }>("role", "organ name");
    if (!exec || !exec.role || exec.role.organ !== "executive") {
      return { success: false, error: "Executive assignment not found" };
    }
    if (isActive) {
      await ExecutiveMember.updateMany(
        { role: exec.role._id, isActive: true, _id: { $ne: exec._id } },
        { $set: { isActive: false, endDate: new Date() } }
      );
    }
    exec.isActive = isActive;
    if (!isActive) exec.endDate = new Date();
    else exec.endDate = undefined;
    await exec.save();

    await logAudit({
      actorId: admin.id, actorName: admin.name,
      action: "leadership.toggled", entityType: "ExecutiveMember", entityId: id,
      description: `${isActive ? "Reactivated" : "Deactivated"} ${exec.role.name} assignment`,
    });

    revalidateLeadership();
    return { success: true };
  } catch (err) {
    console.error("[toggleLeadershipPosition]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to update position" };
  }
}
