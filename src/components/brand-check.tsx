import { AlertTriangle, Ban, CheckCircle2, Sparkles } from "lucide-react";
import type { BrandCheckState } from "@/app/[tenant]/marca/check-action";

const KIND: Record<string, string> = {
  termo_proibido: "Termo proibido",
  termo_obrigatorio: "Falta termo obrigatório",
  regulatorio: "Regulatório",
  estilo: "Estilo",
};

// Resultado do guardião de marca; pode aplicar a reescrita da IA.
export function BrandCheckResult({ state, onApply }: { state: BrandCheckState; onApply?: (text: string) => void }) {
  if (state.status === "idle") return null;
  if (state.status === "error") return <p role="alert" className="text-body text-danger">{state.message}</p>;
  const blocking = state.issues.filter((i) => i.severity === "bloqueia");
  return (
    <div role="status" className="space-y-2 rounded-sm border border-line bg-surface p-3">
      {state.issues.length === 0 ? (
        <p className="flex items-center gap-1 text-body font-semibold text-success"><CheckCircle2 className="size-4" aria-hidden /> Nenhuma regra da marca violada.</p>
      ) : (
        <ul className="space-y-1">
          {state.issues.map((i, n) => (
            <li key={n} className={`flex items-start gap-2 text-body ${i.severity === "bloqueia" ? "text-danger" : "text-warning"}`}>
              {i.severity === "bloqueia" ? <Ban className="mt-0.5 size-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <span><span className="font-semibold">{KIND[i.kind] ?? i.kind}{i.term ? ` “${i.term}”` : ""}:</span> <span className="text-ink-muted">{i.guidance}</span></span>
            </li>
          ))}
        </ul>
      )}
      {blocking.length > 0 && <p className="text-caption text-danger">Com termo que bloqueia, a peça não segue para aprovação.</p>}
      {state.aiMessage && <p className="text-caption text-ink-subtle">{state.aiMessage}</p>}
      {state.ai && (
        <div className="border-t border-line pt-2">
          <p className="flex items-center gap-1 text-body font-semibold"><Sparkles className="size-4 text-brand" aria-hidden /> Aderência à marca: <span className="tabular">{Math.round(state.ai.score)}/100</span></p>
          {state.ai.problems.length > 0 && (
            <ul className="mt-1 space-y-1 text-body">
              {state.ai.problems.map((p, n) => (
                <li key={n}><span className="font-semibold">“{p.excerpt}”</span> <span className="text-ink-muted">— {p.why} Sugestão: {p.fix}</span></li>
              ))}
            </ul>
          )}
          {state.ai.rewrite && (
            <details className="mt-1">
              <summary className="cursor-pointer text-caption font-semibold text-brand">Ver versão revisada</summary>
              <p className="mt-1 whitespace-pre-line text-body">{state.ai.rewrite}</p>
              {onApply && <button type="button" onClick={() => onApply(state.ai!.rewrite)} className="mt-1 text-caption font-semibold text-brand underline">Usar no roteiro</button>}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
