import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";

// Nomes de quem divide o tenant (RLS em profiles). Ids desconhecidos ficam de fora.
export async function loadProfiles(supabase: SupabaseClient, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  const map = new Map<string, Profile>();
  if (!unique.length) return map;
  const { data } = await supabase.from("profiles").select("id, email, full_name").in("id", unique);
  for (const p of (data ?? []) as Profile[]) map.set(p.id, p);
  return map;
}

export function displayName(p: Profile | undefined | null) {
  if (!p) return "—";
  return p.full_name || p.email?.split("@")[0] || "—";
}
