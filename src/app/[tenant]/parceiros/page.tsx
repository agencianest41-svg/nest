import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, ExternalLink, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatDay } from "@/lib/month";
import { formatBRL } from "@/lib/format";
import { BRIEF_STATUS, briefMoney, type Brief, type Partner } from "@/lib/partners";
import { StatusBadge } from "@/components/status-badge";
import { card } from "@/components/ui";
import { createBrief, draftBrief } from "./actions";
import { BriefForm } from "./brief-form";
import { SubTabs } from "@/components/sub-tabs";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ aba?: string; task?: string; erro?: string }> };

const ERRORS: Record<string, string> = { dados: "Confira os campos.", salvar: "Não foi possível salvar.", permissao: "Só Hub e Marca contratam parceiros." };

export default async function ParceirosPage({ params, searchParams }: Props) {
  const [{ tenant }, { aba = "briefs", task, erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  if (!ctx.isManager) redirect(`/${tenant}/controle`);
  const supabase = await createClient();

  const [{ data: briefRows }, { data: directory }, { data: taskRow }] = await Promise.all([
    supabase.from("briefs").select("*").eq("tenant_id", ctx.tenant.id).order("created_at", { ascending: false }),
    supabase.rpc("partner_directory"),
    task ? supabase.from("tasks").select("id, title").eq("id", task).eq("tenant_id", ctx.tenant.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const briefs = (briefRows ?? []) as Brief[];
  const partners = (directory ?? []) as Partner[];
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const active = briefs.filter((b) => ["aberto", "atribuido", "em_revisao"].includes(b.status));
  const spend = briefs.filter((b) => ["aprovado", "pago"].includes(b.status)).reduce((s, b) => s + briefMoney(b).price, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <h1 className="font-display text-page">Parceiros</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-muted">
          Freelancers verificados pela NEST para absorver demanda: brief padronizado com a marca, proposta, entrega, aprovação e avaliação no mesmo lugar.
        </p>
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <dl className="mt-6 grid grid-cols-3 gap-3">
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Em andamento</dt><dd className="mt-1 text-metric font-semibold tabular">{active.length}</dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Parceiros verificados</dt><dd className="mt-1 text-metric font-semibold tabular">{partners.length}</dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Investido (aprovados)</dt><dd className="mt-1 text-metric font-semibold tabular">{formatBRL(spend)}</dd></div>
      </dl>

      <SubTabs className="mt-6" label="Seções" active={aba} tabs={[{ key: "briefs", label: "Briefs" }, { key: "bancada", label: "Bancada" }].map((t) => ({ ...t, href: `/${tenant}/parceiros?aba=${t.key}` }))} />

      {aba === "bancada" ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {partners.length === 0 && <li className={`${card} p-6 text-body text-ink-muted`}>A NEST ainda não verificou parceiros.</li>}
          {partners.map((p) => (
            <li key={p.id} className={`${card} p-4`}>
              <p className="font-semibold">{p.name}</p>
              {p.headline && <p className="text-body text-ink-muted">{p.headline}</p>}
              <p className="mt-1 flex items-center gap-1 text-caption text-ink-subtle">
                <Star className="size-3.5 text-accent-ink" aria-hidden />
                {p.rating ? `${Number(p.rating).toFixed(1)} (${p.reviews})` : "sem avaliações"} · {p.jobs} trabalhos
                {p.city && ` · ${p.city}${p.state ? `/${p.state}` : ""}`}
              </p>
              {p.skills.length > 0 && <p className="mt-2 flex flex-wrap gap-1">{p.skills.map((s) => <span key={s} className="rounded-sm bg-brand-soft px-1.5 text-caption text-brand">{s}</span>)}</p>}
              {p.bio && <p className="mt-2 line-clamp-3 text-body text-ink-muted">{p.bio}</p>}
              <p className="mt-2 flex items-center justify-between text-caption">
                {p.hourly_rate ? <span className="text-ink-muted">a partir de {formatBRL(Number(p.hourly_rate))}/h</span> : <span />}
                {p.portfolio_url && <a href={p.portfolio_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand">Portfólio <ExternalLink className="size-3" aria-hidden /></a>}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_360px]">
          <section className={card}>
            {briefs.length === 0 ? <p className="p-6 text-body text-ink-muted">Nenhum brief ainda.</p> : (
              <ul>
                {briefs.map((b) => {
                  const m = briefMoney(b);
                  return (
                    <li key={b.id} className="border-b border-line last:border-0">
                      <Link href={`/${tenant}/parceiros/${b.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-brand-soft">
                        <span className="min-w-48 flex-1">
                          <span className="block font-semibold">{b.title}</span>
                          <span className="block text-caption text-ink-subtle">
                            {b.partner_id ? partnerName.get(b.partner_id) ?? "Parceiro" : b.visibility === "bancada" ? "Bancada aberta" : "Só convidados"}
                            {b.due_on && ` · prazo ${formatDay(b.due_on)}`}{m.price ? ` · ${formatBRL(m.price)}` : ""}
                          </span>
                        </span>
                        <StatusBadge {...BRIEF_STATUS[b.status]} />
                        <ChevronRight className="size-4 text-ink-subtle" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <aside className={`${card} h-fit p-4`}>
            <h2 className="text-heading font-semibold">Novo brief</h2>
            {taskRow && <p className="text-caption text-ink-subtle">A partir da etapa “{taskRow.title}”.</p>}
            <div className="mt-4">
              <BriefForm save={createBrief.bind(null, tenant)} draft={draftBrief.bind(null, tenant)} taskId={taskRow?.id}
                defaultTitle={taskRow?.title} submitLabel="Criar rascunho" />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
