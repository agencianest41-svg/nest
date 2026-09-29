import type { Tone } from "@/lib/labels";

export type BriefStatus = "rascunho" | "aberto" | "atribuido" | "em_revisao" | "aprovado" | "pago" | "cancelado";

export type Brief = {
  id: string; tenant_id: string; project_id: string | null; task_id: string | null; title: string;
  objective: string | null; deliverables: string | null; references_text: string | null; avoid: string | null;
  acceptance: string | null; brand_snapshot: string | null; budget: number | null; agreed_price: number | null;
  platform_fee_pct: number; due_on: string | null; visibility: "convidados" | "bancada"; status: BriefStatus;
  partner_id: string | null; delivery_url: string | null; delivery_notes: string | null; delivered_at: string | null;
  created_at: string;
};

export type Partner = {
  id: string; user_id?: string | null; name: string; email?: string; headline: string | null; bio: string | null; skills: string[];
  city: string | null; state: string | null; portfolio_url: string | null; hourly_rate: number | null;
  status?: "candidato" | "verificado" | "suspenso"; rating?: number | null; reviews?: number; jobs?: number;
};

export type Proposal = { id: string; brief_id: string; partner_id: string; price: number; message: string | null; status: "enviada" | "aceita" | "recusada"; created_at: string };

export const BRIEF_STATUS: Record<BriefStatus, { label: string; tone: Tone }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  aberto: { label: "Recebendo propostas", tone: "info" },
  atribuido: { label: "Em produção", tone: "warning" },
  em_revisao: { label: "Entregue · em revisão", tone: "warning" },
  aprovado: { label: "Aprovado", tone: "success" },
  pago: { label: "Pago", tone: "brand" },
  cancelado: { label: "Cancelado", tone: "danger" },
};

// Comissão da plataforma sobre o valor acordado: o que o cliente paga e o que o parceiro recebe.
export function briefMoney(b: Pick<Brief, "agreed_price" | "budget" | "platform_fee_pct">) {
  const price = Number(b.agreed_price ?? b.budget ?? 0);
  const fee = (price * Number(b.platform_fee_pct)) / 100;
  return { price, fee, partnerGets: price - fee };
}
