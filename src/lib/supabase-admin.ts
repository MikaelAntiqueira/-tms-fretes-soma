import { createClient } from "@supabase/supabase-js";

// Cliente Supabase com a service_role key — acesso total ao projeto,
// ignora RLS. NUNCA importar isto em "use client" nem em qualquer código
// que rode no navegador; só em Route Handlers (roda no servidor da
// Vercel). Único uso hoje: criar usuário direto (POST /api/usuarios/criar,
// tela /usuarios, 2026-09-21) — a Admin API do Supabase Auth
// (auth.admin.createUser) só existe com esta chave; a sessão normal do
// admin (anon key + RLS) não alcança auth.users.
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Falta a variável de ambiente SUPABASE_SERVICE_ROLE_KEY (Project Settings → API → service_role, no painel do projeto Supabase 'tms-fretes-soma', jpoizkylaffircimxzrq). " +
        "Configure-a nas Environment Variables da Vercel (Production, Preview e Development) e, localmente, em .env.local — NUNCA com prefixo NEXT_PUBLIC_ (essa chave não pode chegar ao navegador)."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
