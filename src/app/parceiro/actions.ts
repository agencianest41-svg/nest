"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

async function me() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: partner } = await supabase.from("partners").select("id, status").eq("user_id", auth.user.id).maybeSingle();
  return { supabase, partner };
}

export async function saveProfile(formData: FormData) {
  const { supabase, partner } = await me();
  if (!partner) redirect("/parceiro?erro=perfil");
  const portfolio = str(formData, "portfolio_url");
  const rate = str(formData, "hourly_rate");
  const rateN = rate ? Number(rate.replace(",", ".")) : null;
  if ((portfolio && !/^https:\/\//.test(portfolio)) || (rateN !== null && (!Number.isFinite(rateN) || rateN < 0)) || !str(formData, "name")) {
    redirect("/parceiro?erro=dados");
  }
  const { error } = await supabase.from("partners").update({
    name: str(formData, "name"), headline: str(formData, "headline"), bio: str(formData, "bio"),
    skills: String(formData.get("skills") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 12),
    city: str(formData, "city"), state: str(formData, "state"), portfolio_url: portfolio, hourly_rate: rateN,
  }).eq("id", partner.id);
  if (error) redirect("/parceiro?erro=salvar");
  revalidatePath("/parceiro");
  redirect("/parceiro?salvo=1");
}

export async function sendProposal(briefId: string, formData: FormData) {
  const { supabase, partner } = await me();
  const price = Number(String(formData.get("price") ?? "").replace(/\./g, "").replace(",", "."));
  if (!partner || partner.status !== "verificado") redirect(`/parceiro/${briefId}?erro=perfil`);
  if (!Number.isFinite(price) || price <= 0) redirect(`/parceiro/${briefId}?erro=dados`);
  const { error } = await supabase.from("brief_proposals").upsert({
    brief_id: briefId, partner_id: partner.id, price, message: str(formData, "message"), status: "enviada",
  }, { onConflict: "brief_id,partner_id" });
  if (error) redirect(`/parceiro/${briefId}?erro=salvar`);
  revalidatePath("/parceiro");
  redirect(`/parceiro/${briefId}`);
}

export async function deliver(briefId: string, formData: FormData) {
  const { supabase } = await me();
  const url = str(formData, "delivery_url");
  if (!url || !/^https:\/\//.test(url)) redirect(`/parceiro/${briefId}?erro=link`);
  const { error } = await supabase.rpc("deliver_brief", { p_brief: briefId, p_url: url, p_notes: str(formData, "delivery_notes") });
  if (error) redirect(`/parceiro/${briefId}?erro=salvar`);
  revalidatePath("/parceiro");
  redirect(`/parceiro/${briefId}`);
}
