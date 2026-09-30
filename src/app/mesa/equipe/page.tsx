import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDeskContext } from "@/lib/staff";
import { formatBRL } from "@/lib/format";
import { btnSecondary, card, input } from "@/components/ui";
import { saveStaff } from "./actions";

export const metadata = { title: "Equipe · NEST" };

const ERRORS: Record<string, string> = { dados: "Confira os valores.", salvar: "Não foi possível salvar.", permissao: "Só o admin NEST altera custos." };

type Staff = { user_id: string; email: string | null; full_name: string | null; tenants: number; hourly_cost: number; weekly_capacity_hours: number; role_title: string | null };

export default async function EquipePage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const ctx = await getDeskContext();
  if (!ctx.isStaff) redirect("/mesa");
  const supabase = await createClient();
  const { data } = await supabase.rpc("staff_directory");
  const staff = (data ?? []) as Staff[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-page">Equipe Hub</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-muted">Custo/hora e capacidade semanal de cada pessoa: base da carga da equipe e da margem por cliente. Clientes nunca veem esses dados.</p>
      </header>
      {erro && ERRORS[erro] && <p role="alert" className="rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>}
      <ul className="space-y-3">
        {staff.length === 0 && <li className={`${card} p-4 text-body text-ink-muted`}>Ninguém com papel Hub ainda. Convide pela tela Equipe de cada marca.</li>}
        {staff.map((s) => (
          <li key={s.user_id} className={`${card} p-4`}>
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="font-semibold">{s.full_name || s.email}</p>
              <p className="text-caption text-ink-subtle">{s.role_title ?? "Equipe Hub"} · {s.tenants} marca{s.tenants === 1 ? "" : "s"}</p>
            </div>
            {ctx.isAdmin ? (
              <form action={saveStaff.bind(null, s.user_id)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_140px_auto] sm:items-end">
                <label className="block"><span className="label text-ink-muted">Função</span><input name="role_title" defaultValue={s.role_title ?? ""} className={`${input} mt-1`} placeholder="Estrategista, designer…" /></label>
                <label className="block"><span className="label text-ink-muted">Custo/hora (R$)</span><input name="hourly_cost" inputMode="decimal" defaultValue={Number(s.hourly_cost)} className={`${input} mt-1`} /></label>
                <label className="block"><span className="label text-ink-muted">Horas/semana</span><input name="weekly_capacity_hours" inputMode="decimal" defaultValue={Number(s.weekly_capacity_hours)} className={`${input} mt-1`} /></label>
                <button className={btnSecondary}>Salvar</button>
              </form>
            ) : (
              <p className="mt-1 text-body text-ink-muted">{formatBRL(Number(s.hourly_cost))}/h · {Number(s.weekly_capacity_hours)}h por semana</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
