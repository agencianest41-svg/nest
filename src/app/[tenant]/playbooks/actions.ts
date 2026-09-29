"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { PLAYBOOK_CATEGORY } from "@/lib/labels";
import type { MemberRole, PlaybookStep } from "@/lib/types";

const ROLES: MemberRole[] = ["hub", "marca", "regional", "lojista"];

function url(slug: string, id?: string, erro?: string) {
  return `/${slug}/playbooks${id ? `/${id}` : ""}${erro ? `?erro=${erro}` : ""}`;
}

// Copia um playbook (modelo do produto ou do próprio cliente) para o tenant, com as etapas.
export async function customizePlaybook(slug: string, sourceId: string) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) redirect(url(slug, undefined, "permissao"));
  const supabase = await createClient();
  const [{ data: src }, { data: steps }] = await Promise.all([
    supabase.from("playbooks").select("name, category, description").eq("id", sourceId).maybeSingle(),
    supabase.from("playbook_steps").select("*").eq("playbook_id", sourceId).order("position"),
  ]);
  if (!src) redirect(url(slug, undefined, "dados"));

  const { data: created, error } = await supabase.from("playbooks").insert({
    tenant_id: ctx.tenant.id, name: `${src.name} (${ctx.tenant.name})`, category: src.category,
    description: src.description, source_playbook_id: sourceId,
  }).select("id").single();
  if (error || !created) redirect(url(slug, undefined, "salvar"));

  if (steps?.length) {
    const { error: stepErr } = await supabase.from("playbook_steps").insert(
      (steps as PlaybookStep[]).map((s) => ({
        position: s.position, title: s.title, description: s.description, owner_role: s.owner_role,
        approver_role: s.approver_role, due_offset_days: s.due_offset_days, estimate_minutes: s.estimate_minutes,
        internal: s.internal, checklist: s.checklist, playbook_id: created.id, tenant_id: ctx.tenant.id,
      })),
    );
    if (stepErr) console.error("[playbooks] copiar etapas:", stepErr.code, stepErr.message);
  }
  revalidatePath(`/${slug}/playbooks`);
  redirect(url(slug, created.id));
}

export async function createPlaybook(slug: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "outro");
  if (!ctx.isManager) redirect(url(slug, undefined, "permissao"));
  if (!name || !(category in PLAYBOOK_CATEGORY)) redirect(url(slug, undefined, "dados"));
  const supabase = await createClient();
  const { data, error } = await supabase.from("playbooks").insert({
    tenant_id: ctx.tenant.id, name, category, description: String(formData.get("description") ?? "").trim() || null,
  }).select("id").single();
  if (error || !data) redirect(url(slug, undefined, "salvar"));
  revalidatePath(`/${slug}/playbooks`);
  redirect(url(slug, data.id));
}

export async function updatePlaybook(slug: string, id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "outro");
  if (!name || !(category in PLAYBOOK_CATEGORY)) redirect(url(slug, id, "dados"));
  const supabase = await createClient();
  const { error } = await supabase.from("playbooks").update({
    name, category, description: String(formData.get("description") ?? "").trim() || null,
    active: formData.get("active") === "on",
  }).eq("id", id);
  if (error) redirect(url(slug, id, "salvar"));
  revalidatePath(`/${slug}/playbooks`);
  redirect(url(slug, id));
}

export async function deletePlaybook(slug: string, id: string) {
  const supabase = await createClient();
  await supabase.from("playbooks").delete().eq("id", id);
  revalidatePath(`/${slug}/playbooks`);
  redirect(url(slug));
}

function readStep(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const owner = String(formData.get("owner_role") ?? "hub") as MemberRole;
  const approver = String(formData.get("approver_role") ?? "") as MemberRole | "";
  const offset = Number(formData.get("due_offset_days") ?? 0);
  const estimate = Number(formData.get("estimate_minutes") ?? 60);
  const position = Number(formData.get("position") ?? 0);
  const checklist = String(formData.get("checklist") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const ok = title && ROLES.includes(owner) && (!approver || ROLES.includes(approver))
    && Number.isInteger(offset) && offset >= -365 && offset <= 730
    && Number.isInteger(estimate) && estimate >= 0 && Number.isInteger(position);
  if (!ok) return null;
  return {
    title, owner_role: owner, approver_role: approver || null, due_offset_days: offset, estimate_minutes: estimate,
    position, checklist, description: String(formData.get("description") ?? "").trim() || null,
    internal: formData.get("internal") === "on",
  };
}

export async function saveStep(slug: string, playbookId: string, stepId: string | null, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const step = readStep(formData);
  if (!step) redirect(url(slug, playbookId, "dados"));
  const supabase = await createClient();
  const { data: pb } = await supabase.from("playbooks").select("tenant_id").eq("id", playbookId).maybeSingle();
  if (!pb || (pb.tenant_id && pb.tenant_id !== ctx.tenant.id)) redirect(url(slug, playbookId, "dados"));
  const { error } = stepId
    ? await supabase.from("playbook_steps").update(step).eq("id", stepId).eq("playbook_id", playbookId)
    : await supabase.from("playbook_steps").insert({ ...step, playbook_id: playbookId, tenant_id: pb.tenant_id });
  if (error) redirect(url(slug, playbookId, "salvar"));
  revalidatePath(url(slug, playbookId));
  redirect(url(slug, playbookId));
}

export async function deleteStep(slug: string, playbookId: string, stepId: string) {
  const supabase = await createClient();
  await supabase.from("playbook_steps").delete().eq("id", stepId).eq("playbook_id", playbookId);
  revalidatePath(url(slug, playbookId));
  redirect(url(slug, playbookId));
}
