"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";
import { Field } from "@/components/field";
import { btnGhost, btnPrimary, input, textarea } from "@/components/ui";
import type { Brief } from "@/lib/partners";
import type { BriefDraftState } from "./actions";

type Props = {
  save: (fd: FormData) => Promise<void>;
  draft: (prev: BriefDraftState, fd: FormData) => Promise<BriefDraftState>;
  brief?: Brief;
  taskId?: string;
  defaultTitle?: string;
  submitLabel: string;
};

const FIELDS = [
  { key: "objective", label: "Objetivo", rows: 2 },
  { key: "deliverables", label: "Entregáveis (formatos e quantidades)", rows: 3 },
  { key: "references_text", label: "Referências e orientações da marca", rows: 3 },
  { key: "avoid", label: "O que evitar", rows: 2 },
  { key: "acceptance", label: "Critérios de aprovação", rows: 2 },
] as const;
type Key = (typeof FIELDS)[number]["key"];

// Brief para parceiro. A IA só preenche os campos; nada é salvo sem revisão.
export function BriefForm({ save, draft, brief, taskId, defaultTitle, submitLabel }: Props) {
  const [values, setValues] = useState<Record<Key, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, (brief?.[f.key] as string | null) ?? ""])) as Record<Key, string>);
  // Tudo controlado: o React limpa campos não controlados depois de cada ação.
  const [title, setTitle] = useState(brief?.title ?? defaultTitle ?? "");
  const [budget, setBudget] = useState(brief?.budget != null ? String(brief.budget) : "");
  const [due, setDue] = useState(brief?.due_on ?? "");
  const [visibility, setVisibility] = useState<string>(brief?.visibility ?? "bancada");
  const [state, run, pending] = useActionState(draft, { status: "idle" } as BriefDraftState);
  const [applied, setApplied] = useState(state);
  if (state !== applied) {
    setApplied(state);
    if (state.status === "ok") setValues({ objective: state.objective, deliverables: state.deliverables, references_text: state.references_text, avoid: state.avoid, acceptance: state.acceptance });
  }

  return (
    <form action={save} className="space-y-3">
      {taskId && <input type="hidden" name="task_id" value={taskId} />}
      <Field label="Trabalho"><input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} className={input} placeholder="Ex.: 4 Reels de Black Friday para lojas do Sul" /></Field>
      {FIELDS.map((f) => (
        <Field key={f.key} label={f.label}>
          <textarea name={f.key} rows={f.rows} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className={textarea} />
        </Field>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Orçamento (R$)"><input name="budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className={input} /></Field>
        <Field label="Prazo"><input type="date" name="due_on" value={due} onChange={(e) => setDue(e.target.value)} className={input} /></Field>
      </div>
      <Field label="Quem vê">
        <select name="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value)} className={input}>
          <option value="bancada">Toda a bancada verificada</option>
          <option value="convidados">Só parceiros convidados</option>
        </select>
      </Field>
      {state.status === "error" && <p role="alert" className="text-body text-danger">{state.message}</p>}
      {state.status === "ok" && <p role="status" className="text-body text-info">Rascunho da IA nos campos. Revise e salve.</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <button formAction={run} disabled={pending} className={btnGhost}><Sparkles className="size-4" aria-hidden /> {pending ? "Escrevendo…" : "Escrever brief com IA"}</button>
        <button className={btnPrimary}>{submitLabel}</button>
      </div>
    </form>
  );
}
