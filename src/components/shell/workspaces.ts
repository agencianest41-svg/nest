import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "./nav";

// Marcas que a pessoa acessa (RLS) e se ela tem a Minha mesa (Hub em alguma marca ou admin).
export const loadWorkspaces = cache(async (userId: string): Promise<{ workspaces: Workspace[]; canDesk: boolean }> => {
  const supabase = await createClient();
  const [{ data: tenants }, { data: hub }, { data: admin }] = await Promise.all([
    supabase.from("tenants").select("slug, name").order("name"),
    supabase.from("memberships").select("id").eq("user_id", userId).eq("role", "hub").limit(1),
    supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  const canDesk = Boolean(admin) || Boolean(hub?.length);
  // Equipe Hub entra na marca pelo Início; os demais, pela página inicial do perfil.
  const workspaces = (tenants ?? []).map((t) => ({ slug: t.slug, name: t.name, href: canDesk ? `/${t.slug}/controle` : `/${t.slug}` }));
  return { workspaces, canDesk };
});
