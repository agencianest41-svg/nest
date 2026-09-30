import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { META_STATE_COOKIE, metaAuthUrl, metaMissing } from "@/lib/integrations/meta";

// Início do Login do Facebook: guarda um "state" num cookie e manda para a Meta.
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("t") ?? "";
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  const ctx = await getTenantContext(slug);
  const back = new URL(`/${slug}/resultados?aba=integracoes`, request.nextUrl.origin);
  if (!ctx.isManager) {
    back.searchParams.set("erro", "meta_permissao");
    return NextResponse.redirect(back);
  }
  if (metaMissing().length) {
    back.searchParams.set("erro", "meta_config");
    return NextResponse.redirect(back);
  }

  const state = randomBytes(24).toString("base64url");
  const redirectUri = new URL("/api/integracoes/meta/callback", request.nextUrl.origin).toString();
  const res = NextResponse.redirect(metaAuthUrl(redirectUri, state));
  res.cookies.set(META_STATE_COOKIE, `${state}.${slug}`, {
    httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax",
    path: "/api/integracoes/meta", maxAge: 600,
  });
  return res;
}
