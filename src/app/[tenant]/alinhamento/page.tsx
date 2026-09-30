import Link from "next/link";
import { CalendarCheck, CheckCircle2, ChevronRight, Lock, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatDay } from "@/lib/month";
import { formatBRL, formatInt } from "@/lib/format";
import { displayName, loadProfiles } from "@/lib/people";
import {
  MEETING_STATUS, NUMBER_FIELDS, TEXT_FIELDS, currentCycle, dayKey, formatLongDay, formatTime, ticket,
  type Checkin, type Meeting,
} from "@/lib/alignment";
import { StatusBadge } from "@/components/status-badge";
import { Field } from "@/components/field";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import { bookMeeting, cancelMeeting, saveCheckin, setConsultant } from "./actions";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ loja?: string; erro?: string; editar?: string }> };
type Op = { id: string; name: string; city: string | null; state: string | null; consultant_id: string | null };

const ERRORS: Record<string, string> = {
  checkin: "Preencha pelo menos faturamento e pedidos.",
  salvar: "Não foi possível salvar. Tente de novo.",
  sem_checkin: "Envie o check-in do mês antes de agendar.",
  sem_consultor: "Sua loja ainda não tem consultor definido. Fale com a NEST.",
  ja_agendada: "Já existe uma reunião marcada neste mês.",
  horario_indisponivel: "Esse horário acabou de ser ocupado. Escolha outro.",
  horario: "Escolha um horário.",
  cancelar: "Só dá para cancelar reuniões futuras que ainda estão agendadas.",
  consultor: "Não foi possível definir o consultor.",
};

export const metadata = { title: "Reunião de alinhamento · NEST" };

export default async function AlinhamentoPage({ params, searchParams }: Props) {
  const [{ tenant }, { loja, erro, editar }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const supabase = await createClient();
  const { data } = await supabase.from("operations").select("id, name, city, state, consultant_id")
    .eq("tenant_id", ctx.tenant.id).eq("active", true).order("name");
  const ops = (data ?? []) as Op[];
  const error = erro && ERRORS[erro] ? <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p> : null;

  const selected = ops.find((o) => o.id === loja) ?? (!ctx.isManager && ops.length === 1 ? ops[0] : undefined);
  if (!selected) return <Overview slug={tenant} tenantId={ctx.tenant.id} ops={ops} isManager={ctx.isManager} error={error} />;
  return <StoreCycle slug={tenant} op={selected} back={ops.length > 1 || ctx.isManager} error={error} editing={editar === "1"} />;
}

// Visão da rede: quem já enviou o check-in e marcou a reunião; gestão define o consultor.
async function Overview({ slug, tenantId, ops, isManager, error }: {
  slug: string; tenantId: string; ops: Op[]; isManager: boolean; error: React.ReactNode;
}) {
  const { cycle, deadline } = currentCycle();
  const supabase = await createClient();
  const [{ data: checkins }, { data: meetings }, { data: hubs }] = await Promise.all([
    supabase.from("monthly_checkins").select("operation_id").eq("tenant_id", tenantId).eq("month", cycle.first),
    supabase.from("alignment_meetings").select("operation_id, starts_at, status").eq("tenant_id", tenantId)
      .eq("month", cycle.first).neq("status", "cancelada"),
    isManager ? supabase.from("memberships").select("user_id").eq("tenant_id", tenantId).eq("role", "hub") : Promise.resolve({ data: [] }),
  ]);
  const done = new Set((checkins ?? []).map((c) => c.operation_id));
  const meetingOf = new Map((meetings ?? []).map((m) => [m.operation_id, m as Pick<Meeting, "starts_at" | "status">]));
  const people = await loadProfiles(supabase, [...(hubs ?? []).map((h) => h.user_id), ...ops.map((o) => o.consultant_id)]);
  const hubIds = [...new Set((hubs ?? []).map((h) => h.user_id))];
  const booked = ops.filter((o) => meetingOf.has(o.id)).length;

  return (
    <div className="mx-auto max-w-5xl">
      <header>
        <h1 className="font-display text-page">Reuniões de alinhamento</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-muted">
          {cycle.label}: cada loja envia o check-in e marca a reunião com o consultor até {formatDay(deadline)}.
        </p>
      </header>
      {error}

      <dl className="mt-6 grid grid-cols-3 gap-3">
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Lojas</dt><dd className="mt-1 text-metric font-semibold tabular">{ops.length}</dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Check-in enviado</dt><dd className="mt-1 text-metric font-semibold tabular">{done.size}<span className="text-heading font-normal text-ink-subtle"> / {ops.length}</span></dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Reunião marcada</dt><dd className="mt-1 text-metric font-semibold tabular">{booked}<span className="text-heading font-normal text-ink-subtle"> / {ops.length}</span></dd></div>
      </dl>

      <section className={`${card} mt-6 overflow-x-auto`}>
        <table className="w-full min-w-[720px] text-left text-body">
          <thead><tr className="border-b border-line">
            {["Loja", "Consultor", "Check-in", "Reunião", ""].map((h) => <th key={h} className="h-10 px-4 text-caption font-medium text-ink-subtle">{h}</th>)}
          </tr></thead>
          <tbody>
            {ops.map((o) => {
              const m = meetingOf.get(o.id);
              const href = `/${slug}/alinhamento?loja=${o.id}`;
              return (
                <tr key={o.id} className="h-12 border-b border-line last:border-0">
                  <td className="px-4">
                    <Link href={href} className="font-semibold hover:text-brand">{o.name}</Link>
                    <span className="block text-caption text-ink-subtle">{[o.city, o.state].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="px-4">
                    {isManager ? (
                      <form action={setConsultant.bind(null, slug)} className="flex items-center gap-2">
                        <input type="hidden" name="operation_id" value={o.id} />
                        <select name="consultant_id" defaultValue={o.consultant_id ?? ""} aria-label={`Consultor de ${o.name}`} className={`${input} h-8 w-44`}>
                          <option value="">Sem consultor</option>
                          {hubIds.map((id) => <option key={id} value={id}>{displayName(people.get(id))}</option>)}
                          {o.consultant_id && !hubIds.includes(o.consultant_id) && <option value={o.consultant_id}>{displayName(people.get(o.consultant_id))}</option>}
                        </select>
                        <button className={btnGhost}>Salvar</button>
                      </form>
                    ) : <span className="text-ink-muted">{o.consultant_id ? displayName(people.get(o.consultant_id)) : "—"}</span>}
                  </td>
                  <td className="px-4">{done.has(o.id) ? <StatusBadge label="Enviado" tone="success" /> : <StatusBadge label="Pendente" tone="warning" />}</td>
                  <td className="px-4">
                    {m ? <span className="tabular">{formatDay(dayKey(m.starts_at))} · {formatTime(m.starts_at)} <StatusBadge {...MEETING_STATUS[m.status]} /></span>
                      : <StatusBadge label="Não marcou" tone="neutral" />}
                  </td>
                  <td className="pr-3">
                    <Link href={href} aria-label={`Abrir ${o.name}`} className="grid size-8 place-items-center rounded-sm text-ink-subtle hover:text-ink"><ChevronRight className="size-4" /></Link>
                  </td>
                </tr>
              );
            })}
            {ops.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-ink-muted">Nenhuma loja disponível para o seu perfil.</td></tr>}
          </tbody>
        </table>
      </section>
      {isManager && hubIds.length === 0 && (
        <p className="mt-3 text-caption text-ink-subtle">Nenhuma pessoa Hub nesta marca ainda: convide em Equipe para poder definir consultores.</p>
      )}
    </div>
  );
}

// Ciclo da loja: 1) check-in do mês anterior → 2) escolher horário com o consultor.
async function StoreCycle({ slug, op, back, error, editing }: { slug: string; op: Op; back: boolean; error: React.ReactNode; editing: boolean }) {
  const { cycle, reference, deadline, open } = currentCycle();
  const supabase = await createClient();
  const [{ data: checkinRow }, { data: meetingRows }, people] = await Promise.all([
    supabase.from("monthly_checkins").select("*").eq("operation_id", op.id).eq("month", cycle.first).maybeSingle(),
    supabase.from("alignment_meetings").select("*").eq("operation_id", op.id).neq("status", "cancelada")
      .order("starts_at", { ascending: false }).limit(12),
    loadProfiles(supabase, [op.consultant_id]),
  ]);
  const checkin = checkinRow as Checkin | null;
  const meetings = (meetingRows ?? []) as Meeting[];
  const current = meetings.find((m) => m.month === cycle.first);
  const past = meetings.filter((m) => m.month !== cycle.first && m.next_steps);
  const consultant = op.consultant_id ? displayName(people.get(op.consultant_id)) : null;

  const canBook = Boolean(checkin) && !current && open && Boolean(op.consultant_id);
  const { data: slotRows } = canBook ? await supabase.rpc("available_slots", { p_operation: op.id }) : { data: [] };
  const slots = (slotRows ?? []) as { starts_at: string; ends_at: string }[];
  const byDay = new Map<string, typeof slots>();
  for (const s of slots) byDay.set(dayKey(s.starts_at), [...(byDay.get(dayKey(s.starts_at)) ?? []), s]);

  const showForm = !checkin || editing;

  return (
    <div className="mx-auto max-w-3xl">
      {back && <Link href={`/${slug}/alinhamento`} className="text-caption text-ink-subtle hover:text-ink">← Todas as lojas</Link>}
      <header className="mt-1">
        <h1 className="font-display text-page">Reunião de alinhamento</h1>
        <p className="mt-1 text-body text-ink-muted">
          {op.name} · {cycle.label}{consultant && <> · Consultor: <span className="font-medium text-ink">{consultant}</span></>}
        </p>
      </header>
      {error}

      {/* Passo 1 */}
      <section className={`${card} mt-6`}>
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <Step n={1} done={Boolean(checkin)} />
          <div className="min-w-0 flex-1">
            <h2 className="text-heading font-semibold">Check-in de {reference.label.toLowerCase()}</h2>
            <p className="text-caption text-ink-muted">Os números do mês passado mostram quanto a loja está crescendo. Leva 2 minutos.</p>
          </div>
          {checkin && !editing && <Link href={`/${slug}/alinhamento?loja=${op.id}&editar=1`} className={btnGhost}>Editar</Link>}
        </div>

        {showForm ? (
          <form action={saveCheckin.bind(null, slug, op.id)} className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {NUMBER_FIELDS.map((f) => (
                <Field key={f.key} label={`${f.label}${"required" in f ? " *" : ""}`}>
                  <input name={f.key} inputMode="decimal" required={"required" in f} className={input}
                    defaultValue={checkin?.[f.key] ?? ""} placeholder={"money" in f ? "Ex.: 48.500,00" : undefined} />
                </Field>
              ))}
              <Field label={`Meta de faturamento para ${cycle.label.toLowerCase()} (R$)`}>
                <input name="revenue_goal" inputMode="decimal" className={input} defaultValue={checkin?.revenue_goal ?? ""} />
              </Field>
            </div>
            {TEXT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <textarea name={f.key} rows={3} className={textarea} defaultValue={checkin?.[f.key] ?? ""} />
              </Field>
            ))}
            <Field label="De 0 a 10, quanto a NEST está ajudando sua loja?">
              <select name="nest_score" className={`${input} w-32`} defaultValue={checkin?.nest_score ?? ""}>
                <option value="">—</option>
                {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
            <div className="flex gap-2">
              <button className={btnPrimary}>{checkin ? "Salvar check-in" : "Enviar check-in"}</button>
              {editing && <Link href={`/${slug}/alinhamento?loja=${op.id}`} className={btnSecondary}>Cancelar</Link>}
            </div>
          </form>
        ) : checkin && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 sm:grid-cols-3">
            <Stat label="Faturamento" value={formatBRL(Number(checkin.revenue))} />
            <Stat label="Pedidos" value={formatInt(checkin.orders)} />
            <Stat label="Ticket médio" value={ticket(checkin) != null ? formatBRL(ticket(checkin)!) : "—"} />
            <Stat label="Seguidores" value={checkin.followers != null ? formatInt(checkin.followers) : "—"} />
            <Stat label="Leads" value={checkin.leads != null ? formatInt(checkin.leads) : "—"} />
            <Stat label="Meta do mês" value={checkin.revenue_goal != null ? formatBRL(Number(checkin.revenue_goal)) : "—"} />
          </dl>
        )}
      </section>

      {/* Passo 2 */}
      <section className={`${card} mt-4`}>
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <Step n={2} done={Boolean(current)} />
          <div className="min-w-0 flex-1">
            <h2 className="text-heading font-semibold">Agende com seu consultor</h2>
            <p className="text-caption text-ink-muted">Horários disponíveis até {formatDay(deadline)}.</p>
          </div>
        </div>
        <div className="p-5">
          {current ? (
            <div className="flex flex-wrap items-center gap-4">
              <CalendarCheck className="size-6 text-success" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{formatLongDay(current.starts_at)} · {formatTime(current.starts_at)}–{formatTime(current.ends_at)}</p>
                <p className="text-caption text-ink-muted"><StatusBadge {...MEETING_STATUS[current.status]} /> {consultant && `com ${consultant}`}</p>
              </div>
              {current.meeting_url && current.status === "agendada" && (
                <a href={current.meeting_url} target="_blank" rel="noreferrer" className={btnSecondary}><Video className="size-4" aria-hidden /> Entrar na chamada</a>
              )}
              {current.status === "agendada" && new Date(current.starts_at) > new Date() && (
                <form action={cancelMeeting.bind(null, slug, op.id, current.id)}>
                  <button className={btnGhost}>Cancelar para remarcar</button>
                </form>
              )}
            </div>
          ) : !checkin ? (
            <Locked text="Envie o check-in acima para liberar a agenda." />
          ) : !op.consultant_id ? (
            <Locked text="Sua loja ainda não tem consultor definido. A NEST vai liberar em breve." />
          ) : !open ? (
            <Locked text={`O prazo para marcar a reunião deste mês terminou em ${formatDay(deadline)}. Fale com seu consultor.`} />
          ) : slots.length === 0 ? (
            <p className="text-body text-ink-muted">Nenhum horário livre até {formatDay(deadline)}. Fale com seu consultor para abrir um horário.</p>
          ) : (
            <form action={bookMeeting.bind(null, slug, op.id)} className="space-y-4">
              {[...byDay].map(([day, list]) => (
                <fieldset key={day}>
                  <legend className="text-body font-semibold">{formatLongDay(list[0].starts_at)}</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {list.map((s) => (
                      <label key={s.starts_at} className="cursor-pointer">
                        <input type="radio" name="starts_at" value={s.starts_at} required className="peer sr-only" />
                        <span className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3 text-body tabular transition-colors peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand-soft hover:bg-canvas">
                          {formatTime(s.starts_at)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <button className={btnPrimary}>Confirmar reunião</button>
            </form>
          )}
        </div>
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="text-heading font-semibold">Combinados das reuniões anteriores</h2>
          <ul className={`${card} mt-3`}>
            {past.map((m) => (
              <li key={m.id} className="border-b border-line p-4 last:border-0">
                <p className="text-caption text-ink-subtle">{formatLongDay(m.starts_at)}</p>
                <p className="mt-1 whitespace-pre-line text-body">{m.next_steps}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Step({ n, done }: { n: number; done: boolean }) {
  return done
    ? <CheckCircle2 className="size-7 shrink-0 text-success" aria-label={`Passo ${n} concluído`} />
    : <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-body font-semibold text-ink-muted" aria-label={`Passo ${n}`}>{n}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-caption text-ink-subtle">{label}</dt><dd className="font-semibold tabular">{value}</dd></div>;
}

function Locked({ text }: { text: string }) {
  return <p className="flex items-center gap-2 text-body text-ink-muted"><Lock className="size-4 shrink-0" aria-hidden /> {text}</p>;
}
