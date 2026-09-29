"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { resolveMonth } from "@/lib/month";
import { draftItem, suggestIdeas, suggestionSchema, type StudioContext, type Suggestion } from "@/lib/studio";
import { loadBrand } from "@/lib/brand";
import type { CalendarEvent, Editoria, PlanItem, TierQuota } from "@/lib/types";

type Ref = { slug: string; operationId: string; month: string };

export type SuggestState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; ideas: Suggestion[] }
  | { status: "added"; count: number };

// Monta o contexto só com o que o usuário enxerga (RLS): a IA nunca vê dado de outra loja.
async function loadContext(ref: Ref) {
  const ctx = await getTenantContext(ref.slug);
  const month = resolveMonth(ref.month);
  const supabase = await createClient();

  const { data: op } = await supabase.from("operations")
    .select("id, name, city, state, kind, tier, region_id, regions(name)")
    .eq("tenant_id", ctx.tenant.id).eq("id", ref.operationId).maybeSingle();
  if (!op) return null;

  const [brand, { data: plan }, { data: events }, { data: editorias }, { data: quota }] = await Promise.all([
    loadBrand(supabase, ctx.tenant.id),
    supabase.from("monthly_plans").select("id, focus").eq("operation_id", op.id).eq("month", month.first).maybeSingle(),
    supabase.from("calendar_events").select("*").eq("tenant_id", ctx.tenant.id)
      .lte("starts_on", month.last).gte("ends_on", month.first)
      .or(`scope.eq.nacional,region_id.eq.${op.region_id},operation_id.eq.${op.id}`).order("starts_on"),
    supabase.from("editorias").select("*").eq("tenant_id", ctx.tenant.id).eq("active", true).order("position"),
    op.tier
      ? supabase.from("tier_quotas").select("tier, posts, stories").eq("tenant_id", ctx.tenant.id).eq("tier", op.tier).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!plan) return null;
  const { data: items } = await supabase.from("plan_items").select("*").eq("plan_id", plan.id);

  const region = (op as unknown as { regions: { name: string } | null }).regions;
  const studio: StudioContext = {
    brandName: ctx.tenant.name,
    brand,
    operation: { name: op.name, city: op.city, state: op.state, region: region?.name ?? null, kind: op.kind },
    month,
    focus: plan.focus,
    events: (events ?? []) as CalendarEvent[],
    existing: (items ?? []) as PlanItem[],
    editorias: (editorias ?? []) as Editoria[],
    quota: (quota ?? null) as TierQuota | null,
  };
  const caller = { supabase, tenantId: ctx.tenant.id, userId: ctx.userId };
  return { ctx, studio, caller, planId: plan.id, items: (items ?? []) as PlanItem[] };
}

export async function suggestPlanIdeas(ref: Ref, _prev: SuggestState, formData: FormData): Promise<SuggestState> {
  if (formData.get("intent") === "add") return addSuggestions(ref, formData);
  const loaded = await loadContext(ref);
  if (!loaded) return { status: "error", message: "Crie o plano do mês antes de pedir sugestões." };
  const res = await suggestIdeas(loaded.caller, loaded.studio);
  if (!res.ok) return { status: "error", message: res.message };
  return res.data.length ? { status: "ok", ideas: res.data } : { status: "error", message: "A IA não trouxe sugestões válidas. Tente de novo." };
}

async function addSuggestions(ref: Ref, formData: FormData): Promise<SuggestState> {
  const parsed = z.array(suggestionSchema).safeParse(
    formData.getAll("idea").map((raw) => { try { return JSON.parse(String(raw)); } catch { return null; } }),
  );
  if (!parsed.success || parsed.data.length === 0) return { status: "error", message: "Selecione ao menos uma sugestão." };

  const loaded = await loadContext(ref);
  if (!loaded) return { status: "error", message: "Plano não encontrado." };
  const eventByTitle = new Map(loaded.studio.events.map((e) => [e.title, e.id]));
  const editoriaByName = new Map(loaded.studio.editorias.map((e) => [e.name.toLowerCase(), e]));
  const { first, last } = loaded.studio.month;

  const supabase = await createClient();
  const { error } = await supabase.from("plan_items").insert(parsed.data.map((s) => {
    const editoria = s.editoria ? editoriaByName.get(s.editoria.toLowerCase()) : undefined;
    return {
      tenant_id: loaded.ctx.tenant.id,
      plan_id: loaded.planId,
      title: s.title,
      format: s.format,
      scheduled_on: s.scheduled_on >= first && s.scheduled_on <= last ? s.scheduled_on : null,
      calendar_event_id: (s.event_title && eventByTitle.get(s.event_title)) || null,
      editoria_id: editoria?.id ?? null,
      funnel: s.funnel ?? editoria?.funnel ?? null,
      idea: s.idea || null,
      rationale: s.why || null,
      hook: s.hook || null,
      script: s.script || null,
      caption: s.caption || null,
      status: "ideia" as const,
      // Pauta aceita por Hub/Marca vira "da Hub" (cérebro travado para a loja).
      origin: loaded.ctx.isManager ? "hub" : "ia",
      created_by: loaded.ctx.userId,
    };
  }));
  if (error) {
    console.error("[estudio] addSuggestions:", error.code, error.message);
    return { status: "error", message: "Não foi possível adicionar ao plano." };
  }
  revalidatePath(`/${ref.slug}`, "layout");
  return { status: "added", count: parsed.data.length };
}

export type DraftState = { status: "idle" } | { status: "error"; message: string } | { status: "ok"; script: string; caption: string };

export async function draftPlanItem(ref: Ref, itemId: string): Promise<DraftState> {
  const loaded = await loadContext(ref);
  const item = loaded?.items.find((i) => i.id === itemId);
  if (!loaded || !item) return { status: "error", message: "Peça não encontrada." };
  const eventTitle = loaded.studio.events.find((e) => e.id === item.calendar_event_id)?.title ?? null;
  const res = await draftItem(loaded.caller, loaded.studio, item, eventTitle);
  return res.ok ? { status: "ok", ...res.data } : { status: "error", message: res.message };
}
