# Decisões — TMS Fretes SOMA

> Registro de decisões importantes com motivo. Última atualização: 2026-09-13.
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
