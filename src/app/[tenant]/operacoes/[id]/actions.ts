"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { FUNNEL_STAGE, ITEM_FORMAT, ITEM_STATUS, PLAN_STATUS, SERVICE_TIER } from "@/lib/labels";

// Todas as ações confiam na RLS para autorização; o tenant e a operação vêm do
// banco, nunca do formulário.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const HTTPS = /^https:\/\/\S+$/;

type Ref = { slug: string; operationId: string; month: string; vista?: "lista" };

// ?peca= mantém aberta a pauta que acabou de ser salva (painel no calendário,
// item rolado na lista).
function back({ slug, operationId, month, vista }: Ref, erro?: string, itemId?: string) {
  return `/${slug}/operacoes/${operationId}?mes=${month}${vista ? `&vista=${vista}` : ""}${erro ? `&erro=${erro}` : ""}` +
    `${itemId ? `&peca=${itemId}${vista ? `#peca-${itemId}` : ""}` : ""}`;
}

const opt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

// Campos do cérebro só entram quando estão no formulário (campos travados
// chegam desabilitados e não são enviados).
function brainPatch(fd: FormData) {
  const patch: Record<string, string | boolean | null> = {};
  for (const k of ["idea", "rationale", "hook", "editoria_id", "kit_id", "practice_id"] as const) {
    if (fd.has(k)) patch[k] = opt(fd, k);
  }
  if (fd.has("funnel")) {
    const funnel = opt(fd, "funnel");
    if (funnel && !(funnel in FUNNEL_STAGE)) return null;
    patch.funnel = funnel;
  }
  if (fd.has("sensitive_field")) patch.sensitive = fd.get("sensitive") === "on";
  return patch;
}

function errorCode(message: string) {
  if (message.startsWith("Marca:")) return "marca";
  if (message.includes("cérebro") || message.includes("sensíveis")) return "cerebro";
  if (message.includes("aprov")) return "aprovacao";
  return "salvar";
}

function done(ref: Ref, itemId?: string) {
  revalidatePath(`/${ref.slug}`, "layout");
  redirect(back(ref, undefined, itemId));
}

export async function createPlan(ref: Ref) {
  if (!MONTH.test(ref.month)) redirect(back(ref, "dados"));
  const ctx = await getTenantContext(ref.slug);
  const supabase = await createClient();
  const { error } = await supabase.from("monthly_plans").insert({
    tenant_id: ctx.tenant.id,
    operation_id: ref.operationId,
    month: `${ref.month}-01`,
    created_by: ctx.userId,
  });
  if (error && error.code !== "23505") redirect(back(ref, "salvar"));
  done(ref);
}

export async function updatePlan(ref: Ref, planId: string, formData: FormData) {
  const status = String(formData.get("status"));
  if (!(status in PLAN_STATUS)) redirect(back(ref, "dados"));
  const supabase = await createClient();
  const { error } = await supabase.from("monthly_plans")
    .update({ status, focus: String(formData.get("focus") ?? "").trim() || null })
    .eq("id", planId).eq("operation_id", ref.operationId);
  if (error) redirect(back(ref, "salvar"));
  done(ref);
}

export async function addItem(ref: Ref, planId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const format = String(formData.get("format") ?? "reels");
  const scheduled = String(formData.get("scheduled_on") ?? "");
  const eventId = String(formData.get("calendar_event_id") ?? "") || null;
  const brain = brainPatch(formData);
  if (!title || !(format in ITEM_FORMAT) || (scheduled && !DATE.test(scheduled)) || !brain) redirect(back(ref, "dados"));

  const ctx = await getTenantContext(ref.slug);
  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_items").insert({
    tenant_id: ctx.tenant.id,
    plan_id: planId,
    title,
    format,
    scheduled_on: scheduled || null,
    calendar_event_id: eventId,
    ...brain,
    origin: ctx.isManager ? "hub" : "manual",
    created_by: ctx.userId,
  }).select("id").single();
  if (error) redirect(back(ref, errorCode(error.message)));
  done(ref, data.id);
}

export async function updateItem(ref: Ref, itemId: string, formData: FormData) {
  const status = String(formData.get("status"));
  const scheduled = String(formData.get("scheduled_on") ?? "");
  const brain = brainPatch(formData);
  const url = opt(formData, "published_url");
  if (!(status in ITEM_STATUS) || (scheduled && !DATE.test(scheduled)) || !brain || (url && !HTTPS.test(url))) redirect(back(ref, "dados", itemId));

  const supabase = await createClient();
  const { error } = await supabase.from("plan_items").update({
    status,
    title: String(formData.get("title") ?? "").trim() || undefined,
    scheduled_on: scheduled || null,
    script: opt(formData, "script"),
    caption: opt(formData, "caption"),
    ...(formData.has("published_url") ? { published_url: url } : {}),
    ...brain,
  }).eq("id", itemId);
  if (error) redirect(back(ref, errorCode(error.message), itemId));
  done(ref, itemId);
}

// Próximo passo da pauta no modo criar. A aprovação continua valendo no banco
// (guard_item_approval): lojista leva até "aprovacao"; Hub/Marca aprovam.
const NEXT: Record<string, string[]> = {
  ideia: ["roteiro"],
  roteiro: ["aprovacao", "ideia"],
  aprovacao: ["aprovado", "roteiro"],
  aprovado: ["publicado", "roteiro"],
  publicado: ["aprovado"],
};

export async function advanceItem(ref: Ref, itemId: string, from: string, formData: FormData) {
  const to = String(formData.get("to") ?? "");
  const url = opt(formData, "published_url");
  if (!NEXT[from]?.includes(to) || (to === "publicado" && !(url && HTTPS.test(url)))) redirect(back(ref, to === "publicado" ? "link" : "dados", itemId));

  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_items")
    .update({ status: to, ...(to === "publicado" ? { published_url: url } : {}) })
    .eq("id", itemId).eq("status", from).select("id");
  if (error) redirect(back(ref, errorCode(error.message), itemId));
  if (!data?.length) redirect(back(ref, "mudou", itemId));
  done(ref, itemId);
}

export async function setTier(ref: Ref, formData: FormData) {
  const tier = opt(formData, "tier");
  if (tier && !(tier in SERVICE_TIER)) redirect(back(ref, "dados"));
  const ctx = await getTenantContext(ref.slug);
  if (!ctx.isManager) redirect(back(ref, "permissao"));
  const supabase = await createClient();
  const { error } = await supabase.from("operations").update({ tier }).eq("id", ref.operationId).eq("tenant_id", ctx.tenant.id);
  if (error) redirect(back(ref, "salvar"));
  done(ref);
}

export async function deleteItem(ref: Ref, itemId: string) {
  const supabase = await createClient();
  await supabase.from("plan_items").delete().eq("id", itemId);
  done(ref);
}

export async function addLocalEvent(ref: Ref, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const starts = String(formData.get("starts_on") ?? "");
  const ends = String(formData.get("ends_on") || starts);
  if (!title || !DATE.test(starts) || !DATE.test(ends) || ends < starts) redirect(back(ref, "dados"));

  const ctx = await getTenantContext(ref.slug);
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_events").insert({
    tenant_id: ctx.tenant.id,
    scope: "local",
    kind: "data_local",
    operation_id: ref.operationId,
    title,
    starts_on: starts,
    ends_on: ends,
    created_by: ctx.userId,
  });
  if (error) redirect(back(ref, "salvar"));
  done(ref);
}
