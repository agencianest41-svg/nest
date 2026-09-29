import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/types";

export type DeskContext = {
  userId: string;
  email: string | undefined;
  isAdmin: boolean;
  /** Hub em alguma marca ou admin: vê carteira, horas e custos. */
  isStaff: boolean;
  tenants: { id: string; slug: string; name: string; roles: MemberRole[] }[];
};

// Contexto da área que atravessa marcas (/mesa). A RLS continua sendo a barreira.
export const getDeskContext = cache(async (): Promise<DeskContext> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const [{ data: tenants }, { data: memberships }, { data: admin }] = await Promise.all([
    supabase.from("tenants").select("id, slug, name").order("name"),
    supabase.from("memberships").select("tenant_id, role").eq("user_id", auth.user.id),
    supabase.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  const isAdmin = Boolean(admin);
  const rolesBy = new Map<string, MemberRole[]>();
  for (const m of memberships ?? []) rolesBy.set(m.tenant_id, [...(rolesBy.get(m.tenant_id) ?? []), m.role as MemberRole]);
  return {
    userId: auth.user.id,
    email: auth.user.email,
    isAdmin,
    isStaff: isAdmin || (memberships ?? []).some((m) => m.role === "hub"),
    tenants: (tenants ?? []).map((t) => ({ ...t, roles: rolesBy.get(t.id) ?? [] })),
  };
});
