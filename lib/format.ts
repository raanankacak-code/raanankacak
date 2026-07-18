type Numeric = number | string | { toString(): string } | null | undefined;

export function formatCurrency(value: Numeric, currency = "MYR") {
  const n = value == null ? 0 : typeof value === "number" ? value : parseFloat(value.toString());
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function statusBadgeClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "b-ok";
    case "PLANNING":
      return "b-info";
    case "ON_HOLD":
      return "b-amber";
    case "COMPLETED":
      return "b-mut";
    case "SUBMITTED":
      return "b-amber";
    case "REVIEWED":
      return "b-ok";
    case "PRESENT":
      return "b-ok";
    case "HALF_DAY":
      return "b-amber";
    case "ABSENT":
      return "b-bad";
    case "PENDING":
    case "DRAFT":
      return "b-mut";
    case "ACCEPTED":
    case "APPROVED":
    case "DELIVERED":
    case "SCHEDULED":
      return "b-ok";
    case "REJECTED":
    case "CANCELLED":
    case "EXPIRED":
      return "b-bad";
    case "ORDERED":
      return "b-info";
    default:
      return "b-mut";
  }
}

export function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}
