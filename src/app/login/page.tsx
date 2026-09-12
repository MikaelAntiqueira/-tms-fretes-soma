"use client";

// Página de login — infraestrutura de Supabase Auth ([TASK-29] Fase 6,
// 2026-09-12, ver 00_ESTADO_PROJETO.md e 06_LOG_DECISOES.md [DEC-29]:
// admin inicial = mikaelantiqueira@gmail.com, senha definida por ele
// mesmo no primeiro acesso via convite do Supabase Auth, nunca hardcoded
// nem escolhida por um agente). Formulário simples de e-mail/senha,
// usando os tokens visuais já existentes (.card/.app-shell, cores da
// paleta em globals.css) — sem inventar componente novo de layout.
//
// NÃO há middleware de redirecionamento forçado nesta etapa (decisão
// deliberada, ver README, seção "Supabase Auth"): visitar esta página é
// opcional, e o site inteiro continua público sem login. Depois de logar,
// redireciona para "/" só para voltar ao dashboard — não desbloqueia
// nenhuma área exclusiva ainda.
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setErro(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        <h1>Entrar</h1>
        <p className="sub">
          Acesso administrativo do TMS Fretes SOMA. O site continua público para
          qualquer visitante sem login — entrar aqui só mostra sua sessão ativa,
          ainda não desbloqueia nenhuma área exclusiva.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {erro && <div className="status-banner erro">{erro}</div>}

          <button type="submit" className="form-submit-btn" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="login-note">
          Esqueceu a senha ou ainda não definiu uma? Use o link enviado por
          e-mail pelo Supabase Auth (convite/recuperação de senha) — nenhuma
          senha é definida por este site.
        </p>

        <p className="login-note">
          <Link href="/">← Voltar para o dashboard sem logar</Link>
        </p>
      </div>
    </div>
  );
}
