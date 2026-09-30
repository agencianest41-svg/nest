"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { resolveMonth } from "@/lib/month";
import { loadBrand } from "@/lib/brand";
import { generateBase, type BaseContext } from "@/lib/network-plan";
import { FUNNEL_STAGE, ITEM_FORMAT, SERVICE_TIER } from "@/lib/labels";
import type { CalendarEvent, Editoria, TierQuota } from "@/lib/types";

// Calendário-base: só Hub e Marca (RLS). O plano e o mês vêm do banco.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

type Ref = { slug: string; month: string };

function back({ slug, month }: Ref, extra = "") {
  return `/${slug}/calendario/base?mes=${month}${extra}`;
}

function done(ref: Ref, extra = "") {
  revalidatePath(`/${ref.slug}`, "layout");
  redirect(back(ref, extra));
}

const opt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

async function manager(ref: Ref) {
  const ctx = await getTenantContext(ref.slug);
  if (!ctx.isManager || !MONTH.test(ref.month)) redirect(back(ref, "&erro=permissao"));
  return ctx;
}

// Campos da pauta da base vindos do formulário; null quando algo é inválido.
function itemFields(fd: FormData, month: { first: string; last: string }) {
  const title = String(fd.get("title") ?? "").trim();
  const format = String(fd.get("format") ?? "reels");
  const tier = String(fd.get("min_tier") ?? "essencial");
  const funnel = opt(fd, "funnel");
  const date = opt(fd, "scheduled_on");
  if (!title || !(format in ITEM_FORMAT) || !(tier in SERVICE_TIER) || (funnel && !(funnel in FUNNEL_STAGE))) return null;
  if (date && (!DATE.test(date) || date < month.first || date > month.last)) return null;
  return {
    title,
    format,
    min_tier: tier,
    scheduled_on: date,
    funnel,
    calendar_event_id: opt(fd, "calendar_event_id"),
    editoria_id: opt(fd, "editoria_id"),
    idea: opt(fd, "idea"),
    rationale: opt(fd, "rationale"),
    hook: opt(fd, "hook"),
    sensitive: fd.get("sensitive") === "on",
  };
}

export async function createBase(ref: Ref) {
  const ctx = await manager(ref);
  const supabase = await createClient();
  const { error } = await supabase.from("network_plans").insert({ tenant_id: ctx.tenant.id, month: `${ref.month}-01` });
  if (error && error.code !== "23505") redirect(back(ref, "&erro=salvar"));
  done(ref);
}

export async function updateBase(ref: Ref, planId: string, formData: FormData) {
  const ctx = await manager(ref);
  const status = String(formData.get("status"));
  const patch: Record<string, string | null> = { focus: opt(formData, "focus") };
  if (status === "rascunho" || status === "revisao") patch.status = status;
  const supabase = await createClient();
  const { error } = await supabase.from("network_plans").update(patch).eq("id", planId).eq("tenant_id", ctx.tenant.id);
  if (error) redirect(back(ref, "&erro=salvar"));
  done(ref);
}

export async function addBaseItem(ref: Ref, planId: string, formData: FormData) {
  const ctx = await manager(ref);
  const fields = itemFields(formData, resolveMonth(ref.month));
  if (!fields) redirect(back(ref, "&erro=dados"));
  const supabase = await createClient();
  const { error } = await supabase.from("network_plan_items").insert({
    ...fields, tenant_id: ctx.tenant.id, network_plan_id: planId, origin: "manual",
  });
  if (error) redirect(back(ref, "&erro=salvar"));
  done(ref);
}

export async function updateBaseItem(ref: Ref, itemId: string, formData: FormData) {
  const ctx = await manager(ref);
  const fields = itemFields(formData, resolveMonth(ref.month));
  if (!fields) redirect(back(ref, `&erro=dados&pauta=${itemId}#pauta-${itemId}`));
  const supabase = await createClient();
  const { error } = await supabase.from("network_plan_items").update(fields).eq("id", itemId).eq("tenant_id", ctx.tenant.id);
  if (error) redirect(back(ref, `&erro=salvar&pauta=${itemId}#pauta-${itemId}`));
  done(ref, `#pauta-${itemId}`);
}

export async function deleteBaseItem(ref: Ref, itemId: string) {
  const ctx = await manager(ref);
  const supabase = await createClient();
  await supabase.from("network_plan_items").delete().eq("id", itemId).eq("tenant_id", ctx.tenant.id);
  done(ref);
}

export async function generateBaseItems(ref: Ref, planId: string) {
  const ctx = await manager(ref);
  const month = resolveMonth(ref.month);
  const supabase = await createClient();

  const [{ data: plan }, brand, { data: events }, { data: regions }, { data: editorias }, { data: quotas }, { data: practices }, { data: existing }] =
    await Promise.all([
      supabase.from("network_plans").select("id, focus").eq("id", planId).eq("tenant_id", ctx.tenant.id).maybeSingle(),
      loadBrand(supabase, ctx.tenant.id),
      supabase.from("calendar_events").select("*").eq("tenant_id", ctx.tenant.id).in("scope", ["nacional", "regional"])
        .lte("starts_on", month.last).gte("ends_on", month.first).order("starts_on"),
      supabase.from("regions").select("id, name").eq("tenant_id", ctx.tenant.id),
      supabase.from("editorias").select("*").eq("tenant_id", ctx.tenant.id).eq("active", true).order("position"),
      supabase.from("tier_quotas").select("tier, posts, stories").eq("tenant_id", ctx.tenant.id),
      supabase.from("best_practices").select("title, summary, why_it_worked, format").eq("tenant_id", ctx.tenant.id)
        .eq("published", true).order("created_at", { ascending: false }).limit(8),
      supabase.from("network_plan_items").select("title, format, scheduled_on, min_tier").eq("network_plan_id", planId),
    ]);
  if (!plan) redirect(back(ref, "&erro=salvar"));

  const regionName = new Map((regions ?? []).map((r) => [r.id, r.name as string]));
  const eventList = ((events ?? []) as CalendarEvent[]).map((e) => ({ ...e, region_name: e.region_id ? regionName.get(e.region_id) ?? null : null }));
  const editoriaList = (editorias ?? []) as Editoria[];
  const base: BaseContext = {
    brandName: ctx.tenant.name,
    brand,
    month,
    focus: plan.focus,
    events: eventList,
    editorias: editoriaList,
    quotas: (quotas ?? []) as TierQuota[],
    practices: (practices ?? []) as BaseContext["practices"],
    existing: (existing ?? []) as BaseContext["existing"],
  };

  const res = await generateBase({ supabase, tenantId: ctx.tenant.id, userId: ctx.userId }, base);
  if (!res.ok) redirect(back(ref, `&erro=ia&msg=${encodeURIComponent(res.message)}`));
  if (res.data.length === 0) redirect(back(ref, "&erro=ia"));

  const eventByTitle = new Map(eventList.map((e) => [e.title, e.id]));
  const editoriaByName = new Map(editoriaList.map((e) => [e.name.toLowerCase(), e]));
  const rows = res.data.map((s, i) => {
    const editoria = s.editoria ? editoriaByName.get(s.editoria.toLowerCase()) : undefined;
    return {
      tenant_id: ctx.tenant.id,
      network_plan_id: planId,
      position: (existing?.length ?? 0) + i,
      title: s.title,
      format: s.format,
      scheduled_on: s.scheduled_on,
      min_tier: s.min_tier,
      calendar_event_id: (s.event_title && eventByTitle.get(s.event_title)) || null,
      editoria_id: editoria?.id ?? null,
      funnel: s.funnel ?? editoria?.funnel ?? null,
      idea: s.idea || null,
      rationale: s.why || null,
      hook: s.hook || null,
      sensitive: s.sensitive,
      origin: "ia" as const,
    };
  });
  const { error } = await supabase.from("network_plan_items").insert(rows);
  if (error) {
    console.error("[base] generate:", error.code, error.message);
    redirect(back(ref, "&erro=salvar"));
  }
  await supabase.from("network_plans").update({ generated_at: new Date().toISOString(), status: "revisao" })
    .eq("id", planId).eq("status", "rascunho");
  done(ref, `&gerado=${rows.length}`);
}

export async function releaseBase(ref: Ref, planId: string) {
  await manager(ref);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("release_network_plan", { p_plan: planId }).maybeSingle();
  if (error || !data) {
    console.error("[base] release:", error?.code, error?.message);
    redirect(back(ref, "&erro=liberar"));
  }
  const r = data as { operations: number; items: number };
  done(ref, `&liberado=${r.operations}-${r.items}`);
}
