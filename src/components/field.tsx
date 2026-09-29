export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] leading-[18px] font-medium text-ink-muted">{label}</span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
