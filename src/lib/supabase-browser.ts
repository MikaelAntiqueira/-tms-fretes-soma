"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cliente Supabase para Client Components — infraestrutura de Supabase Auth
// ([TASK-29] Fase 6, 2026-09-12). Usa @supabase/ssr (pacote oficial
// recomendado pelo Supabase para Next.js App Router, ver
// mcp__supabase__search_docs) para que a sessão de login fique em cookies
// (não em localStorage) — pré-requisito para o servidor conseguir ler a
// sessão no futuro (Server Components/Middleware, ainda não implementado
// nesta etapa por decisão deliberada, ver README).
//
// Uso: SOMENTE para autenticação (login, logout, indicador de sessão —
// src/app/login/page.tsx e src/components/SessionIndicator.tsx). A leitura
// de dados (`supabase.rpc(...)`) de todas as páginas do dashboard continua
// usando o cliente existente em src/lib/supabase.ts (createClient simples,
// @supabase/supabase-js, anon key) — deliberadamente NÃO trocado nesta
// etapa: migrar esse cliente compartilhado exigiria editar todo
// src/app/*/page.tsx (inclusive src/app/financeiro/page.tsx, em edição por
// outro agente em paralelo nesta mesma janela de tempo) só para uma
// funcionalidade (login) que ainda não precisa de leitura de dado
// autenticada — as 5 tabelas de dado seguem públicas por policy própria,
// sem relação com este cliente. Ver nota em src/lib/supabase.ts.
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

export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl!, supabaseAnonKey!);
}
