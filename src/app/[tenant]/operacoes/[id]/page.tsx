import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatDay, formatRange, resolveMonth, todayIso } from "@/lib/month";
import { EVENT_SCOPE, FUNNEL_STAGE, ITEM_FORMAT, ITEM_STATUS, ITEM_STATUS_ORDER, PLAN_STATUS, SERVICE_TIER } from "@/lib/labels";
import { quotaProgress } from "@/lib/pautas";
import type { CalendarEvent, Comment, Editoria, ItemStatus, MonthlyPlan, Operation, PlanItem, Profile, TierQuota } from "@/lib/types";
import { loadProfiles } from "@/lib/people";
import { Comments } from "@/components/comments";
import { addComment } from "../../projetos/actions";
import { addResult, deleteResult, promoteToPractice } from "../../resultados/actions";
import { ItemResults } from "./item-results";
import type { ResultEntry } from "@/lib/results";
import { Field } from "@/components/field";
import { MonthPicker } from "@/components/month-picker";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import { Progress } from "@/components/progress";
import { addItem, addLocalEvent, advanceItem, createPlan, deleteItem, setTier, updateItem, updatePlan } from "./actions";
import { draftPlanItem, suggestPlanIdeas } from "./studio-actions";
import { ItemEditor, type Option } from "./item-editor";
import { MonthCalendar, UpNext } from "./month-calendar";
import { PautaPanel } from "./pauta-panel";
import { checkBrandText } from "../../marca/check-action";
import { StudioPanel } from "./studio-panel";

type Props = {
  params: Promise<{ tenant: string; id: string }>;
  searchParams: Promise<{ mes?: string; erro?: string; peca?: string; vista?: string }>;
};

const ERRORS: Record<string, string> = {
  dados: "Confira os campos preenchidos.",
  salvar: "Não foi possível salvar. Tente de novo.",
  resultado: "Confira os números e a data do resultado (link precisa começar com https://).",
  permissao: "Só Hub e Marca fazem isso.",
  aprovacao: "Só Hub ou Marca aprovam peças, e a peça precisa estar aprovada antes de ser publicada.",
  marca: "A peça usa um termo proibido pela marca. Use “Checar marca” para ver qual e ajuste antes de enviar.",
  cerebro: "Editoria, funil, o porquê e pautas sensíveis são definidos pela Hub ou pela Marca.",
  link: "Cole o link do post publicado (começando com https://).",
  mudou: "A pauta mudou de etapa enquanto você olhava. Confira e tente de novo.",
};

export default async function OperacaoPage({ params, searchParams }: Props) {
  const [{ tenant, id }, { mes, erro, peca, vista }] = await Promise.all([params, searchParams]);
  const planning = vista === "lista";
  const ctx = await getTenantContext(tenant);
  const month = resolveMonth(mes);
  const supabase = await createClient();

  const { data: op } = await supabase.from("operations")
    .select("id, region_id, name, city, state, instagram, kind, in_pilot, tier, regions(name)")
    .eq("tenant_id", ctx.tenant.id).eq("id", id).maybeSingle();
  if (!op) notFound();
  const operation = op as unknown as Operation & { regions: { name: string } | null };

  const [{ data: plan }, { data: events }, { data: editoriaRows }, { data: kitRows }, { data: practiceRows }, { data: quota }] = await Promise.all([
    supabase.from("monthly_plans").select("id, operation_id, month, status, focus")
      .eq("operation_id", id).eq("month", month.first).maybeSingle(),
    supabase.from("calendar_events").select("*").eq("tenant_id", ctx.tenant.id)
      .lte("starts_on", month.last).gte("ends_on", month.first)
      .or(`scope.eq.nacional,region_id.eq.${operation.region_id},operation_id.eq.${id}`)
      .order("starts_on"),
    supabase.from("editorias").select("*").eq("tenant_id", ctx.tenant.id).order("position"),
    supabase.from("kits").select("id, title").eq("tenant_id", ctx.tenant.id).order("created_at", { ascending: false }),
    supabase.from("best_practices").select("id, title").eq("tenant_id", ctx.tenant.id).order("created_at", { ascending: false }).limit(50),
    operation.tier
      ? supabase.from("tier_quotas").select("tier, posts, stories").eq("tenant_id", ctx.tenant.id).eq("tier", operation.tier).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const { data: items } = plan
    ? await supabase.from("plan_items").select("*").eq("plan_id", plan.id)
        .order("scheduled_on", { ascending: true, nullsFirst: false }).order("created_at")
    : { data: [] };

  const itemIds = (items ?? []).map((i) => i.id as string);
  const { data: commentRows } = itemIds.length
    ? await supabase.from("comments").select("*").eq("entity_type", "plan_item").in("entity_id", itemIds).order("created_at")
    : { data: [] };
  const comments = (commentRows ?? []) as Comment[];
  const { data: resultRows } = itemIds.length
    ? await supabase.from("result_entries").select("*").in("plan_item_id", itemIds).order("measured_on")
    : { data: [] };
  const results = (resultRows ?? []) as ResultEntry[];
  const people = await loadProfiles(supabase, comments.map((c) => c.author_id));

  const ref = { slug: tenant, operationId: id, month: month.key, ...(planning ? { vista: "lista" as const } : {}) };
  const editorias = (editoriaRows ?? []) as Editoria[];
  const kits: Option[] = (kitRows ?? []).map((k) => ({ id: k.id, label: k.title }));
  const practices: Option[] = (practiceRows ?? []).map((p) => ({ id: p.id, label: p.title }));
  const lookups = { editorias, kits, practices };
  const today = todayIso();
  const baseHref = `/${tenant}/operacoes/${id}?mes=${month.key}`;
  const pautaHref = (itemId: string) => `${baseHref}&peca=${itemId}`;
  const monthEvents = (events ?? []) as CalendarEvent[];
  const eventTitle = new Map(monthEvents.map((e) => [e.id, e.title]));
  const planItems = (items ?? []) as PlanItem[];
  const statusOptions = ITEM_STATUS_ORDER;
  const progress = quotaProgress(planItems, (quota ?? null) as TierQuota | null);
  const selected = !planning && peca ? planItems.find((i) => i.id === peca) : undefined;
  const editorForPanel = (item: PlanItem) => (
    <ItemEditor
      item={item}
      statusOptions={statusOptions.filter((s) => ctx.isManager || s !== "aprovado" || item.status === "aprovado")}
      {...lookups}
      isManager={ctx.isManager}
      save={updateItem.bind(null, ref, item.id)}
      remove={deleteItem.bind(null, ref, item.id)}
      draft={draftPlanItem.bind(null, ref, item.id)}
      check={checkBrandText.bind(null, tenant)}
    />
  );

  return (
    <div className="mx-auto max-w-6xl">
      {ctx.isManager || ctx.memberships.some((m) => m.role === "regional") ? (
        <Link href={`/${tenant}?mes=${month.key}`} className={`${btnGhost} -ml-2`}>
          <ArrowLeft className="size-4" aria-hidden /> Rede
        </Link>
      ) : null}

      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-subtle">
            {operation.regions?.name} · {[operation.city, operation.state].filter(Boolean).join(" · ")}
          </p>
          <h1 className="font-display text-page">{operation.name}</h1>
          <p className="text-body text-ink-muted">
            {operation.instagram}{operation.instagram && " · "}
            {operation.tier ? `Pacote ${SERVICE_TIER[operation.tier]}` : "Pacote não definido"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ctx.isManager && (
            <form action={setTier.bind(null, ref)} className="flex items-center gap-1.5">
              <select name="tier" defaultValue={operation.tier ?? ""} aria-label="Pacote da operação" className={`${input} h-9 w-44`}>
                <option value="">Sem pacote</option>
                {Object.entries(SERVICE_TIER).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button className={`${btnGhost} h-9`}>Salvar</button>
            </form>
          )}
          <MonthPicker month={month} basePath={`/${tenant}/operacoes/${id}`} />
        </div>
      </header>

      <nav className="mt-6 flex gap-1 border-b border-line" aria-label="Visão do mês">
        {[{ key: "calendario", label: "Calendário", href: baseHref, active: !planning },
          { key: "lista", label: "Planejamento", href: `${baseHref}&vista=lista`, active: planning }].map((t) => (
          <Link key={t.key} href={t.href} aria-current={t.active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-body font-semibold ${t.active ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {erro && ERRORS[erro] && !selected && (
        <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>
      )}

      {!planning && (
        !plan ? (
          <EmptyPlan label={month.label} action={createPlan.bind(null, ref)} />
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <QuotaCard progress={progress} tierSet={Boolean(operation.tier)} counts={ITEM_STATUS_ORDER.map((s) => ({ s, n: planItems.filter((i) => i.status === s).length }))} />
              <UpNext items={planItems} today={today} hrefFor={pautaHref} />
            </div>
            {planItems.length === 0 && (
              <p className={`${card} p-4 text-body text-ink-muted`}>
                Nenhuma pauta neste mês ainda.{" "}
                <Link href={`${baseHref}&vista=lista`} className="font-semibold text-ink underline underline-offset-2">Planejar o mês</Link>
              </p>
            )}
            <MonthCalendar
              month={month}
              today={today}
              items={planItems}
              events={monthEvents}
              editoriaName={new Map(editorias.map((e) => [e.id, e.name]))}
              hrefFor={pautaHref}
              selected={selected?.id}
            />
          </div>
        )
      )}

      {selected && (
        <PautaPanel
          item={selected}
          slug={tenant}
          closeHref={baseHref}
          editoria={editorias.find((e) => e.id === selected.editoria_id)}
          eventTitle={selected.calendar_event_id ? eventTitle.get(selected.calendar_event_id) : undefined}
          kit={kits.filter((k) => k.id === selected.kit_id).map((k) => ({ id: k.id, title: k.label }))[0]}
          practice={practices.filter((p) => p.id === selected.practice_id).map((p) => ({ id: p.id, title: p.label }))[0]}
          isManager={ctx.isManager}
          advance={(from) => advanceItem.bind(null, ref, selected.id, from)}
          error={erro ? ERRORS[erro] : undefined}
          editor={editorForPanel(selected)}
          results={
            <ItemResults
              item={selected}
              results={results.filter((r) => r.plan_item_id === selected.id)}
              isManager={ctx.isManager}
              add={addResult.bind(null, tenant, id, selected.id, pautaHref(selected.id))}
              remove={(rid) => deleteResult.bind(null, tenant, rid, pautaHref(selected.id))}
              promote={promoteToPractice.bind(null, tenant, selected.id, pautaHref(selected.id))}
            />
          }
          conversation={
            <Comments
              comments={comments.filter((c) => c.entity_id === selected.id)}
              people={people}
              canInternal={ctx.isHub}
              action={addComment.bind(null, tenant, { type: "plan_item", id: selected.id }, pautaHref(selected.id))}
            />
          }
        />
      )}

      {planning && (
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[320px_1fr]">
        {/* Calendário que alimenta o plano: nacional + região + datas da própria loja */}
        <aside className="space-y-4">
          <section className={card}>
            <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Calendário do mês</h2>
            {monthEvents.length === 0 ? (
              <p className="px-4 py-3 text-body text-ink-muted">Nenhum evento neste mês.</p>
            ) : (
              <ul>
                {monthEvents.map((e) => (
                  <li key={e.id} className="border-b border-line px-4 py-3 last:border-0">
                    <p className="text-caption font-semibold text-ink-subtle tabular">
                      {formatRange(e.starts_on, e.ends_on)} · {EVENT_SCOPE[e.scope]}
                    </p>
                    <p className="font-semibold">{e.title}</p>
                    {e.notes && <p className="text-body text-ink-muted">{e.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className={`${card} group`}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-body font-semibold">
              <Plus className="size-4" aria-hidden /> Data local da loja
            </summary>
            <form action={addLocalEvent.bind(null, ref)} className="space-y-3 border-t border-line p-4">
              <Field label="O que acontece na cidade"><input name="title" required className={input} placeholder="Ex.: aniversário do shopping" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início"><input type="date" name="starts_on" required defaultValue={month.first} className={input} /></Field>
                <Field label="Fim"><input type="date" name="ends_on" className={input} /></Field>
              </div>
              <button className={`${btnSecondary} w-full`}>Adicionar</button>
            </form>
          </details>
        </aside>

        <section className="min-w-0">
          {!plan ? (
            <EmptyPlan label={month.label} action={createPlan.bind(null, ref)} />
          ) : (
            <PlanView
              plan={plan as MonthlyPlan}
              items={planItems}
              events={monthEvents}
              eventTitle={eventTitle}
              refData={ref}
              isManager={ctx.isManager}
              isHub={ctx.isHub}
              statusOptions={statusOptions}
              comments={comments}
              people={people}
              results={results}
              openItem={peca}
              lookups={lookups}
            />
          )}
        </section>
      </div>
      )}
    </div>
  );
}

function EmptyPlan({ label, action }: { label: string; action: () => Promise<void> }) {
  return (
    <div className={`${card} mt-6 p-8 text-center`}>
      <h2 className="text-title font-semibold">Sem plano para {label.toLowerCase()}</h2>
      <p className="mx-auto mt-1 max-w-md text-body text-ink-muted">
        O plano mensal organiza o que a loja vai publicar e ativar, a partir do calendário nacional e da realidade da cidade.
      </p>
      <form action={action} className="mt-4">
        <button className={btnPrimary}>Criar plano do mês</button>
      </form>
    </div>
  );
}

function QuotaCard({ progress, tierSet, counts }: {
  progress: ReturnType<typeof quotaProgress>;
  tierSet: boolean;
  counts: { s: ItemStatus; n: number }[];
}) {
  const rows = [{ label: "Posts", p: progress.posts }, { label: "Stories", p: progress.stories }];
  return (
    <section className={`${card} p-4`}>
      <h2 className="text-heading font-semibold">Entrega do mês</h2>
      <div className="mt-3 space-y-3">
        {rows.map(({ label, p }) => (
          <div key={label}>
            <div className="flex items-baseline justify-between gap-2 text-body">
              <span className="font-medium">{label}</span>
              <span className="text-caption text-ink-subtle tabular">
                {p.planned} planejados{p.target !== null && ` · meta ${p.target}`}
              </span>
            </div>
            <div className="mt-1"><Progress done={p.published} total={p.target ?? Math.max(p.planned, 1)} label={`${label} publicados`} /></div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-caption text-ink-subtle">
        {counts.filter((c) => c.n).map((c) => <span key={c.s}>{ITEM_STATUS[c.s].label}: <b className="font-semibold text-ink-muted tabular">{c.n}</b></span>)}
        {!tierSet && <span>Sem pacote definido: a meta aparece quando a Hub definir o pacote da loja.</span>}
      </p>
    </section>
  );
}

function PlanView({
  plan, items, events, eventTitle, refData, isManager, isHub, statusOptions, comments, people, results, openItem, lookups,
}: {
  plan: MonthlyPlan;
  items: PlanItem[];
  events: CalendarEvent[];
  eventTitle: Map<string, string>;
  refData: { slug: string; operationId: string; month: string };
  isManager: boolean;
  isHub: boolean;
  statusOptions: ItemStatus[];
  comments: Comment[];
  people: Map<string, Profile>;
  results: ResultEntry[];
  openItem?: string;
  lookups: { editorias: Editoria[]; kits: Option[]; practices: Option[] };
}) {
  const base = `/${refData.slug}/operacoes/${refData.operationId}?mes=${refData.month}&vista=lista`;
  const backTo = (itemId: string) => `${base}&peca=${itemId}#peca-${itemId}`;
  const grouped = ITEM_STATUS_ORDER.map((s) => ({ status: s, items: items.filter((i) => i.status === s) }));

  return (
    <div className="space-y-6">
      <form action={updatePlan.bind(null, refData, plan.id)} className={`${card} grid gap-3 p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end`}>
        <Field label="Foco do mês">
          <input name="focus" defaultValue={plan.focus ?? ""} className={input} placeholder="Ex.: Outubro Rosa + rituais de autocuidado" />
        </Field>
        <Field label="Status do plano">
          <select name="status" defaultValue={plan.status} className={input}>
            {Object.entries(PLAN_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
          </select>
        </Field>
        <button className={`${btnSecondary} h-10`}>Salvar</button>
      </form>

      <StudioPanel action={suggestPlanIdeas.bind(null, refData)} />

      <form action={addItem.bind(null, refData, plan.id)} className={`${card} space-y-3 p-4`}>
        <Field label="Nova pauta"><input name="title" required className={input} placeholder="Ex.: Reels “como fazer seu perfume durar mais”" /></Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_150px_1.2fr_auto] sm:items-end">
          <Field label="Formato">
            <select name="format" className={input}>
              {Object.entries(ITEM_FORMAT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Data"><input type="date" name="scheduled_on" min={`${refData.month}-01`} className={input} /></Field>
          <Field label="Ligada a">
            <select name="calendar_event_id" className={input} defaultValue="">
              <option value="">—</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </Field>
          <button className={`${btnPrimary} h-10`}><Plus className="size-4" aria-hidden /> Adicionar</button>
        </div>
        <details>
          <summary className="cursor-pointer text-caption font-semibold text-ink-muted">Cérebro da pauta (editoria, ideia, por quê)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Editoria">
              <select name="editoria_id" defaultValue="" className={input}>
                <option value="">—</option>
                {lookups.editorias.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Estágio do funil">
              <select name="funnel" defaultValue="" className={input}>
                <option value="">—</option>
                {Object.entries(FUNNEL_STAGE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="A ideia (o que mostrar)"><textarea name="idea" rows={2} className={textarea} /></Field>
            <Field label="Por que postar"><textarea name="rationale" rows={2} className={textarea} /></Field>
            {isManager && (
              <label className="flex items-center gap-2 text-body sm:col-span-2">
                <input type="hidden" name="sensitive_field" value="1" />
                <input type="checkbox" name="sensitive" className="size-4 accent-[var(--brand)]" /> Pauta sensível (sempre passa por revisão)
              </label>
            )}
          </div>
        </details>
      </form>

      {items.length === 0 && (
        <p className="text-body text-ink-muted">Nenhuma peça ainda. Comece pelas datas do calendário ao lado.</p>
      )}

      {grouped.filter((g) => g.items.length).map((g) => (
        <section key={g.status}>
          <h3 className="mb-2 flex items-center gap-2">
            <StatusBadge {...ITEM_STATUS[g.status]} />
            <span className="text-body text-ink-subtle tabular">{g.items.length}</span>
          </h3>
          <ul className={card}>
            {g.items.map((item) => (
              <li key={item.id} id={`peca-${item.id}`} className="scroll-mt-4 border-b border-line last:border-0">
                <details open={openItem === item.id}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-brand-soft">
                    <span className="w-16 text-body font-semibold tabular text-ink-muted">
                      {item.scheduled_on ? formatDay(item.scheduled_on) : "—"}
                    </span>
                    <span className="min-w-0 flex-1 font-semibold">{item.title}</span>
                    <span className="text-caption text-ink-subtle">
                      {ITEM_FORMAT[item.format]}
                      {item.calendar_event_id && eventTitle.get(item.calendar_event_id) && ` · ${eventTitle.get(item.calendar_event_id)}`}
                    </span>
                  </summary>
                  <ItemEditor
                    item={item}
                    statusOptions={statusOptions.filter((s) => isManager || s !== "aprovado" || item.status === "aprovado")}
                    {...lookups}
                    isManager={isManager}
                    save={updateItem.bind(null, refData, item.id)}
                    remove={deleteItem.bind(null, refData, item.id)}
                    draft={draftPlanItem.bind(null, refData, item.id)}
                    check={checkBrandText.bind(null, refData.slug)}
                  />
                  <ItemResults
                    item={item}
                    results={results.filter((r) => r.plan_item_id === item.id)}
                    isManager={isManager}
                    add={addResult.bind(null, refData.slug, refData.operationId, item.id, backTo(item.id))}
                    remove={(id) => deleteResult.bind(null, refData.slug, id, backTo(item.id))}
                    promote={promoteToPractice.bind(null, refData.slug, item.id, backTo(item.id))}
                  />
                  <div className="border-t border-line bg-canvas px-4 pb-4">
                    <p className="label pt-3 text-ink-muted">Conversa</p>
                    <Comments
                      comments={comments.filter((c) => c.entity_id === item.id)}
                      people={people}
                      canInternal={isHub}
                      action={addComment.bind(null, refData.slug, { type: "plan_item", id: item.id }, backTo(item.id))}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
