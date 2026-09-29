import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Package, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { todayIso } from "@/lib/month";
import { ASSET_KIND, type Asset } from "@/lib/assets";
import { KIND_ICON } from "@/components/asset-icon";
import { Field } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, btnSecondary, card, input, textarea } from "@/components/ui";
import { addToKit, deleteKit, downloadAsset, logCopy, removeFromKit, updateKit } from "../../actions";
import { CopyButton } from "../../copy-button";

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ erro?: string }> };

// Kit de campanha: o pacote que a loja recebe pronto (peças, textos, orientações).
export default async function KitPage({ params, searchParams }: Props) {
  const [{ tenant, id }, { erro }] = await Promise.all([params, searchParams]);
  const ctx = await getTenantContext(tenant);
  const supabase = await createClient();
  const { data: kit } = await supabase.from("kits").select("*").eq("tenant_id", ctx.tenant.id).eq("id", id).maybeSingle();
  if (!kit) notFound();

  const [{ data: links }, { data: events }, { data: available }] = await Promise.all([
    supabase.from("kit_assets").select("position, assets(*)").eq("kit_id", id).order("position"),
    supabase.from("calendar_events").select("id, title").eq("tenant_id", ctx.tenant.id).gte("ends_on", todayIso()).order("starts_on").limit(40),
    ctx.isManager
      ? supabase.from("assets").select("id, title, kind").eq("tenant_id", ctx.tenant.id).eq("archived", false).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
  ]);
  const assets = ((links ?? []) as unknown as { assets: Asset | null }[]).map((l) => l.assets).filter((a): a is Asset => Boolean(a));
  const inKit = new Set(assets.map((a) => a.id));
  const event = kit.calendar_event_id ? (events ?? []).find((e) => e.id === kit.calendar_event_id) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/${tenant}/ativos?aba=kits`} className={`${btnGhost} -ml-2`}><ArrowLeft className="size-4" aria-hidden /> Kits</Link>
      <header className="mt-2">
        <p className="label flex items-center gap-1 text-ink-subtle"><Package className="size-3.5" aria-hidden /> Kit de campanha{event && ` · ${event.title}`}</p>
        <h1 className="font-display text-page">{kit.title}</h1>
        {!kit.published && <StatusBadge label="Rascunho: a rede ainda não vê" tone="warning" />}
        {kit.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-body text-ink-muted">{kit.description}</p>}
      </header>
      {erro && <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">Não foi possível salvar.</p>}

      <ul className={`${card} mt-6`}>
        {assets.length === 0 && <li className="p-6 text-body text-ink-muted">Kit vazio.</li>}
        {assets.map((a) => {
          const Icon = KIND_ICON[a.kind];
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <Icon className="size-5 text-ink-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                <Link href={`/${tenant}/ativos/${a.id}`} className="font-semibold hover:text-brand">{a.title}</Link>
                <p className="text-caption text-ink-subtle">{ASSET_KIND[a.kind]}{a.description && ` · ${a.description.slice(0, 90)}`}</p>
              </div>
              {a.body && <CopyButton text={a.body} onCopied={logCopy.bind(null, tenant, a.id)} />}
              {(a.storage_path || a.url) && (
                <form action={downloadAsset.bind(null, tenant, a.id)}>
                  <button className={btnSecondary}>{a.storage_path ? <><Download className="size-4" aria-hidden /> Baixar</> : <><ExternalLink className="size-4" aria-hidden /> Abrir</>}</button>
                </form>
              )}
              {ctx.isManager && (
                <form action={removeFromKit.bind(null, tenant, id, a.id)}><button className={btnGhost} aria-label={`Tirar ${a.title} do kit`}><Trash2 className="size-4" /></button></form>
              )}
            </li>
          );
        })}
      </ul>

      {ctx.isManager && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <form action={addToKit.bind(null, tenant, id)} className={`${card} space-y-3 p-4`}>
            <h2 className="text-heading font-semibold">Adicionar ativo</h2>
            <Field label="Ativo">
              <select name="asset_id" required className={input} defaultValue="">
                <option value="" disabled>Escolha</option>
                {(available ?? []).filter((a) => !inKit.has(a.id)).map((a) => <option key={a.id} value={a.id}>{a.title} · {ASSET_KIND[a.kind as Asset["kind"]]}</option>)}
              </select>
            </Field>
            <button className={`${btnSecondary} w-full`}>Adicionar ao kit</button>
            <p className="text-caption text-ink-subtle">Para subir um arquivo novo, crie o ativo em <Link href={`/${tenant}/ativos`} className="font-semibold text-brand">Kits & Ativos</Link>.</p>
          </form>

          <form action={updateKit.bind(null, tenant, id)} className={`${card} space-y-3 p-4`}>
            <h2 className="text-heading font-semibold">Kit</h2>
            <Field label="Nome"><input name="title" required defaultValue={kit.title} className={input} /></Field>
            <Field label="Campanha / data">
              <select name="calendar_event_id" defaultValue={kit.calendar_event_id ?? ""} className={input}>
                <option value="">—</option>
                {(events ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </Field>
            <Field label="Orientação para a rede"><textarea name="description" rows={3} defaultValue={kit.description ?? ""} className={textarea} /></Field>
            <label className="flex items-center gap-2 text-body"><input type="checkbox" name="published" defaultChecked={kit.published} className="size-4 accent-[var(--brand)]" /> Publicado para a rede</label>
            <div className="flex justify-between">
              <button formAction={deleteKit.bind(null, tenant, id)} className={`${btnGhost} text-danger`}><Trash2 className="size-4" aria-hidden /> Excluir kit</button>
              <button className={btnSecondary}>Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
