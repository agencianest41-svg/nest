"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { btnSecondary } from "@/components/ui";
import type { InsightState } from "./actions";

export function InsightsPanel({ action }: { action: () => Promise<InsightState> }) {
  const [state, run, pending] = useActionState(action, { status: "idle" } as InsightState);
  return (
    <div>
      <form action={run}>
        <button disabled={pending} className={btnSecondary}><Sparkles className="size-4" aria-hidden /> {pending ? "Lendo o mês…" : "Leitura do mês com IA"}</button>
      </form>
      {state.status === "error" && <p role="alert" className="mt-2 text-body text-ink-muted">{state.message}</p>}
      {state.status === "ok" && (
        <div role="status" className="mt-3 space-y-3 text-body">
          <ul className="space-y-2">
            {state.patterns.map((p, i) => <li key={i}><span className="font-semibold">{p.finding}</span> <span className="text-ink-muted">— {p.evidence}</span></li>)}
          </ul>
          {state.adjustments.length > 0 && (
            <div><p className="label text-ink-muted">Ajustes para o próximo plano</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">{state.adjustments.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
          )}
        </div>
      )}
    </div>
  );
}
