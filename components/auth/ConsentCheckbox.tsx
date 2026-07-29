import Link from "next/link";
import { LEGAL_VERSION } from "@/lib/legal";

/**
 * The consent row shown on both signup forms.
 *
 * The links open in a new tab deliberately: sending someone away from a
 * half-filled signup form to read the terms, and losing what they typed, is
 * how you train people not to read the terms.
 */
export default function ConsentCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="consent" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        I have read and accept the{" "}
        <Link href="/terms" target="_blank" rel="noopener">
          terms of service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" rel="noopener">
          privacy notice
        </Link>{" "}
        <span className="mono faint">(v{LEGAL_VERSION})</span>.
      </span>
    </label>
  );
}
