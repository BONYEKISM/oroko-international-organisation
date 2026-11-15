import "server-only";
import { connectDB } from "@/lib/db";
import ExecutiveMember from "@/models/ExecutiveMember";
import GovernanceRole, { type IGovernanceRole } from "@/models/GovernanceRole";
import OrgSettings from "@/models/OrgSettings";
import type { IUser } from "@/models/User";
import { Types } from "mongoose";
import { ensureDefaultExecutivePositions } from "@/lib/dal/governance";

export async function getLeadershipRoles() {
  await connectDB();
  await ensureDefaultExecutivePositions();
  const roles = await GovernanceRole.find({ organ: "executive" })
    .sort({ order: 1, name: 1 })
    .lean<IGovernanceRole[]>();
  return roles.map((r) => ({
    id: r._id.toString(),
    name: r.name,
    description: r.description ?? "",
    responsibilities: r.responsibilities ?? [],
    order: r.order,
    isActive: r.isActive,
    isPresident: r.isPresident ?? false,
  }));
}

export async function getExecutivePresidentMessage() {
  await connectDB();
  const settings = await OrgSettings.findOne({})
    .select("executiveCouncilPresidentMessage")
    .lean();
  return settings?.executiveCouncilPresidentMessage ?? "";
}

export async function getLeadershipMembers() {
  await connectDB();
  const members = await ExecutiveMember.find({})
    .sort({ isActive: -1, createdAt: -1 })
    .populate<{ user: IUser & { _id: Types.ObjectId } }>(
      "user",
      "firstName lastName email phone profilePhoto website linkedIn privacySettings"
    )
    .populate<{ role: IGovernanceRole & { _id: Types.ObjectId } }>(
      "role",
      "name order organ"
    )
    .lean();

  return members
    .filter((m) => m.user && m.role && m.role.organ === "executive")
    .map((m) => {
      const user = m.user as unknown as IUser & { _id: Types.ObjectId };
      const role = m.role as unknown as IGovernanceRole & { _id: Types.ObjectId };
      return {
        id: (m._id as Types.ObjectId).toString(),
        userId: user._id.toString(),
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        userPhone: user.phone ?? "",
        userPhoto: m.photoUrl || user.profilePhoto || "",
        userWebsite: user.website ?? "",
        userLinkedIn: user.linkedIn ?? "",
        roleId: role._id.toString(),
        roleName: role.name,
        term: m.term ?? "",
        startDate: m.startDate?.toISOString() ?? "",
        endDate: m.endDate?.toISOString(),
        isActive: m.isActive,
        bio: m.bio ?? "",
        photoUrl: m.photoUrl ?? "",
        isPublished: m.isPublished !== false,
      };
    });
}
