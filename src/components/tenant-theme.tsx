import type { TenantTheme } from "@/lib/types";

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const FONT = /^[\w\s",'.()-]+$/;

// A cor do cliente vira identidade (logo e destaques), não pinta a interface.
// Valores vêm do banco, então só passam cores hex e nomes de fonte simples.
export function TenantThemeStyle({ theme }: { theme: TenantTheme | null }) {
  if (!theme) return null;
  const vars: Record<string, string | null> = {
    "--tenant": HEX.test(theme.brand) ? theme.brand : null,
    "--tenant-accent": HEX.test(theme.accent) ? theme.accent : null,
  };
  const decl = Object.entries(vars).filter(([, v]) => v).map(([k, v]) => `${k}:${v};`).join("");
  const font = FONT.test(theme.font_display) && !/url\s*\(/i.test(theme.font_display) ? `--font-display-tenant:${theme.font_display};` : "";
  return <style dangerouslySetInnerHTML={{ __html: `:root{${decl}${font}}` }} />;
}
