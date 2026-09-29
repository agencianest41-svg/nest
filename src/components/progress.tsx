// Barra de progresso com o número ao lado; nunca só cor.
export function Progress({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-brand-soft" role="progressbar"
        aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progresso"}>
        <span className="block h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-caption text-ink-subtle tabular">{done}/{total}</span>
    </span>
  );
}
