import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDeskContext } from "@/lib/staff";
import { resolveMonth, shiftMonth } from "@/lib/month";
import { formatBRL, formatInt, formatPct } from "@/lib/format";
import { MEETING_STATUS, delta, formatLongDay, formatTime, ticket, type Checkin, type Meeting } from "@/lib/alignment";
import { StatusBadge } from "@/components/status-badge";
import { Field } from "@/components/field";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import { cancelFromDesk, saveMeeting } from "../actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> };
type Row = Meeting & { operations: { name: string; city: string | null; state: string | null } | null; tenants: { name: string; slug: string } | null };

export const metadata = { title: "Reunião · NEST" };

export default async function MeetingPage({ params, searchParams }: Props) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const ctx = await getDeskContext();
  if (!ctx.isStaff) redirect("/mesa");
  const supabase = await createClient();
  const { data } = await supabase.from("alignment_meetings").select("*, operations(name, city, state), tenants(name, slug)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const m = data as Row;

  // Últimos 6 check-ins da loja: evolução mês a mês.
  const { data: rows } = await supabase.from("monthly_checkins").select("*").eq("operation_id", m.operation_id)
    .lte("month", m.month).order("month", { ascending: false }).limit(6);
  const history = (rows ?? []) as Checkin[];
  const now = history.find((c) => c.month === m.month);
  const prev = history.find((c) => c.month < m.month);
  const refLabel = (month: string) => shiftMonth(resolveMonth(month.slice(0, 7)), -1).label;
  const future = new Date(m.starts_at) > new Date();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/mesa/agenda" className="text-caption text-ink-subtle hover:text-ink">← Agenda</Link>
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-caption text-ink-subtle">{m.tenants?.name}</p>
          <h1 className="font-display text-page">{m.operations?.name}</h1>
          <p className="mt-1 text-body text-ink-muted">
            {formatLongDay(m.starts_at)} · {formatTime(m.starts_at)}–{formatTime(m.ends_at)} <StatusBadge {...MEETING_STATUS[m.status]} />
          </p>
        </div>
        {m.meeting_url && <a href={m.meeting_url} target="_blank" rel="noreferrer" className={btnSecondary}><Video className="size-4" aria-hidden /> Entrar na chamada</a>}
      </header>
      {erro && <p role="alert" className="rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">Não foi possível salvar. Tente de novo.</p>}
      {ok && <p className="rounded-sm border border-success/20 bg-success/5 p-3 text-body text-success">Reunião salva.</p>}

      <section className={card}>
        <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Check-in da loja</h2>
        {!now ? <p className="px-4 py-3 text-body text-ink-muted">Sem check-in neste ciclo.</p> : (
          <div className="p-4">
            <p className="text-caption text-ink-subtle">Números de {refLabel(now.month).toLowerCase()}{prev && `, comparados com ${refLabel(prev.month).toLowerCase()}`}</p>
            <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Kpi label="Faturamento" value={formatBRL(Number(now.revenue))} d={delta(now.revenue, prev?.revenue)} />
              <Kpi label="Pedidos" value={formatInt(now.orders)} d={delta(now.orders, prev?.orders)} />
              <Kpi label="Ticket médio" value={ticket(now) != null ? formatBRL(ticket(now)!) : "—"} d={delta(ticket(now), prev ? ticket(prev) : null)} />
              <Kpi label="Seguidores" value={now.followers != null ? formatInt(now.followers) : "—"} d={delta(now.followers, prev?.followers)} />
              <Kpi label="Leads" value={now.leads != null ? formatInt(now.leads) : "—"} d={delta(now.leads, prev?.leads)} />
              <Kpi label="WhatsApp" value={now.whatsapp_chats != null ? formatInt(now.whatsapp_chats) : "—"} d={delta(now.whatsapp_chats, prev?.whatsapp_chats)} />
            </dl>
            <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <Quote label="O que funcionou" text={now.what_worked} />
              <Quote label="Maior desafio" text={now.biggest_challenge} />
              <Quote label="Meta de faturamento do mês" text={now.revenue_goal != null ? formatBRL(Number(now.revenue_goal)) : null} />
              <Quote label="Nota para a NEST" text={now.nest_score != null ? `${now.nest_score} / 10` : null} />
            </div>
          </div>
        )}
        {history.length > 1 && (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[520px] text-left text-body">
              <thead><tr className="border-b border-line">
                {["Mês", "Faturamento", "Pedidos", "Ticket", "Seguidores", "Meta"].map((h) => <th key={h} className="h-9 px-4 text-caption font-medium text-ink-subtle">{h}</th>)}
              </tr></thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c.id} className="h-9 border-b border-line last:border-0 tabular">
                    <td className="px-4">{refLabel(c.month)}</td>
                    <td className="px-4">{formatBRL(Number(c.revenue))}</td>
                    <td className="px-4">{formatInt(c.orders)}</td>
                    <td className="px-4">{ticket(c) != null ? formatBRL(ticket(c)!) : "—"}</td>
                    <td className="px-4">{c.followers != null ? formatInt(c.followers) : "—"}</td>
                    <td className="px-4">{c.revenue_goal != null ? formatBRL(Number(c.revenue_goal)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form action={saveMeeting.bind(null, m.id)} className={`${card} space-y-4 p-4`}>
        <h2 className="text-heading font-semibold">Ata</h2>
        <Field label="Status">
          <select name="status" defaultValue={m.status === "cancelada" ? "agendada" : m.status} className={`${input} w-48`}>
            <option value="agendada">Agendada</option>
            <option value="realizada">Realizada</option>
            <option value="faltou">Loja faltou</option>
          </select>
        </Field>
        <Field label="Anotações (só a equipe vê)">
          <textarea name="notes" rows={6} defaultValue={m.notes ?? ""} className={textarea} />
        </Field>
        <Field label="Próximos passos (a loja vê)">
          <textarea name="next_steps" rows={4} defaultValue={m.next_steps ?? ""} className={textarea} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary}>Salvar</button>
          {m.tenants && <Link href={`/${m.tenants.slug}/operacoes/${m.operation_id}`} className={btnSecondary}>Abrir plano da loja</Link>}
        </div>
      </form>
      {m.status === "agendada" && future && (
        <form action={cancelFromDesk.bind(null, m.id)}>
          <button className={btnGhost}>Cancelar reunião (libera a loja para remarcar)</button>
        </form>
      )}
    </div>
  );
}

function Kpi({ label, value, d }: { label: string; value: string; d: number | null }) {
  return (
    <div>
      <dt className="text-caption text-ink-subtle">{label}</dt>
      <dd className="text-heading font-semibold tabular">{value}</dd>
      {d != null && <dd className={`text-caption tabular ${d >= 0 ? "text-success" : "text-danger"}`}>{d >= 0 ? "▲" : "▼"} {formatPct(Math.abs(d))}</dd>}
    </div>
  );
}

function Quote({ label, text }: { label: string; text: string | null }) {
  return <div><p className="text-caption text-ink-subtle">{label}</p><p className="mt-0.5 whitespace-pre-line text-body">{text || "—"}</p></div>;
}
