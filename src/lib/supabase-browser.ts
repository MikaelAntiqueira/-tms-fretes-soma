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
// src/app/login/page.tsx e src/components/SessionIndicator.tsx).
//
// [CORRIGIDO 2026-09-15, D-29] A checagem de env var costumava rodar no
// ESCOPO DO MÓDULO (topo do arquivo) e dar `throw` ali mesmo. Como
// `SessionIndicator` é renderizado dentro de `DashboardShell` (presente no
// layout raiz — TODA página, inclusive a `/_not-found` que o Next.js gera e
// pré-renderiza automaticamente em build), um projeto Vercel sem essas duas
// env vars configuradas quebrava o BUILD INTEIRO ("Error occurred
// prerendering page /_not-found") — não só a página que realmente precisa
// do Supabase. Resultado real: "tms-fretes-soma-app" ficou sem nenhum
// deployment de produção válido. Corrigido adiando a checagem pra dentro da
// função — só lança erro quando alguém de fato TENTA logar/ver sessão (em
// runtime, no navegador), nunca durante o build.
export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Faltam as variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL / " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY. Configure-as nas Environment " +
        "Variables do projeto na Vercel (Production, Preview e " +
        "Development) com os valores do projeto Supabase " +
        "'tms-fretes-soma' (jpoizkylaffircimxzrq) — ou, localmente, copie " +
        ".env.local.example para .env.local."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
