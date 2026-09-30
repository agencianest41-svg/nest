import { redirect } from "next/navigation";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatDay, resolveMonth, shiftMonth } from "@/lib/month";
import { weekdayLong } from "@/lib/pautas";
import { tierCoverage } from "@/lib/network-plan";
import { aiKeyConfigured } from "@/lib/ai";
import { FUNNEL_STAGE, ITEM_FORMAT, NETWORK_PLAN_STATUS, SERVICE_TIER, TIER_ORDER } from "@/lib/labels";
import type { CalendarEvent, Editoria, NetworkPlan, NetworkPlanItem, ServiceTier, TierQuota } from "@/lib/types";
import { Field } from "@/components/field";
import { MonthPicker } from "@/components/month-picker";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import { PendingButton } from "./pending-button";
import { addBaseItem, createBase, deleteBaseItem, generateBaseItems, releaseBase, updateBase, updateBaseItem } from "./actions";

type Props = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ mes?: string; erro?: string; msg?: string; gerado?: string; liberado?: string; pauta?: string }>;
};

const ERRORS: Record<string, string> = {
  dados: "Confira título, formato e data (dentro do mês).",
  salvar: "Não foi possível salvar.",
  permissao: "Só Hub e Marca montam o calendário-base.",
  ia: "A IA não trouxe pautas válidas. Tente de novo.",
  liberar: "Não foi possível liberar para a rede.",
};

export default async function CalendarioBasePage({ params, searchParams }: Props) {
  const [{ tenant }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  if (!ctx.isManager) redirect(`/${tenant}/calendario`);
  // O ciclo trabalha sempre M+1: sem mês na URL, abre o próximo.
  const month = sp.mes ? resolveMonth(sp.mes) : shiftMonth(resolveMonth(), 1);
  const ref = { slug: tenant, month: month.key };
  const supabase = await createClient();

  const [{ data: plan }, { data: quotas }, { data: ops }, { data: editorias }, { data: events }] = await Promise.all([
    supabase.from("network_plans").select("id, month, status, focus, generated_at, released_at")
      .eq("tenant_id", ctx.tenant.id).eq("month", month.first).maybeSingle(),
    supabase.from("tier_quotas").select("tier, posts, stories").eq("tenant_id", ctx.tenant.id),
    supabase.from("operations").select("id, tier, in_pilot").eq("tenant_id", ctx.tenant.id),
    supabase.from("editorias").select("*").eq("tenant_id", ctx.tenant.id).eq("active", true).order("position"),
    supabase.from("calendar_events").select("*").eq("tenant_id", ctx.tenant.id).in("scope", ["nacional", "regional"])
      .lte("starts_on", month.last).gte("ends_on", month.first).order("starts_on"),
  ]);

  const base = plan as NetworkPlan | null;
  const { data: rawItems } = base
    ? await supabase.from("network_plan_items").select("*").eq("network_plan_id", base.id)
      .order("scheduled_on", { nullsFirst: false }).order("position")
    : { data: [] };
  const items = (rawItems ?? []) as NetworkPlanItem[];

  // Em quantas lojas cada pauta já está (depois de liberar).
  const released = new Map<string, number>();
  if (items.length && base?.released_at) {
    const { data } = await supabase.from("plan_items").select("base_item_id").in("base_item_id", items.map((i) => i.id));
    for (const r of data ?? []) released.set(r.base_item_id, (released.get(r.base_item_id) ?? 0) + 1);
  }

  // Mesma regra do banco: piloto, ou a rede toda se não houver piloto; sem pacote = Essencial.
  const opList = (ops ?? []) as { id: string; tier: ServiceTier | null; in_pilot: boolean }[];
  const target = opList.some((o) => o.in_pilot) ? opList.filter((o) => o.in_pilot) : opList;
  const storesByTier = new Map<ServiceTier, number>();
  for (const o of target) storesByTier.set(o.tier ?? "essencial", (storesByTier.get(o.tier ?? "essencial") ?? 0) + 1);

  const coverage = tierCoverage(items, (quotas ?? []) as TierQuota[]);
  const editoriaList = (editorias ?? []) as Editoria[];
  const editoriaName = new Map(editoriaList.map((e) => [e.id, e.name]));
  const eventList = (events ?? []) as CalendarEvent[];
  const eventTitle = new Map(eventList.map((e) => [e.id, e.title]));
  const [liberadoOps, liberadoItems] = (sp.liberado ?? "").split("-").map(Number);
  const aiReady = aiKeyConfigured();

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-page">Calendário-base</h1>
          <p className="mt-1 text-body text-ink-muted">
            As pautas do mês para toda a rede. A IA gera, a Hub revisa e libera; cada loja recebe o que cabe no seu pacote.
          </p>
        </div>
        <MonthPicker month={month} basePath={`/${tenant}/calendario/base`} />
      </header>

      {sp.erro && ERRORS[sp.erro] && (
        <p role="alert" className="mt-4 text-body text-danger">{(sp.erro === "ia" && sp.msg) || ERRORS[sp.erro]}</p>
      )}
      {sp.gerado && <p role="status" className="mt-4 text-body text-success">{sp.gerado} pautas geradas. Revise antes de liberar.</p>}
      {sp.liberado && (
        <p role="status" className="mt-4 text-body text-success">
          Liberado para {liberadoOps} {liberadoOps === 1 ? "loja" : "lojas"}: {liberadoItems} {liberadoItems === 1 ? "pauta nova" : "pautas novas"} nos calendários.
        </p>
      )}

      {!base ? (
        <section className={`${card} mt-6 p-6`}>
          <h2 className="text-heading font-semibold">Ainda não há base para {month.label.toLowerCase()}</h2>
          <p className="mt-1 max-w-2xl text-body text-ink-muted">
            Ciclo sugerido: campanhas e datas no calendário até o dia 10; a base é gerada no dia 15; revisão até o dia 22, quando a
            base é liberada e cada loja vê o próximo mês.
          </p>
          <form action={createBase.bind(null, ref)} className="mt-4">
            <button className={btnPrimary}>Começar a base de {month.label.toLowerCase()}</button>
          </form>
        </section>
      ) : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <section className={card}>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <StatusBadge {...NETWORK_PLAN_STATUS[base.status]} />
                <p className="min-w-0 flex-1 text-caption text-ink-subtle">
                  {items.length} {items.length === 1 ? "pauta" : "pautas"}
                  {base.released_at && ` · liberado em ${formatDay(base.released_at.slice(0, 10))}`}
                </p>
                <form action={generateBaseItems.bind(null, ref, base.id)}>
                  <PendingButton className={btnSecondary} pendingLabel="Gerando a base…">
                    <Sparkles className="size-4" aria-hidden />
                    {items.length ? "Completar com IA" : "Gerar com IA"}
                  </PendingButton>
                </form>
                <form action={releaseBase.bind(null, ref, base.id)}>
                  <PendingButton
                    className={btnPrimary}
                    pendingLabel="Liberando…"
                    confirm={`Liberar ${items.length} pautas para ${target.length} lojas? Cada loja recebe o que cabe no seu pacote.${base.released_at ? " Só as pautas novas serão enviadas." : ""}`}
                  >
                    <Send className="size-4" aria-hidden />
                    {base.released_at ? "Liberar novidades" : "Liberar para a rede"}
                  </PendingButton>
                </form>
              </div>
              {!aiReady && <p className="border-b border-line px-4 py-2 text-caption text-ink-subtle">IA sem chave no servidor: monte a base manualmente.</p>}

              <div className="overflow-x-auto">
                <table className="w-full text-body">
                  <thead className="text-left text-caption text-ink-subtle">
                    <tr>
                      <th className="px-4 py-2 font-medium">Pacote</th>
                      <th className="px-4 py-2 font-medium">Lojas</th>
                      <th className="px-4 py-2 font-medium">Posts</th>
                      <th className="px-4 py-2 font-medium">Stories</th>
                      <th className="px-4 py-2 font-medium">Ativações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.map((c) => (
                      <tr key={c.tier} className="border-t border-line">
                        <td className="px-4 py-2 font-medium">{SERVICE_TIER[c.tier]}</td>
                        <td className="px-4 py-2 tabular">{storesByTier.get(c.tier) ?? 0}</td>
                        <Quota value={c.posts} target={c.quota?.posts} />
                        <Quota value={c.stories} target={c.quota?.stories} />
                        <td className="px-4 py-2 tabular">{c.activations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-4 py-2 text-caption text-ink-subtle">
                Posts e stories acima da cota do pacote ficam de fora, em ordem de data. Lojas sem pacote recebem o Essencial.
              </p>
            </section>

            <section className={card}>
              {items.length === 0 ? (
                <p className="p-6 text-body text-ink-muted">Nenhuma pauta ainda. Gere com IA ou adicione ao lado.</p>
              ) : (
                <ul>
                  {items.map((it) => (
                    <li key={it.id} id={`pauta-${it.id}`} className="scroll-mt-4 border-b border-line last:border-0">
                      <details open={sp.pauta === it.id}>
                        <summary className="flex cursor-pointer list-none items-start gap-4 px-4 py-3 hover:bg-brand-soft">
                          <span className="w-16 shrink-0 text-body font-semibold tabular">{it.scheduled_on ? formatDay(it.scheduled_on) : "Sem data"}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{it.title}</span>
                            <span className="block text-caption text-ink-subtle">
                              {ITEM_FORMAT[it.format]}
                              {it.editoria_id && ` · ${editoriaName.get(it.editoria_id) ?? "Editoria"}`}
                              {it.calendar_event_id && ` · ${eventTitle.get(it.calendar_event_id) ?? "Campanha"}`}
                              {released.has(it.id) && ` · em ${released.get(it.id)} ${released.get(it.id) === 1 ? "loja" : "lojas"}`}
                            </span>
                            {it.idea && <span className="mt-1 block text-body text-ink-muted">{it.idea}</span>}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-caption text-ink-subtle">{SERVICE_TIER[it.min_tier]}+</span>
                            {it.sensitive && <StatusBadge label="Sensível" tone="warning" />}
                          </span>
                        </summary>
                        <div className="border-t border-line bg-canvas px-4 py-4">
                          {it.scheduled_on && <p className="mb-3 text-caption text-ink-subtle">{weekdayLong(it.scheduled_on)}</p>}
                          <form action={updateBaseItem.bind(null, ref, it.id)}>
                            <ItemFields item={it} month={month} editorias={editoriaList} events={eventList} />
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                              <button className={btnSecondary}>Salvar pauta</button>
                              {released.has(it.id) && (
                                <span className="text-caption text-ink-subtle">Mudanças valem para as próximas liberações; as lojas mantêm o que já receberam.</span>
                              )}
                            </div>
                          </form>
                          <form action={deleteBaseItem.bind(null, ref, it.id)} className="mt-2">
                            <button className={btnGhost}><Trash2 className="size-4" aria-hidden />Remover da base</button>
                          </form>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className={`${card} p-4`}>
              <h2 className="text-heading font-semibold">Foco da rede</h2>
              <form action={updateBase.bind(null, ref, base.id)} className="mt-3 space-y-3">
                <Field label="O que a rede precisa empurrar no mês">
                  <textarea name="focus" rows={3} defaultValue={base.focus ?? ""} className={textarea} />
                </Field>
                {base.status !== "liberado" && (
                  <Field label="Situação">
                    <select name="status" defaultValue={base.status} className={input}>
                      <option value="rascunho">Rascunho</option>
                      <option value="revisao">Em revisão</option>
                    </select>
                  </Field>
                )}
                <button className={`${btnSecondary} w-full`}>Salvar</button>
              </form>
            </section>

            <section className={`${card} p-4`}>
              <h2 className="text-heading font-semibold">Nova pauta</h2>
              <form action={addBaseItem.bind(null, ref, base.id)} className="mt-3">
                <ItemFields month={month} editorias={editoriaList} events={eventList} compact />
                <button className={`${btnSecondary} mt-4 w-full`}>Adicionar à base</button>
              </form>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function Quota({ value, target }: { value: number; target: number | undefined }) {
  const short = target !== undefined && value < target;
  return (
    <td className={`px-4 py-2 tabular ${short ? "text-warning" : ""}`}>
      {value}{target !== undefined && <span className="text-ink-subtle"> / {target}</span>}
    </td>
  );
}

function ItemFields({ item, month, editorias, events, compact }: {
  item?: NetworkPlanItem; month: { first: string; last: string }; editorias: Editoria[]; events: CalendarEvent[]; compact?: boolean;
}) {
  const grid = compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2";
  return (
    <div className="space-y-3">
      <Field label="Título"><input name="title" required defaultValue={item?.title} className={input} /></Field>
      <div className={grid}>
        <Field label="Data">
          <input type="date" name="scheduled_on" min={month.first} max={month.last} defaultValue={item?.scheduled_on ?? ""} className={input} />
        </Field>
        <Field label="Formato">
          <select name="format" defaultValue={item?.format ?? "reels"} className={input}>
            {Object.entries(ITEM_FORMAT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Pacote mínimo">
          <select name="min_tier" defaultValue={item?.min_tier ?? "essencial"} className={input}>
            {TIER_ORDER.map((t) => <option key={t} value={t}>{SERVICE_TIER[t]}</option>)}
          </select>
        </Field>
        <Field label="Editoria">
          <select name="editoria_id" defaultValue={item?.editoria_id ?? ""} className={input}>
            <option value="">—</option>
            {editorias.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Funil">
          <select name="funnel" defaultValue={item?.funnel ?? ""} className={input}>
            <option value="">—</option>
            {Object.entries(FUNNEL_STAGE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Campanha">
          <select name="calendar_event_id" defaultValue={item?.calendar_event_id ?? ""} className={input}>
            <option value="">—</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Ideia (o que mostrar)"><textarea name="idea" rows={compact ? 2 : 3} defaultValue={item?.idea ?? ""} className={textarea} /></Field>
      {!compact && (
        <>
          <Field label="Por quê"><textarea name="rationale" rows={2} defaultValue={item?.rationale ?? ""} className={textarea} /></Field>
          <Field label="Gancho"><input name="hook" defaultValue={item?.hook ?? ""} className={input} /></Field>
        </>
      )}
      <label className="flex items-start gap-2 text-body">
        <input type="checkbox" name="sensitive" defaultChecked={item?.sensitive} className="mt-0.5 size-4 accent-[var(--brand)]" />
        <span>Sensível (preço, promoção, regulatório): sobe para revisão da Hub</span>
      </label>
    </div>
  );
}
