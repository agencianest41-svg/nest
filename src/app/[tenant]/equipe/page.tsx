import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { ROLE_LABEL } from "@/lib/labels";
import type { MemberRole, Operation, Region } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, card } from "@/components/ui";
import { inviteMember, removeMember } from "./actions";
import { InviteForm } from "./invite-form";

type Props = { params: Promise<{ tenant: string }> };

type Row = { id: string; user_id: string; role: MemberRole; region_id: string | null; operation_id: string | null };

export default async function EquipePage({ params }: Props) {
  const { tenant } = await params;
  const ctx = await getTenantContext(tenant);
  if (!ctx.isManager) redirect(`/${tenant}`);

  const supabase = await createClient();
  const [{ data: members }, { data: regions }, { data: operations }] = await Promise.all([
    supabase.from("memberships").select("id, user_id, role, region_id, operation_id")
      .eq("tenant_id", ctx.tenant.id).order("created_at"),
    supabase.from("regions").select("id, code, name").eq("tenant_id", ctx.tenant.id).order("name"),
    supabase.from("operations").select("id, name, region_id").eq("tenant_id", ctx.tenant.id).eq("active", true).order("name"),
  ]);

  // E-mail e último acesso vêm do Auth; só o servidor lê, com a secret key.
  const admin = createAdminClient();
  const users = new Map<string, { email?: string; lastSignIn?: string | null }>();
  if (admin) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) users.set(u.id, { email: u.email, lastSignIn: u.last_sign_in_at });
  }

  const regionName = new Map(((regions ?? []) as Region[]).map((r) => [r.id, r.name]));
  const opName = new Map((operations ?? []).map((o) => [o.id, o.name]));
  const rows = (members ?? []) as Row[];
  const canInviteHub = ctx.isPlatformAdmin || ctx.memberships.some((m) => m.role === "hub");

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <h1 className="font-display text-page">Equipe</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-muted">
          Quem acessa a rede {ctx.tenant.name} e o que cada pessoa enxerga. Lojista vê só a própria operação;
          gestor regional, as operações da região; Hub e Marca, a rede toda.
        </p>
      </header>

      {!admin && (
        <p role="alert" className="mt-4 rounded-sm border border-warning/20 bg-warning/5 p-3 text-body text-warning">
          Convites desativados: falta configurar a SUPABASE_SECRET_KEY no servidor.
        </p>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <section className={`${card} overflow-x-auto`}>
          {rows.length === 0 ? (
            <p className="p-6 text-body text-ink-muted">Ninguém convidado ainda.</p>
          ) : (
            <table className="w-full min-w-[560px] text-left text-body">
              <thead>
                <tr className="border-b border-line">
                  <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Pessoa</th>
                  <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Perfil</th>
                  <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Escopo</th>
                  <th className="h-10 px-4 text-caption font-medium text-ink-subtle">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const u = users.get(m.user_id);
                  const scope = m.operation_id ? opName.get(m.operation_id)
                    : m.region_id ? regionName.get(m.region_id) : "Rede toda";
                  return (
                    <tr key={m.id} className="h-11 border-b border-line last:border-0">
                      <td className="px-4 font-semibold">{u?.email ?? "—"}</td>
                      <td className="px-4">{ROLE_LABEL[m.role]}</td>
                      <td className="px-4 text-ink-muted">{scope}</td>
                      <td className="px-4">
                        {u?.lastSignIn
                          ? <StatusBadge label="Ativo" tone="success" />
                          : <StatusBadge label="Convite pendente" tone="warning" />}
                      </td>
                      <td className="pr-3">
                        {m.user_id !== ctx.userId && (
                          <form action={removeMember.bind(null, tenant)}>
                            <input type="hidden" name="id" value={m.id} />
                            <button className={btnGhost} aria-label={`Remover acesso de ${u?.email ?? "pessoa"}`}>
                              <Trash2 className="size-4" />
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <aside className={`${card} h-fit p-4`}>
          <h2 className="text-heading font-semibold">Convidar pessoa</h2>
          <p className="mb-4 text-caption text-ink-subtle">
            Gera um link de acesso para enviar por WhatsApp ou e-mail. No primeiro acesso a pessoa cria a senha.
          </p>
          <InviteForm
            action={inviteMember.bind(null, tenant)}
            regions={(regions ?? []) as Region[]}
            operations={(operations ?? []) as Pick<Operation, "id" | "name" | "region_id">[]}
            canInviteHub={canInviteHub}
          />
        </aside>
      </div>
    </div>
  );
}
