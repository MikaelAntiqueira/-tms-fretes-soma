import { createClient } from "@supabase/supabase-js";

// Cliente Supabase do lado do backend/servidor (Server Components, Route
// Handlers). Usa a chave publicável (anon/publishable) — NUNCA a service_role
// key aqui. A leitura hoje só funciona porque existe uma policy TEMPORÁRIA de
// leitura pública nas 5 tabelas de fato (ver README.md e a migration
// "policy_leitura_publica_temporaria_v3_scaffold" no Supabase). A Fase 6 da
// migração substitui isso por Supabase Auth + policies reais de admin/user.
//
// [TASK-29] Fase 6 (Supabase Auth, 2026-09-12) — NOTA: este cliente
// continua exatamente como estava, de propósito. A infraestrutura de login
// (@supabase/ssr) foi adicionada em arquivos NOVOS e separados —
// src/lib/supabase-browser.ts (Client Components: login, indicador de
// sessão) e src/lib/supabase-server.ts (Server Components/Route Handlers,
// ainda sem nenhum consumidor) — em vez de migrar este cliente
// compartilhado, que é usado por `.rpc(...)` em TODAS as páginas do
// dashboard hoje (inclusive src/app/financeiro/page.tsx, em edição por
// outro agente em paralelo nesta mesma janela de tempo). Trocar este
// arquivo exigiria editar cada page.tsx para `const supabase = await
// createClient()` em vez de `import { supabase }` — risco desnecessário
// agora, já que a leitura pública não depende de sessão nenhuma. Ver
// README.md, seção "Supabase Auth".
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
