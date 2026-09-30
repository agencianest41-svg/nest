import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canSeal } from "./crypto";

// Conexão com a Meta pelo Login do Facebook: quem administra as páginas das
// lojas autoriza uma vez e a NEST recebe as contas do Instagram ligadas a elas.
// Precisa de META_APP_ID, META_APP_SECRET, INTEGRATIONS_KEY e SUPABASE_SECRET_KEY.

const VERSION = process.env.META_GRAPH_VERSION || "v24.0";

// Publicar, ler insights e listar as páginas (inclusive as do Gerenciador de Negócios).
export const META_STATE_COOKIE = "nest_meta_oauth";

export const META_SCOPES = [
  "pages_show_list", "pages_read_engagement", "read_insights", "business_management",
  "instagram_basic", "instagram_manage_insights", "instagram_content_publish",
];

export type MetaAccount = {
  ig_id: string;
  username: string;
  name: string | null;
  picture: string | null;
  followers: number | null;
  page_id: string;
  page_name: string;
};

/** config da linha da marca (provider meta, operation_id nulo). */
export type MetaConfig = {
  test_mode?: boolean;
  publishing?: boolean;
  meta_user?: { id: string; name: string };
  accounts?: MetaAccount[];
  official_ig_id?: string | null;
  connected_at?: string;
  expires_at?: string | null;
  /** Última sincronização de insights: erro que parou a conta ou quantos posts vieram. */
  last_error?: string | null;
  last_posts?: number;
};

/** O que vai cifrado para private.integration_secrets. */
export type MetaSecret = { user_token: string; pages: Record<string, string> };

export class MetaError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
  }
}

/** Variáveis que faltam para o botão Conectar funcionar (vazio = pronto). */
export function metaMissing() {
  const missing: string[] = [];
  if (!process.env.META_APP_ID) missing.push("META_APP_ID");
  if (!process.env.META_APP_SECRET) missing.push("META_APP_SECRET");
  if (!canSeal()) missing.push("INTEGRATIONS_KEY");
  if (!process.env.SUPABASE_SECRET_KEY) missing.push("SUPABASE_SECRET_KEY");
  return missing;
}

export function metaAuthUrl(redirectUri: string, state: string) {
  const url = new URL(`https://www.facebook.com/${VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  // Login do Facebook para Empresas usa uma configuração pronta no painel da Meta.
  if (process.env.META_CONFIG_ID) url.searchParams.set("config_id", process.env.META_CONFIG_ID);
  else url.searchParams.set("scope", META_SCOPES.join(","));
  return url.toString();
}

// Prova de que a chamada vem do servidor do app (recomendado pela Meta).
const proof = (token: string) => createHmac("sha256", process.env.META_APP_SECRET!).update(token).digest("hex");

export async function graph<T>(url: URL | string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new MetaError(body?.error?.message ?? `HTTP ${res.status}`, body?.error?.code);
  return body as T;
}

export function endpoint(path: string, params: Record<string, string>, token?: string) {
  const url = new URL(`https://graph.facebook.com/${VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (token) {
    url.searchParams.set("access_token", token);
    url.searchParams.set("appsecret_proof", proof(token));
  }
  return url;
}

/** Troca o code do login por um token de usuário de longa duração (~60 dias). */
export async function exchangeCode(code: string, redirectUri: string) {
  const app = { client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET! };
  const short = await graph<{ access_token: string }>(endpoint("oauth/access_token", { ...app, redirect_uri: redirectUri, code }));
  const long = await graph<{ access_token: string; expires_in?: number }>(
    endpoint("oauth/access_token", { ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token }),
  );
  return {
    token: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
  };
}

type PageRow = {
  id: string;
  name: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string; followers_count?: number };
};

/** Quem conectou + páginas liberadas e as contas do Instagram de cada uma. */
export async function loadAccounts(userToken: string) {
  const me = await graph<{ id: string; name: string }>(endpoint("me", { fields: "id,name" }, userToken));
  const pages: PageRow[] = [];
  let next: string | null = endpoint("me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}",
    limit: "100",
  }, userToken).toString();
  // Redes grandes: segue a paginação (até 1.000 páginas).
  for (let i = 0; next && i < 10; i++) {
    const res: { data: PageRow[]; paging?: { next?: string } } = await graph(next);
    pages.push(...res.data);
    next = res.paging?.next ?? null;
  }
  const accounts: MetaAccount[] = pages.flatMap((p) => {
    const ig = p.instagram_business_account;
    if (!ig?.username) return [];
    return [{
      ig_id: ig.id, username: ig.username, name: ig.name ?? null, picture: ig.profile_picture_url ?? null,
      followers: ig.followers_count ?? null, page_id: p.id, page_name: p.name,
    }];
  });
  const pageTokens = Object.fromEntries(pages.filter((p) => p.access_token).map((p) => [p.id, p.access_token!]));
  return { user: { id: me.id, name: me.name }, accounts, pageTokens };
}

/** Tira a permissão do app na conta de quem conectou (melhor esforço). */
export async function revokeAccess(userId: string, userToken: string) {
  await graph(endpoint(`${userId}/permissions`, {}, userToken), { method: "DELETE" }).catch(() => null);
}

/** Dias até a autorização vencer (null = sem prazo conhecido). */
export function daysUntilExpiry(config: MetaConfig) {
  return config.expires_at ? Math.ceil((Date.parse(config.expires_at) - Date.now()) / 86_400_000) : null;
}

export const normalizeHandle = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/^@/, "").replace(/\/.*$/, "");

/**
 * Regrava as linhas por loja: conta do Instagram → operação.
 * mapping: ig_id → operation_id; contas sem loja ficam só na linha da marca.
 */
export async function writeOperationLinks(
  supabase: SupabaseClient, tenantId: string, accounts: MetaAccount[], mapping: Map<string, string>,
) {
  const { error: delError } = await supabase.from("integrations").delete()
    .eq("tenant_id", tenantId).eq("provider", "meta").not("operation_id", "is", null);
  if (delError) return delError;
  const rows = accounts.flatMap((a) => {
    const op = mapping.get(a.ig_id);
    return op ? [{
      tenant_id: tenantId, operation_id: op, provider: "meta", status: "conectado",
      account_label: `@${a.username}`, config: { ig_user_id: a.ig_id, username: a.username, page_id: a.page_id },
    }] : [];
  });
  if (!rows.length) return null;
  const { error } = await supabase.from("integrations").insert(rows);
  return error;
}
