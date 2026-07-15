"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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
    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
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
    setInfo(
      "Account created — check your email to confirm it, then sign in. You'll finish setting up your company workspace right after.",
    );
  }

  return (
    <AuthShell>
      <div className="auth-tabs">
        <Link href="/login" style={{ flex: 1 }}>
          <button type="button" style={{ width: "100%" }}>
            Sign in
          </button>
        </Link>
        <button className="on" type="button">
          Create account
        </button>
      </div>
      <h2>Create your account</h2>
      <p className="a-sub">Step 1 of 2 — you&rsquo;ll set up your company next.</p>

      {error && <div className="auth-err">{error}</div>}
      {info && (
        <div className="auth-err" style={{ color: "var(--ok)", background: "#3ecf8e14", borderColor: "#3ecf8e3d" }}>
          {info}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="fld">
          <label htmlFor="name">Your name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
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
              autoComplete="new-password"
            />
            <button type="button" className="pw-eye" onClick={() => setShowPw((s) => !s)}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <button className="btn btn-amber auth-submit" type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Continue"}
        </button>
      </form>
      <p className="a-note">
        Already have a workspace? <Link href="/login">Sign in</Link>.
      </p>
    </AuthShell>
  );
}
