import { Suspense } from "react";
import type { Metadata } from "next";
import { getTenantContext } from "@/lib/tenant";
import { ROLE_LABEL } from "@/lib/labels";
import { TenantThemeStyle } from "@/components/tenant-theme";
import { Sidebar } from "./sidebar";

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

  return (
    <>
      <TenantThemeStyle theme={ctx.theme} />
      <div className="md:flex">
        <Suspense>
          <Sidebar
            slug={ctx.tenant.slug}
            tenantName={ctx.tenant.name}
            logoUrl={ctx.theme?.logo_url ?? null}
            roleLabel={roleLabel}
            email={ctx.email}
            isManager={ctx.isManager}
            isHub={ctx.isHub}
          />
        </Suspense>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
      </div>
    </>
  );
}
