import Link from "next/link";
import { AlertTriangle, FolderOpen, Package, Search, Share2 } from "lucide-react";
import { KIND_ICON } from "@/components/asset-icon";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatDay, todayIso } from "@/lib/month";
import { ASSET_KIND, rightsStatus, type Asset, type AssetRight } from "@/lib/assets";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import { createAsset, createKit, reuseAsset } from "./actions";
import { AssetForm } from "./asset-form";
import { SubTabs } from "@/components/sub-tabs";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ aba?: string; tipo?: string; q?: string; erro?: string }> };

const ERRORS: Record<string, string> = {
  dados: "Confira os campos.", salvar: "Não foi possível salvar.", permissao: "Só Hub e Marca fazem isso.", acesso: "Ativo indisponível.",
};

export default async function AtivosPage({ params, searchParams }: Props) {
  const [{ tenant }, { aba = "ativos", tipo, q, erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const supabase = await createClient();
  const today = todayIso();

  let query = supabase.from("assets").select("*").eq("archived", false).order("created_at", { ascending: false }).limit(200);
  query = aba === "recebidos" ? query.neq("tenant_id", ctx.tenant.id) : query.eq("tenant_id", ctx.tenant.id);
  if (tipo && tipo in ASSET_KIND) query = query.eq("kind", tipo);
  const term = q?.replace(/[%,()*{}"\\]/g, " ").trim();
  if (term) {
    const tag = term.toLowerCase().split(/\s+/)[0];
    query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%,tags.cs.{${tag}}`);
  }

  const [{ data: assetRows }, { data: kits }, { data: operations }, { data: events }] = await Promise.all([
    query,
    supabase.from("kits").select("id, title, description, published, calendar_event_id, kit_assets(asset_id)").eq("tenant_id", ctx.tenant.id).order("created_at", { ascending: false }),
    supabase.from("operations").select("id, name").eq("tenant_id", ctx.tenant.id).eq("active", true).order("name"),
    supabase.from("calendar_events").select("id, title").eq("tenant_id", ctx.tenant.id).gte("ends_on", today).order("starts_on").limit(40),
  ]);
  const assets = (assetRows ?? []) as Asset[];
  const ids = assets.map((a) => a.id);
  const [{ data: rights }, thumbs] = await Promise.all([
    ids.length ? supabase.from("asset_rights").select("asset_id, valid_until").in("asset_id", ids) : Promise.resolve({ data: [] }),
    signedThumbs(supabase, assets),
  ]);
  const rightsBy = new Map<string, Pick<AssetRight, "valid_until">[]>();
  for (const r of (rights ?? []) as { asset_id: string; valid_until: string | null }[]) rightsBy.set(r.asset_id, [...(rightsBy.get(r.asset_id) ?? []), r]);

  // Alerta de direitos vencendo (gestão): olha todos os ativos do tenant.
  const { data: dueRights } = ctx.isManager
    ? await supabase.from("asset_rights").select("asset_id, holder, valid_until, assets(title)").eq("tenant_id", ctx.tenant.id)
        .lte("valid_until", new Date(Date.parse(today) + 30 * 86_400_000).toISOString().slice(0, 10)).order("valid_until")
    : { data: [] };

  const tabs = [
    { key: "ativos", label: "Ativos" },
    { key: "kits", label: "Kits de campanha" },
    ...(ctx.isManager ? [{ key: "recebidos", label: "Recebidos de outras marcas" }] : []),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <h1 className="font-display text-page">Kits & ativos</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-muted">
          Peças oficiais, textos prontos para Grupos VIP e o que cada loja produziu, com origem e direitos de uso rastreados.
        </p>
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      {(dueRights ?? []).length > 0 && (
        <section className={`${card} mt-4 border-warning/25 bg-warning/5 p-4`}>
          <h2 className="flex items-center gap-2 text-heading font-semibold"><AlertTriangle className="size-4 text-warning" aria-hidden /> Direitos de uso vencendo</h2>
          <ul className="mt-2 space-y-1 text-body">
            {(dueRights as unknown as { asset_id: string; holder: string; valid_until: string; assets: { title: string } | null }[]).slice(0, 8).map((r, i) => (
              <li key={i}>
                <Link href={`/${tenant}/ativos/${r.asset_id}`} className="font-semibold hover:text-brand">{r.assets?.title ?? "Ativo"}</Link>
                <span className={r.valid_until < today ? "text-danger" : "text-warning"}> · {r.holder} · {r.valid_until < today ? "venceu" : "vence"} {formatDay(r.valid_until)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SubTabs className="mt-6" label="Seções" active={aba} tabs={tabs.map((t) => ({ ...t, href: `/${tenant}/ativos?aba=${t.key}` }))} />

      {aba === "kits" ? (
        <div className={`mt-6 grid items-start gap-6 ${ctx.isManager ? "lg:grid-cols-[1fr_320px]" : ""}`}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {(kits ?? []).length === 0 && <li className={`${card} p-6 text-body text-ink-muted`}>Nenhum kit {ctx.isManager ? "criado" : "publicado"} ainda.</li>}
            {(kits ?? []).map((k) => (
              <li key={k.id}>
                <Link href={`/${tenant}/ativos/kits/${k.id}`} className={`${card} block p-4 hover:bg-brand-soft`}>
                  <p className="flex items-center gap-2 font-semibold"><Package className="size-4 text-brand" aria-hidden /> {k.title}</p>
                  {k.description && <p className="mt-1 text-body text-ink-muted">{k.description}</p>}
                  <p className="mt-2 flex items-center gap-2 text-caption text-ink-subtle">
                    {k.kit_assets.length} ativos
                    {!k.published && <StatusBadge label="Rascunho" tone="neutral" />}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {ctx.isManager && (
            <aside className={`${card} h-fit p-4`}>
              <h2 className="text-heading font-semibold">Novo kit</h2>
              <p className="text-caption text-ink-subtle">Junte as peças de uma campanha. A rede só vê depois de publicado.</p>
              <form action={createKit.bind(null, tenant)} className="mt-4 space-y-3">
                <Field label="Nome do kit"><input name="title" required className={input} placeholder="Ex.: Kit Black Friday 2026" /></Field>
                <Field label="Campanha / data">
                  <select name="calendar_event_id" defaultValue="" className={input}>
                    <option value="">—</option>
                    {(events ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </select>
                </Field>
                <Field label="Orientação para a rede"><textarea name="description" rows={3} className={textarea} /></Field>
                <button className={`${btnPrimary} w-full`}>Criar kit</button>
              </form>
            </aside>
          )}
        </div>
      ) : (
        <div className={`mt-6 grid gap-6 ${aba === "ativos" ? "lg:grid-cols-[1fr_320px]" : ""}`}>
          <section>
            <form className="mb-4 flex flex-wrap gap-2" action={`/${tenant}/ativos`}>
              <input type="hidden" name="aba" value={aba} />
              <label className="relative min-w-48 flex-1">
                <span className="sr-only">Buscar</span>
                <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-ink-subtle" aria-hidden />
                <input name="q" defaultValue={q} placeholder="Buscar por título ou tag" className={`${input} pl-8`} />
              </label>
              <label><span className="sr-only">Tipo</span>
                <select name="tipo" defaultValue={tipo ?? ""} className={input}>
                  <option value="">Todos os tipos</option>
                  {Object.entries(ASSET_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <button className={btnSecondary}>Filtrar</button>
            </form>

            {assets.length === 0 ? (
              <p className={`${card} flex items-center gap-2 p-6 text-body text-ink-muted`}>
                {aba === "recebidos" ? <Share2 className="size-4" aria-hidden /> : <FolderOpen className="size-4" aria-hidden />}
                {aba === "recebidos" ? "Nenhum ativo compartilhado com esta marca." : "Nenhum ativo encontrado."}
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {assets.map((a) => {
                  const Icon = KIND_ICON[a.kind];
                  const rs = rightsStatus(rightsBy.get(a.id) ?? [], today);
                  const thumb = thumbs.get(a.id);
                  return (
                    <li key={a.id} className={`${card} flex flex-col overflow-hidden`}>
                      <Link href={`/${tenant}/ativos/${a.id}`} className="block hover:bg-brand-soft">
                        <div className="grid aspect-video place-items-center overflow-hidden bg-canvas">
                          {thumb
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={thumb} alt="" className="size-full object-cover" />
                            : a.kind === "texto" && a.body
                              ? <p className="line-clamp-4 p-3 text-caption text-ink-muted">{a.body}</p>
                              : <Icon className="size-8 text-ink-subtle" aria-hidden />}
                        </div>
                        <div className="p-3">
                          <p className="font-semibold">{a.title}</p>
                          <p className="text-caption text-ink-subtle">{ASSET_KIND[a.kind]}{a.tags.length > 0 && ` · ${a.tags.slice(0, 3).join(", ")}`}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {a.official && <StatusBadge label="Oficial" tone="brand" />}
                            {a.operation_id && <StatusBadge label="Da loja" tone="info" />}
                            {a.origin_tenant_id && <StatusBadge label="Reaproveitado" tone="neutral" />}
                            {a.parent_asset_id && !a.origin_tenant_id && <StatusBadge label="Derivado" tone="neutral" />}
                            {rs && rs.tone !== "success" && <StatusBadge label={rs.label} tone={rs.tone} />}
                          </div>
                        </div>
                      </Link>
                      {aba === "recebidos" && (
                        <form action={reuseAsset.bind(null, tenant, a.id)} className="mt-auto border-t border-line p-2">
                          <button className={`${btnSecondary} w-full`}>Reaproveitar nesta marca</button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {aba === "ativos" && (
            <aside className={`${card} h-fit p-4`}>
              <h2 className="text-heading font-semibold">Novo ativo</h2>
              <p className="mb-4 text-caption text-ink-subtle">
                {ctx.isManager ? "Marque como oficial para a rede toda ver." : "O que sua loja produziu fica disponível para você e para a marca."}
              </p>
              <AssetForm tenantId={ctx.tenant.id} action={createAsset.bind(null, tenant)} isManager={ctx.isManager}
                operations={operations ?? []} events={events ?? []} />
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

async function signedThumbs(supabase: Awaited<ReturnType<typeof createClient>>, assets: Asset[]) {
  const map = new Map<string, string>();
  const images = assets.filter((a) => a.kind === "imagem" && a.storage_path);
  if (!images.length) return map;
  const { data } = await supabase.storage.from("assets").createSignedUrls(images.map((a) => a.storage_path!), 600);
  for (const s of data ?? []) {
    if (!s.signedUrl || s.error) continue;
    for (const a of images) if (a.storage_path === s.path) map.set(a.id, s.signedUrl);
  }
  return map;
}
