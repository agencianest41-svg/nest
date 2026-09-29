import { formatDateTime } from "@/lib/month";
import { displayName } from "@/lib/people";
import { ENTITY_LABEL, statusLabel } from "@/lib/labels";
import type { Activity, Profile } from "@/lib/types";

// Linha do tempo: quem fez o quê, quando. Vem de activity_log (triggers no banco).
export function Timeline({ items, people, empty = "Nada registrado ainda." }: {
  items: Activity[];
  people: Map<string, Profile>;
  empty?: string;
}) {
  if (!items.length) return <p className="px-4 py-3 text-body text-ink-muted">{empty}</p>;
  return (
    <ol>
      {items.map((a) => (
        <li key={a.id} className="border-b border-line px-4 py-2.5 last:border-0">
          <p className="text-caption text-ink-subtle tabular">
            {formatDateTime(a.created_at)} · {a.actor_id ? displayName(people.get(a.actor_id)) : "Sistema"}
          </p>
          <p className="text-body">
            <span className="text-ink-muted">{a.title ? describe(a) : describe(a).replace(/:$/, "")}</span>{" "}
            {a.title && <span className="font-semibold">{a.title}</span>}
          </p>
        </li>
      ))}
    </ol>
  );
}

function describe(a: Activity) {
  const what = (ENTITY_LABEL[a.entity_type] ?? a.entity_type).toLowerCase();
  switch (a.action) {
    case "criou": return `Criou ${what}:`;
    case "removeu": return `Removeu ${what}:`;
    case "atualizou": return `Atualizou ${what}:`;
    case "status": return `Moveu ${what} para ${statusLabel(a.entity_type, a.meta.para)}:`;
    default: return `${what}:`;
  }
}
