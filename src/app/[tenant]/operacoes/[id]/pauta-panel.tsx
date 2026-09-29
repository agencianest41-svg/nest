import Link from "next/link";
import { ArrowRight, BookOpen, ExternalLink, FolderOpen, ShieldAlert, X } from "lucide-react";
import { formatDay } from "@/lib/month";
import { weekdayLong } from "@/lib/pautas";
import { FUNNEL_STAGE, ITEM_FORMAT, ITEM_ORIGIN, ITEM_STATUS } from "@/lib/labels";
import type { Editoria, ItemStatus, PlanItem } from "@/lib/types";
import { CopyText } from "@/components/copy-text";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, btnSecondary, input } from "@/components/ui";
import { FORMAT_ICON } from "./month-calendar";

type Props = {
  item: PlanItem;
  slug: string;
  closeHref: string;
  editoria?: Editoria;
  eventTitle?: string;
  kit?: { id: string; title: string };
  practice?: { id: string; title: string };
  isManager: boolean;
  advance: (from: ItemStatus) => (formData: FormData) => Promise<void>;
  error?: string;
  editor: React.ReactNode;
  results: React.ReactNode;
  conversation: React.ReactNode;
};

const STEPS: { label: string; statuses: ItemStatus[] }[] = [
  { label: "Ideia", statuses: ["ideia"] },
  { label: "Criar", statuses: ["roteiro"] },
  { label: "Revisão", statuses: ["aprovacao", "aprovado"] },
  { label: "Publicado", statuses: ["publicado"] },
];

// Painel da pauta no calendário: o franqueado lê o cérebro (ideia, por quê,
// gancho, roteiro) e segue o próximo passo; a edição completa fica recolhida.
export function PautaPanel({ item, slug, closeHref, editoria, eventTitle, kit, practice, isManager, advance, error, editor, results, conversation }: Props) {
  const Icon = FORMAT_ICON[item.format];
  const stepIndex = STEPS.findIndex((s) => s.statuses.includes(item.status));
  const act = advance(item.status);

  return (
    <div className="fixed inset-0 z-40 print:hidden">
      <Link href={closeHref} scroll={false} aria-label="Fechar pauta" className="absolute inset-0 bg-ink/20" />
      <aside role="dialog" aria-modal="true" aria-labelledby="pauta-titulo"
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-line bg-surface shadow-xl">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-caption font-medium text-ink-subtle">
              {item.scheduled_on ? weekdayLong(item.scheduled_on) : "Sem data"}
            </p>
            <h2 id="pauta-titulo" className="mt-0.5 text-title font-semibold">{item.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge {...ITEM_STATUS[item.status]} />
              <span className="inline-flex h-6 items-center gap-1 rounded-full border border-line px-2 text-caption text-ink-muted">
                <Icon className="size-3.5" aria-hidden /> {ITEM_FORMAT[item.format]}
              </span>
              {editoria && <span className="inline-flex h-6 items-center rounded-full border border-line px-2 text-caption text-ink-muted">{editoria.name}</span>}
              {item.funnel && <span className="inline-flex h-6 items-center rounded-full border border-line px-2 text-caption text-ink-muted">{FUNNEL_STAGE[item.funnel]}</span>}
            </div>
          </div>
          <Link href={closeHref} scroll={false} className={btnGhost} aria-label="Fechar"><X className="size-4" /></Link>
        </header>

        <div className="flex-1 overflow-y-auto">
          <ol className="flex border-b border-line" aria-label="Etapas da pauta">
            {STEPS.map((s, i) => (
              <li key={s.label} aria-current={i === stepIndex ? "step" : undefined}
                className={`flex-1 border-b-2 px-2 py-2 text-center text-caption font-medium ${
                  i === stepIndex ? "border-ink text-ink" : i < stepIndex ? "border-line-strong text-ink-muted" : "border-transparent text-ink-subtle"}`}>
                {s.label}
              </li>
            ))}
          </ol>

          <div className="space-y-5 px-5 py-4">
            {error && <p role="alert" className="rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{error}</p>}

            {item.sensitive && (
              <p className="flex items-start gap-2 rounded-sm border border-warning/30 bg-warning/5 p-3 text-body text-warning">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Pauta sensível: passa pela revisão da Hub ou da Marca antes de publicar.
              </p>
            )}

            <NextStep item={item} isManager={isManager} action={act} />

            {item.idea && <Block title="A ideia">{item.idea}</Block>}
            {item.rationale && <Block title="Por que postar">{item.rationale}</Block>}
            {item.hook && <Block title="Gancho" copy={item.hook}>“{item.hook}”</Block>}
            {item.script && <Block title="Roteiro" copy={item.script}>{item.script}</Block>}
            {item.caption && <Block title="Legenda" copy={item.caption}>{item.caption}</Block>}
            {!item.idea && !item.rationale && !item.script && !item.caption && (
              <p className="text-body text-ink-muted">Esta pauta ainda não tem roteiro. Use “Editar pauta” abaixo para escrever (ou peça à IA).</p>
            )}

            {(eventTitle || kit || practice) && (
              <section className="space-y-2">
                <h3 className="label text-ink-subtle">Apoio</h3>
                {eventTitle && <p className="text-body"><span className="text-ink-subtle">Campanha:</span> {eventTitle}</p>}
                {kit && (
                  <Link href={`/${slug}/ativos/kits/${kit.id}`} className="flex items-center gap-2 rounded-sm border border-line px-3 py-2 text-body hover:bg-canvas">
                    <FolderOpen className="size-4 text-ink-subtle" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">Kit: {kit.title}</span>
                    <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
                  </Link>
                )}
                {practice && (
                  <Link href={`/${slug}/biblioteca`} className="flex items-center gap-2 rounded-sm border border-line px-3 py-2 text-body hover:bg-canvas">
                    <BookOpen className="size-4 text-ink-subtle" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">Inspiração: {practice.title}</span>
                    <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
                  </Link>
                )}
              </section>
            )}

            <p className="text-caption text-ink-subtle">
              {ITEM_ORIGIN[item.origin]}{item.scheduled_on && ` · planejada para ${formatDay(item.scheduled_on)}`}
            </p>
          </div>

          <details className="border-t border-line">
            <summary className="cursor-pointer px-5 py-3 text-body font-semibold hover:bg-canvas">Editar pauta</summary>
            {editor}
          </details>
          {results}
          <div className="border-t border-line bg-canvas px-5 pb-5">
            <p className="label pt-3 text-ink-muted">Conversa</p>
            {conversation}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Block({ title, copy, children }: { title: string; copy?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="label text-ink-subtle">{title}</h3>
        {copy && <CopyText text={copy} />}
      </div>
      <p className="mt-1 whitespace-pre-line text-body">{children}</p>
    </section>
  );
}

function NextStep({ item, isManager, action }: { item: PlanItem; isManager: boolean; action: (fd: FormData) => Promise<void> }) {
  const box = "rounded-md border border-line bg-canvas p-4";
  const go = (to: ItemStatus, label: string, primary = true) => (
    <button name="to" value={to} className={primary ? btnPrimary : btnGhost}>{label}</button>
  );

  switch (item.status) {
    case "ideia":
      return (
        <form action={action} className={box}>
          <p className="text-body font-semibold">Próximo passo: criar</p>
          <p className="text-body text-ink-muted">Leia a ideia e o porquê. Quando for gravar ou montar a peça, marque como “em criação”.</p>
          <div className="mt-3">{go("roteiro", "Começar a criar")}</div>
        </form>
      );
    case "roteiro":
      return (
        <form action={action} className={box}>
          <p className="text-body font-semibold">Em criação</p>
          <p className="text-body text-ink-muted">Grave seguindo o gancho e o roteiro, use a legenda pronta e os ativos do kit. Com a peça pronta, envie para revisão.</p>
          <div className="mt-3 flex flex-wrap gap-2">{go("aprovacao", "Enviar para revisão")}{go("ideia", "Voltar para ideia", false)}</div>
        </form>
      );
    case "aprovacao":
      return isManager ? (
        <form action={action} className={box}>
          <p className="text-body font-semibold">Aguardando sua revisão</p>
          <p className="text-body text-ink-muted">Confira a peça pela conversa ou pelo roteiro e legenda abaixo.</p>
          <div className="mt-3 flex flex-wrap gap-2">{go("aprovado", "Aprovar")}{go("roteiro", "Devolver para ajuste", false)}</div>
        </form>
      ) : (
        <div className={box}>
          <p className="text-body font-semibold">Em revisão</p>
          <p className="text-body text-ink-muted">A Hub ou a Marca estão revisando. Você recebe o retorno pela conversa desta pauta.</p>
        </div>
      );
    case "aprovado":
      return (
        <form action={action} className={box}>
          <input type="hidden" name="to" value="publicado" />
          <p className="text-body font-semibold">Aprovada: pode publicar</p>
          <p className="text-body text-ink-muted">Depois de postar, cole o link do post para registrar a entrega.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input name="published_url" type="url" required placeholder="https://instagram.com/p/…" aria-label="Link do post publicado" className={`${input} min-w-0 flex-1`} />
            <button className={btnPrimary}>Marcar como publicada</button>
          </div>
        </form>
      );
    case "publicado":
      return (
        <form action={action} className={box}>
          <p className="text-body font-semibold">Publicada</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.published_url && (
              <a href={item.published_url} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
                <ExternalLink className="size-4" aria-hidden /> Ver post
              </a>
            )}
            {isManager && go("aprovado", "Reabrir", false)}
          </div>
        </form>
      );
  }
}
