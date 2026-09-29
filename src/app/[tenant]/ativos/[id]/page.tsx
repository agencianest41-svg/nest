import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, GitBranch, Share2, ShieldCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { formatDateTime, formatDay, todayIso } from "@/lib/month";
import { displayName, loadProfiles } from "@/lib/people";
import { ASSET_KIND, formatBytes, rightsStatus, type Asset, type AssetRight } from "@/lib/assets";
import { KIND_ICON } from "@/components/asset-icon";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnPrimary, btnSecondary, card, input, textarea } from "@/components/ui";
import {
  addRight, createAsset, deleteAsset, deleteRight, downloadAsset, logCopy, shareAsset, unshareAsset, updateAsset,
} from "../actions";
import { AssetForm } from "../asset-form";
import { CopyButton } from "../copy-button";

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ erro?: string }> };

const ERRORS: Record<string, string> = {
  dados: "Confira os campos.", salvar: "Não foi possível salvar.",
  direito: "Download bloqueado: o direito de uso deste ativo venceu. Fale com a marca.",
};

const USE_LABEL: Record<string, string> = { download: "downloads", copia: "cópias", reuso: "reaproveitamentos", derivacao: "versões derivadas" };

export default async function AtivoPage({ params, searchParams }: Props) {
  const [{ tenant, id }, { erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const supabase = await createClient();
  const today = todayIso();

  const { data: row } = await supabase.from("assets").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const asset = row as Asset;
  const own = asset.tenant_id === ctx.tenant.id;
  const canEdit = own && (ctx.isManager || (asset.created_by === ctx.userId && Boolean(asset.operation_id)));

  const [{ data: rights }, { data: children }, { data: parent }, { data: kits }, { data: uses }, { data: shares }, { data: targets }, { data: operations }, { data: events }, preview] = await Promise.all([
    // Direitos do próprio ativo e do original (versões e reaproveitamentos herdam).
    supabase.from("asset_rights").select("*").in("asset_id", [id, asset.parent_asset_id].filter(Boolean) as string[]).order("valid_until"),
    supabase.from("assets").select("id, title, tenant_id, operation_id, created_at").eq("parent_asset_id", id).order("created_at"),
    asset.parent_asset_id ? supabase.from("assets").select("id, title, tenant_id").eq("id", asset.parent_asset_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("kit_assets").select("kits(id, title)").eq("asset_id", id),
    ctx.isManager ? supabase.from("asset_uses").select("action, operation_id, created_at").eq("asset_id", id) : Promise.resolve({ data: [] }),
    ctx.isManager && own ? supabase.from("asset_shares").select("id, to_tenant_id, license, allow_derivatives, expires_on, tenants!asset_shares_to_tenant_id_fkey(name)").eq("asset_id", id) : Promise.resolve({ data: [] }),
    ctx.isManager && own ? supabase.rpc("share_targets", { p_tenant: ctx.tenant.id }) : Promise.resolve({ data: [] }),
    supabase.from("operations").select("id, name").eq("tenant_id", ctx.tenant.id).eq("active", true).order("name"),
    supabase.from("calendar_events").select("id, title").eq("tenant_id", ctx.tenant.id).gte("ends_on", today).order("starts_on").limit(40),
    asset.storage_path && ["imagem", "video", "audio"].includes(asset.kind)
      ? supabase.storage.from("assets").createSignedUrl(asset.storage_path, 600).then((r) => r.data?.signedUrl ?? null)
      : Promise.resolve(null),
  ]);
  const rightsList = (rights ?? []) as AssetRight[];
  const rs = rightsStatus(rightsList, today);
  const people = await loadProfiles(supabase, [asset.created_by]);
  const Icon = KIND_ICON[asset.kind];
  const useCounts = new Map<string, number>();
  for (const u of uses ?? []) useCounts.set(u.action, (useCounts.get(u.action) ?? 0) + 1);
  const opName = new Map((operations ?? []).map((o) => [o.id, o.name]));

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/${tenant}/ativos`} className={`${btnGhost} -ml-2`}><ArrowLeft className="size-4" aria-hidden /> Kits & Ativos</Link>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-ink-subtle">{ASSET_KIND[asset.kind]}{asset.operation_id && ` · ${opName.get(asset.operation_id) ?? "Operação"}`}</p>
          <h1 className="font-display text-page">{asset.title}</h1>
          <div className="mt-1 flex flex-wrap gap-1">
            {asset.official && <StatusBadge label="Oficial da marca" tone="brand" />}
            {asset.origin_tenant_id && <StatusBadge label="Reaproveitado de outra marca" tone="neutral" />}
            {rs && <StatusBadge label={rs.label} tone={rs.tone} />}
            {!own && <StatusBadge label="Compartilhado com você" tone="info" />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {asset.body && <CopyButton text={asset.body} onCopied={logCopy.bind(null, tenant, id)} />}
          {(asset.storage_path || asset.url) && (
            <form action={downloadAsset.bind(null, tenant, id)}>
              <button className={btnPrimary}>
                {asset.storage_path ? <Download className="size-4" aria-hidden /> : <ExternalLink className="size-4" aria-hidden />}
                {asset.storage_path ? "Baixar" : "Abrir link"}
              </button>
            </form>
          )}
        </div>
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className={`${card} overflow-hidden`}>
            <div className="grid min-h-48 place-items-center bg-canvas">
              {preview && asset.kind === "imagem" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt={asset.title} className="max-h-[480px] w-auto" />
              )}
              {preview && asset.kind === "video" && <video src={preview} controls className="max-h-[480px] w-full" />}
              {preview && asset.kind === "audio" && <audio src={preview} controls className="w-full p-4" />}
              {!preview && asset.body && <p className="w-full whitespace-pre-line p-4 text-body">{asset.body}</p>}
              {!preview && !asset.body && <Icon className="size-10 text-ink-subtle" aria-hidden />}
            </div>
            <div className="border-t border-line p-4 text-body">
              {asset.description && <p className="whitespace-pre-line text-ink-muted">{asset.description}</p>}
              <p className="mt-2 text-caption text-ink-subtle">
                Criado por {displayName(people.get(asset.created_by ?? ""))} em {formatDateTime(asset.created_at)}
                {asset.size_bytes ? ` · ${formatBytes(asset.size_bytes)}` : ""}
                {asset.tags.length > 0 && ` · ${asset.tags.join(", ")}`}
              </p>
            </div>
          </section>

          <section className={card}>
            <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-heading font-semibold"><GitBranch className="size-4" aria-hidden /> Origem e versões</h2>
            <div className="space-y-2 p-4 text-body">
              {parent ? (
                <p>Veio de: {parent.tenant_id === ctx.tenant.id
                  ? <Link href={`/${tenant}/ativos/${parent.id}`} className="font-semibold text-brand">{parent.title}</Link>
                  : <span className="font-semibold">{parent.title}</span>}{parent.tenant_id !== ctx.tenant.id && " (outra marca)"}</p>
              ) : <p className="text-ink-muted">Ativo original.</p>}
              {(children ?? []).length > 0 && (
                <div>
                  <p className="label mt-2 text-ink-muted">Versões derivadas</p>
                  <ul className="mt-1 space-y-1">
                    {(children ?? []).map((c) => (
                      <li key={c.id}>
                        {c.tenant_id === ctx.tenant.id
                          ? <Link href={`/${tenant}/ativos/${c.id}`} className="font-semibold hover:text-brand">{c.title}</Link>
                          : <span className="font-semibold">{c.title} <span className="font-normal text-ink-subtle">(outra marca)</span></span>}
                        <span className="text-caption text-ink-subtle"> · {c.operation_id ? opName.get(c.operation_id) ?? "Operação" : "Rede"} · {formatDay(c.created_at.slice(0, 10))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(kits ?? []).length > 0 && (
                <p className="text-caption text-ink-subtle">Nos kits: {(kits as unknown as { kits: { id: string; title: string } | null }[]).map((k) => k.kits?.title).filter(Boolean).join(", ")}</p>
              )}
              {ctx.isManager && useCounts.size > 0 && (
                <p className="text-caption text-ink-subtle">Uso: {[...useCounts].map(([k, v]) => `${v} ${USE_LABEL[k] ?? k}`).join(" · ")}</p>
              )}
            </div>
            {own && (
              <details className="border-t border-line">
                <summary className="cursor-pointer list-none px-4 py-3 text-body font-semibold text-brand">Criar versão derivada (adaptação local, outro formato…)</summary>
                <div className="border-t border-line p-4">
                  <AssetForm tenantId={ctx.tenant.id} action={createAsset.bind(null, tenant)} isManager={ctx.isManager}
                    operations={operations ?? []} events={events ?? []} parentId={id} submitLabel="Salvar versão" />
                </div>
              </details>
            )}
          </section>

          {canEdit && (
            <form action={updateAsset.bind(null, tenant, id)} className={`${card} grid gap-3 p-4 sm:grid-cols-2`}>
              <h2 className="text-heading font-semibold sm:col-span-2">Editar</h2>
              <div className="sm:col-span-2"><Field label="Título"><input name="title" required defaultValue={asset.title} className={input} /></Field></div>
              <div className="sm:col-span-2"><Field label="Descrição / como usar"><textarea name="description" rows={2} defaultValue={asset.description ?? ""} className={textarea} /></Field></div>
              {asset.kind === "texto" && <div className="sm:col-span-2"><Field label="Texto"><textarea name="body" rows={5} defaultValue={asset.body ?? ""} className={textarea} /></Field></div>}
              <Field label="Tags"><input name="tags" defaultValue={asset.tags.join(", ")} className={input} /></Field>
              <Field label="Campanha / data">
                <select name="calendar_event_id" defaultValue={asset.calendar_event_id ?? ""} className={input}>
                  <option value="">—</option>
                  {(events ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              </Field>
              {ctx.isManager && (
                <div className="flex flex-wrap gap-4 sm:col-span-2">
                  <label className="flex items-center gap-2 text-body"><input type="checkbox" name="official" defaultChecked={asset.official} className="size-4 accent-[var(--brand)]" /> Oficial</label>
                  <label className="flex items-center gap-2 text-body"><input type="checkbox" name="archived" defaultChecked={asset.archived} className="size-4 accent-[var(--brand)]" /> Arquivado</label>
                </div>
              )}
              <div className="flex justify-between sm:col-span-2">
                <button formAction={deleteAsset.bind(null, tenant, id)} className={`${btnGhost} text-danger`}><Trash2 className="size-4" aria-hidden /> Excluir</button>
                <button className={btnSecondary}>Salvar</button>
              </div>
            </form>
          )}
        </div>

        <aside className="space-y-6">
          <section className={card}>
            <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-heading font-semibold"><ShieldCheck className="size-4" aria-hidden /> Direitos de uso</h2>
            {rightsList.length === 0 ? (
              <p className="px-4 py-3 text-body text-ink-muted">Nenhum direito cadastrado (uso livre da marca).</p>
            ) : (
              <ul>
                {rightsList.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 border-b border-line px-4 py-2.5 last:border-0">
                    <div className="min-w-0 flex-1 text-body">
                      <p className="font-semibold">{r.holder} <span className="font-normal text-ink-subtle">· {r.kind}</span></p>
                      <p className={`text-caption ${r.valid_until && r.valid_until < today ? "font-semibold text-danger" : "text-ink-subtle"}`}>
                        {r.valid_from ? formatDay(r.valid_from) : "—"} até {r.valid_until ? formatDay(r.valid_until) : "sem prazo"}{r.territory && ` · ${r.territory}`}
                      </p>
                      {r.notes && <p className="text-caption text-ink-muted">{r.notes}</p>}
                    </div>
                    {ctx.isManager && own && r.asset_id === id && (
                      <form action={deleteRight.bind(null, tenant, id, r.id)}><button className={btnGhost} aria-label="Remover direito"><Trash2 className="size-4" /></button></form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {ctx.isManager && own && (
              <form action={addRight.bind(null, tenant, id)} className="grid grid-cols-2 gap-2 border-t border-line bg-canvas p-3">
                <div className="col-span-2"><Field label="Titular"><input name="holder" required className={input} placeholder="Modelo, fotógrafo, trilha…" /></Field></div>
                <Field label="Tipo"><input name="kind" defaultValue="imagem" className={input} /></Field>
                <Field label="Território"><input name="territory" className={input} placeholder="Brasil" /></Field>
                <Field label="De"><input type="date" name="valid_from" className={input} /></Field>
                <Field label="Até"><input type="date" name="valid_until" className={input} /></Field>
                <div className="col-span-2"><button className={`${btnSecondary} w-full`}>Adicionar direito</button></div>
              </form>
            )}
          </section>

          {ctx.isManager && own && (
            <section className={card}>
              <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-heading font-semibold"><Share2 className="size-4" aria-hidden /> Compartilhar com outra marca</h2>
              {(shares ?? []).length > 0 && (
                <ul>
                  {(shares as unknown as { id: string; license: string; expires_on: string | null; tenants: { name: string } | null }[]).map((s) => (
                    <li key={s.id} className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-body">
                      <span className="min-w-0 flex-1"><span className="font-semibold">{s.tenants?.name}</span>
                        <span className="block text-caption text-ink-subtle">{s.license}{s.expires_on && ` · até ${formatDay(s.expires_on)}`}</span></span>
                      <form action={unshareAsset.bind(null, tenant, id, s.id)}><button className={btnGhost} aria-label="Remover compartilhamento"><Trash2 className="size-4" /></button></form>
                    </li>
                  ))}
                </ul>
              )}
              {(targets ?? []).length === 0 ? (
                <p className="px-4 py-3 text-caption text-ink-subtle">Você só pode compartilhar com marcas em que também atua como Hub ou Marca.</p>
              ) : (
                <form action={shareAsset.bind(null, tenant, id)} className="space-y-2 p-3">
                  <Field label="Marca">
                    <select name="to_tenant_id" required className={input}>
                      {(targets as { id: string; name: string }[]).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Licença"><input name="license" defaultValue="Uso interno" className={input} /></Field>
                  <Field label="Válido até"><input type="date" name="expires_on" className={input} /></Field>
                  <label className="flex items-center gap-2 text-body"><input type="checkbox" name="allow_derivatives" defaultChecked className="size-4 accent-[var(--brand)]" /> Permite adaptações</label>
                  <button className={`${btnSecondary} w-full`}>Compartilhar</button>
                </form>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
