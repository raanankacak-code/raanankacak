"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
          <label htmlFor="password">Password</label>
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
