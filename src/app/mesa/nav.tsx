"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DeskNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Mesa">
      {links.map((l) => {
        const active = l.href === "/mesa" ? pathname === "/mesa" : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
            className={`h-8 rounded-sm px-3 text-body font-semibold leading-8 whitespace-nowrap ${active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-brand-soft"}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
