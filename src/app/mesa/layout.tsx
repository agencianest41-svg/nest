import { Suspense } from "react";
import { getDeskContext } from "@/lib/staff";
import { Sidebar } from "@/components/shell/sidebar";
import { CommandPalette } from "@/components/shell/command-palette";
import { loadWorkspaces } from "@/components/shell/workspaces";
import type { NavInput } from "@/components/shell/nav";

// Minha mesa: o espaço que atravessa marcas (fila pessoal, carteira e equipe),
// com a mesma barra lateral das marcas e o seletor de espaço no topo.
export default async function MesaLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getDeskContext();
  const { workspaces } = await loadWorkspaces(ctx.userId);
  const nav: NavInput = { kind: "mesa", isStaff: ctx.isStaff, isAdmin: ctx.isAdmin };
  const roleLabel = ctx.isAdmin ? "Admin NEST" : ctx.isStaff ? "Equipe Hub" : "Todas as marcas";

  return (
    <div className="md:flex">
      <Suspense>
        <Sidebar nav={nav} title="Minha mesa" roleLabel={roleLabel} email={ctx.email} workspaces={workspaces} canDesk />
        <CommandPalette nav={nav} workspaces={workspaces} canDesk />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
