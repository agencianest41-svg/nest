"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { resolveMonth } from "@/lib/month";
import { ITEM_FORMAT } from "@/lib/labels";
import type { BestPractice } from "@/lib/assets";

const back = (slug: string, aba = "marca", erro?: string) => `/${slug}/biblioteca?aba=${aba}${erro ? `&erro=${erro}` : ""}`;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

export async function savePractice(slug: string, id: string | null, formData: FormData) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) redirect(back(slug, "marca", "permissao"));
  const title = str(formData, "title");
  const summary = str(formData, "summary");
  const format = String(formData.get("format") ?? "");
  if (!title || !summary || (format && !(format in ITEM_FORMAT))) redirect(back(slug, "marca", "dados"));
  const row = {
    title, summary, why_it_worked: str(formData, "why_it_worked"), how_to_replicate: str(formData, "how_to_replicate"),
    format: format || null,
    tags: String(formData.get("tags") ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
    published: formData.get("published") === "on",
    share_network: formData.get("share_network") === "on",
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("best_practices").update(row).eq("id", id).eq("tenant_id", ctx.tenant.id)
    : await supabase.from("best_practices").insert({ ...row, tenant_id: ctx.tenant.id });
  if (error) redirect(back(slug, "marca", "salvar"));
  revalidatePath(`/${slug}/biblioteca`);
  redirect(back(slug));
}

export async function deletePractice(slug: string, id: string) {
  const supabase = await createClient();
  await supabase.from("best_practices").delete().eq("id", id);
  revalidatePath(`/${slug}/biblioteca`);
  redirect(back(slug));
}

// Leva um case (da marca ou da rede NEST) para o plano do mês de uma operação, como ideia.
export async function replicatePractice(slug: string, source: "marca" | "rede", id: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const operationId = String(formData.get("operation_id") ?? "");
  const month = resolveMonth(String(formData.get("mes") ?? ""));
  if (!operationId) redirect(back(slug, source, "dados"));
  const supabase = await createClient();

  let practice: Pick<BestPractice, "title" | "how_to_replicate" | "summary" | "format"> | undefined;
  if (source === "rede") {
    const { data } = await supabase.rpc("network_practices");
    practice = ((data ?? []) as BestPractice[]).find((p) => p.id === id);
  } else {
    const { data } = await supabase.from("best_practices").select("title, summary, how_to_replicate, format").eq("id", id).maybeSingle();
    practice = data ?? undefined;
  }
  if (!practice) redirect(back(slug, source, "dados"));

  let { data: plan } = await supabase.from("monthly_plans").select("id").eq("operation_id", operationId).eq("month", month.first).maybeSingle();
  if (!plan) {
    const created = await supabase.from("monthly_plans").insert({
      tenant_id: ctx.tenant.id, operation_id: operationId, month: month.first, created_by: ctx.userId,
    }).select("id").single();
    plan = created.data;
  }
  if (!plan) redirect(back(slug, source, "salvar"));
  const { error } = await supabase.from("plan_items").insert({
    tenant_id: ctx.tenant.id, plan_id: plan.id, title: practice.title, format: practice.format ?? "reels",
    script: [practice.summary, practice.how_to_replicate && `Como replicar:\n${practice.how_to_replicate}`].filter(Boolean).join("\n\n"),
    status: "ideia", created_by: ctx.userId,
  });
  if (error) redirect(back(slug, source, "salvar"));
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/operacoes/${operationId}?mes=${month.key}`);
}
