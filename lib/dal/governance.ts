import "server-only";
import { cache } from "react";
import { connectDB } from "@/lib/db";
import GovernanceRole from "@/models/GovernanceRole";
import ExecutiveMember from "@/models/ExecutiveMember";
import Committee from "@/models/Committee";
import CommitteeMember from "@/models/CommitteeMember";
import GovernanceMeeting, { type IGovernanceMeeting, type GovernanceOrgan } from "@/models/GovernanceMeeting";
import GovernanceDocument, { type IGovernanceDocument } from "@/models/GovernanceDocument";
import OrgSettings from "@/models/OrgSettings";
import { Types } from "mongoose";
import type { IGovernanceRole } from "@/models/GovernanceRole";
import type { IExecutiveMember } from "@/models/ExecutiveMember";
import User, { type IUser } from "@/models/User";

// ─── Serialized types (plain objects for Server→Client passing) ─────────────

export type OfficerProfile = {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  email?: string;
  phone?: string;
  website?: string;
  linkedIn?: string;
  roleName: string;
  roleDescription?: string;
  responsibilities: string[];
  term?: string;
  startDate?: string;
  endDate?: string;
  bio?: string;
  order: number;
};

export type ExecutivePosition = {
  id: string;
  roleName: string;
  description?: string;
  responsibilities: string[];
  order: number;
  isPresident: boolean;
  officer?: OfficerProfile;
  hasUnpublishedOfficer: boolean;
};

export type ExecutiveCouncil = {
  positions: ExecutivePosition[];
  presidentMessage?: string;
};

export type CommitteeSummary = {
  id: string;
  name: string;
  slug: string;
  mandate: string;
  description?: string;
  order: number;
  memberCount: number;
};

export type CommitteeMemberProfile = {
  userId: string;
  userName: string;
  userPhoto?: string;
  role: string;
};

export type CommitteeDetail = CommitteeSummary & {
  members: CommitteeMemberProfile[];
};

export type MeetingSummary = {
  id: string;
  organ: string;
  committeeName?: string;
  title: string;
  sessionNumber?: string;
  date: string;
  endDate?: string;
  venue?: string;
  format: string;
  status: string;
  agendaItems: string[];
  minutes?: string;
  attendeeCount?: number;
  isPublic: boolean;
};

export type DocumentSummary = {
  id: string;
  organ: string;
  committeeName?: string;
  type: string;
  reference?: string;
  title: string;
  summary?: string;
  adoptedAt?: string;
  attachmentUrl?: string;
  isPublic: boolean;
};

function publicHttpsUrl(value?: string) {
  return value?.startsWith("https://") ? value : undefined;
}

function publicCloudinaryImageUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "res.cloudinary.com"
      && !url.username
      && !url.password
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

// ─── Queries ────────────────────────────────────────────────────────────────

const DEFAULT_EXECUTIVE_POSITIONS = [
  { key: "interim-president", name: "PRESIDENT" },
  { key: "interim-vice-president", name: "VICE PRESIDENT" },
  { key: "interim-secretary-general", name: "SECRETARY GENERAL" },
  { key: "interim-vice-secretary-general", name: "VICE SECRETARY GENERAL" },
  { key: "interim-treasurer", name: "TREASURER" },
  { key: "interim-financial-secretary", name: "FINANCIAL SECRETARY" },
  { key: "interim-publicity-communications-secretary", name: "PUBLICITY & COMMUNICATIONS SECRETARY" },
  { key: "interim-cultural-secretary", name: "CULTURAL SECRETARY" },
  { key: "interim-chief-whip", name: "CHIEF WHIP" },
] as const;

export async function ensureDefaultExecutivePositions() {
  const existing = await GovernanceRole.find({ organ: "executive" })
    .select("name systemKey isPresident")
    .lean();
  for (const [order, position] of DEFAULT_EXECUTIVE_POSITIONS.entries()) {
    const existingRole = existing.find((role) => role.systemKey === position.key)
      ?? existing.find((role) => role.name.trim().toLocaleUpperCase() === position.name);
    if (existingRole) {
      if (!existingRole.systemKey) {
        await GovernanceRole.updateOne(
          { _id: existingRole._id, systemKey: { $exists: false } },
          { $set: { systemKey: position.key } }
        );
      }
      if (position.key === "interim-president" && existingRole.isPresident === undefined) {
        await GovernanceRole.updateOne(
          { _id: existingRole._id, isPresident: { $exists: false } },
          { $set: { isPresident: true } }
        );
      }
      continue;
    }

    await GovernanceRole.create({
      name: position.name,
      systemKey: position.key,
      organ: "executive",
      order,
      isActive: true,
      isPresident: position.key === "interim-president",
    });
  }
}

export const getExecutiveCouncil = cache(async (): Promise<ExecutiveCouncil> => {
  await connectDB();
  await ensureDefaultExecutivePositions();

  const [roles, members, settings] = await Promise.all([
    GovernanceRole.find({ organ: "executive", isActive: true })
      .sort({ order: 1, name: 1 })
      .lean<IGovernanceRole[]>(),
    ExecutiveMember.find({ isActive: true })
      .sort({ createdAt: -1 })
      .populate<{ user: IUser & { _id: Types.ObjectId } }>(
        "user",
        "firstName lastName email phone profilePhoto website linkedIn privacySettings",
        User
      )
      .populate<{ role: IGovernanceRole & { _id: Types.ObjectId } }>(
        "role",
        "name description responsibilities order isPresident"
      )
      .lean<(IExecutiveMember & { user: IUser & { _id: Types.ObjectId }; role: IGovernanceRole & { _id: Types.ObjectId } })[]>(),
    OrgSettings.findOne({}).select("executiveCouncilPresidentMessage").lean(),
  ]);

  const currentMembers = new Map<string, (typeof members)[number]>();
  for (const member of members) {
    if (member.user && member.role) {
      const roleId = member.role._id.toString();
      if (!currentMembers.has(roleId)) currentMembers.set(roleId, member);
    }
  }

  const positions = roles.map((role) => {
    const roleId = (role._id as Types.ObjectId).toString();
    const member = currentMembers.get(roleId);
    const published = member && member.isPublished !== false;
    let officer: OfficerProfile | undefined;

    if (member && published) {
      const user = member.user;
      const privacySettings = user.privacySettings;
      const memberPhotoUrl = publicCloudinaryImageUrl(member.photoUrl);
      const userPhotoUrl = publicCloudinaryImageUrl(user.profilePhoto);
      if ((role.isPresident || role.name.trim().toUpperCase() === "PRESIDENT") && !memberPhotoUrl) {
        console.info("[governance/executive] President portrait data", {
          hasAssignedPortrait: Boolean(member.photoUrl),
          assignedPortraitIsCloudinary: Boolean(memberPhotoUrl),
          hasUserPortrait: Boolean(user.profilePhoto),
          userPortraitIsCloudinary: Boolean(userPhotoUrl),
        });
      }
      officer = {
        id: (member._id as Types.ObjectId).toString(),
        userId: user._id.toString(),
        userName: `${user.firstName} ${user.lastName}`,
        userPhoto: memberPhotoUrl || userPhotoUrl,
        email: privacySettings?.showEmail ? user.email : undefined,
        phone: privacySettings?.showPhone ? user.phone : undefined,
        website: privacySettings?.isDirectoryVisible ? publicHttpsUrl(user.website) : undefined,
        linkedIn: privacySettings?.isDirectoryVisible ? publicHttpsUrl(user.linkedIn) : undefined,
        roleName: role.name,
        roleDescription: role.description,
        responsibilities: role.responsibilities ?? [],
        term: member.term,
        startDate: member.startDate?.toISOString(),
        endDate: member.endDate?.toISOString(),
        bio: member.bio,
        order: role.order,
      };
    }

    return {
      id: roleId,
      roleName: role.name,
      description: role.description,
      responsibilities: role.responsibilities ?? [],
      order: role.order,
      isPresident: role.isPresident ?? false,
      officer,
      hasUnpublishedOfficer: Boolean(member && !published),
    };
  });

  return {
    positions,
    presidentMessage: settings?.executiveCouncilPresidentMessage,
  };
});

export const getExecutiveOfficers = cache(async (): Promise<OfficerProfile[]> => {
  const { positions } = await getExecutiveCouncil();
  return positions.flatMap((position) => position.officer ? [position.officer] : []);
});

export const getCommittees = cache(async (): Promise<CommitteeSummary[]> => {
  await connectDB();

  const committees = await Committee.find({ isActive: true })
    .sort({ order: 1 })
    .lean();

  const counts = await CommitteeMember.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: "$committee", count: { $sum: 1 } } },
  ]);

  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count as number]));

  return committees.map((c) => ({
    id: (c._id as Types.ObjectId).toString(),
    name: c.name,
    slug: c.slug,
    mandate: c.mandate,
    description: c.description,
    order: c.order,
    memberCount: countMap.get((c._id as Types.ObjectId).toString()) ?? 0,
  }));
});

export const getCommitteeBySlug = cache(async (slug: string): Promise<CommitteeDetail | null> => {
  await connectDB();

  const committee = await Committee.findOne({ slug, isActive: true }).lean();
  if (!committee) return null;

  const rawMembers = await CommitteeMember.find({
    committee: committee._id,
    isActive: true,
  })
    .populate("user", "firstName lastName profilePhoto", User)
    .sort({ role: 1 })
    .lean();

  const members: CommitteeMemberProfile[] = rawMembers
    .filter((m) => m.user)
    .map((m) => {
      const user = m.user as unknown as { _id: Types.ObjectId; firstName: string; lastName: string; profilePhoto?: string };
      return {
        userId: (m.user as { _id: Types.ObjectId })._id.toString(),
        userName: `${user.firstName} ${user.lastName}`,
        userPhoto: user.profilePhoto,
        role: m.role,
      };
    });

  const total = rawMembers.length;

  return {
    id: (committee._id as Types.ObjectId).toString(),
    name: committee.name,
    slug: committee.slug,
    mandate: committee.mandate,
    description: committee.description,
    order: committee.order,
    memberCount: total,
    members,
  };
});

export async function getMeetings(opts: {
  organ?: GovernanceOrgan;
  committeeId?: string;
  publicOnly?: boolean;
  limit?: number;
}): Promise<MeetingSummary[]> {
  const { organ, committeeId, publicOnly = false, limit = 20 } = opts;
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (organ) filter.organ = organ;
  if (committeeId) filter.committee = new Types.ObjectId(committeeId);
  if (publicOnly) filter.isPublic = true;

  const meetings = await GovernanceMeeting.find(filter)
    .sort({ date: -1 })
    .limit(limit)
    .populate("committee", "name")
    .lean<(IGovernanceMeeting & { committee?: { name: string } | null })[]>();

  return meetings.map((m) => ({
    id: (m._id as Types.ObjectId).toString(),
    organ: m.organ,
    committeeName: m.committee?.name,
    title: m.title,
    sessionNumber: m.sessionNumber,
    date: m.date.toISOString(),
    endDate: m.endDate?.toISOString(),
    venue: m.venue,
    format: m.format,
    status: m.status,
    agendaItems: m.agendaItems ?? [],
    minutes: m.minutes,
    attendeeCount: m.attendeeCount,
    isPublic: m.isPublic,
  }));
}

export async function getDocuments(opts: {
  organ?: GovernanceOrgan;
  committeeId?: string;
  type?: string;
  publicOnly?: boolean;
  limit?: number;
}): Promise<DocumentSummary[]> {
  const { organ, committeeId, type, publicOnly = false, limit = 20 } = opts;
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (organ) filter.organ = organ;
  if (committeeId) filter.committee = new Types.ObjectId(committeeId);
  if (type) filter.type = type;
  if (publicOnly) filter.isPublic = true;

  const docs = await GovernanceDocument.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("committee", "name")
    .lean<(IGovernanceDocument & { committee?: { name: string } | null })[]>();

  return docs.map((d) => ({
    id: (d._id as Types.ObjectId).toString(),
    organ: d.organ,
    committeeName: d.committee?.name,
    type: d.type,
    reference: d.reference,
    title: d.title,
    summary: d.summary,
    adoptedAt: d.adoptedAt?.toISOString(),
    attachmentUrl: d.attachmentUrl,
    isPublic: d.isPublic,
  }));
}
