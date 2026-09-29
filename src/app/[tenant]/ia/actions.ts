"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { AI_FEATURE_KEYS, type AiFeature } from "@/lib/ai/features";

const back = (slug: string, erro?: string) => `/${slug}/ia${erro ? `?erro=${erro}` : ""}`;
const MODEL = /^[a-z0-9-]+\/[a-z0-9.\-]+$/;

async function hubOnly(slug: string) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isHub) redirect(back(slug, "permissao"));
  return { ctx, supabase: await createClient() };
}

export async function saveAiSettings(slug: string, formData: FormData) {
  const { ctx, supabase } = await hubOnly(slug);
  const budget = Number(String(formData.get("monthly_budget_usd") ?? "0").replace(",", "."));
  const model = String(formData.get("model") ?? "").trim();
  const features = formData.getAll("features").map(String).filter((f): f is AiFeature => AI_FEATURE_KEYS.includes(f as AiFeature));
  if (!Number.isFinite(budget) || budget < 0 || (model && !MODEL.test(model))) redirect(back(slug, "dados"));
  const { error } = await supabase.from("ai_settings").upsert({
    tenant_id: ctx.tenant.id, enabled: formData.get("enabled") === "on", features,
    monthly_budget_usd: budget, model: model || null,
  });
  if (error) redirect(back(slug, "salvar"));
  revalidatePath(back(slug));
  redirect(back(slug));
}

// Cada salvamento é uma nova versão; a anterior fica no histórico.
export async function savePrompt(slug: string, feature: string, formData: FormData) {
  const { ctx, supabase } = await hubOnly(slug);
  const instructions = String(formData.get("instructions") ?? "").trim();
  if (!AI_FEATURE_KEYS.includes(feature as AiFeature) || instructions.length < 10 || instructions.length > 8000) redirect(back(slug, "dados"));
  const { data: last } = await supabase.from("ai_prompts").select("version").eq("tenant_id", ctx.tenant.id).eq("key", feature)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  await supabase.from("ai_prompts").update({ active: false }).eq("tenant_id", ctx.tenant.id).eq("key", feature);
  const { error } = await supabase.from("ai_prompts").insert({
    tenant_id: ctx.tenant.id, key: feature, instructions, version: (last?.version ?? 0) + 1, active: true,
  });
  if (error) redirect(back(slug, "salvar"));
  revalidatePath(back(slug));
  redirect(back(slug));
}

export async function resetPrompt(slug: string, feature: string) {
  const { ctx, supabase } = await hubOnly(slug);
  await supabase.from("ai_prompts").update({ active: false }).eq("tenant_id", ctx.tenant.id).eq("key", feature);
  revalidatePath(back(slug));
  redirect(back(slug));
}
