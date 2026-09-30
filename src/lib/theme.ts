// Tema completo de uma marca a partir de duas cores (principal e destaque).
// As proporções seguem o tema da Mahogany, feito à mão no seed.
const HEX = /^#[0-9a-f]{6}$/i;

export const isHex = (v: string) => HEX.test(v);

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(c: number[]) {
  return `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Mistura `hex` com `to` (branco ou preto) na proporção `amount` (0–1). */
function mix(hex: string, to: "white" | "black", amount: number) {
  const target = to === "white" ? 255 : 0;
  return toHex(rgb(hex).map((v) => v + (target - v) * amount));
}

function hsl(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Mesma cor (matiz) com luminosidade `l` e saturação limitada a `maxS` (0–1). */
function tone(hex: string, l: number, maxS = 1) {
  const [h, s0] = hsl(hex);
  const s = Math.min(s0, maxS);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([r, g, b].map((v) => (v + m) * 255));
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function deriveTheme(brand: string, accent: string) {
  return {
    brand: brand.toUpperCase(),
    brand_hover: mix(brand, "black", 0.25),
    brand_soft: tone(brand, 0.94, 0.45),
    on_brand: luminance(brand) > 0.45 ? "#1A1A1A" : "#FFFFFF",
    accent: accent.toUpperCase(),
    accent_ink: mix(accent, "black", 0.47),
    brand_dark: tone(brand, 0.67, 0.55),
    brand_hover_dark: tone(brand, 0.76, 0.55),
    brand_soft_dark: tone(brand, 0.15, 0.4),
    on_brand_dark: tone(brand, 0.07, 0.45),
    accent_ink_dark: mix(accent, "white", 0.3),
  };
}
