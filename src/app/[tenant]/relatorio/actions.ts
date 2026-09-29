"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { resolveMonth } from "@/lib/month";
import { formatBRL, formatInt, formatPct } from "@/lib/format";
import { monthReport } from "@/lib/report";
import { runAi } from "@/lib/ai";

export type SummaryState = { status: "idle" } | { status: "error"; message: string } | { status: "ok"; text: string };

// Resumo executivo do mês escrito pela IA, só com os números do relatório.
export async function writeSummary(slug: string, monthKey: string): Promise<SummaryState> {
  const ctx = await getTenantContext(slug);
  const month = resolveMonth(monthKey);
  const supabase = await createClient();
  const r = await monthReport(supabase, ctx.tenant.id, month);
  const facts = [
    `Mês: ${month.label}. Marca: ${ctx.tenant.name}. Operações ativas: ${r.operations}.`,
    `Contrato: ${r.contract.delivered} de ${r.contract.contracted} entregas (${r.contract.lines.map((l) => `${l.label} ${l.delivered}/${l.quantity}`).join("; ") || "sem escopo"}).`,
    `Planos do mês: ${r.plans}. Peças: ${r.items.total} (publicadas ${r.items.publicado}, em aprovação ${r.items.aprovacao}).`,
    `Etapas concluídas: ${r.tasksDone}. Aprovações feitas: ${r.approvals}. Projetos concluídos: ${r.projectsDone.map((p) => p.name).join(", ") || "nenhum"}. Projetos ativos: ${r.projectsActive}. Etapas atrasadas: ${r.late}.`,
    `Resultados: alcance ${formatInt(r.results.reach)}, engajamento ${formatPct(r.results.engagement)}, leads ${formatInt(r.results.leads)}, vendas atribuídas ${formatInt(r.results.sales)}.`,
    `Faturamento das lojas: ${formatBRL(r.sales)} (mês anterior ${formatBRL(r.prevSales)}).`,
    `Melhores peças: ${r.top.map((t) => `${t.title} (${t.operation}): ${formatInt(t.t.leads)} leads, ${formatPct(t.t.engagement)}`).join("; ") || "sem dados"}.`,
    `Próximas entregas: ${r.next.map((n) => `${n.title} (${n.due_on})`).join("; ") || "nenhuma"}.`,
  ].join("\n");
  const res = await runAi({
    supabase, tenantId: ctx.tenant.id, userId: ctx.userId, feature: "relatorio.resumo",
    system: "Você escreve relatórios mensais de marketing para clientes. Português do Brasil.",
    prompt: `Dados do mês:\n${facts}`,
    schema: z.object({ text: z.string().max(4000) }),
  });
  return res.ok ? { status: "ok", text: res.data.text } : { status: "error", message: res.message };
}
