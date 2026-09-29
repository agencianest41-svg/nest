"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createEvent(slug: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const back = `/${slug}/calendario?mes=${String(formData.get("mes") ?? "")}`;
  if (!ctx.isManager) redirect(`${back}&erro=permissao`);

  const scope = formData.get("scope") === "regional" ? "regional" : "nacional";
  const title = String(formData.get("title") ?? "").trim();
  const starts = String(formData.get("starts_on") ?? "");
  const ends = String(formData.get("ends_on") || starts);
  const regionId = scope === "regional" ? String(formData.get("region_id") ?? "") : null;
  if (!title || !DATE.test(starts) || !DATE.test(ends) || ends < starts || (scope === "regional" && !regionId)) {
    redirect(`${back}&erro=dados`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_events").insert({
    tenant_id: ctx.tenant.id,
    scope,
    kind: String(formData.get("kind") ?? "campanha"),
    region_id: regionId,
    title,
    notes: String(formData.get("notes") ?? "").trim() || null,
    starts_on: starts,
    ends_on: ends,
    created_by: ctx.userId,
  });
  if (error) redirect(`${back}&erro=salvar`);
  revalidatePath(`/${slug}`, "layout");
  redirect(back);
}

export async function deleteEvent(slug: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const supabase = await createClient();
  await supabase.from("calendar_events").delete()
    .eq("id", String(formData.get("id"))).eq("tenant_id", ctx.tenant.id);
  revalidatePath(`/${slug}`, "layout");
}
