"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { currentCycle } from "@/lib/alignment";
import { toNumber } from "@/lib/results";

const UUID = /^[0-9a-f-]{36}$/;

function page(slug: string, operationId: string, erro?: string) {
  return `/${slug}/alinhamento?loja=${operationId}${erro ? `&erro=${erro}` : ""}`;
}

const optInt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? Math.max(0, Math.round(toNumber(s))) : null;
};
const optText = (v: FormDataEntryValue | null) => String(v ?? "").trim().slice(0, 2000) || null;

export async function saveCheckin(slug: string, operationId: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  if (!UUID.test(operationId)) redirect(`/${slug}/alinhamento`);
  const revenue = String(formData.get("revenue") ?? "").trim();
  const orders = String(formData.get("orders") ?? "").trim();
  if (!revenue || !orders) redirect(page(slug, operationId, "checkin"));
  const score = String(formData.get("nest_score") ?? "");
  const goal = String(formData.get("revenue_goal") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.from("monthly_checkins").upsert({
    tenant_id: ctx.tenant.id, operation_id: operationId, month: currentCycle().cycle.first,
    revenue: Math.max(0, toNumber(revenue)), orders: optInt(orders) ?? 0,
    followers: optInt(formData.get("followers")), leads: optInt(formData.get("leads")),
    whatsapp_chats: optInt(formData.get("whatsapp_chats")),
    revenue_goal: goal ? Math.max(0, toNumber(goal)) : null,
    what_worked: optText(formData.get("what_worked")), biggest_challenge: optText(formData.get("biggest_challenge")),
    nest_score: /^(10|[0-9])$/.test(score) ? Number(score) : null,
    submitted_by: ctx.userId,
  }, { onConflict: "operation_id,month" });
  if (error) {
    console.error("[alinhamento] checkin:", error.code, error.message);
    redirect(page(slug, operationId, "salvar"));
  }
  revalidatePath(`/${slug}`, "layout");
  redirect(page(slug, operationId));
}

const BOOK_ERRORS = ["sem_checkin", "sem_consultor", "ja_agendada", "horario_indisponivel"];

export async function bookMeeting(slug: string, operationId: string, formData: FormData) {
  await getTenantContext(slug);
  const startsAt = String(formData.get("starts_at") ?? "");
  if (!UUID.test(operationId) || Number.isNaN(Date.parse(startsAt))) redirect(page(slug, operationId, "horario"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("book_meeting", { p_operation: operationId, p_starts_at: startsAt });
  if (error) {
    const code = BOOK_ERRORS.find((c) => error.message.includes(c));
    if (!code) console.error("[alinhamento] book:", error.code, error.message);
    redirect(page(slug, operationId, code ?? "salvar"));
  }
  revalidatePath(`/${slug}`, "layout");
  revalidatePath("/mesa/agenda");
  redirect(page(slug, operationId));
}

export async function cancelMeeting(slug: string, operationId: string, meetingId: string) {
  await getTenantContext(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_meeting", { p_id: meetingId });
  if (error) redirect(page(slug, operationId, "cancelar"));
  revalidatePath(`/${slug}`, "layout");
  revalidatePath("/mesa/agenda");
  redirect(page(slug, operationId));
}

export async function setConsultant(slug: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) redirect(`/${slug}/alinhamento`);
  const operationId = String(formData.get("operation_id") ?? "");
  const consultant = String(formData.get("consultant_id") ?? "");
  if (!UUID.test(operationId) || (consultant && !UUID.test(consultant))) redirect(`/${slug}/alinhamento?erro=consultor`);
  const supabase = await createClient();
  const { error } = await supabase.from("operations").update({ consultant_id: consultant || null })
    .eq("id", operationId).eq("tenant_id", ctx.tenant.id);
  if (error) redirect(`/${slug}/alinhamento?erro=consultor`);
  revalidatePath(`/${slug}/alinhamento`);
  redirect(`/${slug}/alinhamento`);
}
