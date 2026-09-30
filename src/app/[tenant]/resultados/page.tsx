import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Award, Plug, RefreshCw, RotateCw, Unplug } from "lucide-react";
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
import { disconnectMeta, importCsv, monthInsights, promoteToPractice, requestIntegration, saveMetaAccounts, saveSales, syncMetaNow } from "./actions";
import { formatDateTime } from "@/lib/publishing";
import { daysUntilExpiry, metaMissing, type MetaConfig } from "@/lib/integrations/meta";
import { ImportForm } from "./import-form";
import { InsightsPanel } from "./insights-panel";
import { SubTabs } from "@/components/sub-tabs";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ mes?: string; aba?: string; erro?: string; ok?: string; n?: string }> };

const ERRORS: Record<string, string> = {
  dados: "Confira os campos.", salvar: "Não foi possível salvar.", permissao: "Só Hub e Marca promovem cases.",
  meta_permissao: "Só Hub e Marca conectam contas da Meta.",
  meta_config: "O app da Meta ainda não está configurado no servidor da NEST.",
  meta_estado: "O login com o Facebook expirou ou veio de outra aba. Tente conectar de novo.",
  meta_negado: "A conexão foi cancelada no Facebook. Nada foi alterado.",
  meta_falhou: "A Meta não confirmou a conexão. Tente de novo em alguns minutos.",
  meta_repetida: "Cada loja só pode ficar com uma conta do Instagram.",
  meta_sync: "Não foi possível puxar os insights agora. Veja o motivo no card da Meta.",
};

const OK: Record<string, string> = {
  meta: "Conta da Meta conectada. Confira abaixo qual Instagram é de qual loja.",
  meta_vazio: "Conectado, mas nenhuma conta do Instagram veio junto. Verifique se as contas são Profissionais e estão ligadas a uma página do Facebook, e se você marcou essas páginas na hora de autorizar.",
  meta_contas: "Contas salvas.",
  meta_desconectado: "Meta desconectada. O acesso da NEST foi removido.",
  meta_sync: "Insights atualizados.",
};

const PROVIDERS = [
  { key: "meta", label: "Instagram e Facebook (Meta)", hint: "Alcance, interações e mensagens de cada post, automaticamente." },
  { key: "google_business", label: "Google Business Profile", hint: "Buscas, rotas, ligações e avaliações de cada loja." },
  { key: "tiktok", label: "TikTok", hint: "Visualizações e interações dos vídeos." },
  { key: "erp", label: "Vendas (ERP / PDV)", hint: "Faturamento por loja para cruzar marketing × vendas." },
] as const;

type Row = ResultEntry & { plan_items: { id: string; title: string; format: keyof typeof ITEM_FORMAT } | null };

export default async function ResultadosPage({ params, searchParams }: Props) {
  const [{ tenant }, { mes, aba = "visao", erro, ok, n }] = await Promise.all([params, searchParams]);
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
    supabase.from("integrations").select("provider, operation_id, status, account_label, config, last_sync_at").eq("tenant_id", ctx.tenant.id),
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

  // Meta: a linha da marca guarda a conexão; cada loja ligada tem a própria linha.
  const metaRow = (integrations ?? []).find((i) => i.provider === "meta" && !i.operation_id);
  const meta = (metaRow?.config ?? {}) as MetaConfig;
  const metaOn = metaRow?.status === "conectado" || metaRow?.status === "erro";
  const metaReady = metaMissing().length === 0;
  const opByIg = new Map((integrations ?? []).filter((i) => i.provider === "meta" && i.operation_id)
    .map((i) => [(i.config as { ig_user_id?: string }).ig_user_id, i.operation_id as string]));
  const metaDaysLeft = metaOn ? daysUntilExpiry(meta) : null;

  const tabs = [
    { key: "visao", label: "Visão do mês" },
    { key: "vendas", label: "Marketing × vendas" },
    { key: "integracoes", label: "Integrações e importação" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-page">Resultados</h1>
          <p className="mt-1 max-w-2xl text-body text-ink-muted">Alcance, interações, leads e vendas por loja e por peça, e a posição de cada operação na rede.</p>
        </div>
        <MonthPicker month={month} basePath={`/${tenant}/resultados`} />
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}
      {ok && OK[ok] && (
        <p role="status" className="mt-4 rounded-sm border border-success/20 bg-success/5 p-3 text-body text-success">
          {OK[ok]}{ok === "meta_sync" && n && ` ${n} post(s) dos últimos 30 dias.`}
        </p>
      )}

      <SubTabs className="mt-6" label="Seções" active={aba} tabs={tabs.map((x) => ({ ...x, href: `/${tenant}/resultados?mes=${month.key}&aba=${x.key}` }))} />

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
                if (p.key === "meta") return (
                  <li key={p.key} className={`${card} flex flex-col p-4`}>
                    <p className="flex items-center gap-2 font-semibold"><Plug className="size-4 text-ink-subtle" aria-hidden /> {p.label}</p>
                    <p className="mt-1 flex-1 text-body text-ink-muted">
                      {metaOn
                        ? `Conectado por ${meta.meta_user?.name ?? "—"} · ${meta.accounts?.length ?? 0} conta(s) do Instagram.`
                        : p.hint}
                    </p>
                    {metaOn && (
                      <p className="mt-2 text-caption text-ink-subtle">
                        {metaRow?.last_sync_at
                          ? `Insights atualizados em ${formatDateTime(metaRow.last_sync_at)} · ${meta.last_posts ?? 0} post(s). Atualiza sozinho todo dia.`
                          : "Os insights entram em Resultados todo dia de manhã."}
                      </p>
                    )}
                    {metaOn && meta.last_error && <p className="mt-2 text-caption text-danger">{meta.last_error}</p>}
                    {metaDaysLeft !== null && metaDaysLeft <= 10 && (
                      <p className="mt-2 text-caption text-warning">
                        {metaDaysLeft > 0 ? `A autorização vence em ${metaDaysLeft} dia(s): reconecte para não parar.` : "A autorização venceu: reconecte."}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge {...(st === "erro" ? { label: "Erro", tone: "danger" as const }
                        : metaOn ? { label: "Conectado", tone: "success" as const }
                        : st === "solicitado" ? { label: "Conexão solicitada", tone: "warning" as const }
                        : { label: "Não conectado", tone: "neutral" as const })} />
                      {ctx.isManager && (
                        <span className="flex items-center gap-1">
                          {metaReady ? (
                            // Link comum: é um redirecionamento para o Facebook, não uma página.
                            <a href={`/api/integracoes/meta/conectar?t=${tenant}`} className={metaOn ? btnGhost : btnSecondary}>
                              {metaOn ? <><RefreshCw className="size-4" aria-hidden /> Reconectar</> : "Conectar"}
                            </a>
                          ) : st === "desconectado" && (
                            <form action={requestIntegration.bind(null, tenant, p.key, null)}><button className={btnGhost}>Solicitar conexão</button></form>
                          )}
                          {metaOn && (
                            <form action={syncMetaNow.bind(null, tenant)}>
                              <button className={btnGhost}><RotateCw className="size-4" aria-hidden /> Atualizar agora</button>
                            </form>
                          )}
                          {metaOn && (
                            <form action={disconnectMeta.bind(null, tenant)}>
                              <button className={btnGhost}><Unplug className="size-4" aria-hidden /> Desconectar</button>
                            </form>
                          )}
                        </span>
                      )}
                    </div>
                    {ctx.isHub && !metaReady && (
                      <p className="mt-2 text-caption text-ink-subtle">Para liberar o botão Conectar, configure no servidor: {metaMissing().join(", ")}.</p>
                    )}
                  </li>
                );
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

            {metaOn && ctx.isManager && (meta.accounts?.length ?? 0) > 0 && (
              <form action={saveMetaAccounts.bind(null, tenant)} className={card}>
                <div className="border-b border-line px-4 py-3">
                  <h2 className="text-heading font-semibold">Contas do Instagram</h2>
                  <p className="text-caption text-ink-subtle">
                    A NEST liga cada conta à loja com o mesmo @ cadastrado. Ajuste o que não bateu. Os números de cada conta entram nos Resultados da loja escolhida.
                  </p>
                </div>
                <ul>
                  {meta.accounts!.map((a) => (
                    <li key={a.ig_id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                      {a.picture
                        // eslint-disable-next-line @next/next/no-img-element -- foto vem do CDN da Meta, com URL temporária
                        ? <img src={a.picture} alt="" className="size-8 rounded-full bg-canvas object-cover" />
                        : <span aria-hidden className="size-8 rounded-full bg-brand-soft" />}
                      <span className="min-w-40 flex-1">
                        <span className="block font-semibold">@{a.username}</span>
                        <span className="block text-caption text-ink-subtle">
                          Página: {a.page_name}{a.followers !== null && ` · ${formatInt(a.followers)} seguidores`}
                        </span>
                      </span>
                      <label className="sr-only" htmlFor={`conta_${a.ig_id}`}>Loja de @{a.username}</label>
                      <select id={`conta_${a.ig_id}`} name={`conta_${a.ig_id}`} className={`${input} w-56`}
                        defaultValue={meta.official_ig_id === a.ig_id ? "marca" : opByIg.get(a.ig_id) ?? ""}>
                        <option value="">Não usar</option>
                        <option value="marca">Conta oficial da marca</option>
                        {(operations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end border-t border-line px-4 py-3">
                  <button className={btnSecondary}>Salvar contas</button>
                </div>
              </form>
            )}
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
