import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/month";
import { formatBRL } from "@/lib/format";
import { BRIEF_STATUS, briefMoney, type Brief, type Partner, type Proposal } from "@/lib/partners";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { btnSecondary, card, input, textarea } from "@/components/ui";
import { saveProfile } from "./actions";

const ERRORS: Record<string, string> = {
  dados: "Confira os campos (portfólio com https://).", salvar: "Não foi possível salvar.",
  perfil: "Seu perfil de parceiro ainda não foi criado pela NEST.",
};

export default async function ParceiroPage({ searchParams }: { searchParams: Promise<{ erro?: string; salvo?: string }> }) {
  const { erro, salvo } = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: row } = await supabase.from("partners").select("*").eq("user_id", auth.user.id).maybeSingle();
  const partner = row as (Partner & { status: string; email: string }) | null;

  if (!partner) {
    return (
      <div className={`${card} mx-auto max-w-lg p-6`}>
        <h1 className="font-display text-page">Bancada NEST</h1>
        <p className="mt-2 text-body text-ink-muted">Seu acesso ainda não tem um perfil de parceiro. A equipe NEST cria o perfil no convite; fale com quem te convidou.</p>
      </div>
    );
  }

  const verified = partner.status === "verificado";
  const [{ data: briefRows }, { data: proposalRows }] = verified
    ? await Promise.all([
        supabase.from("briefs").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("brief_proposals").select("*").eq("partner_id", partner.id),
      ])
    : [{ data: [] }, { data: [] }];
  const briefs = (briefRows ?? []) as Brief[];
  const proposals = (proposalRows ?? []) as Proposal[];
  const proposedIds = new Set(proposals.map((p) => p.brief_id));
  const mine = briefs.filter((b) => b.partner_id === partner.id);
  const open = briefs.filter((b) => b.status === "aberto" && b.partner_id !== partner.id);
  const earned = mine.filter((b) => b.status === "pago").reduce((s, b) => s + briefMoney(b).partnerGets, 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="label text-ink-subtle">Olá, {partner.name.split(" ")[0]}</p>
        <h1 className="font-display text-page">Bancada NEST</h1>
        {!verified && (
          <p className="mt-2 rounded-sm border border-warning/20 bg-warning/5 p-3 text-body text-warning">
            Perfil {partner.status === "suspenso" ? "suspenso" : "em análise"}. Complete seu perfil abaixo; a NEST libera os briefs depois da verificação.
          </p>
        )}
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}
      {salvo && <p role="status" className="rounded-sm border border-success/20 bg-success/5 p-3 text-body text-success">Perfil salvo.</p>}

      {verified && (
        <>
          <dl className="grid grid-cols-3 gap-3">
            <div className={`${card} p-4`}><dt className="label text-ink-muted">Briefs abertos</dt><dd className="mt-1 text-metric font-semibold tabular">{open.length}</dd></div>
            <div className={`${card} p-4`}><dt className="label text-ink-muted">Seus trabalhos</dt><dd className="mt-1 text-metric font-semibold tabular">{mine.length}</dd></div>
            <div className={`${card} p-4`}><dt className="label text-ink-muted">Recebido</dt><dd className="mt-1 text-metric font-semibold tabular">{formatBRL(earned)}</dd></div>
          </dl>
          <BriefList title="Seus trabalhos" briefs={mine} empty="Nenhum trabalho atribuído ainda." />
          <BriefList title="Briefs abertos" briefs={open} empty="Nenhum brief aberto agora." proposed={proposedIds} />
        </>
      )}

      <details className={card} open={!verified}>
        <summary className="cursor-pointer px-4 py-3 text-heading font-semibold">Seu perfil</summary>
        <form action={saveProfile} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
          <Field label="Nome"><input name="name" required defaultValue={partner.name} className={input} /></Field>
          <Field label="Especialidade"><input name="headline" defaultValue={partner.headline ?? ""} className={input} placeholder="Designer de social, videomaker…" /></Field>
          <div className="sm:col-span-2"><Field label="Sobre você"><textarea name="bio" rows={3} defaultValue={partner.bio ?? ""} className={textarea} /></Field></div>
          <div className="sm:col-span-2"><Field label="Habilidades (separadas por vírgula)"><input name="skills" defaultValue={partner.skills.join(", ")} className={input} /></Field></div>
          <Field label="Cidade"><input name="city" defaultValue={partner.city ?? ""} className={input} /></Field>
          <Field label="UF"><input name="state" maxLength={2} defaultValue={partner.state ?? ""} className={input} /></Field>
          <Field label="Portfólio (https)"><input name="portfolio_url" defaultValue={partner.portfolio_url ?? ""} className={input} /></Field>
          <Field label="Valor/hora (R$)"><input name="hourly_rate" inputMode="decimal" defaultValue={partner.hourly_rate ?? ""} className={input} /></Field>
          <div className="flex justify-end sm:col-span-2"><button className={btnSecondary}>Salvar perfil</button></div>
        </form>
      </details>
    </div>
  );
}

function BriefList({ title, briefs, empty, proposed }: { title: string; briefs: Brief[]; empty: string; proposed?: Set<string> }) {
  return (
    <section className={card}>
      <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">{title}</h2>
      {briefs.length === 0 ? <p className="px-4 py-3 text-body text-ink-muted">{empty}</p> : (
        <ul>
          {briefs.map((b) => (
            <li key={b.id} className="border-b border-line last:border-0">
              <Link href={`/parceiro/${b.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-brand-soft">
                <span className="min-w-48 flex-1">
                  <span className="block font-semibold">{b.title}</span>
                  <span className="block text-caption text-ink-subtle">
                    {b.due_on ? `Prazo ${formatDay(b.due_on)}` : "Sem prazo"}{b.budget ? ` · orçamento ${formatBRL(Number(b.budget))}` : ""}
                  </span>
                </span>
                {proposed?.has(b.id) ? <StatusBadge label="Proposta enviada" tone="info" /> : <StatusBadge {...BRIEF_STATUS[b.status]} />}
                <ChevronRight className="size-4 text-ink-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
