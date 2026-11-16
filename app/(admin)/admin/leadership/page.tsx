import { redirect } from "next/navigation";
import { Crown } from "lucide-react";
import { auth } from "@/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getExecutivePresidentMessage, getLeadershipRoles, getLeadershipMembers } from "@/lib/dal/admin-leadership";
import { PageHeader } from "@/components/admin/PageHeader";
import { AdminTable, AdminTableHead, AdminTableRow } from "@/components/admin/AdminTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { LeadershipForms } from "@/components/admin/leadership/LeadershipForms";
import { LeadershipRoleActions } from "@/components/admin/leadership/LeadershipRoleActions";
import { LeadershipProfileDialog } from "@/components/admin/leadership/LeadershipProfileDialog";
import { ToggleLeadershipButton } from "@/components/admin/leadership/ToggleLeadershipButton";

export default async function LeadershipPage() {
  const session = await auth();
  if (!hasPermission(session?.user.role, PERMISSIONS.LEADERSHIP_MANAGE)) redirect("/admin");
  const [roles, members, presidentMessage] = await Promise.all([
    getLeadershipRoles(),
    getLeadershipMembers(),
    getExecutivePresidentMessage(),
  ]);

  return (
    <div>
      <PageHeader title="Leadership" description="Manage the Interim Government, Executive Council positions and officer profiles." />

      <div className="mb-6">
        <LeadershipForms roles={roles.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive, isPresident: r.isPresident }))} presidentMessage={presidentMessage} />
      </div>

      <section className="mb-8">
        <div className="mb-3">
          <h2 className="font-heading text-xl font-semibold text-oroko-black">Executive Council positions</h2>
          <p className="text-sm text-muted-foreground">Change titles, publication status and display order. Vacant positions remain on the public page.</p>
        </div>
        <AdminTable>
          <AdminTableHead>
            <th>Position</th>
            <th>Current officer</th>
            <th>Order</th>
            <th>Status</th>
            <th />
          </AdminTableHead>
          <tbody>
            {roles.map((role) => {
              const assignedMember = members.find((member) => member.roleId === role.id && member.isActive);
              return (
                <AdminTableRow key={role.id}>
                  <td>
                    <p className="font-medium text-oroko-black">{role.name}</p>
                    {role.isPresident && <p className="text-xs text-oroko-gold">President feature</p>}
                    {role.description && <p className="mt-1 max-w-md text-xs text-muted-foreground">{role.description}</p>}
                  </td>
                  <td>
                    {assignedMember
                      ? <p className="font-medium text-oroko-black">{assignedMember.userName}</p>
                      : <span className="text-sm text-muted-foreground">To be appointed</span>}
                    {assignedMember && !assignedMember.isPublished && (
                      <p className="text-xs text-muted-foreground">Profile unpublished</p>
                    )}
                  </td>
                  <td>{role.order}</td>
                  <td><StatusBadge status={role.isActive ? "active" : "inactive"} /></td>
                  <td className="text-right">
                    <LeadershipRoleActions role={role} />
                  </td>
                </AdminTableRow>
              );
            })}
          </tbody>
        </AdminTable>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="font-heading text-xl font-semibold text-oroko-black">Officer assignments & history</h2>
          <p className="text-sm text-muted-foreground">Past assignments are retained when an officer leaves or a successor is appointed.</p>
        </div>
      {members.length === 0 ? (
        <EmptyState icon={Crown} title="No leadership positions assigned yet" />
      ) : (
        <AdminTable>
          <AdminTableHead>
            <th>Member</th>
            <th>Position</th>
            <th>Term</th>
            <th>Publication</th>
            <th>Status</th>
            <th />
          </AdminTableHead>
          <tbody>
            {members.map((m) => (
              <AdminTableRow key={m.id}>
                <td>
                  <p className="font-medium text-oroko-black">{m.userName}</p>
                  <p className="text-xs text-muted-foreground">{m.userEmail}</p>
                  {m.isPublicProfile && <p className="text-xs font-medium text-oroko-green">Public page record</p>}
                </td>
                <td>{m.roleName}</td>
                <td>{m.term || "Not specified"}</td>
                <td><StatusBadge status={m.isPublished ? "published" : "draft"} /></td>
                <td><StatusBadge status={m.isActive ? "active" : "resigned"} /></td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    <LeadershipProfileDialog
                      id={m.id}
                      roleName={m.roleName}
                      userName={m.userName}
                      bio={m.bio}
                      photoUrl={m.photoUrl}
                      isPublished={m.isPublished}
                    />
                    <ToggleLeadershipButton id={m.id} isActive={m.isActive} />
                  </div>
                </td>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminTable>
      )}
      </section>
    </div>
  );
}
