import Link from "next/link";
import { ChevronRight, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { PLAYBOOK_CATEGORY } from "@/lib/labels";
import type { Playbook } from "@/lib/types";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, card, input, textarea } from "@/components/ui";
import { createPlaybook, customizePlaybook } from "./actions";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ erro?: string }> };

const ERRORS: Record<string, string> = {
  dados: "Confira os campos.", salvar: "Não foi possível salvar.", permissao: "Só Hub e Marca editam playbooks.",
};

export default async function PlaybooksPage({ params, searchParams }: Props) {
  const [{ tenant }, { erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const supabase = await createClient();
  const [{ data: rows }, { data: steps }] = await Promise.all([
    supabase.from("playbooks").select("id, tenant_id, name, category, description, active")
      .or(`tenant_id.is.null,tenant_id.eq.${ctx.tenant.id}`).order("name"),
    supabase.from("playbook_steps").select("playbook_id, approver_role, due_offset_days"),
  ]);
  const all = (rows ?? []) as Playbook[];
  const stepInfo = new Map<string, { n: number; approvals: number; days: number }>();
  for (const s of steps ?? []) {
    const i = stepInfo.get(s.playbook_id) ?? { n: 0, approvals: 0, days: 0 };
    i.n++;
    if (s.approver_role) i.approvals++;
    i.days = Math.max(i.days, s.due_offset_days);
    stepInfo.set(s.playbook_id, i);
  }

  const groups = [
    { title: `Playbooks ${ctx.tenant.name}`, hint: "Processos personalizados para esta marca.", items: all.filter((p) => p.tenant_id) },
    { title: "Modelos NEST", hint: "O método pronto. Personalize para ajustar etapas, prazos e aprovações.", items: all.filter((p) => !p.tenant_id) },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <h1 className="font-display text-page">Playbooks</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-muted">
          Um playbook é o processo escrito: quem faz cada etapa, em quantos dias, e quem aprova. Todo projeto começa de um.
        </p>
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <div className={`mt-6 grid items-start gap-6 ${ctx.isManager ? "lg:grid-cols-[1fr_320px]" : ""}`}>
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.title}>
              <h2 className="text-title font-semibold">{g.title}</h2>
              <p className="text-caption text-ink-subtle">{g.hint}</p>
              {g.items.length === 0 ? (
                <p className={`${card} mt-3 p-4 text-body text-ink-muted`}>Nenhum ainda. Personalize um modelo NEST ou crie do zero.</p>
              ) : (
                <ul className={`${card} mt-3`}>
                  {g.items.map((p) => {
                    const i = stepInfo.get(p.id) ?? { n: 0, approvals: 0, days: 0 };
                    return (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                        <div className="min-w-0 flex-1">
                          <Link href={`/${tenant}/playbooks/${p.id}`} className="font-semibold hover:text-brand">{p.name}</Link>
                          <p className="text-caption text-ink-subtle">
                            {PLAYBOOK_CATEGORY[p.category] ?? p.category} · {i.n} etapas · {i.approvals} aprovações · {i.days} dias
                          </p>
                          {p.description && <p className="mt-0.5 text-body text-ink-muted">{p.description}</p>}
                        </div>
                        {!p.active && <StatusBadge label="Inativo" tone="neutral" />}
                        {!p.tenant_id && ctx.isManager && (
                          <form action={customizePlaybook.bind(null, tenant, p.id)}>
                            <button className={btnGhost}><Copy className="size-4" aria-hidden /> Personalizar</button>
                          </form>
                        )}
                        <Link href={`/${tenant}/playbooks/${p.id}`} aria-label={`Abrir ${p.name}`} className="grid size-8 place-items-center rounded-sm text-ink-subtle hover:text-ink">
                          <ChevronRight className="size-4" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>

        {ctx.isManager && (
          <aside className={`${card} h-fit p-4`}>
            <h2 className="text-heading font-semibold">Novo playbook</h2>
            <p className="text-caption text-ink-subtle">Comece vazio e adicione as etapas na próxima tela.</p>
            <form action={createPlaybook.bind(null, tenant)} className="mt-4 space-y-3">
              <Field label="Nome"><input name="name" required className={input} /></Field>
              <Field label="Categoria">
                <select name="category" className={input}>
                  {Object.entries(PLAYBOOK_CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Para que serve"><textarea name="description" rows={3} className={textarea} /></Field>
              <button className={`${btnPrimary} w-full`}>Criar playbook</button>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}
