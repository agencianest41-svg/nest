import { todayIso } from "@/lib/month";
import { CHANNEL, METRIC_FIELDS } from "@/lib/results";
import { Field } from "./field";
import { btnSecondary, input } from "./ui";

// Lançamento manual de resultado (enquanto as integrações não estão ligadas).
export function ResultForm({ action, compact = false }: { action: (fd: FormData) => Promise<void>; compact?: boolean }) {
  const fields = compact ? METRIC_FIELDS.filter((f) => ["reach", "likes", "comments", "shares", "saves", "leads", "sales_count"].includes(f.key)) : METRIC_FIELDS;
  return (
    <form action={action} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Field label="Canal">
        <select name="channel" defaultValue="instagram" className={input}>
          {Object.entries(CHANNEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Medido em"><input type="date" name="measured_on" required defaultValue={todayIso()} className={input} /></Field>
      {fields.map((f) => (
        <Field key={f.key} label={f.label}><input name={f.key} inputMode="numeric" className={input} placeholder="0" /></Field>
      ))}
      <Field label="Receita (R$)"><input name="revenue" inputMode="decimal" className={input} placeholder="0" /></Field>
      <div className="col-span-2 sm:col-span-4"><Field label="Link do post (https)"><input name="published_url" className={input} /></Field></div>
      <div className="col-span-2 flex justify-end sm:col-span-4"><button className={btnSecondary}>Registrar resultado</button></div>
    </form>
  );
}
