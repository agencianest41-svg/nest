import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unseal } from "./crypto";
import { MetaError, endpoint, graph, type MetaConfig, type MetaSecret } from "./meta";

// Sincronização diária: posts dos últimos dias de cada conta ligada a uma loja
// entram em Resultados (um registro por post, regravado a cada rodada).
// Roda com o cliente da secret key: quem chama já autorizou (cron ou Hub/Marca).

const WINDOW_DAYS = 30; // os números de um post ainda crescem nas primeiras semanas
const AUTH_ERRORS = new Set([102, 190]); // token vencido, revogado ou senha trocada

type Media = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
};
type InsightRow = { name: string; values?: { value: number }[]; total_value?: { value: number } };

export type SyncResult = { posts: number; accounts: number; errors: string[] };

const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/** Código do post no link (instagram.com/p/XYZ ou /reel/XYZ): liga o post à peça. */
export function shortcode(url: string | null | undefined) {
  return url?.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

async function insights(mediaId: string, metrics: string[][], token: string) {
  for (const list of metrics) {
    try {
      const res = await graph<{ data: InsightRow[] }>(endpoint(`${mediaId}/insights`, { metric: list.join(",") }, token));
      return Object.fromEntries(res.data.map((m) => [m.name, m.values?.[0]?.value ?? m.total_value?.value ?? 0])) as Record<string, number>;
    } catch (e) {
      // Métrica que não vale para este tipo de post: tenta a lista menor.
      if (e instanceof MetaError && AUTH_ERRORS.has(e.code ?? 0)) throw e;
    }
  }
  return {} as Record<string, number>;
}

async function recentMedia(igId: string, token: string, since: number) {
  const out: Media[] = [];
  let next: string | null = endpoint(`${igId}/media`, {
    fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit: "50",
  }, token).toString();
  for (let i = 0; next && i < 6; i++) {
    const res: { data: Media[]; paging?: { next?: string } } = await graph(next);
    const fresh = res.data.filter((m) => Date.parse(m.timestamp) >= since);
    out.push(...fresh);
    next = fresh.length === res.data.length ? res.paging?.next ?? null : null;
  }
  // Stories só existem pela API enquanto estão no ar (24h).
  const stories = await graph<{ data: Media[] }>(endpoint(`${igId}/stories`, { fields: "id,media_type,media_product_type,permalink,timestamp" }, token))
    .then((r) => r.data.map((m) => ({ ...m, media_product_type: "STORY" })))
    .catch((e) => { if (e instanceof MetaError && AUTH_ERRORS.has(e.code ?? 0)) throw e; return [] as Media[]; });
  return [...out, ...stories];
}

// Em lotes, para não abrir dezenas de conexões de uma vez.
async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

export async function syncMetaInsights(admin: SupabaseClient, tenantId: string): Promise<SyncResult> {
  const result: SyncResult = { posts: 0, accounts: 0, errors: [] };
  const { data: row } = await admin.from("integrations").select("id, status, config")
    .eq("tenant_id", tenantId).eq("provider", "meta").is("operation_id", null).maybeSingle();
  if (!row || (row.status !== "conectado" && row.status !== "erro")) return result;
  const config = (row.config ?? {}) as MetaConfig;

  const { data: sealed } = await admin.rpc("integration_secret_get", { p_integration: row.id });
  if (!sealed) {
    result.errors.push("Token não encontrado: reconecte a Meta.");
    return result;
  }
  const secret = unseal<MetaSecret>(sealed as string);

  const since = Date.now() - WINDOW_DAYS * 86_400_000;
  const [{ data: links }, { data: items }] = await Promise.all([
    admin.from("integrations").select("id, operation_id, config").eq("tenant_id", tenantId).eq("provider", "meta").not("operation_id", "is", null),
    admin.from("plan_items").select("id, published_url, monthly_plans!inner(operation_id)")
      .eq("tenant_id", tenantId).not("published_url", "is", null),
  ]);
  const pieceBy = new Map<string, string>();
  for (const it of (items ?? []) as unknown as { id: string; published_url: string; monthly_plans: { operation_id: string } }[]) {
    const code = shortcode(it.published_url);
    if (code) pieceBy.set(`${it.monthly_plans.operation_id}:${code}`, it.id);
  }

  let authFailed = false;
  const synced: string[] = [];
  for (const link of links ?? []) {
    const cfg = link.config as { ig_user_id?: string; username?: string; page_id?: string };
    if (!cfg.ig_user_id || !link.operation_id) continue;
    const token = (cfg.page_id && secret.pages[cfg.page_id]) || secret.user_token;
    try {
      const media = await recentMedia(cfg.ig_user_id, token, since);
      const rows = await inBatches(media, 5, async (m) => {
        const story = m.media_product_type === "STORY";
        const ins = await insights(m.id, story
          ? [["reach", "views", "replies", "shares"], ["reach"]]
          : [["reach", "saved", "shares", "views"], ["reach", "saved"]], token);
        const code = shortcode(m.permalink);
        return {
          tenant_id: tenantId,
          operation_id: link.operation_id,
          plan_item_id: (code && pieceBy.get(`${link.operation_id}:${code}`)) || null,
          channel: "instagram",
          external_id: m.id,
          published_url: m.permalink?.startsWith("https://") ? m.permalink : null,
          measured_on: day(m.timestamp),
          reach: ins.reach ?? 0,
          impressions: ins.views ?? 0, // "views" substituiu "impressions" na API da Meta
          likes: m.like_count ?? 0,
          comments: (m.comments_count ?? 0) + (ins.replies ?? 0),
          shares: ins.shares ?? 0,
          saves: ins.saved ?? 0,
          notes: story ? "Stories" : (m.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "Post do Instagram",
          source: "integracao",
        };
      });
      if (rows.length) {
        const { error } = await admin.from("result_entries").upsert(rows, { onConflict: "operation_id,channel,external_id" });
        if (error) throw new Error(`gravar: ${error.message}`);
      }
      result.posts += rows.length;
      result.accounts += 1;
      synced.push(link.id);
    } catch (e) {
      if (e instanceof MetaError && AUTH_ERRORS.has(e.code ?? 0)) authFailed = true;
      result.errors.push(`@${cfg.username ?? cfg.ig_user_id}: ${e instanceof Error ? e.message : String(e)}`);
      if (authFailed) break;
    }
  }

  const now = new Date().toISOString();
  if (synced.length) await admin.from("integrations").update({ last_sync_at: now }).in("id", synced);
  await admin.from("integrations").update({
    status: authFailed ? "erro" : "conectado",
    ...(result.accounts ? { last_sync_at: now } : {}),
    config: {
      ...config,
      last_error: authFailed ? "A Meta recusou o acesso (autorização vencida ou removida). Reconecte." : result.errors[0] ?? null,
      last_posts: result.posts,
    },
  }).eq("id", row.id);
  return result;
}
