import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatDay, resolveMonth } from "@/lib/month";
import { formatBRL, formatInt, formatPct } from "@/lib/format";
import { ITEM_FORMAT, ITEM_STATUS, ITEM_STATUS_ORDER } from "@/lib/labels";
import { monthReport } from "@/lib/report";
import { MonthPicker } from "@/components/month-picker";
import { Progress } from "@/components/progress";
import { card } from "@/components/ui";
import { writeSummary } from "./actions";
import { AiSummary, PrintButton } from "./report-tools";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ mes?: string }> };

// Relatório mensal do cliente: pronto para imprimir/salvar em PDF e mandar.
export default async function RelatorioPage({ params, searchParams }: Props) {
  const [{ tenant }, { mes }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const month = resolveMonth(mes);
  const supabase = await createClient();
  const r = await monthReport(supabase, ctx.tenant.id, month);
  const salesDelta = r.prevSales ? (r.sales - r.prevSales) / r.prevSales : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-subtle">Relatório mensal · {ctx.tenant.name}</p>
          <h1 className="font-display text-page">{month.label}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <PrintButton />
          <MonthPicker month={month} basePath={`/${tenant}/relatorio`} />
        </div>
      </header>

      <Section title="Resumo">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Entregas do contrato", v: `${r.contract.delivered}/${r.contract.contracted}` },
            { k: "Peças publicadas", v: formatInt(r.items.publicado) },
            { k: "Leads gerados", v: formatInt(r.results.leads) },
            { k: "Faturamento das lojas", v: formatBRL(r.sales) },
          ].map((x) => (
            <div key={x.k}><dt className="label text-ink-muted">{x.k}</dt><dd className="text-metric font-semibold tabular">{x.v}</dd></div>
          ))}
        </dl>
        <div className="mt-4 border-t border-line pt-4"><AiSummary action={writeSummary.bind(null, tenant, month.key)} /></div>
      </Section>

      <Section title="Contrato: contratado × entregue">
        {r.contract.lines.length === 0 ? <p className="text-body text-ink-muted">Sem escopo contratado para o mês.</p> : (
          <ul className="space-y-2">
            {r.contract.lines.map((l, i) => (
              <li key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_220px]">
                <span className="text-body"><b>{l.label}</b> <span className="text-ink-subtle">· {l.contractName}</span></span>
                <Progress done={l.delivered} total={l.quantity} label={l.label} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Produção">
        <p className="text-body text-ink-muted">{r.plans} de {r.operations} operações com plano no mês · {r.items.total} peças planejadas.</p>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {ITEM_STATUS_ORDER.map((s) => (
            <li key={s} className="rounded-sm border border-line p-2">
              <p className="text-caption text-ink-subtle">{ITEM_STATUS[s].label}</p>
              <p className="text-heading font-semibold tabular">{r.items[s]}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Processos">
        <ul className="grid gap-2 text-body sm:grid-cols-2">
          <li><b className="tabular">{r.tasksDone}</b> etapas de projeto concluídas</li>
          <li><b className="tabular">{r.approvals}</b> aprovações registradas</li>
          <li><b className="tabular">{r.projectsActive}</b> projetos em andamento</li>
          <li className={r.late ? "text-danger" : ""}><b className="tabular">{r.late}</b> etapas atrasadas</li>
        </ul>
        {r.projectsDone.length > 0 && <p className="mt-2 text-body">Concluídos no mês: {r.projectsDone.map((p) => p.name).join(", ")}.</p>}
      </Section>

      <Section title="Resultados">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { k: "Alcance", v: formatInt(r.results.reach) },
            { k: "Engajamento", v: formatPct(r.results.engagement) },
            { k: "Leads", v: formatInt(r.results.leads) },
            { k: "Visitas à loja", v: formatInt(r.results.visits) },
            { k: "Vendas atribuídas", v: formatInt(r.results.sales) },
          ].map((x) => <div key={x.k}><dt className="label text-ink-muted">{x.k}</dt><dd className="text-heading font-semibold tabular">{x.v}</dd></div>)}
        </dl>
        <p className="mt-3 text-body text-ink-muted">
          Faturamento das lojas: <b className="text-ink">{formatBRL(r.sales)}</b>
          {salesDelta !== null && <> ({salesDelta >= 0 ? "+" : "−"}{formatPct(Math.abs(salesDelta))} vs. mês anterior)</>}
        </p>
        {r.top.length > 0 && (
          <>
            <p className="label mt-4 text-ink-muted">Destaques</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-body">
              {r.top.map((t, i) => (
                <li key={i}><b>{t.title}</b> · {ITEM_FORMAT[t.format]} · {t.operation} — {formatInt(t.t.leads)} leads, {formatPct(t.t.engagement)} de engajamento</li>
              ))}
            </ol>
          </>
        )}
      </Section>

      <Section title="Próximo mês">
        {r.next.length === 0 ? <p className="text-body text-ink-muted">Nenhuma etapa com prazo no próximo mês ainda.</p> : (
          <ul className="space-y-1 text-body">
            {r.next.map((n, i) => <li key={i}><span className="inline-block w-16 tabular text-ink-subtle">{formatDay(n.due_on)}</span> {n.title} <span className="text-ink-subtle">· {n.project}</span></li>)}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${card} break-inside-avoid p-5`}>
      <h2 className="text-title font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
