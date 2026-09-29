"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { brandContext, loadBrand, type RuleKind } from "@/lib/brand";
import { runAi } from "@/lib/ai";

export type BrandIssue = { kind: RuleKind; term: string | null; severity: "bloqueia" | "alerta"; guidance: string };
export type BrandCheckState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      issues: BrandIssue[];
      ai: { score: number; problems: { excerpt: string; why: string; fix: string }[]; rewrite: string } | null;
      aiMessage?: string;
    };

// Guardião de marca: regras do banco (sempre) + revisão da IA (quando ligada).
export async function checkBrandText(slug: string, _prev: BrandCheckState, formData: FormData): Promise<BrandCheckState> {
  const ctx = await getTenantContext(slug);
  const text = ["title", "script", "caption", "text"].map((k) => String(formData.get(k) ?? "").trim()).filter(Boolean).join("\n\n");
  if (!text) return { status: "error", message: "Escreva algo para checar." };
  if (text.length > 8000) return { status: "error", message: "Texto longo demais para checar de uma vez." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_brand", { p_tenant: ctx.tenant.id, p_text: text });
  if (error) return { status: "error", message: "Não foi possível checar agora." };
  const issues = (data ?? []) as BrandIssue[];

  if (formData.get("use_ai") !== "1") return { status: "ok", issues, ai: null };

  const brand = await loadBrand(supabase, ctx.tenant.id);
  const res = await runAi({
    supabase, tenantId: ctx.tenant.id, userId: ctx.userId, feature: "marca.checar",
    system: `Você é o guardião da marca ${ctx.tenant.name}. Escreva em português do Brasil.\n${brandContext(ctx.tenant.name, brand)}`,
    prompt: `Texto para revisar:\n"""\n${text}\n"""`,
    schema: z.object({
      score: z.number().min(0).max(100),
      problems: z.array(z.object({ excerpt: z.string(), why: z.string(), fix: z.string() })).max(8),
      rewrite: z.string().max(3000),
    }),
  });
  return res.ok ? { status: "ok", issues, ai: res.data } : { status: "ok", issues, ai: null, aiMessage: res.message };
}
