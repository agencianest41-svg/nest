"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getDeskContext } from "@/lib/staff";
import { slugify } from "@/lib/format";
import { deriveTheme, isHex } from "@/lib/theme";
import type { MemberRole } from "@/lib/types";

export type BrandState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; slug: string; name: string; invite: { email: string; link: string } | null };

const FIRST_ROLES: MemberRole[] = ["hub", "marca"];

// Regiões: uma por linha ou separadas por vírgula; o código vem das iniciais.
function parseRegions(raw: string) {
  const names = [...new Set(raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
  const used = new Set<string>();
  return names.map((name) => {
    const base = slugify(name).split("-").map((w) => w[0]).join("").toUpperCase().slice(0, 4) || "R";
    let code = base;
    for (let i = 2; used.has(code); i++) code = `${base}${i}`;
    used.add(code);
    return { code, name };
  });
}

// Só o admin NEST cria marcas (a RLS de tenants e tenant_themes também exige).
export async function createBrand(_prev: BrandState, formData: FormData): Promise<BrandState> {
  const ctx = await getDeskContext();
  if (!ctx.isAdmin) return { status: "error", message: "Só o admin NEST cria marcas." };

  const name = String(formData.get("name") ?? "").trim();
  const slug = slugify(String(formData.get("slug") ?? "") || name);
  const brand = String(formData.get("brand") ?? "");
  const accent = String(formData.get("accent") ?? "");
  const regions = parseRegions(String(formData.get("regions") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "marca") as MemberRole;

  if (!name) return { status: "error", message: "Informe o nome da marca." };
  if (!slug) return { status: "error", message: "Informe um endereço com letras ou números." };
  if (!isHex(brand) || !isHex(accent)) return { status: "error", message: "Escolha as duas cores da marca." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "Informe um e-mail válido ou deixe em branco." };
  if (email && !FIRST_ROLES.includes(role)) return { status: "error", message: "Escolha o perfil da primeira pessoa." };

  const admin = email ? createAdminClient() : null;
  if (email && !admin) return { status: "error", message: "Convites desativados: falta a SUPABASE_SECRET_KEY no servidor." };

  const supabase = await createClient();
  const { data: tenant, error } = await supabase.from("tenants").insert({ slug, name }).select("id").single();
  if (error?.code === "23505") return { status: "error", message: `O endereço /${slug} já está em uso.` };
  if (error || !tenant) {
    console.error("[marcas] tenant:", error?.code, error?.message);
    return { status: "error", message: "Não foi possível criar a marca." };
  }

  const { error: themeError } = await supabase.from("tenant_themes").insert({ tenant_id: tenant.id, ...deriveTheme(brand, accent) });
  const { error: regionError } = regions.length
    ? await supabase.from("regions").insert(regions.map((r) => ({ tenant_id: tenant.id, ...r })))
    : { error: null };
  if (themeError || regionError) {
    console.error("[marcas] setup:", themeError?.message, regionError?.message);
    await supabase.from("tenants").delete().eq("id", tenant.id);
    return { status: "error", message: "Não foi possível salvar o tema ou as regiões." };
  }

  revalidatePath("/", "layout");
  if (!email || !admin) return { status: "ok", slug, name, invite: null };

  // Primeira pessoa: convite cria a conta; se já existe, gera um link de acesso.
  let type: "invite" | "magiclink" = "invite";
  let res = await admin.auth.admin.generateLink({ type: "invite", email });
  if (res.error?.code === "email_exists" || res.error?.status === 422) {
    type = "magiclink";
    res = await admin.auth.admin.generateLink({ type: "magiclink", email });
  }
  if (res.error || !res.data.user) {
    console.error("[marcas] generateLink:", res.error?.status, res.error?.code, res.error?.message);
    return { status: "error", message: `Marca criada, mas o convite falhou. Convide pela Equipe de /${slug}.` };
  }
  const { error: memberError } = await admin.from("memberships").insert({ tenant_id: tenant.id, user_id: res.data.user.id, role });
  if (memberError && memberError.code !== "23505") {
    console.error("[marcas] membership:", memberError.code, memberError.message);
    return { status: "error", message: `Marca criada, mas não foi possível vincular ${email}. Convide pela Equipe de /${slug}.` };
  }

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  return { status: "ok", slug, name, invite: { email, link: `${origin}/auth/confirm?token_hash=${res.data.properties.hashed_token}&type=${type}` } };
}
