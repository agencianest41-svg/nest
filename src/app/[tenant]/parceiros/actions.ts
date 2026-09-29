"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { brandContext, loadBrand } from "@/lib/brand";
import { runAi } from "@/lib/ai";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;
const money = (fd: FormData, k: string) => {
  const raw = String(fd.get(k) ?? "").replace(/\./g, "").replace(",", ".").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const detail = (slug: string, id: string, erro?: string) => `/${slug}/parceiros/${id}${erro ? `?erro=${erro}` : ""}`;

async function manager(slug: string) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) redirect(`/${slug}/parceiros?erro=permissao`);
  return { ctx, supabase: await createClient() };
}

function briefFields(fd: FormData) {
  const due = String(fd.get("due_on") ?? "");
  const budget = money(fd, "budget");
  const title = str(fd, "title");
  if (!title || (due && !DATE.test(due)) || Number.isNaN(budget)) return null;
  return {
    title, objective: str(fd, "objective"), deliverables: str(fd, "deliverables"), references_text: str(fd, "references_text"),
    avoid: str(fd, "avoid"), acceptance: str(fd, "acceptance"), budget, due_on: due || null,
    visibility: fd.get("visibility") === "convidados" ? "convidados" : "bancada",
  };
}

export async function createBrief(slug: string, formData: FormData) {
  const { ctx, supabase } = await manager(slug);
  const fields = briefFields(formData);
  if (!fields) redirect(`/${slug}/parceiros?erro=dados`);
  const taskId = str(formData, "task_id");
  let projectId: string | null = null;
  if (taskId) {
    const { data } = await supabase.from("tasks").select("project_id").eq("id", taskId).eq("tenant_id", ctx.tenant.id).maybeSingle();
    projectId = data?.project_id ?? null;
  }
  const { data, error } = await supabase.from("briefs").insert({
    ...fields, tenant_id: ctx.tenant.id, task_id: projectId ? taskId : null, project_id: projectId,
  }).select("id").single();
  if (error || !data) redirect(`/${slug}/parceiros?erro=salvar`);
  revalidatePath(`/${slug}/parceiros`);
  redirect(detail(slug, data.id));
}

export async function updateBrief(slug: string, id: string, formData: FormData) {
  const { supabase } = await manager(slug);
  const fields = briefFields(formData);
  if (!fields) redirect(detail(slug, id, "dados"));
  const { error } = await supabase.from("briefs").update(fields).eq("id", id).in("status", ["rascunho", "aberto"]);
  if (error) redirect(detail(slug, id, "salvar"));
  revalidatePath(`/${slug}/parceiros`);
  redirect(detail(slug, id));
}

// Publicar grava o retrato da marca: o parceiro não acessa o tenant.
export async function publishBrief(slug: string, id: string) {
  const { ctx, supabase } = await manager(slug);
  const brand = await loadBrand(supabase, ctx.tenant.id);
  const { error } = await supabase.from("briefs").update({
    status: "aberto", brand_snapshot: brandContext(ctx.tenant.name, brand),
  }).eq("id", id).eq("status", "rascunho");
  if (error) redirect(detail(slug, id, "salvar"));
  revalidatePath(`/${slug}/parceiros`);
  redirect(detail(slug, id));
}

export async function setBriefStatus(slug: string, id: string, status: "atribuido" | "aprovado" | "pago" | "cancelado") {
  const { supabase } = await manager(slug);
  const allowedFrom: Record<string, string[]> = {
    atribuido: ["em_revisao"], aprovado: ["em_revisao", "atribuido"], pago: ["aprovado"], cancelado: ["rascunho", "aberto", "atribuido", "em_revisao"],
  };
  if (!Object.hasOwn(allowedFrom, status)) redirect(detail(slug, id, "dados"));
  const { data, error } = await supabase.from("briefs").update({ status }).eq("id", id).in("status", allowedFrom[status]).select("id");
  if (error || !data?.length) redirect(detail(slug, id, "status"));
  revalidatePath(`/${slug}/parceiros`);
  redirect(detail(slug, id));
}

export async function invitePartner(slug: string, id: string, formData: FormData) {
  const { supabase } = await manager(slug);
  const partnerId = String(formData.get("partner_id") ?? "");
  if (!partnerId) redirect(detail(slug, id, "dados"));
  const { error } = await supabase.from("brief_invites").insert({ brief_id: id, partner_id: partnerId });
  if (error && error.code !== "23505") redirect(detail(slug, id, "salvar"));
  revalidatePath(detail(slug, id));
  redirect(detail(slug, id));
}

// Aceitar uma proposta atribui o brief e recusa as demais.
export async function acceptProposal(slug: string, briefId: string, proposalId: string) {
  const { supabase } = await manager(slug);
  const { data: p } = await supabase.from("brief_proposals").select("partner_id, price").eq("id", proposalId).eq("brief_id", briefId).maybeSingle();
  if (!p) redirect(detail(slug, briefId, "dados"));
  const { data: updated, error } = await supabase.from("briefs")
    .update({ partner_id: p.partner_id, agreed_price: p.price, status: "atribuido" })
    .eq("id", briefId).eq("status", "aberto").select("id");
  if (error || !updated?.length) redirect(detail(slug, briefId, "status"));
  await supabase.from("brief_proposals").update({ status: "aceita" }).eq("id", proposalId);
  await supabase.from("brief_proposals").update({ status: "recusada" }).eq("brief_id", briefId).neq("id", proposalId);
  revalidatePath(`/${slug}/parceiros`);
  redirect(detail(slug, briefId));
}

export async function reviewPartner(slug: string, briefId: string, formData: FormData) {
  const { ctx, supabase } = await manager(slug);
  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) redirect(detail(slug, briefId, "dados"));
  const { data: b } = await supabase.from("briefs").select("partner_id").eq("id", briefId).maybeSingle();
  if (!b?.partner_id) redirect(detail(slug, briefId, "dados"));
  const { error } = await supabase.from("partner_reviews").upsert({
    brief_id: briefId, partner_id: b.partner_id, tenant_id: ctx.tenant.id, rating, comment: str(formData, "comment"),
  }, { onConflict: "brief_id" });
  if (error) redirect(detail(slug, briefId, "salvar"));
  revalidatePath(detail(slug, briefId));
  redirect(detail(slug, briefId));
}

export async function deleteBrief(slug: string, id: string) {
  const { supabase } = await manager(slug);
  await supabase.from("briefs").delete().eq("id", id).in("status", ["rascunho", "cancelado"]);
  revalidatePath(`/${slug}/parceiros`);
  redirect(`/${slug}/parceiros`);
}

export type BriefDraftState = { status: "idle" } | { status: "error"; message: string } | {
  status: "ok"; objective: string; deliverables: string; references_text: string; avoid: string; acceptance: string;
};

// IA escreve o brief a partir do título, da etapa do projeto e do Brand OS.
export async function draftBrief(slug: string, _prev: BriefDraftState, formData: FormData): Promise<BriefDraftState> {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) return { status: "error", message: "Só Hub e Marca criam briefs." };
  const title = str(formData, "title");
  if (!title) return { status: "error", message: "Escreva o título do trabalho primeiro." };
  const supabase = await createClient();
  const taskId = str(formData, "task_id");
  const { data: task } = taskId
    ? await supabase.from("tasks").select("title, description, projects(name)").eq("id", taskId).maybeSingle()
    : { data: null };
  const brand = await loadBrand(supabase, ctx.tenant.id);
  const res = await runAi({
    supabase, tenantId: ctx.tenant.id, userId: ctx.userId, feature: "brief.gerar",
    system: `Você prepara briefs para freelancers que vão trabalhar para a marca ${ctx.tenant.name}. Português do Brasil.\n${brandContext(ctx.tenant.name, brand)}`,
    prompt: [
      `Trabalho: ${title}`,
      str(formData, "objective") && `Contexto dado: ${str(formData, "objective")}`,
      task && `Etapa do projeto: ${task.title}${task.description ? ` — ${task.description}` : ""}`,
    ].filter(Boolean).join("\n"),
    schema: z.object({ objective: z.string(), deliverables: z.string(), references_text: z.string(), avoid: z.string(), acceptance: z.string() }),
  });
  return res.ok ? { status: "ok", ...res.data } : { status: "error", message: res.message };
}
