import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { card } from "@/components/ui";

// Entrada: leva direto ao tenant quando o usuário só tem um.
export default async function Home() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: tenants }, { data: hub }, { data: admin }] = await Promise.all([
    supabase.from("tenants").select("slug, name").order("name"),
    supabase.from("memberships").select("id").eq("user_id", auth.user.id).eq("role", "hub").limit(1),
    supabase.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  // Equipe Hub começa pela mesa (todas as marcas); cliente com uma marca, pela sala de controle.
  if (admin || hub?.length) redirect("/mesa");
  if (tenants?.length === 1) redirect(`/${tenants[0].slug}/controle`);
  if (!tenants?.length) {
    const { data: partner } = await supabase.from("partners").select("id").eq("user_id", auth.user.id).maybeSingle();
    if (partner) redirect("/parceiro");
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <p className="label text-ink-subtle">NEST</p>
      <h1 className="mt-2 font-display text-page">Suas marcas</h1>
      {tenants?.length ? (
        <ul className="mt-6 space-y-2">
          {tenants.map((t) => (
            <li key={t.slug}>
              <Link href={`/${t.slug}/controle`} className={`${card} block px-4 py-3 text-heading font-semibold hover:bg-brand-soft`}>
                {t.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-body text-ink-muted">
          Seu acesso ainda não foi vinculado a nenhuma marca. Fale com a equipe Hub.
        </p>
      )}
    </main>
  );
}
