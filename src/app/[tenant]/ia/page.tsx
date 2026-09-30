import { redirect } from "next/navigation";
import { KeyRound, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { AI_FEATURES, AI_FEATURE_KEYS, DEFAULT_MODEL, aiKeyConfigured, type AiFeature } from "@/lib/ai";
import { formatDateTime, resolveMonth } from "@/lib/month";
import { formatInt } from "@/lib/format";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import { resetPrompt, saveAiSettings, savePrompt } from "./actions";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ erro?: string }> };

const ERRORS: Record<string, string> = {
  dados: "Confira os campos (modelo no formato provedor/modelo).", salvar: "Não foi possível salvar.", permissao: "Só a equipe Hub configura a IA.",
};
const USD = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type Usage = { feature: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number; ok: boolean; created_at: string; error: string | null };

export default async function IaPage({ params, searchParams }: Props) {
  const [{ tenant }, { erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  if (!ctx.isHub) redirect(`/${tenant}/controle`);
  const month = resolveMonth();
  const supabase = await createClient();
  const [{ data: settings }, { data: prompts }, { data: usageRows }] = await Promise.all([
    supabase.from("ai_settings").select("*").eq("tenant_id", ctx.tenant.id).maybeSingle(),
    supabase.from("ai_prompts").select("key, tenant_id, instructions, version, active, created_at")
      .or(`tenant_id.is.null,tenant_id.eq.${ctx.tenant.id}`).eq("active", true),
    supabase.from("ai_usage").select("feature, model, input_tokens, output_tokens, cost_usd, ok, created_at, error")
      .eq("tenant_id", ctx.tenant.id).gte("created_at", `${month.first}T00:00:00-03:00`).order("created_at", { ascending: false }).limit(1000),
  ]);
  const keyOk = aiKeyConfigured();
  const enabled = Boolean(settings?.enabled);
  const features: string[] = settings?.features ?? AI_FEATURE_KEYS;
  const budget = Number(settings?.monthly_budget_usd ?? 50);
  const usage = (usageRows ?? []) as Usage[];
  const spent = usage.reduce((s, u) => s + Number(u.cost_usd), 0);
  const byFeature = new Map<string, { calls: number; errors: number; cost: number; tokens: number }>();
  for (const u of usage) {
    const f = byFeature.get(u.feature) ?? { calls: 0, errors: 0, cost: 0, tokens: 0 };
    f.calls++;
    if (!u.ok) f.errors++;
    f.cost += Number(u.cost_usd);
    f.tokens += u.input_tokens + u.output_tokens;
    byFeature.set(u.feature, f);
  }
  const promptFor = (key: AiFeature) => {
    const rows = (prompts ?? []).filter((p) => p.key === key);
    const own = rows.find((p) => p.tenant_id);
    const global = rows.find((p) => !p.tenant_id);
    return { text: own?.instructions ?? global?.instructions ?? AI_FEATURES[key].instructions, own };
  };

  const status = !keyOk
    ? { label: "Aguardando chave", tone: "warning" as const }
    : enabled ? { label: "Ligada", tone: "success" as const } : { label: "Desligada", tone: "neutral" as const };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-page">IA</h1>
          <p className="mt-1 max-w-2xl text-body text-ink-muted">
            Cada função de IA liga por marca, usa as instruções abaixo mais o Brand OS, e tem custo registrado. Sem IA, todas as telas continuam funcionando no modo manual.
          </p>
        </div>
        <StatusBadge {...status} />
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      {!keyOk && (
        <div className={`${card} mt-6 flex gap-3 border-warning/25 bg-warning/5 p-4`}>
          <KeyRound className="size-5 shrink-0 text-warning" aria-hidden />
          <div className="text-body">
            <p className="font-semibold">Falta só a chave.</p>
            <p className="text-ink-muted">
              Crie uma chave em Vercel › AI Gateway › API Keys e coloque em <code className="rounded-sm bg-canvas px-1">AI_GATEWAY_API_KEY</code> no{" "}
              <code className="rounded-sm bg-canvas px-1">.env.local</code> (e nas variáveis do projeto na Vercel). Ao reiniciar o servidor, as funções marcadas abaixo passam a responder.
            </p>
          </div>
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Gasto no mês</dt><dd className="mt-1 text-metric font-semibold tabular">{USD.format(spent)}</dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Orçamento</dt><dd className="mt-1 text-metric font-semibold tabular">{budget ? USD.format(budget) : "Sem limite"}</dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Chamadas</dt><dd className="mt-1 text-metric font-semibold tabular">{formatInt(usage.length)}</dd></div>
        <div className={`${card} p-4`}><dt className="label text-ink-muted">Erros</dt><dd className="mt-1 text-metric font-semibold tabular">{formatInt(usage.filter((u) => !u.ok).length)}</dd></div>
      </dl>

      <form action={saveAiSettings.bind(null, tenant)} className={`${card} mt-6 space-y-4 p-4`}>
        <h2 className="text-heading font-semibold">Configuração da marca</h2>
        <label className="flex items-center gap-2 text-body font-semibold">
          <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4 accent-[var(--brand)]" /> IA ligada para {ctx.tenant.name}
        </label>
        <fieldset>
          <legend className="label text-ink-muted">Funções</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {AI_FEATURE_KEYS.map((k) => (
              <label key={k} className="flex gap-2 rounded-sm border border-line p-2 text-body">
                <input type="checkbox" name="features" value={k} defaultChecked={features.includes(k)} className="mt-0.5 size-4 accent-[var(--brand)]" />
                <span><span className="font-semibold">{AI_FEATURES[k].label}</span><span className="block text-caption text-ink-subtle">{AI_FEATURES[k].description}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Orçamento mensal (USD, 0 = sem limite)"><input name="monthly_budget_usd" inputMode="decimal" defaultValue={budget} className={input} /></Field>
          <Field label={`Modelo (padrão ${DEFAULT_MODEL})`}><input name="model" defaultValue={settings?.model ?? ""} placeholder={DEFAULT_MODEL} className={input} /></Field>
        </div>
        <div className="flex justify-end"><button className={btnPrimary}>Salvar</button></div>
      </form>

      <section className="mt-8">
        <h2 className="text-title font-semibold">Instruções por função</h2>
        <p className="text-caption text-ink-subtle">Cada salvamento cria uma nova versão só para esta marca. O contexto de marca (Brand OS) é somado automaticamente.</p>
        <ul className="mt-3 space-y-3">
          {AI_FEATURE_KEYS.map((k) => {
            const p = promptFor(k);
            const u = byFeature.get(k);
            return (
              <li key={k} className={card}>
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 font-semibold">{AI_FEATURES[k].label}</span>
                    {u && <span className="text-caption text-ink-subtle tabular">{u.calls} chamadas · {USD.format(u.cost)}</span>}
                    <StatusBadge {...(p.own ? { label: `Personalizada v${p.own.version}`, tone: "brand" as const } : { label: "Padrão NEST", tone: "neutral" as const })} />
                  </summary>
                  <form action={savePrompt.bind(null, tenant, k)} className="space-y-2 border-t border-line bg-canvas p-4">
                    <label className="block"><span className="sr-only">Instruções</span>
                      <textarea name="instructions" rows={7} defaultValue={p.text} className={textarea} />
                    </label>
                    <div className="flex justify-end gap-2">
                      {p.own && <button formAction={resetPrompt.bind(null, tenant, k)} className={btnGhost}><RotateCcw className="size-4" aria-hidden /> Voltar ao padrão</button>}
                      <button className={btnSecondary}>Salvar nova versão</button>
                    </div>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      {usage.length > 0 && (
        <section className={`${card} mt-8 overflow-x-auto`}>
          <h2 className="border-b border-line px-4 py-3 text-heading font-semibold">Últimas chamadas</h2>
          <table className="w-full min-w-[600px] text-left text-body">
            <thead><tr className="border-b border-line">
              {["Quando", "Função", "Modelo", "Tokens", "Custo", ""].map((h) => <th key={h} className="h-9 px-4 text-caption font-medium text-ink-subtle">{h}</th>)}
            </tr></thead>
            <tbody>
              {usage.slice(0, 30).map((u, i) => (
                <tr key={i} className="h-10 border-b border-line last:border-0">
                  <td className="px-4 tabular text-ink-muted">{formatDateTime(u.created_at)}</td>
                  <td className="px-4">{AI_FEATURES[u.feature as AiFeature]?.label ?? u.feature}</td>
                  <td className="px-4 text-ink-muted">{u.model}</td>
                  <td className="px-4 tabular">{formatInt(u.input_tokens + u.output_tokens)}</td>
                  <td className="px-4 tabular">{USD.format(Number(u.cost_usd))}</td>
                  <td className="px-4">{u.ok ? <StatusBadge label="OK" tone="success" /> : <StatusBadge label="Erro" tone="danger" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
