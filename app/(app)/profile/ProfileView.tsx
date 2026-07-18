"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS, PERM_LABELS, can } from "@/lib/permissions";
import type { Role } from "@/lib/db/types";

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export default function ProfileView({
  name,
  email,
  role,
  orgName,
}: {
  name: string;
  email: string;
  role: Role;
  orgName: string;
}) {
  const router = useRouter();
  const [nameValue, setNameValue] = useState(name);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const dirty = nameValue.trim() !== name;

  async function saveName() {
    setNameError("");
    if (!nameValue.trim()) {
      setNameError("Your name is required.");
      return;
    }
    setSavingName(true);
    try {
      await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ name: nameValue.trim() }) });
      router.refresh();
    } catch (err) {
      setNameError(err instanceof ApiClientError ? err.message : "Failed to update profile.");
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword() {
    setPwError("");
    setPwSuccess("");
    if (newPw.length < 8) return setPwError("New password must be at least 8 characters.");
    if (newPw !== newPw2) return setPwError("Passwords don't match — retype the new password.");
    setSavingPw(true);
    try {
      const supabase = createClient();
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: curPw });
      if (reauthError) {
        setPwError("Current password is incorrect.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPw });
      if (updateError) {
        setPwError(updateError.message);
        return;
      }
      setCurPw("");
      setNewPw("");
      setNewPw2("");
      setPwSuccess("Password updated.");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <h2>My Profile</h2>
        <div className="sub">Your account, password and permissions.</div>
      </div>

      <div className="two-col">
        <div className="grid">
          <div className="card">
            <div className="card-b" style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div className="avatar" style={{ width: 52, height: 52, fontSize: 20 }}>
                {initials(name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 17 }}>{name}</b>
                <div className="small mut" style={{ marginTop: 3 }}>
                  <span className="badge b-amber">
                    <span className="dot" />
                    {ROLE_LABELS[role]}
                  </span>{" "}
                  · {orgName}
                </div>
                <div className="small faint" style={{ marginTop: 7 }}>
                  <span className="badge b-ok">
                    <span className="dot" />
                    Active
                  </span>{" "}
                  · Signed in as {email}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Profile</h3>
            </div>
            <div className="card-b">
              {nameError && <div className="auth-err">{nameError}</div>}
              <div className="form-grid">
                <div className="full">
                  <label>Full name</label>
                  <input value={nameValue} onChange={(e) => setNameValue(e.target.value)} />
                  <div className="small faint" style={{ marginTop: 5 }}>
                    Updates your initials and how your name appears across the workspace.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 14 }}>
                {dirty ? (
                  <span style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
                    <button className="btn btn-amber" disabled={savingName} onClick={saveName}>
                      {savingName ? "Saving…" : "Save Changes"}
                    </button>
                    <button className="btn" onClick={() => setNameValue(name)}>
                      Cancel
                    </button>
                    <span className="small" style={{ color: "var(--amber-deep)", fontWeight: 700 }}>
                      ● Unsaved changes
                    </span>
                  </span>
                ) : (
                  <span className="small faint">All changes saved</span>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Change Password</h3>
            </div>
            <div className="card-b">
              {pwError && <div className="auth-err">{pwError}</div>}
              {pwSuccess && (
                <div className="auth-err" style={{ color: "var(--ok)", background: "#3ecf8e14", borderColor: "#3ecf8e3d" }}>
                  {pwSuccess}
                </div>
              )}
              <div className="form-grid">
                <div className="full">
                  <label>Current password</label>
                  <input type="password" autoComplete="current-password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
                </div>
                <div>
                  <label>New password</label>
                  <input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                </div>
                <div>
                  <label>Confirm new password</label>
                  <input type="password" autoComplete="new-password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-amber" style={{ marginTop: 14 }} disabled={savingPw} onClick={changePassword}>
                {savingPw ? "Updating…" : "Update password"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <div className="card-h">
              <h3>What I can do</h3>
              <span className="small faint">{ROLE_LABELS[role]}</span>
            </div>
            <div className="card-b" style={{ paddingTop: 8 }}>
              {PERM_LABELS.map(([key, label]) => {
                const on = can(role, key);
                return (
                  <div className="pf-perm" key={key}>
                    <span className="ic" style={{ color: on ? "var(--ok)" : "var(--line2)" }}>
                      {on ? "✓" : "—"}
                    </span>
                    <span style={{ color: on ? "var(--text)" : "var(--faint)" }}>{label}</span>
                  </div>
                );
              })}
              <div className="small faint" style={{ marginTop: 12 }}>
                Permissions come from your role. Ask your Owner or Admin if you need more access.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
