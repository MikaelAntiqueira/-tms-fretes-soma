import { createClient } from "@supabase/supabase-js";

// Cliente Supabase do lado do backend/servidor (Server Components, Route
// Handlers). Usa a chave publicável (anon/publishable) — NUNCA a service_role
// key aqui. A leitura hoje só funciona porque existe uma policy TEMPORÁRIA de
// leitura pública nas 5 tabelas de fato (ver README.md e a migration
// "policy_leitura_publica_temporaria_v3_scaffold" no Supabase). A Fase 6 da
// migração substitui isso por Supabase Auth + policies reais de admin/user.
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
