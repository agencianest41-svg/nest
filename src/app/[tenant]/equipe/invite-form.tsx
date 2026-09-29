"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { MemberRole, Operation, Region } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/labels";
import { Field } from "@/components/field";
import { btnPrimary, btnSecondary, input } from "@/components/ui";
import type { InviteState } from "./actions";

type Props = {
  action: (prev: InviteState, formData: FormData) => Promise<InviteState>;
  regions: Region[];
  operations: Pick<Operation, "id" | "name" | "region_id">[];
  canInviteHub: boolean;
};

export function InviteForm({ action, regions, operations, canInviteHub }: Props) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as InviteState);
  const [role, setRole] = useState<MemberRole>("lojista");
  const roles = (Object.keys(ROLE_LABEL) as MemberRole[]).filter((r) => r !== "hub" || canInviteHub);

  return (
    <div>
      <form action={formAction} className="space-y-3">
        <Field label="E-mail"><input name="email" type="email" required className={input} /></Field>
        <Field label="Perfil">
          <select name="role" value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className={input}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        {role === "regional" && (
          <Field label="Região">
            <select name="region_id" required className={input} defaultValue="">
              <option value="" disabled>Escolha</option>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        )}
        {role === "lojista" && (
          <Field label="Operação">
            <select name="operation_id" required className={input} defaultValue="">
              <option value="" disabled>Escolha</option>
              {regions.map((r) => (
                <optgroup key={r.id} label={r.name}>
                  {operations.filter((o) => o.region_id === r.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
        )}
        {state.status === "error" && <p role="alert" className="text-body text-danger">{state.message}</p>}
        <button disabled={pending} className={`${btnPrimary} w-full`}>{pending ? "Gerando…" : "Gerar link de acesso"}</button>
      </form>

      {state.status === "ok" && <InviteLink key={state.link} {...state} />}
    </div>
  );
}

function InviteLink({ email, link, existing }: { email: string; link: string; existing: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="mt-4 rounded-sm border border-success/20 bg-success/5 p-3">
      <p className="text-body font-semibold text-success">
        {existing ? "Perfil adicionado." : "Convite criado."} Envie este link para {email}:
      </p>
      <p className="mt-2 break-all rounded-sm bg-canvas p-2 text-caption text-ink-muted">{link}</p>
      <button
        type="button"
        className={`${btnSecondary} mt-2 w-full`}
        onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copiado" : "Copiar link"}
      </button>
      <p className="mt-2 text-caption text-ink-subtle">Link de uso único. Se expirar, gere outro aqui.</p>
    </div>
  );
}
