import { STATUS_LABELS, type Status } from "@/lib/domain";

// Colour plus a text label (and a dot), so status never relies on colour alone.
const STYLES: Record<Status, string> = {
  open: "bg-blue-50 text-blue-800 ring-blue-200",
  in_review: "bg-amber-50 text-amber-800 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejected: "bg-red-50 text-red-800 ring-red-200",
  completed: "bg-slate-100 text-slate-700 ring-slate-300",
};

const DOTS: Record<Status, string> = {
  open: "bg-blue-500",
  in_review: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  completed: "bg-slate-500",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[status]}`} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}
