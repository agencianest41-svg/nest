import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, Tenant, TenantTheme } from "@/lib/types";

export type Membership = { role: MemberRole; region_id: string | null; operation_id: string | null };

export type TenantContext = {
  tenant: Tenant;
  theme: TenantTheme | null;
  userId: string;
  email: string | undefined;
  memberships: Membership[];
  isPlatformAdmin: boolean;
  /** Hub, marca ou admin: vê e gerencia a rede inteira. */
  isManager: boolean;
  /** Equipe interna (Hub) ou admin: vê o que é interno (horas, custos, IA). */
  isHub: boolean;
  roles: MemberRole[];
};

// Resolve tenant + perfil uma vez por request; RLS continua sendo a barreira real.
export const getTenantContext = cache(async (slug: string): Promise<TenantContext> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id, slug, name").eq("slug", slug).maybeSingle();
  if (!tenant) notFound();

  const [{ data: theme }, { data: memberships }, { data: admin }] = await Promise.all([
    supabase.from("tenant_themes").select("*").eq("tenant_id", tenant.id).maybeSingle(),
    supabase.from("memberships").select("role, region_id, operation_id")
      .eq("tenant_id", tenant.id).eq("user_id", auth.user.id),
    supabase.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
  ]);

  const list = (memberships ?? []) as Membership[];
  const isPlatformAdmin = Boolean(admin);
  return {
    tenant,
    theme,
    userId: auth.user.id,
    email: auth.user.email,
    memberships: list,
    isPlatformAdmin,
    isManager: isPlatformAdmin || list.some((m) => m.role === "hub" || m.role === "marca"),
    isHub: isPlatformAdmin || list.some((m) => m.role === "hub"),
    roles: [...new Set(list.map((m) => m.role))],
  };
});
