"use client";

import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import Modal from "@/components/app/Modal";

type CostReport = {
  projectName: string;
  contractValue: number;
  progressPct: number;
  plannedPct: number;
  earnedValue: number;
  laborCost: number;
  delivered: number;
  committed: number;
  workers: { name: string; trade: string | null; dailyRate: number | null; daysWorked: number; wages: number }[];
};

function csvEscape(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export default function CostReportButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<CostReport | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setOpen(true);
    setError("");
    try {
      const data = await apiFetch<CostReport>(`/api/projects/${projectId}/cost-report`);
      setReport(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load cost report.");
    }
  }

  function exportCSV() {
    if (!report) return;
    let csv = `BinaWorks Cost Report\nProject,${csvEscape(report.projectName)}\nGenerated,${new Date().toLocaleString()}\n\n`;
    csv += `Item,Amount (RM)\nContract value,${report.contractValue}\nEarned value,${report.earnedValue}\nLabour cost to date,${report.laborCost}\n\n`;
    csv += "Worker,Trade,Rate,Days,Wages (RM)\n";
    for (const w of report.workers) {
      csv += `${csvEscape(w.name)},${csvEscape(w.trade || "")},${w.dailyRate ?? 0},${w.daysWorked},${w.wages}\n`;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `cost-report-${report.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <button className="btn btn-sm" type="button" onClick={load}>
        Cost Report
      </button>
      {open && (
        <Modal
          title={report ? `Cost Report — ${report.projectName}` : "Cost Report"}
          onClose={() => {
            setOpen(false);
            setReport(null);
          }}
          footer={
            <>
              <button className="btn" disabled={!report} onClick={exportCSV}>
                ⬇ Download CSV
              </button>
              <button
                className="btn btn-amber"
                onClick={() => {
                  setOpen(false);
                  setReport(null);
                }}
              >
                Close
              </button>
            </>
          }
        >
          {error && <div className="auth-err">{error}</div>}
          {!report && !error ? (
            <p className="mut small">Loading…</p>
          ) : report ? (
            <>
              <table style={{ width: "100%" }}>
                <tbody>
                  <tr>
                    <td>Contract value</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      <b>{formatCurrency(report.contractValue)}</b>
                    </td>
                  </tr>
                  <tr>
                    <td>Physical progress</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {report.progressPct}% <span className="faint">(plan {report.plannedPct}%)</span>
                    </td>
                  </tr>
                  <tr>
                    <td>Earned value (progress × contract)</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatCurrency(report.earnedValue)}
                    </td>
                  </tr>
                  <tr>
                    <td>Labour cost to date (attendance × daily rates)</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatCurrency(report.laborCost)}
                    </td>
                  </tr>
                  <tr>
                    <td>Material lines delivered</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {report.delivered}
                    </td>
                  </tr>
                  <tr>
                    <td>Open commitments (approved / ordered)</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {report.committed}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="small faint" style={{ marginTop: 10 }}>
                Generated {new Date().toLocaleString()} · figures from attendance and material request data.
              </div>
            </>
          ) : null}
        </Modal>
      )}
    </>
  );
}
