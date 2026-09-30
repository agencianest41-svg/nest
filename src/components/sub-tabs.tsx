import Link from "next/link";

export type SubTab = { key: string; label: React.ReactNode; href: string };

// Abas dentro de uma tela: seletor segmentado discreto, para não competir com
// as abas do lugar (pílulas no topo) nem com o menu lateral.
export function SubTabs({ tabs, active, label, className = "" }: {
  tabs: SubTab[]; active: string; label: string; className?: string;
}) {
  return (
    <nav aria-label={label} className={`flex max-w-full overflow-x-auto ${className}`}>
      <div className="inline-flex gap-0.5 rounded-sm bg-brand-soft p-0.5">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] px-3 text-body font-medium whitespace-nowrap transition-colors ${
                on ? "bg-surface text-ink shadow-xs" : "text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
