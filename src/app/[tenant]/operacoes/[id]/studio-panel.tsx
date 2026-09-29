"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { formatDay } from "@/lib/month";
import { ITEM_FORMAT } from "@/lib/labels";
import { btnPrimary, btnSecondary, card } from "@/components/ui";
import type { SuggestState } from "./studio-actions";

type Props = { action: (prev: SuggestState, formData: FormData) => Promise<SuggestState> };

export function StudioPanel({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as SuggestState);

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span aria-hidden className="grid size-8 place-items-center rounded-sm bg-brand-soft text-ink-muted">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-heading font-semibold">Estúdio</h2>
          <p className="text-caption text-ink-subtle">Pautas para esta loja a partir do calendário, das editorias, do pacote e da voz da marca.</p>
        </div>
        <form action={formAction}>
          <button disabled={pending} className={btnSecondary}>
            <Sparkles className="size-4" aria-hidden />
            {pending ? "Pensando…" : state.status === "ok" ? "Sugerir outras" : "Sugerir pautas"}
          </button>
        </form>
      </div>

      {state.status === "error" && (
        <p role="alert" className="border-t border-line px-4 py-3 text-body text-danger">{state.message}</p>
      )}
      {state.status === "added" && (
        <p role="status" className="border-t border-line px-4 py-3 text-body text-success">
          {state.count} {state.count === 1 ? "pauta adicionada" : "pautas adicionadas"} ao calendário.
        </p>
      )}

      {state.status === "ok" && (
        <form action={formAction} className="border-t border-line">
          <input type="hidden" name="intent" value="add" />
          <ul>
            {state.ideas.map((idea, i) => (
              <li key={i} className="border-b border-line last:border-0">
                <label className="flex cursor-pointer gap-3 px-4 py-3 hover:bg-brand-soft">
                  <input type="checkbox" name="idea" value={JSON.stringify(idea)} defaultChecked className="mt-1 size-4 accent-[var(--brand)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{idea.title}</span>
                    <span className="block text-caption text-ink-subtle">
                      {formatDay(idea.scheduled_on)} · {ITEM_FORMAT[idea.format]}{idea.editoria && ` · ${idea.editoria}`}{idea.event_title && ` · ${idea.event_title}`}
                    </span>
                    {idea.idea && <span className="mt-1 block text-body">{idea.idea}</span>}
                    <span className="mt-1 block text-body text-ink-muted">Por quê: {idea.why}</span>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-caption font-semibold text-brand">Ver roteiro e legenda</summary>
                      {idea.hook && <p className="mt-2 text-body"><b>Gancho:</b> {idea.hook}</p>}
                      <p className="mt-2 whitespace-pre-line text-body">{idea.script}</p>
                      {idea.caption && <p className="mt-2 whitespace-pre-line text-body text-ink-muted">{idea.caption}</p>}
                    </details>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end px-4 py-3">
            <button disabled={pending} className={btnPrimary}>Adicionar ao calendário</button>
          </div>
        </form>
      )}
    </section>
  );
}
