# Decisões — TMS Fretes SOMA

> Registro de decisões importantes com motivo. Última atualização: 2026-09-14.
> Fonte: README.md do repo + sessões do outro PC + claude.json

## D-01 — Migração incremental, não reescrita

**Decisão**: Migração V3 preserva o sistema atual (HTML/Chart.js + pipeline Python) rodando em paralelo com o novo (Next.js + Supabase).

**Motivo**: Sistema atual está em produção, alimentando decisões do negócio. Reescrever do zero é risco desnecessário. Migração incremental permite validação campo a campo e rollback por fase.

## D-02 — Região Comercial ≠ UF

**Decisão**: Região Comercial usa sempre `clientes.regiao_normalizada`, nunca `regiao_comercial_bruta`. A UF bruta tem sufixo " PRIVADO"/" PUBLICO" que não deve appear em relatórios.

**Motivo**: [DEC-02] FINAL. A versão normalizada é a correta para análise de negócio.

## D-03 — Prazo de oferta perdida nunca é inventado

**Decisão**: Sempre usar prazo real da oferta, nunca estimar um prazo que não existe nos dados.

**Motivo**: Inventar prazo geraria análise falsa de "oferta perdida". Se não tem prazo, não tem prazo.

## D-04 — Frete mínimo observado, não tabela oficial

**Decisão**: Piso de frete usado em /operacao vem de `transportadoras.frete_minimo_observado` (calculado dos dados reais), nunca hardcoded.

**Motivo**: Tabela oficial pode estar desatualizada. O observado reflete a realidade da base.

## D-05 — Soma de frete contratado no banco, não no cliente

**Decisão**: Soma de Frete Contratado feita via RPC no banco (`sum_frete_contratado_cruzadas`), nunca somando linhas no cliente JavaScript.

**Motivo**: PostgREST limita a 1000 linhas/requisição. Ter 5.194 linhas cruzadas, somar no cliente incomplete. Já aconteceu em produção: R$ 84.691,87 errado vs R$ 494.417,43 certo.

## D-06 — Universo de cotações vs contratações cruzadas

**Decisão**: KPIs de "Total de Cotações"/"Total de Pedidos" contam TODA a base (6.915). "Frete Contratado"/"Frete Médio"/os baldes Sim-Não-Sem comparação olham só para o subconjunto cruzado (5.194). Não misturar os universos.

**Motivo**: [DEC-25] FINAL — não há campo de "motivo". Misturar universos geraria KPIs errados. Exemplo: "Total de Cotações" mostra 6.915, mas "Frete Contratado" soma só sobre 5.194.

## D-07 — Sim ≠ mais barata

**Decisão**: "Escolheu a mais barata?" (esc) é análise separada de "escolheu o que foi cotado". Uma contratação pode ser "S" (sim, escolheu a cotada) sem ser a mais barata de todas as opções.

**Motivo**: [DEC-25] e [DEC-26]. A pergunta "Escolheu a Mais Barata?" é sobre a cotação específica, não sobre o universo completo de ofertas.

## D-08 — Peso considerado = max(peso real, peso cubado)

**Decisão**: Peso usado nos cálculos é max(peso real, peso cubado) — [DEC-27] FINAL.

**Motivo**: Evita subestimar frete em casos de cubagem.

## D-09 — "Performance" nunca será aba própria

**Decisão**: A aba "Performance" do Artifact original é a MESMA tabela que já está fundida na aba "Comparativo" desta migração. Decisão de uma etapa anterior.

**Motivo**: São dados idênticos. Manter aba separada seria duplicação.

## D-10 — Policies de leitura pública temporárias mantidas

**Decisão**: Durante a fase de desenvolvimento aberto, manter policies de leitura pública nas 5 tabelas de dado (`cotacoes`, `ofertas`, `contratacoes`, `clientes`, `transportadoras`).

**Motivo**: Mikael usa o site publicamente agora. Remover exigiria Auth em todas as páginas, o que não é o objetivo desta fase. Decisão futura do Mikael remover.

**⚠️ CORREÇÃO 2026-09-14 (task #3, auditoria Auth/Segurança)**: esta decisão está **desatualizada**.
A migration `restringir_leitura_a_usuarios_autenticados` (2026-09-12) já trocou as 5 policies para
`authenticated`-only — o oposto do que este D-10 registra. Ninguém atualizou este log depois
daquela migration. Ver `pendencias/PENDENTES.md` seção "Auth e segurança" para o que isso implica
e a decisão que falta do Mikael (foi intencional? falta middleware pra não deixar visitante
deslogado vendo o site vazio?).

## D-11 — Sem middleware nesta fase

**Decisão**: Não implementar middleware de redirecionamento para /login nesta fase.

**Motivo**: Faria sentido só depois que as policies públicas forem removidas (D-10). Fazer agora quebraria o acesso público.

## D-12 — Auth somente para admin inicial

**Decisão**: Apenas mikaelantiqueira@gmail.com tem role='admin' inicial. Qualquer outro usuário que logar fica com role='user' via trigger no auth.users.

**Motivo**: [DEC-29] Fase 6 — Infraestrutura. Admin é o Mikael. Usuários comuns (se houver) não têm acesso admin.

## D-13 — Client Supabase não trocado ainda

**Decisão**: `src/lib/supabase.ts` (cliente simples @supabase/supabase-js, anon key) NÃO foi trocado por createServerClient de @supabase/ssr. Apenas páginas que precisam de sessão usam createSupabaseServerClient.

**Motivo**: Migrar o cliente compartilhado exigiria editar todo src/app/*/page.tsx só para funcionalidade de login que ainda não precisa de leitura de dado autenticada. As 5 tabelas continuam públicas por policy.

## D-14 — Filtro Global Fase 1 — escopo reduzido

**Decisão**: Fase 1 do Filtro Global porta só a infraestrutura + 4 dimensões (Mês, Transportadora, Região, Tipo). Só a sub-aba "Visão Geral" de /financeiro reage aos filtros.

**Motivo**: Escopo deliberadamente pequeno para não misturar "criar infraestrutura" com "portar 11 dropdowns + fazer cascata". As 7 dimensões restantes e a cascata ficam para etapas futuras.

## D-15 — Identidade visual portada 1:1

**Decisão**: Tokens de cor, tipografia e paleta categórica do Artifact original foram portados 1:1 para o Next.js (Etapa 1.1 do mapa de migração).

**Motivo**: Preservar identidade visual estabelecida. Ajustes de paleta exigem decisão explícita, não são "melhoria" livre.

## D-16 — Rótulo "Atualizado em" substituído

**Decisão**: No Artifact original, o rótulo mostrava timestamp estático (`META.fileUpdated`) do pipeline Python. Na migração, substituído por "Fonte: Supabase (dados em tempo real)".

**Motivo**: A arquitetura não tem "arquivo" para carimbar. Fingir timestamp fixo seria enganoso. A opção (a) (trocar rótulo) foi escolhida sobre (b) (carimbar Date.now() do Server Component).

## D-17 — CSS Modules vs globals.css

**Decisão**: Usar globals.css com tokens CSS customizados e Tailwind v4 com @theme inline, não CSS Modules.

**Motivo**: Tokens 1:1 portados, acesso em runtime via getComputedStyle nos gráficos Chart.js funciona nos 2 temas (claro/escuro).

## D-18 — Gráfico de dispersão sem positioning inteligente

**Decisão**: O gráfico de dispersão de Preço×Prazo (PrecoPrazoChart) não implementa o positioning inteligente esquerda/direita do plugin original. Rótulo fixo à direita do ponto.

**Motivo**: Nice to have da fase atual. Posicionamento inteligente é complexidade extra sem benefício funcional claro nesta etapa.

## D-19 — Cidades retorna TODAS, não só top 15

**Decisão**: `transportadoras_cidades()` retorna todas as cidades (563 combinações cidade×transportadora, incluindo "Não informada"), não só top 15 como `operacao_por_cidade()`.

**Motivo**: Página Cidades na migração mostra o universo completo (diferente da seção "Cidade × Transportadora" de /operacao que mostra só top 15).

## D-21 — Filtro Global: as 7 dimensões restantes reaproveitam colunas já existentes

**Decisão**: `v_cotacao_filtros` foi estendida com romaneio/esc/prazo/cidade/janela/faixaPeso/
faixaCubagem reaproveitando exatamente as colunas/faixas já calculadas em
`v_financeiro_padroes_base`, nos bins de `financeiro_peso_frete` e no CASE de janela de
`transportadoras_comparativo` — nenhuma faixa/bucket novo foi inventado.

**Motivo**: princípio de não duplicar lógica de negócio; qualquer mudança futura nas faixas de
peso/cubagem só precisa ser feita em um lugar.

## D-20 — "Região Comercial" em /financeiro usa regiao_normalizada

**Decisão**: Em /financeiro, sub-aba "Padrões da Diferença" → "Diferença por Região", usa `regiao_normalizada` (mesmo campo de RegiaoComercialChart.tsx), nunca a bruta.

**Motivo**: Consistência com [D-02]. O Artifact original faz `BASE.regiaoComercial = BASE.uf.map(normalizarRegiaoComercial)` — mesma transformação.

## D-22 — Bug de duplicação em v_ontem_comparacao corrigido na raiz (não só em `comparacoes`)

**Decisão**: Ao investigar `comparacoes` (correção da página /oportunidades, 2026-09-14),
encontrei que `v_ontem_comparacao` — usada por /financeiro (indiretamente, via numbers já
batendo), /ontem e agora `comparacoes` — tinha o mesmo tipo de bug que causou a duplicação em
`comparacoes`: o CTE `oferta_propria` fazia JOIN direto contra `ofertas` sem agregar por
(cotacao_id, transportadora_id), e `ofertas` tem registros duplicados de importação (mesmo
preço/prazo, 2 linhas). Isso duplicava exatamente 2 contratações (de 5.196 pra 5.194 depois da
correção). Corrigido agregando `oferta_propria` com `MIN(preco_final) GROUP BY
cotacao_id, transportadora_id` — resto da view idêntico (via `pg_get_viewdef` antes de editar).

**Motivo**: `v_ontem_comparacao` é a fonte de verdade única usada por /ontem inteiro
(ontem_kpis, ontem_contratacoes, ontem_cobertura, ontem_tendencia_15_dias) e por
`comparacoes`/`dados_detalhe`. Corrigir só em `comparacoes` teria deixado /ontem com o número
levemente inflado e uma nova segunda fonte de verdade divergente — exatamente o Risco Nº1 do
mapa de migração que essa correção inteira tentava evitar. `transportadoras_comparativo` e
`v_cotacao_filtros`/`v_ontem_radar` já tratavam a duplicata corretamente (usam `distinct on`
ou agregação) — não precisaram de mudança.

**Validado**: depois da correção, `comparacoes` bate 5.194 linhas / R$ 45.938,44 de diferença
positiva — exatamente o baseline já documentado em PENDENTES.md ("494.417,43 / 6.915 / 5.194 /
45.938,44"), que aparentemente já vinha de `v_cotacao_filtros`/`v_ontem_radar` (corretos) — a
divergência estava só no lado de `v_ontem_comparacao`.

## D-23 — v_cotacao_filtros sem security_invoker=true corrigido (achado ERROR do advisor Supabase)

**Decisão**: `v_cotacao_filtros` (usada por `/financeiro`, `transportadoras_comparativo`,
`financeiro_filtro_opcoes*`) era a única view do schema sem `security_invoker=true` — as demais
já tinham sido corrigidas em `fix_views_security_invoker` (12/09). Provavelmente um
`CREATE OR REPLACE VIEW` posterior (ligado às fases do Filtro Global) recriou a view sem repetir
a cláusula `WITH`, que não é preservada automaticamente. Corrigido recriando a view com a mesma
definição (via `pg_get_viewdef` antes de editar) + `WITH (security_invoker = true)`.

**Motivo**: sem isso, a view rodava com o dono (bypassa RLS) em vez do usuário que consulta —
ou seja, qualquer chamada com só a chave anon (sem login) conseguia ler
cotacoes/clientes/contratacoes/ofertas/transportadoras através desse endpoint específico, mesmo
com as 5 tabelas restritas a `authenticated` desde 12/09 e o middleware redirecionando visitantes
pra `/login`. Advisor de segurança do Supabase confirmou, depois da correção, que nenhuma view do
schema falta esse ajuste.

## D-24 — financeiro_outliers_peso corrigido (percentil por índice, não interpolado)

**Decisão**: aplicada a correção já escrita e revisada por outra sessão (Hermes) mas bloqueada
lá por permissão de ferramenta — troca `percentile_cont` (interpolação) por percentil por índice
(nearest-rank, `array_agg(...)[floor(n*p)::int+1]`), igual ao `renderPeso` do Artifact original.

**Motivo**: na faixa "1.000kg+" a diferença chegava a ~20% no Q1, podendo incluir/excluir
processos da lista de outliers de forma diferente do original. Detalhe completo em
`VALIDACAO_23_ITENS.md`.

## D-25 — Confirmações trazidas do Google Drive (docs-fonte lidos integralmente, 2026-09-14)

Trazido `mapa-migracao-tms-v3-2026-09-11.md` e `06_LOG_DECISOES.md` (projeto original) pra dentro
da investigação de hoje, pra resolver dúvidas que este repo não conseguia responder sozinho:

1. **A classificação `classif`/`riscoPrazoAlt` que `comparacoes` usa está correta** — `[DEC-22]`
   (emenda 2026-09-10, FINAL) confirma: São Miguel×Leomar **não é excluído** da economia (a
   Diferença pós-recorte inclui os R$ 45.938,44 completos), só recebe o selo `riscoPrazoAlt`
   ("economia possível, mas exige aceitar risco de prazo da Leomar"). É exatamente o que a
   migration de `comparacoes` já fazia (preservada, não reinventada) — a ressalva do agent_tasks#7
   ("TASK-28 item E5 sem decisão FINAL, não fixar regra nova") não se aplica: não inventei regra
   nova, só portei a já escrita.
2. **A arquitetura "function SQL por página" (em vez de carregar tudo e filtrar em JS) é decisão
   técnica deliberada** — `[DEC-31]`, 2026-09-11, status "NÃO FINAL mas dentro da autonomia
   delegada" — diverge de propósito da recomendação original do mapa de migração (que sugeria
   preservar o filtro 100% client-side). Confirma que portar o filtro global pras demais
   páginas (item aberto em PENDENTES.md) é dar cada function novos parâmetros opcionais, não
   reescrever a arquitetura.
3. **Pitfall documentado que se repetiu**: `06_LOG_DECISOES.md` (nota técnica 2026-09-12) já
   registrava `v_cotacao_filtros` sem `security_invoker=true` como achado corrigido naquele dia
   (`fix_v_cotacao_filtros_e_importacoes_policy_perf`) — mas voltou a quebrar depois (achado de
   novo hoje, [D-23]), quase certamente porque uma migration posterior (`fn_filtro_global_fase1_
   7_dimensoes_restantes`, que estendeu a mesma view com `CREATE OR REPLACE VIEW`) não repetiu a
   cláusula `WITH`. **Lição pra qualquer migration futura que faça `CREATE OR REPLACE VIEW` em
   `v_cotacao_filtros` (ou qualquer view já com `security_invoker=true`): sempre repetir a
   cláusula `WITH (security_invoker = true)`, nunca assumir que persiste.**

## D-26 — Causa raiz real do 500 em /operacao: 5 recomputos concorrentes de v_operacao_base, não (só) o middleware duplicado

**Decisão**: uma sessão anterior (mesmo dia, 2026-09-14) tinha corrigido a duplicação
`middleware.ts`/`proxy.ts` como hipótese para o 500 relatado pelo Mikael em `/operacao` e
`/oportunidades`, marcando-a como "correção plausível, não confirmada". Investigando de novo
(pedido do Mikael "quero corrigir os erros de acessar as páginas"), encontrei a causa raiz REAL
de `/operacao`, com prova em log (não hipótese): `postgrest_logs` + `postgres_logs` mostram 5
chamadas `POST /rpc/operacao_por_janela` retornando 500 em 2026-09-14T12:10, todas com
"canceling statement due to statement timeout". O motivo: `/operacao/page.tsx` disparava, num
único `Promise.all`, 7 RPCs — 5 delas (`operacao_kpis`, `operacao_por_transportadora`,
`operacao_por_janela_transportadora`, `operacao_por_cidade`, `operacao_por_janela`)
recomputavam de forma independente e CONCORRENTE a mesma view cara `v_operacao_base` (~900ms
sozinha, warm cache, medido via `EXPLAIN ANALYZE`). 5 execuções simultâneas da mesma consulta
pesada, sob cache frio ou qualquer contenção, empurram o tempo real acima do
`statement_timeout` do role `authenticated` — **8 segundos**, bem menor que os 2 minutos do
role padrão/postgres (`select rolconfig from pg_roles` confirmou: `anon`=3s, `authenticated`=8s).
Isso explica por que o erro é intermitente (só aparece sob certas condições de carga/cache) e
por que a correção do middleware, sozinha, não bastava.

**Correção** (migration `fix_operacao_dashboard_estatico_reduz_recomputo_v_operacao_base` +
commit `393a6b7` em `src/app/operacao/page.tsx`): nova RPC `operacao_dashboard_estatico()`
materializa `v_operacao_base` UMA vez e deriva dela as 4 agregações que não dependem do filtro
global (kpis, por transportadora, por janela×transportadora, por cidade), retornando tudo num
único `jsonb`. `operacao_por_janela` (a única RPC da página que recebe os 4 parâmetros do
filtro e por isso não pôde ser combinada — precisa ser chamada de novo a cada mudança de
filtro) ganhou `materialized` na sua CTE interna como segurança adicional. Resultado: 5
recomputos concorrentes de `v_operacao_base` por carregamento de página → 2. As 4 functions
antigas (`operacao_kpis`, `operacao_por_transportadora`, `operacao_por_janela_transportadora`,
`operacao_por_cidade`) foram mantidas no banco (não removidas, só não são mais chamadas por
`/operacao`) e usadas para regressão: números idênticos ao novo RPC (494.417,43 / 7
transportadoras / 42 cidades / 9 linhas janela×transportadora).

**Motivo**: mesma pegadinha já documentada no comentário de `FilterBar.tsx` para
`financeiro_filtro_opcoes_cascata` ("nunca referenciar a view diretamente em múltiplas
subqueries independentes — sempre via CTE materializada"), só que aqui o recomputo redundante
acontecia ENTRE requisições RPC separadas (não dentro de uma só query) — por isso uma CTE
materializada dentro de cada function isolada não resolveria; era preciso computar a view cara
uma vez só e reaproveitar entre as 4 agregações que não mudam com o filtro.

**Não verificado**: não há como eu confirmar 100% em produção sem logar como usuário
autenticado (ação que não posso executar). O que confirmei: (1) prova real do timeout nos logs
do Supabase; (2) `EXPLAIN ANALYZE` mostrando a redução de carga (a nova RPC materializa a view
1 vez); (3) regressão de números idêntica às functions antigas. Falta o Mikael confirmar que o
erro não volta a aparecer em uso normal — se voltar, o próximo passo é olhar se `/oportunidades`
(que não teve nenhum 500 nos logs das últimas 24h, diferente de `/operacao`) tem um padrão
parecido de chamadas concorrentes sobre uma view cara.

## D-27 — Causa raiz real do "This page couldn't load" universal: bug de tracing da Vercel com Next.js 16 + proxy.ts, não código do app

**Decisão**: depois de aplicar [D-26], o Mikael reportou que "não tem nada funcionando" e as
páginas mostravam a tela genérica da Vercel "This page couldn't load / A server error
occurred" — em QUALQUER página, não só `/operacao`. Antes de aceitar essa hipótese como
definitiva, testei tudo que dava pra testar sem precisar logar como usuário (login/senha nunca
são inseridos por mim):

1. **Logs do Supabase durante os erros relatados** (janelas 18:01, 18:09, 18:23): TODAS as
   chamadas (header_stats, operacao_dashboard_estatico, operacao_por_janela, ontem_kpis,
   radar_d2-d6, sum_frete_contratado_cruzadas, etc.) retornaram 200. Zero erro. Banco 100%
   saudável durante o problema.
2. **Build de produção local** (`npm run build`, clone do repo): compilou limpo, TypeScript
   sem erro, todas as 10 rotas geradas.
3. **Parsing dos dados** (`getOperacaoData` de `/operacao`, extraída e testada isoladamente com
   os dados REAIS capturados do Postgres via `execute_sql`, sem precisar de sessão): rodou sem
   nenhuma exceção, valores corretos.

Isso eliminou banco, build e lógica de página como causa. Pesquisei o padrão exato do erro
("This page couldn't load", intermitente, banco saudável, qualquer página) e encontrei um bug
conhecido e documentado da própria Vercel: desde o Next.js 16, `src/proxy.ts` roda sempre em
runtime Node.js (não é mais opcional escolher Edge, ver docs oficiais do Next 16). O
rastreador de arquivos da Vercel (`@vercel/nft`) não empacota `node_modules/@swc/helpers/esm/*`
nas funções Lambda — o pacote `@swc/helpers` tem um export condicional que aponta pra ESM em
ambiente ESM, mas o `nft` só segue o branch CJS — então a função quebra ao dar `require` nesse
módulo ausente, de forma intermitente (depende de qual caminho de código aquela invocação
específica da Lambda precisa resolver). Casos idênticos relatados: `vercel/next.js#93852`
(https://github.com/vercel/next.js/issues/93852) e Vercel Community #41956
(https://community.vercel.com/t/iddleware-invocation-failed-middleware-lambda-missing-swc-helpers-on-next-16-2-4/41956)
— mesmo sintoma (`MIDDLEWARE_INVOCATION_FAILED`/`FUNCTION_INVOCATION_FAILED` intermitente,
"funcionava, parou sem ninguém mudar nada").

**Correção** (commit `4b09b2ab` em `next.config.ts`): `outputFileTracingIncludes` forçando o
`nft` a incluir `node_modules/@swc/helpers/esm/**` explicitamente. **Confirmado localmente**:
rebuild depois da mudança mostra os 12 arquivos `.nft.json` (`middleware.js` + as 10 páginas +
a rota do ícone) agora referenciando esses arquivos — antes da mudança, nenhum referenciava.

**Motivo de registrar com detalhe**: [D-26] tinha corrigido um problema REAL (o timeout de
`v_operacao_base`), mas não era a causa do "não tem nada funcionando" — dois problemas
diferentes coexistindo na mesma investigação, um de banco (D-26) e um de infraestrutura de
deploy (D-27). Lição para sessões futuras: quando os logs do Supabase estão 100% limpos durante
um erro relatado pelo usuário, o problema não está no banco nem na lógica da página — está em
alguma camada entre o build e o navegador (aqui, o empacotamento da função serverless).

**Não verificado 100%**: não recebi confirmação do Mikael depois deste último deploy (o
anterior, [D-26], ele confirmou que ainda dava erro). Próxima sessão: perguntar se o erro
"This page couldn't load" parou de aparecer; se persistir, o próximo suspeito é o mesmo bug em
outra função (nem toda função tem o mesmo padrão de import) — pode precisar também de
`serverExternalPackages` ou abrir um ticket com o suporte da Vercel citando os issues acima.