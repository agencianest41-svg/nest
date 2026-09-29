"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getDeskContext } from "@/lib/staff";

export type PartnerInviteState = { status: "idle" } | { status: "error"; message: string } | { status: "ok"; email: string; link: string };

// Curadoria é da NEST: admin convida o parceiro (link de acesso) e cria o perfil.
export async function invitePartnerAccount(_prev: PartnerInviteState, formData: FormData): Promise<PartnerInviteState> {
  const ctx = await getDeskContext();
  if (!ctx.isAdmin) return { status: "error", message: "Só o admin NEST convida parceiros." };
  const admin = createAdminClient();
  if (!admin) return { status: "error", message: "Convites desativados: falta a SUPABASE_SECRET_KEY no servidor." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) return { status: "error", message: "Informe nome e e-mail válidos." };

  let type: "invite" | "magiclink" = "invite";
  let res = await admin.auth.admin.generateLink({ type: "invite", email });
  if (res.error?.code === "email_exists" || res.error?.status === 422) {
    type = "magiclink";
    res = await admin.auth.admin.generateLink({ type: "magiclink", email });
  }
  if (res.error || !res.data.user) return { status: "error", message: "Não foi possível gerar o convite." };

  const supabase = await createClient();
  const { error } = await supabase.from("partners").upsert({
    user_id: res.data.user.id, email, name,
    headline: String(formData.get("headline") ?? "").trim() || null,
    skills: String(formData.get("skills") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    status: formData.get("verified") === "on" ? "verificado" : "candidato",
  }, { onConflict: "user_id" });
  if (error) return { status: "error", message: "Não foi possível criar o perfil do parceiro." };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  revalidatePath("/mesa/parceiros");
  return { status: "ok", email, link: `${origin}/auth/confirm?token_hash=${res.data.properties.hashed_token}&type=${type}` };
}

export async function setPartnerStatus(id: string, status: "candidato" | "verificado" | "suspenso") {
  const ctx = await getDeskContext();
  if (!ctx.isAdmin || !["candidato", "verificado", "suspenso"].includes(status)) redirect("/mesa/parceiros");
  const supabase = await createClient();
  await supabase.from("partners").update({ status }).eq("id", id);
  revalidatePath("/mesa/parceiros");
  redirect("/mesa/parceiros");
}
