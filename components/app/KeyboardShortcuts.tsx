"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/app/Modal";

const GO_MAP: Record<string, string> = {
  d: "/dashboard",
  p: "/projects",
  r: "/reports",
  a: "/attendance",
  m: "/materials",
  c: "/calendar",
  t: "/team",
  s: "/settings",
  h: "/help",
};

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="sc-row">
      <span>{label}</span>
      <span className="sc-keys">
        {keys.map((k, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span className="faint" style={{ fontSize: 11 }}>then</span>}
            <kbd>{k}</kbd>
          </span>
        ))}
      </span>
    </div>
  );
}

export default function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seq = "";
    let seqTimer: ReturnType<typeof setTimeout> | null = null;

    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (/INPUT|TEXTAREA|SELECT/.test(tag || "")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector(".overlay")) return;

      const k = e.key.toLowerCase();
      if (seq === "g") {
        seq = "";
        if (seqTimer) clearTimeout(seqTimer);
        const path = GO_MAP[k];
        if (path) {
          e.preventDefault();
          router.push(path);
        }
        return;
      }
      if (k === "g") {
        seq = "g";
        if (seqTimer) clearTimeout(seqTimer);
        seqTimer = setTimeout(() => (seq = ""), 1200);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  if (!open) return null;

  return (
    <Modal title="⌨ Keyboard Shortcuts" onClose={() => setOpen(false)} footer={<button className="btn btn-amber" onClick={() => setOpen(false)}>Close</button>}>
      <div className="two-col" style={{ gap: 20 }}>
        <div>
          <label>Global</label>
          <div className="sc-row">
            <span>Search</span>
            <span className="sc-keys">
              <kbd>Ctrl</kbd>
              <kbd>K</kbd>
            </span>
          </div>
          <Row keys={["?"]} label="This dialog" />
          <Row keys={["Esc"]} label="Close dialogs and panels" />
        </div>
        <div>
          <label>
            Go to… (press <kbd style={{ fontSize: 10 }}>G</kbd> first)
          </label>
          <Row keys={["G", "D"]} label="Dashboard" />
          <Row keys={["G", "P"]} label="Projects" />
          <Row keys={["G", "R"]} label="Daily Reports" />
          <Row keys={["G", "A"]} label="Attendance" />
          <Row keys={["G", "M"]} label="Material Requests" />
          <Row keys={["G", "C"]} label="Calendar" />
          <Row keys={["G", "T"]} label="Team" />
          <Row keys={["G", "S"]} label="Company Settings" />
          <Row keys={["G", "H"]} label="Help Center" />
        </div>
      </div>
      <p className="small faint" style={{ marginTop: 14 }}>
        Shortcuts pause while you&rsquo;re typing in a field.
      </p>
    </Modal>
  );
}
