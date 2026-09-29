import "server-only";
import { generateText, Output } from "ai";
import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_FEATURES, DEFAULT_MODEL, type AiFeature } from "./features";

export { AI_FEATURES, AI_FEATURE_KEYS, DEFAULT_MODEL, type AiFeature } from "./features";

// A chave é do servidor (Vercel AI Gateway). Sem ela, tudo que é IA fica
// desligado e as telas seguem funcionando no modo manual.
export function aiKeyConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export type AiAccess =
  | { ok: true; model: string }
  | { ok: false; reason: "sem_chave" | "desligada" | "funcao_desligada" | "orcamento"; message: string };

const MESSAGES = {
  sem_chave: "IA ainda não ligada: falta a chave do AI Gateway no servidor.",
  desligada: "IA desligada para esta marca. A equipe Hub liga em Configuração › IA.",
  funcao_desligada: "Esta função de IA está desligada para esta marca.",
  orcamento: "O orçamento de IA do mês acabou. A equipe Hub pode ampliar em Configuração › IA.",
} as const;

export async function aiAccess(supabase: SupabaseClient, tenantId: string, feature: AiFeature): Promise<AiAccess> {
  if (!aiKeyConfigured()) return { ok: false, reason: "sem_chave", message: MESSAGES.sem_chave };
  const { data, error } = await supabase.rpc("ai_budget", { p_tenant: tenantId }).maybeSingle();
  const b = data as { enabled: boolean; features: string[]; budget_usd: number; spent_usd: number; model: string | null } | null;
  if (error || !b || !b.enabled) return { ok: false, reason: "desligada", message: MESSAGES.desligada };
  if (!b.features.includes(feature)) return { ok: false, reason: "funcao_desligada", message: MESSAGES.funcao_desligada };
  if (Number(b.budget_usd) > 0 && Number(b.spent_usd) >= Number(b.budget_usd)) {
    return { ok: false, reason: "orcamento", message: MESSAGES.orcamento };
  }
  return { ok: true, model: b.model || DEFAULT_MODEL };
}

// Instruções da função: versão ativa do tenant > padrão do produto no banco > código.
export async function loadInstructions(supabase: SupabaseClient, tenantId: string, feature: AiFeature) {
  const { data } = await supabase.from("ai_prompts").select("tenant_id, instructions, model, version")
    .eq("key", feature).eq("active", true).or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .order("version", { ascending: false });
  const rows = (data ?? []) as { tenant_id: string | null; instructions: string; model: string | null }[];
  const pick = rows.find((r) => r.tenant_id) ?? rows.find((r) => !r.tenant_id);
  return { instructions: pick?.instructions ?? AI_FEATURES[feature].instructions, model: pick?.model ?? null };
}

// Estimativa quando o gateway não informa custo (USD por milhão de tokens).
const FALLBACK_PRICE = { input: 3, output: 15 };

function costFrom(meta: unknown, input: number, output: number) {
  const raw = (meta as { gateway?: { cost?: unknown } } | undefined)?.gateway?.cost;
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (Number.isFinite(n)) return n;
  return (input * FALLBACK_PRICE.input + output * FALLBACK_PRICE.output) / 1_000_000;
}

type RunArgs<S extends z.ZodType> = {
  supabase: SupabaseClient;
  tenantId: string;
  userId: string;
  feature: AiFeature;
  system: string;
  prompt: string;
  schema: S;
};

export type AiResult<T> = { ok: true; data: T } | { ok: false; message: string };

// Única porta de saída para o modelo: checa acesso, usa as instruções vigentes,
// e registra uso e custo (ai_usage) mesmo quando dá erro.
export async function runAi<S extends z.ZodType>(args: RunArgs<S>): Promise<AiResult<z.infer<S>>> {
  const access = await aiAccess(args.supabase, args.tenantId, args.feature);
  if (!access.ok) return { ok: false, message: access.message };
  const { instructions, model: promptModel } = await loadInstructions(args.supabase, args.tenantId, args.feature);
  const model = promptModel || access.model;

  const log = (row: { input_tokens?: number; output_tokens?: number; cost_usd?: number; ok: boolean; error?: string }) =>
    args.supabase.from("ai_usage").insert({ tenant_id: args.tenantId, user_id: args.userId, feature: args.feature, model, ...row })
      .then(({ error }) => { if (error) console.error("[ia] ai_usage:", error.code, error.message); });

  try {
    const result = await generateText({
      model,
      system: args.system,
      prompt: `${args.prompt}\n\n${instructions}`,
      output: Output.object({ schema: args.schema }),
      providerOptions: { gateway: { user: args.userId, tags: [`feature:${args.feature}`, `tenant:${args.tenantId}`] } },
    });
    const input = result.usage.inputTokens ?? 0;
    const output = result.usage.outputTokens ?? 0;
    await log({ input_tokens: input, output_tokens: output, cost_usd: costFrom(result.providerMetadata, input, output), ok: true });
    return { ok: true, data: result.output as z.infer<S> };
  } catch (e) {
    console.error(`[ia] ${args.feature}:`, e);
    await log({ ok: false, error: e instanceof Error ? e.message.slice(0, 500) : "erro" });
    return { ok: false, message: "A IA não respondeu agora. Tente de novo em instantes." };
  }
}
