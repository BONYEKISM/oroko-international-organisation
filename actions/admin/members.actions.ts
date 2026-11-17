"use server";

import { revalidatePath } from "next/cache";
import mongoose, { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Membership from "@/models/Membership";
import Donation from "@/models/Donation";
import Event from "@/models/Event";
import EventRegistration from "@/models/EventRegistration";
import CommitteeMember from "@/models/CommitteeMember";
import ExecutiveMember from "@/models/ExecutiveMember";
import WelfareRequest from "@/models/WelfareRequest";
import ContactMessage from "@/models/ContactMessage";
import Announcement from "@/models/Announcement";
import NewsFlash from "@/models/NewsFlash";
import AuditLog from "@/models/AuditLog";
import { requireAdminSession } from "@/lib/admin-auth";
import { PERMISSIONS } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { stripe } from "@/lib/stripe";
import {
  cancelPayPalSubscription,
  getPayPalSubscription,
} from "@/lib/payments/paypal";
import { z } from "zod";
import type { ActionResult } from "@/types";

const STATUS_VALUES = ["pending", "active", "suspended", "expired", "rejected", "resigned"] as const;

export async function changeMemberStatus(
  memberId: string,
  status: (typeof STATUS_VALUES)[number],
  reason?: string
): Promise<ActionResult> {
  try {
    const admin = await requireAdminSession(PERMISSIONS.MEMBERS_MANAGE);
    await connectDB();

    const membership = await Membership.findOne({ user: memberId });
    if (!membership) return { success: false, error: "Member not found" };

    const previousStatus = membership.status;
    membership.status = status;
    membership.statusHistory.push({
      status,
      changedBy: new Types.ObjectId(admin.id),
      changedByName: admin.name,
      reason,
      changedAt: new Date(),
    });
    await membership.save();

    // Keep the User record's mirrored status in sync — used by session/proxy checks.
    await User.findByIdAndUpdate(memberId, { $set: { membershipStatus: status } });

    await logAudit({
      actorId: admin.id,
      actorName: admin.name,
      action: "member.status_changed",
      entityType: "Membership",
      entityId: membership._id.toString(),
      description: `Changed member status from ${previousStatus} to ${status}`,
      metadata: { reason },
    });

    revalidatePath("/admin/members");
    revalidatePath(`/admin/members/${memberId}`);
    return { success: true };
  } catch (err) {
    console.error("[changeMemberStatus]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to update status" };
  }
}

export async function renewMembership(memberId: string, newExpiresAt: string): Promise<ActionResult> {
  try {
    const admin = await requireAdminSession(PERMISSIONS.MEMBERS_MANAGE);
    await connectDB();

    const membership = await Membership.findOne({ user: memberId });
    if (!membership) return { success: false, error: "Member not found" };

    membership.status = "active";
    membership.expiresAt = new Date(newExpiresAt);
    membership.statusHistory.push({
      status: "active",
      changedBy: new Types.ObjectId(admin.id),
      changedByName: admin.name,
      reason: "Membership renewed",
      changedAt: new Date(),
    });
    await membership.save();
    await User.findByIdAndUpdate(memberId, { $set: { membershipStatus: "active" } });

    await logAudit({
      actorId: admin.id,
      actorName: admin.name,
      action: "member.renewed",
      entityType: "Membership",
      entityId: membership._id.toString(),
      description: `Renewed membership until ${new Date(newExpiresAt).toLocaleDateString()}`,
    });

    revalidatePath("/admin/members");
    revalidatePath(`/admin/members/${memberId}`);
    return { success: true };
  } catch (err) {
    console.error("[renewMembership]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to renew membership" };
  }
}

export async function addInternalNote(memberId: string, text: string): Promise<ActionResult> {
  const parsed = z.string().min(1, "Note cannot be empty").max(2000).safeParse(text);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  try {
    const admin = await requireAdminSession(PERMISSIONS.MEMBERS_MANAGE);
    await connectDB();

    const membership = await Membership.findOneAndUpdate(
      { user: memberId },
      { $push: { internalNotes: { author: admin.id, authorName: admin.name, text: parsed.data, createdAt: new Date() } } }
    );
    if (!membership) return { success: false, error: "Member not found" };

    await logAudit({
      actorId: admin.id,
      actorName: admin.name,
      action: "member.note_added",
      entityType: "Membership",
      entityId: membership._id.toString(),
      description: "Added an internal note to a member profile",
    });

    revalidatePath(`/admin/members/${memberId}`);
    return { success: true };
  } catch (err) {
    console.error("[addInternalNote]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to add note" };
  }
}

const memberEditSchema = z.object({
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  email: z.string().email(),
  phone: z.string().max(20).optional().or(z.literal("")),
  country: z.string().max(100).optional().or(z.literal("")),
  countryOfOrigin: z.string().max(100).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  profession: z.string().max(100).optional().or(z.literal("")),
  organization: z.string().max(100).optional().or(z.literal("")),
  membershipType: z.string().min(1, "Membership type is required"),
  paymentStatus: z.enum(["paid", "unpaid", "waived"]),
});

export async function updateMemberProfile(memberId: string, data: unknown): Promise<ActionResult> {
  const parsed = memberEditSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };

  try {
    const admin = await requireAdminSession(PERMISSIONS.MEMBERS_MANAGE);
    await connectDB();

    const { firstName, lastName, email, phone, country, countryOfOrigin, city, profession, organization, membershipType, paymentStatus } = parsed.data;

    const existing = await User.findOne({ email, _id: { $ne: memberId } });
    if (existing) return { success: false, error: "Another account already uses this email" };

    await User.findByIdAndUpdate(memberId, { $set: { firstName, lastName, email, phone } });
    await Membership.findOneAndUpdate(
      { user: memberId },
      { $set: { country, countryOfOrigin, city, profession, organization, membershipType, paymentStatus } }
    );

    await logAudit({
      actorId: admin.id,
      actorName: admin.name,
      action: "member.updated",
      entityType: "User",
      entityId: memberId,
      description: `Updated profile details for ${firstName} ${lastName}`,
    });

    revalidatePath(`/admin/members/${memberId}`);
    revalidatePath("/admin/members");
    return { success: true };
  } catch (err) {
    console.error("[updateMemberProfile]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to update member" };
  }
}

const newMemberSchema = z.object({
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  email: z.string().email(),
  phone: z.string().max(20).optional().or(z.literal("")),
  country: z.string().max(100).optional().or(z.literal("")),
  membershipType: z.string().min(1, "Membership type is required"),
});

export async function createMember(data: unknown): Promise<ActionResult & { id?: string }> {
  const parsed = newMemberSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };

  try {
    const admin = await requireAdminSession(PERMISSIONS.MEMBERS_MANAGE);
    await connectDB();
    const bcrypt = (await import("bcryptjs")).default;

    const { firstName, lastName, email, phone, country, membershipType } = parsed.data;
    const existing = await User.findOne({ email });
    if (existing) return { success: false, error: "An account with this email already exists" };

    const tempPassword = Math.random().toString(36).slice(-10) + "Aa1!";
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const user = await User.create({
      firstName,
      lastName,
      email,
      phone,
      country,
      password: hashedPassword,
      role: "member",
      membershipStatus: "active",
      isEmailVerified: false,
      isActive: true,
    });

    const membership = await Membership.create({
      user: user._id,
      memberSince: new Date(),
      membershipType,
      status: "active",
      applicationStatus: "approved",
      country,
      reviewedBy: admin.id,
      decisionAt: new Date(),
      statusHistory: [{ status: "active", changedBy: admin.id, changedByName: admin.name, reason: "Created directly by admin", changedAt: new Date() }],
    });

    await logAudit({
      actorId: admin.id,
      actorName: admin.name,
      action: "member.created",
      entityType: "User",
      entityId: user._id.toString(),
      description: `Added new member ${firstName} ${lastName} (${membership.orokoId})`,
    });

    revalidatePath("/admin/members");
    return { success: true, id: user._id.toString() };
  } catch (err) {
    console.error("[createMember]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to create member" };
  }
}

export async function deleteMemberAccount(memberId: string): Promise<ActionResult> {
  if (!Types.ObjectId.isValid(memberId)) {
    return { success: false, error: "Invalid member account." };
  }

  let cancelledSubscriptions = 0;
  try {
    const admin = await requireAdminSession(PERMISSIONS.MEMBERS_MANAGE);
    await connectDB();

    const userId = new Types.ObjectId(memberId);
    const user = await User.findById(userId).select("firstName lastName email role");
    if (!user || user.role !== "member") {
      return { success: false, error: "Member account not found." };
    }

    const donationFilter = {
      $or: [{ userId }, { donorEmail: user.email }],
    };
    const donations = await Donation.find(donationFilter).select(
      "+stripeSubscriptionId +paypalSubscriptionId"
    );
    for (const donation of donations) {
      if (donation.frequency === "once") continue;

      if (donation.paymentProvider === "stripe" && donation.stripeSubscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(
          donation.stripeSubscriptionId
        );
        if (!["canceled", "incomplete_expired"].includes(subscription.status)) {
          await stripe.subscriptions.cancel(donation.stripeSubscriptionId);
          cancelledSubscriptions += 1;
        }
      } else if (donation.paymentProvider === "paypal" && donation.paypalSubscriptionId) {
        const subscription = await getPayPalSubscription(
          donation.paypalSubscriptionId
        );
        if (!["CANCELLED", "EXPIRED"].includes(subscription.status)) {
          await cancelPayPalSubscription(donation.paypalSubscriptionId);
          cancelledSubscriptions += 1;
        }
      } else if (donation.status === "active") {
        return {
          success: false,
          error: `${cancelledSubscriptions > 0 ? "Some recurring donations were cancelled. " : ""}An active recurring donation has no matching provider subscription ID. Cancel it with the payment provider before deleting this account.`,
        };
      }
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const currentUser = await User.findById(userId).session(session);
        if (!currentUser || currentUser.role !== "member") {
          throw new Error("Member account not found or is no longer deletable.");
        }

        const email = currentUser.email;
        const fullName = `${currentUser.firstName} ${currentUser.lastName}`;
        const emailPattern = new RegExp(escapeRegExp(email), "i");
        const committeeAdditionPattern = new RegExp(
          `^Added ${escapeRegExp(fullName)} to committee as `,
          "i"
        );
        const linkedRegistrationFilter = {
          $or: [{ user: userId }, { attendeeEmail: email }],
        };
        const linkedWelfareFilter = { member: userId };
        const linkedContactFilter = { email };

        const linkedMemberships = await Membership.find({ user: userId })
          .select("_id")
          .session(session)
          .lean();
        const linkedDonations = await Donation.find(donationFilter)
          .select("_id")
          .session(session)
          .lean();
        const linkedRegistrations = await EventRegistration.find(
          linkedRegistrationFilter
        )
          .select("_id event ticketTypeId quantity status")
          .session(session)
          .lean();
        const linkedWelfareRequests = await WelfareRequest.find(linkedWelfareFilter)
          .select("_id")
          .session(session)
          .lean();
        const linkedCommitteeRoles = await CommitteeMember.find({ user: userId })
          .select("_id")
          .session(session)
          .lean();
        const linkedExecutiveRoles = await ExecutiveMember.find({ user: userId })
          .select("_id")
          .session(session)
          .lean();
        const linkedAnnouncements = await Announcement.find({ author: userId })
          .select("_id")
          .session(session)
          .lean();
        const linkedNewsFlashes = await NewsFlash.find({ author: userId })
          .select("_id")
          .session(session)
          .lean();
        const linkedIds = [
          userId.toString(),
          ...linkedMemberships,
          ...linkedDonations,
          ...linkedRegistrations,
          ...linkedWelfareRequests,
          ...linkedCommitteeRoles,
          ...linkedExecutiveRoles,
          ...linkedAnnouncements,
          ...linkedNewsFlashes,
        ].map((record) =>
          typeof record === "string" ? record : record._id.toString()
        );

        await AuditLog.deleteMany(
          {
            $or: [
              { actor: userId },
              { entityId: { $in: linkedIds } },
              {
                action: "committee.member_added",
                description: { $regex: committeeAdditionPattern },
              },
              { description: { $regex: emailPattern } },
              { "metadata.userId": { $in: [userId, memberId] } },
              { "metadata.memberId": { $in: [userId, memberId] } },
              { "metadata.email": email },
            ],
          },
          { session }
        );
        await Membership.deleteMany({ user: userId }, { session });
        await Membership.updateMany(
          { user: { $ne: userId }, reviewedBy: userId },
          { $unset: { reviewedBy: 1 } },
          { session }
        );
        await Membership.updateMany(
          {
            user: { $ne: userId },
            $or: [
              { "statusHistory.changedBy": userId },
              { "internalNotes.author": userId },
            ],
          },
          {
            $pull: {
              statusHistory: { changedBy: userId },
              internalNotes: { author: userId },
            },
          },
          { session }
        );
        await Donation.deleteMany(donationFilter, { session });
        for (const registration of linkedRegistrations) {
          if (registration.status === "cancelled") continue;
          await Event.updateOne(
            { _id: registration.event },
            {
              $inc: {
                attendeeCount: -registration.quantity,
                "ticketTypes.$[ticket].sold": -registration.quantity,
              },
            },
            {
              arrayFilters: [
                { "ticket._id": new Types.ObjectId(registration.ticketTypeId) },
              ],
              session,
            }
          );
        }
        await EventRegistration.deleteMany(linkedRegistrationFilter, { session });
        await CommitteeMember.deleteMany({ user: userId }, { session });
        await ExecutiveMember.deleteMany({ user: userId }, { session });
        await WelfareRequest.deleteMany(linkedWelfareFilter, { session });
        await WelfareRequest.updateMany(
          { member: { $ne: userId }, reviewer: userId },
          { $unset: { reviewer: 1 } },
          { session }
        );
        await WelfareRequest.updateMany(
          { member: { $ne: userId }, "internalNotes.author": userId },
          { $pull: { internalNotes: { author: userId } } },
          { session }
        );
        await ContactMessage.deleteMany(linkedContactFilter, { session });
        await ContactMessage.updateMany(
          { "internalNotes.author": userId },
          { $pull: { internalNotes: { author: userId } } },
          { session }
        );
        await Announcement.deleteMany({ author: userId }, { session });
        await NewsFlash.deleteMany({ author: userId }, { session });

        const deletion = await User.deleteOne(
          { _id: userId, role: "member" },
          { session }
        );
        if (deletion.deletedCount !== 1) {
          throw new Error("Member account could not be deleted.");
        }
      });
    } finally {
      await session.endSession();
    }

    await logAudit({
      actorId: admin.id,
      actorName: admin.name,
      action: "member.deleted",
      entityType: "User",
      description: "Permanently deleted a member account and linked app data.",
      metadata: { cancelledSubscriptions },
    });

    revalidatePath("/admin/members");
    revalidatePath("/admin/applications");
    revalidatePath("/admin/member-ids");
    revalidatePath("/admin/reports");
    revalidatePath("/admin");
    revalidatePath("/members");
    return { success: true };
  } catch (error) {
    console.error("[deleteMemberAccount]", error);
    const detail =
      error instanceof Error ? error.message : "The member account could not be deleted.";
    return {
      success: false,
      error: cancelledSubscriptions > 0
        ? `${cancelledSubscriptions} recurring donation(s) were cancelled, but the account data was not deleted. Retry deletion. ${detail}`
        : detail,
    };
  }
}

export async function reissueMemberId(memberId: string): Promise<ActionResult & { orokoId?: string }> {
  try {
    const admin = await requireAdminSession(PERMISSIONS.MEMBERS_MANAGE);
    await connectDB();

    const membership = await Membership.findOne({ user: memberId });
    if (!membership) return { success: false, error: "Member not found" };

    const previousId = membership.orokoId;
    const year = new Date().getFullYear();
    const suffix = Math.random().toString(36).slice(-5).toUpperCase();
    membership.orokoId = `OROKO-${year}-${suffix}`;
    await membership.save();

    await logAudit({
      actorId: admin.id,
      actorName: admin.name,
      action: "member.id_reissued",
      entityType: "Membership",
      entityId: membership._id.toString(),
      description: `Reissued Member ID from ${previousId} to ${membership.orokoId}`,
    });

    revalidatePath("/admin/member-ids");
    revalidatePath(`/admin/members/${memberId}`);
    return { success: true, orokoId: membership.orokoId };
  } catch (err) {
    console.error("[reissueMemberId]", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to reissue Member ID" };
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

