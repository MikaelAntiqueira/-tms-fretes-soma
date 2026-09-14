import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Middleware de autenticação — TASK-3 / agent_tasks#3 e #10 (2026-09-14).
//
// As 5 tabelas de dado (clientes, cotacoes, ofertas, contratacoes,
// transportadoras) já restringem SELECT a `role authenticated` desde
// 2026-09-12 (migration restringir_leitura_a_usuarios_autenticados), mas
// até agora não havia nenhum redirecionamento: um visitante sem sessão
// via cada página do dashboard com todos os KPIs/gráficos vazios, sem
// nenhum aviso de que precisava logar. Decisão do Mikael (2026-09-14):
// manter o acesso restrito e criar este middleware agora, em vez de
// reverter para leitura pública.
//
// Segue o padrão oficial do @supabase/ssr para o Next.js App Router (o
// mesmo cliente cookie-aware já usado em src/lib/supabase-server.ts) —
// chama supabase.auth.getUser() para revalidar o token contra o Supabase
// Auth a cada requisição, não confiando só no cookie local.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
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
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: não remover esta chamada nem trocar por getSession() — só
  // getUser() revalida o token direto no servidor do Supabase Auth
  // (getSession() confiaria no cookie sem checar revogação).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!user && !isLoginPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

// Exclui assets estáticos e imagens do matcher — só páginas reais passam
// pelo middleware. /login fica incluído de propósito (precisa do cliente
// Supabase cookie-aware acima para checar "já logado" no futuro, se
// alguém adicionar esse redirecionamento reverso depois).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
