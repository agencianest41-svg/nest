import Link from "next/link";
import { Ban, AlertTriangle, CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { loadBrand, RULE_KIND } from "@/lib/brand";
import { FUNNEL_STAGE, ITEM_FORMAT } from "@/lib/labels";
import type { Editoria, TenantTheme } from "@/lib/types";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import { addEditoria, addExample, addPersona, addProduct, addRule, removeBrandRow, saveTheme, saveVoice, toggleEditoria, toggleProduct } from "./actions";
import { checkBrandText } from "./check-action";
import { BrandTester } from "./brand-tester";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ aba?: string; erro?: string }> };

const TABS = [
  { key: "identidade", label: "Identidade" },
  { key: "voz", label: "Voz" },
  { key: "editorias", label: "Editorias" },
  { key: "personas", label: "Personas" },
  { key: "produtos", label: "Produtos" },
  { key: "regras", label: "Regras" },
  { key: "exemplos", label: "Exemplos" },
  { key: "testar", label: "Testar texto" },
] as const;

const ERRORS: Record<string, string> = {
  dados: "Confira os campos obrigatórios.",
  salvar: "Não foi possível salvar.",
  permissao: "Só Hub e Marca editam a marca.",
  cor: "Use cores no formato #RRGGBB.",
  logo: "O logo precisa ser um endereço https://.",
};

const HIDDEN_COLORS: (keyof TenantTheme)[] = [
  "brand_hover", "brand_soft", "on_brand", "accent_ink",
  "brand_dark", "brand_hover_dark", "brand_soft_dark", "on_brand_dark", "accent_ink_dark",
];


export default async function MarcaPage({ params, searchParams }: Props) {
  const [{ tenant }, { aba = "identidade", erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const supabase = await createClient();
  const [brand, { data: editoriaRows }] = await Promise.all([
    loadBrand(supabase, ctx.tenant.id),
    supabase.from("editorias").select("*").eq("tenant_id", ctx.tenant.id).order("position"),
  ]);
  const editorias = (editoriaRows ?? []) as Editoria[];
  const shareTotal = editorias.filter((e) => e.active).reduce((s, e) => s + (e.share ?? 0), 0);
  const edit = ctx.isManager;
  const tab = TABS.some((t) => t.key === aba) ? aba : "identidade";
  const theme = ctx.theme;
  const v = brand.voice;

  const completeness = [
    Boolean(theme?.logo_url), Boolean(v?.essence && v.tone), brand.personas.length > 0,
    brand.products.length > 0, brand.rules.length > 0, brand.examples.length > 0, editorias.length > 0,
  ];
  const score = Math.round((completeness.filter(Boolean).length / completeness.length) * 100);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-subtle">Brand OS</p>
          <h1 className="font-display text-page">Marca {ctx.tenant.name}</h1>
          <p className="mt-1 max-w-2xl text-body text-ink-muted">
            Tudo o que a equipe, os parceiros e a IA precisam saber para falar como a marca. O que está aqui alimenta o Estúdio e o guardião de marca.
          </p>
        </div>
        <div className={`${card} px-4 py-2`}>
          <p className="label text-ink-muted">Marca configurada</p>
          <p className="text-metric font-semibold tabular">{score}%</p>
        </div>
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Seções da marca">
        {TABS.map((t) => (
          <Link key={t.key} href={`/${tenant}/marca?aba=${t.key}`} aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-body font-semibold whitespace-nowrap ${tab === t.key ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "identidade" && (
          <form action={saveTheme.bind(null, tenant)} className={`${card} space-y-6 p-4`}>
            <fieldset disabled={!edit} className="space-y-6">
              <div>
                <h2 className="text-heading font-semibold">Cores da marca</h2>
                <p className="text-caption text-ink-subtle">Usadas no logo, nos destaques e como referência para as peças.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ColorInput name="brand" label="Cor principal" value={String(theme?.brand ?? "#18181b")} />
                  <ColorInput name="accent" label="Cor de destaque" value={String(theme?.accent ?? "#a1a1aa")} />
                </div>
                {/* Tons derivados ficam guardados para uso nas peças; não aparecem na interface. */}
                {HIDDEN_COLORS.map((k) => (
                  <input key={k} type="hidden" name={k} value={/^#[0-9a-fA-F]{6}$/.test(String(theme?.[k] ?? "")) ? String(theme?.[k]) : "#777777"} />
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Logo (https, fundo claro)"><input name="logo_url" defaultValue={theme?.logo_url ?? ""} className={input} placeholder="https://…/logo.svg" /></Field>
                <Field label="Logo (https, fundo escuro)"><input name="logo_dark_url" defaultValue={theme?.logo_dark_url ?? ""} className={input} /></Field>
                <div className="sm:col-span-2"><Field label="Fonte do logo (CSS)"><input name="font_display" defaultValue={theme?.font_display ?? ""} className={input} /></Field></div>
              </div>
              <div className="flex flex-wrap items-center gap-4 rounded-sm border border-line bg-canvas p-4">
                <span className="font-brand text-title text-tenant">{ctx.tenant.name}</span>
                {theme && [theme.brand, theme.brand_soft, theme.accent, theme.accent_ink].map((c) => (
                  <span key={c} className="size-7 rounded-full ring-1 ring-line" style={{ background: c }} aria-label={c} />
                ))}
                <span className="text-caption text-ink-subtle">
                  A interface da NEST é neutra; as cores da marca aparecem no logo, nos destaques e nas peças.
                </span>
              </div>
            </fieldset>
            {edit && <div className="flex justify-end"><button className={btnPrimary}>Salvar identidade</button></div>}
          </form>
        )}

        {tab === "voz" && (
          <form action={saveVoice.bind(null, tenant)} className={`${card} p-4`}>
            <fieldset disabled={!edit} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Assinatura / slogan"><input name="tagline" defaultValue={v?.tagline ?? ""} className={input} /></Field></div>
              <div className="sm:col-span-2"><Field label="Essência (obrigatório)"><textarea name="essence" required rows={3} defaultValue={v?.essence ?? ""} className={textarea} /></Field></div>
              <div className="sm:col-span-2"><Field label="Tom de voz (obrigatório)"><textarea name="tone" required rows={3} defaultValue={v?.tone ?? ""} className={textarea} /></Field></div>
              <Field label="Valores"><textarea name="brand_values" rows={3} defaultValue={v?.brand_values ?? ""} className={textarea} /></Field>
              <Field label="Pilares de conteúdo"><textarea name="content_pillars" rows={3} defaultValue={v?.content_pillars ?? ""} className={textarea} /></Field>
              <Field label="Vocabulário preferido"><textarea name="vocabulary" rows={4} defaultValue={v?.vocabulary ?? ""} className={textarea} /></Field>
              <Field label="O que evitar"><textarea name="avoid" rows={4} defaultValue={v?.avoid ?? ""} className={textarea} /></Field>
              <div className="sm:col-span-2"><Field label="Públicos"><textarea name="audience" rows={2} defaultValue={v?.audience ?? ""} className={textarea} /></Field></div>
            </fieldset>
            {edit && <div className="mt-4 flex justify-end"><button className={btnPrimary}>Salvar voz</button></div>}
          </form>
        )}

        {tab === "editorias" && (
          <section className="space-y-4">
            <p className="text-body text-ink-muted">
              As editorias organizam o calendário de cada loja: toda pauta nasce de uma delas. O peso indica quanto do mês cada uma ocupa
              {shareTotal > 0 && <> (hoje somam <b className="tabular">{shareTotal}%</b>)</>}.
            </p>
            <ul className={card}>
              {editorias.length === 0 && <li className="p-4 text-body text-ink-muted">Nenhuma editoria cadastrada.</li>}
              {editorias.map((e) => (
                <li key={e.id} className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {e.name}
                      <span className="font-normal text-ink-subtle">
                        {e.funnel && ` · ${FUNNEL_STAGE[e.funnel]}`}{e.share !== null && ` · ${e.share}% do mês`}
                      </span>
                    </p>
                    {e.description && <p className="text-body text-ink-muted">{e.description}</p>}
                  </div>
                  {!e.active && <StatusBadge label="Pausada" tone="neutral" />}
                  {edit && (
                    <>
                      <form action={toggleEditoria.bind(null, tenant, e.id, !e.active)}><button className={btnGhost}>{e.active ? "Pausar" : "Ativar"}</button></form>
                      <form action={removeBrandRow.bind(null, tenant, "editorias", e.id)}><button className={btnGhost} aria-label={`Remover ${e.name}`}><Trash2 className="size-4" /></button></form>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {edit && (
              <form action={addEditoria.bind(null, tenant)} className={`${card} grid gap-3 p-4 sm:grid-cols-[1fr_180px_120px]`}>
                <Field label="Editoria"><input name="name" required className={input} placeholder="Ex.: Ritual & autocuidado" /></Field>
                <Field label="Estágio do funil">
                  <select name="funnel" defaultValue="" className={input}>
                    <option value="">—</option>
                    {Object.entries(FUNNEL_STAGE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Peso (%)"><input name="share" type="number" min={0} max={100} className={input} /></Field>
                <div className="sm:col-span-3"><Field label="O que entra nesta editoria"><textarea name="description" rows={2} className={textarea} /></Field></div>
                <div className="flex justify-end sm:col-span-3"><button className={btnSecondary}><Plus className="size-4" aria-hidden /> Adicionar editoria</button></div>
              </form>
            )}
          </section>
        )}

        {tab === "personas" && (
          <List
            empty="Nenhuma persona cadastrada."
            items={brand.personas.map((p) => ({
              id: p.id, title: p.name,
              body: [p.description, p.goals && `Quer: ${p.goals}`, p.pains && `Dor: ${p.pains}`, p.channels && `Canais: ${p.channels}`].filter(Boolean) as string[],
            }))}
            remove={edit ? (id) => removeBrandRow.bind(null, tenant, "personas", id) : undefined}
            form={edit && (
              <form action={addPersona.bind(null, tenant)} className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome"><input name="name" required className={input} placeholder="Ex.: Presenteadora" /></Field>
                <Field label="Canais"><input name="channels" className={input} /></Field>
                <div className="sm:col-span-2"><Field label="Quem é"><textarea name="description" rows={2} className={textarea} /></Field></div>
                <Field label="O que quer"><textarea name="goals" rows={2} className={textarea} /></Field>
                <Field label="Dores"><textarea name="pains" rows={2} className={textarea} /></Field>
                <div className="flex justify-end sm:col-span-2"><button className={btnSecondary}><Plus className="size-4" aria-hidden /> Adicionar persona</button></div>
              </form>
            )}
          />
        )}

        {tab === "produtos" && (
          <section className="space-y-4">
            <ul className={card}>
              {brand.products.length === 0 && <li className="p-4 text-body text-ink-muted">Nenhum produto cadastrado. A IA só cita pelo nome produtos desta lista.</li>}
              {brand.products.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}{p.category && <span className="font-normal text-ink-subtle"> · {p.category}</span>}</p>
                    {p.description && <p className="text-body text-ink-muted">{p.description}</p>}
                    {p.highlights && <p className="text-caption text-ink-subtle">Destaques: {p.highlights}</p>}
                  </div>
                  <StatusBadge {...(p.active ? { label: "Ativo", tone: "success" as const } : { label: "Fora de linha", tone: "neutral" as const })} />
                  {edit && (
                    <>
                      <form action={toggleProduct.bind(null, tenant, p.id, !p.active)}><button className={btnGhost}>{p.active ? "Desativar" : "Ativar"}</button></form>
                      <form action={removeBrandRow.bind(null, tenant, "produtos", p.id)}><button className={btnGhost} aria-label={`Remover ${p.name}`}><Trash2 className="size-4" /></button></form>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {edit && (
              <form action={addProduct.bind(null, tenant)} className={`${card} grid gap-3 p-4 sm:grid-cols-2`}>
                <Field label="Produto"><input name="name" required className={input} /></Field>
                <Field label="Categoria / família"><input name="category" className={input} placeholder="Ex.: Floral" /></Field>
                <div className="sm:col-span-2"><Field label="Descrição"><textarea name="description" rows={2} className={textarea} /></Field></div>
                <div className="sm:col-span-2"><Field label="Destaques para comunicar"><input name="highlights" className={input} /></Field></div>
                <div className="flex justify-end sm:col-span-2"><button className={btnSecondary}><Plus className="size-4" aria-hidden /> Adicionar produto</button></div>
              </form>
            )}
          </section>
        )}

        {tab === "regras" && (
          <section className="space-y-4">
            <p className="text-body text-ink-muted">
              Termos proibidos com <b>bloqueia</b> impedem a peça de seguir para aprovação. Os demais aparecem como alerta no guardião de marca e orientam a IA.
            </p>
            <ul className={card}>
              {brand.rules.length === 0 && <li className="p-4 text-body text-ink-muted">Nenhuma regra cadastrada.</li>}
              {brand.rules.map((r) => (
                <li key={r.id} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0">
                  {r.severity === "bloqueia" ? <Ban className="mt-0.5 size-4 text-danger" aria-label="Bloqueia" /> : <AlertTriangle className="mt-0.5 size-4 text-warning" aria-label="Alerta" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{RULE_KIND[r.kind]}{r.term && ` · “${r.term}”`}</p>
                    <p className="text-body text-ink-muted">{r.guidance}</p>
                  </div>
                  {edit && <form action={removeBrandRow.bind(null, tenant, "regras", r.id)}><button className={btnGhost} aria-label="Remover regra"><Trash2 className="size-4" /></button></form>}
                </li>
              ))}
            </ul>
            {edit && (
              <form action={addRule.bind(null, tenant)} className={`${card} grid gap-3 p-4 sm:grid-cols-3`}>
                <Field label="Tipo">
                  <select name="kind" className={input}>{Object.entries(RULE_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </Field>
                <Field label="Termo (para termos)"><input name="term" className={input} /></Field>
                <Field label="Gravidade">
                  <select name="severity" className={input}><option value="alerta">Alerta</option><option value="bloqueia">Bloqueia</option></select>
                </Field>
                <div className="sm:col-span-3"><Field label="Orientação"><input name="guidance" required className={input} placeholder="O que fazer no lugar" /></Field></div>
                <div className="flex justify-end sm:col-span-3"><button className={btnSecondary}><Plus className="size-4" aria-hidden /> Adicionar regra</button></div>
              </form>
            )}
          </section>
        )}

        {tab === "exemplos" && (
          <section className="space-y-4">
            <p className="text-body text-ink-muted">Peças aprovadas e reprovadas, com o motivo. A IA aprende o critério da marca com elas.</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {brand.examples.length === 0 && <li className={`${card} p-4 text-body text-ink-muted`}>Nenhum exemplo ainda.</li>}
              {brand.examples.map((e) => (
                <li key={e.id} className={`${card} p-4`}>
                  <p className={`flex items-center gap-1 text-caption font-semibold ${e.verdict === "aprovado" ? "text-success" : "text-danger"}`}>
                    {e.verdict === "aprovado" ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
                    {e.verdict === "aprovado" ? "Aprovado" : "Reprovado"}{e.format && ` · ${ITEM_FORMAT[e.format]}`}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-body">{e.content}</p>
                  {e.reason && <p className="mt-1 text-caption text-ink-subtle">Motivo: {e.reason}</p>}
                  {edit && <form action={removeBrandRow.bind(null, tenant, "exemplos", e.id)} className="mt-2"><button className={`${btnGhost} -ml-2`}><Trash2 className="size-4" aria-hidden /> Remover</button></form>}
                </li>
              ))}
            </ul>
            {edit && (
              <form action={addExample.bind(null, tenant)} className={`${card} grid gap-3 p-4 sm:grid-cols-2`}>
                <Field label="Avaliação">
                  <select name="verdict" className={input}><option value="aprovado">Aprovado</option><option value="reprovado">Reprovado</option></select>
                </Field>
                <Field label="Formato">
                  <select name="format" defaultValue="" className={input}><option value="">—</option>{Object.entries(ITEM_FORMAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </Field>
                <div className="sm:col-span-2"><Field label="Texto da peça"><textarea name="content" required rows={4} className={textarea} /></Field></div>
                <div className="sm:col-span-2"><Field label="Por quê"><input name="reason" className={input} /></Field></div>
                <div className="flex justify-end sm:col-span-2"><button className={btnSecondary}><Plus className="size-4" aria-hidden /> Adicionar exemplo</button></div>
              </form>
            )}
          </section>
        )}

        {tab === "testar" && (
          <section className={`${card} p-4`}>
            <h2 className="text-heading font-semibold">Guardião de marca</h2>
            <p className="mb-4 text-caption text-ink-subtle">Cole um texto para checar contra as regras da marca e, com IA ligada, receber uma revisão.</p>
            <BrandTester action={checkBrandText.bind(null, tenant)} />
          </section>
        )}
      </div>
    </div>
  );
}

function ColorInput({ name, label, value }: { name: string; label: string; value: string }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#555555";
  return (
    <label className="flex items-center gap-2">
      <input type="color" name={name} defaultValue={safe} className="h-9 w-12 cursor-pointer rounded-sm border border-line-strong bg-surface" />
      <span className="text-body">{label}<span className="block text-caption text-ink-subtle tabular">{safe}</span></span>
    </label>
  );
}

function List({ items, empty, remove, form }: {
  items: { id: string; title: string; body: string[] }[];
  empty: string;
  remove?: (id: string) => () => Promise<void>;
  form: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.length === 0 && <li className={`${card} p-4 text-body text-ink-muted`}>{empty}</li>}
        {items.map((it) => (
          <li key={it.id} className={`${card} p-4`}>
            <p className="font-semibold">{it.title}</p>
            {it.body.map((b, i) => <p key={i} className="text-body text-ink-muted">{b}</p>)}
            {remove && <form action={remove(it.id)} className="mt-2"><button className={`${btnGhost} -ml-2`}><Trash2 className="size-4" aria-hidden /> Remover</button></form>}
          </li>
        ))}
      </ul>
      {form && <div className={`${card} p-4`}>{form}</div>}
    </section>
  );
}
