// Proxy de autenticação — protege TODO o dashboard exigindo sessão.
//
// [TASK-29] Fase 6 continuação (2026-09-12) — pedido explícito do Mikael:
// "quero que não tenham acesso a nada sem logar, são dados sensíveis". Isso
// SUBSTITUI a decisão anterior de Fase 6 registrada em src/app/login/page.tsx
// e no README ("NÃO há middleware de redirecionamento forçado nesta etapa
// ... o site inteiro continua público sem login") — aquela decisão está
// revogada a partir de agora.
//
// Contexto da urgência: as 5 policies de leitura (clientes, transportadoras,
// cotacoes, ofertas, contratacoes) já foram restritas de `role public` para
// `role authenticated` (migration `restringir_leitura_a_usuarios_
// autenticados`). Sem este arquivo, qualquer visitante sem sessão ainda
// conseguia abrir as páginas — elas só mostravam dado zerado (RLS bloqueando
// no banco), mas a intenção do Mikael é nem deixar a página carregar sem
// login. Este arquivo fecha essa lacuna na camada de roteamento.
//
// NOME DO ARQUIVO — `src/proxy.ts`, não `src/middleware.ts`: este projeto
// roda Next.js 16.3.5, que DEPRECIOU o file convention "middleware" e
// renomeou para "proxy" (ver node_modules/next/dist/docs/01-app/03-api-
// reference/03-file-conventions/proxy.md, seção "Migration to Proxy" —
// `npx @next/codemod@canary middleware-to-proxy` faz exatamente essa troca
// de nome de arquivo + `export function middleware` -> `export function
// proxy`). Um `src/middleware.ts` ainda funciona nesta versão (build só
// emite aviso de depreciação), mas AGENTS.md deste repo pede
// explicitamente para heed deprecation notices — por isso já nasce como
// `proxy.ts`. A API (NextRequest/NextResponse, `config.matcher`) é
// idêntica; só o nome do arquivo e da função mudou.
//
// Padrão oficial do @supabase/ssr para Next.js App Router (mcp__supabase__
// search_docs, guia "Creating a Supabase client for SSR" → seção Next.js →
// "Hook up proxy"/updateSession) com duas diferenças deliberadas em relação
// ao exemplo padrão da Supabase:
//
//   1. Usa `supabase.auth.getUser()` em vez de `getClaims()` — pedido
//      explícito do Mikael nesta tarefa. Os dois revalidam contra o
//      servidor de Auth (ao contrário de `getSession()`, que só lê o
//      cookie local e NUNCA deve ser usado para proteger rotas — a doc do
//      Supabase é enfática nisso); `getClaims()` é a recomendação mais
//      recente por evitar 1 round-trip de rede (valida a assinatura do JWT
//      localmente), mas `getUser()` é igualmente seguro para este uso
//      (chama o servidor Auth a cada request) e é a API mais estável/
//      conhecida — mantido por decisão explícita, não por desconhecimento
//      da alternativa mais nova.
//   2. Redireciona de volta pra "/" quem já está logado e tenta abrir
//      /login (evita a tela de login pra quem já tem sessão).
//
// IMPORTANTE (documentado no exemplo oficial): nunca criar o cliente
// Supabase fora do handler da request (module-level) — em ambientes com
// Fluid Compute / instâncias reaproveitadas isso pode vazar sessão de um
// usuário para outro. Este arquivo sempre cria o client dentro de proxy(),
// por request.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Não rodar nenhum código entre createServerClient() e getUser() — um
  // erro simples aqui pode deslogar usuários aleatoriamente (nota do guia
  // oficial). getUser() revalida o JWT contra o servidor de Auth a cada
  // chamada (diferente de getSession(), que NUNCA deve ser usada aqui).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname === "/login" || pathname.startsWith("/login/");

  if (!user && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // IMPORTANTE (nota do guia oficial): é preciso devolver o objeto
  // supabaseResponse tal como está — se criar uma nova response, copie os
  // cookies dela antes, senão o navegador e o servidor saem de sincronia e
  // a sessão do usuário pode terminar prematuramente.
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Roda em toda rota, EXCETO:
     * - /_next/static (arquivos estáticos do build)
     * - /_next/image (otimização de imagem)
     * - /favicon.ico
     * - /icon (favicon dinâmico gerado por src/app/icon.tsx)
     * - qualquer path com extensão de arquivo (imagens, fontes, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|icon|.*\\..*).*)",
  ],
};
