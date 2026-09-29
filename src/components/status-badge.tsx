import type { Tone } from "@/lib/labels";

const TONE: Record<Tone, string> = {
  neutral: "bg-brand-soft text-ink-muted",
  info: "bg-info/8 text-info",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  danger: "bg-danger/8 text-danger",
  brand: "bg-ink text-surface",
};

// Status em pílula suave: ponto + palavra (nunca só cor).
export function StatusBadge({ label, tone }: { label: string; tone: Tone; icon?: "calendar" }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium whitespace-nowrap ${TONE[tone]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}
