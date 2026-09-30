import {
  BarChart3, CalendarDays, FolderOpen, Handshake, Home, Inbox, Palette, Store, Users, Wallet, type LucideIcon,
} from "lucide-react";

// Mapa único da navegação: poucos lugares no menu, seguindo o ciclo do mês
// (planejar → criar → medir). Cada lugar agrupa suas telas em abas.
export type NavTab = { href: string; label: string; keepMonth?: boolean; match?: string[] };
export type NavSection = { key: string; label: string; icon: LucideIcon; tabs: NavTab[] };
/** multiStore: pessoa sem gestão que vê mais de uma loja (ex.: regional). */
export type NavFlags = { slug: string; isManager: boolean; isHub: boolean; multiStore?: boolean };

export function buildNav({ slug, isManager, isHub, multiStore }: NavFlags): NavSection[] {
  const base = `/${slug}`;
  const on = <T,>(cond: boolean, v: T): T[] => (cond ? [v] : []);

  return [
    isManager
      ? { key: "inicio", label: "Início", icon: Home, tabs: [{ href: `${base}/controle`, label: "Início", keepMonth: true }] }
      : {
          key: "inicio", label: multiStore ? "Minhas lojas" : "Minha loja", icon: multiStore ? Store : Home,
          tabs: [{ href: base, label: multiStore ? "Minhas lojas" : "Minha loja", keepMonth: true, match: [`${base}/operacoes`] }],
        },
    ...on(isManager, {
      key: "lojas", label: "Lojas", icon: Store,
      tabs: [{ href: base, label: "Lojas", keepMonth: true, match: [`${base}/operacoes`] }],
    }),
    {
      key: "plano", label: "Plano", icon: CalendarDays,
      tabs: [
        { href: `${base}/calendario`, label: "Calendário da rede", keepMonth: true },
        { href: `${base}/projetos`, label: "Projetos" },
        ...on(isManager, { href: `${base}/playbooks`, label: "Playbooks" }),
      ],
    },
    {
      key: "conteudo", label: "Conteúdo", icon: FolderOpen,
      tabs: [
        { href: `${base}/ativos`, label: "Kits & ativos" },
        { href: `${base}/biblioteca`, label: "Biblioteca" },
        ...on(isManager, { href: `${base}/postagem`, label: "Postagem e impulso" }),
        ...on(isManager, { href: `${base}/parceiros`, label: "Parceiros" }),
      ],
    },
    {
      key: "resultados", label: "Resultados", icon: BarChart3,
      tabs: [
        { href: `${base}/resultados`, label: "Resultados", keepMonth: true },
        { href: `${base}/relatorio`, label: "Relatório do mês", keepMonth: true },
        ...on(isManager, { href: `${base}/contrato`, label: "Contrato", keepMonth: true }),
      ],
    },
    {
      key: "marca", label: "Marca", icon: Palette,
      tabs: [
        { href: `${base}/marca`, label: "Guia da marca" },
        ...on(isHub, { href: `${base}/ia`, label: "IA" }),
      ],
    },
  ];
}

// Minha mesa: o espaço da equipe que atravessa todas as marcas.
export type DeskFlags = { isStaff: boolean; isAdmin: boolean };

export function buildDeskNav({ isStaff, isAdmin }: DeskFlags): NavSection[] {
  const one = (key: string, label: string, icon: LucideIcon, href: string): NavSection => ({ key, label, icon, tabs: [{ href, label }] });
  return [
    one("mesa", "Minha mesa", Inbox, "/mesa"),
    ...(isStaff ? [one("carteira", "Carteira", Wallet, "/mesa/carteira"), one("equipe", "Equipe Hub", Users, "/mesa/equipe")] : []),
    ...(isAdmin ? [one("parceiros", "Parceiros", Handshake, "/mesa/parceiros")] : []),
  ];
}

/** Onde a pessoa está: dentro de uma marca ou na Minha mesa. */
export type NavInput = ({ kind: "tenant" } & NavFlags) | ({ kind: "mesa" } & DeskFlags);

export function resolveNav(nav: NavInput) {
  return nav.kind === "mesa"
    ? { base: "/mesa", sections: buildDeskNav(nav), settings: [] as NavTab[] }
    : { base: `/${nav.slug}`, sections: buildNav(nav), settings: buildSettings(nav) };
}

/** Espaços para o seletor do topo: cada marca que a pessoa acessa. */
export type Workspace = { slug: string; name: string; href: string };

// Configurações ficam fora do menu principal, no menu da conta.
export function buildSettings({ slug, isManager }: NavFlags): NavTab[] {
  return isManager ? [{ href: `/${slug}/equipe`, label: "Equipe" }] : [];
}

export function tabMatches(tab: NavTab, pathname: string, base: string) {
  const own = tab.href === base ? pathname === base : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  return own || (tab.match ?? []).some((m) => pathname.startsWith(m));
}

export function activeSection(sections: NavSection[], pathname: string, base: string) {
  return sections.find((s) => s.tabs.some((t) => tabMatches(t, pathname, base)));
}

export function withMonth(tab: NavTab, mes: string | null) {
  return tab.keepMonth && mes ? `${tab.href}?mes=${mes}` : tab.href;
}
