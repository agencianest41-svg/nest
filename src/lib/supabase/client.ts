import { createBrowserClient } from "@supabase/ssr";

// Cliente do navegador: só para upload direto ao Storage (a RLS do bucket decide).
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
