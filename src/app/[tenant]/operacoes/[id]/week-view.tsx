import Link from "next/link";
import { ArrowRight, CalendarDays, Check, Clock } from "lucide-react";
import { addDays, formatDay } from "@/lib/month";
import { weekdayLong } from "@/lib/pautas";
import { ITEM_FORMAT, ITEM_STATUS } from "@/lib/labels";
import type { ItemStatus, PlanItem } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { btnPrimary, card } from "@/components/ui";
import { FORMAT_ICON } from "./month-calendar";

type Props = {
  items: PlanItem[];
  today: string;
  monthFirst: string;
  monthLast: string;
  monthLabel: string;
  isManager: boolean;
  published: number;
  target: number | null;
  hrefFor: (id: string) => string;
  calendarHref: string;
  planningHref: string;
};

const CTA: Record<ItemStatus, string> = {
  ideia: "Começar a criar",
  roteiro: "Continuar criando",
  aprovacao: "Revisar",
  aprovado: "Publicar",
  publicado: "Ver",
};

const HINT: Record<ItemStatus, string> = {
  ideia: "Leia a ideia e o porquê, depois grave ou monte a peça.",
  roteiro: "Termine a peça com o gancho e o roteiro e envie para revisão.",
  aprovacao: "A peça está esperando a revisão da Hub ou da Marca.",
  aprovado: "Aprovada. Poste e cole o link para registrar a entrega.",
  publicado: "Publicada.",
};

// "Esta semana": a porta de entrada da loja. Um próximo passo em destaque,
// o que atrasou e os dias da semana; o mês inteiro fica a um clique.
export function WeekView({
  items, today, monthFirst, monthLast, monthLabel, isManager, published, target, hrefFor, calendarHref, planningHref,
}: Props) {
  // Fora do mês corrente, a "semana" é a primeira semana do mês escolhido.
  const inMonth = today >= monthFirst && today <= monthLast;
  const start = inMonth ? today : monthFirst;
  const end = addDays(start, 6);

  const open = items.filter((i) => i.status !== "publicado");
  const mine = (i: PlanItem) => isManager || i.status !== "aprovacao";
  const isLate = (i: PlanItem) => inMonth && !!i.scheduled_on && i.scheduled_on < today && i.status !== "publicado";
  const byDate = (a: PlanItem, b: PlanItem) => (a.scheduled_on ?? "9999") < (b.scheduled_on ?? "9999") ? -1 : 1;

  const actionable = open.filter(mine).sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || byDate(a, b));
  const next = actionable[0];
  const late = open.filter((i) => isLate(i) && i.id !== next?.id).sort(byDate);
  const week = items.filter((i) => i.id !== next?.id && !isLate(i) && i.scheduled_on && i.scheduled_on >= start && i.scheduled_on <= end);
  const later = open.filter((i) => i.scheduled_on && i.scheduled_on > end).length;
  const undated = open.filter((i) => !i.scheduled_on && i.id !== next?.id).length;
  const inReview = isManager ? 0 : open.filter((i) => i.status === "aprovacao").length;

  const days = Array.from({ length: 7 }, (_, n) => addDays(start, n))
    .map((d) => ({ day: d, items: week.filter((i) => i.scheduled_on === d) }))
    .filter((d) => d.items.length);

  const total = target ?? items.length;

  return (
    <div className="mx-auto mt-6 max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2 text-body text-ink-muted">
        <span>
          {inMonth ? "Esta semana" : `Primeira semana de ${monthLabel.toLowerCase()}`}
          {" · "}{formatDay(start)} – {formatDay(end)}
        </span>
        {total > 0 && (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-brand-soft" aria-hidden>
              <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (published / total) * 100)}%` }} />
            </span>
            <span className="tabular">{published} de {total} publicadas no mês</span>
          </span>
        )}
      </div>

      {next ? (
        <section className={`${card} p-6`}>
          <p className={`text-caption font-medium ${isLate(next) ? "text-warning" : "text-ink-subtle"}`}>
            {isLate(next) ? `Atrasada · era para ${formatDay(next.scheduled_on!)}` : next.scheduled_on === today ? "Seu próximo passo · hoje" : `Seu próximo passo · ${next.scheduled_on ? weekdayLong(next.scheduled_on) : "sem data"}`}
          </p>
          <h2 className="mt-1 text-[22px] leading-7 font-semibold tracking-tight">{next.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge {...ITEM_STATUS[next.status]} />
            <FormatChip item={next} />
          </div>
          {(next.hook || next.idea) && (
            <p className="mt-4 line-clamp-3 text-body text-ink-muted">{next.hook ? `“${next.hook}”` : next.idea}</p>
          )}
          <p className="mt-4 text-body text-ink-muted">{HINT[next.status]}</p>
          <Link href={hrefFor(next.id)} scroll={false} className={`${btnPrimary} mt-5`}>
            {CTA[next.status]} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>
      ) : (
        <section className={`${card} p-6 text-center`}>
          <Check className="mx-auto size-6 text-success" aria-hidden />
          <h2 className="mt-2 text-title font-semibold">
            {items.length ? "Tudo em dia por aqui" : "O mês ainda não tem pautas"}
          </h2>
          <p className="mt-1 text-body text-ink-muted">
            {items.length
              ? inReview ? `${inReview} ${inReview === 1 ? "pauta está" : "pautas estão"} em revisão. Você recebe o retorno pela conversa da pauta.` : "Nada pendente para você agora."
              : isManager ? "Monte as pautas do mês para a loja." : "A Hub está preparando o plano da sua loja. Ele aparece aqui assim que for liberado."}
          </p>
          {!items.length && isManager && <Link href={planningHref} className={`${btnPrimary} mt-4`}>Planejar o mês</Link>}
        </section>
      )}

      {late.length > 0 && (
        <ItemList title="Atrasadas" tone="warning" items={late} hrefFor={hrefFor} showDate />
      )}

      {days.length > 0 && (
        <section>
          <h2 className="text-heading font-semibold">{inMonth ? "Nos próximos dias" : "Na semana"}</h2>
          <div className="mt-3 space-y-4">
            {days.map((d) => (
              <div key={d.day}>
                <p className="mb-1.5 text-caption font-medium text-ink-subtle">{d.day === today ? "Hoje" : weekdayLong(d.day)}</p>
                <ItemRows items={d.items} hrefFor={hrefFor} />
              </div>
            ))}
          </div>
        </section>
      )}

      {(later > 0 || undated > 0 || inReview > 0) && (
        <Link href={calendarHref} className="flex items-center gap-3 rounded-md border border-line px-4 py-3 text-body text-ink-muted hover:bg-surface hover:text-ink">
          <CalendarDays className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          <span className="flex-1">
            {[
              later > 0 && `${later} ${later === 1 ? "pauta" : "pautas"} depois desta semana`,
              undated > 0 && `${undated} sem data`,
              next && inReview > 0 && `${inReview} em revisão`,
            ].filter(Boolean).join(" · ") || "Ver o mês inteiro"}
          </span>
          <span className="font-medium text-ink">Ver calendário</span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function FormatChip({ item }: { item: PlanItem }) {
  const Icon = FORMAT_ICON[item.format];
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-line px-2 text-caption text-ink-muted">
      <Icon className="size-3.5" aria-hidden /> {ITEM_FORMAT[item.format]}
    </span>
  );
}

function ItemList({ title, tone, items, hrefFor, showDate }: {
  title: string; tone?: "warning"; items: PlanItem[]; hrefFor: (id: string) => string; showDate?: boolean;
}) {
  return (
    <section>
      <h2 className={`flex items-center gap-2 text-heading font-semibold ${tone === "warning" ? "text-warning" : ""}`}>
        {tone === "warning" && <Clock className="size-4" aria-hidden />}{title}
        <span className="text-body font-normal text-ink-subtle tabular">{items.length}</span>
      </h2>
      <div className="mt-3"><ItemRows items={items} hrefFor={hrefFor} showDate={showDate} /></div>
    </section>
  );
}

function ItemRows({ items, hrefFor, showDate }: { items: PlanItem[]; hrefFor: (id: string) => string; showDate?: boolean }) {
  return (
    <ul className={card}>
      {items.map((it) => {
        const Icon = FORMAT_ICON[it.format];
        const done = it.status === "publicado";
        return (
          <li key={it.id} className="border-b border-line last:border-0">
            <Link href={hrefFor(it.id)} scroll={false} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-soft">
              {done
                ? <Check className="size-4 shrink-0 text-success" aria-label="Publicada" />
                : <Icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />}
              {showDate && it.scheduled_on && <span className="w-14 shrink-0 text-caption font-medium tabular text-ink-subtle">{formatDay(it.scheduled_on)}</span>}
              <span className={`min-w-0 flex-1 truncate text-body font-medium ${done ? "text-ink-subtle line-through" : ""}`}>{it.title}</span>
              <span className="hidden sm:inline"><StatusBadge {...ITEM_STATUS[it.status]} /></span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
