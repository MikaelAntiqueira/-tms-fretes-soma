// Página de login — infraestrutura de Supabase Auth ([TASK-29] Fase 6,
// 2026-09-12, ver 00_ESTADO_PROJETO.md e 06_LOG_DECISOES.md [DEC-29]:
// admin inicial = mikaelantiqueira@gmail.com, senha definida por ele
// mesmo no primeiro acesso via convite do Supabase Auth, nunca hardcoded
// nem escolhida por um agente).
//
// Middleware de redirecionamento (agent_tasks#3 e #10, 2026-09-14): quem
// não tem sessão é mandado pra cá automaticamente ao tentar acessar
// qualquer página do dashboard, com ?redirect=<rota original>.
//
// O formulário em si mora em LoginForm.tsx (Client Component) porque usa
// useSearchParams(), que precisa estar dentro de um <Suspense> — senão
// `next build` falha ("should be wrapped in a suspense boundary").
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="login-page">
      <Suspense fallback={<div className="card login-card" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
