import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";

export const metadata = { title: "Parceiro · NEST" };

// Portal do parceiro: fora de qualquer marca; vê só os briefs liberados para ele.
export default function ParceiroLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href="/parceiro" className="label text-ink">NEST · Bancada</Link>
          <form action={signOut} className="ml-auto"><button className="inline-flex items-center gap-1 text-caption font-semibold text-ink-muted hover:text-ink"><LogOut className="size-3.5" aria-hidden /> Sair</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
