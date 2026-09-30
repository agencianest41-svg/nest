import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, FlaskConical, Megaphone, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import {
  ACTIVE, MODE_LABEL, OBJECTIVE, PLACEMENT, SERVICE_KIND, SERVICE_STATUS, brl, formatDateTime,
  type PieceService, type PublishingMode,
} from "@/lib/publishing";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, btnSecondary, card, input } from "@/components/ui";
import { runService, setTestMode, type Step } from "./actions";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ erro?: string }> };
type Row = PieceService & { operations: { name: string } | null; plan_items: { monthly_plans: { month: string } | null } | null };

const ERRORS: Record<string, string> = {
  permissao: "Só Hub e Marca executam pedidos.",
  mudou: "O pedido mudou enquanto você olhava. Confira e tente de novo.",
  link: "Cole o link do post publicado (começando com https://).",
  meta: "A conexão com a Meta ainda não está ativa. Use o modo manual ou o modo teste.",
  salvar: "Não foi possível salvar. Tente de novo.",
};

export const metadata = { title: "Postagem e impulso · NEST" };

export default async function PostagemPage({ params, searchParams }: Props) {
  const [{ tenant }, { erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  if (!ctx.isManager) redirect(`/${tenant}`);
  const supabase = await createClient();

  const [{ data: rows }, { data: mode }] = await Promise.all([
    supabase.from("piece_services").select("*, operations(name), plan_items(monthly_plans(month))")
      .eq("tenant_id", ctx.tenant.id).order("created_at", { ascending: false }).limit(200),
    supabase.rpc("publishing_mode", { p_tenant: ctx.tenant.id }),
  ]);
  const list = (rows ?? []) as unknown as Row[];
  const current = (mode ?? "manual") as PublishingMode;
  const pending = list.filter((r) => r.status === "solicitado").reverse();
  const running = list.filter((r) => r.status === "agendado" || r.status === "no_ar");
  const history = list.filter((r) => !ACTIVE.includes(r.status)).slice(0, 20);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-page">Postagem e impulso</h1>
          <p className="mt-1 max-w-2xl text-body text-ink-muted">
            Pedidos das lojas para a NEST postar uma peça aprovada ou impulsionar uma peça publicada.
          </p>
        </div>
      </header>

      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <section className={`${card} mt-6 flex flex-wrap items-center gap-3 p-4 ${current === "teste" ? "border-info/30 bg-info/5" : ""}`}>
        <FlaskConical className={`size-5 shrink-0 ${current === "teste" ? "text-info" : "text-ink-subtle"}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold">{MODE_LABEL[current]}</p>
          <p className="text-caption text-ink-muted">
            {current === "teste"
              ? "Nada vai para o Instagram. Postagens ganham um link fictício e o impulso gera números simulados (não entram em Resultados)."
              : current === "meta"
                ? "Pedidos são executados pela API da Meta."
                : "Sem conta oficial conectada: a Hub agenda e impulsiona no Meta Business Suite e registra aqui."}
          </p>
        </div>
        {ctx.isHub && current !== "meta" && (
          <form action={setTestMode.bind(null, tenant)}>
            <input type="hidden" name="on" value={current === "teste" ? "0" : "1"} />
            <button className={btnSecondary}>{current === "teste" ? "Desligar modo teste" : "Ligar modo teste"}</button>
          </form>
        )}
      </section>

      <Group title="Novos pedidos" empty="Nenhum pedido esperando." rows={pending} slug={tenant} />
      <Group title="Em andamento" empty="Nada agendado ou no ar." rows={running} slug={tenant} />
      <Group title="Histórico" empty="Nenhum pedido concluído ainda." rows={history} slug={tenant} muted />
    </div>
  );
}

function Group({ title, empty, rows, slug, muted }: { title: string; empty: string; rows: Row[]; slug: string; muted?: boolean }) {
  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-heading font-semibold">
        {title} <span className="text-body font-normal text-ink-subtle tabular">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-body text-ink-muted">{empty}</p>
      ) : (
        <ul className={`${card} mt-3`}>
          {rows.map((r) => <ServiceRow key={r.id} r={r} slug={slug} muted={muted} />)}
        </ul>
      )}
    </section>
  );
}

function ServiceRow({ r, slug, muted }: { r: Row; slug: string; muted?: boolean }) {
  const Icon = r.kind === "agendar" ? Send : Megaphone;
  const month = r.plan_items?.monthly_plans?.month?.slice(0, 7);
  const pieceHref = `/${slug}/operacoes/${r.operation_id}?${month ? `mes=${month}&` : ""}peca=${r.plan_item_id}`;
  const act = (step: Step) => runService.bind(null, slug, r.id, step);
  const test = r.provider === "teste";
  const m = r.metrics ?? {};

  return (
    <li className={`border-b border-line p-4 last:border-0 ${muted ? "text-ink-muted" : ""}`}>
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-caption text-ink-subtle">{SERVICE_KIND[r.kind]} · {r.operations?.name}</p>
          <Link href={pieceHref} className="inline-flex items-center gap-1 font-semibold text-ink hover:underline">
            {r.title ?? "Peça"} <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
          <p className="mt-1 text-body text-ink-muted">
            {r.kind === "agendar"
              ? <>{r.placement && PLACEMENT[r.placement]} · {r.scheduled_at && formatDateTime(r.scheduled_at)}</>
              : <>{r.budget != null && brl(Number(r.budget))} em {r.days} dia(s) · {r.objective && OBJECTIVE[r.objective]}{r.audience && ` · ${r.audience}`}</>}
          </p>
          {r.notes && <p className="mt-1 text-caption text-ink-subtle">“{r.notes}”</p>}
          {r.published_url && <a href={r.published_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-caption text-info hover:underline">{r.published_url}</a>}
          {m.reach !== undefined && (
            <p className="mt-1 text-caption text-ink-muted tabular">
              Alcance {m.reach?.toLocaleString("pt-BR")} · Impressões {m.impressions?.toLocaleString("pt-BR")} · Cliques {m.clicks?.toLocaleString("pt-BR")} · Investido {brl(m.spend ?? 0)}
              {m.simulated && " · simulado"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {test && <StatusBadge label="Teste" tone="neutral" />}
          <StatusBadge {...SERVICE_STATUS[r.status]} />
        </div>
      </div>

      {ACTIVE.includes(r.status) && (
        <div className="mt-3 flex flex-wrap items-end gap-2 pl-7">
          {r.status === "solicitado" && r.kind === "agendar" && (
            <form action={act("agendar")} className="flex flex-wrap items-end gap-2">
              {!test && <input name="external_id" placeholder="Código no Business Suite (opcional)" aria-label="Código do agendamento" className={`${input} h-9 w-64`} />}
              <button className={btnPrimary}>{test ? "Agendar (teste)" : "Marcar como agendado"}</button>
            </form>
          )}
          {r.status === "agendado" && (
            <form action={act("publicar")} className="flex flex-wrap items-end gap-2">
              {!test && <input name="published_url" type="url" required placeholder="https://instagram.com/p/…" aria-label="Link do post" className={`${input} h-9 w-72`} />}
              <button className={btnPrimary}>{test ? "Publicar agora (teste)" : "Marcar como publicado"}</button>
            </form>
          )}
          {r.status === "solicitado" && r.kind === "impulsionar" && (
            <form action={act("iniciar")} className="flex flex-wrap items-end gap-2">
              {!test && <input name="external_id" placeholder="Código da campanha (opcional)" aria-label="Código da campanha" className={`${input} h-9 w-64`} />}
              <button className={btnPrimary}>{test ? "Colocar no ar (teste)" : "Marcar como no ar"}</button>
            </form>
          )}
          {r.status === "no_ar" && (test ? (
            <>
              <form action={act("metricas")}><button className={btnSecondary}>Atualizar números</button></form>
              <form action={act("encerrar")}><button className={btnPrimary}>Encerrar</button></form>
            </>
          ) : (
            <form action={act("encerrar")} className="flex flex-wrap items-end gap-2">
              {(["reach", "impressions", "clicks", "spend"] as const).map((k) => (
                <input key={k} name={k} inputMode="decimal" placeholder={{ reach: "Alcance", impressions: "Impressões", clicks: "Cliques", spend: "Investido R$" }[k]}
                  aria-label={k} className={`${input} h-9 w-28`} />
              ))}
              <button formAction={act("metricas")} className={btnSecondary}>Salvar números</button>
              <button className={btnPrimary}>Encerrar</button>
            </form>
          ))}
          <form action={act("cancelar")}><button className={btnGhost}>Cancelar pedido</button></form>
        </div>
      )}
    </li>
  );
}
