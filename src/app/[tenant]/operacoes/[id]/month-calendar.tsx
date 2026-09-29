import Link from "next/link";
import { Camera, Clapperboard, GalleryHorizontal, Image as ImageIcon, MessageCircle, PartyPopper, Store, type LucideIcon } from "lucide-react";
import { formatDay, type Month } from "@/lib/month";
import { ITEM_FORMAT, ITEM_STATUS } from "@/lib/labels";
import { monthWeeks, WEEKDAYS, weekdayLong } from "@/lib/pautas";
import type { CalendarEvent, ItemFormat, ItemStatus, PlanItem } from "@/lib/types";
import { card } from "@/components/ui";

export const FORMAT_ICON: Record<ItemFormat, LucideIcon> = {
  reels: Clapperboard,
  carrossel: GalleryHorizontal,
  stories: Camera,
  post: ImageIcon,
  whatsapp: MessageCircle,
  evento: PartyPopper,
  acao_loja: Store,
};

// Barra lateral do card por status: a palavra aparece no painel; aqui a cor
// só reforça (nunca é a única pista, o título do card traz o status).
const STATUS_BAR: Record<ItemStatus, string> = {
  ideia: "border-l-line-strong",
  roteiro: "border-l-info",
  aprovacao: "border-l-warning",
  aprovado: "border-l-success",
  publicado: "border-l-ink",
};

type Props = {
  month: Month;
  today: string;
  items: PlanItem[];
  events: CalendarEvent[];
  editoriaName: Map<string, string>;
  hrefFor: (itemId: string) => string;
  selected?: string;
};

function eventsOn(events: CalendarEvent[], day: string) {
  return events.filter((e) => e.starts_on <= day && e.ends_on >= day);
}

// Campanhas longas (mais de uma semana) vão para a faixa do mês; nos dias
// ficam só as datas curtas, para a grade não repetir o mesmo nome 30 vezes.
function spanDays(e: CalendarEvent) {
  return (Date.parse(e.ends_on) - Date.parse(e.starts_on)) / 86_400_000 + 1;
}

function PautaChip({ item, editoria, href, selected }: { item: PlanItem; editoria?: string; href: string; selected: boolean }) {
  const Icon = FORMAT_ICON[item.format];
  const done = item.status === "publicado";
  return (
    <Link
      href={href}
      scroll={false}
      title={`${item.title} · ${ITEM_FORMAT[item.format]} · ${ITEM_STATUS[item.status].label}`}
      aria-current={selected ? "true" : undefined}
      className={`block rounded-sm border border-l-[3px] border-line bg-surface px-1.5 py-1 text-left shadow-xs transition-colors hover:border-line-strong hover:bg-canvas ${STATUS_BAR[item.status]} ${selected ? "ring-2 ring-ink/20" : ""}`}
    >
      <span className={`flex items-start gap-1 text-caption font-medium leading-4 ${done ? "text-ink-subtle line-through decoration-ink-subtle/50" : "text-ink"}`}>
        <Icon className="mt-px size-3.5 shrink-0 text-ink-subtle" aria-hidden />
        <span className="line-clamp-2">{item.title}</span>
      </span>
      {editoria && <span className="mt-0.5 block truncate text-[11px] leading-4 text-ink-subtle">{editoria}</span>}
    </Link>
  );
}

export function MonthCalendar({ month, today, items, events: allEvents, editoriaName, hrefFor, selected }: Props) {
  const weeks = monthWeeks(month);
  const longEvents = allEvents.filter((e) => spanDays(e) > 7);
  const events = allEvents.filter((e) => spanDays(e) <= 7);
  const byDay = new Map<string, PlanItem[]>();
  for (const it of items) {
    if (!it.scheduled_on) continue;
    byDay.set(it.scheduled_on, [...(byDay.get(it.scheduled_on) ?? []), it]);
  }
  const unscheduled = items.filter((i) => !i.scheduled_on || i.scheduled_on < month.first || i.scheduled_on > month.last);
  const agendaDays = weeks.flat().filter((d): d is string => Boolean(d && (byDay.has(d) || eventsOn(events, d).length)));

  return (
    <div className="space-y-4">
      {longEvents.length > 0 && (
        <section className={`${card} px-4 py-3`} aria-label="Campanhas do mês">
          <h3 className="label text-ink-subtle">No mês</h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {longEvents.map((e) => (
              <li key={e.id} title={e.notes ?? undefined}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-caption text-ink-muted">
                <span className="font-medium text-ink">{e.title}</span>
                <span className="tabular">{formatDay(e.starts_on)} – {formatDay(e.ends_on)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Grade do mês (tablet e desktop) */}
      <div className={`${card} hidden overflow-hidden md:block`}>
        <div className="grid grid-cols-7 border-b border-line bg-canvas">
          {WEEKDAYS.map((w) => <div key={w} className="px-2 py-2 text-caption font-medium text-ink-subtle">{w}</div>)}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-line last:border-0">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="min-h-32 border-r border-line bg-canvas/60 last:border-r-0" />;
              const dayItems = byDay.get(day) ?? [];
              const dayEvents = eventsOn(events, day);
              const isToday = day === today;
              const past = day < today;
              return (
                <div key={day} className={`min-h-32 min-w-0 border-r border-line p-1.5 last:border-r-0 ${past ? "bg-canvas/40" : ""}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`grid size-6 place-items-center rounded-full text-caption font-semibold tabular ${isToday ? "bg-ink text-surface" : past ? "text-ink-subtle" : "text-ink"}`}
                      aria-label={weekdayLong(day)}
                    >
                      {Number(day.slice(8))}
                    </span>
                  </div>
                  {dayEvents.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 2).map((e) => (
                        <li key={e.id} className="truncate rounded-[3px] bg-brand-soft px-1 text-[11px] leading-4 text-ink-muted" title={e.title}>
                          {e.title}
                        </li>
                      ))}
                      {dayEvents.length > 2 && <li className="px-1 text-[11px] leading-4 text-ink-subtle">+{dayEvents.length - 2} datas</li>}
                    </ul>
                  )}
                  <div className="mt-1 space-y-1">
                    {dayItems.map((it) => (
                      <PautaChip key={it.id} item={it} editoria={it.editoria_id ? editoriaName.get(it.editoria_id) : undefined}
                        href={hrefFor(it.id)} selected={selected === it.id} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Agenda (celular): só os dias com pauta ou data */}
      <ol className="space-y-3 md:hidden">
        {agendaDays.length === 0 && <li className={`${card} p-4 text-body text-ink-muted`}>Nenhuma pauta com data neste mês.</li>}
        {agendaDays.map((day) => (
          <li key={day} className={card}>
            <p className={`border-b border-line px-3 py-2 text-caption font-semibold ${day === today ? "text-ink" : "text-ink-muted"}`}>
              {weekdayLong(day)}{day === today && " · hoje"}
            </p>
            <div className="space-y-1.5 p-2">
              {eventsOn(events, day).map((e) => (
                <p key={e.id} className="rounded-[3px] bg-brand-soft px-2 py-0.5 text-caption text-ink-muted">{e.title}</p>
              ))}
              {(byDay.get(day) ?? []).map((it) => (
                <PautaChip key={it.id} item={it} editoria={it.editoria_id ? editoriaName.get(it.editoria_id) : undefined}
                  href={hrefFor(it.id)} selected={selected === it.id} />
              ))}
            </div>
          </li>
        ))}
      </ol>

      {unscheduled.length > 0 && (
        <section className={card}>
          <h3 className="border-b border-line px-4 py-2.5 text-body font-semibold">
            Sem data <span className="font-normal text-ink-subtle tabular">{unscheduled.length}</span>
          </h3>
          <div className="grid gap-1.5 p-2 sm:grid-cols-2 lg:grid-cols-4">
            {unscheduled.map((it) => (
              <PautaChip key={it.id} item={it} editoria={it.editoria_id ? editoriaName.get(it.editoria_id) : undefined}
                href={hrefFor(it.id)} selected={selected === it.id} />
            ))}
          </div>
        </section>
      )}

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-subtle">
        {(Object.keys(STATUS_BAR) as ItemStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`h-3 w-1 rounded-full border-l-[3px] ${STATUS_BAR[s]}`} />
            {ITEM_STATUS[s].label}
          </span>
        ))}
      </p>
    </div>
  );
}

export function UpNext({ items, today, hrefFor }: { items: PlanItem[]; today: string; hrefFor: (id: string) => string }) {
  const next = items
    .filter((i) => i.scheduled_on && i.scheduled_on >= today && i.status !== "publicado")
    .sort((a, b) => (a.scheduled_on! < b.scheduled_on! ? -1 : 1))
    .slice(0, 3);
  const late = items.filter((i) => i.scheduled_on && i.scheduled_on < today && i.status !== "publicado").length;
  if (!next.length && !late) return null;
  return (
    <section className={`${card} p-4`}>
      <h2 className="text-heading font-semibold">Próximas pautas</h2>
      {late > 0 && <p className="text-caption text-warning">{late} {late === 1 ? "pauta passou da data" : "pautas passaram da data"} sem publicar.</p>}
      <ul className="mt-2 space-y-1.5">
        {next.map((it) => {
          const Icon = FORMAT_ICON[it.format];
          return (
            <li key={it.id}>
              <Link href={hrefFor(it.id)} scroll={false} className="flex items-center gap-2.5 rounded-sm px-1 py-1 hover:bg-brand-soft">
                <span className="w-16 shrink-0 whitespace-nowrap text-caption font-semibold tabular text-ink-muted">{it.scheduled_on === today ? "Hoje" : formatDay(it.scheduled_on!)}</span>
                <Icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-body font-medium">{it.title}</span>
                <span className="hidden text-caption text-ink-subtle sm:inline">{ITEM_STATUS[it.status].label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
