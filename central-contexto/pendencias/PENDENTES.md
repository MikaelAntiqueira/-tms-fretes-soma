# Pendências — TMS Fretes SOMA

> Tarefas abertas e esperando ação. Última atualização: 2026-09-13.
> Fonte: roadmap do README + análise das sessõs do outro PC.

## Filtro Global — Fase 1 (11/11 dimensões prontas, 2026-09-14)

- [x] Completar as 7 dimensões restantes do Filtro Global:
      romaneio, esc (escolheu a mais barata), prazo, cidade, janela, faixaPeso, faixaCubagem —
      migrations `fn_filtro_global_fase1_7_dimensoes_restantes` +
      `fn_filtro_opcoes_add_cidade_romaneio_prazo`, commit `0ffce75` (sessão principal,
      2026-09-14). `v_cotacao_filtros` estendida reaproveitando `v_financeiro_padroes_base`/
      bins de `financeiro_peso_frete`/CASE de janela de `transportadoras_comparativo` — nenhuma
      lógica nova. Baseline validado sem regressão (494.417,43 / 6.915 / 5.194 / 45.938,44).
      **Pendente**: confirmação de `tsc`/`build` limpo (rodar na máquina do Hermes — a principal
      ficou sem RAM pro `npm install`).

### A fazer agora
- [ ] Implementar cascata de opções (dropdown filtrado por outros filtros ativos)
- [ ] Fazer outras páginas reagirem ao filtro (além de /financeiro Visão Geral)
- [ ] Validar as 11 dimensões campo a campo contra o Artifact original (só as 4 da Fase 1 foram
      validadas por Playwright até agora)

### Dependências
- Client-side cascade logic (ou extensão das RPCs existentes)

## Dashboard completo (fase futura)

### Gráficos restantes — inventário corrigido em 2026-09-14

> A cifra "16 gráficos restantes" (herdada do mapa de migração, que descreve os
> 16 gráficos do Artifact TODO, não os que faltam) estava desatualizada — 13
> dos 16 já tinham sido portados nos commits anteriores. Auditoria feita
> comparando os 16 `upsertChart(...)` do Artifact original (`c0abf79e`, v39)
> com os componentes já existentes em `src/app/*/`:
>
> | Canvas original | Onde já está portado |
> |---|---|
> | chartEvolucao, chartEconomiaMes, chartEscolheu | `financeiro/CotadoContratadoCharts.tsx` |
> | chartDiffPrazo, chartDiffUf, chartDiffTransp, chartDiffTipo | `financeiro/PadroesCharts.tsx` |
> | chartPeso | `financeiro/PesoCustoCharts.tsx` |
> | chartPrazo | `transportadoras/PrecoPrazoChart.tsx` |
> | chartContrxBarata, chartMaisBarata | `transportadoras/ComparativoCharts.tsx` |
> | chartUf | `transportadoras/RegiaoComercialChart.tsx` |
> | chartClientes | `transportadoras/ClientesChart.tsx` |
> | chartQuadrante | `transportadoras/PrecoPrazoChart.tsx` — **nome do arquivo engana**: o comentário do próprio arquivo diz "Porta `function renderQuadrante(mask)`" (prazo médio histórico × diferença média por transportadora), não é o `chartPrazo` (esse é o de `PesoCustoCharts.tsx`). Corrigido aqui em 2026-09-14 depois de eu (Hermes) ter reportado `chartQuadrante` como faltante por engano numa mensagem anterior — checar sempre o comentário/`renderXxx` portado, não só o nome do componente. |
> | chartClassif | `components/ClassificacaoChart.tsx` — **portado nesta sessão (Hermes, 2026-09-14)**, ver `oportunidades/OportunidadesTabsClient.tsx` |

- [x] chartClassif ("Classificação por impacto", doughnut) — portado em `src/components/ClassificacaoChart.tsx`
- [x] `ontTendChart` ("Diferença dos últimos 15 dias", barra) — portado em `src/components/OntemTendenciaChart.tsx` + RPC `ontem_tendencia_15_dias` (migration `fn_ontem_tendencia_15_dias`). Os 16/16 gráficos do Artifact original agora têm equivalente no Next.js.
- [ ] Validar campo a campo cada gráfico portado com sistema de referência

### Tabelas restantes — inventário corrigido em 2026-09-14

> Mesmo problema do item acima: 9 das 10 tabelas do Artifact original já
> existem no Next.js. Conferido por id/cabeçalho de coluna:
>
> | Tabela original | Onde já está |
> |---|---|
> | ontTabela | `ontem/page.tsx` ("Todas as contratações do dia") |
> | tblOutliers | `financeiro/page.tsx` |
> | tblCbmCusto | `financeiro/page.tsx` |
> | tblPrazoHist, tblTransp, tblCidades | `transportadoras/page.tsx` (mesmo id) |
> | tblOportunidades | `oportunidades/OportunidadesTabsClient.tsx` ("Processos classificados — detalhe") |
> | opQuem, opCidades | `operacao/page.tsx` |

- [ ] `tblDetalhe` — tabela paginada/pesquisável da página "Dados" (rodapé do Artifact original) — **realmente falta**, não existe rota `/dados` no Next.js ainda; é a única das 10 com busca+paginação reais no original
- [ ] Página "Metodologia" (dicionário de indicadores, rodapé do Artifact original) — não é uma das 10 tabelas mas também não existe rota ainda, citada no mapa de migração seção 1.1
- [ ] Validar cada tabela portada campo a campo

### Funcionalidades
- [ ] Simulação de Custo por Transportadora (4º bloco da Visão Geral) — regra "nunca estima, sempre real"
- [ ] Área administrativa de importação de arquivos (usar policy nova de importacoes)

## Auth e segurança — CORRIGIDO 2026-09-14 (doc estava desatualizada)

> Auditoria (task #3, sessão principal): conferi as policies reais no banco (`pg_policies`),
> não só o que os docs diziam. **As 5 tabelas de dado (`clientes`, `cotacoes`, `ofertas`,
> `contratacoes`, `transportadoras`) já estão com SELECT restrito a `authenticated`** —
> migration `restringir_leitura_a_usuarios_autenticados` (2026-09-12). Isso contradiz D-10/D-13
> abaixo e o estado descrito antes aqui ("policies públicas mantidas") — os docs nunca foram
> atualizados depois dessa migration.

- [x] ~~Remover policies de leitura pública temporárias~~ — JÁ FEITO em 2026-09-12, antes até
      da Central de Contexto existir (por isso o doc nunca refletiu)
- [ ] **Decisão do Mikael necessária**: isso foi intencional ou foi uma trava excessiva de uma
      sessão anterior? PRINCIPIOS.md diz explicitamente "policy de leitura pública temporária
      apenas durante a fase de desenvolvimento aberto" — se ainda estamos nessa fase, a leitura
      deveria ter voltado a ser pública, não o contrário.
- [ ] **Se a resposta for "manter autenticado"**: implementar middleware de redirecionamento
      para /login É URGENTE, não "fase futura" — sem ele, qualquer visitante deslogado hoje só
      vê páginas com todos os KPIs/gráficos vazios (RLS devolve 0 linhas pro role `anon`, sem
      nenhum aviso), não um login. Isso pode já estar acontecendo em produção agora.
- [ ] **Se a resposta for "reverter pra pública"**: recriar as policies antigas (`for select
      using (true)` pro role anon, mesmo padrão de antes de 2026-09-12).
- [ ] Proteger páginas administrativas (independente da resposta acima)

## Melhorias de qualidade

- [ ] Melhorar performance do Filtro Global com cascata
- [ ] Revisar uso do createSupabaseServerClient em páginas que poderiam usar
- [ ] Documentar RPCs criados (já parcialmente feito nos comments dos arquivos)

## Validação

- [ ] Confirmar que R$ 494.417,43 continua batendo após novas alterações
- [ ] Validar cada nova página/gráfico/tabela campo a campo antes de avançar

## Issues identificados

### ISSUE-23 — Oportunidades
- Página "Oportunidades" aparece desabilitada no menu (em breve)
- Depende de decisão de negócio ainda não tomada
- Ver mencionado em DashboardShell.tsx e README

### Doc de referência pendente
- `docs/mapa-migracao-tms-v3-2026-09-11.md` — documento-mãe da migração no Google Drive (não está neste repo)
  - Contém: auditoria da arquitetura atual, mapa de dados, mapa de regras de negócio, schema Postgres proposto, riscos, plano de rollback, plano de testes, 10 fases
  - Regras de negócio de ~9 meses de decisões vivem em `memoria/06_LOG_DECISOES.md` e `memoria/16_PROMPT_MESTRE.md` do projeto original (Google Drive)
  - **Não portar lógica de negócio para cá sem checar essas fontes primeiro**
