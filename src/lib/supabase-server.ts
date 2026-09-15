import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Cliente Supabase cookie-aware para Server Components / Route Handlers —
// infraestrutura de Supabase Auth ([TASK-29] Fase 6, 2026-09-12, ver
// 00_ESTADO_PROJETO.md e README.md). Segue o padrão oficial do
// @supabase/ssr para o App Router.
//
// [ATUALIZADO 2026-09-14, D-28] O comentário original dizia "nenhuma página
// chama isto ainda" e "não há middleware nesta etapa" — desatualizado desde
// a Fase 6 (proxy.ts). Ver requireUser() abaixo, adicionado como camada
// REDUNDANTE ao proxy.ts depois do achado [D-27]: a Vercel tem um bug
// conhecido (vercel/next.js#93852) de empacotamento intermitente da função
// de middleware/proxy em Next.js 16 — quando ela falha ao invocar, o
// visitante vê a tela genérica "This page couldn't load" da própria
// Vercel, ANTES de qualquer código nosso rodar (confirmado: logs do
// Supabase mostram ZERO tráfego do app durante os erros relatados pelo
// Mikael com print, mesmo com o fix de next.config.ts já publicado). Como
// não dá para garantir que o fix do @vercel/nft elimina 100% da
// intermitência, cada página protegida agora TAMBÉM chama requireUser() —
// isso roda dentro da função normal da PÁGINA (não da função separada de
// middleware/proxy), então não é afetado pelo mesmo bug de empacotamento.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado de dentro de um Server Component sem permissão de
            // escrever cookie — o proxy.ts (quando invocado com sucesso) é
            // quem revalida/renova a sessão a cada request; aqui só importa
            // para Route Handlers.
          }
        },
      },
    }
  );
}

// Guarda de autenticação a nível de PÁGINA — ver comentário acima ([D-28]).
// Chamar no topo de todo Server Component de página protegida, antes de
// buscar qualquer dado: `await requireUser("/operacao")`. Redireciona para
// /login (preservando a página de origem em ?redirect=, passada
// explicitamente — não dá pra confiar em cabeçalho de pathname aqui, já
// que o objetivo inteiro é não depender de nada que passe pela função de
// middleware/proxy) se não houver sessão válida. Mesma checagem que o
// proxy.ts já faz (auth.getUser(), nunca getSession() — revalida contra o
// servidor de Auth a cada chamada), só que como rede de segurança
// independente da função de middleware.
export async function requireUser(currentPath?: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(currentPath ? `/login?redirect=${encodeURIComponent(currentPath)}` : "/login");
  }

  return user;
}
