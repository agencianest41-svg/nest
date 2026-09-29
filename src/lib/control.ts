import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Month } from "@/lib/month";
import type { ItemFormat } from "@/lib/types";

export type ContractLine = {
  contractId: string;
  contractName: string;
  operationId: string | null;
  label: string;
  format: ItemFormat | null;
  quantity: number;
  delivered: number;
};

export type ContractSummary = {
  lines: ContractLine[];
  monthlyFee: number;
  contracted: number;
  delivered: number;
};

type ContractRow = {
  id: string;
  name: string;
  operation_id: string | null;
  monthly_fee: number;
  contract_items: { label: string; format: ItemFormat | null; quantity: number }[];
};

// Contrato vivo: escopo contratado no mês × o que foi entregue (peças publicadas
// por formato; tarefas de projeto concluídas quando a linha não tem formato).
// Tudo passa pela RLS: cada perfil vê o contrato que lhe cabe.
export async function contractSummary(supabase: SupabaseClient, tenantId: string, month: Month): Promise<ContractSummary> {
  const { data: contracts } = await supabase.from("contracts")
    .select("id, name, operation_id, monthly_fee, contract_items(label, format, quantity)")
    .eq("tenant_id", tenantId).eq("active", true)
    .lte("starts_on", month.last).or(`ends_on.is.null,ends_on.gte.${month.first}`);
  const rows = (contracts ?? []) as unknown as ContractRow[];
  if (!rows.length) return { lines: [], monthlyFee: 0, contracted: 0, delivered: 0 };

  const [{ data: plans }, { data: doneTasks }] = await Promise.all([
    supabase.from("monthly_plans").select("id, operation_id").eq("tenant_id", tenantId).eq("month", month.first),
    supabase.from("tasks").select("project_id, projects(operation_id)").eq("tenant_id", tenantId).eq("status", "concluida")
      .gte("completed_at", `${month.first}T00:00:00-03:00`).lte("completed_at", `${month.last}T23:59:59-03:00`),
  ]);
  const opByPlan = new Map((plans ?? []).map((p) => [p.id, p.operation_id as string]));
  const planIds = [...opByPlan.keys()];
  const { data: published } = planIds.length
    ? await supabase.from("plan_items").select("plan_id, format").in("plan_id", planIds).eq("status", "publicado")
    : { data: [] as { plan_id: string; format: ItemFormat }[] };

  const pieces = (published ?? []).map((p) => ({ op: opByPlan.get(p.plan_id) ?? null, format: p.format as ItemFormat }));
  const tasks = ((doneTasks ?? []) as unknown as { projects: { operation_id: string | null } | null }[])
    .map((t) => ({ op: t.projects?.operation_id ?? null }));

  const lines: ContractLine[] = [];
  for (const c of rows) {
    const inScope = (op: string | null) => !c.operation_id || op === c.operation_id;
    for (const it of c.contract_items) {
      const delivered = it.format
        ? pieces.filter((p) => p.format === it.format && inScope(p.op)).length
        : tasks.filter((t) => inScope(t.op)).length;
      lines.push({
        contractId: c.id, contractName: c.name, operationId: c.operation_id,
        label: it.label, format: it.format, quantity: it.quantity, delivered,
      });
    }
  }
  return {
    lines,
    monthlyFee: rows.reduce((s, c) => s + Number(c.monthly_fee), 0),
    contracted: lines.reduce((s, l) => s + l.quantity, 0),
    delivered: lines.reduce((s, l) => s + Math.min(l.delivered, l.quantity), 0),
  };
}
