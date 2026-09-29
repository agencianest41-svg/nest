"use client";

import { useActionState } from "react";
import { FileUp } from "lucide-react";
import { btnSecondary } from "@/components/ui";
import type { ImportState } from "./actions";

export function ImportForm({ action }: { action: (prev: ImportState, fd: FormData) => Promise<ImportState> }) {
  const [state, run, pending] = useActionState(action, { status: "idle" } as ImportState);
  return (
    <form action={run} className="space-y-2">
      <label className="block">
        <span className="sr-only">Planilha CSV</span>
        <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-body file:mr-3 file:rounded-sm file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:font-semibold" />
      </label>
      <button disabled={pending} className={`${btnSecondary} w-full`}><FileUp className="size-4" aria-hidden /> {pending ? "Importando…" : "Importar"}</button>
      {state.status === "error" && <p role="alert" className="text-body text-danger">{state.message}</p>}
      {state.status === "ok" && (
        <div role="status" className="text-body text-success">
          {state.message}
          {state.skipped.length > 0 && <ul className="mt-1 text-caption text-warning">{state.skipped.slice(0, 5).map((s) => <li key={s}>{s}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}
