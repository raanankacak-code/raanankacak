"use client";

/**
 * A print button, which has to be a client component because `window.print`
 * is the only way to trigger it — and the record page it sits on is otherwise
 * entirely server-rendered, which is worth keeping.
 */
export default function PrintButton() {
  return (
    <button className="btn btn-amber" onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}
