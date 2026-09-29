import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { btnPrimary, input } from "@/components/ui";
import { setPassword } from "./actions";

const ERRORS: Record<string, string> = {
  curta: "A senha precisa ter pelo menos 8 caracteres.",
  diferente: "As senhas não conferem.",
  salvar: "Não foi possível salvar a senha. Tente outra.",
};

export default async function DefinirSenhaPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <p className="label text-ink-subtle">NEST</p>
        <h1 className="mt-2 font-display text-page">Crie sua senha</h1>
        <p className="mt-2 text-body text-ink-muted">Você vai usar {data.user.email} e esta senha nos próximos acessos.</p>
        <form action={setPassword} className="mt-6 space-y-3">
          <label className="block">
            <span className="label text-ink-muted">Senha</span>
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className={`${input} mt-1`} />
          </label>
          <label className="block">
            <span className="label text-ink-muted">Repita a senha</span>
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={`${input} mt-1`} />
          </label>
          {erro && ERRORS[erro] && <p role="alert" className="text-body text-danger">{ERRORS[erro]}</p>}
          <button className={`${btnPrimary} w-full`}>Salvar e entrar</button>
        </form>
      </div>
    </main>
  );
}
