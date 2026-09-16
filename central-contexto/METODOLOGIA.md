# Metodologia — Dicionário de Indicadores

> Explicação de referência do que cada número do dashboard significa, de onde vem e qual
> regra de negócio segue. Escrito em 2026-09-16 a partir das decisões FINAIS já registradas
> em `central-contexto/decisoes/LOG_DECISOES.md` (D-01 a D-31) e dos comentários das próprias
> RPCs no Supabase (`COMMENT ON FUNCTION`) — nunca fórmula inventada.
>
> **Não é uma cópia do dicionário do projeto original** (`memoria/05_DICIONARIO_KPIS.md`, no
> Google Drive): aquele tem ~9 meses de números já superados por correções e decisões mais
> recentes. Este arquivo fica guardado no repositório para consulta pontual — não é uma página
> do site. Se os números aqui citados como "valor atual" precisarem de confirmação, a fonte
> viva é sempre a RPC `financeiro_visao_geral_kpis()` (sem filtro) no Supabase, não este texto.

## Universo de dados

**Cotações × contratações × contratações cruzadas** — "Cotações" é toda sessão de cotação
registrada, tenha ou não virado contratação. "Contratações" é o total de fretes efetivamente
contratados. "Contratações cruzadas" são as contratações que casaram com uma cotação
registrada — só essas entram nas comparações de preço do dashboard (cerca de 1/3 da operação).

**Regra [D-06] (FINAL)**: KPIs de "Total de Cotações"/"Total de Pedidos" contam TODA a base;
"Frete Contratado"/"Frete Médio"/os baldes Sim-Não-Sem comparação olham só para o subconjunto
cruzado. Misturar os dois universos gera KPI errado — por isso aparecem sempre separados.

**Cobertura estrutural**: a maior parte das contratações nunca teve uma cotação pra cruzar —
é limitação de FONTE (dado que não existe), não de método de cálculo. Por isso os KPIs de
cobertura NÃO reagem ao filtro global: mudar o filtro muda o recorte analisado, não o tamanho
estrutural da base.

## Indicadores executivos (Visão Geral de /financeiro)

- **Frete Contratado**: soma de `valor_frete_contratado` só das contratações cruzadas — nunca
  somada no cliente (PostgREST limita 1.000 linhas/requisição; a soma sempre roda dentro do
  banco — [D-05]).
- **Diferença Financeira Identificada**: soma das diferenças POSITIVAS entre o frete contratado
  e a menor cotação disponível. **Não é "economia perdida"** nem confirma erro — é um valor
  objetivo; a decisão pode ter motivo legítimo (prazo, prestação de serviço, relacionamento)
  que a base não registra.
- **Economia Capturada — sempre "N/D"**: não há campo de "motivo da escolha" na base
  ([DEC-25], FINAL) — não é possível comprovar que uma diferença identificada foi efetivamente
  evitada por uma ação confirmada da gestão. É estruturalmente N/D, não um bug.
- **% Escolheu a Mais Barata**: fração de contratações comparáveis em que a transportadora
  contratada era também a mais barata cotada. Universo: só linhas com comparação real (exclui
  "sem comparação").
- **Sim ≠ mais barata [D-07] (FINAL)**: "Escolheu a mais barata?" (`esc`) é sobre a cotação
  ESPECÍFICA daquele processo — uma contratação pode ser "Sim" sem ter sido a opção mais
  barata entre TODAS as transportadoras que já cotaram historicamente (universos diferentes).
- **Frete Médio**: Frete Contratado ÷ nº de processos com frete cruzado.

## Peso e cubagem

- **Peso considerado = maior entre peso real e peso cubado — [D-08]/[DEC-27] (FINAL)**: as
  transportadoras cobram pelo MAIOR entre peso real e peso cubado (fator de cubagem 300 kg/m³)
  — nunca só um dos dois. Todo cálculo que envolve "peso" neste sistema usa esse valor
  considerado.
- **Faixas de peso — [DEC-26] (FINAL)**: cortes em 10/20/50/100/250 kg → faixas `0–10` /
  `10–20` / `20–50` / `50–100` / `100–250` / `250+` kg. Usadas na dimensão "Faixa de Peso" do
  motor de filtro global (`v_cotacao_filtros`, corrigido 2026-09-16 — ver [D-31]). **O gráfico
  "Peso × Frete Contratado" e a tabela de outliers de /financeiro usam um esquema DIFERENTE e
  mais fino** (8 faixas: 10/25/50/100/250/500/1.000 kg — `PESO_BINS`, herdado do Artifact
  original) — os dois esquemas coexistem de propósito, confirmado no próprio Artifact; não
  unificar sem decisão explícita.
- **Faixas de cubagem — [DEC-26] (FINAL)**: `<0,05` / `0,05–0,15` / `0,15–0,5` / `0,5–2` /
  `2+` m³. Sem grade de volumes (contratação direta) → "Não informado", nunca descartada.

## Janela de contratação

**Meio-dia (Rede Nacional × Fritz Express) × Tarde (todas as demais)**: objetivo é julgar a
decisão de contratação contra o conjunto de transportadoras que DE FATO concorria naquele
horário, não contra a grade inteira. A janela é "Meio-dia" só quando a contratada é Rede
Nacional ou Fritz Express E a hora do registro é antes das 15h — só essas duas operam no
meio-dia. As demais transportadoras contratam sempre na janela "Tarde". Sem hora registrada →
"Não informada". Na janela Meio-dia, a comparação de preço considera só as ofertas de Rede
Nacional + Fritz Express (mais a própria contratada).

## Radar de Decisão (página "Hoje"/`/ontem`)

Até 5 situações por dia que merecem atenção — nunca acusa erro.

- **D2 — Oportunidade a verificar**: linha do dia com "Escolheu a Mais Barata? = Não",
  diferença positiva, e uma alternativa que cotou o MESMO romaneio. Confiabilidade MÉDIA/BAIXA
  — o prazo da alternativa é só um proxy (mediana histórica), não o prazo real daquela cotação.
- **D3 — Recorrência**: mesmo (cliente, cidade, transportadora contratada) com "Não escolheu a
  mais barata" ≥ 8× em 60 dias. Confiabilidade ALTA — é contagem factual; se é de fato
  oportunidade de renegociação ainda depende de prazo/prestação que a base não registra.
- **D4 — Concentração**: cidade com ≥ 10 contratações em 30 dias, ≥ 2 transportadoras já
  usadas, e uma delas concentrando ≥ 80% do volume. Confiabilidade ALTA — factual, NÃO afirma
  risco; serve pra avaliar se existe 2ª opção viável.
- **D6 — Anomalia de preço**: frete contratado acima da mediana + 3×IQR da mesma
  transportadora, na mesma faixa de peso e cubagem (amostra ≥ 30). Confiabilidade MÉDIA — pode
  ser carga atípica legítima, vale conferir a NF.
- **D1/D5 — aguardando dado**: "Oportunidade objetiva" (D1) precisa de prazo E prestação de
  serviço por oferta; "Frete mínimo fora do parâmetro" (D5) precisa dos valores oficiais por
  transportadora. Nenhum dos dois é calculado enquanto o dado não chegar — nunca estimado.

## Outras regras estruturais

- **Região Comercial ≠ UF — [D-02] (FINAL)**: usa sempre `clientes.regiao_normalizada`, nunca
  a UF bruta (sufixo " PRIVADO"/" PUBLICO", não deve aparecer em relatório).
- **Frete mínimo observado ≠ tabela oficial — [D-04] (FINAL)**: o piso usado em `/operacao` vem
  de `transportadoras.frete_minimo_observado` (calculado sobre os dados reais), nunca a tabela
  oficial (pode estar desatualizada). Sempre rotulado como estimativa.
- **Prazo de oferta perdida nunca é inventado — [D-03] (FINAL)**: sempre o prazo REAL da
  oferta, nunca um prazo estimado quando a informação não existe.

## Motor de filtro global

11 dimensões disponíveis em `/financeiro` (Visão Geral) e `/dados`: Mês, Transportadora
Contratada, Romaneio Nº, Região Comercial, Tipo Cliente, Escolheu a Mais Barata, Prazo (dias),
Cidade, Janela de Contratação, Faixa de Peso e Faixa de Cubagem. Cada dimensão aceita múltiplos
valores (OU entre eles); as dimensões se combinam entre si com E. Ausência de valor numa
dimensão = "todos" (nunca "zero resultados"). Estado vive na URL
(`?mes=/?transportadora=/...`, valores separados por vírgula) — nunca em memória JS.
`/operacao` e `/transportadoras` só reagem parcialmente (uma seção/aba cada, 4 das 11
dimensões) — ver `pendencias/PENDENTES.md` pro estado atual de cada página.
