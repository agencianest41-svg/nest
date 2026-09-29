import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Award, Plug } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatDay, resolveMonth, shiftMonth } from "@/lib/month";
import { formatBRL, formatInt, formatPct } from "@/lib/format";
import { ITEM_FORMAT } from "@/lib/labels";
import { CHANNEL, engagementOf, rankLabel, totals, type Benchmark, type ResultEntry } from "@/lib/results";
import { Field } from "@/components/field";
import { MonthPicker } from "@/components/month-picker";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnSecondary, card, input } from "@/components/ui";
import { importCsv, monthInsights, promoteToPractice, requestIntegration, saveSales } from "./actions";
import { ImportForm } from "./import-form";
import { InsightsPanel } from "./insights-panel";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ mes?: string; aba?: string; erro?: string }> };

const ERRORS: Record<string, string> = { dados: "Confira os campos.", salvar: "Não foi possível salvar.", permissao: "Só Hub e Marca promovem cases." };

const PROVIDERS = [
  { key: "meta", label: "Instagram e Facebook (Meta)", hint: "Alcance, interações e mensagens de cada post, automaticamente." },
  { key: "google_business", label: "Google Business Profile", hint: "Buscas, rotas, ligações e avaliações de cada loja." },
  { key: "tiktok", label: "TikTok", hint: "Visualizações e interações dos vídeos." },
  { key: "erp", label: "Vendas (ERP / PDV)", hint: "Faturamento por loja para cruzar marketing × vendas." },
] as const;

type Row = ResultEntry & { plan_items: { id: string; title: string; format: keyof typeof ITEM_FORMAT } | null };

export default async function ResultadosPage({ params, searchParams }: Props) {
  const [{ tenant }, { mes, aba = "visao", erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const month = resolveMonth(mes);
  const prev = shiftMonth(month, -1);
  const supabase = await createClient();

  const [{ data: rows }, { data: bench }, { data: operations }, { data: sales }, { data: prevSales }, { data: integrations }] = await Promise.all([
    supabase.from("result_entries").select("*, plan_items(id, title, format)").eq("tenant_id", ctx.tenant.id)
      .gte("measured_on", month.first).lte("measured_on", month.last).order("measured_on", { ascending: false }).limit(1000),
    supabase.rpc("operation_benchmark", { p_tenant: ctx.tenant.id, p_month: month.first }),
    supabase.from("operations").select("id, name, city").eq("tenant_id", ctx.tenant.id).eq("active", true).order("name"),
    supabase.from("operation_sales").select("operation_id, revenue, orders").eq("tenant_id", ctx.tenant.id).eq("month", month.first),
    supabase.from("operation_sales").select("operation_id, revenue").eq("tenant_id", ctx.tenant.id).eq("month", prev.first),
    supabase.from("integrations").select("provider, operation_id, status").eq("tenant_id", ctx.tenant.id),
  ]);
  const results = (rows ?? []) as Row[];
  const benchmarks = (bench ?? []) as Benchmark[];
  const opName = new Map((operations ?? []).map((o) => [o.id, o.name]));
  const t = totals(results);
  const salesTotal = (sales ?? []).reduce((s, x) => s + Number(x.revenue), 0);
  const prevSalesBy = new Map((prevSales ?? []).map((s) => [s.operation_id, Number(s.revenue)]));
  const salesBy = new Map((sales ?? []).map((s) => [s.operation_id, s]));
  const single = !ctx.isManager && benchmarks.length === 1 ? benchmarks[0] : null;

  // Peças com melhor resultado no mês (somando canais).
  const byItem = new Map<string, { item: NonNullable<Row["plan_items"]>; op: string; rows: Row[] }>();
  for (const r of results) {
    if (!r.plan_items) continue;
    const e = byItem.get(r.plan_items.id) ?? { item: r.plan_items, op: r.operation_id, rows: [] };
    e.rows.push(r);
    byItem.set(r.plan_items.id, e);
  }
  const top = [...byItem.values()].map((e) => ({ ...e, t: totals(e.rows) }))
    .sort((a, b) => b.t.leads - a.t.leads || b.t.engagement - a.t.engagement).slice(0, 8);
  const back = `/${tenant}/resultados?mes=${month.key}`;

  const tabs = [
    { key: "visao", label: "Visão do mês" },
    { key: "vendas", label: "Marketing × vendas" },
    { key: "integracoes", label: "Integrações e importação" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-subtle">Inteligência</p>
          <h1 className="font-display text-page">Resultados</h1>
          <p className="mt-1 max-w-2xl text-body text-ink-muted">Alcance, interações, leads e vendas por loja e por peça, e a posição de cada operação na rede.</p>
        </div>
        <MonthPicker month={month} basePath={`/${tenant}/resultados`} />
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Seções">
        {tabs.map((x) => (
          <Link key={x.key} href={`/${tenant}/resultados?mes=${month.key}&aba=${x.key}`} aria-current={aba === x.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-body font-semibold whitespace-nowrap ${aba === x.key ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"}`}>
            {x.label}
          </Link>
        ))}
      </nav>

      {aba === "visao" && (
        <div className="mt-6 space-y-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Registros", value: formatInt(t.entries) },
              { label: "Alcance", value: formatInt(t.reach) },
              { label: "Engajamento", value: formatPct(t.engagement) },
              { label: "Leads", value: formatInt(t.leads) },
              { label: "Vendas atribuídas", value: formatInt(t.sales) },
              { label: "Faturamento lojas", value: formatBRL(salesTotal) },
            ].map((k) => (
              <div key={k.label} className={`${card} p-4`}><dt className="label text-ink-muted">{k.label}</dt><dd className="mt-1 text-metric font-semibold tabular">{k.value}</dd></div>
            ))}
          </dl>

          {single && (
            <section className={`${card} p-4`}>
              <h2 className="flex items-center gap-2 text-heading font-semibold"><Award className="size-4 text-accent-ink" aria-hidden /> Sua loja na rede ({single.network_size} operações)</h2>
              <ul className="mt-2 grid gap-2 text-body sm:grid-cols-2">
                <li>Engajamento: <b>{rankLabel(single.pct_engagement, single.network_size)}</b></li>
                <li>Alcance: <b>{rankLabel(single.pct_reach, single.network_size)}</b></li>
                <li>Leads: <b>{rankLabel(single.pct_leads, single.network_size)}</b></li>
                <li>Faturamento: <b>{rankLabel(single.pct_revenue, single.network_size)}</b></li>
              </ul>
              <p className="mt-2 text-caption text-ink-subtle">Você vê a sua posição; os números das outras lojas ficam com a marca.</p>
            </section>
          )}

          {ctx.isManager && benchmarks.length > 0 && (
            <section className={`${card} overflow-x-auto`}>
              <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Operações no mês</h2>
              <table className="w-full min-w-[720px] text-left text-body">
                <thead><tr className="border-b border-line">
                  {["Operação", "Registros", "Alcance", "Engajamento", "Leads", "Faturamento", "Posição"].map((h) => <th key={h} className="h-9 px-4 text-caption font-medium text-ink-subtle">{h}</th>)}
                </tr></thead>
                <tbody>
                  {[...benchmarks].sort((a, b) => b.engagement_rate - a.engagement_rate || b.revenue - a.revenue).map((b) => (
                    <tr key={b.operation_id} className="h-10 border-b border-line last:border-0">
                      <td className="px-4"><Link href={`/${tenant}/operacoes/${b.operation_id}?mes=${month.key}`} className="font-semibold hover:text-brand">{opName.get(b.operation_id)}</Link></td>
                      <td className="px-4 tabular">{b.pieces}</td>
                      <td className="px-4 tabular">{formatInt(b.reach)}</td>
                      <td className="px-4 tabular">{formatPct(Number(b.engagement_rate))}</td>
                      <td className="px-4 tabular">{formatInt(b.leads)}</td>
                      <td className="px-4 tabular">{formatBRL(Number(b.revenue))}</td>
                      <td className="px-4 text-caption text-ink-muted">{b.pieces ? rankLabel(Number(b.pct_engagement), b.network_size) : "sem dados"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="text-heading font-semibold">Peças com melhor resultado</h2>
              <InsightsPanel action={monthInsights.bind(null, tenant, month.key)} />
            </div>
            {top.length === 0 ? (
              <p className="px-4 py-3 text-body text-ink-muted">
                Nenhum resultado ligado a peças neste mês. Registre na própria peça (Rede › operação › peça) ou importe uma planilha.
              </p>
            ) : (
              <ul>
                {top.map((e) => (
                  <li key={e.item.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                    <span className="min-w-48 flex-1">
                      <span className="block font-semibold">{e.item.title}</span>
                      <span className="block text-caption text-ink-subtle">{ITEM_FORMAT[e.item.format]} · {opName.get(e.op)}</span>
                    </span>
                    <span className="text-caption text-ink-muted tabular">{formatInt(e.t.reach)} alcance · {formatPct(e.t.engagement)} · {formatInt(e.t.leads)} leads · {formatInt(e.t.sales)} vendas</span>
                    {ctx.isManager && (
                      <form action={promoteToPractice.bind(null, tenant, e.item.id, back)}>
                        <button className={btnGhost}><Award className="size-4" aria-hidden /> Virar case</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {results.length > 0 && (
            <section className={`${card} overflow-x-auto`}>
              <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Todos os registros</h2>
              <table className="w-full min-w-[720px] text-left text-body">
                <thead><tr className="border-b border-line">
                  {["Data", "Operação", "Peça", "Canal", "Alcance", "Engaj.", "Leads", "Vendas"].map((h) => <th key={h} className="h-9 px-4 text-caption font-medium text-ink-subtle">{h}</th>)}
                </tr></thead>
                <tbody>
                  {results.slice(0, 100).map((r) => (
                    <tr key={r.id} className="h-10 border-b border-line last:border-0">
                      <td className="px-4 tabular text-ink-muted">{formatDay(r.measured_on)}</td>
                      <td className="px-4">{opName.get(r.operation_id)}</td>
                      <td className="px-4">{r.plan_items?.title ?? <span className="text-ink-subtle">{r.notes ?? "—"}</span>}</td>
                      <td className="px-4">{CHANNEL[r.channel]}{r.source !== "manual" && <span className="text-caption text-ink-subtle"> · {r.source}</span>}</td>
                      <td className="px-4 tabular">{formatInt(r.reach)}</td>
                      <td className="px-4 tabular">{formatPct(engagementOf(r))}</td>
                      <td className="px-4 tabular">{formatInt(r.leads)}</td>
                      <td className="px-4 tabular">{formatInt(r.sales_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}

      {aba === "vendas" && (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
          <section className={`${card} overflow-x-auto`}>
            <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Faturamento × marketing · {month.label}</h2>
            <table className="w-full min-w-[640px] text-left text-body">
              <thead><tr className="border-b border-line">
                {["Operação", "Faturamento", "vs. mês anterior", "Registros", "Leads", "Engajamento"].map((h) => <th key={h} className="h-9 px-4 text-caption font-medium text-ink-subtle">{h}</th>)}
              </tr></thead>
              <tbody>
                {(operations ?? []).map((o) => {
                  const s = salesBy.get(o.id);
                  const b = benchmarks.find((x) => x.operation_id === o.id);
                  const before = prevSalesBy.get(o.id);
                  const delta = s && before ? (Number(s.revenue) - before) / before : null;
                  return (
                    <tr key={o.id} className="h-10 border-b border-line last:border-0">
                      <td className="px-4 font-semibold">{o.name}</td>
                      <td className="px-4 tabular">{s ? formatBRL(Number(s.revenue)) : "—"}</td>
                      <td className="px-4 tabular">
                        {delta === null ? "—" : (
                          <span className={`inline-flex items-center gap-0.5 font-semibold ${delta >= 0 ? "text-success" : "text-danger"}`}>
                            {delta >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}{formatPct(Math.abs(delta))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 tabular">{b?.pieces ?? 0}</td>
                      <td className="px-4 tabular">{formatInt(b?.leads ?? 0)}</td>
                      <td className="px-4 tabular">{formatPct(Number(b?.engagement_rate ?? 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <aside className={`${card} h-fit p-4`}>
            <h2 className="text-heading font-semibold">Lançar faturamento do mês</h2>
            <p className="text-caption text-ink-subtle">Quando o ERP estiver integrado, isto é preenchido sozinho.</p>
            <form action={saveSales.bind(null, tenant, month.key)} className="mt-4 space-y-3">
              <Field label="Operação">
                <select name="operation_id" required className={input} defaultValue="">
                  <option value="" disabled>Escolha</option>
                  {(operations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
              <Field label="Faturamento (R$)"><input name="revenue" inputMode="decimal" required className={input} /></Field>
              <Field label="Pedidos"><input name="orders" inputMode="numeric" className={input} /></Field>
              <button className={`${btnSecondary} w-full`}>Salvar</button>
            </form>
          </aside>
        </div>
      )}

      {aba === "integracoes" && (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_340px]">
          <section className="space-y-3">
            <p className="text-body text-ink-muted">
              As integrações entram quando a conta de cada plataforma for conectada. Até lá, os números entram à mão ou por planilha, no mesmo formato.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {PROVIDERS.map((p) => {
                const st = (integrations ?? []).find((i) => i.provider === p.key && !i.operation_id)?.status ?? "desconectado";
                return (
                  <li key={p.key} className={`${card} flex flex-col p-4`}>
                    <p className="flex items-center gap-2 font-semibold"><Plug className="size-4 text-ink-subtle" aria-hidden /> {p.label}</p>
                    <p className="mt-1 flex-1 text-body text-ink-muted">{p.hint}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <StatusBadge {...({
                        desconectado: { label: "Não conectado", tone: "neutral" as const },
                        solicitado: { label: "Conexão solicitada", tone: "warning" as const },
                        conectado: { label: "Conectado", tone: "success" as const },
                        erro: { label: "Erro", tone: "danger" as const },
                      })[st as "desconectado"]} />
                      {ctx.isManager && st === "desconectado" && (
                        <form action={requestIntegration.bind(null, tenant, p.key, null)}><button className={btnGhost}>Solicitar conexão</button></form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <aside className={`${card} h-fit p-4`}>
            <h2 className="text-heading font-semibold">Importar planilha (CSV)</h2>
            <p className="mt-1 text-caption text-ink-subtle">
              Resultados: colunas <code>operacao, data, canal, alcance, curtidas, comentarios, compartilhamentos, salvamentos, cliques, leads, visitas, vendas, receita, link, titulo</code>.
            </p>
            <p className="mt-1 mb-3 text-caption text-ink-subtle">
              Faturamento: <code>operacao, mes (AAAA-MM), receita, pedidos</code>. “operacao” aceita o nome ou o @ do Instagram.
            </p>
            <ImportForm action={importCsv.bind(null, tenant)} />
          </aside>
        </div>
      )}
    </div>
  );
}
