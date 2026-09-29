import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemFormat } from "@/lib/types";

export type BrandVoice = {
  essence: string;
  tone: string;
  vocabulary: string | null;
  avoid: string | null;
  audience: string | null;
  tagline: string | null;
  brand_values: string | null;
  content_pillars: string | null;
};
export type Persona = { id: string; name: string; description: string | null; goals: string | null; pains: string | null; channels: string | null; position: number };
export type Product = { id: string; name: string; category: string | null; description: string | null; highlights: string | null; active: boolean };
export type RuleKind = "termo_proibido" | "termo_obrigatorio" | "regulatorio" | "estilo";
export type Rule = { id: string; kind: RuleKind; term: string | null; guidance: string; severity: "bloqueia" | "alerta" };
export type Example = { id: string; verdict: "aprovado" | "reprovado"; format: ItemFormat | null; content: string; reason: string | null };

export type Brand = { voice: BrandVoice | null; personas: Persona[]; products: Product[]; rules: Rule[]; examples: Example[] };

export const RULE_KIND: Record<RuleKind, string> = {
  termo_proibido: "Termo proibido",
  termo_obrigatorio: "Termo obrigatório",
  regulatorio: "Regulatório",
  estilo: "Estilo",
};

export async function loadBrand(supabase: SupabaseClient, tenantId: string): Promise<Brand> {
  const [voice, personas, products, rules, examples] = await Promise.all([
    supabase.from("brand_voices").select("essence, tone, vocabulary, avoid, audience, tagline, brand_values, content_pillars").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("brand_personas").select("*").eq("tenant_id", tenantId).order("position"),
    supabase.from("brand_products").select("*").eq("tenant_id", tenantId).order("name"),
    supabase.from("brand_rules").select("*").eq("tenant_id", tenantId).order("created_at"),
    supabase.from("brand_examples").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(12),
  ]);
  return {
    voice: voice.data as BrandVoice | null,
    personas: (personas.data ?? []) as Persona[],
    products: (products.data ?? []) as Product[],
    rules: (rules.data ?? []) as Rule[],
    examples: (examples.data ?? []) as Example[],
  };
}

// Contexto de marca para qualquer chamada de IA: é o Brand OS que "ensina" o modelo.
export function brandContext(brandName: string, b: Brand) {
  const v = b.voice;
  const lines: (string | null | false | undefined)[] = [
    `Marca: ${brandName}.`,
    v?.tagline && `Assinatura: ${v.tagline}`,
    v && `Essência: ${v.essence}`,
    v && `Tom de voz: ${v.tone}`,
    v?.brand_values && `Valores: ${v.brand_values}`,
    v?.content_pillars && `Pilares de conteúdo: ${v.content_pillars}`,
    v?.vocabulary && `Vocabulário preferido: ${v.vocabulary}`,
    v?.avoid && `Evite: ${v.avoid}`,
    v?.audience && `Públicos: ${v.audience}`,
  ];
  if (b.personas.length) {
    lines.push("Personas:", ...b.personas.map((p) =>
      `- ${p.name}: ${[p.description, p.goals && `quer ${p.goals}`, p.pains && `dor: ${p.pains}`, p.channels && `canais: ${p.channels}`].filter(Boolean).join("; ")}`));
  }
  const products = b.products.filter((p) => p.active);
  if (products.length) {
    lines.push("Produtos que podem ser citados pelo nome:", ...products.slice(0, 30).map((p) =>
      `- ${p.name}${p.category ? ` (${p.category})` : ""}${p.highlights ? `: ${p.highlights}` : ""}`));
  }
  if (b.rules.length) {
    lines.push("Regras da marca:", ...b.rules.map((r) =>
      `- [${RULE_KIND[r.kind]}${r.severity === "bloqueia" ? ", obrigatório" : ""}] ${r.term ? `"${r.term}": ` : ""}${r.guidance}`));
  }
  if (b.examples.length) {
    lines.push("Exemplos avaliados pela marca:", ...b.examples.map((e) =>
      `- ${e.verdict === "aprovado" ? "APROVADO" : "REPROVADO"}: "${e.content.slice(0, 300)}"${e.reason ? ` — ${e.reason}` : ""}`));
  }
  return lines.filter(Boolean).join("\n");
}
