import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/month";
import { formatBRL } from "@/lib/format";
import { BRIEF_STATUS, briefMoney, type Brief, type Proposal } from "@/lib/partners";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, card, input, textarea } from "@/components/ui";
import { deliver, sendProposal } from "../actions";

const ERRORS: Record<string, string> = {
  dados: "Informe um valor válido.", salvar: "Não foi possível enviar.", link: "O link da entrega precisa começar com https://.",
  perfil: "Seu perfil precisa estar verificado.",
};

export default async function ParceiroBriefPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const [{ data: row }, { data: partner }] = await Promise.all([
    supabase.from("briefs").select("*").eq("id", id).maybeSingle(),
    supabase.from("partners").select("id").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  if (!row || !partner) notFound();
  const brief = row as Brief;
  const { data: prop } = await supabase.from("brief_proposals").select("*").eq("brief_id", id).eq("partner_id", partner.id).maybeSingle();
  const proposal = prop as Proposal | null;
  const mine = brief.partner_id === partner.id;
  const m = briefMoney(brief);

  return (
    <div className="space-y-6">
      <Link href="/parceiro" className={`${btnGhost} -ml-2`}><ArrowLeft className="size-4" aria-hidden /> Bancada</Link>
      <header>
        <h1 className="font-display text-page">{brief.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-3 text-body text-ink-muted">
          <StatusBadge {...BRIEF_STATUS[brief.status]} />
          {brief.due_on && <span>Prazo {formatDay(brief.due_on)}</span>}
          {brief.budget && <span>Orçamento {formatBRL(Number(brief.budget))}</span>}
        </p>
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <section className={`${card} space-y-3 p-4 text-body`}>
            {[["Objetivo", brief.objective], ["Entregáveis", brief.deliverables], ["Referências", brief.references_text], ["Evitar", brief.avoid], ["Critérios de aprovação", brief.acceptance]]
              .filter(([, v]) => v).map(([k, v]) => <div key={k}><p className="label text-ink-muted">{k}</p><p className="whitespace-pre-line">{v}</p></div>)}
          </section>
          {brief.brand_snapshot && (
            <details className={card}>
              <summary className="cursor-pointer px-4 py-3 font-semibold">Guia da marca</summary>
              <p className="whitespace-pre-line border-t border-line p-4 text-body text-ink-muted">{brief.brand_snapshot}</p>
            </details>
          )}
        </div>

        <aside className="space-y-4">
          {mine ? (
            <section className={`${card} p-4`}>
              <h2 className="text-heading font-semibold">Entrega</h2>
              <p className="text-caption text-ink-subtle">Você recebe {formatBRL(m.partnerGets)} (valor {formatBRL(m.price)} − taxa {Number(brief.platform_fee_pct)}%).</p>
              {brief.delivery_url && <p className="mt-2 text-body">Enviado: <a href={brief.delivery_url} target="_blank" rel="noreferrer" className="font-semibold text-brand">abrir</a></p>}
              {(brief.status === "atribuido" || brief.status === "em_revisao") && (
                <form action={deliver.bind(null, id)} className="mt-3 space-y-2">
                  <Field label="Link da entrega (Drive, Dropbox…)"><input name="delivery_url" required defaultValue={brief.delivery_url ?? ""} className={input} placeholder="https://" /></Field>
                  <Field label="Observações"><textarea name="delivery_notes" rows={3} defaultValue={brief.delivery_notes ?? ""} className={textarea} /></Field>
                  <button className={`${btnPrimary} w-full`}><Send className="size-4" aria-hidden /> {brief.delivery_url ? "Reenviar entrega" : "Enviar entrega"}</button>
                </form>
              )}
            </section>
          ) : brief.status === "aberto" ? (
            <section className={`${card} p-4`}>
              <h2 className="text-heading font-semibold">{proposal ? "Sua proposta" : "Enviar proposta"}</h2>
              <form action={sendProposal.bind(null, id)} className="mt-3 space-y-2">
                <Field label="Valor (R$)"><input name="price" inputMode="decimal" required defaultValue={proposal?.price ?? brief.budget ?? ""} className={input} /></Field>
                <Field label="Como você faria"><textarea name="message" rows={4} defaultValue={proposal?.message ?? ""} className={textarea} /></Field>
                <p className="text-caption text-ink-subtle">A taxa da plataforma é de {Number(brief.platform_fee_pct)}% sobre o valor.</p>
                <button className={`${btnPrimary} w-full`}>{proposal ? "Atualizar proposta" : "Enviar proposta"}</button>
              </form>
            </section>
          ) : (
            <p className={`${card} p-4 text-body text-ink-muted`}>Este brief não está mais recebendo propostas.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
