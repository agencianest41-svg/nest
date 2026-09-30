import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDeskContext } from "@/lib/staff";
import type { Partner } from "@/lib/partners";
import { StatusBadge } from "@/components/status-badge";
import { btnGhost, card } from "@/components/ui";
import { invitePartnerAccount, setPartnerStatus } from "./actions";
import { PartnerInvite } from "./invite";

export const metadata = { title: "Parceiros · NEST" };

const STATUS = {
  candidato: { label: "Em análise", tone: "warning" as const },
  verificado: { label: "Verificado", tone: "success" as const },
  suspenso: { label: "Suspenso", tone: "danger" as const },
};

// Curadoria da bancada (admin NEST).
export default async function ParceirosAdminPage() {
  const ctx = await getDeskContext();
  if (!ctx.isAdmin) redirect("/mesa");
  const supabase = await createClient();
  const { data } = await supabase.from("partners").select("*").order("created_at", { ascending: false });
  const partners = (data ?? []) as (Partner & { status: keyof typeof STATUS; email: string })[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-page">Bancada de parceiros</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-muted">Quem entra na bancada passa pela NEST. Só parceiros verificados veem briefs e aparecem para as marcas.</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <ul className={card}>
          {partners.length === 0 && <li className="p-6 text-body text-ink-muted">Nenhum parceiro ainda.</li>}
          {partners.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <div className="min-w-48 flex-1">
                <p className="font-semibold">{p.name} <span className="font-normal text-ink-subtle">· {p.email}</span></p>
                <p className="text-caption text-ink-subtle">{[p.headline, p.skills.join(", "), p.portfolio_url].filter(Boolean).join(" · ") || "Perfil incompleto"}</p>
              </div>
              <StatusBadge {...STATUS[p.status]} />
              {p.status !== "verificado" && <form action={setPartnerStatus.bind(null, p.id, "verificado")}><button className={btnGhost}>Verificar</button></form>}
              {p.status !== "suspenso" && <form action={setPartnerStatus.bind(null, p.id, "suspenso")}><button className={`${btnGhost} text-danger`}>Suspender</button></form>}
            </li>
          ))}
        </ul>
        <aside className={`${card} h-fit p-4`}>
          <h2 className="text-heading font-semibold">Convidar parceiro</h2>
          <p className="mb-4 text-caption text-ink-subtle">Gera um link de acesso. No primeiro acesso a pessoa cria a senha e completa o perfil.</p>
          <PartnerInvite action={invitePartnerAccount} />
        </aside>
      </div>
    </div>
  );
}
