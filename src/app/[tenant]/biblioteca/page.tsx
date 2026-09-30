import { Globe2, Lightbulb, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatDay, resolveMonth } from "@/lib/month";
import { formatInt, formatPct } from "@/lib/format";
import { ITEM_FORMAT } from "@/lib/labels";
import type { BestPractice } from "@/lib/assets";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import { deletePractice, replicatePractice, savePractice } from "./actions";
import { SubTabs } from "@/components/sub-tabs";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ aba?: string; q?: string; erro?: string }> };

const ERRORS: Record<string, string> = { dados: "Confira os campos.", salvar: "Não foi possível salvar.", permissao: "Só Hub e Marca fazem curadoria." };

const METRIC_LABEL: Record<string, string> = {
  reach: "alcance", engagement_rate: "engajamento", leads: "leads", sales_count: "vendas", revenue: "receita", saves: "salvamentos",
};

export default async function BibliotecaPage({ params, searchParams }: Props) {
  const [{ tenant }, { aba = "marca", q, erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const supabase = await createClient();
  const month = resolveMonth();
  const isNetwork = aba === "rede";

  const [{ data: own }, { data: network }, { data: operations }] = await Promise.all([
    isNetwork ? Promise.resolve({ data: [] }) : supabase.from("best_practices").select("*").eq("tenant_id", ctx.tenant.id).order("created_at", { ascending: false }),
    isNetwork ? supabase.rpc("network_practices") : Promise.resolve({ data: [] }),
    supabase.from("operations").select("id, name").eq("tenant_id", ctx.tenant.id).eq("active", true).order("name"),
  ]);
  const needle = q?.toLowerCase().trim();
  const match = (p: { title: string; summary: string; tags: string[] }) =>
    !needle || p.title.toLowerCase().includes(needle) || p.summary.toLowerCase().includes(needle) || p.tags.some((t) => t.includes(needle));
  const list = ((isNetwork ? network : own) ?? []) as (BestPractice & { segment?: string | null })[];
  const shown = list.filter(match).filter((p) => isNetwork || p.tenant_id === ctx.tenant.id);

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <h1 className="font-display text-page">Biblioteca</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-muted">
          O que funcionou vira método: cada case diz o que foi feito, por que funcionou (com números) e como outra loja repete.
        </p>
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <SubTabs className="mt-6" label="Origem" active={aba} tabs={[{ key: "marca", label: <><Lightbulb className="size-4" aria-hidden /> Da {ctx.tenant.name}</> }, { key: "rede", label: <><Globe2 className="size-4" aria-hidden /> Rede NEST</> }].map((t) => ({ ...t, href: `/${tenant}/biblioteca?aba=${t.key}` }))} />
      {isNetwork && (
        <p className="mt-3 text-caption text-ink-subtle">Cases que outras marcas da NEST escolheram compartilhar, sem nome de marca, loja ou cidade.</p>
      )}

      <div className={`mt-6 grid items-start gap-6 ${ctx.isManager && !isNetwork ? "lg:grid-cols-[1fr_340px]" : ""}`}>
        <section>
          <form className="mb-4 flex gap-2" action={`/${tenant}/biblioteca`}>
            <input type="hidden" name="aba" value={aba} />
            <label className="flex-1"><span className="sr-only">Buscar</span><input name="q" defaultValue={q} placeholder="Buscar por tema, formato ou tag" className={input} /></label>
            <button className={btnSecondary}>Buscar</button>
          </form>
          {shown.length === 0 ? (
            <p className={`${card} p-6 text-body text-ink-muted`}>
              {isNetwork ? "Nenhum case compartilhado na rede ainda." : "Nenhum case ainda. Promova peças com bom resultado em Resultados ou crie um case ao lado."}
            </p>
          ) : (
            <ul className="space-y-3">
              {shown.map((p) => (
                <li key={p.id} className={card}>
                  <details>
                    <summary className="cursor-pointer list-none p-4">
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-heading font-semibold">{p.title}</p>
                          <p className="text-caption text-ink-subtle">
                            {p.format ? ITEM_FORMAT[p.format] : "Ação"}{p.segment && ` · ${p.segment}`} · {formatDay(p.created_at.slice(0, 10))}
                            {p.tags.length > 0 && ` · ${p.tags.join(", ")}`}
                          </p>
                        </div>
                        {!isNetwork && !p.published && <StatusBadge label="Rascunho" tone="neutral" />}
                        {!isNetwork && p.share_network && <StatusBadge label="Na rede NEST" tone="info" />}
                      </div>
                      <p className="mt-2 text-body">{p.summary}</p>
                      <Metrics metrics={p.metrics} />
                    </summary>
                    <div className="space-y-3 border-t border-line bg-canvas p-4 text-body">
                      {p.why_it_worked && <div><p className="label text-ink-muted">Por que funcionou</p><p className="whitespace-pre-line">{p.why_it_worked}</p></div>}
                      {p.how_to_replicate && <div><p className="label text-ink-muted">Como replicar</p><p className="whitespace-pre-line">{p.how_to_replicate}</p></div>}
                      {(operations ?? []).length > 0 && (
                        <form action={replicatePractice.bind(null, tenant, isNetwork ? "rede" : "marca", p.id)} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="mes" value={month.key} />
                          <div className="min-w-48 flex-1">
                            <Field label={`Levar para o plano de ${month.label.toLowerCase()}`}>
                              <select name="operation_id" required className={input} defaultValue="">
                                <option value="" disabled>Escolha a operação</option>
                                {(operations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                              </select>
                            </Field>
                          </div>
                          <button className={btnSecondary}>Replicar como ideia</button>
                        </form>
                      )}
                      {ctx.isManager && !isNetwork && (
                        <details className="rounded-sm border border-line bg-surface">
                          <summary className="cursor-pointer px-3 py-2 font-semibold">Editar case</summary>
                          <PracticeForm action={savePractice.bind(null, tenant, p.id)} practice={p} remove={deletePractice.bind(null, tenant, p.id)} />
                        </details>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        {ctx.isManager && !isNetwork && (
          <aside className={`${card} h-fit`}>
            <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Novo case</h2>
            <PracticeForm action={savePractice.bind(null, tenant, null)} />
          </aside>
        )}
      </div>
    </div>
  );
}

function Metrics({ metrics }: { metrics: Record<string, number> }) {
  const entries = Object.entries(metrics ?? {}).filter(([k, v]) => METRIC_LABEL[k] && Number.isFinite(v) && v > 0);
  if (!entries.length) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-3 text-caption text-ink-muted">
      {entries.map(([k, v]) => (
        <span key={k}><span className="font-semibold text-ink tabular">{k === "engagement_rate" ? formatPct(v) : formatInt(Math.round(v))}</span> {METRIC_LABEL[k]}</span>
      ))}
    </p>
  );
}

function PracticeForm({ action, practice, remove }: { action: (fd: FormData) => Promise<void>; practice?: BestPractice; remove?: () => Promise<void> }) {
  return (
    <form action={action} className="space-y-3 p-4">
      <Field label="Título"><input name="title" required defaultValue={practice?.title} className={input} /></Field>
      <Field label="O que foi feito"><textarea name="summary" required rows={2} defaultValue={practice?.summary} className={textarea} /></Field>
      <Field label="Por que funcionou"><textarea name="why_it_worked" rows={3} defaultValue={practice?.why_it_worked ?? ""} className={textarea} /></Field>
      <Field label="Como replicar"><textarea name="how_to_replicate" rows={3} defaultValue={practice?.how_to_replicate ?? ""} className={textarea} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Formato">
          <select name="format" defaultValue={practice?.format ?? ""} className={input}>
            <option value="">—</option>
            {Object.entries(ITEM_FORMAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Tags"><input name="tags" defaultValue={practice?.tags.join(", ")} className={input} /></Field>
      </div>
      <label className="flex items-center gap-2 text-body"><input type="checkbox" name="published" defaultChecked={practice?.published ?? true} className="size-4 accent-[var(--brand)]" /> Publicado para a rede da marca</label>
      <label className="flex items-center gap-2 text-body"><input type="checkbox" name="share_network" defaultChecked={practice?.share_network} className="size-4 accent-[var(--brand)]" /> Compartilhar anonimizado na rede NEST <Lock className="size-3.5 text-ink-subtle" aria-hidden /></label>
      <div className="flex justify-between">
        {remove ? <button formAction={remove} className={`${btnGhost} text-danger`}>Excluir</button> : <span />}
        <button className={practice ? btnSecondary : btnPrimary}>{practice ? "Salvar" : "Criar case"}</button>
      </div>
    </form>
  );
}
