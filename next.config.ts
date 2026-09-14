import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // [FIX 2026-09-14] "This page couldn't load" intermitente em produção,
  // em QUALQUER página (não era bug de dado/banco — confirmado por logs do
  // Supabase 100% saudáveis durante os erros). Causa: bug conhecido da
  // Vercel com Next.js 16.2.x/16.3.x + `src/proxy.ts` — desde o Next 16,
  // proxy.ts roda SEMPRE em runtime Node.js (não dá pra escolher outro), e
  // o rastreador de arquivos da Vercel (`@vercel/nft`) não empacota
  // `@swc/helpers/esm/*` nas funções Lambda por causa de um export
  // condicional do pacote (`package.json` do @swc/helpers aponta pra ESM
  // em ambiente ESM, mas o nft só segue o branch CJS) — a função quebra na
  // hora de dar require nesse módulo ausente. Ver vercel/next.js#93852 e
  // Vercel Community #41956 (mesmo sintoma: MIDDLEWARE_INVOCATION_FAILED /
  // FUNCTION_INVOCATION_FAILED intermitente, banco e app saudáveis).
  // Fix: forçar o nft a incluir esses arquivos explicitamente. Confirmado
  // localmente (build): antes do fix nenhum .nft.json referenciava
  // @swc/helpers/esm; depois, as 12 funções (middleware + 10 páginas +
  // rota do ícone) passaram a trazer esses arquivos.
  outputFileTracingIncludes: {
    "*": ["./node_modules/@swc/helpers/esm/**"],
  },
};

export default nextConfig;
