"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CornerDownLeft, Inbox, Search, Settings, Store } from "lucide-react";
import { resolveNav, withMonth, type NavInput, type Workspace } from "./nav";

export const OPEN_PALETTE = "nest:open-palette";

type Op = { id: string; name: string; city: string | null; state: string | null };
type Entry = { group: string; label: string; hint?: string; href: string; icon: React.ComponentType<{ className?: string }> };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Busca única (⌘K): qualquer tela, loja ou marca em duas teclas.
export function CommandPalette({ nav, ops = [], workspaces, canDesk }: {
  nav: NavInput; ops?: Op[]; workspaces: Workspace[]; canDesk: boolean;
}) {
  const router = useRouter();
  const mes = useSearchParams().get("mes");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => { if (!o) { setQ(""); setSel(0); } return !o; });
      }
    };
    const onOpen = () => { setQ(""); setSel(0); setOpen(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_PALETTE, onOpen); };
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const { sections, settings } = resolveNav(nav);
    const pages: Entry[] = sections.flatMap((s) =>
      s.tabs.map((t) => ({ group: "Ir para", label: t.label === s.label ? s.label : `${s.label} · ${t.label}`, href: withMonth(t, mes), icon: s.icon })));
    const config: Entry[] = settings.map((t) => ({ group: "Configurações", label: t.label, href: t.href, icon: Settings }));
    const stores: Entry[] = nav.kind === "tenant" ? ops.map((o) => ({
      group: "Lojas", label: o.name, hint: [o.city, o.state].filter(Boolean).join(" · "),
      href: `/${nav.slug}/operacoes/${o.id}${mes ? `?mes=${mes}` : ""}`, icon: Store,
    })) : [];
    const spaces: Entry[] = [
      ...(canDesk && nav.kind !== "mesa" ? [{ group: "Espaços", label: "Minha mesa", hint: "todas as marcas", href: "/mesa", icon: Inbox }] : []),
      ...(canDesk || workspaces.length > 1
        ? workspaces.filter((w) => nav.kind === "mesa" || w.slug !== nav.slug).map((w) => ({ group: "Espaços", label: w.name, href: w.href, icon: Building2 }))
        : []),
    ];
    return [...pages, ...config, ...stores, ...spaces];
  }, [nav, ops, workspaces, canDesk, mes]);

  const results = useMemo(() => {
    const term = fold(q.trim());
    const list = term ? entries.filter((e) => fold(`${e.label} ${e.hint ?? ""}`).includes(term)) : entries.filter((e) => e.group !== "Lojas" || ops.length <= 8);
    return list.slice(0, 40);
  }, [q, entries, ops.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  const go = (e?: Entry) => { if (!e) return; setOpen(false); router.push(e.href); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[sel]); }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Buscar">
      <div className="absolute inset-0 bg-ink/20" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-md border border-line bg-surface shadow-overlay" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 text-ink-subtle" aria-hidden />
          <input
            autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
            placeholder="Buscar telas e lojas…" aria-label="Buscar"
            className="h-12 flex-1 bg-transparent text-heading outline-none placeholder:text-ink-subtle"
          />
          <kbd className="rounded-sm border border-line px-1.5 text-caption text-ink-subtle">esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {results.length === 0 && <li className="px-3 py-6 text-center text-body text-ink-subtle">Nada encontrado.</li>}
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            const Icon = r.icon;
            return (
              <li key={`${r.group}-${r.href}`}>
                {header && <p className="px-2.5 pt-2 pb-1 text-caption font-medium text-ink-subtle">{header}</p>}
                <button
                  data-i={i} role="option" aria-selected={i === sel}
                  onMouseMove={() => setSel(i)} onClick={() => go(r)}
                  className={`flex h-10 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-body ${i === sel ? "bg-brand-soft text-ink" : "text-ink-muted"}`}
                >
                  <Icon className="size-4 shrink-0 text-ink-subtle" />
                  <span className="truncate font-medium">{r.label}</span>
                  {r.hint && <span className="truncate text-caption text-ink-subtle">{r.hint}</span>}
                  {i === sel && <CornerDownLeft className="ml-auto size-3.5 text-ink-subtle" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
