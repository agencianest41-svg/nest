"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) redirect("/definir-senha?erro=curta");
  if (password !== confirm) redirect("/definir-senha?erro=diferente");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[senha] updateUser:", error.status, error.code, error.message);
    redirect("/definir-senha?erro=salvar");
  }
  redirect("/");
}
