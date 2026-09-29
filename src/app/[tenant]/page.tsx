import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { resolveMonth } from "@/lib/month";
import { PLAN_STATUS } from "@/lib/labels";
import type { ItemStatus, MonthlyPlan, Operation, Region } from "@/lib/types";
import { MonthPicker } from "@/components/month-picker";
import { StatusBadge } from "@/components/status-badge";
import { card } from "@/components/ui";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ mes?: string }> };

const KIND_LABEL = { loja: "Loja", grupo: "Grupo", revenda: "Revenda" } as const;

export default async function RedePage({ params, searchParams }: Props) {
  const [{ tenant }, { mes }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const month = resolveMonth(mes);
  const supabase = await createClient();

  const [{ data: regions }, { data: operations }, { data: plans }] = await Promise.all([
    supabase.from("regions").select("id, code, name").eq("tenant_id", ctx.tenant.id).order("name"),
    supabase.from("operations").select("id, region_id, name, city, state, instagram, kind, in_pilot")
      .eq("tenant_id", ctx.tenant.id).eq("active", true).order("name"),
    supabase.from("monthly_plans").select("id, operation_id, month, status, focus")
      .eq("tenant_id", ctx.tenant.id).eq("month", month.first),
  ]);

  const ops = (operations ?? []) as Operation[];
  // Lojista com uma operação vai direto para o próprio plano.
  if (!ctx.isManager && ops.length === 1) redirect(`/${tenant}/operacoes/${ops[0].id}?mes=${month.key}`);

  const planList = (plans ?? []) as MonthlyPlan[];
  const planIds = planList.map((p) => p.id);
  const { data: items } = planIds.length
    ? await supabase.from("plan_items").select("plan_id, status").in("plan_id", planIds)
    : { data: [] as { plan_id: string; status: ItemStatus }[] };

  const planByOp = new Map(planList.map((p) => [p.operation_id, p]));
  const countsByPlan = new Map<string, Record<ItemStatus | "total", number>>();
  for (const it of items ?? []) {
    const c = countsByPlan.get(it.plan_id) ?? { total: 0, ideia: 0, roteiro: 0, aprovacao: 0, aprovado: 0, publicado: 0 };
    c.total++;
    c[it.status as ItemStatus]++;
    countsByPlan.set(it.plan_id, c);
  }

  const totals = { total: 0, aprovacao: 0, publicado: 0 };
  for (const c of countsByPlan.values()) {
    totals.total += c.total;
    totals.aprovacao += c.aprovacao;
    totals.publicado += c.publicado;
  }
  const kpis = [
    { label: "Operações", value: ops.length },
    { label: "Com plano no mês", value: planList.length, of: ops.length },
    { label: "Peças planejadas", value: totals.total },
    { label: "Aguardando aprovação", value: totals.aprovacao },
    { label: "Publicadas", value: totals.publicado },
  ];

  const byRegion = ((regions ?? []) as Region[])
    .map((r) => ({ region: r, ops: ops.filter((o) => o.region_id === r.id) }))
    .filter((g) => g.ops.length);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-subtle">Last Mile</p>
          <h1 className="font-display text-page">Rede {ctx.tenant.name}</h1>
        </div>
        <MonthPicker month={month} basePath={`/${tenant}`} />
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className={`${card} p-4`}>
            <dt className="label text-ink-muted">{k.label}</dt>
            <dd className="mt-1 text-metric font-semibold tabular">
              {k.value}
              {k.of !== undefined && <span className="text-heading font-normal text-ink-subtle"> / {k.of}</span>}
            </dd>
          </div>
        ))}
      </dl>

      {byRegion.length === 0 && (
        <p className={`${card} mt-6 p-6 text-body text-ink-muted`}>Nenhuma operação disponível para o seu perfil.</p>
      )}

      {byRegion.map(({ region, ops: regionOps }) => (
        <section key={region.id} className="mt-8">
          <h2 className="flex items-center gap-2 text-title font-semibold">
            {region.name}
            <span className="text-body font-normal text-ink-subtle tabular">{regionOps.length}</span>
          </h2>
          <div className={`${card} mt-3 overflow-x-auto`}>
            <table className="w-full min-w-[640px] text-left text-body">
              <thead>
                <tr className="border-b border-line">
                  <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Operação</th>
                  <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Tipo</th>
                  <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Plano do mês</th>
                  <th className="h-10 px-4 text-right text-caption font-medium text-ink-subtle">Publicadas</th>
                  <th className="h-10 px-4 text-right text-caption font-medium text-ink-subtle">Em aprovação</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {regionOps.map((op) => {
                  const plan = planByOp.get(op.id);
                  const c = plan ? countsByPlan.get(plan.id) : undefined;
                  const href = `/${tenant}/operacoes/${op.id}?mes=${month.key}`;
                  return (
                    <tr key={op.id} className="h-11 border-b border-line last:border-0 hover:bg-brand-soft">
                      <td className="px-4">
                        <Link href={href} className="font-semibold text-ink hover:text-brand">{op.name}</Link>
                        <span className="block text-caption text-ink-subtle">
                          {[op.city, op.state].filter(Boolean).join(" · ")}{op.instagram && ` · ${op.instagram}`}
                        </span>
                      </td>
                      <td className="px-4 text-ink-muted">{KIND_LABEL[op.kind]}</td>
                      <td className="px-4">
                        {plan
                          ? <StatusBadge {...PLAN_STATUS[plan.status]} />
                          : <StatusBadge label="Sem plano" tone="neutral" />}
                      </td>
                      <td className="px-4 text-right tabular">{c ? `${c.publicado} / ${c.total}` : "—"}</td>
                      <td className="px-4 text-right tabular">{c?.aprovacao || "—"}</td>
                      <td className="pr-3">
                        <Link href={href} aria-label={`Abrir ${op.name}`} className="grid size-8 place-items-center rounded-sm text-ink-subtle hover:text-ink">
                          <ChevronRight className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
