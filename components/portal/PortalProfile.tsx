"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";

/**
 * The client's own account: their name and their password.
 *
 * Deliberately not a copy of the staff profile page — there is no role, no
 * permission list and no company to show, because none of that is theirs.
 * The name matters more here than it does for staff: it is what goes on to
 * a sign-off record, and it is written into that record at the moment of
 * signing, so correcting it afterwards changes nothing already signed.
 */
export default function PortalProfile({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [nameValue, setNameValue] = useState(name);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSaved, setNameSaved] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  async function saveName() {
    setNameError("");
    setNameSaved(false);
    if (!nameValue.trim()) return setNameError("Your name is required.");
    setSavingName(true);
    try {
      await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ name: nameValue.trim() }) });
      setNameSaved(true);
      router.refresh();
    } catch (err) {
      setNameError(err instanceof ApiClientError ? err.message : "Could not save your name.");
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
      // Re-authenticate first: a signed-in session left unattended should not
      // be enough to change the password on the account.
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: curPw });
      if (reauthError) return setPwError("Current password is incorrect.");

      const { error: updateError } = await supabase.auth.updateUser({ password: newPw });
      if (updateError) return setPwError(updateError.message);

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
      <div className="card">
        <div className="card-h">
          <h3>Your details</h3>
        </div>
        <div className="card-b">
          {nameError && <div className="auth-err">{nameError}</div>}
          <div className="form-grid">
            <div>
              <label htmlFor="portal-name">Your name</label>
              <input id="portal-name" value={nameValue} onChange={(e) => setNameValue(e.target.value)} />
            </div>
            <div>
              <label htmlFor="portal-email">Email</label>
              <input id="portal-email" value={email} disabled />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
            <button className="btn btn-amber" onClick={saveName} disabled={savingName || nameValue.trim() === name}>
              {savingName ? "Saving…" : "Save"}
            </button>
            {nameSaved && <span className="small mut">Saved.</span>}
          </div>
          <p className="small faint" style={{ marginTop: 10 }}>
            This is the name that appears on anything you sign off. Changing it does not alter what you have already
            signed — those carry the name you had at the time.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Password</h3>
        </div>
        <div className="card-b">
          {pwError && <div className="auth-err">{pwError}</div>}
          {pwSuccess && <div className="small mut" style={{ marginBottom: 10 }}>{pwSuccess}</div>}
          <div className="form-grid">
            <div className="full">
              <label htmlFor="portal-cur-pw">Current password</label>
              <input id="portal-cur-pw" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
            </div>
            <div>
              <label htmlFor="portal-new-pw">New password</label>
              <input id="portal-new-pw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </div>
            <div>
              <label htmlFor="portal-new-pw2">Repeat new password</label>
              <input id="portal-new-pw2" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-amber" style={{ marginTop: 12 }} onClick={changePassword} disabled={savingPw}>
            {savingPw ? "Updating…" : "Update password"}
          </button>
        </div>
      </div>
    </>
  );
}
