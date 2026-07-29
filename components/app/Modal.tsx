"use client";

import { useEffect, useRef } from "react";

/** Everything that can hold focus, minus anything explicitly taken out of the order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";

    // Remember where focus came from. Without this, closing a dialog drops
    // focus back to the top of the document and a keyboard user has to tab
    // all the way down to where they were — every single time.
    const opener = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    // Prefer the first control in the *body*, not simply the first focusable
    // element — that is the ✕ in the header, so opening a form dialog would
    // land on Close and an immediate Enter would discard the form instead of
    // filling it in. Falls back to the header, then the dialog itself, for a
    // dialog whose body is only text.
    const body = dialog?.querySelector<HTMLElement>(".modal-b");
    const first = body?.querySelector<HTMLElement>(FOCUSABLE) ?? dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;

      // Trap. aria-modal tells a screen reader the rest of the page is inert,
      // but it does nothing for the Tab key — without this, tabbing past the
      // last control lands on the page behind the overlay, where clicks do
      // not work because the overlay is over it. Focus simply disappears.
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === firstItem || !dialogRef.current.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      // Only restore if the opener is still in the document — the button that
      // opened the dialog is sometimes the row the dialog just deleted.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={dialogRef} tabIndex={-1}>
        <div className="modal-h">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}
