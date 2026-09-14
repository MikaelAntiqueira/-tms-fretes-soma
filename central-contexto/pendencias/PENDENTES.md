# Pendências — TMS Fretes SOMA

> Tarefas abertas e esperando ação. Última atualização: 2026-09-14.
> Fonte: roadmap do README + análise das sessõs do outro PC.

## ✅ RESOLVIDO 2026-09-14 — página /oportunidades estava quebrada em produção

Task #5 (validação campo a campo) encontrou que `/oportunidades` retornava
erro pra todo visitante desde o commit que a criou (`12a4916`): a página
consultava `supabase.from("comparacoes")`, mas essa view não existia no
banco (o arquivo de migration original referenciava 3 colunas inexistentes
em `contratacoes` e nunca chegou a rodar). Isso também bloqueava o
`chartClassif` da task #2.

**Correção aplicada** (2 migrations no projeto Supabase
`jpoizkylaffircimxzrq`: `fix_create_comparacoes_view_sobre_v_ontem_comparacao`
+ `fix_comparacoes_dedup_ofertas_duplicadas_prazo_contratado`; arquivo local
`supabase/migrations/2026091303_create_comparacoes_view.sql` reescrito pra
refletir o estado final): `comparacoes` foi reconstruída SOBRE
`v_ontem_comparacao` (mesma fonte de verdade de diffR/diffP/esc do resto do
app) em vez do ROW_NUMBER() ingênuo original, evitando a segunda fonte de
verdade divergente que a recomendação do audit já tinha sinalizado.
No caminho, achado um bug adicional: `ofertas` tem registros duplicados
(mesma cotação+transportadora+preço, import duplicado) que multiplicavam a
linha da contratação num JOIN não agregado — corrigido agregando por
`(cotacao_id, transportadora_id)`. Validado: **5.196 linhas, soma
diffR>0 = R$ 45.957,95 — bate exatamente com `v_ontem_comparacao`**, sem
divergência. Também corrigido `ComparacaoRow.contratacao_id` no front
(`page.tsx`): era tipado/convertido como `number` (`Number(uuid)` = `NaN`
sempre), quebrando a `key` de React na tabela; agora é `string`. Limpeza:
função órfã `fn_janela` (resíduo de tentativa anterior) removida; `search_path`
fixado em `fn_faixa_peso`/`fn_faixa_cubagem` (lint de segurança do Supabase).
Build de produção (`next build`) rodou limpo depois da correção — ver item
"tsc/build limpo" abaixo, também resolvido por tabela.

**Achado adicional na mesma investigação**: o mesmo bug de duplicação existia
na RAIZ, em `v_ontem_comparacao` (não só na cópia que eu tinha feito em
`comparacoes`) — afetava também `/ontem` inteiro (ontem_kpis,
ontem_contratacoes, ontem_cobertura, ontem_tendencia_15_dias) e
`dados_detalhe`. Corrigido na view em si (migration
`fix_v_ontem_comparacao_dedup_oferta_propria`) — ver [D-22] em
LOG_DECISOES.md. Depois da correção, os números batem exatamente com o
baseline já documentado logo abaixo (494.417,43 / 6.915 / 5.194 /
45.938,44) — confirmado que a divergência estava só do lado de
`v_ontem_comparacao`, não em `v_cotacao_filtros`/`v_ontem_radar` (usados por
/financeiro), que já tratavam a duplicata corretamente.

## Filtro Global — Fase 1 (11/11 dimensões prontas, 2026-09-14)

- [x] Completar as 7 dimensões restantes do Filtro Global:
      romaneio, esc (escolheu a mais barata), prazo, cidade, janela, faixaPeso, faixaCubagem —
      migrations `fn_filtro_global_fase1_7_dimensoes_restantes` +
      `fn_filtro_opcoes_add_cidade_romaneio_prazo`, commit `0ffce75` (sessão principal,
      2026-09-14). `v_cotacao_filtros` estendida reaproveitando `v_financeiro_padroes_base`/
      bins de `financeiro_peso_frete`/CASE de janela de `transportadoras_comparativo` — nenhuma
      lógica nova. Baseline validado sem regressão (494.417,43 / 6.915 / 5.194 / 45.938,44).
      **✅ Confirmado 2026-09-14**: `npm run build` (Next.js 16 / Turbopack) rodou limpo —
      compilação, checagem de TypeScript e geração de todas as 10 rotas sem erro (validado numa
      máquina com RAM suficiente pro `npm install`; único ruído foram os fetches de Google Fonts
      bloqueados pela rede do sandbox de validação, sem relação com o código).

- [x] Implementar cascata de opções — RPC `financeiro_filtro_opcoes_cascata`, commit da sessão
      principal 2026-09-14. Sai "de graça" no mesmo round-trip (página já é Server Component
      re-renderizado a cada mudança de URL). Ver comentário no topo de `FilterBar.tsx` pra
      pegadinha de performance (materializar a view numa CTE, não referenciar direto em 11
      subqueries — deu timeout na primeira versão).

### A fazer agora
- [ ] Fazer outras páginas reagirem ao filtro (além de /financeiro Visão Geral)
- [ ] Validar as 11 dimensões campo a campo contra o Artifact original (só as 4 da Fase 1 foram
      validadas por Playwright até agora)

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

- [x] `tblDetalhe` — tabela paginada/pesquisável da página "Dados" — portada em `src/app/dados/page.tsx` + RPC `dados_detalhe` (migration `fn_dados_detalhe`, busca/ordenação/paginação no Postgres, nunca carregando a base inteira pro cliente — [D-05]). Reaproveita `v_ontem_comparacao` (mesma fonte de melhor cotação/diferença/escolheu já usada no resto do app) em vez de recalcular. Coluna "Valor Declarado" do original NÃO existe em nenhuma tabela do schema atual — omitida, não estimada ([R-DADO]). Item adicionado ao menu lateral (`DashboardShell.tsx`), antes só acessível pelo rodapé no Artifact original. As 10/10 tabelas do Artifact original agora têm equivalente no Next.js.
- [ ] Página "Metodologia" (dicionário de indicadores, rodapé do Artifact original) — não é uma das 10 tabelas mas também não existe rota ainda, citada no mapa de migração seção 1.1
- [ ] Validar cada tabela portada campo a campo

### Funcionalidades
- [ ] Simulação de Custo por Transportadora (4º bloco da Visão Geral) — regra "nunca estima, sempre real"
- [ ] Área administrativa de importação de arquivos (usar policy nova de importacoes)

## Auth e segurança — RESOLVIDO 2026-09-14 (doc estava desatualizada, corrigida agora)

> Auditoria (task #3, sessão principal): as 5 tabelas de dado (`clientes`, `cotacoes`, `ofertas`,
> `contratacoes`, `transportadoras`) estão com SELECT restrito a `authenticated` desde
> `restringir_leitura_a_usuarios_autenticados` (2026-09-12).

- [x] ~~Remover policies de leitura pública temporárias~~ — feito em 2026-09-12
- [x] **Decisão do Mikael tomada** (2026-09-14, registrada em agent_tasks#10): manter acesso
      `authenticated`-only (não reverter pra pública) + criar middleware de redirecionamento.
- [x] **Middleware de redirecionamento para `/login` implementado** — `middleware.ts` na raiz
      do repo (commits `6192324`, `e94d1ac`, `c280bae`, `9884768`), usa `@supabase/ssr` +
      `getUser()` pra revalidar o token a cada requisição. `/login` ajustado com `?redirect=`
      de volta pra página original. Testado em produção: `/financeiro` sem sessão redireciona
      corretamente pra `/login?redirect=/financeiro`.
- [x] `v_cotacao_filtros` — achado à parte (não relacionado ao middleware): faltava
      `security_invoker=true`, bypassando RLS nesse endpoint específico mesmo com o resto
      correto. Corrigido 2026-09-14, ver [D-23] em LOG_DECISOES.md.
- [ ] Proteger páginas administrativas — ainda não se aplica: a área administrativa de
      importação de arquivos (abaixo, em "Funcionalidades") não existe como rota ainda.

## Melhorias de qualidade

- [x] ~~Revisar uso do createSupabaseServerClient em páginas que poderiam usar~~ — **Confirmado
      2026-09-14**: nenhuma página/componente importa mais `@/lib/supabase` (cliente sem cookie);
      todas usam `createSupabaseServerClient()`. Conferido também que todas as RPCs de dado são
      `SECURITY INVOKER` (só `handle_new_user`, o trigger de provisionamento, é `SECURITY DEFINER`
      — correto, precisa de privilégio elevado pra criar o profile no signup). RLS restrita a
      `authenticated` está sendo respeitada de ponta a ponta.
- [ ] Documentar RPCs criados (já parcialmente feito nos comments dos arquivos)

## Validação

- [x] Confirmar que R$ 494.417,43 continua batendo após novas alterações — **confirmado 2026-09-14**
      (R$ 494.417,43 / 5.194 contratações cruzadas, consulta direta em `contratacoes`, sem
      passar por nenhuma view — inabalado pelas correções desta sessão)
- [ ] Validar cada nova página/gráfico/tabela campo a campo antes de avançar

## Issues identificados

### ISSUE-23 — Oportunidades (RESOLVIDO / doc estava desatualizada, 2026-09-14)
- A nota "aparece desabilitada no menu (em breve)" estava errada: nenhum item
  de `NAV_ITEMS` em `DashboardShell.tsx` seta `disabled: true` — o link
  sempre foi clicável desde que a página foi criada. O que estava
  genuinamente quebrado era a página em si (view `comparacoes` inexistente,
  ver seção resolvida acima), não o menu.
- Comentário desatualizado no topo de `DashboardShell.tsx` corrigido.

### Doc de referência pendente
- `docs/mapa-migracao-tms-v3-2026-09-11.md` — documento-mãe da migração no Google Drive (não está neste repo)
  - Contém: auditoria da arquitetura atual, mapa de dados, mapa de regras de negócio, schema Postgres proposto, riscos, plano de rollback, plano de testes, 10 fases
  - Regras de negócio de ~9 meses de decisões vivem em `memoria/06_LOG_DECISOES.md` e `memoria/16_PROMPT_MESTRE.md` do projeto original (Google Drive)
  - **Não portar lógica de negócio para cá sem checar essas fontes primeiro**
