import { redirect } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { contractSummary } from "@/lib/control";
import { formatDay, resolveMonth, todayIso } from "@/lib/month";
import { formatBRL } from "@/lib/format";
import { ITEM_FORMAT, SERVICE_TIER } from "@/lib/labels";
import type { ItemFormat, ServiceTier, TierQuota } from "@/lib/types";
import { Field } from "@/components/field";
import { MonthPicker } from "@/components/month-picker";
import { Progress } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import { addContractItem, createContract, deleteContract, deleteContractItem, saveQuotas, toggleContract } from "./actions";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ mes?: string; erro?: string }> };

const ERRORS: Record<string, string> = {
  dados: "Confira os campos.", salvar: "Não foi possível salvar.", permissao: "Só a equipe Hub configura contratos.",
};

type Contract = {
  id: string; name: string; operation_id: string | null; monthly_fee: number; starts_on: string; ends_on: string | null;
  active: boolean; notes: string | null;
  contract_items: { id: string; label: string; format: ItemFormat | null; quantity: number }[];
};

export default async function ContratoPage({ params, searchParams }: Props) {
  const [{ tenant }, { mes, erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  if (!ctx.isManager) redirect(`/${tenant}/controle`);
  const month = resolveMonth(mes);
  const supabase = await createClient();
  const [{ data: rows }, { data: operations }, summary, { data: quotaRows }] = await Promise.all([
    supabase.from("contracts").select("*, contract_items(id, label, format, quantity)").eq("tenant_id", ctx.tenant.id).order("created_at"),
    supabase.from("operations").select("id, name, tier").eq("tenant_id", ctx.tenant.id).eq("active", true).order("name"),
    contractSummary(supabase, ctx.tenant.id, month),
    supabase.from("tier_quotas").select("tier, posts, stories").eq("tenant_id", ctx.tenant.id),
  ]);
  const quotas = new Map(((quotaRows ?? []) as TierQuota[]).map((q) => [q.tier, q]));
  const opsByTier = new Map<ServiceTier | null, number>();
  for (const o of operations ?? []) opsByTier.set(o.tier, (opsByTier.get(o.tier) ?? 0) + 1);
  const contracts = (rows ?? []) as Contract[];
  const opName = new Map((operations ?? []).map((o) => [o.id, o.name]));

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-subtle">Transparência</p>
          <h1 className="font-display text-page">Contrato vivo</h1>
          <p className="mt-1 max-w-2xl text-body text-ink-muted">
            O que foi contratado para cada mês e quanto já foi entregue. Peças contam quando publicadas; linhas sem formato contam etapas de projeto concluídas.
          </p>
        </div>
        <MonthPicker month={month} basePath={`/${tenant}/contrato`} />
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Entregue no mês</dt>
          <dd className="mt-1 text-metric font-semibold tabular">{summary.delivered}<span className="text-heading font-normal text-ink-subtle"> / {summary.contracted}</span></dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Cumprimento</dt>
          <dd className="mt-1 text-metric font-semibold tabular">{summary.contracted ? Math.round((summary.delivered / summary.contracted) * 100) : 0}%</dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Investimento mensal</dt>
          <dd className="mt-1 text-metric font-semibold tabular">{formatBRL(summary.monthlyFee)}</dd></div>
      </dl>

      <div className={`mt-6 grid items-start gap-6 ${ctx.isHub ? "lg:grid-cols-[1fr_320px]" : ""}`}>
        <div className="space-y-4">
          {contracts.length === 0 && <p className={`${card} p-6 text-body text-ink-muted`}>Nenhum contrato cadastrado.</p>}
          {contracts.map((c) => {
            const lines = summary.lines.filter((l) => l.contractId === c.id);
            return (
              <section key={c.id} className={card}>
                <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-heading font-semibold">{c.name}</h2>
                    <p className="text-caption text-ink-subtle">
                      {c.operation_id ? opName.get(c.operation_id) : "Rede toda"} · {formatBRL(Number(c.monthly_fee))}/mês ·
                      desde {formatDay(c.starts_on)}{c.ends_on && ` até ${formatDay(c.ends_on)}`}
                    </p>
                  </div>
                  <StatusBadge {...(c.active ? { label: "Ativo", tone: "success" as const } : { label: "Encerrado", tone: "neutral" as const })} />
                  {ctx.isHub && (
                    <>
                      <form action={toggleContract.bind(null, tenant, c.id, !c.active)}><button className={btnGhost}>{c.active ? "Encerrar" : "Reativar"}</button></form>
                      <form action={deleteContract.bind(null, tenant, c.id)}><button className={`${btnGhost} text-danger`} aria-label={`Excluir ${c.name}`}><Trash2 className="size-4" /></button></form>
                    </>
                  )}
                </div>
                {c.notes && <p className="border-b border-line px-4 py-2 text-body text-ink-muted">{c.notes}</p>}
                <ul>
                  {c.contract_items.map((it) => {
                    const line = lines.find((l) => l.label === it.label && l.format === it.format);
                    return (
                      <li key={it.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                        <span className="min-w-40 flex-1">
                          <span className="font-semibold">{it.label}</span>
                          <span className="block text-caption text-ink-subtle">{it.format ? `${ITEM_FORMAT[it.format]} publicados` : "Etapas de projeto concluídas"}</span>
                        </span>
                        <span className="w-48">{c.active ? <Progress done={line?.delivered ?? 0} total={it.quantity} label={it.label} /> : <span className="text-caption text-ink-subtle">{it.quantity}/mês</span>}</span>
                        {ctx.isHub && (
                          <form action={deleteContractItem.bind(null, tenant, it.id)}>
                            <button className={btnGhost} aria-label={`Remover ${it.label}`}><Trash2 className="size-4" /></button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {ctx.isHub && (
                  <form action={addContractItem.bind(null, tenant, c.id)} className="grid gap-2 border-t border-line bg-canvas p-3 sm:grid-cols-[1fr_160px_90px_auto] sm:items-end">
                    <Field label="Entrega"><input name="label" required className={input} placeholder="Ex.: Reels por mês" /></Field>
                    <Field label="Conta como">
                      <select name="format" defaultValue="" className={input}>
                        <option value="">Etapas concluídas</option>
                        {Object.entries(ITEM_FORMAT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Qtd/mês"><input type="number" min={1} name="quantity" required defaultValue={4} className={input} /></Field>
                    <button className={btnSecondary}><Plus className="size-4" aria-hidden /> Linha</button>
                  </form>
                )}
              </section>
            );
          })}

          <section className={card}>
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-heading font-semibold">Volume por pacote</h2>
              <p className="text-caption text-ink-subtle">
                Quantas pautas o motor planeja por mês para cada loja, conforme o pacote dela. Reels, carrossel e post contam como posts.
                {(opsByTier.get(null) ?? 0) > 0 && ` ${opsByTier.get(null)} operações ainda sem pacote (defina na página da operação).`}
              </p>
            </div>
            <form action={saveQuotas.bind(null, tenant)}>
              <fieldset disabled={!ctx.isHub}>
                <table className="w-full text-left text-body">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Pacote</th>
                      <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Lojas</th>
                      <th className="h-10 w-32 px-4 text-caption font-medium text-ink-subtle">Posts/mês</th>
                      <th className="h-10 w-32 px-4 text-caption font-medium text-ink-subtle">Stories/mês</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(SERVICE_TIER) as ServiceTier[]).map((t) => (
                      <tr key={t} className="border-b border-line last:border-0">
                        <td className="px-4 py-2 font-semibold">{SERVICE_TIER[t]}</td>
                        <td className="px-4 py-2 tabular text-ink-muted">{opsByTier.get(t) ?? 0}</td>
                        <td className="px-4 py-2"><input type="number" min={0} max={200} name={`${t}_posts`} aria-label={`Posts por mês, ${SERVICE_TIER[t]}`} defaultValue={quotas.get(t)?.posts ?? 0} className={input} /></td>
                        <td className="px-4 py-2"><input type="number" min={0} max={200} name={`${t}_stories`} aria-label={`Stories por mês, ${SERVICE_TIER[t]}`} defaultValue={quotas.get(t)?.stories ?? 0} className={input} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </fieldset>
              {ctx.isHub && <div className="flex justify-end border-t border-line p-3"><button className={btnSecondary}>Salvar volumes</button></div>}
            </form>
          </section>
        </div>

        {ctx.isHub && (
          <aside className={`${card} h-fit p-4`}>
            <h2 className="text-heading font-semibold">Novo contrato</h2>
            <form action={createContract.bind(null, tenant)} className="mt-4 space-y-3">
              <Field label="Nome"><input name="name" required className={input} placeholder="Ex.: Last Mile · Plano Ativação" /></Field>
              <Field label="Abrangência">
                <select name="operation_id" defaultValue="" className={input}>
                  <option value="">Rede toda</option>
                  {(operations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
              <Field label="Fee mensal (R$)"><input name="monthly_fee" inputMode="decimal" required defaultValue="1000" className={input} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início"><input type="date" name="starts_on" required defaultValue={todayIso()} className={input} /></Field>
                <Field label="Fim"><input type="date" name="ends_on" className={input} /></Field>
              </div>
              <Field label="Observações"><textarea name="notes" rows={2} className={textarea} /></Field>
              <button className={`${btnPrimary} w-full`}>Criar contrato</button>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}
