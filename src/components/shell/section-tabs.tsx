"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { activeSection, resolveNav, tabMatches, withMonth, type NavInput } from "./nav";

// Abas do lugar atual (ex.: Conteúdo → Kits & ativos · Biblioteca · Parceiros).
export function SectionTabs({ nav }: { nav: NavInput }) {
  const pathname = usePathname();
  const mes = useSearchParams().get("mes");
  const { base, sections } = resolveNav(nav);
  const section = activeSection(sections, pathname, base);
  if (!section || section.tabs.length < 2) return null;

  return (
    <nav className="mx-auto mb-6 flex max-w-6xl gap-1 overflow-x-auto print:hidden" aria-label={section.label}>
      {section.tabs.map((t) => {
        const active = tabMatches(t, pathname, base);
        return (
          <Link
            key={t.href}
            href={withMonth(t, mes)}
            aria-current={active ? "page" : undefined}
            className={`h-8 shrink-0 rounded-full px-3.5 text-body leading-8 font-medium whitespace-nowrap transition-colors ${
              active ? "bg-ink text-on-brand" : "text-ink-muted hover:bg-brand-soft hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
