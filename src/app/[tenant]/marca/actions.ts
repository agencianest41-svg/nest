"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { FUNNEL_STAGE, ITEM_FORMAT } from "@/lib/labels";

// Brand OS: só Hub/Marca editam (RLS). Cada ação volta para a aba de origem.

const HEX = /^#[0-9a-fA-F]{6}$/;
const FONT = /^[\w\s",'.()-]+$/;
const THEME_KEYS = [
  "brand", "brand_hover", "brand_soft", "on_brand", "accent", "accent_ink",
  "brand_dark", "brand_hover_dark", "brand_soft_dark", "on_brand_dark", "accent_ink_dark",
] as const;

const url = (slug: string, aba: string, erro?: string) => `/${slug}/marca?aba=${aba}${erro ? `&erro=${erro}` : ""}`;
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

async function guard(slug: string, aba: string) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) redirect(url(slug, aba, "permissao"));
  return { ctx, supabase: await createClient() };
}

function finish(slug: string, aba: string, error: { message: string } | null) {
  if (error) {
    console.error("[marca]", aba, error.message);
    redirect(url(slug, aba, "salvar"));
  }
  revalidatePath(`/${slug}`, "layout");
  redirect(url(slug, aba));
}

export async function saveTheme(slug: string, formData: FormData) {
  const { ctx, supabase } = await guard(slug, "identidade");
  const patch: Record<string, string | null> = {};
  for (const k of THEME_KEYS) {
    const v = String(formData.get(k) ?? "");
    if (!HEX.test(v)) redirect(url(slug, "identidade", "cor"));
    patch[k] = v;
  }
  const font = String(formData.get("font_display") ?? "").trim();
  if (font && (!FONT.test(font) || /url\s*\(/i.test(font))) redirect(url(slug, "identidade", "dados"));
  const logos = ["logo_url", "logo_dark_url"].map((k) => text(formData, k));
  if (logos.some((l) => l && !/^https:\/\//.test(l))) redirect(url(slug, "identidade", "logo"));
  const { error } = await supabase.from("tenant_themes").upsert({
    tenant_id: ctx.tenant.id, ...patch, logo_url: logos[0], logo_dark_url: logos[1],
    ...(font ? { font_display: font } : {}),
  });
  finish(slug, "identidade", error);
}

export async function saveVoice(slug: string, formData: FormData) {
  const { ctx, supabase } = await guard(slug, "voz");
  const essence = text(formData, "essence");
  const tone = text(formData, "tone");
  if (!essence || !tone) redirect(url(slug, "voz", "dados"));
  const { error } = await supabase.from("brand_voices").upsert({
    tenant_id: ctx.tenant.id, essence, tone,
    tagline: text(formData, "tagline"), brand_values: text(formData, "brand_values"),
    content_pillars: text(formData, "content_pillars"), vocabulary: text(formData, "vocabulary"),
    avoid: text(formData, "avoid"), audience: text(formData, "audience"), updated_at: new Date().toISOString(),
  });
  finish(slug, "voz", error);
}

export async function addPersona(slug: string, formData: FormData) {
  const { ctx, supabase } = await guard(slug, "personas");
  const name = text(formData, "name");
  if (!name) redirect(url(slug, "personas", "dados"));
  const { count } = await supabase.from("brand_personas").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenant.id);
  const { error } = await supabase.from("brand_personas").insert({
    tenant_id: ctx.tenant.id, name, description: text(formData, "description"), goals: text(formData, "goals"),
    pains: text(formData, "pains"), channels: text(formData, "channels"), position: (count ?? 0) + 1,
  });
  finish(slug, "personas", error);
}

export async function addProduct(slug: string, formData: FormData) {
  const { ctx, supabase } = await guard(slug, "produtos");
  const name = text(formData, "name");
  if (!name) redirect(url(slug, "produtos", "dados"));
  const { error } = await supabase.from("brand_products").insert({
    tenant_id: ctx.tenant.id, name, category: text(formData, "category"),
    description: text(formData, "description"), highlights: text(formData, "highlights"),
  });
  finish(slug, "produtos", error);
}

export async function toggleProduct(slug: string, id: string, active: boolean) {
  const { supabase } = await guard(slug, "produtos");
  const { error } = await supabase.from("brand_products").update({ active }).eq("id", id);
  finish(slug, "produtos", error);
}

export async function addRule(slug: string, formData: FormData) {
  const { ctx, supabase } = await guard(slug, "regras");
  const kind = String(formData.get("kind") ?? "");
  const severity = formData.get("severity") === "bloqueia" ? "bloqueia" : "alerta";
  const term = text(formData, "term");
  const guidance = text(formData, "guidance");
  const needsTerm = kind === "termo_proibido" || kind === "termo_obrigatorio";
  if (!["termo_proibido", "termo_obrigatorio", "regulatorio", "estilo"].includes(kind) || !guidance || (needsTerm && !term)) {
    redirect(url(slug, "regras", "dados"));
  }
  const { error } = await supabase.from("brand_rules").insert({
    tenant_id: ctx.tenant.id, kind, term: needsTerm ? term : null, guidance, severity,
  });
  finish(slug, "regras", error);
}

export async function addExample(slug: string, formData: FormData) {
  const { ctx, supabase } = await guard(slug, "exemplos");
  const verdict = formData.get("verdict") === "reprovado" ? "reprovado" : "aprovado";
  const content = text(formData, "content");
  const format = String(formData.get("format") ?? "");
  if (!content || (format && !(format in ITEM_FORMAT))) redirect(url(slug, "exemplos", "dados"));
  const { error } = await supabase.from("brand_examples").insert({
    tenant_id: ctx.tenant.id, verdict, content, reason: text(formData, "reason"), format: format || null,
  });
  finish(slug, "exemplos", error);
}

export async function addEditoria(slug: string, formData: FormData) {
  const { ctx, supabase } = await guard(slug, "editorias");
  const name = text(formData, "name");
  const funnel = String(formData.get("funnel") ?? "");
  const shareRaw = String(formData.get("share") ?? "").trim();
  const share = shareRaw ? Number(shareRaw) : null;
  if (!name || (funnel && !(funnel in FUNNEL_STAGE)) || (share !== null && !(Number.isInteger(share) && share >= 0 && share <= 100))) {
    redirect(url(slug, "editorias", "dados"));
  }
  const { count } = await supabase.from("editorias").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenant.id);
  const { error } = await supabase.from("editorias").insert({
    tenant_id: ctx.tenant.id, name, description: text(formData, "description"),
    funnel: funnel || null, share, position: (count ?? 0) + 1,
  });
  finish(slug, "editorias", error);
}

export async function toggleEditoria(slug: string, id: string, active: boolean) {
  const { supabase } = await guard(slug, "editorias");
  const { error } = await supabase.from("editorias").update({ active }).eq("id", id);
  finish(slug, "editorias", error);
}

const TABLES = {
  personas: "brand_personas", produtos: "brand_products", regras: "brand_rules", exemplos: "brand_examples",
  editorias: "editorias",
} as const;

export async function removeBrandRow(slug: string, aba: keyof typeof TABLES, id: string) {
  if (!Object.hasOwn(TABLES, aba)) redirect(url(slug, "identidade", "dados"));
  const { supabase } = await guard(slug, aba);
  const { error } = await supabase.from(TABLES[aba]).delete().eq("id", id);
  finish(slug, aba, error);
}
