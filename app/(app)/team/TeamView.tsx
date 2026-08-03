"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { ROLE_LABELS, ROLE_META, PERM_LABELS, can, type Permission } from "@/lib/permissions";
import { statusBadgeClass, statusLabel, formatInstantDate } from "@/lib/format";
import Modal from "@/components/app/Modal";
import SortableTh, { type SortState, toggleSort, sortRows } from "@/components/app/SortableTh";
import type { Role } from "@/lib/db/types";

const ROLES: Role[] = [
  "OWNER",
  "ADMIN",
  "PROJECT_MANAGER",
  "SITE_SUPERVISOR",
  "ENGINEER",
  "QUANTITY_SURVEYOR",
  "SAFETY_OFFICER",
  "STOREKEEPER",
  "FINANCE",
  "VIEWER",
  "CLIENT",
];

type Member = { id: string; name: string; email: string; role: Role; active: boolean };
type Invite = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  invitedByName: string;
  token: string;
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function RoleTag({ role, onClick }: { role: Role; onClick: () => void }) {
  const meta = ROLE_META[role];
  return (
    <span
      className={`badge ${meta.badgeClass} role-tag`}
      role="button"
      tabIndex={0}
      title="View role details"
      onClick={onClick}
      // Space as well as Enter: a native button responds to both, and
      // anything wearing role="button" is expected to behave like one.
      // Space also scrolls the page by default, hence preventDefault.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {meta.icon} {ROLE_LABELS[role]}
    </span>
  );
}

export default function TeamView({ orgName, myRole, myId }: { orgName: string; myRole: Role; myId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manageTarget, setManageTarget] = useState<Member | null>(null);
  const [roleInfo, setRoleInfo] = useState<Role | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sort, setSort] = useState<SortState<"name" | "role" | "active">>(null);

  async function load() {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        apiFetch<{ members: Member[] }>("/api/team"),
        apiFetch<{ invites: Invite[] }>("/api/team/invites"),
      ]);
      setMembers(m.members);
      setInvites(i.invites);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load team.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(load);
  }, []);

  const activeCount = members.filter((m) => m.active).length;
  const pendingCount = invites.filter((i) => i.status === "PENDING").length;
  const sortedMembers = sortRows(members, sort, (m, key) =>
    key === "name" ? m.name : key === "role" ? m.role : m.active ? "1" : "0",
  );

  return (
    <>
      <div className="topbar">
        <h2>Team</h2>
        <div className="top-actions">
          <button className="btn btn-amber" onClick={() => setInviteOpen(true)}>
            ＋ Invite User
          </button>
        </div>
        <div className="sub">
          People with access to <b>{orgName}</b>. Click any role badge to see what it can do.
        </div>
      </div>

      {error && <div className="auth-err">{error}</div>}

      <div className="grid">
        <div className="card">
          <div className="card-h">
            <h3>Members</h3>
            <span className="right small faint">
              {activeCount} active{members.length - activeCount ? ` · ${members.length - activeCount} deactivated` : ""}
            </span>
          </div>
          {loading ? (
            <div className="card-b">
              <p className="mut small">Loading…</p>
            </div>
          ) : (
            <div className="tbl-wrap">
              {/* `cards` — one card per member below 700px. See globals.css. */}
              <table className="cards">
                <thead>
                  <tr>
                    <SortableTh label="Person" sortKey="name" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                    <SortableTh label="Role" sortKey="role" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                    <SortableTh label="Status" sortKey="active" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m) => {
                    const me = m.id === myId;
                    const canManage = m.role !== "OWNER" || myRole === "OWNER";
                    return (
                      <tr key={m.id} style={{ opacity: m.active ? 1 : 0.55 }}>
                        <td className="card-t">
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <div className="avatar" style={{ width: 30, height: 30, fontSize: 13 }}>
                              {initials(m.name)}
                            </div>
                            <div>
                              <b>{m.name}</b>
                              {me && <span className="small faint"> (you)</span>}
                              <div className="small faint num">{m.email}</div>
                            </div>
                          </div>
                        </td>
                        <td data-label="Role">
                          <RoleTag role={m.role} onClick={() => setRoleInfo(m.role)} />
                        </td>
                        <td data-label="Status">
                          <span className={`badge ${statusBadgeClass(m.active ? "ACTIVE" : "CANCELLED")}`}>
                            <i className="dot" />
                            {m.active ? "Active" : "Deactivated"}
                          </span>
                        </td>
                        <td className="card-a" style={{ textAlign: "right" }}>
                          {canManage && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setManageTarget(m)} aria-label={`Manage ${m.name}`}>
                              Manage
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Invitations</h3>
            <span className="right small faint">{pendingCount} pending</span>
          </div>
          {invites.length ? (
            <div className="tbl-wrap">
              {/* `cards` — see globals.css and InviteRow below. */}
              <table className="cards">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Role</th>
                    <th>Invitation Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => (
                    <InviteRow key={inv.id} invite={inv} onChanged={load} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <div className="e-ic">✉️</div>
              <div className="e-t">No Users Invited</div>
              <p>Invite your first employee — they get a link to join with a role you set.</p>
              <button className="btn btn-amber" onClick={() => setInviteOpen(true)}>
                ＋ Invite User
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Roles &amp; permissions</h3>
            <span className="right small faint">click a role for full details</span>
          </div>
          <div className="card-b" style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            {ROLES.map((r) => (
              <RoleTag key={r} role={r} onClick={() => setRoleInfo(r)} />
            ))}
          </div>
        </div>
      </div>

      {manageTarget && (
        <ManageMemberModal
          member={manageTarget}
          myId={myId}
          onClose={() => setManageTarget(null)}
          onChanged={() => {
            setManageTarget(null);
            load();
          }}
        />
      )}

      {roleInfo && <RoleInfoModal role={roleInfo} onClose={() => setRoleInfo(null)} />}

      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onCreated={() => {
            setInviteOpen(false);
            load();
          }}
        />
      )}
    </>
  );
}

function RoleInfoModal({ role, onClose }: { role: Role; onClose: () => void }) {
  const meta = ROLE_META[role];
  return (
    <Modal title={`${meta.icon} ${ROLE_LABELS[role]}`} onClose={onClose} footer={<button className="btn btn-amber" onClick={onClose}>Close</button>}>
      <p style={{ marginBottom: 14 }}>{meta.desc}</p>
      <div className="field-label">Responsibilities</div>
      <div style={{ display: "grid", gap: 6, marginBottom: 16 }}>
        {meta.resp.map((r, i) => (
          <div key={i} className="small" style={{ display: "flex", gap: 9 }}>
            <span style={{ color: "var(--amber)" }}>■</span>
            {r}
          </div>
        ))}
      </div>
      <div className="field-label">Permissions</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(215px,1fr))", gap: 7 }}>
        {PERM_LABELS.map(([key, label]: [Permission, string]) => {
          const has = can(role, key);
          return (
            <div key={key} className="small" style={{ display: "flex", gap: 8, alignItems: "center", color: has ? "var(--text)" : "var(--faint)" }}>
              <b style={{ color: has ? "var(--ok-text)" : "var(--bad-text)", width: 14 }}>{has ? "✓" : "✗"}</b>
              {label}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function ManageMemberModal({
  member,
  myId,
  onClose,
  onChanged,
}: {
  member: Member;
  myId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [role, setRole] = useState(member.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isSelf = member.id === myId;
  const isClientAccount = member.role === "CLIENT";

  async function saveRole() {
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/team/${member.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to update role.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/team/${member.id}`, { method: "PATCH", body: JSON.stringify({ active: !member.active }) });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to update status.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove ${member.name} from the company? They won't be able to sign in anymore.`)) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/team/${member.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to remove user.");
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Manage User"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-amber" onClick={saveRole} disabled={saving || isSelf}>
            Save changes
          </button>
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}
      <div className="form-grid">
        <div>
          <label htmlFor="teamview-full-name">Full name</label>
          <input id="teamview-full-name" value={member.name} disabled />
        </div>
        <div>
          <label htmlFor="teamview-email">Email</label>
          <input id="teamview-email" value={member.email} disabled />
        </div>
        <div className="full">
          <label htmlFor="teamview-role">Role</label>
          <select
            id="teamview-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            disabled={isSelf || isClientAccount}
          >
            {/* A client is scoped by project and a staff account by company,
                so one cannot be turned into the other in place. The server
                refuses it too. */}
            {(isClientAccount ? (["CLIENT"] as Role[]) : ROLES.filter((r) => r !== "CLIENT")).map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].icon} {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {isSelf && <div className="small faint" style={{ marginTop: 5 }}>You can&rsquo;t change your own role.</div>}
          {isClientAccount && (
            <div className="small faint" style={{ marginTop: 5 }}>
              A client account can&rsquo;t become a staff account. Deactivate it here to take their access away.
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 14 }}>
        <div className="field-label">Account</div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button className={`btn${member.active ? "" : " btn-amber"}`} onClick={toggleActive} disabled={saving || isSelf}>
            {member.active ? "Deactivate account" : "Activate account"}
          </button>
          <button className="btn btn-danger" onClick={remove} disabled={saving || isSelf}>
            Remove from company
          </button>
        </div>
        <div className="small faint" style={{ marginTop: 6 }}>
          {member.active ? "Deactivated users keep their history but can't sign in." : "This account is deactivated — sign-in is blocked until reactivated."}
        </div>
      </div>
    </Modal>
  );
}

function InviteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("SITE_SUPERVISOR");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailFailed, setEmailFailed] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const isClientInvite = role === "CLIENT";

  // The project list is only needed for a client invitation, so it is fetched
  // when one is being written rather than every time the modal opens.
  useEffect(() => {
    if (!isClientInvite || projects.length > 0) return;
    let cancelled = false;
    apiFetch<{ projects: { id: string; name: string }[] }>("/api/projects")
      .then((res) => {
        if (!cancelled) setProjects(res.projects ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your projects. Close this and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [isClientInvite, projects.length]);

  async function submit() {
    setError("");
    if (!name.trim()) return setError("Full name is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address.");
    if (isClientInvite && projectIds.length === 0) {
      return setError("Choose at least one project this client may see.");
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ emailSent: boolean }>("/api/team/invites", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          role,
          department: department || undefined,
          ...(isClientInvite ? { projectIds } : {}),
        }),
      });
      // The invitation exists either way, so this is a warning rather than an
      // error — but closing the modal as if the email had gone would leave
      // someone waiting for a message that is never coming.
      if (!res.emailSent) {
        setEmailFailed(true);
        return;
      }
      onCreated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to send invitation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Invite User"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-amber" onClick={emailFailed ? onCreated : submit} disabled={saving}>
            {emailFailed ? "Done" : saving ? "Sending…" : "Send invitation"}
          </button>
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}
      {emailFailed && (
        <div className="auth-err">
          The invitation for <b>{email}</b> was created, but the email could not be sent. Use <b>Copy link</b> on their
          row in the invitations list and send it to them yourself.
        </div>
      )}
      <div className="form-grid">
        <div>
          <label htmlFor="teamview-full-name-2">Full name *</label>
          <input id="teamview-full-name-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nurul Aina" />
        </div>
        <div>
          <label htmlFor="teamview-email-2">Email *</label>
          <input id="teamview-email-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.my" />
        </div>
        <div>
          <label htmlFor="teamview-role-2">Role</label>
          <select id="teamview-role-2" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.filter((r) => r !== "OWNER").map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].icon} {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="teamview-department-optional">Department (optional)</label>
          <input id="teamview-department-optional" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Technical" />
        </div>
        {isClientInvite && (
          <div className="full">
            <label>Projects this client may see *</label>
            <p className="small mut" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, margin: "0 0 8px" }}>
              They will see progress, the site diary and its photos, the safety record and the snag list — for these
              projects and nothing else. Not costs, materials, workers or plant.
            </p>
            {projects.length === 0 ? (
              <div className="small faint">No projects yet — create one first.</div>
            ) : (
              <div className="proj-picks">
                {projects.map((p) => (
                  <label key={p.id} className="consent">
                    <input
                      type="checkbox"
                      checked={projectIds.includes(p.id)}
                      onChange={(e) =>
                        setProjectIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id)))
                      }
                    />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="small faint" style={{ marginTop: 12 }}>
        They&rsquo;ll get an invitation link that expires in 7 days. Their role, company and access come from this invitation.
      </div>
    </Modal>
  );
}

function InviteRow({ invite, onChanged }: { invite: Invite; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resendFailed, setResendFailed] = useState(false);

  async function resend() {
    setBusy(true);
    setResendFailed(false);
    try {
      const res = await apiFetch<{ emailSent: boolean }>(`/api/team/invites/${invite.id}/resend`, { method: "POST" });
      // A resend that silently did nothing is worse than no button at all:
      // the invite got a fresh token, so the link they were sent before has
      // just stopped working and no new one has reached them.
      if (!res.emailSent) setResendFailed(true);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm(`Cancel the invitation for ${invite.email}?`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/team/invites/${invite.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/signup?invite=${invite.token}`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <tr>
      <td className="card-t">
        <b>{invite.name}</b>
        <div className="small faint num">
          {invite.email}
          {invite.department ? ` · ${invite.department}` : ""}
        </div>
      </td>
      <td data-label="Role">
        <span className={`badge ${ROLE_META[invite.role].badgeClass}`}>
          {ROLE_META[invite.role].icon} {ROLE_LABELS[invite.role]}
        </span>
      </td>
      <td data-label="Invitation">
        <span className={`badge ${statusBadgeClass(invite.status)}`}>
          <i className="dot" />
          {statusLabel(invite.status)}
        </span>
        <div className="small faint" style={{ marginTop: 3 }}>
          {invite.status === "PENDING" ? `expires ${formatInstantDate(invite.expiresAt)}` : `invited by ${invite.invitedByName}`}
        </div>
        {resendFailed && (
          <div className="small" style={{ marginTop: 3, color: "var(--bad-text)" }}>
            Email not sent — use Copy link
          </div>
        )}
      </td>
      <td className="card-a" style={{ whiteSpace: "nowrap", textAlign: "right" }}>
        {invite.status === "PENDING" && (
          <button className="btn btn-ghost btn-sm" onClick={copyLink} aria-label={`Copy invitation link for ${invite.name}`}>
            {copied ? "Copied!" : "Copy link"}
          </button>
        )}
        {(invite.status === "PENDING" || invite.status === "EXPIRED" || invite.status === "CANCELLED") && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={resend}
            disabled={busy}
            aria-label={`Resend invitation to ${invite.name}`}
          >
            Resend
          </button>
        )}
        {invite.status === "PENDING" && (
          <button
            className="btn btn-danger btn-sm"
            onClick={cancel}
            disabled={busy}
            aria-label={`Cancel invitation for ${invite.name}`}
          >
            Cancel
          </button>
        )}
      </td>
    </tr>
  );
}
