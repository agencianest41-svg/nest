"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3, BookOpen, CalendarDays, FileSignature, FolderOpen, Handshake, Inbox, FolderKanban, Gauge, LayoutGrid, LogOut, ListChecks, Palette, Sparkles, Users, type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/login/actions";

type Props = {
  slug: string; tenantName: string; logoUrl: string | null; roleLabel: string; email?: string;
  isManager: boolean; isHub: boolean;
};

type Item = { href: string; label: string; icon: LucideIcon; match?: string[]; keepMonth?: boolean };

export function Sidebar({ slug, tenantName, logoUrl, roleLabel, email, isManager, isHub }: Props) {
  const pathname = usePathname();
  const mes = useSearchParams().get("mes");
  const base = `/${slug}`;

  const sections: { title?: string; items: Item[] }[] = [
    {
      items: [
        ...(isHub ? [{ href: "/mesa", label: "Minha mesa", icon: Inbox }] : []),
        { href: `${base}/controle`, label: "Sala de controle", icon: Gauge, keepMonth: true },
        { href: base, label: "Rede", icon: LayoutGrid, match: [`${base}/operacoes`], keepMonth: true },
        { href: `${base}/projetos`, label: "Projetos", icon: FolderKanban },
        { href: `${base}/calendario`, label: "Calendário", icon: CalendarDays, keepMonth: true },
        { href: `${base}/ativos`, label: "Kits & Ativos", icon: FolderOpen },
        { href: `${base}/resultados`, label: "Resultados", icon: BarChart3, keepMonth: true },
        { href: `${base}/biblioteca`, label: "Biblioteca", icon: BookOpen },
        { href: `${base}/marca`, label: "Marca", icon: Palette },
        ...(isManager ? [{ href: `${base}/parceiros`, label: "Parceiros", icon: Handshake }] : []),
      ],
    },
    ...(isManager ? [{
      title: "Configuração",
      items: [
        { href: `${base}/playbooks`, label: "Playbooks", icon: ListChecks },
        { href: `${base}/contrato`, label: "Contrato", icon: FileSignature, keepMonth: true },
        { href: `${base}/equipe`, label: "Equipe", icon: Users },
        ...(isHub ? [{ href: `${base}/ia`, label: "IA", icon: Sparkles }] : []),
      ],
    }] : []),
  ];

  const isActive = (it: Item) =>
    it.href === base
      ? pathname === base || (it.match ?? []).some((m) => pathname.startsWith(m))
      : pathname.startsWith(it.href) || (it.match ?? []).some((m) => pathname.startsWith(m));

  return (
    <aside className="flex flex-col border-b border-line bg-canvas print:hidden md:sticky md:top-0 md:h-dvh md:w-60 md:border-r md:border-b-0">
      <div className="flex h-14 items-center gap-2 px-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={tenantName} className="h-6 w-auto" />
        ) : (
          <span className="font-brand text-title text-tenant">{tenantName}</span>
        )}
        {isHub
          ? <Link href="/mesa" className="ml-auto rounded-sm px-1.5 py-0.5 text-caption font-medium text-ink-subtle hover:bg-brand-soft hover:text-ink" title="Minha mesa (todas as marcas)">NEST</Link>
          : <span className="ml-auto text-caption font-medium text-ink-subtle">NEST</span>}
      </div>

      <nav className="flex gap-0.5 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-y-auto" aria-label="Principal">
        {sections.map((section, i) => (
          <div key={i} className="contents md:block md:space-y-0.5">
            {section.title && <p className="mt-5 mb-1 hidden px-2.5 text-caption font-medium text-ink-subtle md:block">{section.title}</p>}
            {section.items.map((it) => {
              const active = isActive(it);
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={`${it.href}${it.keepMonth && mes ? `?mes=${mes}` : ""}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-8 shrink-0 items-center gap-2.5 rounded-sm px-2.5 text-body font-medium whitespace-nowrap transition-colors ${
                    active ? "bg-surface text-ink shadow-xs ring-1 ring-line" : "text-ink-muted hover:bg-brand-soft hover:text-ink"
                  }`}
                >
                  <Icon className={`size-4 ${active ? "text-tenant" : "text-ink-subtle"}`} aria-hidden />
                  {it.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto hidden border-t border-line p-3 md:block">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-caption font-semibold text-ink-muted uppercase">
            {(email ?? "?").slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium">{email}</p>
            <p className="truncate text-caption text-ink-subtle">{roleLabel}</p>
          </div>
          <form action={signOut}>
            <button className="grid size-8 place-items-center rounded-sm text-ink-subtle hover:bg-brand-soft hover:text-ink" aria-label="Sair" title="Sair">
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
