import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, Send, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatDateTime, formatDay } from "@/lib/month";
import { formatBRL } from "@/lib/format";
import { BRIEF_STATUS, briefMoney, type Brief, type Partner, type Proposal } from "@/lib/partners";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import { acceptProposal, deleteBrief, draftBrief, invitePartner, publishBrief, reviewPartner, setBriefStatus, updateBrief } from "../actions";
import { BriefForm } from "../brief-form";

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ erro?: string }> };

const ERRORS: Record<string, string> = {
  dados: "Confira os campos.", salvar: "Não foi possível salvar.", status: "Esta ação não vale para o status atual do brief.",
};

export default async function BriefPage({ params, searchParams }: Props) {
  const [{ tenant, id }, { erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const supabase = await createClient();
  const { data: row } = await supabase.from("briefs").select("*").eq("tenant_id", ctx.tenant.id).eq("id", id).maybeSingle();
  if (!row || !ctx.isManager) notFound();
  const brief = row as Brief;

  const [{ data: proposals }, { data: directory }, { data: invites }, { data: review }, { data: task }] = await Promise.all([
    supabase.from("brief_proposals").select("*").eq("brief_id", id).order("created_at"),
    supabase.rpc("partner_directory"),
    supabase.from("brief_invites").select("partner_id").eq("brief_id", id),
    supabase.from("partner_reviews").select("rating, comment").eq("brief_id", id).maybeSingle(),
    brief.task_id ? supabase.from("tasks").select("title, project_id").eq("id", brief.task_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const partners = (directory ?? []) as Partner[];
  const pName = new Map(partners.map((p) => [p.id, p]));
  const invited = new Set((invites ?? []).map((i) => i.partner_id));
  const m = briefMoney(brief);
  const editable = brief.status === "rascunho" || brief.status === "aberto";

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/${tenant}/parceiros`} className={`${btnGhost} -ml-2`}><ArrowLeft className="size-4" aria-hidden /> Parceiros</Link>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-subtle">
            Brief{task && <> · etapa <Link href={`/${tenant}/projetos/${task.project_id}`} className="text-brand">{task.title}</Link></>}
          </p>
          <h1 className="font-display text-page">{brief.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-body text-ink-muted">
            <StatusBadge {...BRIEF_STATUS[brief.status]} />
            {brief.due_on && <span>Prazo {formatDay(brief.due_on)}</span>}
            {brief.partner_id && <span>Parceiro: <b className="text-ink">{pName.get(brief.partner_id)?.name ?? "—"}</b></span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {brief.status === "rascunho" && <form action={publishBrief.bind(null, tenant, id)}><button className={btnPrimary}><Send className="size-4" aria-hidden /> Publicar para a bancada</button></form>}
          {brief.status === "em_revisao" && (
            <>
              <form action={setBriefStatus.bind(null, tenant, id, "atribuido")}><button className={btnSecondary}>Pedir ajustes</button></form>
              <form action={setBriefStatus.bind(null, tenant, id, "aprovado")}><button className={btnPrimary}><CheckCircle2 className="size-4" aria-hidden /> Aprovar entrega</button></form>
            </>
          )}
          {brief.status === "aprovado" && <form action={setBriefStatus.bind(null, tenant, id, "pago")}><button className={btnPrimary}>Marcar como pago</button></form>}
        </div>
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {brief.delivery_url && (
            <section className={`${card} border-success/40 p-4`}>
              <h2 className="text-heading font-semibold">Entrega</h2>
              <a href={brief.delivery_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-brand">
                Abrir entrega <ExternalLink className="size-3.5" aria-hidden />
              </a>
              {brief.delivery_notes && <p className="mt-1 whitespace-pre-line text-body text-ink-muted">{brief.delivery_notes}</p>}
              {brief.delivered_at && <p className="mt-1 text-caption text-ink-subtle">Entregue em {formatDateTime(brief.delivered_at)}</p>}
            </section>
          )}

          {editable ? (
            <section className={`${card} p-4`}>
              <BriefForm save={updateBrief.bind(null, tenant, id)} draft={draftBrief.bind(null, tenant)} brief={brief} taskId={brief.task_id ?? undefined} submitLabel="Salvar brief" />
            </section>
          ) : (
            <section className={`${card} space-y-3 p-4 text-body`}>
              {[["Objetivo", brief.objective], ["Entregáveis", brief.deliverables], ["Referências", brief.references_text], ["Evitar", brief.avoid], ["Critérios de aprovação", brief.acceptance]]
                .filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><p className="label text-ink-muted">{k}</p><p className="whitespace-pre-line">{v}</p></div>
                ))}
            </section>
          )}

          {brief.status !== "rascunho" && (
            <section className={card}>
              <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Propostas <span className="font-normal text-ink-subtle tabular">{(proposals ?? []).length}</span></h2>
              {(proposals ?? []).length === 0 ? <p className="px-4 py-3 text-body text-ink-muted">Nenhuma proposta ainda.</p> : (
                <ul>
                  {((proposals ?? []) as Proposal[]).map((p) => {
                    const partner = pName.get(p.partner_id);
                    return (
                      <li key={p.id} className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{partner?.name ?? "Parceiro"} · <span className="tabular">{formatBRL(Number(p.price))}</span></p>
                          <p className="flex items-center gap-1 text-caption text-ink-subtle">
                            <Star className="size-3 text-accent-ink" aria-hidden />{partner?.rating ? Number(partner.rating).toFixed(1) : "novo"} · {partner?.jobs ?? 0} trabalhos
                          </p>
                          {p.message && <p className="mt-1 whitespace-pre-line text-body text-ink-muted">{p.message}</p>}
                        </div>
                        {p.status === "enviada" && brief.status === "aberto"
                          ? <form action={acceptProposal.bind(null, tenant, id, p.id)}><button className={btnSecondary}>Aceitar</button></form>
                          : <StatusBadge {...(p.status === "aceita" ? { label: "Aceita", tone: "success" as const } : p.status === "recusada" ? { label: "Recusada", tone: "neutral" as const } : { label: "Enviada", tone: "info" as const })} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className={`${card} p-4`}>
            <h2 className="text-heading font-semibold">Valores</h2>
            <dl className="mt-2 space-y-1 text-body">
              <div className="flex justify-between"><dt className="text-ink-muted">{brief.agreed_price ? "Valor acordado" : "Orçamento"}</dt><dd className="tabular">{formatBRL(m.price)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Taxa da plataforma ({Number(brief.platform_fee_pct)}%)</dt><dd className="tabular">{formatBRL(m.fee)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Parceiro recebe</dt><dd className="tabular">{formatBRL(m.partnerGets)}</dd></div>
            </dl>
            <p className="mt-2 text-caption text-ink-subtle">Pagamento pela plataforma entra quando o meio de pagamento for ligado; até lá, marque como pago ao quitar.</p>
          </section>

          {brief.status === "aberto" && (
            <section className={`${card} p-4`}>
              <h2 className="text-heading font-semibold">Convidar parceiro</h2>
              <form action={invitePartner.bind(null, tenant, id)} className="mt-3 space-y-2">
                <Field label="Parceiro">
                  <select name="partner_id" required className={input} defaultValue="">
                    <option value="" disabled>Escolha</option>
                    {partners.filter((p) => !invited.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.skills.length ? ` · ${p.skills.slice(0, 2).join(", ")}` : ""}</option>)}
                  </select>
                </Field>
                <button className={`${btnSecondary} w-full`}>Convidar</button>
              </form>
              {invited.size > 0 && <p className="mt-2 text-caption text-ink-subtle">Convidados: {[...invited].map((p) => pName.get(p)?.name).filter(Boolean).join(", ")}</p>}
            </section>
          )}

          {(brief.status === "aprovado" || brief.status === "pago") && brief.partner_id && (
            <section className={`${card} p-4`}>
              <h2 className="text-heading font-semibold">Avaliar parceiro</h2>
              <form action={reviewPartner.bind(null, tenant, id)} className="mt-3 space-y-2">
                <Field label="Nota">
                  <select name="rating" defaultValue={review?.rating ?? 5} className={input}>
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
                  </select>
                </Field>
                <Field label="Comentário"><textarea name="comment" rows={2} defaultValue={review?.comment ?? ""} className={textarea} /></Field>
                <button className={`${btnSecondary} w-full`}>{review ? "Atualizar avaliação" : "Avaliar"}</button>
              </form>
            </section>
          )}

          {!["pago", "aprovado", "cancelado"].includes(brief.status) && (
            <form action={setBriefStatus.bind(null, tenant, id, "cancelado")}><button className={`${btnGhost} w-full text-danger`}>Cancelar brief</button></form>
          )}
          {(brief.status === "rascunho" || brief.status === "cancelado") && (
            <form action={deleteBrief.bind(null, tenant, id)}><button className={`${btnGhost} w-full text-danger`}>Excluir</button></form>
          )}
        </aside>
      </div>
    </div>
  );
}
