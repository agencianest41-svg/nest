import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Copy, Lock, Play, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatMinutes } from "@/lib/format";
import { PLAYBOOK_CATEGORY, ROLE_LABEL } from "@/lib/labels";
import type { MemberRole, Playbook, PlaybookStep } from "@/lib/types";
import { Field } from "@/components/field";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import { customizePlaybook, deletePlaybook, deleteStep, saveStep, updatePlaybook } from "../actions";

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ erro?: string }> };

const ERRORS: Record<string, string> = { dados: "Confira os campos da etapa.", salvar: "Não foi possível salvar." };
const ROLES = Object.keys(ROLE_LABEL) as MemberRole[];

export default async function PlaybookPage({ params, searchParams }: Props) {
  const [{ tenant, id }, { erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const supabase = await createClient();
  const [{ data: pb }, { data: steps }] = await Promise.all([
    supabase.from("playbooks").select("id, tenant_id, name, category, description, active").eq("id", id).maybeSingle(),
    supabase.from("playbook_steps").select("*").eq("playbook_id", id).order("position"),
  ]);
  if (!pb || (pb.tenant_id && pb.tenant_id !== ctx.tenant.id)) notFound();
  const playbook = pb as Playbook;
  const list = (steps ?? []) as PlaybookStep[];
  const editable = playbook.tenant_id ? ctx.isManager : ctx.isPlatformAdmin;
  const totalMinutes = list.reduce((s, x) => s + x.estimate_minutes, 0);
  const nextPos = (list.at(-1)?.position ?? 0) + 1;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/${tenant}/playbooks`} className={`${btnGhost} -ml-2`}><ArrowLeft className="size-4" aria-hidden /> Playbooks</Link>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-subtle">
            {playbook.tenant_id ? `Playbook ${ctx.tenant.name}` : "Modelo NEST"} · {PLAYBOOK_CATEGORY[playbook.category] ?? playbook.category}
          </p>
          <h1 className="font-display text-page">{playbook.name}</h1>
          {playbook.description && <p className="mt-1 max-w-2xl text-body text-ink-muted">{playbook.description}</p>}
          <p className="mt-1 text-caption text-ink-subtle">
            {list.length} etapas · {list.filter((s) => s.approver_role).length} aprovações · {formatMinutes(totalMinutes)} de trabalho estimado
          </p>
        </div>
        <div className="flex gap-2">
          {!playbook.tenant_id && ctx.isManager && (
            <form action={customizePlaybook.bind(null, tenant, id)}>
              <button className={btnSecondary}><Copy className="size-4" aria-hidden /> Personalizar</button>
            </form>
          )}
          {ctx.isManager && playbook.active && (
            <Link href={`/${tenant}/projetos?playbook=${id}`} className={btnPrimary}><Play className="size-4" aria-hidden /> Iniciar projeto</Link>
          )}
        </div>
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <ol className="mt-6 space-y-3">
        {list.map((s) => (
          <li key={s.id} className={card}>
            {editable ? (
              <details>
                <summary className="cursor-pointer list-none"><StepSummary step={s} /></summary>
                <StepForm slug={tenant} playbookId={id} step={s} />
              </details>
            ) : <StepSummary step={s} />}
          </li>
        ))}
      </ol>

      {editable && (
        <>
          <details className={`${card} mt-3`}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-body font-semibold">
              <Plus className="size-4" aria-hidden /> Adicionar etapa
            </summary>
            <StepForm slug={tenant} playbookId={id} step={null} nextPosition={nextPos} />
          </details>

          {playbook.tenant_id && (
            <form action={updatePlaybook.bind(null, tenant, id)} className={`${card} mt-8 grid gap-3 p-4 sm:grid-cols-2`}>
              <h2 className="text-heading font-semibold sm:col-span-2">Dados do playbook</h2>
              <Field label="Nome"><input name="name" required defaultValue={playbook.name} className={input} /></Field>
              <Field label="Categoria">
                <select name="category" defaultValue={playbook.category} className={input}>
                  {Object.entries(PLAYBOOK_CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2"><Field label="Para que serve"><textarea name="description" rows={2} defaultValue={playbook.description ?? ""} className={textarea} /></Field></div>
              <label className="inline-flex items-center gap-2 text-body"><input type="checkbox" name="active" defaultChecked={playbook.active} className="size-4 accent-[var(--brand)]" /> Ativo (disponível para novos projetos)</label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button formAction={deletePlaybook.bind(null, tenant, id)} className={`${btnGhost} text-danger`}><Trash2 className="size-4" aria-hidden /> Excluir</button>
                <button className={btnSecondary}>Salvar</button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function StepSummary({ step: s }: { step: PlaybookStep }) {
  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-brand-soft text-caption font-semibold text-brand tabular">{s.position}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {s.title}
          {s.internal && <Lock className="ml-1 inline size-3.5 text-ink-subtle" aria-label="Interna" />}
        </p>
        {s.description && <p className="text-body text-ink-muted">{s.description}</p>}
        <p className="mt-1 text-caption text-ink-subtle">
          Executa: {ROLE_LABEL[s.owner_role]} · Dia {s.due_offset_days} · {formatMinutes(s.estimate_minutes)}
          {s.checklist.length > 0 && ` · checklist com ${s.checklist.length} itens`}
        </p>
      </div>
      {s.approver_role && (
        <span className="inline-flex items-center gap-1 text-caption font-semibold text-warning">
          <ShieldCheck className="size-3.5" aria-hidden /> Aprova: {ROLE_LABEL[s.approver_role]}
        </span>
      )}
    </div>
  );
}

function StepForm({ slug, playbookId, step, nextPosition }: { slug: string; playbookId: string; step: PlaybookStep | null; nextPosition?: number }) {
  return (
    <form action={saveStep.bind(null, slug, playbookId, step?.id ?? null)} className="grid gap-3 border-t border-line bg-canvas p-4 sm:grid-cols-4">
      <div className="sm:col-span-3"><Field label="Etapa"><input name="title" required defaultValue={step?.title} className={input} /></Field></div>
      <Field label="Ordem"><input type="number" name="position" required defaultValue={step?.position ?? nextPosition} className={input} /></Field>
      <div className="sm:col-span-4"><Field label="Descrição"><textarea name="description" rows={2} defaultValue={step?.description ?? ""} className={textarea} /></Field></div>
      <Field label="Quem executa">
        <select name="owner_role" defaultValue={step?.owner_role ?? "hub"} className={input}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </Field>
      <Field label="Quem aprova">
        <select name="approver_role" defaultValue={step?.approver_role ?? ""} className={input}>
          <option value="">Sem aprovação</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </Field>
      <Field label="Dia (a partir do início)"><input type="number" name="due_offset_days" required defaultValue={step?.due_offset_days ?? 0} className={input} /></Field>
      <Field label="Estimativa (min)"><input type="number" min={0} name="estimate_minutes" required defaultValue={step?.estimate_minutes ?? 60} className={input} /></Field>
      <div className="sm:col-span-4"><Field label="Checklist (um item por linha)"><textarea name="checklist" rows={3} defaultValue={step?.checklist.join("\n") ?? ""} className={textarea} /></Field></div>
      <label className="inline-flex items-center gap-2 text-body text-ink-muted sm:col-span-2">
        <input type="checkbox" name="internal" defaultChecked={step?.internal} className="size-4 accent-[var(--brand)]" /> Etapa interna (só Hub vê)
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {step && <button formAction={deleteStep.bind(null, slug, playbookId, step.id)} className={`${btnGhost} text-danger`}><Trash2 className="size-4" aria-hidden /> Remover</button>}
        <button className={btnSecondary}>{step ? "Salvar etapa" : "Adicionar etapa"}</button>
      </div>
    </form>
  );
}
