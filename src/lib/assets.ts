import type { ItemFormat } from "@/lib/types";

export type AssetKind = "imagem" | "video" | "documento" | "template" | "texto" | "audio" | "link";

export type Asset = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  kind: AssetKind;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  url: string | null;
  body: string | null;
  tags: string[];
  calendar_event_id: string | null;
  operation_id: string | null;
  official: boolean;
  parent_asset_id: string | null;
  origin_tenant_id: string | null;
  archived: boolean;
  created_by: string | null;
  created_at: string;
};

export type AssetRight = {
  id: string; asset_id: string; holder: string; kind: string;
  valid_from: string | null; valid_until: string | null; territory: string | null; notes: string | null;
};

export type BestPractice = {
  id: string; tenant_id: string; title: string; summary: string; why_it_worked: string | null; how_to_replicate: string | null;
  format: ItemFormat | null; tags: string[]; operation_id: string | null; region_id: string | null; source_plan_item_id: string | null;
  metrics: Record<string, number>; share_network: boolean; published: boolean; created_at: string;
};

export const ASSET_KIND: Record<AssetKind, string> = {
  imagem: "Imagem", video: "Vídeo", documento: "Documento", template: "Template",
  texto: "Texto pronto", audio: "Áudio", link: "Link",
};

// Situação dos direitos de uso a partir da data mais próxima de vencimento.
export function rightsStatus(rights: Pick<AssetRight, "valid_until">[], today: string) {
  const dates = rights.map((r) => r.valid_until).filter((d): d is string => Boolean(d)).sort();
  if (!dates.length) return null;
  const first = dates[0];
  if (first < today) return { tone: "danger" as const, label: "Direito vencido", date: first };
  const days = Math.round((Date.parse(first) - Date.parse(today)) / 86_400_000);
  if (days <= 30) return { tone: "warning" as const, label: `Direito vence em ${days} dia${days === 1 ? "" : "s"}`, date: first };
  return { tone: "success" as const, label: "Direitos em dia", date: first };
}

export function kindFromMime(mime: string): AssetKind {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "documento";
}

export function formatBytes(n: number | null) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
