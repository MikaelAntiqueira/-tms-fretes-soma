"use client";

// Página de login — infraestrutura de Supabase Auth ([TASK-29] Fase 6,
// 2026-09-12, ver 00_ESTADO_PROJETO.md e 06_LOG_DECISOES.md [DEC-29]:
// admin inicial = mikaelantiqueira@gmail.com, senha definida por ele
// mesmo no primeiro acesso via convite do Supabase Auth, nunca hardcoded
// nem escolhida por um agente). Formulário simples de e-mail/senha,
// usando os tokens visuais já existentes (.card/.app-shell, cores da
// paleta em globals.css) — sem inventar componente novo de layout.
//
// Middleware de redirecionamento (agent_tasks#3 e #10, 2026-09-14): quem
// não tem sessão é mandado pra cá automaticamente ao tentar acessar
// qualquer página do dashboard, com ?redirect=<rota original> — o submit
// abaixo lê esse parâmetro e volta pra lá em vez de ir sempre pra "/".
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

    const destino = searchParams.get("redirect") || "/";
    router.push(destino);
    router.refresh();
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        <h1>Entrar</h1>
        <p className="sub">
          Acesso ao TMS Fretes SOMA. É preciso estar logado para ver o
          dashboard — sem sessão, você é redirecionado pra cá
          automaticamente.
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
      </div>
    </div>
  );
}
