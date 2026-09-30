import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDeskContext } from "@/lib/staff";
import { addDays, formatDay, todayIso } from "@/lib/month";
import { formatMinutes } from "@/lib/format";
import { displayName, loadProfiles } from "@/lib/people";
import { ROLE_LABEL, TASK_STATUS } from "@/lib/labels";
import type { MemberRole, Task } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { card } from "@/components/ui";

type TaskRow = Task & { projects: { name: string } | null };

export const metadata = { title: "Minha mesa · NEST" };

export default async function MesaPage() {
  const ctx = await getDeskContext();
  const supabase = await createClient();
  const today = todayIso();
  const weekEnd = addDays(today, 7);
  const weekStart = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const slugOf = new Map(ctx.tenants.map((t) => [t.id, t]));

  const [{ data: openRows }, { data: myTime }, { data: staff }] = await Promise.all([
    supabase.from("tasks").select("*, projects(name)").neq("status", "concluida").order("due_on", { ascending: true, nullsFirst: false }).limit(2000),
    supabase.from("time_entries").select("minutes").eq("user_id", ctx.userId).gte("worked_on", weekStart),
    ctx.isStaff ? supabase.rpc("staff_directory") : Promise.resolve({ data: [] }),
  ]);
  const open = (openRows ?? []) as TaskRow[];
  const rolesIn = (tenantId: string): MemberRole[] =>
    ctx.isAdmin ? ["hub", "marca", "regional", "lojista"] : slugOf.get(tenantId)?.roles ?? [];

  const mine = open.filter((t) => t.assignee_id === ctx.userId);
  const toApprove = open.filter((t) => t.status === "em_aprovacao" && t.approver_role && rolesIn(t.tenant_id).includes(t.approver_role) && t.assignee_id !== ctx.userId);
  const hoursWeek = (myTime ?? []).reduce((s, x) => s + x.minutes, 0);

  // Por marca: abertas, atrasadas, sem responsável.
  const perTenant = new Map<string, { open: number; late: number; unassigned: number }>();
  for (const t of open) {
    const p = perTenant.get(t.tenant_id) ?? { open: 0, late: 0, unassigned: 0 };
    p.open++;
    if (t.due_on && t.due_on < today) p.late++;
    if (!t.assignee_id) p.unassigned++;
    perTenant.set(t.tenant_id, p);
  }

  // Carga da equipe: estimativa das etapas abertas até 7 dias (inclui atrasadas) × capacidade semanal.
  const staffList = (staff ?? []) as { user_id: string; email: string | null; full_name: string | null; weekly_capacity_hours: number }[];
  const load = new Map<string, { minutes: number; late: number; count: number }>();
  for (const t of open) {
    if (!t.assignee_id || !t.due_on || t.due_on > weekEnd) continue;
    const l = load.get(t.assignee_id) ?? { minutes: 0, late: 0, count: 0 };
    l.minutes += t.estimate_minutes;
    l.count++;
    if (t.due_on < today) l.late++;
    load.set(t.assignee_id, l);
  }
  const people = await loadProfiles(supabase, [...load.keys()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-page">Minha mesa</h1>
        <p className="mt-1 text-body text-ink-muted">
          {mine.length} etapas com você · {toApprove.length} aguardando sua aprovação{ctx.isStaff && ` · ${formatMinutes(hoursWeek)} lançadas nesta semana`}
        </p>
      </header>

      <section>
        <h2 className="text-title font-semibold">Marcas</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ctx.tenants.map((t) => {
            const p = perTenant.get(t.id) ?? { open: 0, late: 0, unassigned: 0 };
            return (
              <li key={t.id}>
                <Link href={`/${t.slug}/controle`} className={`${card} flex items-start gap-3 p-4 hover:bg-brand-soft`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-caption text-ink-subtle">{ctx.isAdmin && !t.roles.length ? "Admin NEST" : t.roles.map((r) => ROLE_LABEL[r]).join(" · ")}</p>
                    <p className="mt-2 text-caption text-ink-muted tabular">
                      {p.open} etapas abertas
                      {p.late > 0 && <span className="font-semibold text-danger"> · {p.late} atrasadas</span>}
                      {p.unassigned > 0 && <span> · {p.unassigned} sem responsável</span>}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
                </Link>
              </li>
            );
          })}
          {ctx.tenants.length === 0 && <li className={`${card} p-4 text-body text-ink-muted`}>Nenhuma marca vinculada ao seu acesso.</li>}
        </ul>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <TaskList title="Com você" tasks={mine} today={today} slugOf={slugOf} empty="Nenhuma etapa atribuída a você." />
        <TaskList title="Aguardando sua aprovação" tasks={toApprove} today={today} slugOf={slugOf} empty="Nada para aprovar." />
      </div>

      {ctx.isStaff && (
        <section className={`${card} overflow-x-auto`}>
          <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Carga da equipe · próximos 7 dias</h2>
          {staffList.length === 0 ? <p className="px-4 py-3 text-body text-ink-muted">Nenhuma pessoa da equipe cadastrada.</p> : (
            <table className="w-full min-w-[560px] text-left text-body">
              <thead><tr className="border-b border-line">
                {["Pessoa", "Etapas", "Atrasadas", "Estimado", "Capacidade", "Ocupação"].map((h) => <th key={h} className="h-9 px-4 text-caption font-medium text-ink-subtle">{h}</th>)}
              </tr></thead>
              <tbody>
                {staffList.map((s) => {
                  const l = load.get(s.user_id) ?? { minutes: 0, late: 0, count: 0 };
                  const cap = Number(s.weekly_capacity_hours) * 60;
                  const pct = cap ? l.minutes / cap : 0;
                  return (
                    <tr key={s.user_id} className="h-10 border-b border-line last:border-0">
                      <td className="px-4 font-semibold">{s.full_name || s.email || displayName(people.get(s.user_id))}</td>
                      <td className="px-4 tabular">{l.count}</td>
                      <td className={`px-4 tabular ${l.late ? "font-semibold text-danger" : ""}`}>{l.late}</td>
                      <td className="px-4 tabular">{formatMinutes(l.minutes)}</td>
                      <td className="px-4 tabular">{formatMinutes(cap)}</td>
                      <td className="px-4">
                        <StatusBadge label={`${Math.round(pct * 100)}%`} tone={pct > 1 ? "danger" : pct > 0.8 ? "warning" : "success"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="border-t border-line px-4 py-2 text-caption text-ink-subtle">
            Estimado = soma das estimativas das etapas atribuídas com prazo até {formatDay(weekEnd)} (inclui atrasadas). Capacidade semanal em Equipe.
          </p>
        </section>
      )}
    </div>
  );
}

function TaskList({ title, tasks, today, slugOf, empty }: {
  title: string; tasks: TaskRow[]; today: string; slugOf: Map<string, { slug: string; name: string }>; empty: string;
}) {
  return (
    <section className={card}>
      <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">{title} <span className="text-body font-normal text-ink-subtle tabular">{tasks.length}</span></h2>
      {tasks.length === 0 ? <p className="px-4 py-3 text-body text-ink-muted">{empty}</p> : (
        <ul>
          {tasks.slice(0, 40).map((t) => {
            const tenant = slugOf.get(t.tenant_id);
            const late = t.due_on && t.due_on < today;
            return (
              <li key={t.id} className="border-b border-line last:border-0">
                <Link href={`/${tenant?.slug}/projetos/${t.project_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-brand-soft">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t.title}</span>
                    <span className="block text-caption text-ink-subtle">{tenant?.name} · {t.projects?.name}</span>
                  </span>
                  {late && <AlertTriangle className="size-4 text-danger" aria-label="Atrasada" />}
                  <span className={`w-16 text-right tabular ${late ? "font-semibold text-danger" : "text-ink-muted"}`}>{t.due_on ? formatDay(t.due_on) : "—"}</span>
                  <StatusBadge {...TASK_STATUS[t.status]} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
