import { createClient } from "@supabase/supabase-js";

// [TASK-29] Fase 6 continuação (2026-09-12) — SEM CONSUMIDORES a partir
// desta etapa. Este cliente NUNCA envia o JWT do usuário logado (não é
// cookie-aware) — funcionava enquanto havia policy de leitura pública
// temporária, mas quebrou (dado zerado pra todo mundo) assim que as 5
// policies de leitura foram restritas a `role authenticated` (migration
// `restringir_leitura_a_usuarios_autenticados`). Todas as páginas que
// usavam `.rpc(...)` com este cliente (src/app/page.tsx, ontem, operacao,
// financeiro, transportadoras, e src/components/SidebarStats.tsx) migraram
// para `createSupabaseServerClient()` de src/lib/supabase-server.ts
// (@supabase/ssr + cookies() do next/headers), que lê a sessão do usuário
// via cookie e envia o JWT certo nas chamadas PostgREST/RPC. Mantido aqui,
// sem uso, por segurança (não deletar sem confirmar que nada mais importa
// dele) — ver src/lib/supabase-server.ts para o cliente atual.
//
// Histórico anterior (mantido para contexto): cliente do lado do
// backend/servidor (Server Components, Route Handlers). Usa a chave
// publicável (anon/publishable) — NUNCA a service_role key aqui.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltam as variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL / " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY. Copie .env.local.example para " +
      ".env.local e preencha com os valores do projeto Supabase " +
      "'tms-fretes-soma' (jpoizkylaffircimxzrq)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
