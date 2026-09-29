"use client";

import { useActionState } from "react";
import { Printer, Sparkles } from "lucide-react";
import { btnSecondary } from "@/components/ui";
import type { SummaryState } from "./actions";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className={`${btnSecondary} print:hidden`}><Printer className="size-4" aria-hidden /> Imprimir / PDF</button>;
}

export function AiSummary({ action }: { action: () => Promise<SummaryState> }) {
  const [state, run, pending] = useActionState(action, { status: "idle" } as SummaryState);
  return (
    <div>
      {state.status === "ok" ? (
        <div className="whitespace-pre-line text-body">{state.text}</div>
      ) : (
        <form action={run} className="print:hidden">
          <button disabled={pending} className={btnSecondary}><Sparkles className="size-4" aria-hidden /> {pending ? "Escrevendo…" : "Escrever resumo com IA"}</button>
          {state.status === "error" && <p role="alert" className="mt-2 text-body text-ink-muted">{state.message}</p>}
        </form>
      )}
    </div>
  );
}
