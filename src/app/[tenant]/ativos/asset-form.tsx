"use client";

import { startTransition, useActionState, useState } from "react";
import { Upload } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { ASSET_KIND, kindFromMime, type AssetKind } from "@/lib/assets";
import { Field } from "@/components/field";
import { btnPrimary, input, textarea } from "@/components/ui";
import type { CreateAssetState } from "./actions";

type Props = {
  tenantId: string;
  action: (prev: CreateAssetState, fd: FormData) => Promise<CreateAssetState>;
  isManager: boolean;
  operations: { id: string; name: string }[];
  events: { id: string; title: string }[];
  parentId?: string;
  submitLabel?: string;
};

const MODES = [
  { key: "arquivo", label: "Arquivo" },
  { key: "link", label: "Link" },
  { key: "texto", label: "Texto pronto" },
] as const;

// Upload vai direto do navegador para o Storage (pasta do tenant); o servidor
// só registra o ativo. Assim arquivos grandes não passam pela Server Action.
export function AssetForm({ tenantId, action, isManager, operations, events, parentId, submitLabel = "Salvar ativo" }: Props) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as CreateAssetState);
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("arquivo");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    fd.delete("file");
    if (mode === "arquivo") {
      if (!(file instanceof File) || !file.size) return setError("Escolha um arquivo.");
      if (file.size > 100 * 1024 * 1024) return setError("Arquivo acima de 100 MB.");
      setUploading(true);
      const safe = file.name.normalize("NFD").replace(/[^\w.-]+/g, "-").slice(-80);
      const path = `${tenantId}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await createBrowserSupabase().storage.from("assets").upload(path, file, { contentType: file.type || undefined });
      setUploading(false);
      if (upErr) return setError("Falha no envio do arquivo. Tente de novo.");
      fd.set("storage_path", path);
      fd.set("mime_type", file.type);
      fd.set("size_bytes", String(file.size));
      if (!fd.get("kind")) fd.set("kind", kindFromMime(file.type));
    }
    if (mode === "link") fd.set("kind", fd.get("kind") || "link");
    if (mode === "texto") fd.set("kind", "texto");
    startTransition(() => formAction(fd));
  }

  const busy = pending || uploading;
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {parentId && <input type="hidden" name="parent_asset_id" value={parentId} />}
      <div className="flex gap-1" role="tablist" aria-label="Tipo de conteúdo">
        {MODES.map((m) => (
          <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} onClick={() => setMode(m.key)}
            className={`h-8 flex-1 rounded-sm text-body font-semibold ${mode === m.key ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-brand-soft"}`}>
            {m.label}
          </button>
        ))}
      </div>
      <Field label="Título"><input name="title" required className={input} /></Field>
      {mode === "arquivo" && (
        <>
          <Field label="Arquivo (até 100 MB)"><input type="file" name="file" required className="block w-full text-body file:mr-3 file:rounded-sm file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:font-semibold" /></Field>
          <Field label="Tipo">
            <select name="kind" defaultValue="" className={input}>
              <option value="">Detectar pelo arquivo</option>
              {(Object.keys(ASSET_KIND) as AssetKind[]).filter((k) => k !== "link" && k !== "texto").map((k) => <option key={k} value={k}>{ASSET_KIND[k]}</option>)}
            </select>
          </Field>
        </>
      )}
      {mode === "link" && <Field label="Link (https)"><input name="url" type="url" required placeholder="https://drive.google.com/…" className={input} /></Field>}
      {mode === "texto" && <Field label="Texto (legenda, mensagem de WhatsApp, roteiro…)"><textarea name="body" rows={5} required className={textarea} /></Field>}
      <Field label="Descrição / como usar"><textarea name="description" rows={2} className={textarea} /></Field>
      <Field label="Tags (separadas por vírgula)"><input name="tags" className={input} placeholder="black friday, stories, vitrine" /></Field>
      {events.length > 0 && (
        <Field label="Campanha / data">
          <select name="calendar_event_id" defaultValue="" className={input}>
            <option value="">—</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </Field>
      )}
      {(operations.length > 0) && (
        <Field label={isManager ? "Operação (vazio = rede toda)" : "Operação"}>
          <select name="operation_id" defaultValue={isManager ? "" : operations[0]?.id} className={input} required={!isManager}>
            {isManager && <option value="">Rede toda</option>}
            {operations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      )}
      {isManager && (
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" name="official" defaultChecked={!parentId} className="size-4 accent-[var(--brand)]" /> Oficial da marca (visível para toda a rede)
        </label>
      )}
      {(error || state.status === "error") && <p role="alert" className="text-body text-danger">{error ?? (state.status === "error" ? state.message : "")}</p>}
      <button disabled={busy} className={`${btnPrimary} w-full`}>
        <Upload className="size-4" aria-hidden /> {uploading ? "Enviando arquivo…" : pending ? "Salvando…" : submitLabel}
      </button>
    </form>
  );
}
