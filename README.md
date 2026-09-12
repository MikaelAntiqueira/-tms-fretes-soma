# TMS Fretes SOMA — V3 (Next.js + Supabase)

Camada de inteligência sobre o TMS do Grupo SOMA/RS Produtos Hospitalares —
comparação **Frete Cotado × Frete Contratado**. Este repositório é a
**migração V3** do dashboard atual (um Artifact HTML/Chart.js alimentado por
um pipeline Python em lote) para **Next.js (App Router, TypeScript, Tailwind
CSS) + Supabase (Postgres/Auth)**, hospedado na Vercel.

## Documento-mãe — leia antes de mexer em qualquer coisa

Este projeto **não reinventa a arquitetura** — ele segue um plano de migração
já auditado e aprovado, feito com a versão anterior (Artifact + pipeline
Python) como fonte da verdade de negócio. Antes de qualquer mudança
estrutural, leia:

> `docs/mapa-migracao-tms-v3-2026-09-11.md` no repositório do projeto original
> (`PROJETO FRETE COTADO X FRETE CONTRATADO`, no Google Drive compartilhado
> "Transportes RS"). Cobre: auditoria da arquitetura atual, mapa de dados,
> mapa de regras de negócio, schema Postgres proposto, riscos da migração,
> plano de rollback, plano de testes e as 10 fases de implementação.

Regras de negócio de ~9 meses de decisões (o que "diferença financeira" pode
e não pode significar, por que "Região Comercial" não é UF, por que prazo de
oferta perdida nunca é inventado, etc.) vivem em `memoria/06_LOG_DECISOES.md`
e `memoria/16_PROMPT_MESTRE.md` do projeto original. **Não portar lógica de
negócio para cá sem checar essas fontes primeiro.**

## Estado desta etapa (Fase 5 — início)

Este commit é **só o esqueleto**: projeto Next.js criado, conectado ao
Supabase já populado (Fase 4 concluída), com uma única página de prova de
conceito. **O dashboard completo (5 páginas, 16 gráficos, motor de filtro,
10 tabelas) ainda não foi portado** — isso acontece nas fases seguintes, uma
página/componente de cada vez, sempre comparando com os números do Artifact
atual antes de avançar.

A página inicial (`/`) mostra 4 números reais, direto do Supabase, como teste
de conexão:

- Total de cotações (`cotacoes`)
- Total de contratações (`contratacoes`)
- Contratações cruzadas com uma cotação (`cotacao_id` preenchido)
- Frete Contratado somado **só** das contratações cruzadas — precisa bater
  **R$ 494.417,43** (mesmo número validado no dashboard atual). Se esse valor
  divergir, é um bloqueio real: pare e investigue antes de portar mais nada.

## Aviso importante — policy de leitura temporária no Supabase

RLS (Row Level Security) está habilitada em todas as tabelas. Para as 5
tabelas de dado (`clientes`, `transportadoras`, `cotacoes`, `ofertas`,
`contratacoes`) existe uma **policy temporária e explícita de leitura
pública**:

```sql
-- PROVISÓRIO — só o Mikael decide quando remover/substituir, ver seção
-- "Supabase Auth" abaixo (Fase 6 construiu a infraestrutura de login AO
-- LADO desta policy, sem removê-la).
create policy "leitura publica temporaria" on public.cotacoes for select using (true);
create policy "leitura publica temporaria" on public.ofertas for select using (true);
create policy "leitura publica temporaria" on public.contratacoes for select using (true);
create policy "leitura publica temporaria" on public.clientes for select using (true);
create policy "leitura publica temporaria" on public.transportadoras for select using (true);
```

Aplicada via migration `policy_leitura_publica_temporaria_v3_scaffold` no
projeto Supabase `jpoizkylaffircimxzrq` (tms-fretes-soma). **Não é a política
final de segurança do projeto** — qualquer pessoa com a URL do Supabase e a
chave publicável (anon) hoje consegue ler (não escrever) essas 5 tabelas.
Removê-la é uma decisão FUTURA e deliberada do Mikael (ele está usando o site
publicamente agora) — não uma consequência automática de ter Auth pronto.

## Supabase Auth ([TASK-29] Fase 6 — infraestrutura, 2026-09-12)

Infraestrutura de login construída **ao lado** do acesso público acima, sem
substituí-lo:

- **Admin inicial**: `mikaelantiqueira@gmail.com` ([DEC-29]), convidado pelo
  painel do Supabase Auth — a senha é definida por ele mesmo no primeiro
  acesso (link de convite/recuperação), nunca hardcoded neste repositório.
- **`@supabase/ssr`** (pacote oficial recomendado pelo Supabase para o App
  Router) foi adicionado em arquivos NOVOS — `src/lib/supabase-browser.ts`
  (Client Components: login, indicador de sessão) e
  `src/lib/supabase-server.ts` (Server Components/Route Handlers, ainda sem
  consumidor). O cliente compartilhado existente, `src/lib/supabase.ts`
  (`@supabase/supabase-js` simples, usado por `.rpc(...)` em todas as
  páginas), **não foi trocado** — ver a nota no topo desse arquivo.
- **`/login`** (`src/app/login/page.tsx`): formulário de e-mail/senha
  (`supabase.auth.signInWithPassword`), redireciona para `/` depois de
  logar. Visitar essa página é opcional.
- **Indicador de sessão**: rodapé da sidebar (`SessionIndicator`, dentro de
  `DashboardShell.tsx`) mostra "Visitante" sem sessão, ou o e-mail + botão
  "Sair" com sessão ativa — puramente informativo, não bloqueia nada.
- **Sem middleware nesta etapa** — decisão deliberada, não esquecida.
  Redirecionar visitantes para `/login` só faz sentido depois que as
  policies públicas acima forem removidas (decisão futura do Mikael); fazer
  isso agora quebraria o acesso público em uso.
- **`profiles`**: um trigger (`handle_new_user`, migration
  `auth_fase6_profile_provisioning_e_importacoes_policy`) cria
  automaticamente a linha em `public.profiles` quando um usuário aparece em
  `auth.users` — `role='admin'` só para o e-mail acima, `role='user'` para
  qualquer outro. `public.importacoes` (RLS habilitada, sem nenhuma policy
  até então — ninguém conseguia escrever) ganhou uma policy nova de escrita
  só para admin autenticado; nenhuma policy pública existente foi tocada.

## Stack e decisões técnicas desta etapa

- **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4** — criado com
  `create-next-app`.
- **`@supabase/supabase-js`** com a chave **publicável (anon)**, nunca a
  `service_role` — variáveis em `.env.local` (fora do Git; veja
  `.env.local.example`).
- **Identidade visual portada 1:1** do Artifact atual (Etapa 1.1 do mapa de
  migração): tokens de cor (`--brand-900` a `--brand-300`, semânticas
  good/warning/serious/critical, paleta categórica `--t1`–`--t7`), tipografia
  Manrope (títulos) + IBM Plex Sans (texto) + IBM Plex Mono (números), dark
  mode automático (`prefers-color-scheme`) e manual (`data-theme`, com um
  alternador de tema na página). Ver `src/app/globals.css`.
- **Filtro/gráficos/páginas do dashboard: ainda não portados** — de propósito,
  para não misturar "criar o esqueleto" com "portar 9 meses de lógica de
  negócio" no mesmo commit.

## Rodando localmente

```bash
npm install
cp .env.local.example .env.local   # preencha com a URL e a chave publicável do Supabase
npm run dev
```

Variáveis de ambiente necessárias (mesmas na Vercel):

| Variável | Onde obter |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API, projeto `jpoizkylaffircimxzrq` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem — chave publicável (anon), nunca a `service_role` |

## Deploy

Conectado ao projeto Vercel **`tms-fretes-soma`** (time `tms-fretes-soma`) via
Git — cada push em `main` gera um deploy de produção automaticamente.

## O que NÃO está neste repositório (de propósito)

- O pipeline Python (`parse_cotacoes.py`, `parse_contratados.py`,
  `enrich_dashboard_data.py`) continua rodando onde está, sem mudanças — a
  migração é incremental, os dois sistemas rodam em paralelo até a Fase 9
  (validação) ser aprovada.
- O Artifact HTML/Chart.js atual continua no ar, sem mudanças.
- Middleware de proteção de rota (redirecionar visitante pra `/login`) — só
  depois que as policies públicas temporárias forem removidas, decisão
  futura do Mikael (ver seção "Supabase Auth" acima).
- A área administrativa de importação (usar a policy nova de `importacoes`
  para de fato subir um arquivo) — fase futura.
