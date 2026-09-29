import { sendMagicLink, signInWithPassword } from "./actions";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

const ERRORS: Record<string, string> = {
  credenciais: "E-mail ou senha incorretos.",
  email: "Informe um e-mail válido.",
  envio: "Não foi possível enviar o link. Confira se o e-mail foi convidado para a plataforma.",
  limite: "Muitos pedidos de link em pouco tempo. Aguarde alguns minutos ou entre com senha.",
  link: "O link não pôde ser validado. Abra-o no mesmo navegador em que foi pedido, ou entre com senha.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { erro, enviado } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <p className="label text-ink-subtle">NEST</p>
        <h1 className="mt-2 font-display text-page text-ink">Entrar</h1>

        {erro && ERRORS[erro] && (
          <p role="alert" className="mt-4 rounded-sm border border-danger/20 bg-danger/5 p-3 text-body text-danger">{ERRORS[erro]}</p>
        )}
        {enviado && (
          <p role="status" className="mt-4 rounded-sm border border-success/20 bg-success/5 p-3 text-body text-success">
            Link enviado. Abra o e-mail neste mesmo navegador.
          </p>
        )}

        <form action={signInWithPassword} className="mt-6 space-y-3">
          <label className="block">
            <span className="label text-ink-muted">E-mail</span>
            <input name="email" type="email" required autoComplete="email" className={`${input} mt-1`} />
          </label>
          <label className="block">
            <span className="label text-ink-muted">Senha</span>
            <input name="password" type="password" required autoComplete="current-password" className={`${input} mt-1`} />
          </label>
          <button className={`${btnPrimary} w-full`}>Entrar</button>
        </form>

        <details className="mt-6 border-t border-line pt-4">
          <summary className="cursor-pointer text-body font-semibold text-ink-muted hover:text-ink">
            Sem senha? Receber link de acesso por e-mail
          </summary>
          <form action={sendMagicLink} className="mt-3 space-y-3">
            <input name="email" type="email" required autoComplete="email" placeholder="seu@email.com" className={input} />
            <button className={`${btnSecondary} w-full`}>Enviar link de acesso</button>
          </form>
        </details>
      </div>
    </main>
  );
}
