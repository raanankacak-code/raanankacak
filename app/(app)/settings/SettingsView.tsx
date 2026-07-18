"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

const MY_STATES = [
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
const COUNTRIES = ["Malaysia", "Brunei", "Singapore", "Indonesia"];
const CURRENCIES = ["MYR", "SGD", "BND", "USD"];
const TIMEZONES = ["Asia/Kuching", "Asia/Jakarta", "Asia/Tokyo"];

type Org = {
  id: string;
  name: string;
  shortName: string | null;
  ssmNumber: string | null;
  cidbNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  state: string | null;
  country: string;
  currency: string;
  timezone: string;
  logoUrl: string | null;
};

type FormState = {
  name: string;
  shortName: string;
  ssmNumber: string;
  cidbNumber: string;
  email: string;
  phone: string;
  website: string;
  description: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  state: string;
  country: string;
  currency: string;
  timezone: string;
  logoUrl: string;
};

function toForm(org: Org): FormState {
  return {
    name: org.name ?? "",
    shortName: org.shortName ?? "",
    ssmNumber: org.ssmNumber ?? "",
    cidbNumber: org.cidbNumber ?? "",
    email: org.email ?? "",
    phone: org.phone ?? "",
    website: org.website ?? "",
    description: org.description ?? "",
    addressLine1: org.addressLine1 ?? "",
    addressLine2: org.addressLine2 ?? "",
    city: org.city ?? "",
    postcode: org.postcode ?? "",
    state: org.state ?? MY_STATES[0],
    country: org.country ?? COUNTRIES[0],
    currency: org.currency ?? CURRENCIES[0],
    timezone: org.timezone ?? TIMEZONES[0],
    logoUrl: org.logoUrl ?? "",
  };
}

export default function SettingsView({ org }: { org: Org }) {
  const router = useRouter();
  const initial = useMemo(() => toForm(org), [org]);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState("");

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function uploadLogo(file: File | null) {
    if (!file) return;
    if (file.size > 2 * 1048576) {
      setError("Logo is over 2 MB — choose a smaller image.");
      return;
    }
    setUploadingLogo(true);
    setError("");
    try {
      const form2 = new FormData();
      form2.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: form2 });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Upload failed");
      set("logoUrl", body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload failed.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function save() {
    setError("");
    if (!form.name.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/orgs", {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          shortName: form.shortName || null,
          ssmNumber: form.ssmNumber || null,
          cidbNumber: form.cidbNumber || null,
          email: form.email || null,
          phone: form.phone || null,
          website: form.website || null,
          description: form.description || null,
          addressLine1: form.addressLine1 || null,
          addressLine2: form.addressLine2 || null,
          city: form.city || null,
          postcode: form.postcode || null,
          state: form.state || null,
          country: form.country,
          currency: form.currency,
          timezone: form.timezone,
          logoUrl: form.logoUrl || null,
        }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setForm(initial);
    setError("");
  }

  function restoreDefaults() {
    if (!confirm("Restore all company settings to their last saved values?")) return;
    setForm(initial);
  }

  return (
    <>
      <div className="topbar">
        <h2>Company Settings</h2>
        <div className="sub">
          Company profile, address, preferences and branding for <b>{org.name}</b>. Changes apply to everyone in the workspace.
        </div>
      </div>

      {error && <div className="auth-err">{error}</div>}

      <div className="two-col">
        <div className="grid">
          <div className="card">
            <div className="card-h">
              <h3>Company information</h3>
              {form.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="right brand-logo" style={{ width: 30, height: 30 }} src={form.logoUrl} alt="" />
              )}
            </div>
            <div className="card-b">
              <div className="form-grid">
                <div className="full">
                  <label>Company name</label>
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Hashim Bina Sdn Bhd" />
                </div>
                <div>
                  <label>
                    SSM registration number <span className="faint">(optional)</span>
                  </label>
                  <input value={form.ssmNumber} onChange={(e) => set("ssmNumber", e.target.value)} placeholder="e.g. 201501034567" />
                </div>
                <div>
                  <label>
                    CIDB registration number <span className="faint">(optional)</span>
                  </label>
                  <input value={form.cidbNumber} onChange={(e) => set("cidbNumber", e.target.value)} placeholder="e.g. 0198765-SR" />
                </div>
                <div>
                  <label>Company email</label>
                  <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="office@company.my" />
                </div>
                <div>
                  <label>Phone number</label>
                  <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="e.g. 085-431 220" />
                </div>
                <div className="full">
                  <label>
                    Website <span className="faint">(optional)</span>
                  </label>
                  <input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://yourcompany.my" />
                </div>
                <div className="full">
                  <label>
                    Company description <span className="faint">(optional)</span>
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="What your company does, in a sentence or two…"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Business address</h3>
            </div>
            <div className="card-b">
              <div className="form-grid">
                <div className="full">
                  <label>Address line 1</label>
                  <input value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} placeholder="e.g. Lot 1214, Jalan Cattleya 3" />
                </div>
                <div className="full">
                  <label>
                    Address line 2 <span className="faint">(optional)</span>
                  </label>
                  <input value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} placeholder="e.g. Piasau Light Industrial Estate" />
                </div>
                <div>
                  <label>City</label>
                  <input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Miri" />
                </div>
                <div>
                  <label>Postcode</label>
                  <input value={form.postcode} onChange={(e) => set("postcode", e.target.value)} placeholder="e.g. 98000" />
                </div>
                <div>
                  <label>State</label>
                  <select value={form.state} onChange={(e) => set("state", e.target.value)}>
                    {MY_STATES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Country</label>
                  <select value={form.country} onChange={(e) => set("country", e.target.value)}>
                    {COUNTRIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <div className="card-h">
              <h3>Business preferences</h3>
            </div>
            <div className="card-b">
              <div className="form-grid">
                <div>
                  <label>Currency</label>
                  <select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Timezone</label>
                  <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                    {TIMEZONES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Branding</h3>
            </div>
            <div className="card-b">
              <label>Company logo</label>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="brand-logo" style={{ width: 56, height: 56 }} src={form.logoUrl} alt="" />
                ) : (
                  <div className="brand-mark" style={{ width: 56, height: 56, fontSize: 26 }}>
                    {(form.name || "B").trim()[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <label className="btn" style={{ cursor: uploadingLogo ? "not-allowed" : "pointer" }}>
                    {uploadingLogo ? "Uploading…" : "⬆ Upload logo"}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={uploadingLogo}
                      onChange={(e) => uploadLogo(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <div className="small faint" style={{ marginTop: 6 }}>
                    PNG or JPG, up to 2 MB. Shown in the sidebar for your whole team.
                  </div>
                </div>
              </div>
              <div className="form-grid" style={{ marginTop: 16 }}>
                <div className="full">
                  <label>Company short name</label>
                  <input value={form.shortName} onChange={(e) => set("shortName", e.target.value)} placeholder="e.g. Hashim Bina" />
                  <div className="small faint" style={{ marginTop: 5 }}>
                    Used in the sidebar, dashboard and report letterheads.
                  </div>
                </div>
              </div>
              <div className="small mut" style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                Sidebar preview
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  background: "var(--ink2)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 8,
                }}
              >
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoUrl} className="brand-logo" alt="" />
                ) : (
                  <div className="brand-mark">{(form.name || "B").trim()[0]?.toUpperCase()}</div>
                )}
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontFamily: "var(--font-disp)", textTransform: "uppercase", letterSpacing: ".05em", fontSize: 15.5 }}>
                    {form.shortName || form.name || "Your Company"}
                  </b>
                  <div className="powered">
                    Powered by Bina<span>Works</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`card cs-bar${dirty ? " dirty" : ""}`}>
            <div className="card-b" style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
              {dirty ? (
                <span style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="btn btn-amber" disabled={saving} onClick={save}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button className="btn" disabled={saving} onClick={cancel}>
                    Cancel
                  </button>
                  <span className="small" style={{ color: "var(--amber-deep)", fontWeight: 700 }}>
                    ● Unsaved changes
                  </span>
                </span>
              ) : (
                <span className="small faint">All changes saved</span>
              )}
              <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={restoreDefaults}>
                Restore Defaults
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
