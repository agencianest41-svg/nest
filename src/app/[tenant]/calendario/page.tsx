import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatRange, resolveMonth } from "@/lib/month";
import { EVENT_KIND, EVENT_SCOPE } from "@/lib/labels";
import type { CalendarEvent, Region } from "@/lib/types";
import { Field } from "@/components/field";
import { MonthPicker } from "@/components/month-picker";
import { btnGhost, btnPrimary, card, input, textarea } from "@/components/ui";
import { createEvent, deleteEvent } from "./actions";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ mes?: string; erro?: string }> };

const ERRORS: Record<string, string> = {
  dados: "Preencha título e datas válidas (e a região, se for regional).",
  salvar: "Não foi possível salvar o evento.",
  permissao: "Só Hub e Marca editam o calendário nacional.",
};

export default async function CalendarioPage({ params, searchParams }: Props) {
  const [{ tenant }, { mes, erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const month = resolveMonth(mes);
  const supabase = await createClient();

  const [{ data: events }, { data: regions }, { data: ops }] = await Promise.all([
    supabase.from("calendar_events").select("*").eq("tenant_id", ctx.tenant.id)
      .lte("starts_on", month.last).gte("ends_on", month.first).order("starts_on"),
    supabase.from("regions").select("id, code, name").eq("tenant_id", ctx.tenant.id).order("name"),
    supabase.from("operations").select("id, name").eq("tenant_id", ctx.tenant.id),
  ]);
  const regionName = new Map(((regions ?? []) as Region[]).map((r) => [r.id, r.name]));
  const opName = new Map((ops ?? []).map((o) => [o.id, o.name]));
  const list = (events ?? []) as CalendarEvent[];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-page">Calendário da rede</h1>
        </div>
        <MonthPicker month={month} basePath={`/${tenant}/calendario`} />
      </header>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <section className={card}>
          {list.length === 0 ? (
            <p className="p-6 text-body text-ink-muted">Nenhum evento em {month.label.toLowerCase()}.</p>
          ) : (
            <ul>
              {list.map((e) => (
                <li key={e.id} className="flex items-start gap-4 border-b border-line px-4 py-3 last:border-0">
                  <span className="w-28 shrink-0 text-body font-semibold tabular">{formatRange(e.starts_on, e.ends_on)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{e.title}</p>
                    <p className="text-caption text-ink-subtle">
                      {EVENT_SCOPE[e.scope]}
                      {e.region_id && ` · ${regionName.get(e.region_id)}`}
                      {e.operation_id && ` · ${opName.get(e.operation_id) ?? "Operação"}`}
                      {` · ${EVENT_KIND[e.kind]}`}
                    </p>
                    {e.notes && <p className="mt-1 text-body text-ink-muted">{e.notes}</p>}
                  </div>
                  {ctx.isManager && (
                    <form action={deleteEvent.bind(null, tenant)}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className={btnGhost} aria-label={`Remover ${e.title}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {ctx.isManager && (
          <aside className={`${card} h-fit p-4`}>
            <h2 className="text-heading font-semibold">Novo evento</h2>
            <p className="text-caption text-ink-subtle">Nacional ou regional. Datas locais são criadas na própria operação.</p>
            <form action={createEvent.bind(null, tenant)} className="mt-4 space-y-3">
              <input type="hidden" name="mes" value={month.key} />
              <Field label="Título"><input name="title" required className={input} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Abrangência">
                  <select name="scope" className={input}>
                    <option value="nacional">Nacional</option>
                    <option value="regional">Regional</option>
                  </select>
                </Field>
                <Field label="Tipo">
                  <select name="kind" className={input}>
                    {Object.entries(EVENT_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Região (se regional)">
                <select name="region_id" className={input} defaultValue="">
                  <option value="">—</option>
                  {(regions ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início"><input type="date" name="starts_on" required defaultValue={month.first} className={input} /></Field>
                <Field label="Fim"><input type="date" name="ends_on" defaultValue={month.first} className={input} /></Field>
              </div>
              <Field label="Orientação para a rede"><textarea name="notes" rows={3} className={textarea} /></Field>
              {erro && ERRORS[erro] && <p role="alert" className="text-body text-danger">{ERRORS[erro]}</p>}
              <button className={`${btnPrimary} w-full`}>Adicionar ao calendário</button>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}
