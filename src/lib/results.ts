export type ResultChannel = "instagram" | "tiktok" | "facebook" | "whatsapp" | "google" | "loja" | "outro";

export type ResultEntry = {
  id: string;
  operation_id: string;
  plan_item_id: string | null;
  channel: ResultChannel;
  published_url: string | null;
  measured_on: string;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  leads: number;
  visits: number;
  sales_count: number;
  revenue: number;
  notes: string | null;
  source: string;
};

export type Benchmark = {
  operation_id: string; pieces: number; reach: number; interactions: number; engagement_rate: number;
  leads: number; revenue: number; network_size: number;
  pct_engagement: number; pct_reach: number; pct_leads: number; pct_revenue: number;
};

export const CHANNEL: Record<ResultChannel, string> = {
  instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", whatsapp: "WhatsApp",
  google: "Google", loja: "Na loja", outro: "Outro",
};

export const METRIC_FIELDS = [
  { key: "reach", label: "Alcance" },
  { key: "likes", label: "Curtidas" },
  { key: "comments", label: "Comentários" },
  { key: "shares", label: "Compartilhamentos" },
  { key: "saves", label: "Salvamentos" },
  { key: "clicks", label: "Cliques" },
  { key: "leads", label: "Leads / mensagens" },
  { key: "visits", label: "Visitas à loja" },
  { key: "sales_count", label: "Vendas" },
] as const;

export type Totals = {
  entries: number; reach: number; interactions: number; leads: number; visits: number; sales: number; revenue: number; engagement: number;
};

export function totals(rows: ResultEntry[]): Totals {
  const t = rows.reduce((acc, r) => {
    acc.reach += r.reach;
    acc.interactions += r.likes + r.comments + r.shares + r.saves;
    acc.leads += r.leads;
    acc.visits += r.visits;
    acc.sales += r.sales_count;
    acc.revenue += Number(r.revenue);
    return acc;
  }, { entries: rows.length, reach: 0, interactions: 0, leads: 0, visits: 0, sales: 0, revenue: 0, engagement: 0 });
  t.engagement = t.reach ? t.interactions / t.reach : 0;
  return t;
}

export function engagementOf(r: Pick<ResultEntry, "reach" | "likes" | "comments" | "shares" | "saves">) {
  return r.reach ? (r.likes + r.comments + r.shares + r.saves) / r.reach : 0;
}

// Leitura humana do percentil: "top 20%" etc.
export function rankLabel(pct: number, size: number) {
  if (size < 3) return "rede pequena para comparar";
  if (pct >= 0.9) return "top 10% da rede";
  if (pct >= 0.75) return "top 25% da rede";
  if (pct >= 0.5) return "acima da mediana";
  if (pct >= 0.25) return "abaixo da mediana";
  return "25% mais baixos da rede";
}

// CSV simples (vírgula ou ponto e vírgula, aspas opcionais), primeira linha = cabeçalho.
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
      } else if (c === sep && !quoted) { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const norm = (h: string) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const header = split(lines[0]).map(norm);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

// "1.234" / "1234,5" / "R$ 1.234,56" → número.
export function toNumber(v: string | undefined) {
  if (!v) return 0;
  const s = v.replace(/[R$\s]/g, "");
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/\.(?=\d{3}(\D|$))/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
