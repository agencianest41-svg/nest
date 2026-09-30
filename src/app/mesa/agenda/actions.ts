"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDeskContext } from "@/lib/staff";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const back = (erro?: string) => `/mesa/agenda${erro ? `?erro=${erro}` : ""}`;

async function staff() {
  const ctx = await getDeskContext();
  if (!ctx.isStaff) redirect("/mesa");
  return ctx;
}

export async function saveSettings(formData: FormData) {
  const ctx = await staff();
  const url = String(formData.get("meeting_url") ?? "").trim();
  const slot = Number(formData.get("slot_minutes"));
  const notice = Number(formData.get("notice_hours"));
  if ((url && !/^https:\/\//.test(url)) || !(slot >= 15 && slot <= 180) || !(notice >= 0 && notice <= 168)) redirect(back("config"));
  const supabase = await createClient();
  const { error } = await supabase.from("consultant_settings").upsert({
    user_id: ctx.userId, meeting_url: url || null, slot_minutes: Math.round(slot), notice_hours: Math.round(notice),
  });
  if (error) redirect(back("salvar"));
  revalidatePath("/mesa/agenda");
  redirect(back());
}

export async function addAvailability(formData: FormData) {
  const ctx = await staff();
  const weekdays = formData.getAll("weekday").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const starts = String(formData.get("starts") ?? "");
  const ends = String(formData.get("ends") ?? "");
  if (!weekdays.length || !TIME.test(starts) || !TIME.test(ends) || ends <= starts) redirect(back("janela"));
  const supabase = await createClient();
  const { error } = await supabase.from("consultant_availability").insert(
    weekdays.map((weekday) => ({ consultant_id: ctx.userId, weekday, starts, ends })),
  );
  if (error) redirect(back("salvar"));
  revalidatePath("/mesa/agenda");
  redirect(back());
}

export async function removeAvailability(id: string) {
  await staff();
  const supabase = await createClient();
  await supabase.from("consultant_availability").delete().eq("id", id);
  revalidatePath("/mesa/agenda");
  redirect(back());
}

export async function addBlock(formData: FormData) {
  const ctx = await staff();
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  // Datas inteiras no fuso de Brasília; "até" inclui o dia todo.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) redirect(back("bloqueio"));
  const end = new Date(`${to}T00:00:00-03:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  const supabase = await createClient();
  const { error } = await supabase.from("consultant_blocks").insert({
    consultant_id: ctx.userId, starts_at: `${from}T00:00:00-03:00`, ends_at: end.toISOString(),
    reason: String(formData.get("reason") ?? "").trim().slice(0, 200) || null,
  });
  if (error) redirect(back("salvar"));
  revalidatePath("/mesa/agenda");
  redirect(back());
}

export async function removeBlock(id: string) {
  await staff();
  const supabase = await createClient();
  await supabase.from("consultant_blocks").delete().eq("id", id);
  revalidatePath("/mesa/agenda");
  redirect(back());
}

const STATUSES = ["agendada", "realizada", "faltou"] as const;

export async function saveMeeting(id: string, formData: FormData) {
  await staff();
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) redirect(`/mesa/agenda/${id}?erro=status`);
  const supabase = await createClient();
  const { error } = await supabase.from("alignment_meetings").update({
    status,
    notes: String(formData.get("notes") ?? "").trim().slice(0, 10000) || null,
    next_steps: String(formData.get("next_steps") ?? "").trim().slice(0, 4000) || null,
  }).eq("id", id);
  if (error) redirect(`/mesa/agenda/${id}?erro=salvar`);
  revalidatePath("/mesa/agenda", "layout");
  redirect(`/mesa/agenda/${id}?ok=1`);
}

export async function cancelFromDesk(id: string) {
  await staff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_meeting", { p_id: id });
  if (error) redirect(`/mesa/agenda/${id}?erro=cancelar`);
  revalidatePath("/mesa/agenda", "layout");
  redirect("/mesa/agenda");
}
