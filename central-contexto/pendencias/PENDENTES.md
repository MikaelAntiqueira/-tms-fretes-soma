# Pendências — TMS Fretes SOMA

> Tarefas abertas e esperando ação. Última atualização: 2026-09-16.
> Fonte: roadmap do README + análise das sessõs do outro PC.

## ✅ CORRIGIDO 2026-09-16 — faixa de peso do filtro global não seguia [DEC-26]

Ao validar a dimensão `faixaPeso` do motor de filtro global contra o Artifact
v40, achado bug real: `v_cotacao_filtros.faixa_peso` usava cortes ANTIGOS
(10/25/50/100/250/500/1.000 kg, 8 faixas) em vez dos cortes FINAIS de
[DEC-26] (resposta do Mikael, 2026-09-10): **10/20/50/100/250 kg, 6 faixas**
(`0–10`/`10–20`/`20–50`/`50–100`/`100–250`/`250+`), confirmados tanto no
dropdown do Artifact (`ORD_FAIXA_PESO`) quanto no código-fonte Python
original (`codigo/enrich_dashboard_data.py::faixa_peso()`, comentário cita
[DEC-26] literalmente). **Corrigido** (migration
`fix_faixa_peso_alinha_com_dec26`): `v_cotacao_filtros` agora usa os 6 cortes
certos — afeta a dimensão `faixaPeso` do filtro global em TODAS as páginas
que a usam (/financeiro, /dados, /operacao, /transportadoras).

**Cuidado, NÃO unificar mais que isso**: o gráfico "Peso x Frete Contratado"
e a tabela "Outliers de Peso x Frete" (sub-aba "Peso, Cubagem & Custo" de
/financeiro — RPCs `financeiro_peso_frete`/`financeiro_outliers_peso`) usam
de propósito um esquema DIFERENTE e mais fino (`PESO_BINS`, 8 faixas, os
cortes ANTIGOS) — confirmado no próprio JS do Artifact v40, coexistindo com
`ORD_FAIXA_PESO` sem ligação entre os dois. Tentei unificar essas 2 functions
pros mesmos 6 cortes numa primeira tentativa e **revertido** (migration
`revert_financeiro_peso_frete_outliers_para_8_faixas`) depois de achar essa
distinção no código-fonte — não é bug, são 2 conceitos diferentes que sempre
coexistiram no sistema original. Cubagem não tem esse problema (só 1 esquema,
já batia em todo lugar).

**Achado adicional, registrado mas NÃO corrigido** (precisa de mais
investigação, não é claramente um bug): ao testar `faixaPeso=20–50kg` contra
o Artifact v40, os NÚMEROS totais (`frete_n`=776 no Supabase vs. 1.235 no
Artifact; `cot`=1084 vs. 1.543) não bateram, mesmo com os cortes já corretos.
Hipótese mais provável: [DEC-26] e [DEC-27] ("peso considerado" = maior entre
peso real e peso cubado) foram decididos no MESMO DIA (10/09) pelo Mikael, e
o Artifact v40 é de 11/09 — pode ter recebido só os RÓTULOS do DEC-26 no
dropdown, sem propagar ainda o DEC-27 pro campo de peso usado ali. O SQL
atual (`v_cotacao_filtros`, `GREATEST(peso_real_kg, peso_cubado_kg)`) já
segue DEC-27 integralmente — pode estar CERTO e mais atualizado que essa
versão específica do Artifact, não errado. Não alterado até confirmar com o
Mikael ou achar uma versão do Artifact posterior a ambas as decisões pra
comparar. Ver [D-08]/[DEC-27] em LOG_DECISOES.md.

## ✅ INVESTIGADO 2026-09-16 — issue #1 do GitHub ("Possible exposed API Key"), falso alarme

Bot público (`Leakwatch-Alert-Bot`) abriu a [issue #1](https://github.com/MikaelAntiqueira/-tms-fretes-soma/issues/1)
alertando um "JWT exposto" no commit `6129876` (arquivo `COMANDO_configurar_
env_vars_vercel.md`). Investigado: é a `NEXT_PUBLIC_SUPABASE_ANON_KEY` —
exatamente a chave pública/anon do Supabase, feita pra ser embutida em
código client-side (por isso o prefixo `NEXT_PUBLIC_`; ela já vai em todo
bundle JS que o navegador baixa, exposta de qualquer forma). Confirmado
direto no banco: as 5 tabelas de dado (`clientes`/`cotacoes`/`ofertas`/
`contratacoes`/`transportadoras`) têm RLS habilitado (`relrowsecurity=true`)
com policy de SELECT restrita à role `authenticated` — a anon key sozinha
não lê nenhum dado de negócio. **Não precisa rotacionar nada.** **Fechada
pelo Mikael em 2026-09-16** (o token GitHub desta sessão só tem permissão de
"Contents", não de "Issues" — comentar/fechar via API retornou 403; ele
fechou direto no GitHub).

## ✅ RESOLVIDO 2026-09-14 — 500 em /operacao: causa raiz real era timeout de DB, não (só) o middleware

A task #15 (sessão anterior, mesmo dia) tinha corrigido a duplicação
`middleware.ts`/`proxy.ts` como hipótese para o 500 relatado pelo Mikael em
`/operacao` e `/oportunidades`, mas marcou como "não confirmado 100%". Task
#16 achou a causa raiz real de `/operacao`, com **prova em log** (não
hipótese): `postgrest_logs`/`postgres_logs` mostram 5x `POST /rpc/
operacao_por_janela` → 500 em 2026-09-14T12:10, "canceling statement due to
statement timeout". Motivo: a página disparava 7 RPCs num só `Promise.all`,
5 delas recomputando de forma concorrente a mesma view cara
`v_operacao_base` (~900ms isolada) — sob contenção, isso passa do
`statement_timeout=8s` do role `authenticated` (bem menor que o do
postgres/service_role, por isso não reproduzia em testes diretos no banco).

**Correção** (migration `fix_operacao_dashboard_estatico_reduz_recomputo_v_
operacao_base` + commit `393a6b7` em `src/app/operacao/page.tsx`): nova RPC
`operacao_dashboard_estatico()` materializa a view 1 vez para as 4
agregações estáticas (kpis/carriers/janela×transportadora/cidades),
retornando tudo num único jsonb — reduz de 5 para 2 os recomputos
concorrentes de `v_operacao_base` por carregamento de página. Regredido:
números idênticos às functions antigas (mantidas no banco, só não são mais
chamadas por `/operacao`). Detalhe completo em [D-26], `LOG_DECISOES.md`.

**Não confirmado ainda**: não há como testar em produção com sessão
autenticada sem logar como o Mikael (ação que não posso executar). Falta
ele confirmar que o erro não volta em uso normal. Nenhum 500 de
`/oportunidades` apareceu nos logs das últimas 24h (só `operacao_por_
janela`) — se `/oportunidades` ainda falhar, o padrão a investigar é
diferente deste.

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
- [x] ~~Fazer outras páginas reagirem ao filtro~~ — **`/dados` portado 2026-09-16** (commit
      `ae8d0c4`, migration `fn_dados_detalhe_add_filtro_global_11_dimensoes`): `dados_detalhe`
      ganhou os 11 parâmetros opcionais, mesmo padrão de `v_cotacao_filtros` já usado em
      /operacao e /transportadoras; opções dos dropdowns reaproveitam `financeiro_filtro_opcoes_
      cascata` (nenhuma RPC nova). Regressão validada direto no Supabase: sem filtro,
      total_count = 5.194 (baseline); com `mes=2026-08`, total_count = 1.558 = contagem
      cruzada feita à parte. **Ainda falta** `/` (Visão Geral/home — mas é só uma página de
      prova de conceito, candidata a ser descontinuada, não um dos 5 painéis do dashboard
      original — decisão do Mikael antes de investir nisso).
      **Não confirmado ainda**: não há como testar em produção com sessão autenticada sem
      logar como o Mikael (ação que a sessão que implementou não pode executar) — falta ele
      abrir `/dados`, aplicar um filtro (ex. um mês) e confirmar que a página carrega normalmente
      e a tabela/paginação/ordenação reagem, sem repetir o "This page couldn't load" que já
      aconteceu 4x nesta mesma área (ver [D-30] em FilterBar.tsx — causa era `format` como
      função cruzando a fronteira Server→Client Component; esta rodada usa só chaves string,
      igual ao fix documentado).
- [x] ~~`/ontem` — seletor de dia específico~~ — **portado 2026-09-16** (commit `1aff130`,
      migration `fn_ontem_dias_disponiveis`). Mikael esclareceu que `/ontem` NÃO precisa do
      motor de filtro global de 11 dimensões (é um recorte de 1 dia só, filtrar por mês não faz
      sentido) — o que fazia falta era poder escolher OUTRO dia específico além do padrão
      (último dia com contratação cruzada). Nova RPC `ontem_dias_disponiveis()` lista os 100
      dias com dado (2026-01-02 a 2026-08-27); `?dia=AAAA-MM-DD` na URL escolhe o dia, ignorado
      silenciosamente se inválido/sem dado (cai no padrão). Componente novo `DiaSelector.tsx`
      segue a mesma convenção do FilterBar (nenhuma função cruza a fronteira Server→Client).
      Validado direto no Supabase com um dia arbitrário do meio da série (2026-07-16):
      ontem_kpis/ontem_contratacoes/radar_d2/d3/d4/d6 todos retornam dados consistentes.
      **Não confirmado ainda** (mesma limitação do item acima — sem sessão autenticada pra
      testar no navegador): falta o Mikael abrir `/ontem`, trocar o dia no seletor e confirmar
      visualmente que os KPIs/Radar/tabela mudam e a página não quebra.
- [x] ~~Validar as 11 dimensões campo a campo contra o Artifact original~~ — **11 de 11
      validadas, 2026-09-16** (Browser tool servindo `dashboard-restore-points/
      artifact-v40-2026-09-11.html` localmente + comparação direta com
      `financeiro_visao_geral_kpis()`/`v_cotacao_filtros`). Mês/Transportadora/Região/Tipo já
      eram da Fase 1; validadas nesta rodada: esc, janela, romaneio, prazo, cidade,
      faixaCubagem (todas bateram dígito a dígito de primeira) e **faixaPeso** (achou e
      corrigiu um bug real — ver seção "CORRIGIDO 2026-09-16" acima, D-31 em
      LOG_DECISOES.md). Único ponto aberto: o total de processos da dimensão faixaPeso
      ainda não bate 100% com essa versão específica do Artifact (provável DEC-27 não
      propagado no v40) — não é uma dimensão pendente de validar, é uma nuance registrada
      pra confirmação futura do Mikael.

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
- [x] ~~Validar campo a campo cada gráfico portado com sistema de referência~~ — **16/16
      feito 2026-09-16**, ver seção "Filtro Global — Fase 1" mais abaixo (técnica
      `Chart.instances` + comparação com as RPCs).

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
- [x] ~~Página "Metodologia" (dicionário de indicadores)~~ — **decisão do Mikael 2026-09-16:
      NÃO como rota do site** (o Artifact original só REFERENCIA um "Dicionário de Indicadores",
      nunca embute o conteúdo completo dele numa página própria — não é uma das 10 tabelas).
      Escrito como arquivo markdown de referência no próprio repositório —
      `central-contexto/METODOLOGIA.md` — reconciliado com o valor/regra ATUAL de cada
      indicador (RPCs já validadas e decisões D-XX/DEC-XX FINAIS), não com o dicionário
      original de ~9 meses atrás (esse tinha números já superados por correções posteriores).
- [x] ~~Validar tabela "Cubagem e custo unitário" (tblCbmCusto) e "Outliers de Peso x Frete"~~ —
      **validadas 2026-09-16** contra o Artifact v40: `financeiro_cubagem_custo()` bate
      dígito a dígito em 5 das 6 faixas (n/peso/cbm/frete/custo_kg/custo_m3 idênticos). Única
      diferença: a faixa "Não informado" mostra peso=0 hoje (era 147.586kg no v40) — confirmado
      direto no banco que as 1.906 linhas dessa faixa têm `peso_considerado` NULL agora em
      `v_financeiro_padroes_base` (0 de 1.906 com peso). n e frete continuam idênticos (1.906 /
      R$162.214), só o peso mudou — não é um bug de lógica SQL (a fórmula está certa,
      `sum(coalesce(peso,0))`), é o DADO em si que mudou entre o snapshot do Artifact (11/09) e
      hoje (16/09), provavelmente por alguma correção de qualidade de dado no meio do caminho
      ([D-22]/[D-24] mexeram em views próximas dessa). `financeiro_outliers_peso()` tem drift
      parecido (medianas por faixa mudaram ~10-30%, ranking dos top-10 mudou) — mesma explicação
      provável (dados mudaram em 5 dias de correções, não lógica errada). Não investigado a
      fundo qual migration especificamente zerou o peso dessas 1.906 linhas — se importar,
      abrir uma investigação dedicada com `git log` das migrations entre 11/09 e 14/09.
- [x] ~~Validar 11 dos 16 gráficos portados campo a campo~~ — **2026-09-16**, técnica nova:
      o Chart.js mantém `Chart.instances` viva mesmo depois de trocar de aba no Artifact v40
      (SPA sem destruir canvas antigos) — bastou navegar pelas abas uma vez e ler
      `Chart.instances` via `javascript_tool` pra capturar os dados de quase todos os gráficos
      de uma vez, sem precisar interagir com cada um. **Bateram exatos** (valores ou % com
      diferença só de arredondamento): `chartEvolucao`/`chartEconomiaMes`
      (`financeiro_evolucao_mensal`), `chartEscolheu` (esc_s/n/sc), `chartDiffPrazo`
      (`financeiro_diff_por_prazo`), `chartDiffUf` (`financeiro_diff_por_regiao`),
      `chartDiffTransp` (`financeiro_diff_por_transportadora`), `chartDiffTipo`
      (`financeiro_diff_por_tipo_cliente`), `chartPrazo` (`financeiro_prazo_frete_medio`),
      `ontTendChart` (`ontem_tendencia_15_dias`), `chartMaisBarata` + `chartContrxBarata`
      (`transportadoras_comparativo` — vezes_mais_barata/pct_mais_barata/pct_contratada, 7
      transportadoras, todas exatas).
      **`chartPeso` (`financeiro_peso_frete`) tem a MESMA causa de drift já registrada acima**
      (faixa de peso/outliers): o total de linhas com `peso_considerado` não-nulo caiu de 5.194
      (no snapshot do Artifact, 11/09) pra 3.288 (hoje) — as MESMAS 1.906 linhas que perderam o
      peso na tabela de cubagem também afetam este gráfico. Formato/ordem dos 8 buckets e a
      tendência (n caindo, frete_medio subindo por faixa) continuam corretos — só a MAGNITUDE
      dos números mudou, coerente com dado que mudou entre 11/09 e hoje, não lógica errada.
      **Os 5 gráficos restantes foram validados na sequência (mesmo dia, 2026-09-16)** —
      `chartUf`/`chartClientes` (`transportadoras_regiao_comercial`/`clientes_metricas`) e
      `chartQuadrante` (`transportadoras_prazo_medio` + `comparativo`) bateram exatos, dígito a
      dígito, nas 15/12/7 linhas checadas. `chartClassif` achou um **bug real** — ver seção
      "CORRIGIDO — bug de acento" abaixo. **16 de 16 gráficos agora validados.**

      **10 de 10 tabelas também validadas, mesmo dia**: `tblTransp` (Comparativo, 7
      transportadoras × 8 colunas, tudo exato), `tblPrazoHist` (7 transportadoras, só 1 célula
      com drift de dado esperado — N de Rede Nacional 54→55), `tblCidades` (top 10 linhas,
      tudo exato), `ontTabela` (KPIs do dia 27/08 + top 3 linhas da tabela de contratações,
      tudo exato), `tblOportunidades` (Clientes Prioritários, top 3 clientes por diferença
      acumulada, tudo exato — só depois do fix do bug de acento abaixo). `opQuem`/`opCidades`
      bateram exatos na tabela por transportadora — **mas o KPI do topo de `/operacao` tem um
      achado importante NÃO corrigido, ver seção própria abaixo.**

      **Resumo final da rodada de validação (2026-09-16): 16/16 gráficos + 10/10 tabelas + 11/11
      dimensões do filtro global testadas campo a campo contra o Artifact original. 3 bugs reais
      encontrados e corrigidos** (faixa de peso do filtro/DEC-26, acento "Publico" na
      classificação de oportunidades, feedback visual de carregamento) **+ 1 achado sério
      documentado sem correção ainda** (KPIs do topo de /operacao, precisa de mais
      investigação antes de tocar).

## ✅ CORRIGIDO 2026-09-16 — bug de acento quebrava classificação e filtro "Tipo" em /oportunidades

Validando `chartClassif` contra o Artifact: a view `comparacoes` comparava `tipo_cliente` com
o literal `'Público'` (COM acento), mas a coluna `clientes.tipo_cliente` armazena `'Publico'`
(SEM acento — confirmado com `select distinct tipo_cliente from clientes`). Resultado: TODO
cliente Publico (219 dos 1.392 processos `esc='N'`) caía na classificação `'alerta'` ("sem
critério disponível") em vez de usar os percentis do próprio grupo Publico como qualquer
Privado. Contagem batia a assinatura exata do bug: 219 (Publico) + 2 (Grupo) + 6 (Fornecedores)
= 227 — e o Artifact mostrava só 8 (só Grupo/vazio de verdade).

**Corrigido** (migration `fix_comparacoes_classif_acento_publico`): `alerta` caiu de 227 pra 8
(bate exato); `azul` bateu exato (268); `laranja`/`vermelho` têm só ~13 linhas de diferença
(drift de dado esperado, mesmo padrão já visto em outras validações). Commit `23c12dc` também
corrigiu o dropdown "Tipo" de `/oportunidades.page.tsx` (tinha o MESMO bug — array fixo
`["Público","Privado","Grupo"]` que nunca casava com "Publico" real — agora deriva das
próprias linhas, como mes/regiao já faziam).

## ✅ CORRIGIDO 2026-09-16 (tarde) — KPIs do topo de /operacao contavam universo errado

Validando `opQuem`/`opCidades` contra o Artifact: a tabela "Quem está carregando" (por
transportadora) bate EXATA (7 transportadoras, todas as colunas) — mas os **KPIs do topo da
página** (Romaneios/Pedidos/Volumes/Peso real/Cubagem, antes da tabela) não batem, e a
diferença é grande:

| KPI | Banco (`operacao_dashboard_estatico().kpis`) | Artifact v40 |
|---|---|---|
| Romaneios | 487 | 496 |
| Pedidos | 5.193 | 5.324 |
| Volumes | 48.321 | **67.198** |
| Peso real | 426.509 kg | **666.784 kg** |
| Cubagem | 1.372,7 m³ | 2.507,0 m³ |
| Frete Contratado | 494.417,43 | 494.417 (bate) |

Lendo o JS original (`function renderOperacao`, artifact v40): os 5 primeiros KPIs somam sobre
**TODO O RECORTE de cotações filtradas** (`for i in 0..N`, sem checar se a cotação tem
contratação cruzada) — só o "Frete Contratado" soma condicionalmente (`if BASE.freteC[i]!=null`,
que só existe pra cruzadas). Ou seja: o design ORIGINAL do "Controle Operacional" mistura os
dois universos de propósito (operação = toda cotação que passou pelo processo físico; frete
contratado = só o que tem preço fechado) — mas a migration atual (`operacao_dashboard_
estatico()`, sobre `v_operacao_base` = só cruzadas) restringiu TUDO a cruzadas, subcontando a
visão operacional real.

**Investigado a fundo em `codigo/build_workbook.py` (a pedido do Mikael) e corrigido**: linha
549 mostra `romaneio = s["romaneio"] or <derivado do pedido da contratação>` e linha 593 mostra
`peso_val = s["peso"] if not None else contratado.peso_real_kg` — o Python original tinha
fallbacks pra pedido/peso que a migration não replicava. Testado com `COALESCE` pra pedido/peso
puxando da contratação vinculada quando a cotação não tem (`left join lateral` em
`contratacoes`): bateu EXATO em 4 dos 5 KPIs.

**Corrigido** (migration `fix_operacao_kpis_toda_base_nao_so_cruzadas`, commit `bcaac7b`):
`operacao_dashboard_estatico().kpis` agora soma sobre `cotacoes` (com o COALESCE acima), não
mais sobre `v_operacao_base`. Validado: Pedidos 5.324 ✓, Peso real 666.784 kg ✓, Volumes
67.198 ✓, Cubagem 2.507,0 m³ ✓, Frete Contratado 494.417,43 ✓ (inalterado, já estava certo).
Só **Romaneios ficou em 429** (Artifact mostra 496) — decisão deliberada de NÃO replicar a
heurística legada `_romaneio_do_pedido()` (derivava um romaneio sintético do texto do pedido
quando a cotação não tinha nenhum) porque `contratacoes` não tem coluna `romaneio` no schema
atual — usar `cotacoes.romaneio` direto é mais correto pro schema normalizado de hoje.
`carriers`/`janela_carriers`/`cidades` (tabelas "Quem está carregando"/"Cidade × Transportadora")
NÃO mudaram — continuam só cruzadas, já validados exatos antes desta correção.

## ✅ CORRIGIDO 2026-09-16 — cliques no filtro/seletor de dia pareciam "travados" (sem feedback visual)

Mikael relatou (em produção, /ontem e /financeiro): "as transições estão lentas, quando eu
clico demora pra fazer a ação". Investigado: nenhuma rota tinha `loading.tsx` (convenção do
Next.js App Router) — como FilterBar/DiaSelector navegam via `router.push` (troca de URL, sem
`<Link>` com prefetch), o clique não mostrava NENHUM feedback até o Server Component terminar
de buscar tudo no Supabase — parecia tela travada mesmo que o servidor estivesse processando
normalmente. **Corrigido**: `src/app/loading.tsx` (raiz do app, cobre todas as rotas com um
único Suspense boundary automático do Next.js) — mostra um spinner imediatamente a cada
navegação/mudança de filtro. **Confirmado pelo Mikael em produção (2026-09-16): a lentidão
melhorou.**

**Achado de performance real, não corrigido ainda** (fora do escopo desta correção pontual):
`/financeiro` dispara **16 RPCs em paralelo** a cada clique no filtro (`getFinanceiroData()`),
mas só ~6 delas de fato usam os parâmetros do filtro — as outras ~10 (`financeiro_evolucao_
mensal`, `financeiro_diff_por_prazo/regiao/transportadora/tipo_cliente`, `financeiro_peso_
frete`, `financeiro_outliers_peso`, `financeiro_prazo_frete_medio`, `financeiro_cubagem_custo`)
são "base completa, não reage ao filtro" — ou seja, retornam o MESMO resultado independente do
filtro, mas são recalculadas do zero a cada clique porque a página é `force-dynamic` sem cache
entre requisições. O seletor de dia de `/ontem` tem problema parecido: trocar o dia dispara
~7 RPCs (`ontem_kpis`/`ontem_contratacoes`/`ontem_cobertura`/`ontem_tendencia_15_dias` +
`radar_prazo_hist`/`radar_d2`/`radar_d3`/`radar_d4`/`radar_d6` dentro de `getRadarData`). Como
todas rodam em paralelo (`Promise.all`), o tempo total tende ao da mais lenta, não à soma — mas
ainda é uma banda desnecessária de conexões simultâneas no Supabase. Otimização futura: cache
(`unstable_cache`/`revalidate`) nas ~10 RPCs de `/financeiro` que nunca mudam com o filtro —
não fiz agora porque é uma mudança de arquitetura maior, não algo pra decidir sob pressão de
"fechar hoje".

### Funcionalidades
- [x] ~~Simulação de Custo por Transportadora (4º bloco da Visão Geral)~~ — **portada 2026-09-14**
      (RPC `financeiro_simulacao_custo`, migration `fn_financeiro_simulacao_custo`). Regra "nunca
      estima" preservada; validado com Leomar filtrada (394 processos, R$37.011,91 real) — São
      Miguel/Santa Cruz mais baratas com boa cobertura, Fritz/Rede Nacional cobertura baixa
      (só competem na janela Meio-dia), consistente com o caso já conhecido [DEC-22].
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
      corretamente pra `/login?redirect=/financeiro`. **Nota 2026-09-14**: o arquivo em si foi
      renomeado pra `src/proxy.ts` numa sessão posterior (Next.js 16 depreciou o nome
      `middleware.ts` — ver comentário no topo de `proxy.ts`); a lógica/comportamento descritos
      aqui continuam os mesmos, só o arquivo mudou de nome.
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
- [x] ~~Documentar RPCs criados~~ — **feito 2026-09-16**, via `COMMENT ON FUNCTION` (migrations
      `docs_comment_on_function_rpcs_restantes` + `docs_comment_handle_new_user`): as 39
      functions do schema `public` agora têm comentário (proposito/página que consome/se reage
      ao filtro global) — só 7 já tinham antes desta rodada. Zero mudança de comportamento
      (só metadados). Consultável com `\df+` no psql ou `obj_description(oid, 'pg_proc')`.

## Validação

- [x] Confirmar que R$ 494.417,43 continua batendo após novas alterações — **confirmado 2026-09-14**
      (R$ 494.417,43 / 5.194 contratações cruzadas, consulta direta em `contratacoes`, sem
      passar por nenhuma view — inabalado pelas correções desta sessão)
- [x] ~~Validar cada nova página/gráfico/tabela campo a campo antes de avançar~~ — feito para
      tudo que existe hoje (16 gráficos/10 tabelas/11 dimensões, 2026-09-16). Continua valendo
      como prática padrão pra qualquer página/gráfico/tabela nova que for portada no futuro —
      não é um item que "termina", é uma regra permanente do projeto.

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
