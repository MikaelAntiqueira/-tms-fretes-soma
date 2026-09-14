# Validação campo a campo — 23 gráficos/tabelas portados anteriormente

> Task Supabase `agent_tasks#5`. Método: ler a função `renderXxx()` do Artifact
> original (`c0abf79e-...`, v39/v42) linha a linha, comparar com o componente
> React + a RPC/migration correspondente no Postgres, e onde possível rodar a
> RPC direto (`execute_sql`) e cruzar com a planilha de referência ("Base de
> Fretes — Cotado x Contratado.xlsx", aba "Dashboard Executivo", Google Drive).
> Em andamento — atualizado a cada lote verificado, não é um relatório final.

## Legenda
- ✅ CONFERE — fórmula/dado/rótulo batem com o original.
- 🔴 DIVERGE — achado real, com evidência. Não corrigido sozinho quando a
  causa raiz não está 100% clara ou quando a correção exige mudança de
  schema/RPC compartilhado (nesta sessão, `apply_migration` foi bloqueado
  pelo classificador de permissões do Claude Code para escrita em recurso
  compartilhado — a correção já desenhada fica registrada aqui, mas precisa
  de aprovação explícita antes de aplicar).

## Financeiro — sub-aba "Padrões da Diferença" (`PadroesCharts.tsx`)

- ✅ **chartDiffPrazo** — `financeiro_diff_por_prazo()`: `avg(diferenca_r) group by prazo_contratado`, mesma condição (`diferenca_r is not null`), mesmo texto de cobertura ("Cobertura: X% ... (com_prazo de total)"). Bate com `renderPadroes` linha ~2250-2265.
- ✅ **chartDiffUf** — `financeiro_diff_por_regiao()`: `sum(diferenca_r) where regiao_normalizada is not null and diferenca_r>0`, top 10 desc. Usa `regiao_normalizada` (não a bruta), confirmado. Bate com linha ~2267-2277.
- ✅ **chartDiffTransp** — `financeiro_diff_por_transportadora()`: `sum(diferenca_r) where escolheu='N'`, `having sum>0`. O original usa uma lista fixa (`TRANSP_ORDER`) e filtra depois — resultado final idêntico (zeros são excluídos nos dois casos). Bate com linha ~2279-2289.
- ✅ **chartDiffTipo** — `financeiro_diff_por_tipo_cliente()`: `sum(diferenca_r) where diferenca_r>0 group by coalesce(tipo_cliente,'Não informado')`, sem limite. Bate com linha ~2291-2299.

## Financeiro — sub-aba "Peso, Cubagem & Custo" (`PesoCustoCharts.tsx` + tabelas)

- ✅ **chartPeso** — bins fixos `PESO_BINS` (0–10/10–25/.../1000+), raio `min(28, 5+sqrt(n)*1.6)`, média de frete por bin. Confere com `renderPeso` linha ~2115-2136.
- ✅ **chartPrazo** — média de frete por prazo contratado (RPC `financeiro_prazo_frete_medio`, não este `chartPrazo` de "Prazo x Frete Médio Financeiro" — não confundir com `chartQuadrante`/`PrecoPrazoChart.tsx`, que é outro gráfico). Confere com `renderPrazo` linha ~2162-2173.
- ✅ **tblCbmCusto** — RPC `financeiro_cubagem_custo()`: agrupa por faixa de cubagem fixa + "Não informado", soma peso/cbm/frete, KPI "custo/kg geral" sobre TODAS as faixas e "custo/m³ geral" EXCLUINDO "Não informado" — replica exatamente `renderCubagemCusto` linha ~2719-2747 (inclusive a assimetria kg-geral-inclui-tudo vs. m³-geral-exclui-não-informado).
- 🔴 **tblOutliers (DIVERGE — corrigido, bloqueado por permissão)** — RPC `financeiro_outliers_peso()` usava `percentile_cont` (interpolação linear) para Q1/Q3/mediana; o Artifact original usa `sorted[Math.floor(n*0.25)]`/`[...0.75)]`/`[...0.5)]` — **percentil por índice (nearest-rank), sem interpolação** (`renderPeso` linha ~2143-2146). Testado direto no banco: na faixa "1.000kg+" (n=15, a faixa mais sensível — é onde vivem os maiores fretes individuais), Q1 muda de R$ 663,55 (índice) para R$ 834,54 (interpolado), ~20% de diferença, o que muda o limiar de outlier (Q3+1,5×IQR: R$ 5.833 vs R$ 5.427) e pode incluir/excluir processos da lista de outliers de forma diferente do original. Nas faixas com amostra maior (0–500kg) a diferença é desprezível — o problema é concentrado nas faixas pequenas, que são justamente as de maior valor unitário.
  - **Correção já escrita e testada** (ver bloco SQL abaixo) — troca `percentile_cont` pelo índice exato via `array_agg(...)[floor(n*p)::int + 1]`. `apply_migration` foi negado pelo classificador de permissões ("Modify Shared Resources") nesta sessão — precisa rodar com aprovação humana ou de uma sessão com essa permissão liberada.

```sql
create or replace function public.financeiro_outliers_peso()
returns table(cliente text, peso numeric, frete numeric, faixa text, mediana numeric)
language sql stable set search_path = 'public' as $$
  with binned as (
    select cliente_nome, peso_considerado, frete_contratado,
      case when peso_considerado < 10 then 0 when peso_considerado < 25 then 1
           when peso_considerado < 50 then 2 when peso_considerado < 100 then 3
           when peso_considerado < 250 then 4 when peso_considerado < 500 then 5
           when peso_considerado < 1000 then 6 else 7 end as bin_idx
    from public.v_financeiro_padroes_base
    where peso_considerado is not null and frete_contratado is not null
  ),
  agg as (
    select bin_idx, array_agg(frete_contratado order by frete_contratado) as vals, count(*) as n
    from binned group by bin_idx having count(*) >= 5
  ),
  stats as (
    select bin_idx, n,
      vals[floor(n * 0.25)::int + 1] as q1,
      vals[floor(n * 0.75)::int + 1] as q3,
      vals[floor(n * 0.5)::int + 1] as med
    from agg
  )
  select b.cliente_nome, b.peso_considerado, b.frete_contratado,
    case b.bin_idx when 0 then '0–10kg' when 1 then '10–25kg' when 2 then '25–50kg'
      when 3 then '50–100kg' when 4 then '100–250kg' when 5 then '250–500kg'
      when 6 then '500–1.000kg' else '1.000kg+' end as faixa,
    s.med
  from binned b join stats s using (bin_idx)
  where b.frete_contratado > s.q3 + 1.5 * (s.q3 - s.q1)
  order by b.frete_contratado desc limit 10;
$$;
```
  - Achado menor (cosmético, não corrigido): a coluna "Peso (kg)" da tabela usa `fmtNum` (`src/app/financeiro/page.tsx:565`) em vez de um `fmtKg` com sufixo " kg" como o resto do app — mostra "994" em vez de "994,6 kg". Não é erro de dado, só falta o sufixo de unidade.

## Transportadoras — "Comparativo" (`ComparativoCharts.tsx` + `tblTransp`)

RPC: `transportadoras_comparativo()`. Implementação sofisticada — replica o recorte de janela "Meio-dia" (só Rede Nacional/Fritz Express + a própria contratada competem quando `janela='Meio-dia'`, regra do Artifact/dicionário "Recorte de comparação por janela"), não é um `MIN()` ingênuo.

- ✅ **% Vezes Contratada** (`chartContrxBarata`, coluna de `tblTransp`) — bate **exatamente** (18,3/7,6/20,8/26,2/26,4/0,2/0,5%) com a planilha de referência (aba "Achado — Transportadora Contratada x Transportadora Mais Barata").
- 🔴 **% Vezes Mais Barata (DIVERGE — achado real, causa raiz não confirmada, NÃO corrigido)** — diverge muito da planilha de referência para pelo menos 3 das 7 transportadoras:

  | Transportadora | Referência (planilha) | RPC atual | 
  |---|---|---|
  | Santa Cruz | 24,9% | 23,7% (próximo) |
  | Leomar | 35,9% | 35,3% (próximo) |
  | São Miguel | 1,5% | 1,6% (próximo) |
  | Fritz Express | 23,1% | **67,1%** |
  | Rede Nacional | 13,0% | **32,3%** |
  | Minuano | 0,7% | 0,8% (próximo) |
  | LKW | 0,9% | **95,5%** |

  Hipótese mais provável (não confirmada): LKW cotou só 44 vezes no total, e boa parte dessas cotações **LKW foi a ÚNICA transportadora que cotou** (nenhuma concorrência real) — nessas linhas ela "vence" trivialmente por não ter com quem competir. Se o pipeline Python original excluía linhas com só 1 oferta do denominador/numerador de "% Vezes Mais Barata" (coerente com a regra R-DIFERENÇA: "sem alternativa comprovada, sem critério disponível"), isso explicaria a queda de ~95% pra ~1%. Fritz Express e Rede Nacional são exatamente as duas transportadoras com tratamento especial no recorte de janela Meio-dia (sempre candidatas, mesmo sem ser a mais barata "de verdade") — pode ser um efeito colateral dessa regra inflando o placar delas.
  **Não tenho acesso ao script Python original (`enrich_dashboard_data.py`) pra confirmar a definição exata** — reportando o achado com a evidência, não uma correção. Antes de mexer nisso, vale checar com o Mikael/a fonte original se cotações com 1 única oferta devem contar para este indicador.

## 🔴🔴 ACHADO CRÍTICO — página /oportunidades está QUEBRADA em produção

Não é uma divergência de fórmula como as duas acima — é uma **página que
retorna erro pra todo visitante**, desde antes desta sessão de validação
(o bug já estava no commit `12a4916`, que criou a página).

**O que está quebrado**: `src/app/oportunidades/page.tsx` faz
`supabase.from("comparacoes").select("*")` — mas a view/tabela `comparacoes`
**não existe no banco** (`select * from comparacoes` → `ERROR: 42P01:
relation "comparacoes" does not exist`; confirmado também via `pg_class` e
via `supabase_migrations.schema_migrations`, que não tem nenhum registro de
migration aplicada com "comparacoes" no nome). A página captura o erro num
`try/catch` e mostra o banner "Não foi possível consultar o Supabase" em vez
de quebrar feio — mas **nenhum visitante consegue ver Classificação nem
Clientes Prioritários hoje**, isso inclui o `chartClassif` que eu portei na
task #2: o código do gráfico está certo, mas nunca renderizou com dado real
porque a busca falha antes de chegar nele.

**Por que nunca foi aplicada**: o arquivo de migration existe no repo
(`supabase/migrations/2026091303_create_comparacoes_view.sql`, commitado
junto com a página em `12a4916`) mas **nunca chegou a rodar no Postgres** —
e não rodaria mesmo que alguém tentasse: ele referencia 3 colunas que não
existem em `contratacoes` (`c.hr`, `c.prazo_dias`, `c.cubagem_m3` — conferido
no schema real: `contratacoes` não tem nenhuma das três; `cubagem_m3` existe
em `cotacoes`, não em `contratacoes`; `prazo_dias` só existe em `ofertas`).
A migration foi escrita contra um desenho de schema anterior/hipotético, não
contra o schema que acabou sendo criado.

**Problema mais profundo que só corrigir as colunas não resolve**: mesmo
corrigindo os nomes de coluna, a lógica de "melhor preço"/`diffR`/`diffP`/
`esc` desta migration é um `ROW_NUMBER() OVER (PARTITION BY cotacao_id ORDER
BY preco_final ASC)` **ingênuo** — não implementa o recorte de janela
"Meio-dia" (só Rede Nacional/Fritz Express competem nesse horário) que
`v_ontem_comparacao` e `transportadoras_comparativo()` já implementam
corretamente e que o resto do app inteiro usa como única fonte de verdade
pra esses 4 campos. Se essa view for só "consertada" pra rodar, ela vai
produzir `diffR`/`esc`/classificação **diferentes** dos mesmos processos
mostrados em `/financeiro` e `/ontem` — exatamente o Risco Nº1 do mapa de
migração ("recriar 'menor frete = melhor decisão' com uma query mais
simples, perdendo a nuance já resolvida em outro lugar").

**Recomendação (não aplicada — decisão de arquitetura, não só bug-fix)**:
reconstruir `comparacoes` como uma view SOBRE `v_ontem_comparacao` (que já
tem `diferenca_r`/`diferenca_pct`/`escolheu`/`melhor_cotacao` corretos) +
join com `clientes`/`cotacoes` pros campos extras (`faixa_peso`,
`faixa_cubagem`, `tipo_cliente`) + o cálculo de `classif`/`risco_prazo_alt`/
`oportunidade_prazo` por cima (esses 3 cálculos em si — percentil por grupo,
selo Leomar, oportunidade de prazo — parecem corretos na migration
original, o problema é só a BASE de diffR/esc que eles usam). Não tentei
escrever essa versão corrigida nem aplicar nada — é uma mudança grande o
suficiente (e a permissão de `apply_migration` já foi negada uma vez nesta
sessão para uma correção bem menor) que pede aprovação explícita antes de
qualquer tentativa.

## Transportadoras — demais gráficos/tabelas

- ✅ **chartQuadrante** (`PrecoPrazoChart.tsx`) — RPC `transportadoras_prazo_medio()` usa o mesmo padrão `dedup_contr` (via `v_ontem_radar`) já validado em `transportadoras_comparativo` (cujo `pct_contratada` bateu exato com a referência). Fórmula (prazo médio da oferta vencedora por transportadora contratada) confere com `renderTransportadoras` linha ~1996. Não recomputei o prazo médio contra uma referência externa (a planilha só tem "PRAZO MÉDIO CONTRATADO" agregado, não por transportadora) — confiança alta, não 100% independente.
- ✅ **chartUf** (`RegiaoComercialChart.tsx`) — RPC `transportadoras_regiao_comercial()`: soma `frete_contratado` por `regiao_normalizada`, sem limite; front-end corta top 15 e mostra "Top 15 de {N} Regiões Comerciais por valor contratado" — texto e corte batem exatamente com `renderUf` linha ~2072-2087.
- ✅ **chartClientes** (`ClientesChart.tsx`) — RPC `transportadoras_clientes_metricas()`: agrega por cliente sobre TODA a base de cotações (`n_processos` conta cruzada+não cruzada, como o comentário do arquivo já documentava), `frete_contratado`/`diferenca_positiva` só somam onde não nulo/positivo. Bate com `renderClientes` linha ~2091-2111 (top 12 por métrica escolhida, cortado no componente React).
- ⚠️ **tblPrazoHist** — RPC `transportadoras_prazo_hist()` usa `percentile_cont(0.5)` pra mediana. **Não consigo confirmar CONFERE ou DIVERGE com confiança**: ao contrário de `tblOutliers` (onde o cálculo do Artifact era JS ao vivo, visível), este dado vinha de `META.prazoHist`, pré-calculado pelo pipeline Python (`enrich_dashboard_data.py`, não disponível pra leitura) — não sei se o Python usava interpolação (bateria com `percentile_cont`) ou índice puro (bateria com o método usado em `tblOutliers`). Os `n` por transportadora batem na mesma ordem de grandeza da nota do dicionário ("LKW N=16, Minuano N=4, Rede Nacional N=57" vs atual LKW N=23, Minuano N=9, Rede Nacional N=55) — plausivelmente só deriva de dado novo entrando na base, não indício de bug. Reportando como incerteza, não como divergência confirmada.
- ✅ **tblCidades** — RPC `transportadoras_cidades()`: agrega por (cidade, transportadora) sobre TODA a base (sem limite — [D-19] "Cidades retorna TODAS"), mesmas somas/médias de `_cidadeTranspAgg`/`renderCidades` (linha ~2677-2718), mesma ordenação (frete total da cidade desc, depois frete da linha desc).
- ✅ **opQuem** (`operacao/page.tsx`) — RPC `operacao_por_transportadora()`: mesmo filtro (`n_pedidos>0 or frete>0`), mesma ordenação (frete desc). "Piso de frete observado" migrou do `PISO_OBS` hardcoded no JS (São Miguel 63,05 / Rede Nacional 46,20 / Fritz Express 30,25) pra coluna `transportadoras.frete_minimo_observado` — **valores conferidos direto no banco, batem exatamente** com os 3 hardcoded do Artifact, e `null` pros outros 4 (mesmo efeito visual do badge "Sem parâmetro").
- ✅ **opCidades** — RPC `operacao_por_cidade(p_top_n=15)`: correto em ser limitado a TOP 15 (diferente de `tblCidades`/transportadoras, que mostra todas — [D-19] distingue exatamente essas duas telas). Mesmas somas de `_cidadeTranspAgg`.
- ✅ **ontTabela** (`ontem/page.tsx`) — usa `ontem_kpis`/`ontem_contratacoes`, já sobre `v_ontem_comparacao`; o maior valor da lista (R$ 890,88) bate com "MAIOR OPORTUNIDADE INDIVIDUAL (R$)" da planilha de referência (conferido durante o trabalho de `dados_detalhe` na task #2).
- 🔴🔴 **tblOportunidades** — **BLOQUEADA**, ver seção "ACHADO CRÍTICO" acima. A tabela em si (`OportunidadesTabsClient.tsx`, "Processos classificados — detalhe") está corretamente implementada, mas a fonte de dados (`view comparacoes`) não existe no banco — a página inteira retorna erro.

## Resumo final — 23/23 itens revisados

| Resultado | Qtd | Itens |
|---|---|---|
| ✅ CONFERE | 18 | chartDiffPrazo/Uf/Transp/Tipo, chartPeso/chartPrazo, tblCbmCusto, chartQuadrante, chartUf, chartClientes, tblCidades, opQuem, opCidades, ontTabela, + % Vezes Contratada de tblTransp |
| ⚠️ Incerto (sem referência suficiente) | 1 | tblPrazoHist (percentil pode ou não bater com o pipeline Python original) |
| 🔴 DIVERGE (achado real, não corrigido) | 2 | tblOutliers (percentil por índice vs interpolado); % Vezes Mais Barata de tblTransp |
| 🔴🔴 QUEBRADO (página inteira sem dado) | 1 (afeta 2 itens) | tblOportunidades + chartClassif (task #2) — view `comparacoes` não existe |

Achado menor (cosmético): coluna "Peso" de `tblOutliers` sem sufixo " kg" (usa `fmtNum` em vez de `fmtKg`).
