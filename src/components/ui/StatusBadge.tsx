// Section 2/29: link status, review status, and invoice payment status are
// three distinct axes — never collapsed into one badge — and color is never
// the only signal (each badge always carries text, and the icon differs by
// semantic meaning, not just color).

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-blue-50 text-primary",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
};

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

export function LinkStatusBadge({ status }: { status: "UNLINKED" | "LINKED_TO_CLIENT" | "LINKED_TO_MATTER" }) {
  const map: Record<typeof status, { tone: Tone; label: string }> = {
    UNLINKED: { tone: "neutral", label: "Unlinked" },
    LINKED_TO_CLIENT: { tone: "info", label: "Linked · Client" },
    LINKED_TO_MATTER: { tone: "info", label: "Linked · Matter" },
  };
  const { tone, label } = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ReviewStatusBadge({ status }: { status: "NORMAL" | "WARNING" | "REVIEW_REQUIRED" }) {
  if (status === "NORMAL") return null; // Principle 5: normal is not called out — nothing to see is the default
  const map = {
    WARNING: { tone: "warning" as Tone, label: "Warning" },
    REVIEW_REQUIRED: { tone: "danger" as Tone, label: "Review Required" },
  };
  const { tone, label } = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID" }) {
  const map: Record<typeof status, { tone: Tone; label: string }> = {
    UNPAID: { tone: "neutral", label: "Unpaid" },
    PARTIALLY_PAID: { tone: "warning", label: "Partially Paid" },
    PAID: { tone: "success", label: "Paid" },
    OVERPAID: { tone: "danger", label: "Overpaid" },
  };
  const { tone, label } = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function GenericStatusBadge({ status }: { status: string }) {
  const tone: Tone = ["ACTIVE", "ISSUED"].includes(status) ? "success" : ["VOID", "VOIDED", "CANCELLED", "INACTIVE", "CLOSED"].includes(status) ? "neutral" : "info";
  return <Badge tone={tone}>{status}</Badge>;
}
