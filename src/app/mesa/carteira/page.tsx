import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDeskContext } from "@/lib/staff";
import { contractSummary } from "@/lib/control";
import { resolveMonth } from "@/lib/month";
import { formatBRL, formatMinutes, formatPct } from "@/lib/format";
import { MonthPicker } from "@/components/month-picker";
import { Progress } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { card } from "@/components/ui";

export const metadata = { title: "Carteira · NEST" };

// Câmbio para converter o custo de IA (USD). Ajustável por variável de ambiente.
const USD_BRL = Number(process.env.USD_BRL ?? 5.5) || 5.5;

type Props = { searchParams: Promise<{ mes?: string }> };

// Rentabilidade por cliente: fee do contrato × horas lançadas × custo/hora + IA.
export default async function CarteiraPage({ searchParams }: Props) {
  const { mes } = await searchParams;
  const ctx = await getDeskContext();
  if (!ctx.isStaff) redirect("/mesa");
  const month = resolveMonth(mes);
  const supabase = await createClient();
  const tenants = ctx.tenants.filter((t) => ctx.isAdmin || t.roles.includes("hub"));

  const [{ data: time }, { data: staff }, { data: ai }] = await Promise.all([
    supabase.from("time_entries").select("tenant_id, user_id, minutes").gte("worked_on", month.first).lte("worked_on", month.last),
    supabase.rpc("staff_directory"),
    supabase.from("ai_usage").select("tenant_id, cost_usd").gte("created_at", `${month.first}T00:00:00-03:00`).lte("created_at", `${month.last}T23:59:59-03:00`),
  ]);
  const costOf = new Map(((staff ?? []) as { user_id: string; hourly_cost: number; full_name: string | null; email: string | null }[])
    .map((s) => [s.user_id, s]));
  const summaries = await Promise.all(tenants.map((t) => contractSummary(supabase, t.id, month)));

  const rows = tenants.map((t, i) => {
    const entries = (time ?? []).filter((e) => e.tenant_id === t.id);
    const minutes = entries.reduce((s, e) => s + e.minutes, 0);
    const labor = entries.reduce((s, e) => s + (e.minutes / 60) * Number(costOf.get(e.user_id)?.hourly_cost ?? 0), 0);
    const aiCost = (ai ?? []).filter((a) => a.tenant_id === t.id).reduce((s, a) => s + Number(a.cost_usd), 0) * USD_BRL;
    const fee = summaries[i].monthlyFee;
    const cost = labor + aiCost;
    const margin = fee - cost;
    const byPerson = new Map<string, number>();
    for (const e of entries) byPerson.set(e.user_id, (byPerson.get(e.user_id) ?? 0) + e.minutes);
    return { t, minutes, labor, aiCost, fee, cost, margin, marginPct: fee ? margin / fee : null, summary: summaries[i], byPerson };
  });
  const total = rows.reduce((s, r) => ({ fee: s.fee + r.fee, cost: s.cost + r.cost, minutes: s.minutes + r.minutes }), { fee: 0, cost: 0, minutes: 0 });
  const noCost = [...costOf.values()].filter((s) => !Number(s.hourly_cost)).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-page">Carteira</h1>
          <p className="mt-1 max-w-2xl text-body text-ink-muted">Quanto cada cliente paga, quanto custa atender (horas × custo/hora + IA) e se o escopo contratado está sendo entregue.</p>
        </div>
        <MonthPicker month={month} basePath="/mesa/carteira" />
      </header>

      {noCost > 0 && (
        <p className="rounded-sm border border-warning/20 bg-warning/5 p-3 text-body text-warning">
          {noCost} pessoa{noCost > 1 ? "s" : ""} da equipe sem custo/hora cadastrado: a margem está superestimada. {ctx.isAdmin && <Link href="/mesa/equipe" className="font-semibold underline">Cadastrar em Equipe</Link>}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Receita (fees)</dt><dd className="mt-1 text-metric font-semibold tabular">{formatBRL(total.fee)}</dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Custo</dt><dd className="mt-1 text-metric font-semibold tabular">{formatBRL(total.cost)}</dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Margem</dt><dd className="mt-1 text-metric font-semibold tabular">{total.fee ? formatPct((total.fee - total.cost) / total.fee) : "—"}</dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Horas lançadas</dt><dd className="mt-1 text-metric font-semibold tabular">{formatMinutes(total.minutes)}</dd></div>
      </dl>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[820px] text-left text-body">
          <thead><tr className="border-b border-line">
            {["Cliente", "Fee", "Horas", "Custo equipe", "IA", "Margem", "Escopo entregue"].map((h) => <th key={h} className="h-10 px-4 text-caption font-medium text-ink-subtle">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t.id} className="border-b border-line align-top last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/${r.t.slug}/controle?mes=${month.key}`} className="font-semibold hover:text-brand">{r.t.name}</Link>
                  {r.byPerson.size > 0 && (
                    <p className="text-caption text-ink-subtle">
                      {[...r.byPerson].map(([u, m]) => `${costOf.get(u)?.full_name || costOf.get(u)?.email?.split("@")[0] || "—"} ${formatMinutes(m)}`).join(" · ")}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 tabular">{formatBRL(r.fee)}</td>
                <td className="px-4 py-3 tabular">{formatMinutes(r.minutes)}</td>
                <td className="px-4 py-3 tabular">{formatBRL(r.labor)}</td>
                <td className="px-4 py-3 tabular">{formatBRL(r.aiCost)}</td>
                <td className="px-4 py-3">
                  {r.marginPct === null ? <span className="text-ink-subtle">sem contrato</span> : (
                    <StatusBadge label={`${formatBRL(r.margin)} · ${formatPct(r.marginPct)}`} tone={r.marginPct < 0 ? "danger" : r.marginPct < 0.3 ? "warning" : "success"} />
                  )}
                </td>
                <td className="w-44 px-4 py-3">
                  {r.summary.contracted ? <Progress done={r.summary.delivered} total={r.summary.contracted} label={`Escopo ${r.t.name}`} /> : <span className="text-caption text-ink-subtle">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-ink-muted">Você não está como Hub em nenhuma marca.</td></tr>}
          </tbody>
        </table>
      </section>
      <p className="text-caption text-ink-subtle">IA convertida a {USD_BRL.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por dólar (variável USD_BRL). Margem abaixo de 30% aparece em alerta.</p>
    </div>
  );
}
