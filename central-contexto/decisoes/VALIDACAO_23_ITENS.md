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

## Pendente nesta auditoria (ainda não verificados nesta sessão)
- Gráficos: chartQuadrante (`PrecoPrazoChart.tsx`), chartUf (`RegiaoComercialChart.tsx`), chartClientes (`ClientesChart.tsx`)
- Tabelas: tblPrazoHist, tblCidades (`transportadoras/page.tsx`), ontTabela (`ontem/page.tsx`), tblOportunidades (`OportunidadesTabsClient.tsx`), opQuem, opCidades (`operacao/page.tsx`)
