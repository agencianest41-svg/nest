import { Suspense } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { ROLE_LABEL } from "@/lib/labels";
import { TenantThemeStyle } from "@/components/tenant-theme";
import { Sidebar } from "@/components/shell/sidebar";
import { SectionTabs } from "@/components/shell/section-tabs";
import { CommandPalette } from "@/components/shell/command-palette";
import { loadWorkspaces } from "@/components/shell/workspaces";
import type { NavInput } from "@/components/shell/nav";

type Props = { children: React.ReactNode; params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant } = await params;
  const ctx = await getTenantContext(tenant);
  return { title: `${ctx.tenant.name} · NEST` };
}

export default async function TenantLayout({ children, params }: Props) {
  const { tenant } = await params;
  const ctx = await getTenantContext(tenant);
  const roleLabel = ctx.isPlatformAdmin
    ? "Admin NEST"
    : ctx.memberships.map((m) => ROLE_LABEL[m.role]).filter((v, i, a) => a.indexOf(v) === i).join(" · ") || "Sem perfil";

  // Lojas que a pessoa enxerga (RLS), para a busca ⌘K; marcas para o seletor de espaço.
  const supabase = await createClient();
  const [{ data: ops }, { workspaces, canDesk }] = await Promise.all([
    supabase.from("operations").select("id, name, city, state")
      .eq("tenant_id", ctx.tenant.id).eq("active", true).order("name"),
    loadWorkspaces(ctx.userId),
  ]);

  const nav: NavInput = {
    kind: "tenant", slug: ctx.tenant.slug, isManager: ctx.isManager, isHub: ctx.isHub, multiStore: (ops ?? []).length > 1,
  };

  return (
    <>
      <TenantThemeStyle theme={ctx.theme} />
      <div className="md:flex">
        <Suspense>
          <Sidebar
            nav={nav}
            title={ctx.tenant.name}
            logoUrl={ctx.theme?.logo_url ?? null}
            roleLabel={roleLabel}
            email={ctx.email}
            workspaces={workspaces}
            canDesk={canDesk}
          />
          <CommandPalette nav={nav} ops={ops ?? []} workspaces={workspaces} canDesk={canDesk} />
        </Suspense>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
          <Suspense><SectionTabs nav={nav} /></Suspense>
          {children}
        </main>
      </div>
    </>
  );
}
