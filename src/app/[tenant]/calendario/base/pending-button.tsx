"use client";

import { useFormStatus } from "react-dom";

// Botão que mostra o estado enquanto a ação do formulário roda (a IA leva alguns segundos).
export function PendingButton({ className, pendingLabel, children, confirm }: {
  className: string; pendingLabel: string; children: React.ReactNode; confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className={className}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
