import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatDay, todayIso } from "@/lib/month";
import { displayName, loadProfiles } from "@/lib/people";
import { PLAYBOOK_CATEGORY, PROJECT_STATUS } from "@/lib/labels";
import type { Playbook, Project, ProjectStatus, TaskStatus } from "@/lib/types";
import { Field } from "@/components/field";
import { Progress } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { btnPrimary, card, input } from "@/components/ui";
import { startProject } from "./actions";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ status?: string; erro?: string; playbook?: string }> };

const ACTIVE: ProjectStatus[] = ["planejado", "em_andamento", "pausado"];
const ERRORS: Record<string, string> = {
  dados: "Escolha o playbook e preencha nome e data de início.",
  salvar: "Não foi possível iniciar o projeto.",
  permissao: "Só Hub e Marca iniciam projetos.",
};

export default async function ProjetosPage({ params, searchParams }: Props) {
  const [{ tenant }, { status, erro, playbook }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const supabase = await createClient();
  const showAll = status === "todos";

  let query = supabase.from("projects").select("*").eq("tenant_id", ctx.tenant.id).order("due_on", { ascending: true, nullsFirst: false });
  if (!showAll) query = query.in("status", ACTIVE);
  const [{ data: projects }, { data: playbooks }, { data: operations }] = await Promise.all([
    query,
    supabase.from("playbooks").select("id, tenant_id, name, category, description, active")
      .or(`tenant_id.is.null,tenant_id.eq.${ctx.tenant.id}`).eq("active", true).order("name"),
    supabase.from("operations").select("id, name").eq("tenant_id", ctx.tenant.id).eq("active", true).order("name"),
  ]);
  const list = (projects ?? []) as Project[];
  const ids = list.map((p) => p.id);
  const { data: tasks } = ids.length
    ? await supabase.from("tasks").select("project_id, status, due_on").in("project_id", ids)
    : { data: [] as { project_id: string; status: TaskStatus; due_on: string | null }[] };
  const people = await loadProfiles(supabase, list.map((p) => p.owner_id));
  const opName = new Map((operations ?? []).map((o) => [o.id, o.name]));
  const today = todayIso();

  const stats = new Map<string, { done: number; total: number; late: number; waiting: number }>();
  for (const t of tasks ?? []) {
    const s = stats.get(t.project_id) ?? { done: 0, total: 0, late: 0, waiting: 0 };
    s.total++;
    if (t.status === "concluida") s.done++;
    else if (t.due_on && t.due_on < today) s.late++;
    if (t.status === "em_aprovacao") s.waiting++;
    stats.set(t.project_id, s);
  }

  const pbs = (playbooks ?? []) as Playbook[];
  // Playbook do cliente vem antes do modelo do produto com o mesmo nome.
  const sortedPbs = [...pbs].sort((a, b) => Number(!a.tenant_id) - Number(!b.tenant_id) || a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-page">Projetos</h1>
          <p className="mt-1 max-w-2xl text-body text-ink-muted">
            Cada projeto nasce de um playbook: etapas, responsáveis, prazos e aprovações definidos antes de começar.
          </p>
        </div>
        <nav className="flex gap-1" aria-label="Filtro">
          {[{ key: "", label: "Ativos" }, { key: "todos", label: "Todos" }].map((f) => (
            <Link key={f.key} href={`/${tenant}/projetos${f.key ? `?status=${f.key}` : ""}`}
              aria-current={(f.key === "todos") === showAll ? "page" : undefined}
              className={`h-8 rounded-sm px-3 text-body font-semibold leading-8 ${(f.key === "todos") === showAll ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-brand-soft"}`}>
              {f.label}
            </Link>
          ))}
        </nav>
      </header>

      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <div className={`mt-6 grid items-start gap-6 ${ctx.isManager ? "lg:grid-cols-[1fr_320px]" : ""}`}>
        <section className={`${card} overflow-x-auto`}>
          {list.length === 0 ? (
            <p className="p-6 text-body text-ink-muted">
              Nenhum projeto {showAll ? "" : "ativo "}ainda.{ctx.isManager && " Inicie um a partir de um playbook ao lado."}
            </p>
          ) : (
            <table className="w-full min-w-[680px] text-left text-body">
              <thead>
                <tr className="border-b border-line">
                  <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Projeto</th>
                  <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Status</th>
                  <th className="h-10 w-40 px-4 text-caption font-medium text-ink-subtle">Etapas</th>
                  <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Prazo</th>
                  <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Responsável</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const s = stats.get(p.id) ?? { done: 0, total: 0, late: 0, waiting: 0 };
                  const href = `/${tenant}/projetos/${p.id}`;
                  return (
                    <tr key={p.id} className="h-12 border-b border-line last:border-0 hover:bg-brand-soft">
                      <td className="px-4">
                        <Link href={href} className="font-semibold hover:text-brand">{p.name}</Link>
                        <span className="block text-caption text-ink-subtle">
                          {p.operation_id ? opName.get(p.operation_id) ?? "Operação" : "Rede toda"}
                          {s.late > 0 && <span className="font-semibold text-danger"> · {s.late} atrasada{s.late > 1 ? "s" : ""}</span>}
                          {s.waiting > 0 && <span className="font-semibold text-warning"> · {s.waiting} em aprovação</span>}
                        </span>
                      </td>
                      <td className="px-4"><StatusBadge {...PROJECT_STATUS[p.status]} /></td>
                      <td className="px-4"><Progress done={s.done} total={s.total} label={`Etapas de ${p.name}`} /></td>
                      <td className={`px-4 tabular ${p.due_on && p.due_on < today && p.status !== "concluido" ? "font-semibold text-danger" : "text-ink-muted"}`}>
                        {p.due_on ? formatDay(p.due_on) : "—"}
                      </td>
                      <td className="px-4 text-ink-muted">{displayName(people.get(p.owner_id ?? ""))}</td>
                      <td className="pr-3">
                        <Link href={href} aria-label={`Abrir ${p.name}`} className="grid size-8 place-items-center rounded-sm text-ink-subtle hover:text-ink">
                          <ChevronRight className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {ctx.isManager && (
          <aside className={`${card} h-fit p-4`}>
            <h2 className="text-heading font-semibold">Iniciar projeto</h2>
            <p className="text-caption text-ink-subtle">
              As etapas do playbook viram tarefas com prazo a partir da data de início. <Link href={`/${tenant}/playbooks`} className="font-semibold text-brand">Ver playbooks</Link>
            </p>
            <form action={startProject.bind(null, tenant)} className="mt-4 space-y-3">
              <Field label="Playbook">
                <select name="playbook_id" required defaultValue={playbook ?? ""} className={input}>
                  <option value="" disabled>Escolha</option>
                  {sortedPbs.map((pb) => (
                    <option key={pb.id} value={pb.id}>
                      {pb.name} · {PLAYBOOK_CATEGORY[pb.category] ?? pb.category}{pb.tenant_id ? " · personalizado" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nome do projeto"><input name="name" required className={input} placeholder="Ex.: Black Friday 2026" /></Field>
              <Field label="Operação">
                <select name="operation_id" defaultValue="" className={input}>
                  <option value="">Rede toda</option>
                  {(operations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
              <Field label="Início"><input type="date" name="starts_on" required defaultValue={todayIso()} className={input} /></Field>
              <button className={`${btnPrimary} w-full`}>Iniciar projeto</button>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}
