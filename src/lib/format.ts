// Formatação de números para a interface (pt-BR).
export function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// Aceita "90", "1h30", "1:30", "1,5h", "45min".
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(",", ".");
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*(?:min|m)?)?$/))) return Math.round(Number(m[1]) * 60) + Number(m[2] ?? 0);
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = s.match(/^(\d+)\s*(?:min|m)?$/))) return Number(m[1]);
  return null;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const INT = new Intl.NumberFormat("pt-BR");
const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export const formatBRL = (v: number) => BRL.format(v);
export const formatInt = (v: number) => INT.format(v);
export const formatPct = (v: number) => PCT.format(v);
