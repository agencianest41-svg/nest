import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { seal } from "@/lib/integrations/crypto";
import {
  META_STATE_COOKIE, exchangeCode, loadAccounts, metaMissing, normalizeHandle, writeOperationLinks,
  type MetaConfig, type MetaSecret,
} from "@/lib/integrations/meta";

// Volta do Login do Facebook: troca o code pelo token, lista as contas do
// Instagram, guarda o token cifrado e liga cada conta à loja do mesmo @.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const [state, slug] = (request.cookies.get(META_STATE_COOKIE)?.value ?? "").split(".");
  const done = (params: Record<string, string>) => {
    const url = new URL(slug ? `/${slug}/resultados` : "/", origin);
    if (slug) url.searchParams.set("aba", "integracoes");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: META_STATE_COOKIE, path: "/api/integracoes/meta" });
    return res;
  };

  if (!state || !slug || searchParams.get("state") !== state) return done({ erro: "meta_estado" });
  if (searchParams.get("error")) return done({ erro: "meta_negado" });
  const code = searchParams.get("code");
  if (!code) return done({ erro: "meta_estado" });

  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) return done({ erro: "meta_permissao" });
  const admin = createAdminClient();
  if (!admin || metaMissing().length) return done({ erro: "meta_config" });

  try {
    const redirectUri = new URL("/api/integracoes/meta/callback", origin).toString();
    const { token, expiresAt } = await exchangeCode(code, redirectUri);
    const { user, accounts, pageTokens } = await loadAccounts(token);
    const supabase = await createClient();

    const [{ data: row }, { data: links }, { data: ops }] = await Promise.all([
      supabase.from("integrations").select("id, config").eq("tenant_id", ctx.tenant.id).eq("provider", "meta").is("operation_id", null).maybeSingle(),
      supabase.from("integrations").select("operation_id, config").eq("tenant_id", ctx.tenant.id).eq("provider", "meta").not("operation_id", "is", null),
      supabase.from("operations").select("id, instagram").eq("tenant_id", ctx.tenant.id).eq("active", true),
    ]);

    const previous = (row?.config ?? {}) as MetaConfig;
    const ids = new Set(accounts.map((a) => a.ig_id));
    const config: MetaConfig = {
      ...previous,
      meta_user: user,
      accounts,
      official_ig_id: previous.official_ig_id && ids.has(previous.official_ig_id) ? previous.official_ig_id : null,
      connected_at: new Date().toISOString(),
      expires_at: expiresAt,
    };
    const patch = { status: "conectado", account_label: user.name, config };
    const { data: saved, error } = row
      ? await supabase.from("integrations").update(patch).eq("id", row.id).select("id").single()
      : await supabase.from("integrations").insert({ tenant_id: ctx.tenant.id, provider: "meta", ...patch }).select("id").single();
    if (error || !saved) throw new Error(`integrations: ${error?.message}`);

    const secret: MetaSecret = { user_token: token, pages: pageTokens };
    const { error: secretError } = await admin.rpc("integration_secret_put", {
      p_integration: saved.id, p_sealed: seal(secret), p_expires: expiresAt,
    });
    if (secretError) throw new Error(`segredo: ${secretError.message}`);

    // Mantém as ligações feitas antes; o que sobrar liga pelo @ cadastrado na loja.
    const mapping = new Map<string, string>();
    const used = new Set<string>();
    for (const l of links ?? []) {
      const ig = (l.config as { ig_user_id?: string }).ig_user_id;
      if (ig && ids.has(ig) && l.operation_id && !used.has(l.operation_id)) {
        mapping.set(ig, l.operation_id);
        used.add(l.operation_id);
      }
    }
    const byHandle = new Map((ops ?? []).filter((o) => o.instagram).map((o) => [normalizeHandle(o.instagram), o.id]));
    for (const a of accounts) {
      const op = byHandle.get(a.username.toLowerCase());
      if (!mapping.has(a.ig_id) && op && !used.has(op)) {
        mapping.set(a.ig_id, op);
        used.add(op);
      }
    }
    const linkError = await writeOperationLinks(supabase, ctx.tenant.id, accounts, mapping);
    if (linkError) console.error("[meta] ligações:", linkError.message);

    return done({ ok: accounts.length ? "meta" : "meta_vazio" });
  } catch (e) {
    console.error("[meta] conexão:", e instanceof Error ? e.message : e);
    return done({ erro: "meta_falhou" });
  }
}
