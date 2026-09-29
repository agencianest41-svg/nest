import { Lock } from "lucide-react";
import { formatDateTime } from "@/lib/month";
import { displayName } from "@/lib/people";
import type { Comment, Profile } from "@/lib/types";
import { btnSecondary, textarea } from "./ui";

type Props = {
  comments: Comment[];
  people: Map<string, Profile>;
  action: (formData: FormData) => Promise<void>;
  canInternal: boolean;
};

// Conversa de uma tarefa, peça ou projeto. Nota interna só aparece para a equipe Hub.
export function Comments({ comments, people, action, canInternal }: Props) {
  return (
    <div>
      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className={`rounded-sm border p-2 ${c.internal ? "border-accent/60 bg-brand-soft" : "border-line bg-surface"}`}>
              <p className="flex items-center gap-1 text-caption text-ink-subtle">
                <span className="font-semibold text-ink-muted">{displayName(people.get(c.author_id))}</span>
                · {formatDateTime(c.created_at)}
                {c.internal && <span className="inline-flex items-center gap-0.5 font-semibold"><Lock className="size-3" aria-hidden /> interna</span>}
              </p>
              <p className="mt-1 whitespace-pre-line text-body">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="mt-2 space-y-2">
        <label className="block">
          <span className="sr-only">Comentário</span>
          <textarea name="body" rows={2} required maxLength={4000} className={textarea} placeholder="Escreva um comentário…" />
        </label>
        <div className="flex items-center justify-between gap-2">
          {canInternal ? (
            <label className="inline-flex items-center gap-2 text-caption text-ink-muted">
              <input type="checkbox" name="internal" className="size-4 accent-[var(--brand)]" /> Nota interna (só Hub)
            </label>
          ) : <span />}
          <button className={btnSecondary}>Comentar</button>
        </div>
      </form>
    </div>
  );
}
