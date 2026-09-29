import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contractSummary, type ContractSummary } from "@/lib/control";
import { shiftMonth, todayIso, type Month } from "@/lib/month";
import { totals, type ResultEntry, type Totals } from "@/lib/results";
import type { ItemFormat, ItemStatus } from "@/lib/types";

export type MonthReport = {
  contract: ContractSummary;
  operations: number;
  plans: number;
  items: Record<ItemStatus, number> & { total: number };
  tasksDone: number;
  approvals: number;
  projectsDone: { id: string; name: string }[];
  projectsActive: number;
  late: number;
  results: Totals;
  sales: number;
  prevSales: number;
  top: { title: string; format: ItemFormat; operation: string; t: Totals }[];
  next: { title: string; due_on: string; project: string }[];
};

type Row = ResultEntry & { plan_items: { id: string; title: string; format: ItemFormat } | null; operations: { name: string } | null };

// Números do mês para o relatório do cliente (e para o resumo da IA). Tudo via RLS.
export async function monthReport(supabase: SupabaseClient, tenantId: string, month: Month): Promise<MonthReport> {
  const start = `${month.first}T00:00:00-03:00`;
  const end = `${month.last}T23:59:59-03:00`;
  const next = shiftMonth(month, 1);
  // Atrasada = prazo vencido até hoje (mês corrente) ou até o fim do mês (meses passados).
  const lateCutoff = todayIso() < next.first ? todayIso() : next.first;
  const [contract, ops, plans, done, approved, projectsDone, active, late, results, sales, prevSales, upcoming] = await Promise.all([
    contractSummary(supabase, tenantId, month),
    supabase.from("operations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("active", true),
    supabase.from("monthly_plans").select("id").eq("tenant_id", tenantId).eq("month", month.first),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "concluida").gte("completed_at", start).lte("completed_at", end),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("approved_at", start).lte("approved_at", end),
    supabase.from("projects").select("id, name").eq("tenant_id", tenantId).eq("status", "concluido").gte("updated_at", start).lte("updated_at", end),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["planejado", "em_andamento", "pausado"]),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("status", "concluida").lt("due_on", lateCutoff),
    supabase.from("result_entries").select("*, plan_items(id, title, format), operations(name)").eq("tenant_id", tenantId)
      .gte("measured_on", month.first).lte("measured_on", month.last).limit(2000),
    supabase.from("operation_sales").select("revenue").eq("tenant_id", tenantId).eq("month", month.first),
    supabase.from("operation_sales").select("revenue").eq("tenant_id", tenantId).eq("month", shiftMonth(month, -1).first),
    supabase.from("tasks").select("title, due_on, projects(name)").eq("tenant_id", tenantId).neq("status", "concluida")
      .gte("due_on", next.first).lte("due_on", next.last).order("due_on").limit(12),
  ]);

  const planIds = (plans.data ?? []).map((p) => p.id);
  const { data: items } = planIds.length
    ? await supabase.from("plan_items").select("status").in("plan_id", planIds)
    : { data: [] as { status: ItemStatus }[] };
  const counts = { total: 0, ideia: 0, roteiro: 0, aprovacao: 0, aprovado: 0, publicado: 0 };
  for (const i of items ?? []) { counts.total++; counts[i.status as ItemStatus]++; }

  const rows = (results.data ?? []) as Row[];
  const byItem = new Map<string, { title: string; format: ItemFormat; operation: string; rows: Row[] }>();
  for (const r of rows) {
    if (!r.plan_items) continue;
    const e = byItem.get(r.plan_items.id) ?? { title: r.plan_items.title, format: r.plan_items.format, operation: r.operations?.name ?? "", rows: [] };
    e.rows.push(r);
    byItem.set(r.plan_items.id, e);
  }

  return {
    contract,
    operations: ops.count ?? 0,
    plans: planIds.length,
    items: counts,
    tasksDone: done.count ?? 0,
    approvals: approved.count ?? 0,
    projectsDone: (projectsDone.data ?? []) as { id: string; name: string }[],
    projectsActive: active.count ?? 0,
    late: late.count ?? 0,
    results: totals(rows),
    sales: (sales.data ?? []).reduce((s, x) => s + Number(x.revenue), 0),
    prevSales: (prevSales.data ?? []).reduce((s, x) => s + Number(x.revenue), 0),
    top: [...byItem.values()].map((e) => ({ title: e.title, format: e.format, operation: e.operation, t: totals(e.rows) }))
      .sort((a, b) => b.t.leads - a.t.leads || b.t.engagement - a.t.engagement).slice(0, 5),
    next: ((upcoming.data ?? []) as unknown as { title: string; due_on: string; projects: { name: string } | null }[])
      .map((t) => ({ title: t.title, due_on: t.due_on, project: t.projects?.name ?? "" })),
  };
}
