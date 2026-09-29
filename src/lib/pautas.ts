import type { ItemFormat, PlanItem, TierQuota } from "@/lib/types";
import type { Month } from "@/lib/month";

// Motor de pautas: volume do pacote e grade do calendário do franqueado.

// Formatos que contam como "post" no pacote; stories têm cota própria; o resto
// (Grupo VIP, evento, ação na loja) é ativação e não consome volume.
const POST_FORMATS: ItemFormat[] = ["reels", "carrossel", "post"];

export function quotaKind(format: ItemFormat): "posts" | "stories" | null {
  if (format === "stories") return "stories";
  return POST_FORMATS.includes(format) ? "posts" : null;
}

export type QuotaProgress = { planned: number; published: number; target: number | null };

export function quotaProgress(items: Pick<PlanItem, "format" | "status">[], quota: TierQuota | null) {
  const empty = (): QuotaProgress => ({ planned: 0, published: 0, target: null });
  const out = { posts: empty(), stories: empty() };
  for (const it of items) {
    const k = quotaKind(it.format);
    if (!k) continue;
    out[k].planned++;
    if (it.status === "publicado") out[k].published++;
  }
  if (quota) {
    out.posts.target = quota.posts;
    out.stories.target = quota.stories;
  }
  return out;
}

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Semanas do mês (domingo a sábado); dias fora do mês ficam null.
export function monthWeeks(month: Month): (string | null)[][] {
  const [y, m] = month.key.split("-").map(Number);
  const lastDay = Number(month.last.slice(8, 10));
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= lastDay; d++) cells.push(`${month.key}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function weekdayLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const s = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
