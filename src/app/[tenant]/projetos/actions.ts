"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { PROJECT_STATUS, TASK_STATUS } from "@/lib/labels";
import type { ChecklistEntry, MemberRole } from "@/lib/types";
import { parseDuration } from "@/lib/format";

// Autorização é da RLS e dos triggers (aprovação por papel); aqui só validamos
// formato e levamos o erro de volta para a tela.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROLES: MemberRole[] = ["hub", "marca", "regional", "lojista"];

// Volta para o projeto com a etapa mexida ainda aberta (?etapa=) e rolada até ela.
function projectUrl(slug: string, projectId: string, erro?: string, taskId?: string) {
  const q = new URLSearchParams();
  if (erro) q.set("erro", erro);
  if (taskId) q.set("etapa", taskId);
  const qs = q.toString();
  return `/${slug}/projetos/${projectId}${qs ? `?${qs}` : ""}${taskId ? `#etapa-${taskId}` : ""}`;
}

function done(slug: string, projectId: string, taskId?: string) {
  revalidatePath(`/${slug}`, "layout");
  redirect(projectUrl(slug, projectId, undefined, taskId));
}

export async function startProject(slug: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const playbookId = String(formData.get("playbook_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const starts = String(formData.get("starts_on") ?? "");
  const operationId = String(formData.get("operation_id") ?? "") || null;
  if (!ctx.isManager) redirect(`/${slug}/projetos?erro=permissao`);
  if (!playbookId || !name || !DATE.test(starts)) redirect(`/${slug}/projetos?erro=dados`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_project", {
    p_tenant: ctx.tenant.id, p_playbook: playbookId, p_name: name, p_starts: starts, p_operation: operationId,
  });
  if (error || !data) {
    console.error("[projetos] start_project:", error?.code, error?.message);
    redirect(`/${slug}/projetos?erro=salvar`);
  }
  done(slug, data as string);
}

export async function updateProject(slug: string, projectId: string, formData: FormData) {
  const status = String(formData.get("status"));
  const due = String(formData.get("due_on") ?? "");
  if (!(status in PROJECT_STATUS) || (due && !DATE.test(due))) redirect(projectUrl(slug, projectId, "dados"));
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({
    status,
    due_on: due || null,
    description: String(formData.get("description") ?? "").trim() || null,
    owner_id: String(formData.get("owner_id") ?? "") || null,
  }).eq("id", projectId);
  if (error) redirect(projectUrl(slug, projectId, "salvar"));
  done(slug, projectId);
}

export async function deleteProject(slug: string, projectId: string) {
  const supabase = await createClient();
  await supabase.from("projects").delete().eq("id", projectId);
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/projetos`);
}

export async function updateTask(slug: string, projectId: string, taskId: string, formData: FormData) {
  const status = String(formData.get("status"));
  const due = String(formData.get("due_on") ?? "");
  if (!(status in TASK_STATUS) || (due && !DATE.test(due))) redirect(projectUrl(slug, projectId, "dados"));

  const patch: Record<string, unknown> = { status, due_on: due || null };
  if (formData.has("assignee_id")) patch.assignee_id = String(formData.get("assignee_id") ?? "") || null;
  if (formData.has("description")) patch.description = String(formData.get("description") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update(patch).eq("id", taskId).eq("project_id", projectId);
  if (error) redirect(projectUrl(slug, projectId, error.message.includes("aprovada") ? "aprovacao" : "salvar", taskId));
  done(slug, projectId, taskId);
}

export async function approveTask(slug: string, projectId: string, taskId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ status: "concluida" }).eq("id", taskId).eq("project_id", projectId);
  if (error) redirect(projectUrl(slug, projectId, "aprovacao", taskId));
  done(slug, projectId, taskId);
}

export async function toggleChecklist(slug: string, projectId: string, taskId: string, index: number) {
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("checklist").eq("id", taskId).maybeSingle();
  const list = (data?.checklist ?? []) as ChecklistEntry[];
  if (!list[index]) redirect(projectUrl(slug, projectId, "dados"));
  list[index] = { ...list[index], done: !list[index].done };
  const { error } = await supabase.from("tasks").update({ checklist: list }).eq("id", taskId);
  if (error) redirect(projectUrl(slug, projectId, "salvar", taskId));
  done(slug, projectId, taskId);
}

export async function addChecklistEntry(slug: string, projectId: string, taskId: string, formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  if (!label) redirect(projectUrl(slug, projectId, "dados"));
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("checklist").eq("id", taskId).maybeSingle();
  const list = [...((data?.checklist ?? []) as ChecklistEntry[]), { label, done: false }];
  const { error } = await supabase.from("tasks").update({ checklist: list }).eq("id", taskId);
  if (error) redirect(projectUrl(slug, projectId, "salvar", taskId));
  done(slug, projectId, taskId);
}

export async function addTask(slug: string, projectId: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const title = String(formData.get("title") ?? "").trim();
  const due = String(formData.get("due_on") ?? "");
  const owner = String(formData.get("owner_role") ?? "hub") as MemberRole;
  const approver = String(formData.get("approver_role") ?? "") as MemberRole | "";
  if (!title || (due && !DATE.test(due)) || !ROLES.includes(owner) || (approver && !ROLES.includes(approver))) {
    redirect(projectUrl(slug, projectId, "dados"));
  }
  const supabase = await createClient();
  const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  const { error } = await supabase.from("tasks").insert({
    tenant_id: ctx.tenant.id,
    project_id: projectId,
    position: (count ?? 0) + 1,
    title,
    owner_role: owner,
    approver_role: approver || null,
    due_on: due || null,
    internal: formData.get("internal") === "on",
  });
  if (error) redirect(projectUrl(slug, projectId, "salvar"));
  done(slug, projectId);
}

export async function deleteTask(slug: string, projectId: string, taskId: string) {
  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", taskId).eq("project_id", projectId);
  done(slug, projectId);
}

// Comentário em tarefa, peça ou projeto; volta para a página de origem.
export async function addComment(
  slug: string, entity: { type: "task" | "plan_item" | "project"; id: string }, back: string, formData: FormData,
) {
  const ctx = await getTenantContext(slug);
  // Argumentos de .bind chegam do cliente: só volta para dentro do próprio tenant.
  if (!back.startsWith(`/${slug}/`) || back.startsWith("//")) back = `/${slug}`;
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 4000) redirect(back);
  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({
    tenant_id: ctx.tenant.id,
    entity_type: entity.type,
    entity_id: entity.id,
    body,
    internal: ctx.isHub && formData.get("internal") === "on",
  });
  if (error) console.error("[comentarios] insert:", error.code, error.message);
  revalidatePath(`/${slug}`, "layout");
  redirect(back);
}

export async function logTime(slug: string, projectId: string, taskId: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  const minutes = parseDuration(String(formData.get("duration") ?? ""));
  const day = String(formData.get("worked_on") ?? "");
  if (!ctx.isHub || !minutes || minutes > 24 * 60 || !DATE.test(day)) redirect(projectUrl(slug, projectId, "dados"));
  const supabase = await createClient();
  const { error } = await supabase.from("time_entries").insert({
    tenant_id: ctx.tenant.id, project_id: projectId, task_id: taskId, minutes, worked_on: day,
    note: String(formData.get("note") ?? "").trim() || null,
  });
  if (error) redirect(projectUrl(slug, projectId, "salvar", taskId));
  done(slug, projectId, taskId);
}
