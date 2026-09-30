import { FlaskConical, Megaphone, Send } from "lucide-react";
import type { PlanItem } from "@/lib/types";
import {
  ACTIVE, OBJECTIVE, PLACEMENT, SERVICE_KIND, SERVICE_STATUS, brl, formatDateTime, placementFor,
  type PieceService, type PublishingMode,
} from "@/lib/publishing";
import { addDays, todayIso } from "@/lib/month";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnSecondary, input, textarea } from "@/components/ui";

type Action = (fd: FormData) => Promise<void>;

// Etapas 5 e 6 do ciclo dentro da peça: "a NEST posta por mim" (peça aprovada)
// e "impulsionar" (peça publicada). A Hub executa pela fila em Conteúdo › Postagem.
export function ServicesPanel({ item, services, mode, schedule, boost, cancel }: {
  item: PlanItem;
  services: PieceService[];
  mode: PublishingMode;
  schedule: Action;
  boost: Action;
  cancel: (serviceId: string) => Action;
}) {
  const active = (kind: PieceService["kind"]) => services.some((s) => s.kind === kind && ACTIVE.includes(s.status));
  const canSchedule = item.status === "aprovado" && !active("agendar");
  const canBoost = item.status === "publicado" && !active("impulsionar");
  if (!services.length && !canSchedule && !canBoost) return null;

  const minDate = item.scheduled_on && item.scheduled_on > todayIso() ? item.scheduled_on : addDays(todayIso(), 1);

  return (
    <section className="space-y-3">
      {mode === "teste" && (
        <p className="flex items-center gap-2 rounded-sm bg-info/5 px-3 py-2 text-caption text-info">
          <FlaskConical className="size-3.5 shrink-0" aria-hidden /> Modo teste: nada é publicado nem cobrado de verdade.
        </p>
      )}

      {services.map((s) => <ServiceCard key={s.id} s={s} cancel={cancel(s.id)} />)}

      {canSchedule && (
        <details className="group rounded-md border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 hover:bg-canvas">
            <Send className="size-4 text-ink-subtle" aria-hidden />
            <span className="flex-1">
              <span className="block text-body font-semibold">Prefere que a NEST poste por você?</span>
              <span className="block text-caption text-ink-muted">Escolha o dia e a hora; a equipe agenda no perfil da loja.</span>
            </span>
          </summary>
          <form action={schedule} className="space-y-3 border-t border-line p-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Dia"><input type="date" name="date" required min={addDays(todayIso(), 0)} defaultValue={minDate} className={input} /></Field>
              <Field label="Hora"><input type="time" name="time" required defaultValue="18:00" className={input} /></Field>
              <Field label="Onde">
                <select name="placement" defaultValue={placementFor(item.format)} className={input}>
                  {Object.entries(PLACEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Legenda"><textarea name="caption" rows={3} defaultValue={item.caption ?? ""} className={textarea} /></Field>
            <Field label="Recado para a equipe (opcional)"><input name="notes" className={input} placeholder="Ex.: marcar @shoppingboulevard" /></Field>
            <button className={btnSecondary}><Send className="size-4" aria-hidden /> Pedir agendamento</button>
          </form>
        </details>
      )}

      {canBoost && (
        <details className="group rounded-md border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 hover:bg-canvas">
            <Megaphone className="size-4 text-ink-subtle" aria-hidden />
            <span className="flex-1">
              <span className="block text-body font-semibold">Impulsionar este post</span>
              <span className="block text-caption text-ink-muted">Transforme a peça em mídia local para mais gente perto da loja ver.</span>
            </span>
          </summary>
          <form action={boost} className="space-y-3 border-t border-line p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Verba total (R$)"><input name="budget" inputMode="decimal" required defaultValue="50" className={input} /></Field>
              <Field label="Por quantos dias"><input name="days" type="number" min={1} max={30} required defaultValue={5} className={input} /></Field>
            </div>
            <Field label="Objetivo">
              <select name="objective" defaultValue="alcance" className={input}>
                {Object.entries(OBJECTIVE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Público (opcional)"><input name="audience" className={input} placeholder="Ex.: raio de 5 km da loja, 25 a 55 anos" /></Field>
            <Field label="Recado para a equipe (opcional)"><input name="notes" className={input} /></Field>
            <button className={btnSecondary}><Megaphone className="size-4" aria-hidden /> Pedir impulsionamento</button>
          </form>
        </details>
      )}
    </section>
  );
}

function ServiceCard({ s, cancel }: { s: PieceService; cancel: Action }) {
  const Icon = s.kind === "agendar" ? Send : Megaphone;
  const m = s.metrics ?? {};
  return (
    <div className="rounded-md border border-line p-4">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold">{SERVICE_KIND[s.kind]}</p>
          <p className="text-caption text-ink-muted">
            {s.kind === "agendar"
              ? <>{s.placement && PLACEMENT[s.placement]} · {s.scheduled_at && formatDateTime(s.scheduled_at)}</>
              : <>{s.budget != null && brl(Number(s.budget))} em {s.days} dia(s) · {s.objective && OBJECTIVE[s.objective]}</>}
          </p>
        </div>
        <StatusBadge {...SERVICE_STATUS[s.status]} />
      </div>
      {m.reach !== undefined && (
        <dl className="mt-3 grid grid-cols-4 gap-2 pl-6.5 text-center">
          {[["Alcance", m.reach], ["Impressões", m.impressions], ["Cliques", m.clicks]].map(([l, v]) => (
            <div key={l as string}><dt className="text-caption text-ink-subtle">{l}</dt><dd className="font-semibold tabular">{Number(v ?? 0).toLocaleString("pt-BR")}</dd></div>
          ))}
          <div><dt className="text-caption text-ink-subtle">Investido</dt><dd className="font-semibold tabular">{brl(m.spend ?? 0)}</dd></div>
        </dl>
      )}
      {m.simulated && <p className="mt-2 pl-6.5 text-caption text-ink-subtle">Números simulados (modo teste).</p>}
      {s.status === "solicitado" && (
        <form action={cancel} className="mt-2 pl-4">
          <button className={btnGhost}>Cancelar pedido</button>
        </form>
      )}
    </div>
  );
}
