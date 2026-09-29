"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Field } from "@/components/field";
import { btnPrimary, btnSecondary, input } from "@/components/ui";
import type { PartnerInviteState } from "./actions";

export function PartnerInvite({ action }: { action: (prev: PartnerInviteState, fd: FormData) => Promise<PartnerInviteState> }) {
  const [state, run, pending] = useActionState(action, { status: "idle" } as PartnerInviteState);
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <form action={run} className="space-y-3">
        <Field label="Nome"><input name="name" required className={input} /></Field>
        <Field label="E-mail"><input name="email" type="email" required className={input} /></Field>
        <Field label="Especialidade"><input name="headline" className={input} placeholder="Videomaker, designer…" /></Field>
        <Field label="Habilidades"><input name="skills" className={input} placeholder="reels, motion, fotografia" /></Field>
        <label className="flex items-center gap-2 text-body"><input type="checkbox" name="verified" className="size-4 accent-[var(--brand)]" /> Já verificado (portfólio avaliado)</label>
        {state.status === "error" && <p role="alert" className="text-body text-danger">{state.message}</p>}
        <button disabled={pending} className={`${btnPrimary} w-full`}>{pending ? "Gerando…" : "Gerar convite"}</button>
      </form>
      {state.status === "ok" && (
        <div role="status" className="mt-4 rounded-sm border border-success/20 bg-success/5 p-3">
          <p className="text-body font-semibold text-success">Envie este link para {state.email}:</p>
          <p className="mt-2 break-all rounded-sm bg-canvas p-2 text-caption text-ink-muted">{state.link}</p>
          <button type="button" className={`${btnSecondary} mt-2 w-full`} onClick={() => navigator.clipboard.writeText(state.link).then(() => setCopied(true))}>
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>
      )}
    </div>
  );
}
