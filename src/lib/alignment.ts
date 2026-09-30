import type { Tone } from "@/lib/labels";
import { resolveMonth, shiftMonth, todayIso, type Month } from "@/lib/month";

// Reunião mensal de alinhamento: check-in do ciclo + agenda do consultor.
export type MeetingStatus = "agendada" | "realizada" | "cancelada" | "faltou";

export type Checkin = {
  id: string;
  operation_id: string;
  month: string;
  revenue: number;
  orders: number;
  followers: number | null;
  leads: number | null;
  whatsapp_chats: number | null;
  revenue_goal: number | null;
  biggest_challenge: string | null;
  what_worked: string | null;
  nest_score: number | null;
  updated_at: string;
};

export type Meeting = {
  id: string;
  tenant_id: string;
  operation_id: string;
  month: string;
  consultant_id: string;
  starts_at: string;
  ends_at: string;
  status: MeetingStatus;
  meeting_url: string | null;
  notes: string | null;
  next_steps: string | null;
};

export const MEETING_STATUS: Record<MeetingStatus, { label: string; tone: Tone }> = {
  agendada: { label: "Agendada", tone: "info" },
  realizada: { label: "Realizada", tone: "success" },
  cancelada: { label: "Cancelada", tone: "neutral" },
  faltou: { label: "Loja faltou", tone: "danger" },
};

/** Dia limite do mês para a reunião acontecer. */
export const DEADLINE_DAY = 15;

/** Ciclo corrente (mês de Brasília) e o mês a que os números se referem. */
export function currentCycle(): { cycle: Month; reference: Month; deadline: string; open: boolean } {
  const cycle = resolveMonth(todayIso().slice(0, 7));
  const deadline = `${cycle.key}-${DEADLINE_DAY}`;
  return { cycle, reference: shiftMonth(cycle, -1), deadline, open: todayIso() <= deadline };
}

export const NUMBER_FIELDS = [
  { key: "revenue", label: "Faturamento (R$)", required: true, money: true },
  { key: "orders", label: "Pedidos / vendas", required: true },
  { key: "followers", label: "Seguidores no Instagram" },
  { key: "leads", label: "Leads recebidos" },
  { key: "whatsapp_chats", label: "Atendimentos no WhatsApp" },
] as const;

export const TEXT_FIELDS = [
  { key: "what_worked", label: "O que funcionou no mês?" },
  { key: "biggest_challenge", label: "Qual o maior desafio agora?" },
] as const;

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function ticket(c: Pick<Checkin, "revenue" | "orders">) {
  return c.orders ? Number(c.revenue) / c.orders : null;
}

/** Variação entre dois valores (null quando não dá para comparar). */
export function delta(now: number | null | undefined, before: number | null | undefined) {
  if (now == null || before == null || !Number(before)) return null;
  return (Number(now) - Number(before)) / Number(before);
}

const TIME = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const DAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

export const formatTime = (ts: string) => TIME.format(new Date(ts));
export const formatLongDay = (ts: string) => {
  const s = DAY.format(new Date(ts));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const dayKey = (ts: string) => DAY_KEY.format(new Date(ts));
