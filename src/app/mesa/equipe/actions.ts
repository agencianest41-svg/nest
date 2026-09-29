"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDeskContext } from "@/lib/staff";

// Custo/hora e capacidade: só o admin NEST altera (a RLS também exige).
export async function saveStaff(userId: string, formData: FormData) {
  const ctx = await getDeskContext();
  if (!ctx.isAdmin) redirect("/mesa/equipe?erro=permissao");
  const cost = Number(String(formData.get("hourly_cost") ?? "0").replace(",", "."));
  const cap = Number(String(formData.get("weekly_capacity_hours") ?? "40").replace(",", "."));
  if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(cap) || cap < 0 || cap > 80) redirect("/mesa/equipe?erro=dados");
  const supabase = await createClient();
  const { error } = await supabase.from("staff_profiles").upsert({
    user_id: userId, hourly_cost: cost, weekly_capacity_hours: cap,
    role_title: String(formData.get("role_title") ?? "").trim() || null,
  });
  if (error) redirect("/mesa/equipe?erro=salvar");
  revalidatePath("/mesa", "layout");
  redirect("/mesa/equipe");
}
