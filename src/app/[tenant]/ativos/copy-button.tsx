"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { btnSecondary } from "@/components/ui";

// Copia o texto pronto (ex.: mensagem para Grupo VIP) e registra o uso.
export function CopyButton({ text, onCopied }: { text: string; onCopied: () => Promise<void> }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={btnSecondary}
      onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); void onCopied(); })}>
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {done ? "Copiado" : "Copiar texto"}
    </button>
  );
}
