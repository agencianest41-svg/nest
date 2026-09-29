"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { btnGhost } from "@/components/ui";

// Tenta a API de clipboard; sem permissão (iframe, http), cai para o método
// antigo com textarea temporária. Se nada funcionar, avisa para copiar à mão.
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

export function CopyText({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  return (
    <button type="button" className={btnGhost}
      onClick={async () => {
        setState((await copy(text)) ? "done" : "fail");
        setTimeout(() => setState("idle"), 2500);
      }}>
      {state === "done" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{state === "done" ? "Copiado" : state === "fail" ? "Selecione e copie" : label}</span>
    </button>
  );
}
