import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDeskContext } from "@/lib/staff";
import { btnGhost, card } from "@/components/ui";
import { createBrand } from "./actions";
import { BrandForm } from "./brand-form";

export const metadata = { title: "Marcas · NEST" };

type Row = {
  id: string; slug: string; name: string;
  tenant_themes: { brand: string } | null;
  memberships: { count: number }[];
  operations: { count: number }[];
};

// Cadastro de marcas (admin NEST): cria o espaço, o tema e a primeira pessoa.
export default async function MarcasPage() {
  const ctx = await getDeskContext();
  if (!ctx.isAdmin) redirect("/mesa");
  const supabase = await createClient();
  const { data } = await supabase.from("tenants")
    .select("id, slug, name, tenant_themes(brand), memberships(count), operations(count)")
    .order("name");
  const brands = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-page">Marcas</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-muted">Cada marca é um espaço separado, com tema, equipe e dados próprios. Quem é de uma marca nunca vê as outras.</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <ul className={card}>
          {brands.length === 0 && <li className="p-6 text-body text-ink-muted">Nenhuma marca ainda.</li>}
          {brands.map((b) => {
            const people = b.memberships[0]?.count ?? 0;
            const ops = b.operations[0]?.count ?? 0;
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <span aria-hidden className="size-4 shrink-0 rounded-full border border-line" style={{ background: b.tenant_themes?.brand ?? "transparent" }} />
                <div className="min-w-40 flex-1">
                  <p className="font-semibold">{b.name} <span className="font-normal text-ink-subtle">· /{b.slug}</span></p>
                  <p className="text-caption text-ink-subtle">{people} pessoa{people === 1 ? "" : "s"} · {ops} operaç{ops === 1 ? "ão" : "ões"}</p>
                </div>
                <Link href={`/${b.slug}/equipe`} className={btnGhost}>Equipe</Link>
                <Link href={`/${b.slug}/controle`} className={btnGhost}>Abrir</Link>
              </li>
            );
          })}
        </ul>
        <aside className={`${card} h-fit p-4`}>
          <h2 className="text-heading font-semibold">Nova marca</h2>
          <p className="mb-4 text-caption text-ink-subtle">O tema completo (claro e escuro) sai das duas cores. Dá para ajustar depois.</p>
          <BrandForm action={createBrand} />
        </aside>
      </div>
    </div>
  );
}
