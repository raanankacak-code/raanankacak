"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email) {
      setError("Enter your email address.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell>
      <h2>Reset your password</h2>
      <p className="a-sub">We&rsquo;ll email you a link to set a new password.</p>

      {error && <div className="auth-err">{error}</div>}

      {sent ? (
        <div className="auth-err" style={{ color: "var(--ok)", background: "#3ecf8e14", borderColor: "#3ecf8e3d" }}>
          If an account exists for {email}, a reset link is on its way — check your inbox.
        </div>
      ) : (
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
          <button className="btn btn-amber auth-submit" type="submit" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <p className="a-note">
        Remembered it after all? <Link href="/login">Sign in</Link>.
      </p>
    </AuthShell>
  );
}
