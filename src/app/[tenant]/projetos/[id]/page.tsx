import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Handshake, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext, type TenantContext } from "@/lib/tenant";
import { formatDay, todayIso } from "@/lib/month";
import { displayName, loadProfiles } from "@/lib/people";
import { PROJECT_STATUS, ROLE_LABEL, TASK_STATUS, TASK_STATUS_ORDER } from "@/lib/labels";
import type { Activity, Comment, MemberRole, Profile, Project, Task } from "@/lib/types";
import { Comments } from "@/components/comments";
import { Field } from "@/components/field";
import { Progress } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import {
  addChecklistEntry, addComment, addTask, approveTask, deleteProject, deleteTask, toggleChecklist, updateProject, updateTask,
} from "../actions";
import { TimeLog } from "./time-log";

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ erro?: string; etapa?: string }> };

const ERRORS: Record<string, string> = {
  dados: "Confira os campos preenchidos.",
  salvar: "Não foi possível salvar. Tente de novo.",
  aprovacao: "Esta etapa só pode ser concluída por quem aprova (veja o papel indicado na tarefa).",
};

export default async function ProjetoPage({ params, searchParams }: Props) {
  const [{ tenant, id }, { erro, etapa }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const supabase = await createClient();

  const { data: proj } = await supabase.from("projects").select("*").eq("tenant_id", ctx.tenant.id).eq("id", id).maybeSingle();
  if (!proj) notFound();
  const project = proj as Project;

  const [{ data: taskRows }, { data: activity }, { data: members }, { data: op }, { data: playbook }] = await Promise.all([
    supabase.from("tasks").select("*").eq("project_id", id).order("position").order("created_at"),
    supabase.from("activity_log").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(40),
    ctx.isManager
      ? supabase.from("memberships").select("user_id, role").eq("tenant_id", ctx.tenant.id)
      : Promise.resolve({ data: [] as { user_id: string; role: MemberRole }[] }),
    project.operation_id
      ? supabase.from("operations").select("name").eq("id", project.operation_id).maybeSingle()
      : Promise.resolve({ data: null }),
    project.playbook_id
      ? supabase.from("playbooks").select("name").eq("id", project.playbook_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const tasks = (taskRows ?? []) as Task[];
  const taskIds = tasks.map((t) => t.id);
  const [{ data: commentRows }, { data: timeRows }] = await Promise.all([
    supabase.from("comments").select("*").in("entity_id", [id, ...taskIds]).order("created_at"),
    ctx.isHub
      ? supabase.from("time_entries").select("task_id, minutes").eq("project_id", id)
      : Promise.resolve({ data: [] as { task_id: string | null; minutes: number }[] }),
  ]);
  const comments = (commentRows ?? []) as Comment[];
  const minutesByTask = new Map<string, number>();
  for (const t of timeRows ?? []) if (t.task_id) minutesByTask.set(t.task_id, (minutesByTask.get(t.task_id) ?? 0) + t.minutes);

  const people = await loadProfiles(supabase, [
    project.owner_id, ...tasks.map((t) => t.assignee_id), ...tasks.map((t) => t.approved_by),
    ...comments.map((c) => c.author_id), ...(activity ?? []).map((a) => a.actor_id),
    ...((members ?? []) as { user_id: string }[]).map((m) => m.user_id),
  ]);
  const memberList = (members ?? []) as { user_id: string; role: MemberRole }[];
  const assignable = [...new Map(memberList.map((m) => [m.user_id, m])).values()];

  const today = todayIso();
  const done = tasks.filter((t) => t.status === "concluida").length;
  const late = tasks.filter((t) => t.status !== "concluida" && t.due_on && t.due_on < today).length;
  const back = `/${tenant}/projetos/${id}`;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/${tenant}/projetos`} className={`${btnGhost} -ml-2`}><ArrowLeft className="size-4" aria-hidden /> Projetos</Link>

      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label text-ink-subtle">
            {op?.name ?? "Rede toda"}{playbook?.name && ` · ${playbook.name}`}
          </p>
          <h1 className="font-display text-page">{project.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-body text-ink-muted">
            <StatusBadge {...PROJECT_STATUS[project.status]} />
            <span>Início {formatDay(project.starts_on)}</span>
            {project.due_on && <span>Prazo {formatDay(project.due_on)}</span>}
            <span>Responsável: {displayName(people.get(project.owner_id ?? ""))}</span>
            {late > 0 && <span className="font-semibold text-danger">{late} etapa{late > 1 ? "s" : ""} atrasada{late > 1 ? "s" : ""}</span>}
          </p>
        </div>
        <div className="w-56"><Progress done={done} total={tasks.length} label="Etapas concluídas" /></div>
      </header>

      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-3">
          {project.description && <p className={`${card} p-4 text-body text-ink-muted`}>{project.description}</p>}
          <ol className={card}>
            {tasks.length === 0 && <li className="p-6 text-body text-ink-muted">Sem etapas.</li>}
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                ctx={ctx}
                today={today}
                people={people}
                assignable={assignable}
                comments={comments.filter((c) => c.entity_id === t.id)}
                minutes={minutesByTask.get(t.id) ?? 0}
                slug={tenant}
                projectId={id}
                back={`${back}?etapa=${t.id}#etapa-${t.id}`}
                open={etapa === t.id}
              />
            ))}
          </ol>

          {ctx.isManager && (
            <details className={card}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-body font-semibold">
                <Plus className="size-4" aria-hidden /> Adicionar etapa
              </summary>
              <form action={addTask.bind(null, tenant, id)} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="Título"><input name="title" required className={input} /></Field></div>
                <Field label="Quem executa">
                  <select name="owner_role" defaultValue="hub" className={input}>
                    {(Object.keys(ROLE_LABEL) as MemberRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </Field>
                <Field label="Quem aprova">
                  <select name="approver_role" defaultValue="" className={input}>
                    <option value="">Sem aprovação</option>
                    {(Object.keys(ROLE_LABEL) as MemberRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </Field>
                <Field label="Prazo"><input type="date" name="due_on" className={input} /></Field>
                {ctx.isHub && (
                  <label className="inline-flex items-center gap-2 self-end pb-2 text-body text-ink-muted">
                    <input type="checkbox" name="internal" className="size-4 accent-[var(--brand)]" /> Interna (só Hub)
                  </label>
                )}
                <div className="sm:col-span-2 flex justify-end"><button className={btnSecondary}>Adicionar etapa</button></div>
              </form>
            </details>
          )}
        </section>

        <aside className="space-y-4">
          {ctx.isManager && (
            <form action={updateProject.bind(null, tenant, id)} className={`${card} space-y-3 p-4`}>
              <h2 className="text-heading font-semibold">Projeto</h2>
              <Field label="Status">
                <select name="status" defaultValue={project.status} className={input}>
                  {Object.entries(PROJECT_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Prazo final"><input type="date" name="due_on" defaultValue={project.due_on ?? ""} className={input} /></Field>
              <Field label="Responsável">
                <select name="owner_id" defaultValue={project.owner_id ?? ""} className={input}>
                  <option value="">—</option>
                  {assignable.map((m) => <option key={m.user_id} value={m.user_id}>{displayName(people.get(m.user_id))} · {ROLE_LABEL[m.role]}</option>)}
                </select>
              </Field>
              <Field label="Descrição"><textarea name="description" rows={3} defaultValue={project.description ?? ""} className={textarea} /></Field>
              <div className="flex items-center justify-between">
                <button formAction={deleteProject.bind(null, tenant, id)} className={`${btnGhost} text-danger`}>
                  <Trash2 className="size-4" aria-hidden /> Excluir
                </button>
                <button className={btnSecondary}>Salvar</button>
              </div>
            </form>
          )}

          <section className={card}>
            <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Conversa do projeto</h2>
            <div className="p-4">
              <Comments
                comments={comments.filter((c) => c.entity_id === id)}
                people={people}
                canInternal={ctx.isHub}
                action={addComment.bind(null, tenant, { type: "project", id }, back)}
              />
            </div>
          </section>

          <section className={card}>
            <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Linha do tempo</h2>
            <Timeline items={(activity ?? []) as Activity[]} people={people} />
          </section>
        </aside>
      </div>
    </div>
  );
}

function TaskRow({ task: t, ctx, today, people, assignable, comments, minutes, slug, projectId, back, open }: {
  task: Task;
  ctx: TenantContext;
  today: string;
  people: Map<string, Profile>;
  assignable: { user_id: string; role: MemberRole }[];
  comments: Comment[];
  minutes: number;
  slug: string;
  projectId: string;
  back: string;
  open: boolean;
}) {
  const isLate = t.status !== "concluida" && t.due_on && t.due_on < today;
  const canApprove = Boolean(t.approver_role) && (ctx.isPlatformAdmin || ctx.roles.includes(t.approver_role as MemberRole));
  const statusOptions = TASK_STATUS_ORDER.filter(
    (s) => s !== "concluida" || !t.approver_role || canApprove || t.status === "concluida",
  );
  const checkDone = t.checklist.filter((c) => c.done).length;

  return (
    <li id={`etapa-${t.id}`} className="scroll-mt-4 border-b border-line last:border-0">
      <details open={open}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-brand-soft">
          {t.status === "concluida"
            ? <CheckCircle2 className="size-4 text-success" aria-label="Concluída" />
            : <Circle className="size-4 text-ink-subtle" aria-hidden />}
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{t.title}</span>
            {t.internal && <Lock className="ml-1 inline size-3.5 text-ink-subtle" aria-label="Interna" />}
            <span className="block text-caption text-ink-subtle">
              {ROLE_LABEL[t.owner_role]}
              {t.assignee_id && ` · ${displayName(people.get(t.assignee_id))}`}
              {t.approver_role && ` · aprova: ${ROLE_LABEL[t.approver_role]}`}
              {t.checklist.length > 0 && ` · checklist ${checkDone}/${t.checklist.length}`}
              {comments.length > 0 && ` · ${comments.length} comentário${comments.length > 1 ? "s" : ""}`}
            </span>
          </span>
          <span className={`w-16 text-right text-body tabular ${isLate ? "font-semibold text-danger" : "text-ink-muted"}`}>
            {t.due_on ? formatDay(t.due_on) : "—"}
          </span>
          <StatusBadge {...TASK_STATUS[t.status]} />
        </summary>

        <div className="grid gap-4 border-t border-line bg-canvas p-4 md:grid-cols-2">
          <div className="space-y-3">
            {t.description && <p className="whitespace-pre-line text-body text-ink-muted">{t.description}</p>}
            {t.approved_by && t.approved_at && (
              <p className="inline-flex items-center gap-1 text-caption font-semibold text-success">
                <ShieldCheck className="size-3.5" aria-hidden /> Aprovada por {displayName(people.get(t.approved_by))}
              </p>
            )}
            {t.checklist.length > 0 && (
              <ul className="space-y-1">
                {t.checklist.map((c, i) => (
                  <li key={i}>
                    <form action={toggleChecklist.bind(null, slug, projectId, t.id, i)}>
                      <button className="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left text-body hover:bg-brand-soft"
                        aria-pressed={c.done}>
                        {c.done ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /> : <Circle className="size-4 shrink-0 text-ink-subtle" aria-hidden />}
                        <span className={c.done ? "text-ink-muted line-through" : ""}>{c.label}</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addChecklistEntry.bind(null, slug, projectId, t.id)} className="flex gap-2">
              <label className="min-w-0 flex-1"><span className="sr-only">Novo item do checklist</span>
                <input name="label" required className={input} placeholder="Novo item do checklist" />
              </label>
              <button className={btnGhost} aria-label="Adicionar item"><Plus className="size-4" /></button>
            </form>

            <form action={updateTask.bind(null, slug, projectId, t.id)} className="grid gap-3 sm:grid-cols-2">
              <Field label="Status">
                <select name="status" defaultValue={t.status} className={input}>
                  {statusOptions.map((s) => <option key={s} value={s}>{TASK_STATUS[s].label}</option>)}
                </select>
              </Field>
              <Field label="Prazo"><input type="date" name="due_on" defaultValue={t.due_on ?? ""} className={input} /></Field>
              {ctx.isManager && (
                <div className="sm:col-span-2">
                  <Field label="Responsável">
                    <select name="assignee_id" defaultValue={t.assignee_id ?? ""} className={input}>
                      <option value="">—</option>
                      {assignable.map((m) => <option key={m.user_id} value={m.user_id}>{displayName(people.get(m.user_id))} · {ROLE_LABEL[m.role]}</option>)}
                    </select>
                  </Field>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                {ctx.isManager ? (
                  <span className="flex gap-1">
                    <button formAction={deleteTask.bind(null, slug, projectId, t.id)} className={`${btnGhost} text-danger`}>
                      <Trash2 className="size-4" aria-hidden /> Remover
                    </button>
                    {t.status !== "concluida" && (
                      <Link href={`/${slug}/parceiros?task=${t.id}`} className={btnGhost}><Handshake className="size-4" aria-hidden /> Terceirizar</Link>
                    )}
                  </span>
                ) : <span />}
                <div className="flex gap-2">
                  {canApprove && t.status !== "concluida" && (
                    <button formAction={approveTask.bind(null, slug, projectId, t.id)} className={btnPrimary}>
                      <ShieldCheck className="size-4" aria-hidden /> Aprovar etapa
                    </button>
                  )}
                  <button className={btnSecondary}>Salvar</button>
                </div>
              </div>
            </form>

            {ctx.isHub && <TimeLog slug={slug} projectId={projectId} taskId={t.id} minutes={minutes} estimate={t.estimate_minutes} />}
          </div>

          <div>
            <p className="label mb-2 text-ink-muted">Conversa</p>
            <Comments comments={comments} people={people} canInternal={ctx.isHub}
              action={addComment.bind(null, slug, { type: "task", id: t.id }, back)} />
          </div>
        </div>
      </details>
    </li>
  );
}
