"use client";

import { useActionState, useState } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { BrandCheckResult } from "@/components/brand-check";
import { btnPrimary, btnSecondary, textarea } from "@/components/ui";
import type { BrandCheckState } from "./check-action";

export function BrandTester({ action }: { action: (prev: BrandCheckState, fd: FormData) => Promise<BrandCheckState> }) {
  const [state, run, pending] = useActionState(action, { status: "idle" } as BrandCheckState);
  // Controlado: o React limpa formulários não controlados depois da ação.
  const [text, setText] = useState("");
  return (
    <form action={run} className="space-y-3">
      <label className="block">
        <span className="label text-ink-muted">Texto (legenda, roteiro, mensagem de WhatsApp…)</span>
        <textarea name="text" rows={6} required value={text} onChange={(e) => setText(e.target.value)} className={`${textarea} mt-1`} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button disabled={pending} className={btnSecondary}><ShieldCheck className="size-4" aria-hidden /> Checar regras</button>
        <button disabled={pending} name="use_ai" value="1" className={btnPrimary}><Sparkles className="size-4" aria-hidden /> {pending ? "Revisando…" : "Revisar com IA"}</button>
      </div>
      <BrandCheckResult state={state} />
    </form>
  );
}
