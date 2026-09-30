import type { EventKind, EventScope, FunnelStage, ItemFormat, ItemOrigin, ItemStatus, MemberRole, NetworkPlanStatus, PlanStatus, ProjectStatus, ServiceTier, TaskStatus } from "./types";

export const ROLE_LABEL: Record<MemberRole, string> = {
  hub: "Estrategista Hub",
  marca: "Marca",
  regional: "Gestor regional",
  lojista: "Lojista",
};

export const PLAN_STATUS: Record<PlanStatus, { label: string; tone: Tone }> = {
  rascunho: { label: "Rascunho", tone: "info" },
  em_execucao: { label: "Em execução", tone: "warning" },
  em_analise: { label: "Em análise", tone: "info" },
  fechado: { label: "Fechado", tone: "success" },
};

export const ITEM_STATUS: Record<ItemStatus, { label: string; tone: Tone }> = {
  ideia: { label: "Ideia", tone: "neutral" },
  roteiro: { label: "Roteiro", tone: "info" },
  aprovacao: { label: "Aguardando aprovação", tone: "warning" },
  aprovado: { label: "Aprovado", tone: "success" },
  publicado: { label: "Publicado", tone: "brand" },
};

export const ITEM_STATUS_ORDER: ItemStatus[] = ["ideia", "roteiro", "aprovacao", "aprovado", "publicado"];

export const ITEM_FORMAT: Record<ItemFormat, string> = {
  reels: "Reels",
  carrossel: "Carrossel",
  stories: "Stories",
  post: "Post",
  whatsapp: "Grupo VIP WhatsApp",
  evento: "Evento",
  acao_loja: "Ação na loja",
};

export const FUNNEL_STAGE: Record<FunnelStage, string> = {
  descoberta: "Descoberta",
  consideracao: "Consideração",
  conversao: "Conversão",
  relacionamento: "Relacionamento",
};

export const SERVICE_TIER: Record<ServiceTier, string> = {
  essencial: "Essencial",
  acompanhamento: "Acompanhamento",
  ativacao: "Ativação",
  inteligencia: "Inteligência",
};

export const NETWORK_PLAN_STATUS: Record<NetworkPlanStatus, { label: string; tone: Tone }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  revisao: { label: "Em revisão", tone: "warning" },
  liberado: { label: "Liberado para a rede", tone: "success" },
};

export const TIER_ORDER: ServiceTier[] = ["essencial", "acompanhamento", "ativacao", "inteligencia"];

export const ITEM_ORIGIN: Record<ItemOrigin, string> = {
  manual: "Criada pela loja",
  ia: "Sugestão da IA",
  hub: "Pauta da Hub",
  base: "Calendário da rede",
  banco: "Banco de ideias",
};

export const EVENT_SCOPE: Record<EventScope, string> = {
  nacional: "Nacional",
  regional: "Regional",
  local: "Local",
};

export const EVENT_KIND: Record<EventKind, string> = {
  campanha: "Campanha",
  data_comercial: "Data comercial",
  data_local: "Data local",
  clima: "Clima",
};

export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "brand";

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  planejado: { label: "Planejado", tone: "neutral" },
  em_andamento: { label: "Em andamento", tone: "warning" },
  pausado: { label: "Pausado", tone: "info" },
  concluido: { label: "Concluído", tone: "success" },
  cancelado: { label: "Cancelado", tone: "danger" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  a_fazer: { label: "A fazer", tone: "neutral" },
  fazendo: { label: "Fazendo", tone: "info" },
  em_aprovacao: { label: "Em aprovação", tone: "warning" },
  concluida: { label: "Concluída", tone: "success" },
  bloqueada: { label: "Bloqueada", tone: "danger" },
};

export const TASK_STATUS_ORDER: TaskStatus[] = ["a_fazer", "fazendo", "em_aprovacao", "bloqueada", "concluida"];

export const PLAYBOOK_CATEGORY: Record<string, string> = {
  conteudo: "Conteúdo",
  campanha: "Campanha",
  operacao: "Operação",
  onboarding: "Onboarding",
  outro: "Outro",
};

export const ENTITY_LABEL: Record<string, string> = {
  plan_items: "Peça",
  monthly_plans: "Plano do mês",
  projects: "Projeto",
  tasks: "Tarefa",
  brand_voices: "Voz de marca",
  tenant_themes: "Identidade visual",
  brand_rules: "Regra de marca",
  assets: "Ativo",
  kits: "Kit",
  best_practices: "Case",
  result_entries: "Resultado",
  editorias: "Editoria",
};

// Rótulo de status para qualquer entidade da linha do tempo.
export function statusLabel(entity: string, status?: string) {
  if (!status) return "";
  const maps: Record<string, Record<string, { label: string }>> = {
    plan_items: ITEM_STATUS, monthly_plans: PLAN_STATUS, projects: PROJECT_STATUS, tasks: TASK_STATUS,
  };
  return maps[entity]?.[status]?.label ?? status;
}
