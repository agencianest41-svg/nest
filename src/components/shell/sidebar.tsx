"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, ChevronDown, ChevronsUpDown, Inbox, LogOut, Menu, PanelLeft, Search, Settings, X } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { activeSection, resolveNav, withMonth, type NavInput, type Workspace } from "./nav";
import { OPEN_PALETTE } from "./command-palette";

type Props = {
  nav: NavInput;
  /** Nome e logo do espaço atual (marca ou "Minha mesa"). */
  title: string;
  logoUrl?: string | null;
  roleLabel: string;
  email?: string;
  workspaces: Workspace[];
  canDesk: boolean;
};

const COLLAPSE_KEY = "nest:sidebar-collapsed";
const COLLAPSE_EVENT = "nest:sidebar-collapsed";

// Preferência por navegador; lida como store externo para não brigar com a hidratação.
const collapseStore = {
  subscribe(cb: () => void) {
    window.addEventListener(COLLAPSE_EVENT, cb);
    window.addEventListener("storage", cb);
    return () => { window.removeEventListener(COLLAPSE_EVENT, cb); window.removeEventListener("storage", cb); };
  },
  get() { try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; } },
  set(v: boolean) {
    try { localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch {}
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  },
};

// Fecha menus quando a rota muda (ajuste de estado durante o render, sem efeito).
function useCloseOnNavigate(close: () => void) {
  const pathname = usePathname();
  const [prev, setPrev] = useState(pathname);
  if (prev !== pathname) { setPrev(pathname); close(); }
}

// Menu suspenso simples: fecha ao clicar fora, com Esc e ao navegar.
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useCloseOnNavigate(() => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

const menuRow = "flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-body text-ink-muted hover:bg-brand-soft hover:text-ink";

export function Sidebar({ nav, title, logoUrl, roleLabel, email, workspaces, canDesk }: Props) {
  const pathname = usePathname();
  const mes = useSearchParams().get("mes");
  const { base, sections, settings } = resolveNav(nav);
  const current = activeSection(sections, pathname, base);

  const collapsed = useSyncExternalStore(collapseStore.subscribe, collapseStore.get, () => false);
  const [drawer, setDrawer] = useState(false);
  useCloseOnNavigate(() => setDrawer(false));

  const toggle = () => collapseStore.set(!collapsed);
  const openSearch = () => window.dispatchEvent(new Event(OPEN_PALETTE));

  const logo = nav.kind === "mesa"
    ? <span className="text-title font-semibold tracking-tight">{title}</span>
    : logoUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={logoUrl} alt={title} className="h-6 w-auto" />
      : <span className="font-brand text-title text-tenant">{title}</span>;

  // No celular a barra vira um cabeçalho com menu em gaveta.
  const mini = collapsed && !drawer;
  const canSwitch = canDesk || workspaces.length > 1;

  const panel = (
    <div className="flex h-full flex-col">
      <div className={`flex h-14 shrink-0 items-center gap-1 ${mini ? "justify-center px-2" : "pr-2 pl-2"}`}>
        {!mini && (canSwitch
          ? <WorkspaceSwitcher logo={logo} current={nav.kind === "mesa" ? "mesa" : nav.slug} workspaces={workspaces} canDesk={canDesk} />
          : <Link href={base} className="min-w-0 truncate px-2">{logo}</Link>)}
        <button
          onClick={drawer ? () => setDrawer(false) : toggle}
          className={`grid size-8 shrink-0 place-items-center rounded-sm text-ink-subtle hover:bg-brand-soft hover:text-ink ${mini ? "" : "ml-auto"}`}
          aria-label={drawer ? "Fechar menu" : collapsed ? "Abrir barra lateral" : "Recolher barra lateral"}
          title={drawer ? "Fechar" : collapsed ? "Abrir barra lateral" : "Recolher barra lateral"}
        >
          {drawer ? <X className="size-4" /> : <PanelLeft className="size-4" />}
        </button>
      </div>

      <div className="px-2">
        <button
          onClick={openSearch}
          className={`flex h-9 w-full items-center gap-2.5 rounded-sm border border-line bg-surface text-body text-ink-subtle shadow-xs transition-colors hover:border-line-strong hover:text-ink ${mini ? "justify-center px-0" : "px-2.5"}`}
          aria-label="Buscar"
          title="Buscar (⌘K)"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          {!mini && <><span className="flex-1 text-left">Buscar</span><kbd className="text-caption text-ink-subtle">⌘K</kbd></>}
        </button>
      </div>

      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-2" aria-label="Principal">
        {sections.map((s) => {
          const active = current?.key === s.key;
          const Icon = s.icon;
          return (
            <Link
              key={s.key}
              href={withMonth(s.tabs[0], mes)}
              aria-current={active ? "page" : undefined}
              title={mini ? s.label : undefined}
              className={`flex h-9 items-center gap-2.5 rounded-sm text-body font-medium transition-colors ${mini ? "justify-center" : "px-2.5"} ${
                active ? "bg-brand-soft text-ink" : "text-ink-muted hover:bg-brand-soft hover:text-ink"
              }`}
            >
              <Icon className={`size-[18px] shrink-0 ${active ? "text-tenant" : "text-ink-subtle"}`} aria-hidden />
              {!mini && s.label}
            </Link>
          );
        })}
      </nav>

      <AccountMenu mini={mini} email={email} roleLabel={roleLabel} items={settings} />
    </div>
  );

  return (
    <>
      {/* Celular: cabeçalho fino. */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-3 backdrop-blur print:hidden md:hidden">
        <button onClick={() => setDrawer(true)} className="grid size-9 place-items-center rounded-sm text-ink-muted hover:bg-brand-soft" aria-label="Abrir menu">
          <Menu className="size-5" />
        </button>
        <Link href={base} className="min-w-0 truncate">{logo}</Link>
        <span className="truncate text-body text-ink-subtle">{current && current.label !== title ? `· ${current.label}` : ""}</span>
        <button onClick={openSearch} className="ml-auto grid size-9 place-items-center rounded-sm text-ink-muted hover:bg-brand-soft" aria-label="Buscar">
          <Search className="size-5" />
        </button>
      </header>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/20" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-line bg-canvas shadow-overlay">{panel}</aside>
        </div>
      )}

      {/* Desktop: barra lateral fixa, recolhível. */}
      <aside className={`sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-canvas transition-[width] print:hidden md:block ${collapsed ? "w-14" : "w-60"}`}>
        {panel}
      </aside>
    </>
  );
}

// Seletor de espaço (como o de organização do Claude): Minha mesa ou uma marca.
function WorkspaceSwitcher({ logo, current, workspaces, canDesk }: {
  logo: React.ReactNode; current: string; workspaces: Workspace[]; canDesk: boolean;
}) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-sm px-2 hover:bg-brand-soft"
        aria-haspopup="menu" aria-expanded={open} title="Trocar de espaço"
      >
        <span className="min-w-0 truncate">{logo}</span>
        <ChevronDown className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-60 rounded-md border border-line bg-surface p-1 shadow-overlay" role="menu">
          {canDesk && (
            <>
              <Link href="/mesa" className={menuRow} role="menuitem">
                <Inbox className="size-4" aria-hidden />
                <span className="flex-1">Minha mesa</span>
                {current === "mesa" && <Check className="size-4 text-ink" aria-hidden />}
              </Link>
              <p className="px-2.5 pt-2 pb-1 text-caption font-medium text-ink-subtle">Marcas</p>
            </>
          )}
          {workspaces.map((w) => (
            <Link key={w.slug} href={w.href} className={menuRow} role="menuitem">
              <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-sm bg-brand-soft text-caption font-semibold text-ink-muted uppercase">{w.name.slice(0, 1)}</span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {current === w.slug && <Check className="size-4 text-ink" aria-hidden />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountMenu({ mini, email, roleLabel, items }: {
  mini: boolean; email?: string; roleLabel: string; items: { href: string; label: string }[];
}) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative shrink-0 border-t border-line p-2">
      {open && (
        <div className="absolute bottom-full left-2 z-50 mb-1 w-56 rounded-md border border-line bg-surface p-1 shadow-overlay" role="menu">
          <div className="px-2.5 py-2">
            <p className="truncate text-body font-medium text-ink">{email}</p>
            <p className="truncate text-caption text-ink-subtle">{roleLabel}</p>
          </div>
          <div className="my-1 border-t border-line" />
          {items.map((it) => (
            <Link key={it.href} href={it.href} className={menuRow} role="menuitem"><Settings className="size-4" aria-hidden /> {it.label}</Link>
          ))}
          <form action={signOut}>
            <button className={menuRow} role="menuitem"><LogOut className="size-4" aria-hidden /> Sair</button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2.5 rounded-sm p-1.5 text-left hover:bg-brand-soft ${mini ? "justify-center" : ""}`}
        aria-haspopup="menu" aria-expanded={open} title={mini ? email : undefined}
      >
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-caption font-semibold text-on-brand uppercase">
          {(email ?? "?").slice(0, 1)}
        </span>
        {!mini && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium">{email}</span>
              <span className="block truncate text-caption text-ink-subtle">{roleLabel}</span>
            </span>
            <ChevronsUpDown className="size-4 text-ink-subtle" aria-hidden />
          </>
        )}
      </button>
    </div>
  );
}
