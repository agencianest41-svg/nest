import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRange, type Month } from "@/lib/month";
import { FUNNEL_STAGE, ITEM_FORMAT } from "@/lib/labels";
import { brandContext, type Brand } from "@/lib/brand";
import { runAi } from "@/lib/ai";
import type { CalendarEvent, Editoria, FunnelStage, ItemFormat, PlanItem, TierQuota } from "@/lib/types";

// Estúdio: IA que leva a campanha nacional à rotina da loja. Instruções vêm da
// camada de IA (ajustáveis por tenant); marca vem do Brand OS.

export type StudioContext = {
  brandName: string;
  brand: Brand;
  operation: { name: string; city: string | null; state: string | null; region: string | null; kind: string };
  month: Month;
  focus: string | null;
  events: CalendarEvent[];
  existing: Pick<PlanItem, "title" | "format" | "scheduled_on">[];
  editorias: Editoria[];
  quota: TierQuota | null;
};

type Caller = { supabase: SupabaseClient; tenantId: string; userId: string };

const FORMATS = Object.keys(ITEM_FORMAT) as [ItemFormat, ...ItemFormat[]];
const FUNNELS = Object.keys(FUNNEL_STAGE) as [FunnelStage, ...FunnelStage[]];

export const suggestionSchema = z.object({
  title: z.string().min(3).max(140),
  format: z.enum(FORMATS),
  scheduled_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  event_title: z.string().nullable(),
  editoria: z.string().nullable(),
  funnel: z.enum(FUNNELS).nullable(),
  idea: z.string().max(600),
  why: z.string().max(400),
  hook: z.string().max(200),
  script: z.string().max(1500),
  caption: z.string().max(1200),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

function system(ctx: StudioContext) {
  return [
    `Você é estrategista de conteúdo da Hub para a rede de lojas da marca ${ctx.brandName}.`,
    "Seu trabalho é a Last Mile: levar a campanha nacional até a rotina de uma loja específica, com o padrão da marca e o calor do comércio local.",
    "Você não cria campanhas paralelas, não altera a identidade da marca e não inventa preços, descontos, produtos ou lançamentos que não estejam no contexto.",
    "Quando citar produto fora da lista da marca, use termos genéricos (ex.: 'sua fragrância favorita').",
    "Mensagens de WhatsApp são para Grupos VIP da loja: curtas, pessoais, com convite a visitar a loja.",
    "Respeite todas as regras da marca abaixo.",
    brandContext(ctx.brandName, ctx.brand),
    "Escreva em português do Brasil.",
  ].join("\n");
}

function situation(ctx: StudioContext) {
  const op = ctx.operation;
  const where = [op.city, op.state].filter(Boolean).join("/");
  const events = ctx.events.length
    ? ctx.events.map((e) => `- ${formatRange(e.starts_on, e.ends_on)}: ${e.title} (${e.scope})${e.notes ? ` — ${e.notes}` : ""}`).join("\n")
    : "- (sem eventos cadastrados)";
  const existing = ctx.existing.length
    ? ctx.existing.map((i) => `- ${i.scheduled_on ?? "sem data"}: ${i.title} (${ITEM_FORMAT[i.format]})`).join("\n")
    : "- (nenhuma)";
  const editorias = ctx.editorias.length
    ? ctx.editorias.map((e) => `- ${e.name}${e.funnel ? ` [${e.funnel}]` : ""}${e.share ? ` (${e.share}% do mês)` : ""}${e.description ? `: ${e.description}` : ""}`).join("\n")
    : "- (a marca ainda não definiu editorias)";
  const quota = ctx.quota
    ? `Volume do pacote da loja no mês: ${ctx.quota.posts} posts (reels, carrossel ou post) e ${ctx.quota.stories} stories.`
    : null;
  return [
    `Operação: ${op.name} (${op.kind}) em ${where || "cidade não informada"}, região ${op.region ?? "—"}.`,
    `Mês: ${ctx.month.label} (${ctx.month.first} a ${ctx.month.last}).`,
    ctx.focus && `Foco definido para o mês: ${ctx.focus}`,
    `Calendário do mês (nacional, regional e local):\n${events}`,
    `Editorias da marca (toda pauta pertence a uma, use o nome exato e respeite o peso):\n${editorias}`,
    quota,
    `Peças já planejadas (não repetir):\n${existing}`,
  ].filter(Boolean).join("\n\n");
}

export async function suggestIdeas(caller: Caller, ctx: StudioContext, count = 5) {
  const res = await runAi({
    ...caller,
    feature: "estudio.sugerir",
    system: system(ctx),
    prompt: [
      situation(ctx),
      `Quantidade: ${count} pautas. Cada pauta traz: a ideia (o que mostrar), o porquê estratégico (por que postar isso agora, para esta loja),` +
        " o estágio do funil, o gancho dos primeiros segundos, um roteiro curto que o próprio lojista consiga gravar com o celular e a legenda.",
    ].join("\n\n"),
    schema: z.object({ ideas: z.array(suggestionSchema) }),
  });
  if (!res.ok) return res;
  const ideas = res.data.ideas
    .filter((i) => i.scheduled_on >= ctx.month.first && i.scheduled_on <= ctx.month.last)
    .slice(0, count);
  return { ok: true as const, data: ideas };
}

export async function draftItem(caller: Caller, ctx: StudioContext, item: Pick<PlanItem, "title" | "format" | "scheduled_on" | "idea" | "rationale" | "hook">, eventTitle: string | null) {
  return runAi({
    ...caller,
    feature: "estudio.escrever",
    system: system(ctx),
    prompt: [
      situation(ctx),
      `Peça: "${item.title}" — formato ${ITEM_FORMAT[item.format]}` +
        `${item.scheduled_on ? `, para ${item.scheduled_on}` : ""}${eventTitle ? `, ativando "${eventTitle}"` : ""}.`,
      item.idea && `Ideia da pauta: ${item.idea}`,
      item.rationale && `Por que postar: ${item.rationale}`,
      item.hook && `Gancho: ${item.hook}`,
      "Escreva um roteiro que o lojista grave sozinho com o celular.",
    ].filter(Boolean).join("\n\n"),
    schema: z.object({ script: z.string().max(1500), caption: z.string().max(1200) }),
  });
}
