import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, FileBarChart, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { contractSummary } from "@/lib/control";
import { addDays, formatDay, resolveMonth, todayIso } from "@/lib/month";
import { displayName, loadProfiles } from "@/lib/people";
import { ITEM_FORMAT, PROJECT_STATUS, ROLE_LABEL, TASK_STATUS } from "@/lib/labels";
import type { Activity, ItemFormat, MemberRole, Project, Task } from "@/lib/types";
import { MonthPicker } from "@/components/month-picker";
import { Progress } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { btnSecondary, card } from "@/components/ui";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ mes?: string }> };

type TaskRow = Task & { projects: { name: string } | null };
type WaitingPiece = {
  id: string; title: string; format: ItemFormat; scheduled_on: string | null;
  monthly_plans: { operation_id: string; month: string; operations: { name: string } | null } | null;
};

// Sala de controle: o cliente (e a equipe) entende a operação inteira em uma tela.
// Tudo vem pela RLS, então cada perfil vê o recorte que lhe cabe.
export default async function ControlePage({ params, searchParams }: Props) {
  const [{ tenant }, { mes }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const month = resolveMonth(mes);
  const today = todayIso();
  const in7 = addDays(today, 7);
  const supabase = await createClient();
  const myRoles = ctx.isPlatformAdmin ? (["hub", "marca", "regional", "lojista"] as MemberRole[]) : ctx.roles;

  const [{ data: openTasks }, { data: projects }, { data: activity }, { data: waitingPieces }, { data: upcomingPieces }, summary] = await Promise.all([
    supabase.from("tasks").select("*, projects(name)").eq("tenant_id", ctx.tenant.id).neq("status", "concluida")
      .order("due_on", { ascending: true, nullsFirst: false }).limit(500),
    supabase.from("projects").select("*").eq("tenant_id", ctx.tenant.id).in("status", ["planejado", "em_andamento", "pausado"])
      .order("due_on", { ascending: true, nullsFirst: false }),
    supabase.from("activity_log").select("*").eq("tenant_id", ctx.tenant.id).order("created_at", { ascending: false }).limit(25),
    ctx.isManager
      ? supabase.from("plan_items").select("id, title, format, scheduled_on, monthly_plans(operation_id, month, operations(name))")
          .eq("tenant_id", ctx.tenant.id).eq("status", "aprovacao").order("scheduled_on").limit(50)
      : Promise.resolve({ data: [] }),
    supabase.from("plan_items").select("id, title, format, scheduled_on, status, monthly_plans(operation_id, month, operations(name))")
      .eq("tenant_id", ctx.tenant.id).neq("status", "publicado").gte("scheduled_on", today).lte("scheduled_on", in7).order("scheduled_on").limit(20),
    contractSummary(supabase, ctx.tenant.id, month),
  ]);

  const tasks = (openTasks ?? []) as TaskRow[];
  const projectList = (projects ?? []) as Project[];
  const projectIds = projectList.map((p) => p.id);
  const { data: allTasks } = projectIds.length
    ? await supabase.from("tasks").select("project_id, status").in("project_id", projectIds)
    : { data: [] as { project_id: string; status: string }[] };
  const progress = new Map<string, { done: number; total: number }>();
  for (const t of allTasks ?? []) {
    const p = progress.get(t.project_id) ?? { done: 0, total: 0 };
    p.total++;
    if (t.status === "concluida") p.done++;
    progress.set(t.project_id, p);
  }

  const toApprove = tasks.filter((t) => t.status === "em_aprovacao" && t.approver_role && myRoles.includes(t.approver_role));
  const mine = tasks.filter((t) => t.assignee_id === ctx.userId && t.status !== "em_aprovacao");
  const myRoleOpen = tasks.filter((t) => !t.assignee_id && myRoles.includes(t.owner_role) && t.status !== "em_aprovacao"
    && t.due_on && t.due_on <= in7);
  const late = tasks.filter((t) => t.due_on && t.due_on < today);
  const soon = tasks.filter((t) => t.due_on && t.due_on >= today && t.due_on <= in7);
  const pieces = (waitingPieces ?? []) as unknown as WaitingPiece[];
  const upcoming = (upcomingPieces ?? []) as unknown as (WaitingPiece & { status: string })[];
  const waitingCount = toApprove.length + pieces.length + mine.length + myRoleOpen.length;

  const people = await loadProfiles(supabase, [...(activity ?? []).map((a) => a.actor_id), ...tasks.map((t) => t.assignee_id)]);
  const pieceHref = (p: WaitingPiece) => p.monthly_plans
    ? `/${tenant}/operacoes/${p.monthly_plans.operation_id}?mes=${p.monthly_plans.month.slice(0, 7)}` : `/${tenant}`;

  const kpis = [
    { label: "Aguardando você", value: waitingCount, tone: waitingCount ? "text-warning" : "" },
    { label: "Etapas atrasadas", value: late.length, tone: late.length ? "text-danger" : "" },
    { label: "Projetos ativos", value: projectList.length, tone: "" },
    { label: "Contrato no mês", value: `${summary.delivered}/${summary.contracted}`, tone: "" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-subtle">{ctx.tenant.name}</p>
          <h1 className="font-display text-page">Sala de controle</h1>
          <p className="mt-1 max-w-2xl text-body text-ink-muted">O que está andando, o que depende de você e o que já foi entregue.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/${tenant}/relatorio?mes=${month.key}`} className={btnSecondary}>
            <FileBarChart className="size-4" aria-hidden /> Relatório do mês
          </Link>
          <MonthPicker month={month} basePath={`/${tenant}/controle`} />
        </div>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={`${card} p-4`}>
            <dt className="label text-ink-muted">{k.label}</dt>
            <dd className={`mt-1 text-metric font-semibold tabular ${k.tone}`}>{k.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className={card}>
            <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-heading font-semibold">
              <Inbox className="size-4 text-warning" aria-hidden /> Aguardando você
            </h2>
            {waitingCount === 0 ? (
              <p className="px-4 py-3 text-body text-ink-muted">Nada pendente com você.</p>
            ) : (
              <ul>
                {toApprove.map((t) => (
                  <Row key={t.id} href={`/${tenant}/projetos/${t.project_id}`} title={t.title}
                    meta={`Aprovar etapa · ${t.projects?.name ?? "Projeto"}`} due={t.due_on} today={today}
                    badge={<StatusBadge label="Aprovar" tone="warning" />} />
                ))}
                {pieces.map((p) => (
                  <Row key={p.id} href={pieceHref(p)} title={p.title}
                    meta={`Aprovar peça · ${ITEM_FORMAT[p.format]} · ${p.monthly_plans?.operations?.name ?? ""}`} due={p.scheduled_on} today={today}
                    badge={<StatusBadge label="Aprovar peça" tone="warning" />} />
                ))}
                {[...mine, ...myRoleOpen].map((t) => (
                  <Row key={t.id} href={`/${tenant}/projetos/${t.project_id}`} title={t.title}
                    meta={`${t.assignee_id ? "Atribuída a você" : `Etapa de ${ROLE_LABEL[t.owner_role]}`} · ${t.projects?.name ?? ""}`}
                    due={t.due_on} today={today} badge={<StatusBadge {...TASK_STATUS[t.status]} />} />
                ))}
              </ul>
            )}
          </section>

          {late.length > 0 && (
            <section className={`${card} border-danger/40`}>
              <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-heading font-semibold">
                <AlertTriangle className="size-4 text-danger" aria-hidden /> Atrasados
              </h2>
              <ul>
                {late.slice(0, 12).map((t) => (
                  <Row key={t.id} href={`/${tenant}/projetos/${t.project_id}`} title={t.title}
                    meta={`${t.projects?.name ?? ""} · ${ROLE_LABEL[t.owner_role]}${t.assignee_id ? ` · ${displayName(people.get(t.assignee_id))}` : ""}`}
                    due={t.due_on} today={today} badge={<StatusBadge {...TASK_STATUS[t.status]} />} />
                ))}
              </ul>
              {late.length > 12 && <p className="border-t border-line px-4 py-2 text-caption text-ink-subtle">+ {late.length - 12} etapas atrasadas</p>}
            </section>
          )}

          <section className={card}>
            <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-heading font-semibold">
              <CalendarClock className="size-4 text-info" aria-hidden /> Próximos 7 dias
            </h2>
            {soon.length + upcoming.length === 0 ? (
              <p className="px-4 py-3 text-body text-ink-muted">Nenhuma entrega prevista.</p>
            ) : (
              <ul>
                {soon.map((t) => (
                  <Row key={t.id} href={`/${tenant}/projetos/${t.project_id}`} title={t.title} meta={`Etapa · ${t.projects?.name ?? ""}`}
                    due={t.due_on} today={today} badge={<StatusBadge {...TASK_STATUS[t.status]} />} />
                ))}
                {upcoming.map((p) => (
                  <Row key={p.id} href={pieceHref(p)} title={p.title}
                    meta={`Peça · ${ITEM_FORMAT[p.format]} · ${p.monthly_plans?.operations?.name ?? ""}`} due={p.scheduled_on} today={today}
                    badge={<StatusBadge label="Planejada" tone="info" icon="calendar" />} />
                ))}
              </ul>
            )}
          </section>

          <section className={card}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-heading font-semibold">Projetos em andamento</h2>
              <Link href={`/${tenant}/projetos`} className="inline-flex items-center gap-1 text-caption font-semibold text-brand">Todos <ArrowRight className="size-3.5" aria-hidden /></Link>
            </div>
            {projectList.length === 0 ? (
              <p className="px-4 py-3 text-body text-ink-muted">Nenhum projeto ativo.</p>
            ) : (
              <ul>
                {projectList.map((p) => {
                  const pr = progress.get(p.id) ?? { done: 0, total: 0 };
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                      <Link href={`/${tenant}/projetos/${p.id}`} className="min-w-40 flex-1 font-semibold hover:text-brand">{p.name}</Link>
                      <span className="w-40"><Progress done={pr.done} total={pr.total} label={p.name} /></span>
                      <span className="w-16 text-right text-caption text-ink-subtle tabular">{p.due_on ? formatDay(p.due_on) : "—"}</span>
                      <StatusBadge {...PROJECT_STATUS[p.status]} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className={card}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-heading font-semibold">Contrato vivo · {month.label}</h2>
              {ctx.isManager && <Link href={`/${tenant}/contrato?mes=${month.key}`} className="text-caption font-semibold text-brand">Detalhes</Link>}
            </div>
            {summary.lines.length === 0 ? (
              <p className="px-4 py-3 text-body text-ink-muted">Nenhum escopo contratado para este mês.</p>
            ) : (
              <ul>
                {summary.lines.map((l, i) => (
                  <li key={i} className="border-b border-line px-4 py-2.5 last:border-0">
                    <p className="text-body font-semibold">{l.label}</p>
                    <Progress done={l.delivered} total={l.quantity} label={l.label} />
                  </li>
                ))}
              </ul>
            )}
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

function Row({ href, title, meta, due, today, badge }: {
  href: string; title: string; meta: string; due: string | null; today: string; badge: React.ReactNode;
}) {
  const late = due && due < today;
  return (
    <li className="border-b border-line last:border-0">
      <Link href={href} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-brand-soft">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-caption text-ink-subtle">{meta}</span>
        </span>
        <span className={`w-16 text-right text-body tabular ${late ? "font-semibold text-danger" : "text-ink-muted"}`}>{due ? formatDay(due) : "—"}</span>
        {badge}
      </Link>
    </li>
  );
}
