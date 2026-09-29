"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import type { MemberRole } from "@/lib/types";

export type InviteState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; email: string; link: string; existing: boolean };

const ROLES: MemberRole[] = ["hub", "marca", "regional", "lojista"];

export async function inviteMember(slug: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) return { status: "error", message: "Só Hub e Marca convidam pessoas." };

  const admin = createAdminClient();
  if (!admin) return { status: "error", message: "Convites ainda não configurados no servidor (SUPABASE_SECRET_KEY)." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role")) as MemberRole;
  const regionId = String(formData.get("region_id") ?? "") || null;
  const operationId = String(formData.get("operation_id") ?? "") || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "Informe um e-mail válido." };
  if (!ROLES.includes(role)) return { status: "error", message: "Escolha um perfil." };
  if (role === "hub" && !ctx.isPlatformAdmin && !ctx.memberships.some((m) => m.role === "hub")) {
    return { status: "error", message: "Só a equipe Hub pode convidar estrategistas Hub." };
  }
  if (role === "regional" && !regionId) return { status: "error", message: "Escolha a região do gestor." };
  if (role === "lojista" && !operationId) return { status: "error", message: "Escolha a operação do lojista." };

  // Região/operação precisam ser deste tenant: a leitura com o cliente do
  // usuário (RLS) confirma que ele enxerga o que está atribuindo.
  const supabase = await createClient();
  if (regionId) {
    const { data } = await supabase.from("regions").select("id").eq("tenant_id", ctx.tenant.id).eq("id", regionId).maybeSingle();
    if (!data) return { status: "error", message: "Região inválida." };
  }
  if (operationId) {
    const { data } = await supabase.from("operations").select("id").eq("tenant_id", ctx.tenant.id).eq("id", operationId).maybeSingle();
    if (!data) return { status: "error", message: "Operação inválida." };
  }

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;

  // Convite cria a conta; se a pessoa já existe, gera um link de acesso.
  let existing = false;
  let res = await admin.auth.admin.generateLink({ type: "invite", email });
  if (res.error?.code === "email_exists" || res.error?.status === 422) {
    existing = true;
    res = await admin.auth.admin.generateLink({ type: "magiclink", email });
  }
  if (res.error || !res.data.user) {
    console.error("[equipe] generateLink:", res.error?.status, res.error?.code, res.error?.message);
    return { status: "error", message: "Não foi possível gerar o convite." };
  }

  const { error } = await admin.from("memberships").insert({
    tenant_id: ctx.tenant.id,
    user_id: res.data.user.id,
    role,
    region_id: role === "regional" ? regionId : null,
    operation_id: role === "lojista" ? operationId : null,
  });
  if (error && error.code !== "23505") {
    console.error("[equipe] membership:", error.code, error.message);
    return { status: "error", message: "Não foi possível vincular o perfil." };
  }

  const type = existing ? "magiclink" : "invite";
  const link = `${origin}/auth/confirm?token_hash=${res.data.properties.hashed_token}&type=${type}`;
  revalidatePath(`/${slug}/equipe`);
  return { status: "ok", email, link, existing };
}

export async function removeMember(slug: string, formData: FormData) {
  const ctx = await getTenantContext(slug);
  if (!ctx.isManager) return;
  const supabase = await createClient();
  await supabase.from("memberships").delete()
    .eq("id", String(formData.get("id"))).eq("tenant_id", ctx.tenant.id);
  revalidatePath(`/${slug}/equipe`);
}
