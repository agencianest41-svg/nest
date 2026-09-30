"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import {
  simulatedBoostMetrics, simulatedExternalId, simulatedPostUrl, type PieceService, type ServiceMetrics,
} from "@/lib/publishing";

// Fila da Hub: cada passo de um pedido de postagem ou impulsionamento.
// O executor segue o modo gravado no pedido (manual, teste ou meta).

const HTTPS = /^https:\/\/\S+$/;
export type Step = "agendar" | "publicar" | "iniciar" | "metricas" | "encerrar" | "cancelar";

const FROM: Record<Step, PieceService["status"][]> = {
  agendar: ["solicitado"],
  publicar: ["agendado"],
  iniciar: ["solicitado"],
  metricas: ["no_ar"],
  encerrar: ["no_ar"],
  cancelar: ["solicitado", "agendado", "no_ar"],
};

function back(slug: string, erro?: string) {
  return `/${slug}/postagem${erro ? `?erro=${erro}` : ""}`;
}

const int = (fd: FormData, k: string) => {
  const n = Number(String(fd.get(k) ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

function manualMetrics(fd: FormData): ServiceMetrics {
  return {
    reach: int(fd, "reach"),
    impressions: int(fd, "impressions"),
    clicks: int(fd, "clicks"),
    spend: Number(String(fd.get("spend") ?? "0").replace(",", ".")) || 0,
  };
}

export async function runService(slug: string, serviceId: string, step: Step, formData: FormData) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) redirect(back(slug, "permissao"));
  const supabase = await createClient();

  const { data: row } = await supabase.from("piece_services").select("*")
    .eq("id", serviceId).eq("tenant_id", ctx.tenant.id).maybeSingle();
  const svc = row as PieceService | null;
  if (!svc || !FROM[step].includes(svc.status)) redirect(back(slug, "mudou"));
  if (svc.provider === "meta" && step !== "cancelar") redirect(back(slug, "meta"));

  const test = svc.provider === "teste";
  const now = new Date();
  let patch: Partial<PieceService> & { handled_by?: string } = { handled_by: ctx.userId };

  switch (step) {
    case "agendar":
      patch = { ...patch, status: "agendado", external_id: test ? simulatedExternalId("agendar") : String(formData.get("external_id") ?? "").trim() || null };
      break;
    case "publicar": {
      const url = test ? simulatedPostUrl(svc.external_id ?? simulatedExternalId("agendar")) : String(formData.get("published_url") ?? "").trim();
      if (!HTTPS.test(url)) redirect(back(slug, "link"));
      patch = { ...patch, status: "concluido", published_url: url };
      break;
    }
    case "iniciar": {
      const ends = new Date(now.getTime() + (svc.days ?? 1) * 86_400_000);
      patch = { ...patch, status: "no_ar", started_at: now.toISOString(), ends_at: ends.toISOString(), external_id: test ? simulatedExternalId("impulsionar") : String(formData.get("external_id") ?? "").trim() || null };
      break;
    }
    case "metricas":
      patch = { ...patch, metrics: test ? simulatedBoostMetrics(svc) : manualMetrics(formData) };
      break;
    case "encerrar":
      patch = { ...patch, status: "concluido", ends_at: now.toISOString(), metrics: test ? simulatedBoostMetrics(svc, true) : manualMetrics(formData) };
      break;
    case "cancelar":
      patch = { ...patch, status: "cancelado", notes: String(formData.get("notes") ?? "").trim() || svc.notes };
      break;
  }

  const { data: updated, error } = await supabase.from("piece_services").update(patch)
    .eq("id", svc.id).eq("status", svc.status).select("id");
  if (error) redirect(back(slug, "salvar"));
  if (!updated?.length) redirect(back(slug, "mudou"));

  // Postagem concluída: a peça passa a "publicada" com o link do post.
  if (step === "publicar") {
    await supabase.from("plan_items").update({ status: "publicado", published_url: patch.published_url })
      .eq("id", svc.plan_item_id).eq("status", "aprovado");
  }
  // Impulsionamento real encerrado: os números entram em Resultados.
  // (Simulação não entra, para não misturar teste com resultado de verdade.)
  if (step === "encerrar" && !test) {
    const m = patch.metrics ?? {};
    const { data: item } = await supabase.from("plan_items").select("published_url").eq("id", svc.plan_item_id).maybeSingle();
    await supabase.from("result_entries").insert({
      tenant_id: ctx.tenant.id,
      operation_id: svc.operation_id,
      plan_item_id: svc.plan_item_id,
      channel: "instagram",
      published_url: item?.published_url ?? null,
      reach: m.reach ?? 0,
      impressions: m.impressions ?? 0,
      clicks: m.clicks ?? 0,
      notes: `Impulsionamento: ${m.spend ?? svc.budget} investidos em ${svc.days} dia(s)`,
      source: svc.provider === "meta" ? "integracao" : "manual",
    });
  }

  revalidatePath(`/${slug}`, "layout");
  redirect(back(slug));
}

// Modo teste: simula postagem e impulsionamento sem conta oficial conectada.
export async function setTestMode(slug: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isHub) redirect(back(slug, "permissao"));
  const on = formData.get("on") === "1";
  const supabase = await createClient();
  const { data: row } = await supabase.from("integrations").select("id, config")
    .eq("tenant_id", ctx.tenant.id).eq("provider", "meta").is("operation_id", null).maybeSingle();
  const config = { ...((row?.config as Record<string, unknown>) ?? {}), test_mode: on };
  const { error } = row
    ? await supabase.from("integrations").update({ config }).eq("id", row.id)
    : await supabase.from("integrations").insert({ tenant_id: ctx.tenant.id, provider: "meta", config });
  if (error) redirect(back(slug, "salvar"));
  revalidatePath(`/${slug}`, "layout");
  redirect(back(slug));
}
