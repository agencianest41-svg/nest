"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Field } from "@/components/field";
import { slugify } from "@/lib/format";
import { btnPrimary, btnSecondary, input, textarea } from "@/components/ui";
import type { BrandState } from "./actions";

export function BrandForm({ action }: { action: (prev: BrandState, fd: FormData) => Promise<BrandState> }) {
  const [state, run, pending] = useActionState(action, { status: "idle" } as BrandState);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <form action={run} className="space-y-3">
        <Field label="Nome da marca"><input name="name" required value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Óticas Diniz" /></Field>
        <Field label="Endereço">
          <span className="flex items-center gap-1 text-body text-ink-subtle">/<input name="slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder={slugify(name) || "oticas-diniz"} className={input} /></span>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cor principal"><input name="brand" type="color" defaultValue="#1F3A5F" className={`${input} p-1`} /></Field>
          <Field label="Cor de destaque"><input name="accent" type="color" defaultValue="#C9A563" className={`${input} p-1`} /></Field>
        </div>
        <Field label="Regiões (opcional)"><textarea name="regions" rows={2} className={textarea} placeholder="Nordeste, Sudeste, Sul" /></Field>
        <fieldset className="space-y-3 border-t border-line pt-3">
          <legend className="sr-only">Primeira pessoa</legend>
          <p className="text-caption text-ink-subtle">Primeira pessoa (opcional). Depois ela convida o resto pela Equipe da marca.</p>
          <Field label="E-mail"><input name="email" type="email" className={input} placeholder="nome@marca.com.br" /></Field>
          <Field label="Perfil">
            <select name="role" defaultValue="marca" className={input}>
              <option value="marca">Marca (cliente)</option>
              <option value="hub">Hub (estrategista)</option>
            </select>
          </Field>
        </fieldset>
        {state.status === "error" && <p role="alert" className="text-body text-danger">{state.message}</p>}
        <button disabled={pending} className={`${btnPrimary} w-full`}>{pending ? "Criando…" : "Criar marca"}</button>
      </form>
      {state.status === "ok" && (
        <div role="status" className="mt-4 rounded-sm border border-success/20 bg-success/5 p-3">
          <p className="text-body font-semibold text-success">{state.name} criada em /{state.slug}.</p>
          {state.invite && (
            <>
              <p className="mt-2 text-body">Envie este link para {state.invite.email}:</p>
              <p className="mt-1 break-all rounded-sm bg-canvas p-2 text-caption text-ink-muted">{state.invite.link}</p>
              <button type="button" className={`${btnSecondary} mt-2 w-full`} onClick={() => navigator.clipboard.writeText(state.invite!.link).then(() => setCopied(true))}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copiado" : "Copiar link"}
              </button>
            </>
          )}
          <Link href={`/${state.slug}/equipe`} className={`${btnSecondary} mt-2 w-full`}>Abrir equipe da marca</Link>
        </div>
      )}
    </div>
  );
}
