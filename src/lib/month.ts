// Mês trabalhado vem da URL como ?mes=YYYY-MM; o padrão é o mês corrente.
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type Month = { key: string; first: string; last: string; label: string };

export function resolveMonth(param?: string | string[]): Month {
  const raw = Array.isArray(param) ? param[0] : param;
  const now = new Date();
  const m = raw?.match(MONTH_RE);
  const year = m ? Number(m[1]) : now.getFullYear();
  const month = m ? Number(m[2]) : now.getMonth() + 1;
  return build(year, month);
}

export function shiftMonth(m: Month, delta: number): Month {
  const [y, mo] = m.key.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return build(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

function build(year: number, month: number): Month {
  const pad = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return {
    key: `${year}-${pad}`,
    first: `${year}-${pad}-01`,
    last: `${year}-${pad}-${String(lastDay).padStart(2, "0")}`,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  };
}

export function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatRange(start: string, end: string) {
  return start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

// "Hoje" no fuso de Brasília, como YYYY-MM-DD.
export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function formatDateTime(ts: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(new Date(ts));
}

export function monthOf(iso: string) {
  return iso.slice(0, 7);
}
