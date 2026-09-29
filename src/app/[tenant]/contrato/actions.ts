"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { ITEM_FORMAT, SERVICE_TIER } from "@/lib/labels";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const back = (slug: string, erro?: string) => `/${slug}/contrato${erro ? `?erro=${erro}` : ""}`;

// Contrato é configurado pela equipe Hub; a RLS também exige isso.
export async function createContract(slug: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isHub) redirect(back(slug, "permissao"));
  const name = String(formData.get("name") ?? "").trim();
  const fee = Number(String(formData.get("monthly_fee") ?? "0").replace(/\./g, "").replace(",", "."));
  const starts = String(formData.get("starts_on") ?? "");
  const ends = String(formData.get("ends_on") ?? "");
  if (!name || !Number.isFinite(fee) || fee < 0 || !DATE.test(starts) || (ends && (!DATE.test(ends) || ends < starts))) {
    redirect(back(slug, "dados"));
  }
  const supabase = await createClient();
  const { error } = await supabase.from("contracts").insert({
    tenant_id: ctx.tenant.id, name, monthly_fee: fee, starts_on: starts, ends_on: ends || null,
    operation_id: String(formData.get("operation_id") ?? "") || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (error) redirect(back(slug, "salvar"));
  revalidatePath(`/${slug}`, "layout");
  redirect(back(slug));
}

export async function toggleContract(slug: string, id: string, active: boolean) {
  const supabase = await createClient();
  await supabase.from("contracts").update({ active }).eq("id", id);
  revalidatePath(`/${slug}`, "layout");
  redirect(back(slug));
}

export async function deleteContract(slug: string, id: string) {
  const supabase = await createClient();
  await supabase.from("contracts").delete().eq("id", id);
  revalidatePath(`/${slug}`, "layout");
  redirect(back(slug));
}

export async function addContractItem(slug: string, contractId: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const label = String(formData.get("label") ?? "").trim();
  const format = String(formData.get("format") ?? "");
  const quantity = Number(formData.get("quantity"));
  if (!label || (format && !(format in ITEM_FORMAT)) || !Number.isInteger(quantity) || quantity < 1) redirect(back(slug, "dados"));
  const supabase = await createClient();
  const { error } = await supabase.from("contract_items").insert({
    tenant_id: ctx.tenant.id, contract_id: contractId, label, format: format || null, quantity,
  });
  if (error) redirect(back(slug, "salvar"));
  revalidatePath(`/${slug}`, "layout");
  redirect(back(slug));
}

export async function deleteContractItem(slug: string, id: string) {
  const supabase = await createClient();
  await supabase.from("contract_items").delete().eq("id", id);
  revalidatePath(`/${slug}`, "layout");
  redirect(back(slug));
}

// Volume por pacote: quantos posts e stories o motor planeja para cada loja.
export async function saveQuotas(slug: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isHub) redirect(back(slug, "permissao"));
  const rows = Object.keys(SERVICE_TIER).map((tier) => ({
    tenant_id: ctx.tenant.id,
    tier,
    posts: Number(formData.get(`${tier}_posts`)),
    stories: Number(formData.get(`${tier}_stories`)),
  }));
  if (rows.some((r) => ![r.posts, r.stories].every((n) => Number.isInteger(n) && n >= 0 && n <= 200))) redirect(back(slug, "dados"));
  const supabase = await createClient();
  const { error } = await supabase.from("tier_quotas").upsert(rows);
  if (error) redirect(back(slug, "salvar"));
  revalidatePath(`/${slug}`, "layout");
  redirect(back(slug));
}
