import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com a secret key: ignora RLS. Só para ações que o próprio servidor
// já autorizou (ex.: convite feito por Hub/Marca). Nunca importar em código cliente.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
