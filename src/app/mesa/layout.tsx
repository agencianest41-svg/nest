import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { getDeskContext } from "@/lib/staff";
import { DeskNav } from "./nav";

// Área da equipe que atravessa marcas: fila pessoal, carteira e equipe.
export default async function MesaLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getDeskContext();
  const links = [
    { href: "/mesa", label: "Minha mesa" },
    ...(ctx.isStaff ? [{ href: "/mesa/carteira", label: "Carteira" }, { href: "/mesa/equipe", label: "Equipe" }] : []),
    ...(ctx.isAdmin ? [{ href: "/mesa/parceiros", label: "Parceiros" }] : []),
  ];
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/mesa" className="label text-ink">NEST</Link>
          <DeskNav links={links} />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-caption text-ink-subtle sm:inline">{ctx.email}</span>
            <form action={signOut}><button className="inline-flex items-center gap-1 text-caption font-semibold text-ink-muted hover:text-ink"><LogOut className="size-3.5" aria-hidden /> Sair</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
