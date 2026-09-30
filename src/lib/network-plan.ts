import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRange, type Month } from "@/lib/month";
import { FUNNEL_STAGE, ITEM_FORMAT, SERVICE_TIER, TIER_ORDER } from "@/lib/labels";
import { brandContext, type Brand } from "@/lib/brand";
import { quotaKind } from "@/lib/pautas";
import { runAi } from "@/lib/ai";
import type { CalendarEvent, Editoria, FunnelStage, ItemFormat, NetworkPlanItem, ServiceTier, TierQuota } from "@/lib/types";

// Calendário-base da rede (fase 3 do motor de pautas): a IA monta o mês para
// todas as lojas; a Hub revisa e libera. A adaptação à cidade acontece na pauta
// da loja, quando o lojista pede "escrever com IA".

export type BaseContext = {
  brandName: string;
  brand: Brand;
  month: Month;
  focus: string | null;
  events: (CalendarEvent & { region_name?: string | null })[];
  editorias: Editoria[];
  quotas: TierQuota[];
  practices: { title: string; summary: string; why_it_worked: string | null; format: ItemFormat | null }[];
  existing: Pick<NetworkPlanItem, "title" | "format" | "scheduled_on" | "min_tier">[];
};

type Caller = { supabase: SupabaseClient; tenantId: string; userId: string };

const FORMATS = Object.keys(ITEM_FORMAT) as [ItemFormat, ...ItemFormat[]];
const FUNNELS = Object.keys(FUNNEL_STAGE) as [FunnelStage, ...FunnelStage[]];
const TIERS = TIER_ORDER as [ServiceTier, ...ServiceTier[]];

export const baseItemSchema = z.object({
  title: z.string().min(3).max(140),
  format: z.enum(FORMATS),
  scheduled_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  min_tier: z.enum(TIERS),
  event_title: z.string().nullable(),
  editoria: z.string().nullable(),
  funnel: z.enum(FUNNELS).nullable(),
  idea: z.string().max(600),
  why: z.string().max(400),
  hook: z.string().max(200),
  sensitive: z.boolean(),
});
export type BaseItem = z.infer<typeof baseItemSchema>;

/** Quantas pautas de cada tipo cada pacote recebe com a base atual (mesma regra do banco). */
export function tierCoverage(items: Pick<NetworkPlanItem, "format" | "min_tier">[], quotas: TierQuota[]) {
  return TIER_ORDER.map((tier) => {
    const rank = TIER_ORDER.indexOf(tier);
    const eligible = items.filter((i) => TIER_ORDER.indexOf(i.min_tier) <= rank);
    const count = (k: "posts" | "stories") => eligible.filter((i) => quotaKind(i.format) === k).length;
    const quota = quotas.find((q) => q.tier === tier) ?? null;
    return {
      tier,
      posts: count("posts"),
      stories: count("stories"),
      activations: eligible.filter((i) => quotaKind(i.format) === null).length,
      quota,
    };
  });
}

/** O que falta para fechar o volume de cada pacote (o maior pacote define o total). */
function missing(ctx: BaseContext) {
  const coverage = tierCoverage(ctx.existing, ctx.quotas);
  return coverage
    .filter((c) => c.quota)
    .map((c) => ({
      tier: c.tier,
      posts: Math.max(0, (c.quota?.posts ?? 0) - c.posts),
      stories: Math.max(0, (c.quota?.stories ?? 0) - c.stories),
    }));
}

function system(ctx: BaseContext) {
  return [
    `Você é estrategista de conteúdo da Hub para a rede de lojas da marca ${ctx.brandName}.`,
    "Você monta o calendário-base do mês: o cérebro que toda a rede recebe. Cada loja depois cria e publica as pautas com o próprio celular.",
    "Você não cria campanhas paralelas, não altera a identidade da marca e não inventa preços, descontos, produtos ou lançamentos que não estejam no contexto.",
    "Respeite todas as regras da marca abaixo.",
    brandContext(ctx.brandName, ctx.brand),
    "Escreva em português do Brasil.",
  ].join("\n");
}

function situation(ctx: BaseContext) {
  const events = ctx.events.length
    ? ctx.events.map((e) => `- ${formatRange(e.starts_on, e.ends_on)}: ${e.title} (${e.scope}${e.region_name ? ` · ${e.region_name}` : ""})${e.notes ? ` — ${e.notes}` : ""}`).join("\n")
    : "- (sem campanhas ou datas cadastradas)";
  const editorias = ctx.editorias.length
    ? ctx.editorias.map((e) => `- ${e.name}${e.funnel ? ` [${e.funnel}]` : ""}${e.share ? ` (${e.share}% do mês)` : ""}${e.description ? `: ${e.description}` : ""}`).join("\n")
    : "- (a marca ainda não definiu editorias)";
  const quotas = ctx.quotas.length
    ? ctx.quotas.map((q) => `- ${SERVICE_TIER[q.tier]} (${q.tier}): ${q.posts} posts e ${q.stories} stories`).join("\n")
    : "- (volume não definido)";
  const practices = ctx.practices.length
    ? ctx.practices.map((p) => `- ${p.title}${p.format ? ` (${ITEM_FORMAT[p.format]})` : ""}: ${p.summary}${p.why_it_worked ? ` Funcionou porque: ${p.why_it_worked}` : ""}`).join("\n")
    : "- (a Biblioteca ainda não tem cases)";
  const existing = ctx.existing.length
    ? ctx.existing.map((i) => `- ${i.scheduled_on ?? "sem data"}: ${i.title} (${ITEM_FORMAT[i.format]}, ${i.min_tier})`).join("\n")
    : "- (nenhuma)";
  return [
    `Mês: ${ctx.month.label} (${ctx.month.first} a ${ctx.month.last}).`,
    ctx.focus && `Foco da rede no mês: ${ctx.focus}`,
    `Campanhas e datas do mês:\n${events}`,
    `Editorias da marca (toda pauta pertence a uma, use o nome exato e respeite o peso):\n${editorias}`,
    `Volume por pacote (posts = reels, carrossel ou post):\n${quotas}`,
    `Cases da Biblioteca que funcionaram:\n${practices}`,
    `Pautas já na base (não repetir):\n${existing}`,
  ].filter(Boolean).join("\n\n");
}

export async function generateBase(caller: Caller, ctx: BaseContext) {
  const gaps = missing(ctx);
  const posts = Math.max(0, ...gaps.map((g) => g.posts));
  const stories = Math.max(0, ...gaps.map((g) => g.stories));
  const activations = ctx.existing.some((i) => quotaKind(i.format) === null) ? 0 : 3;
  const total = posts + stories + activations;
  if (total === 0) return { ok: false as const, message: "A base já fecha o volume de todos os pacotes." };

  const byTier = gaps.map((g) => `${g.tier}: faltam ${g.posts} posts e ${g.stories} stories`).join("; ");
  const res = await runAi({
    ...caller,
    feature: "base.gerar",
    system: system(ctx),
    prompt: [
      situation(ctx),
      `Gere ${posts} posts, ${stories} stories${activations ? ` e ${activations} ativações (whatsapp, evento ou acao_loja)` : ""}.`,
      `Distribua min_tier para fechar o volume de cada pacote, contando o que já está na base (${byTier}).`,
      "Cada pauta traz a ideia (o que mostrar), o porquê estratégico, o estágio do funil e o gancho dos primeiros segundos. Sem roteiro nem legenda: a loja escreve com a IA depois.",
    ].join("\n\n"),
    schema: z.object({ items: z.array(baseItemSchema) }),
  });
  if (!res.ok) return res;
  const items = res.data.items
    .filter((i) => i.scheduled_on >= ctx.month.first && i.scheduled_on <= ctx.month.last)
    .slice(0, total + 5);
  return { ok: true as const, data: items };
}
