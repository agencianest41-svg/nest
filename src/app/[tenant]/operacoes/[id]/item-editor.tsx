"use client";

import { useActionState, useState } from "react";
import { ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { FUNNEL_STAGE, ITEM_STATUS } from "@/lib/labels";
import type { Editoria, ItemStatus, PlanItem } from "@/lib/types";
import { Field } from "@/components/field";
import { btnGhost, btnSecondary, input, textarea } from "@/components/ui";
import type { DraftState } from "./studio-actions";
import type { BrandCheckState } from "../../marca/check-action";
import { BrandCheckResult } from "@/components/brand-check";

export type Option = { id: string; label: string };

type Props = {
  item: PlanItem;
  statusOptions: ItemStatus[];
  editorias: Editoria[];
  kits: Option[];
  practices: Option[];
  isManager: boolean;
  save: (formData: FormData) => Promise<void>;
  remove: () => Promise<void>;
  draft: (prev: DraftState) => Promise<DraftState>;
  check: (prev: BrandCheckState, formData: FormData) => Promise<BrandCheckState>;
};

// Formulário da peça. "Escrever com IA" só preenche os campos: nada é salvo
// sem a pessoa revisar e clicar em Salvar.
export function ItemEditor({ item, statusOptions, editorias, kits, practices, isManager, save, remove, draft, check }: Props) {
  // Pauta da Hub/rede: o cérebro (por quê, editoria, funil) é travado para a loja.
  const brainLocked = !isManager && (item.origin === "hub" || item.origin === "base");
  // Campos controlados: "Escrever com IA" e "Checar marca" não apagam edições não salvas.
  const [title, setTitle] = useState(item.title);
  const [status, setStatus] = useState<ItemStatus>(item.status);
  const [date, setDate] = useState(item.scheduled_on ?? "");
  const [script, setScript] = useState(item.script ?? "");
  const [caption, setCaption] = useState(item.caption ?? "");
  const [state, runDraft, drafting] = useActionState(draft, { status: "idle" } as DraftState);
  const [checkState, runCheck, checking] = useActionState(check, { status: "idle" } as BrandCheckState);

  // Aplica cada rascunho novo uma única vez, durante o render.
  const [applied, setApplied] = useState<DraftState>(state);
  if (state !== applied) {
    setApplied(state);
    if (state.status === "ok") {
      setScript(state.script);
      setCaption(state.caption);
    }
  }

  return (
    <form action={save} className="grid gap-3 border-t border-line bg-canvas p-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Título"><input name="title" value={title} onChange={(e) => setTitle(e.target.value)} className={input} /></Field></div>
      <Field label="Status">
        <select name="status" value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)} className={input}>
          {statusOptions.map((s) => <option key={s} value={s}>{ITEM_STATUS[s].label}</option>)}
        </select>
      </Field>
      <Field label="Data"><input type="date" name="scheduled_on" value={date} onChange={(e) => setDate(e.target.value)} className={input} /></Field>
      <Field label="Editoria">
        <select name="editoria_id" defaultValue={item.editoria_id ?? ""} disabled={brainLocked} className={input}>
          <option value="">—</option>
          {editorias.filter((e) => e.active || e.id === item.editoria_id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Field>
      <Field label="Estágio do funil">
        <select name="funnel" defaultValue={item.funnel ?? ""} disabled={brainLocked} className={input}>
          <option value="">—</option>
          {Object.entries(FUNNEL_STAGE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="A ideia (o que mostrar)">
        <textarea name="idea" rows={3} defaultValue={item.idea ?? ""} className={textarea} />
      </Field>
      <Field label="Por que postar">
        <textarea name="rationale" rows={3} defaultValue={item.rationale ?? ""} disabled={brainLocked} className={textarea} placeholder="Justificativa estratégica: por que isto, agora, nesta loja." />
      </Field>
      <div className="sm:col-span-2"><Field label="Gancho (primeiros segundos)"><input name="hook" defaultValue={item.hook ?? ""} className={input} /></Field></div>
      <Field label="Roteiro">
        <textarea name="script" rows={7} value={script} onChange={(e) => setScript(e.target.value)} className={textarea} placeholder="Gancho, desenvolvimento, chamada. 15 segundos." />
      </Field>
      <Field label="Legenda">
        <textarea name="caption" rows={7} value={caption} onChange={(e) => setCaption(e.target.value)} className={textarea} />
      </Field>
      <Field label="Kit de ativos">
        <select name="kit_id" defaultValue={item.kit_id ?? ""} className={input}>
          <option value="">—</option>
          {kits.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </Field>
      <Field label="Case de referência">
        <select name="practice_id" defaultValue={item.practice_id ?? ""} className={input}>
          <option value="">—</option>
          {practices.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </Field>
      <Field label="Link do post publicado">
        <input name="published_url" type="url" defaultValue={item.published_url ?? ""} className={input} placeholder="https://instagram.com/p/…" />
      </Field>
      {isManager ? (
        <label className="flex items-center gap-2 self-end pb-2.5 text-body">
          <input type="hidden" name="sensitive_field" value="1" />
          <input type="checkbox" name="sensitive" defaultChecked={item.sensitive} className="size-4 accent-[var(--brand)]" />
          Pauta sensível (preço, promoção, regulatório): sempre passa por revisão
        </label>
      ) : <span />}
      {brainLocked && <p className="text-caption text-ink-subtle sm:col-span-2">Editoria, funil e o porquê vêm da Hub e não mudam por aqui. Use a conversa para sugerir ajustes.</p>}
      <div className="sm:col-span-2"><BrandCheckResult state={checkState} onApply={setScript} /></div>
      {state.status === "error" && <p role="alert" className="text-body text-danger sm:col-span-2">{state.message}</p>}
      {state.status === "ok" && (
        <p role="status" className="text-body text-info sm:col-span-2">Rascunho da IA nos campos acima. Revise e salve.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
        <div className="flex flex-wrap gap-1">
          <button formAction={remove} className={`${btnGhost} text-danger`}>
            <Trash2 className="size-4" aria-hidden /> Remover
          </button>
          <button formAction={runDraft} disabled={drafting} className={btnGhost}>
            <Sparkles className="size-4" aria-hidden /> {drafting ? "Escrevendo…" : "Escrever com IA"}
          </button>
          <button formAction={runCheck} disabled={checking} className={btnGhost}>
            <ShieldCheck className="size-4" aria-hidden /> {checking ? "Checando…" : "Checar marca"}
          </button>
          <button formAction={(fd) => { fd.set("use_ai", "1"); runCheck(fd); }} disabled={checking} className={btnGhost}>
            <Sparkles className="size-4" aria-hidden /> Revisar com IA
          </button>
        </div>
        <button className={btnSecondary}>Salvar pauta</button>
      </div>
    </form>
  );
}
