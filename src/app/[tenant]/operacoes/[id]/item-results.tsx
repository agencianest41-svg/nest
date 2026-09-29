import { Award, BarChart3, Trash2 } from "lucide-react";
import { formatDay } from "@/lib/month";
import { formatInt, formatPct } from "@/lib/format";
import { CHANNEL, engagementOf, totals, type ResultEntry } from "@/lib/results";
import type { PlanItem } from "@/lib/types";
import { ResultForm } from "@/components/result-form";
import { btnGhost } from "@/components/ui";

// Resultado da peça: registros por canal e atalho para virar case da Biblioteca.
export function ItemResults({ item, results, isManager, add, remove, promote }: {
  item: PlanItem;
  results: ResultEntry[];
  isManager: boolean;
  add: (fd: FormData) => Promise<void>;
  remove: (id: string) => () => Promise<void>;
  promote: () => Promise<void>;
}) {
  if (item.status !== "publicado" && results.length === 0) return null;
  const t = totals(results);
  return (
    <div className="border-t border-line bg-canvas px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="label flex items-center gap-1 text-ink-muted"><BarChart3 className="size-3.5" aria-hidden /> Resultado</p>
        {results.length > 0 && (
          <span className="text-caption text-ink-muted tabular">
            {formatInt(t.reach)} alcance · {formatPct(t.engagement)} engajamento · {formatInt(t.leads)} leads · {formatInt(t.sales)} vendas
          </span>
        )}
        {isManager && results.length > 0 && (
          <form action={promote} className="ml-auto"><button className={btnGhost}><Award className="size-4" aria-hidden /> Virar case</button></form>
        )}
      </div>
      {results.length > 0 && (
        <ul className="mt-2 space-y-1 text-caption">
          {results.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className="w-14 tabular text-ink-subtle">{formatDay(r.measured_on)}</span>
              <span className="w-20 font-semibold">{CHANNEL[r.channel]}</span>
              <span className="flex-1 text-ink-muted tabular">{formatInt(r.reach)} alcance · {formatPct(engagementOf(r))} · {formatInt(r.leads)} leads</span>
              <form action={remove(r.id)}><button className={btnGhost} aria-label="Remover resultado"><Trash2 className="size-3.5" /></button></form>
            </li>
          ))}
        </ul>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-caption font-semibold text-brand">Registrar resultado</summary>
        <div className="mt-2"><ResultForm action={add} compact /></div>
      </details>
    </div>
  );
}
