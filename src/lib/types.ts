export type MemberRole = "hub" | "marca" | "regional" | "lojista";
export type OperationKind = "loja" | "grupo" | "revenda";
export type EventScope = "nacional" | "regional" | "local";
export type EventKind = "campanha" | "data_comercial" | "data_local" | "clima";
export type PlanStatus = "rascunho" | "em_execucao" | "em_analise" | "fechado";
export type ItemFormat = "reels" | "carrossel" | "stories" | "post" | "whatsapp" | "evento" | "acao_loja";
export type ItemStatus = "ideia" | "roteiro" | "aprovacao" | "aprovado" | "publicado";
export type FunnelStage = "descoberta" | "consideracao" | "conversao" | "relacionamento";
export type ServiceTier = "essencial" | "acompanhamento" | "ativacao" | "inteligencia";
export type ItemOrigin = "manual" | "ia" | "hub" | "base" | "banco";

export type Editoria = {
  id: string;
  name: string;
  description: string | null;
  funnel: FunnelStage | null;
  share: number | null;
  position: number;
  active: boolean;
};

export type TierQuota = { tier: ServiceTier; posts: number; stories: number };

export type Tenant = { id: string; slug: string; name: string };

export type TenantTheme = {
  brand: string;
  brand_hover: string;
  brand_soft: string;
  on_brand: string;
  accent: string;
  accent_ink: string;
  brand_dark: string;
  brand_hover_dark: string;
  brand_soft_dark: string;
  on_brand_dark: string;
  accent_ink_dark: string;
  font_display: string;
  logo_url: string | null;
  logo_dark_url: string | null;
};

export type Region = { id: string; code: string; name: string };

export type Operation = {
  id: string;
  region_id: string;
  name: string;
  city: string | null;
  state: string | null;
  instagram: string | null;
  kind: OperationKind;
  in_pilot: boolean;
  tier?: ServiceTier | null;
};

export type CalendarEvent = {
  id: string;
  scope: EventScope;
  kind: EventKind;
  region_id: string | null;
  operation_id: string | null;
  title: string;
  notes: string | null;
  starts_on: string;
  ends_on: string;
};

export type MonthlyPlan = {
  id: string;
  operation_id: string;
  month: string;
  status: PlanStatus;
  focus: string | null;
};

export type PlanItem = {
  id: string;
  plan_id: string;
  calendar_event_id: string | null;
  title: string;
  format: ItemFormat;
  scheduled_on: string | null;
  status: ItemStatus;
  script: string | null;
  caption: string | null;
  editoria_id: string | null;
  funnel: FunnelStage | null;
  idea: string | null;
  rationale: string | null;
  hook: string | null;
  kit_id: string | null;
  practice_id: string | null;
  sensitive: boolean;
  published_url: string | null;
  origin: ItemOrigin;
};

export type ProjectStatus = "planejado" | "em_andamento" | "pausado" | "concluido" | "cancelado";
export type TaskStatus = "a_fazer" | "fazendo" | "em_aprovacao" | "concluida" | "bloqueada";

export type Playbook = {
  id: string;
  tenant_id: string | null;
  name: string;
  category: string;
  description: string | null;
  active: boolean;
};

export type PlaybookStep = {
  id: string;
  playbook_id: string;
  position: number;
  title: string;
  description: string | null;
  owner_role: MemberRole;
  approver_role: MemberRole | null;
  due_offset_days: number;
  estimate_minutes: number;
  internal: boolean;
  checklist: string[];
};

export type Project = {
  id: string;
  tenant_id: string;
  operation_id: string | null;
  playbook_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  starts_on: string;
  due_on: string | null;
  owner_id: string | null;
};

export type ChecklistEntry = { label: string; done: boolean };

export type Task = {
  id: string;
  tenant_id: string;
  project_id: string;
  position: number;
  title: string;
  description: string | null;
  owner_role: MemberRole;
  approver_role: MemberRole | null;
  assignee_id: string | null;
  status: TaskStatus;
  due_on: string | null;
  checklist: ChecklistEntry[];
  internal: boolean;
  estimate_minutes: number;
  completed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
};

export type Activity = {
  id: number;
  operation_id: string | null;
  project_id: string | null;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  title: string | null;
  meta: { de?: string; para?: string } & Record<string, unknown>;
  created_at: string;
};

export type Comment = {
  id: string;
  entity_type: string;
  entity_id: string;
  author_id: string;
  body: string;
  internal: boolean;
  created_at: string;
};

export type Profile = { id: string; email: string | null; full_name: string | null };
