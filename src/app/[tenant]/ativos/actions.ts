"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { ASSET_KIND, type AssetKind } from "@/lib/assets";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const list = (slug: string, erro?: string) => `/${slug}/ativos${erro ? `?erro=${erro}` : ""}`;
const detail = (slug: string, id: string, erro?: string) => `/${slug}/ativos/${id}${erro ? `?erro=${erro}` : ""}`;
const tags = (fd: FormData) =>
  String(fd.get("tags") ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

export type CreateAssetState = { status: "idle" } | { status: "error"; message: string };

// Cria o ativo depois do upload direto ao Storage (ou como link/texto).
// O caminho do arquivo precisa estar na pasta do tenant.
export async function createAsset(slug: string, _prev: CreateAssetState, formData: FormData): Promise<CreateAssetState> {
  const ctx = await getTenantContext(slug);
  const title = str(formData, "title");
  const kind = String(formData.get("kind") ?? "") as AssetKind;
  const storagePath = str(formData, "storage_path");
  const url = str(formData, "url");
  const body = str(formData, "body");
  const operationId = str(formData, "operation_id");
  const parentId = str(formData, "parent_asset_id");
  if (!title || !(kind in ASSET_KIND)) return { status: "error", message: "Dê um título e escolha o tipo." };
  if (storagePath && !storagePath.startsWith(`${ctx.tenant.id}/`)) return { status: "error", message: "Arquivo inválido." };
  if (url && !/^https:\/\//.test(url)) return { status: "error", message: "O link precisa começar com https://." };
  if (!storagePath && !url && !body) return { status: "error", message: "Envie um arquivo, um link ou o texto." };
  if (!ctx.isManager && !operationId) return { status: "error", message: "Escolha a operação." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("assets").insert({
    tenant_id: ctx.tenant.id, title, kind, storage_path: storagePath, url, body,
    description: str(formData, "description"),
    mime_type: str(formData, "mime_type"),
    size_bytes: Number(formData.get("size_bytes")) || null,
    tags: tags(formData),
    calendar_event_id: str(formData, "calendar_event_id"),
    operation_id: operationId,
    official: ctx.isManager && formData.get("official") === "on",
    parent_asset_id: parentId,
  }).select("id").single();
  if (error || !data) {
    console.error("[ativos] insert:", error?.code, error?.message);
    return { status: "error", message: "Não foi possível salvar o ativo." };
  }
  if (parentId) await supabase.from("asset_uses").insert({ asset_id: parentId, tenant_id: ctx.tenant.id, action: "derivacao", operation_id: operationId });
  revalidatePath(`/${slug}`, "layout");
  redirect(detail(slug, data.id));
}

export async function updateAsset(slug: string, id: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const title = str(formData, "title");
  if (!title) redirect(detail(slug, id, "dados"));
  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    title, description: str(formData, "description"), tags: tags(formData),
    calendar_event_id: str(formData, "calendar_event_id"),
  };
  if (formData.has("body")) patch.body = str(formData, "body");
  if (ctx.isManager) {
    patch.official = formData.get("official") === "on";
    patch.archived = formData.get("archived") === "on";
  }
  const { error } = await supabase.from("assets").update(patch).eq("id", id).eq("tenant_id", ctx.tenant.id);
  if (error) redirect(detail(slug, id, "salvar"));
  revalidatePath(`/${slug}`, "layout");
  redirect(detail(slug, id));
}

export async function deleteAsset(slug: string, id: string) {
  const ctx = await getTenantContext(slug);
  const supabase = await createClient();
  const { data: a } = await supabase.from("assets").select("storage_path").eq("id", id).eq("tenant_id", ctx.tenant.id).maybeSingle();
  const { error } = await supabase.from("assets").delete().eq("id", id).eq("tenant_id", ctx.tenant.id);
  if (error) redirect(detail(slug, id, "salvar"));
  // O arquivo só sai do Storage se nenhum outro ativo (derivado/reaproveitado) aponta para ele.
  if (a?.storage_path) {
    const { count } = await supabase.from("assets").select("id", { count: "exact", head: true }).eq("storage_path", a.storage_path);
    if (!count) await supabase.storage.from("assets").remove([a.storage_path]);
  }
  revalidatePath(`/${slug}`, "layout");
  redirect(list(slug));
}

// Download com URL assinada de 2 minutos; a policy do Storage bloqueia direito vencido.
export async function downloadAsset(slug: string, id: string) {
  const ctx = await getTenantContext(slug);
  const supabase = await createClient();
  const { data: a } = await supabase.from("assets").select("id, storage_path, url, operation_id").eq("id", id).maybeSingle();
  if (!a) redirect(list(slug, "acesso"));
  let target = a.url as string | null;
  if (a.storage_path) {
    const { data, error } = await supabase.storage.from("assets").createSignedUrl(a.storage_path, 120, { download: true });
    if (error || !data) redirect(detail(slug, id, "direito"));
    target = data.signedUrl;
  }
  if (!target) redirect(detail(slug, id, "dados"));
  await supabase.from("asset_uses").insert({ asset_id: id, tenant_id: ctx.tenant.id, action: "download", operation_id: a.operation_id });
  redirect(target);
}

export async function logCopy(slug: string, id: string) {
  const ctx = await getTenantContext(slug);
  const supabase = await createClient();
  await supabase.from("asset_uses").insert({ asset_id: id, tenant_id: ctx.tenant.id, action: "copia" });
}

// Traz um ativo compartilhado por outra marca para a marca atual, preservando a origem.
export async function reuseAsset(slug: string, sourceId: string) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) redirect(list(slug, "permissao"));
  const supabase = await createClient();
  const { data: src } = await supabase.from("assets").select("*").eq("id", sourceId).maybeSingle();
  if (!src || src.tenant_id === ctx.tenant.id) redirect(list(slug, "acesso"));
  const { data: share } = await supabase.from("asset_shares").select("allow_derivatives, license")
    .eq("asset_id", sourceId).eq("to_tenant_id", ctx.tenant.id).maybeSingle();
  if (!share) redirect(list(slug, "acesso"));
  const { data, error } = await supabase.from("assets").insert({
    tenant_id: ctx.tenant.id, title: src.title, description: [src.description, `Licença: ${share.license}`].filter(Boolean).join("\n"),
    kind: src.kind, storage_path: src.storage_path, mime_type: src.mime_type, size_bytes: src.size_bytes,
    url: src.url, body: src.body, tags: src.tags, parent_asset_id: src.id, origin_tenant_id: src.tenant_id,
  }).select("id").single();
  if (error || !data) redirect(list(slug, "salvar"));
  await supabase.from("asset_uses").insert({ asset_id: sourceId, tenant_id: ctx.tenant.id, action: "reuso" });
  revalidatePath(`/${slug}`, "layout");
  redirect(detail(slug, data.id));
}

export async function addRight(slug: string, assetId: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const holder = str(formData, "holder");
  const from = String(formData.get("valid_from") ?? "");
  const until = String(formData.get("valid_until") ?? "");
  if (!holder || (from && !DATE.test(from)) || (until && !DATE.test(until)) || (from && until && until < from)) redirect(detail(slug, assetId, "dados"));
  const supabase = await createClient();
  const { error } = await supabase.from("asset_rights").insert({
    tenant_id: ctx.tenant.id, asset_id: assetId, holder, kind: str(formData, "kind") ?? "imagem",
    valid_from: from || null, valid_until: until || null, territory: str(formData, "territory"), notes: str(formData, "notes"),
  });
  if (error) redirect(detail(slug, assetId, "salvar"));
  revalidatePath(`/${slug}`, "layout");
  redirect(detail(slug, assetId));
}

export async function deleteRight(slug: string, assetId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("asset_rights").delete().eq("id", id).eq("asset_id", assetId);
  revalidatePath(`/${slug}`, "layout");
  redirect(detail(slug, assetId));
}

export async function shareAsset(slug: string, assetId: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const to = String(formData.get("to_tenant_id") ?? "");
  const expires = String(formData.get("expires_on") ?? "");
  if (!to || (expires && !DATE.test(expires))) redirect(detail(slug, assetId, "dados"));
  const supabase = await createClient();
  const { error } = await supabase.from("asset_shares").upsert({
    asset_id: assetId, from_tenant_id: ctx.tenant.id, to_tenant_id: to,
    license: str(formData, "license") ?? "Uso interno", allow_derivatives: formData.get("allow_derivatives") === "on",
    expires_on: expires || null,
  }, { onConflict: "asset_id,to_tenant_id" });
  if (error) redirect(detail(slug, assetId, "salvar"));
  revalidatePath(`/${slug}`, "layout");
  redirect(detail(slug, assetId));
}

export async function unshareAsset(slug: string, assetId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("asset_shares").delete().eq("id", id).eq("asset_id", assetId);
  revalidatePath(`/${slug}`, "layout");
  redirect(detail(slug, assetId));
}

// Kits
export async function createKit(slug: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const title = str(formData, "title");
  if (!ctx.isManager || !title) redirect(`/${slug}/ativos?aba=kits&erro=dados`);
  const supabase = await createClient();
  const { data, error } = await supabase.from("kits").insert({
    tenant_id: ctx.tenant.id, title, description: str(formData, "description"),
    calendar_event_id: str(formData, "calendar_event_id"),
  }).select("id").single();
  if (error || !data) redirect(`/${slug}/ativos?aba=kits&erro=salvar`);
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/ativos/kits/${data.id}`);
}

export async function updateKit(slug: string, kitId: string, formData: FormData) {
  const supabase = await createClient();
  const title = str(formData, "title");
  if (!title) redirect(`/${slug}/ativos/kits/${kitId}?erro=dados`);
  const { error } = await supabase.from("kits").update({
    title, description: str(formData, "description"), calendar_event_id: str(formData, "calendar_event_id"),
    published: formData.get("published") === "on",
  }).eq("id", kitId);
  if (error) redirect(`/${slug}/ativos/kits/${kitId}?erro=salvar`);
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/ativos/kits/${kitId}`);
}

export async function deleteKit(slug: string, kitId: string) {
  const supabase = await createClient();
  await supabase.from("kits").delete().eq("id", kitId);
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/ativos?aba=kits`);
}

export async function addToKit(slug: string, kitId: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const assetId = String(formData.get("asset_id") ?? "");
  if (!assetId) redirect(`/${slug}/ativos/kits/${kitId}?erro=dados`);
  const supabase = await createClient();
  const { count } = await supabase.from("kit_assets").select("asset_id", { count: "exact", head: true }).eq("kit_id", kitId);
  const { error } = await supabase.from("kit_assets").insert({ tenant_id: ctx.tenant.id, kit_id: kitId, asset_id: assetId, position: (count ?? 0) + 1 });
  if (error && error.code !== "23505") redirect(`/${slug}/ativos/kits/${kitId}?erro=salvar`);
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/ativos/kits/${kitId}`);
}

export async function removeFromKit(slug: string, kitId: string, assetId: string) {
  const supabase = await createClient();
  await supabase.from("kit_assets").delete().eq("kit_id", kitId).eq("asset_id", assetId);
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/ativos/kits/${kitId}`);
}
