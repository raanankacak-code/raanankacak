"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(
    searchParams.get("error") === "reset-link-expired"
      ? "That reset link has expired or already been used. Request a new one below."
      : "",
  );
  const [loading, setLoading] = useState(false);
  // A confirmation-email link lands here with ?code=... — detectSessionInUrl
  // exchanges it into a session automatically, so we skip straight to the
  // app instead of making the user type their credentials again.
  const [checkingConfirmation, setCheckingConfirmation] = useState(() => searchParams.has("code"));

  useEffect(() => {
    if (!searchParams.has("code")) return;
    const supabase = createClient();
    const invite = searchParams.get("invite");
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setCheckingConfirmation(false);
        return;
      }
      if (invite) {
        try {
          await apiFetch(`/api/invites/${encodeURIComponent(invite)}/accept`, { method: "POST" });
        } catch {
          // Invite may already be accepted (e.g. a re-click) — proceed regardless.
        }
      }
      router.replace("/dashboard");
      router.refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  if (checkingConfirmation) {
    return (
      <AuthShell>
        <h2>Confirming your account&hellip;</h2>
        <p className="a-sub">Hang tight, this only takes a second.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-tabs">
        <button className="on" type="button">
          Sign in
        </button>
        <Link href="/signup">Create account</Link>
      </div>
      <h2>Welcome back</h2>
      <p className="a-sub">Sign in to your organisation&rsquo;s workspace.</p>

      {error && <div className="auth-err">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="fld">
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
        <div className="fld">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <label htmlFor="password" style={{ margin: 0 }}>
              Password
            </label>
            <Link href="/forgot-password" className="small">
              Forgot password?
            </Link>
          </div>
          <div className="pw-wrap">
            <input
              id="password"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="pw-eye"
              onClick={() => setShowPw((s) => !s)}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <button className="btn btn-amber auth-submit" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="a-note">
        Don&rsquo;t have a workspace? <Link href="/signup">Create one</Link>.
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
