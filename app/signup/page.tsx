"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import ConsentCheckbox from "@/components/auth/ConsentCheckbox";
import { createClient } from "@/lib/supabase/client";
import { apiFetch, ApiClientError } from "@/lib/api-client";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetInvite = searchParams.get("invite") || "";

  const [mode, setMode] = useState<"new" | "join">(presetInvite ? "join" : "new");

  // new company
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);

  // join with invitation
  const [inviteCode, setInviteCode] = useState(presetInvite);
  const [inviteInfo, setInviteInfo] = useState<{ name: string; email: string; role: string; orgName: string } | null>(null);
  const [inviteChecked, setInviteChecked] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinEmail, setJoinEmail] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joinPassword2, setJoinPassword2] = useState("");
  const [joinShowPw, setJoinShowPw] = useState(false);

  // Only the invite flow carries consent here, because only it completes a
  // durable relationship on this page. The "New company" tab creates a login
  // and nothing else; the workspace — and the agreement that goes with it —
  // is created on the next step, and asking here as well would mean asking
  // twice for one thing. It would also be lost: when email confirmation is
  // required the user leaves and comes back through /login, and a tick held
  // in this tab does not survive that.
  const [acceptedJoin, setAcceptedJoin] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (presetInvite) checkInvite(presetInvite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkInvite(codeOrLink: string) {
    const token = codeOrLink.trim().split("invite=").pop()?.split("/").pop()?.trim() || "";
    if (!token || token === inviteChecked) return;
    setInviteChecked(token);
    try {
      const data = await apiFetch<{ invite: { name: string; email: string; role: string }; org: { name: string } | null }>(
        `/api/invites/${encodeURIComponent(token)}`,
      );
      setInviteInfo({ ...data.invite, orgName: data.org?.name ?? "your company" });
      setJoinName(data.invite.name);
      setJoinEmail(data.invite.email);
      setError("");
    } catch {
      setInviteInfo(null);
    }
  }

  async function handleNewCompany(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!name || !email || !password) {
      setError("Fill in your name, email and password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== password2) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, phone: phone || undefined },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (data.session) {
      sessionStorage.setItem("bw_owner_name", name);
      router.push("/signup/company");
      return;
    }
    // Supabase returns a user with no identities (no error) when the email
    // is already registered, to avoid leaking which emails exist — that
    // also means it silently skips sending a new confirmation email.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError("This email already has an account. Sign in instead, or use “Forgot password?” if you don’t remember it.");
      return;
    }
    setInfo(
      "Account created — check your email to confirm it, then sign in. You'll finish setting up your company workspace right after.",
    );
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    const token = inviteCode.trim().split("invite=").pop()?.split("/").pop()?.trim() || "";
    if (!token) {
      setError("Paste your invitation link or code.");
      return;
    }
    if (!joinName.trim()) {
      setError("Your full name is required.");
      return;
    }
    if (!joinEmail || !joinPassword) {
      setError("Enter your email and a password.");
      return;
    }
    if (joinPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (joinPassword !== joinPassword2) {
      setError("Passwords do not match.");
      return;
    }
    if (!acceptedJoin) {
      setError("Please read and accept the terms of service and privacy notice.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: joinEmail,
        password: joinPassword,
        options: {
          data: { full_name: joinName },
          emailRedirectTo: `${window.location.origin}/login?invite=${encodeURIComponent(token)}`,
        },
      });
      if (signUpError) throw new Error(signUpError.message);
      if (!data.session) {
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError("This email already has an account. Sign in instead, then open your invitation link again to join.");
          setLoading(false);
          return;
        }
        setInfo("Account created — check your email to confirm it, then sign in to finish joining the workspace.");
        setLoading(false);
        return;
      }
      await apiFetch(`/api/invites/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: JSON.stringify({ acceptedTerms: true }),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Failed to accept invitation.");
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-tabs">
        <Link href="/login">Sign in</Link>
        <button className="on" type="button">
          Create account
        </button>
      </div>
      <h2>Create your account</h2>
      <p className="a-sub">Register a new company, or join yours with an invitation.</p>

      <div className="fld">
        <div className="seg">
          <button type="button" className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}>
            New company
          </button>
          <button type="button" className={mode === "join" ? "on" : ""} onClick={() => setMode("join")}>
            I was invited
          </button>
        </div>
      </div>

      {error && <div className="auth-err">{error}</div>}
      {info && (
        <div className="auth-err" style={{ color: "var(--ok-text)", background: "#3ecf8e14", borderColor: "#3ecf8e3d" }}>
          {info}
        </div>
      )}

      {mode === "join" ? (
        <form onSubmit={handleJoin}>
          <div className="fld">
            <label htmlFor="join-name">Full name</label>
            <input id="join-name" value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="e.g. Nurul Aina" />
          </div>
          <div className="fld">
            <label htmlFor="join-code">Invitation link</label>
            <input
              id="join-code"
              className="mono"
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value);
                checkInvite(e.target.value);
              }}
              onBlur={(e) => checkInvite(e.target.value)}
              placeholder="Paste your invitation link or code"
            />
            <div className="small faint" style={{ marginTop: 5 }}>
              {inviteInfo
                ? `Joining ${inviteInfo.orgName} as ${inviteInfo.role.replace(/_/g, " ")}.`
                : "Your role, projects and company come from the invitation."}
            </div>
          </div>
          <div className="fld">
            <label htmlFor="join-email">Email</label>
            <input
              id="join-email"
              type="email"
              autoComplete="email"
              value={joinEmail}
              onChange={(e) => setJoinEmail(e.target.value)}
              placeholder="you@company.my"
            />
          </div>
          <div className="fld fld-2">
            <div>
              <label htmlFor="join-pw">Password</label>
              <div className="pw-wrap">
                <input
                  id="join-pw"
                  type={joinShowPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                />
                <button type="button" className="pw-eye" onClick={() => setJoinShowPw((s) => !s)}>
                  {joinShowPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="join-pw2">Confirm</label>
              <input
                id="join-pw2"
                type={joinShowPw ? "text" : "password"}
                autoComplete="new-password"
                value={joinPassword2}
                onChange={(e) => setJoinPassword2(e.target.value)}
                placeholder="Repeat password"
              />
            </div>
          </div>
          <ConsentCheckbox id="consent-join" checked={acceptedJoin} onChange={setAcceptedJoin} />
          <button className="btn btn-amber auth-submit" type="submit" disabled={loading}>
            {loading ? "Joining…" : "Accept invitation & join"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleNewCompany}>
          <div className="fld">
            <label htmlFor="name">Full name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="e.g. Azlan Hashim" />
          </div>
          <div className="fld fld-2">
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@company.my"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="owner-phone">Phone number</label>
              <input
                id="owner-phone"
                inputMode="tel"
                placeholder="e.g. 012-345 6789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </div>
          </div>
          <div className="fld fld-2">
            <div>
              <label htmlFor="password">Password</label>
              <div className="pw-wrap">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button type="button" className="pw-eye" onClick={() => setShowPw((s) => !s)}>
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="password2">Confirm password</label>
              <input
                id="password2"
                type={showPw ? "text" : "password"}
                placeholder="Repeat password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="small faint" style={{ margin: "-4px 0 14px" }}>
            You&rsquo;ll be the <b style={{ color: "var(--amber-text)" }}>👑 Owner</b> of this workspace, with full access.
          </div>
          <button className="btn btn-amber auth-submit" type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Continue — Company details →"}
          </button>
        </form>
      )}

      <p className="a-note">
        Already have a workspace? <Link href="/login">Sign in</Link>.
      </p>
      <p className="a-note">
        <Link href="/terms">Terms of service</Link> · <Link href="/privacy">Privacy notice</Link>
      </p>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
