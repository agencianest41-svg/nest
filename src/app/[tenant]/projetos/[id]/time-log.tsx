import { Clock } from "lucide-react";
import { todayIso } from "@/lib/month";
import { formatMinutes } from "@/lib/format";
import { btnGhost, input } from "@/components/ui";
import { logTime } from "../actions";

// Lançamento de horas da equipe Hub (invisível para o cliente).
export function TimeLog({ slug, projectId, taskId, minutes, estimate }: {
  slug: string; projectId: string; taskId: string; minutes: number; estimate: number;
}) {
  const over = estimate > 0 && minutes > estimate;
  return (
    <form action={logTime.bind(null, slug, projectId, taskId)} className="rounded-sm border border-dashed border-line-strong p-3">
      <p className="flex items-center gap-1 text-caption text-ink-muted">
        <Clock className="size-3.5" aria-hidden />
        Horas (interno): <span className={`font-semibold tabular ${over ? "text-danger" : ""}`}>{formatMinutes(minutes)}</span>
        {estimate > 0 && <> de {formatMinutes(estimate)} estimadas</>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="w-24"><span className="sr-only">Tempo</span>
          <input name="duration" required className={input} placeholder="1h30" />
        </label>
        <label className="w-36"><span className="sr-only">Dia</span>
          <input type="date" name="worked_on" defaultValue={todayIso()} className={input} />
        </label>
        <label className="min-w-32 flex-1"><span className="sr-only">Nota</span>
          <input name="note" className={input} placeholder="O que foi feito" />
        </label>
        <button className={btnGhost}>Lançar</button>
      </div>
    </form>
  );
}
