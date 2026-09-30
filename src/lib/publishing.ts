// Postagem e impulsionamento: tipos, rótulos e os "executores" de cada modo.
// manual → a Hub faz fora (Meta Business Suite) e registra;
// teste  → simulação completa, sem contas reais;
// meta   → API da Meta (Graph API para publicar, Marketing API para impulsionar),
//          ligada quando a conta oficial da marca for conectada.
import type { Tone } from "./labels";

export type ServiceKind = "agendar" | "impulsionar";
export type ServiceStatus = "solicitado" | "agendado" | "no_ar" | "concluido" | "cancelado" | "erro";
export type PublishingMode = "manual" | "teste" | "meta";
export type Placement = "feed" | "reels" | "stories";
export type Objective = "alcance" | "perfil" | "mensagens" | "visitas_loja";

export type ServiceMetrics = { reach?: number; impressions?: number; clicks?: number; spend?: number; simulated?: boolean };

export type PieceService = {
  id: string;
  tenant_id: string;
  operation_id: string;
  plan_item_id: string;
  kind: ServiceKind;
  status: ServiceStatus;
  provider: PublishingMode;
  title: string | null;
  scheduled_at: string | null;
  placement: Placement | null;
  caption: string | null;
  budget: number | null;
  days: number | null;
  objective: Objective | null;
  audience: string | null;
  external_id: string | null;
  published_url: string | null;
  metrics: ServiceMetrics;
  started_at: string | null;
  ends_at: string | null;
  notes: string | null;
  error: string | null;
  created_at: string;
};

export const SERVICE_KIND: Record<ServiceKind, string> = {
  agendar: "Postagem pela NEST",
  impulsionar: "Impulsionamento",
};

export const SERVICE_STATUS: Record<ServiceStatus, { label: string; tone: Tone }> = {
  solicitado: { label: "Pedido enviado", tone: "warning" },
  agendado: { label: "Agendado", tone: "info" },
  no_ar: { label: "No ar", tone: "info" },
  concluido: { label: "Concluído", tone: "success" },
  cancelado: { label: "Cancelado", tone: "neutral" },
  erro: { label: "Erro", tone: "danger" },
};

export const PLACEMENT: Record<Placement, string> = { feed: "Feed", reels: "Reels", stories: "Stories" };

export const OBJECTIVE: Record<Objective, string> = {
  alcance: "Alcançar mais pessoas perto da loja",
  perfil: "Levar visitas ao perfil",
  mensagens: "Receber mensagens no Direct/WhatsApp",
  visitas_loja: "Trazer gente para a loja",
};

export const MODE_LABEL: Record<PublishingMode, string> = {
  manual: "A Hub executa e registra",
  teste: "Modo teste (simulação)",
  meta: "Conectado à Meta",
};

export const ACTIVE: ServiceStatus[] = ["solicitado", "agendado", "no_ar"];

/** Formato da pauta → onde postar, como sugestão inicial. */
export function placementFor(format: string): Placement {
  return format === "stories" ? "stories" : format === "reels" ? "reels" : "feed";
}

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Simulação (modo teste): números estáveis por pedido, crescendo com o tempo.
// ---------------------------------------------------------------------------
function seed(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000; // 0..1
}

export function simulatedBoostMetrics(svc: Pick<PieceService, "id" | "budget" | "started_at" | "ends_at">, final = false): ServiceMetrics {
  const budget = Number(svc.budget ?? 0);
  const start = svc.started_at ? Date.parse(svc.started_at) : Date.now();
  const end = svc.ends_at ? Date.parse(svc.ends_at) : start;
  const progress = final || end <= start ? 1 : Math.min(1, Math.max(0.15, (Date.now() - start) / (end - start)));
  const perReal = 60 + seed(svc.id) * 80; // pessoas alcançadas por real
  const reach = Math.round(budget * perReal * progress);
  return {
    reach,
    impressions: Math.round(reach * (1.4 + seed(svc.id) * 0.6)),
    clicks: Math.round(reach * (0.008 + seed(svc.id) * 0.012)),
    spend: Math.round(budget * progress * 100) / 100,
    simulated: true,
  };
}

export function simulatedExternalId(kind: ServiceKind) {
  return `teste_${kind}_${Math.random().toString(36).slice(2, 10)}`;
}

export function simulatedPostUrl(externalId: string) {
  return `https://www.instagram.com/p/${externalId.replace(/[^a-z0-9]/gi, "").slice(-11).toUpperCase()}/`;
}
