import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente Supabase cookie-aware para Server Components / Route Handlers —
// infraestrutura de Supabase Auth ([TASK-29] Fase 6, 2026-09-12, ver
// 00_ESTADO_PROJETO.md e README.md). Segue o padrão oficial do
// @supabase/ssr para o App Router (mcp__supabase__search_docs: lib/supabase/
// server.ts com createServerClient + cookies() de next/headers).
//
// AINDA NÃO USADO por nenhuma página existente nesta etapa — todas
// continuam lendo dados via src/lib/supabase.ts, sem mudança nenhuma (ver
// nota lá e em supabase-browser.ts). Fica pronto para quando alguma rota
// precisar checar a sessão no SERVIDOR (ex.: uma área administrativa, ou
// proteger uma página depois que as policies públicas temporárias forem
// removidas — decisão futura do Mikael, não desta etapa). Próximo passo
// deliberado, não esquecido: nenhuma página chama isto ainda, e não há
// middleware nesta etapa (ver README, seção Supabase Auth).
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
            // Chamado de dentro de um Server Component — pode ser ignorado
            // se uma Middleware/Proxy for atualizar a sessão. Esta etapa
            // não tem middleware (decisão deliberada, ver README), então
            // isto só importa quando um Route Handler futuro chamar esta
            // function.
          }
        },
      },
    }
  );
}
