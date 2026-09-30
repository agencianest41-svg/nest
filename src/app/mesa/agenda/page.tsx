import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDeskContext } from "@/lib/staff";
import { formatDay, todayIso } from "@/lib/month";
import { MEETING_STATUS, WEEKDAYS, currentCycle, dayKey, formatLongDay, formatTime, type Meeting } from "@/lib/alignment";
import { StatusBadge } from "@/components/status-badge";
import { Field } from "@/components/field";
import { btnGhost, btnSecondary, card, input } from "@/components/ui";
import { addAvailability, addBlock, removeAvailability, removeBlock, saveSettings } from "./actions";

export const metadata = { title: "Agenda · NEST" };

type Props = { searchParams: Promise<{ erro?: string }> };
type Row = Meeting & { operations: { name: string } | null; tenants: { name: string; slug: string } | null };

const ERRORS: Record<string, string> = {
  config: "Confira o link (https://), a duração e a antecedência.",
  janela: "Escolha pelo menos um dia e um horário de fim depois do início.",
  bloqueio: "Confira as datas do bloqueio.",
  salvar: "Não foi possível salvar. Tente de novo.",
};

export default async function AgendaPage({ searchParams }: Props) {
  const { erro } = await searchParams;
  const ctx = await getDeskContext();
  if (!ctx.isStaff) redirect("/mesa");
  const { cycle, deadline } = currentCycle();
  const supabase = await createClient();

  const [{ data: meetings }, { data: mine }, { data: settings }, { data: windows }, { data: blocks }] = await Promise.all([
    supabase.from("alignment_meetings").select("*, operations(name), tenants(name, slug)")
      .eq("consultant_id", ctx.userId).neq("status", "cancelada").gte("starts_at", `${todayIso()}T00:00:00-03:00`)
      .order("starts_at").limit(100),
    supabase.from("operations").select("id, name, tenant_id").eq("consultant_id", ctx.userId).eq("active", true).order("name"),
    supabase.from("consultant_settings").select("*").eq("user_id", ctx.userId).maybeSingle(),
    supabase.from("consultant_availability").select("id, weekday, starts, ends").eq("consultant_id", ctx.userId).order("weekday").order("starts"),
    supabase.from("consultant_blocks").select("id, starts_at, ends_at, reason").eq("consultant_id", ctx.userId)
      .gte("ends_at", new Date().toISOString()).order("starts_at"),
  ]);
  const upcoming = (meetings ?? []) as Row[];
  const stores = mine ?? [];
  const storeIds = stores.map((s) => s.id);
  const [{ data: cycleMeetings }, { data: checkins }] = storeIds.length
    ? await Promise.all([
        supabase.from("alignment_meetings").select("operation_id").in("operation_id", storeIds).eq("month", cycle.first).neq("status", "cancelada"),
        supabase.from("monthly_checkins").select("operation_id").in("operation_id", storeIds).eq("month", cycle.first),
      ])
    : [{ data: [] }, { data: [] }];
  const booked = new Set((cycleMeetings ?? []).map((m) => m.operation_id));
  const withCheckin = new Set((checkins ?? []).map((c) => c.operation_id));
  const pending = stores.filter((s) => !booked.has(s.id));
  const slugOf = new Map(ctx.tenants.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-page">Agenda</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-muted">
          Reuniões mensais de alinhamento com as lojas da sua carteira. {cycle.label}: {booked.size} de {stores.length} lojas marcaram (prazo {formatDay(deadline)}).
        </p>
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <section className={card}>
          <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Próximas reuniões <span className="text-body font-normal text-ink-subtle tabular">{upcoming.length}</span></h2>
          {upcoming.length === 0 ? <p className="px-4 py-3 text-body text-ink-muted">Nenhuma reunião marcada.</p> : (
            <ul>
              {upcoming.map((m, i) => {
                const newDay = i === 0 || dayKey(upcoming[i - 1].starts_at) !== dayKey(m.starts_at);
                return (
                  <li key={m.id} className="border-b border-line last:border-0">
                    {newDay && <p className="bg-canvas px-4 py-1.5 text-caption font-medium text-ink-subtle">{formatLongDay(m.starts_at)}</p>}
                    <Link href={`/mesa/agenda/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-brand-soft">
                      <span className="w-24 tabular text-ink-muted">{formatTime(m.starts_at)}–{formatTime(m.ends_at)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{m.operations?.name}</span>
                        <span className="block text-caption text-ink-subtle">{m.tenants?.name}</span>
                      </span>
                      <StatusBadge {...MEETING_STATUS[m.status]} />
                      <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={card}>
          <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Ainda não marcaram <span className="text-body font-normal text-ink-subtle tabular">{pending.length}</span></h2>
          {stores.length === 0 ? (
            <p className="px-4 py-3 text-body text-ink-muted">Nenhuma loja na sua carteira. A gestão define o consultor em Alinhamento, dentro de cada marca.</p>
          ) : pending.length === 0 ? <p className="px-4 py-3 text-body text-ink-muted">Todas as lojas marcaram. 🎉</p> : (
            <ul>
              {pending.map((s) => (
                <li key={s.id} className="flex items-center gap-2 border-b border-line px-4 py-2 last:border-0">
                  <Link href={`/${slugOf.get(s.tenant_id)?.slug}/alinhamento?loja=${s.id}`} className="min-w-0 flex-1 font-medium hover:text-brand">{s.name}</Link>
                  {withCheckin.has(s.id) ? <StatusBadge label="Check-in ok" tone="info" /> : <StatusBadge label="Sem check-in" tone="warning" />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={card}>
        <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Meus horários de atendimento</h2>
        <div className="grid gap-6 p-4 lg:grid-cols-3">
          <form action={saveSettings} className="space-y-3">
            <Field label="Link fixo da chamada (Meet, Zoom…)">
              <input name="meeting_url" type="url" placeholder="https://meet.google.com/…" defaultValue={settings?.meeting_url ?? ""} className={input} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duração (min)">
                <input name="slot_minutes" type="number" min={15} max={180} step={5} defaultValue={settings?.slot_minutes ?? 45} className={input} />
              </Field>
              <Field label="Antecedência (h)">
                <input name="notice_hours" type="number" min={0} max={168} defaultValue={settings?.notice_hours ?? 24} className={input} />
              </Field>
            </div>
            <button className={btnSecondary}>Salvar preferências</button>
          </form>

          <div>
            <p className="text-[13px] font-medium text-ink-muted">Janelas semanais</p>
            {(windows ?? []).length === 0 ? <p className="mt-2 text-body text-ink-muted">Sem janelas: as lojas não verão horários.</p> : (
              <ul className="mt-2 space-y-1">
                {(windows ?? []).map((w) => (
                  <li key={w.id} className="flex items-center gap-2 text-body">
                    <span className="w-20 font-medium">{WEEKDAYS[w.weekday]}</span>
                    <span className="flex-1 tabular text-ink-muted">{w.starts.slice(0, 5)}–{w.ends.slice(0, 5)}</span>
                    <form action={removeAvailability.bind(null, w.id)}><button className={btnGhost} aria-label="Remover janela"><Trash2 className="size-4" /></button></form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addAvailability} className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d, i) => (
                  <label key={d} className="cursor-pointer">
                    <input type="checkbox" name="weekday" value={i} className="peer sr-only" defaultChecked={i >= 1 && i <= 5} />
                    <span className="inline-flex h-8 items-center rounded-sm border border-line-strong px-2 text-caption peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand-soft">{d.slice(0, 3)}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input name="starts" type="time" defaultValue="09:00" aria-label="Início" className={`${input} w-28`} />
                <span className="text-ink-subtle">até</span>
                <input name="ends" type="time" defaultValue="12:00" aria-label="Fim" className={`${input} w-28`} />
              </div>
              <button className={btnSecondary}>Adicionar janela</button>
            </form>
          </div>

          <div>
            <p className="text-[13px] font-medium text-ink-muted">Bloqueios (férias, feriados)</p>
            {(blocks ?? []).length === 0 ? <p className="mt-2 text-body text-ink-muted">Nenhum bloqueio.</p> : (
              <ul className="mt-2 space-y-1">
                {(blocks ?? []).map((b) => {
                  const last = new Date(new Date(b.ends_at).getTime() - 1).toISOString();
                  return (
                    <li key={b.id} className="flex items-center gap-2 text-body">
                      <span className="flex-1">
                        <span className="tabular">{formatDay(dayKey(b.starts_at))}{dayKey(last) !== dayKey(b.starts_at) && ` – ${formatDay(dayKey(last))}`}</span>
                        {b.reason && <span className="text-ink-muted"> · {b.reason}</span>}
                      </span>
                      <form action={removeBlock.bind(null, b.id)}><button className={btnGhost} aria-label="Remover bloqueio"><Trash2 className="size-4" /></button></form>
                    </li>
                  );
                })}
              </ul>
            )}
            <form action={addBlock} className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <input name="from" type="date" required aria-label="De" className={input} />
                <span className="text-ink-subtle">até</span>
                <input name="to" type="date" required aria-label="Até" className={input} />
              </div>
              <input name="reason" placeholder="Motivo (opcional)" className={input} />
              <button className={btnSecondary}>Bloquear</button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
