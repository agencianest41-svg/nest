"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { resolveMonth } from "@/lib/month";
import { formatInt, formatPct } from "@/lib/format";
import { ITEM_FORMAT } from "@/lib/labels";
import { brandContext, loadBrand } from "@/lib/brand";
import { runAi } from "@/lib/ai";
import { CHANNEL, engagementOf, METRIC_FIELDS, parseCsv, toNumber, totals, type ResultEntry } from "@/lib/results";
import { createAdminClient } from "@/lib/supabase/admin";
import { unseal } from "@/lib/integrations/crypto";
import { revokeAccess, writeOperationLinks, type MetaConfig, type MetaSecret } from "@/lib/integrations/meta";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

// Volta só para dentro do próprio tenant (argumentos de .bind vêm do cliente).
function safeBack(slug: string, back: string) {
  return back.startsWith(`/${slug}/`) && !back.startsWith("//") ? back : `/${slug}/resultados`;
}
function withError(url: string, erro: string) {
  const [path, hash] = url.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}erro=${erro}${hash ? `#${hash}` : ""}`;
}

export async function addResult(slug: string, operationId: string, planItemId: string | null, back: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  back = safeBack(slug, back);
  const channel = String(formData.get("channel") ?? "instagram");
  const measured = String(formData.get("measured_on") ?? "");
  const url = String(formData.get("published_url") ?? "").trim();
  if (!(channel in CHANNEL) || !DATE.test(measured) || (url && !/^https:\/\//.test(url))) redirect(withError(back, "resultado"));
  const metrics = Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, Math.round(toNumber(String(formData.get(f.key) ?? "")))]));
  const supabase = await createClient();
  const { error } = await supabase.from("result_entries").insert({
    tenant_id: ctx.tenant.id, operation_id: operationId, plan_item_id: planItemId, channel, measured_on: measured,
    published_url: url || null, revenue: toNumber(String(formData.get("revenue") ?? "")),
    notes: String(formData.get("notes") ?? "").trim() || null, ...metrics,
  });
  if (error) {
    console.error("[resultados] insert:", error.code, error.message);
    redirect(withError(back, "resultado"));
  }
  revalidatePath(`/${slug}`, "layout");
  redirect(back);
}

export async function deleteResult(slug: string, id: string, back: string) {
  const supabase = await createClient();
  await supabase.from("result_entries").delete().eq("id", id);
  revalidatePath(`/${slug}`, "layout");
  redirect(safeBack(slug, back));
}

export async function saveSales(slug: string, month: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const operationId = String(formData.get("operation_id") ?? "");
  const back = `/${slug}/resultados?mes=${month}`;
  if (!MONTH.test(month) || !operationId) redirect(withError(back, "dados"));
  const supabase = await createClient();
  const { error } = await supabase.from("operation_sales").upsert({
    tenant_id: ctx.tenant.id, operation_id: operationId, month: `${month}-01`,
    revenue: toNumber(String(formData.get("revenue") ?? "")), orders: Math.round(toNumber(String(formData.get("orders") ?? ""))),
    source: "manual",
  }, { onConflict: "operation_id,month" });
  if (error) redirect(withError(back, "salvar"));
  revalidatePath(`/${slug}`, "layout");
  redirect(back);
}

export type ImportState = { status: "idle" } | { status: "error"; message: string } | { status: "ok"; message: string; skipped: string[] };

// Importa planilha exportada (CSV). Com coluna "mes": vendas mensais; senão, resultados por peça.
export async function importCsv(slug: string, _prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await getTenantContext(slug);
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { status: "error", message: "Escolha um arquivo .csv." };
  if (file.size > 2 * 1024 * 1024) return { status: "error", message: "Arquivo acima de 2 MB." };
  const rows = parseCsv(await file.text());
  if (!rows.length) return { status: "error", message: "Planilha vazia ou sem cabeçalho." };

  const supabase = await createClient();
  const { data: ops } = await supabase.from("operations").select("id, name, instagram").eq("tenant_id", ctx.tenant.id);
  const key = (s: string) => s.toLowerCase().replace(/^@/, "").trim();
  const opBy = new Map<string, string>();
  for (const o of ops ?? []) {
    opBy.set(key(o.name), o.id);
    if (o.instagram) opBy.set(key(o.instagram), o.id);
  }
  const skipped: string[] = [];
  const findOp = (r: Record<string, string>, i: number) => {
    const id = opBy.get(key(r.operacao ?? r.loja ?? r.instagram ?? ""));
    if (!id) skipped.push(`linha ${i + 2}: operação "${r.operacao ?? r.loja ?? ""}" não encontrada`);
    return id;
  };

  if ("mes" in rows[0]) {
    const payload = rows.flatMap((r, i) => {
      const op = findOp(r, i);
      const m = (r.mes ?? "").slice(0, 7);
      if (!op) return [];
      if (!MONTH.test(m)) { skipped.push(`linha ${i + 2}: mês inválido`); return []; }
      return [{ tenant_id: ctx.tenant.id, operation_id: op, month: `${m}-01`, revenue: toNumber(r.receita), orders: Math.round(toNumber(r.pedidos)), source: "importacao" }];
    });
    if (!payload.length) return { status: "error", message: `Nada importado. ${skipped.slice(0, 3).join("; ")}` };
    const { error } = await supabase.from("operation_sales").upsert(payload, { onConflict: "operation_id,month" });
    if (error) return { status: "error", message: "Não foi possível importar (verifique se você tem acesso a essas operações)." };
    revalidatePath(`/${slug}`, "layout");
    return { status: "ok", message: `${payload.length} meses de vendas importados.`, skipped };
  }

  const payload = rows.flatMap((r, i) => {
    const op = findOp(r, i);
    const date = (r.data ?? "").split("/").reverse().join("-");
    const iso = DATE.test(r.data ?? "") ? r.data : DATE.test(date) ? date : null;
    if (!op) return [];
    if (!iso) { skipped.push(`linha ${i + 2}: data inválida (use AAAA-MM-DD ou DD/MM/AAAA)`); return []; }
    const channel = (r.canal ?? "instagram").toLowerCase();
    return [{
      tenant_id: ctx.tenant.id, operation_id: op, measured_on: iso, channel: channel in CHANNEL ? channel : "outro",
      published_url: /^https:\/\//.test(r.link ?? "") ? r.link : null,
      reach: Math.round(toNumber(r.alcance)), impressions: Math.round(toNumber(r.impressoes)), likes: Math.round(toNumber(r.curtidas)),
      comments: Math.round(toNumber(r.comentarios)), shares: Math.round(toNumber(r.compartilhamentos)), saves: Math.round(toNumber(r.salvamentos)),
      clicks: Math.round(toNumber(r.cliques)), leads: Math.round(toNumber(r.leads)), visits: Math.round(toNumber(r.visitas)),
      sales_count: Math.round(toNumber(r.vendas)), revenue: toNumber(r.receita), notes: r.titulo || r.observacao || null, source: "importacao",
    }];
  });
  if (!payload.length) return { status: "error", message: `Nada importado. ${skipped.slice(0, 3).join("; ")}` };
  const { error } = await supabase.from("result_entries").insert(payload);
  if (error) return { status: "error", message: "Não foi possível importar (verifique se você tem acesso a essas operações)." };
  revalidatePath(`/${slug}`, "layout");
  return { status: "ok", message: `${payload.length} resultados importados.`, skipped };
}

// Promove uma peça com bom resultado a case da Biblioteca (rascunho para curadoria).
export async function promoteToPractice(slug: string, planItemId: string, back: string) {
  const ctx = await getTenantContext(slug);
  back = safeBack(slug, back);
  if (!ctx.isManager) redirect(withError(back, "permissao"));
  const supabase = await createClient();
  const [{ data: item }, { data: results }] = await Promise.all([
    supabase.from("plan_items").select("id, title, format, script, caption, monthly_plans(operation_id, operations(name, city, region_id))").eq("id", planItemId).maybeSingle(),
    supabase.from("result_entries").select("*").eq("plan_item_id", planItemId),
  ]);
  if (!item) redirect(withError(back, "dados"));
  const rows = (results ?? []) as ResultEntry[];
  const t = totals(rows);
  const plan = item.monthly_plans as unknown as { operation_id: string; operations: { name: string; city: string | null; region_id: string } | null } | null;
  const metrics = { reach: t.reach, engagement_rate: Number(t.engagement.toFixed(4)), leads: t.leads, sales_count: t.sales, revenue: t.revenue, saves: rows.reduce((s, r) => s + r.saves, 0) };
  const numbers = `Alcance ${formatInt(t.reach)}, engajamento ${formatPct(t.engagement)}, ${formatInt(t.leads)} leads, ${formatInt(t.sales)} vendas.`;

  let draft = {
    summary: `${ITEM_FORMAT[item.format as keyof typeof ITEM_FORMAT]} “${item.title}” de ${plan?.operations?.name ?? "uma operação"}.`,
    why_it_worked: numbers,
    how_to_replicate: item.script ?? "",
    tags: [item.format as string],
  };
  const brand = await loadBrand(supabase, ctx.tenant.id);
  const ai = await runAi({
    supabase, tenantId: ctx.tenant.id, userId: ctx.userId, feature: "biblioteca.case",
    system: `Você faz a curadoria de melhores práticas da rede ${ctx.tenant.name}. Português do Brasil.\n${brandContext(ctx.tenant.name, brand)}`,
    prompt: [
      `Peça: ${item.title} (${item.format}).`, item.script && `Roteiro:\n${item.script}`, item.caption && `Legenda:\n${item.caption}`,
      `Resultados: ${numbers}`, `Operação: ${plan?.operations?.name ?? "—"}, ${plan?.operations?.city ?? ""}.`,
    ].filter(Boolean).join("\n\n"),
    schema: z.object({ summary: z.string(), why_it_worked: z.string(), how_to_replicate: z.string(), tags: z.array(z.string()).max(5) }),
  });
  if (ai.ok) draft = ai.data;

  const { data: bp, error } = await supabase.from("best_practices").insert({
    tenant_id: ctx.tenant.id, title: item.title, summary: draft.summary, why_it_worked: draft.why_it_worked,
    how_to_replicate: draft.how_to_replicate, format: item.format, tags: draft.tags.map((x) => x.toLowerCase()).slice(0, 8),
    operation_id: plan?.operation_id ?? null, region_id: plan?.operations?.region_id ?? null,
    source_plan_item_id: item.id, metrics, published: false,
  }).select("id").single();
  if (error || !bp) redirect(withError(back, "salvar"));
  revalidatePath(`/${slug}/biblioteca`);
  redirect(`/${slug}/biblioteca?aba=marca`);
}

export async function requestIntegration(slug: string, provider: string, operationId: string | null) {
  const ctx = await getTenantContext(slug);
  const supabase = await createClient();
  const valid = ["meta", "google_business", "tiktok", "planilha", "erp"];
  if (!valid.includes(provider)) redirect(`/${slug}/resultados`);
  const base = supabase.from("integrations").select("id").eq("tenant_id", ctx.tenant.id).eq("provider", provider);
  const { data: existing } = await (operationId ? base.eq("operation_id", operationId) : base.is("operation_id", null)).maybeSingle();
  const { error } = existing
    ? await supabase.from("integrations").update({ status: "solicitado" }).eq("id", existing.id)
    : await supabase.from("integrations").insert({ tenant_id: ctx.tenant.id, provider, operation_id: operationId, status: "solicitado" });
  if (error) console.error("[integracoes]", error.code, error.message);
  revalidatePath(`/${slug}/resultados`);
  redirect(`/${slug}/resultados?aba=integracoes`);
}

export type InsightState = { status: "idle" } | { status: "error"; message: string } | {
  status: "ok"; patterns: { finding: string; evidence: string }[]; adjustments: string[];
};

export async function monthInsights(slug: string, monthKey: string): Promise<InsightState> {
  const ctx = await getTenantContext(slug);
  const month = resolveMonth(monthKey);
  const supabase = await createClient();
  const { data } = await supabase.from("result_entries")
    .select("*, plan_items(title, format, scheduled_on), operations(name, city)")
    .eq("tenant_id", ctx.tenant.id).gte("measured_on", month.first).lte("measured_on", month.last).limit(300);
  const rows = (data ?? []) as (ResultEntry & { plan_items: { title: string; format: string } | null; operations: { name: string; city: string | null } | null })[];
  if (rows.length < 3) return { status: "error", message: "Poucos resultados no mês para uma leitura (mínimo 3)." };
  const lines = rows.map((r) =>
    `- ${r.measured_on} · ${r.operations?.name} · ${r.plan_items?.title ?? "sem peça"} (${r.plan_items?.format ?? r.channel}) · alcance ${r.reach} · engajamento ${(engagementOf(r) * 100).toFixed(1)}% · leads ${r.leads} · vendas ${r.sales_count}`);
  const res = await runAi({
    supabase, tenantId: ctx.tenant.id, userId: ctx.userId, feature: "resultado.insights",
    system: `Você é analista de marketing da rede ${ctx.tenant.name}. Português do Brasil, direto.`,
    prompt: `Resultados de ${month.label}:\n${lines.join("\n")}`,
    schema: z.object({
      patterns: z.array(z.object({ finding: z.string(), evidence: z.string() })).max(5),
      adjustments: z.array(z.string()).max(3),
    }),
  });
  return res.ok ? { status: "ok", ...res.data } : { status: "error", message: res.message };
}

const integrationsTab = (slug: string, extra = "") => `/${slug}/resultados?aba=integracoes${extra}`;

// Liga cada conta do Instagram a uma loja (ou à conta oficial da marca).
export async function saveMetaAccounts(slug: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) redirect(integrationsTab(slug, "&erro=meta_permissao"));
  const supabase = await createClient();
  const [{ data: row }, { data: ops }] = await Promise.all([
    supabase.from("integrations").select("id, config").eq("tenant_id", ctx.tenant.id).eq("provider", "meta").is("operation_id", null).maybeSingle(),
    supabase.from("operations").select("id").eq("tenant_id", ctx.tenant.id),
  ]);
  const config = (row?.config ?? {}) as MetaConfig;
  if (!row || !config.accounts?.length) redirect(integrationsTab(slug, "&erro=dados"));

  const valid = new Set((ops ?? []).map((o) => o.id));
  const mapping = new Map<string, string>();
  const used = new Set<string>();
  let official: string | null = null;
  for (const a of config.accounts) {
    const choice = String(formData.get(`conta_${a.ig_id}`) ?? "");
    if (choice === "marca") official ??= a.ig_id;
    else if (valid.has(choice)) {
      if (used.has(choice)) redirect(integrationsTab(slug, "&erro=meta_repetida"));
      mapping.set(a.ig_id, choice);
      used.add(choice);
    }
  }

  const { error } = await supabase.from("integrations").update({ config: { ...config, official_ig_id: official } }).eq("id", row.id);
  const linkError = error ?? await writeOperationLinks(supabase, ctx.tenant.id, config.accounts, mapping);
  if (linkError) {
    console.error("[meta] salvar contas:", linkError.message);
    redirect(integrationsTab(slug, "&erro=salvar"));
  }
  revalidatePath(`/${slug}`, "layout");
  redirect(integrationsTab(slug, "&ok=meta_contas"));
}

// Desconecta: tira a permissão na Meta, apaga o token e as ligações das lojas.
export async function disconnectMeta(slug: string) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) redirect(integrationsTab(slug, "&erro=meta_permissao"));
  const supabase = await createClient();
  const { data: row } = await supabase.from("integrations").select("id, config")
    .eq("tenant_id", ctx.tenant.id).eq("provider", "meta").is("operation_id", null).maybeSingle();
  if (!row) redirect(integrationsTab(slug));
  const config = (row.config ?? {}) as MetaConfig;

  const admin = createAdminClient();
  if (admin) {
    const { data: sealed } = await admin.rpc("integration_secret_get", { p_integration: row.id });
    if (sealed && config.meta_user) {
      try {
        await revokeAccess(config.meta_user.id, unseal<MetaSecret>(sealed as string).user_token);
      } catch (e) {
        console.error("[meta] revogar:", e instanceof Error ? e.message : e);
      }
    }
    await admin.rpc("integration_secret_delete", { p_integration: row.id });
  }

  // Só o modo teste sobrevive: o resto da config era da conexão.
  const { error } = await supabase.from("integrations").update({
    status: "desconectado", account_label: null, config: config.test_mode ? { test_mode: true } : {},
  }).eq("id", row.id);
  await supabase.from("integrations").delete().eq("tenant_id", ctx.tenant.id).eq("provider", "meta").not("operation_id", "is", null);
  if (error) redirect(integrationsTab(slug, "&erro=salvar"));
  revalidatePath(`/${slug}`, "layout");
  redirect(integrationsTab(slug, "&ok=meta_desconectado"));
}
