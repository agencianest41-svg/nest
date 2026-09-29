import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftMonth, type Month } from "@/lib/month";

export function MonthPicker({ month, basePath }: { month: Month; basePath: string }) {
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const btn = "grid size-8 place-items-center rounded-sm text-ink-muted transition-colors hover:bg-brand-soft hover:text-ink";
  return (
    <div className="inline-flex items-center gap-1 rounded-sm border border-line bg-surface p-0.5 shadow-xs">
      <Link href={`${basePath}?mes=${prev.key}`} className={btn} aria-label={`Mês anterior: ${prev.label}`}>
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-32 text-center text-body font-medium">{month.label}</span>
      <Link href={`${basePath}?mes=${next.key}`} className={btn} aria-label={`Próximo mês: ${next.label}`}>
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}
