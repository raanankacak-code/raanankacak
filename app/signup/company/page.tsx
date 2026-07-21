"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { apiFetch, ApiClientError } from "@/lib/api-client";

const MALAYSIAN_STATES = [
  "Sarawak",
  "Sabah",
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Selangor",
  "Terengganu",
  "W.P. Kuala Lumpur",
];

export default function CompanySetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [ssmNumber, setSsmNumber] = useState("");
  const [cidbNumber, setCidbNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [state, setState] = useState("Sarawak");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setChecking(false);
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name) {
      setError("Company name is required.");
      return;
    }
    setLoading(true);
    try {
      const ownerName = sessionStorage.getItem("bw_owner_name") || "Owner";
      await apiFetch("/api/orgs", {
        method: "POST",
        body: JSON.stringify({
          name,
          ssmNumber: ssmNumber || undefined,
          cidbNumber: cidbNumber || undefined,
          email: email || undefined,
          phone: phone || undefined,
          addressLine1: addressLine1 || undefined,
          city: city || undefined,
          postcode: postcode || undefined,
          state: state || undefined,
          ownerName,
        }),
      });
      sessionStorage.removeItem("bw_owner_name");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) return null;

  return (
    <AuthShell>
      <div className="wiz-steps">
        <b className="done">Account</b>
        <i className="on" />
        <b className="on">Company</b>
      </div>
      <h2>Set up your company</h2>
      <p className="a-sub">This becomes your workspace — you can invite your team afterwards.</p>

      {error && <div className="auth-err">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="fld">
          <label htmlFor="company-name">Company name *</label>
          <input id="company-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="fld fld-2">
          <div>
            <label htmlFor="ssm">SSM registration (optional)</label>
            <input id="ssm" value={ssmNumber} onChange={(e) => setSsmNumber(e.target.value)} />
          </div>
          <div>
            <label htmlFor="cidb">CIDB registration (optional)</label>
            <input id="cidb" value={cidbNumber} onChange={(e) => setCidbNumber(e.target.value)} />
          </div>
        </div>
        <div className="fld fld-2">
          <div>
            <label htmlFor="company-email">Company email</label>
            <input id="company-email" type="email" placeholder="office@company.my" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="phone">Phone number</label>
            <input id="phone" inputMode="tel" placeholder="e.g. 085-123 456" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="fld">
          <label htmlFor="addr1">Business address</label>
          <input id="addr1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
        </div>
        <div className="fld fld-2">
          <div>
            <label htmlFor="city">City</label>
            <input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label htmlFor="postcode">Postcode</label>
            <input id="postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
          </div>
        </div>
        <div className="fld">
          <label htmlFor="state">State</label>
          <select id="state" value={state} onChange={(e) => setState(e.target.value)}>
            {MALAYSIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-amber auth-submit" type="submit" disabled={loading}>
          {loading ? "Creating workspace…" : "Create workspace"}
        </button>
      </form>
    </AuthShell>
  );
}
