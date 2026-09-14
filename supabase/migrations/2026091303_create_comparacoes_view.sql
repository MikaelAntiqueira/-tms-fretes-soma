-- ============================================================================
-- Migration: 2026091303_create_comparacoes_view.sql
-- HISTÓRICO: a versão original deste arquivo nunca rodou no Postgres — ela
-- referenciava contratacoes.hr / contratacoes.prazo_dias / contratacoes.cubagem_m3
-- (colunas inexistentes) e sua lógica de diffR/diffP/esc era um ROW_NUMBER()
-- ingênuo, divergente do recorte de janela "Meio-dia" já resolvido em
-- v_ontem_comparacao (achado em VALIDACAO_23_ITENS.md, 2026-09-14).
--
-- Esta é a versão CORRIGIDA, de fato aplicada ao projeto Supabase
-- jpoizkylaffircimxzrq em 2026-09-14 (duas migrations reais no histórico do
-- banco: fix_create_comparacoes_view_sobre_v_ontem_comparacao e
-- fix_comparacoes_dedup_ofertas_duplicadas_prazo_contratado — este arquivo
-- consolida as duas no estado final, pra manter o repo fiel ao banco).
--
-- Reconstrói `comparacoes` SOBRE v_ontem_comparacao (fonte de verdade única
-- de diferenca_r/diferenca_pct/escolheu/melhor_cotacao, já usada por
-- /financeiro e /ontem) e só adiciona por cima:
--   - identidade da oferta vencedora (transportadora + prazo), respeitando
--     o MESMO recorte de janela "Meio-dia" que v_ontem_comparacao aplica;
--   - prazo da própria contratada, agregado por (cotacao_id, transportadora_id)
--     — a tabela `ofertas` tem duplicatas de importação; sem agregar, a
--     linha da contratação duplicava (5.200 em vez de 5.196 — validado
--     batendo exatamente com v_ontem_comparacao depois da correção);
--   - faixa_peso / faixa_cubagem (funções auxiliares, search_path fixado);
--   - classif / risco_prazo_alt / oportunidade_prazo (cálculos idênticos à
--     migration original — só a BASE de diffR/esc mudou).
--
-- Validado: 5.196 linhas, soma diffR>0 = R$ 45.957,95 — exatamente igual a
-- v_ontem_comparacao (nenhuma segunda fonte de verdade divergente).
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_faixa_peso(p numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p IS NULL THEN 'Não informado'
    WHEN p < 10  THEN '0–10 kg'
    WHEN p < 20  THEN '10–20 kg'
    WHEN p < 50  THEN '20–50 kg'
    WHEN p < 100 THEN '50–100 kg'
    WHEN p < 250 THEN '100–250 kg'
    ELSE '250+ kg'
  END;
$$;

CREATE OR REPLACE FUNCTION fn_faixa_cubagem(c numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN c IS NULL THEN 'Não informada'
    WHEN c <  0.05 THEN '<0,05 m³'
    WHEN c <  0.15 THEN '0,05–0,15 m³'
    WHEN c <  0.5  THEN '0,15–0,5 m³'
    WHEN c <  2    THEN '0,5–2 m³'
    ELSE '2+ m³'
  END;
$$;

CREATE OR REPLACE VIEW comparacoes
WITH (security_invoker = true) AS
WITH vencedora_base AS (
  SELECT
    ct.id AS contratacao_id,
    ct.cotacao_id,
    ct.transportadora_id AS transportadora_contratada_id,
    t.opera_janela_meio_dia,
    (EXTRACT(hour FROM (ct.data_contratacao AT TIME ZONE 'UTC')) < 15) AS antes_das_15
  FROM contratacoes ct
  LEFT JOIN transportadoras t ON t.id = ct.transportadora_id
  WHERE ct.cotacao_id IS NOT NULL
),
ofertas_no_recorte AS (
  -- Mesmo recorte "Meio-dia" de v_ontem_comparacao (melhor_recorte + oferta_propria):
  -- se a contratada opera meio-dia E contratou antes das 15h, só concorrem ofertas
  -- de transportadoras que também operam meio-dia (+ a própria contratada); senão,
  -- concorrem todas as ofertas da cotação.
  SELECT
    vb.contratacao_id,
    o.transportadora_id,
    o.preco_final,
    o.prazo_dias,
    ROW_NUMBER() OVER (
      PARTITION BY vb.contratacao_id
      ORDER BY o.preco_final ASC, o.transportadora_id ASC
    ) AS rn
  FROM vencedora_base vb
  JOIN ofertas o ON o.cotacao_id = vb.cotacao_id
  JOIN transportadoras ot ON ot.id = o.transportadora_id
  WHERE o.preco_final IS NOT NULL
    AND (
      NOT (vb.opera_janela_meio_dia AND vb.antes_das_15)
      OR ot.opera_janela_meio_dia
      OR o.transportadora_id = vb.transportadora_contratada_id
    )
),
vencedora AS (
  SELECT DISTINCT ON (contratacao_id)
    contratacao_id,
    transportadora_id AS transportadora_mais_barata_id,
    prazo_dias         AS prazo_alternativa_dias
  FROM ofertas_no_recorte
  WHERE rn = 1
),
prazo_contratado AS (
  -- Agregado por (cotacao_id, transportadora_id) — protege contra ofertas
  -- duplicadas na origem, que multiplicariam a linha da contratação.
  SELECT cotacao_id, transportadora_id, MIN(prazo_dias) AS prazo_contratado_dias
  FROM ofertas
  GROUP BY cotacao_id, transportadora_id
),
base AS (
  SELECT
    v.contratacao_id,
    ct.pedido,
    ct.nf,
    ct.data_contratacao,
    ct.cnpj_cliente,
    cl.nome              AS cliente_nome,
    cl.tipo_cliente,
    v.cidade,
    cl.regiao_normalizada,
    v.transportadora     AS transportadora_contratada,
    v.frete_contratado   AS valor_frete_contratado,
    ct.peso_real_kg,
    fn_faixa_peso(ct.peso_real_kg)    AS faixa_peso,
    fn_faixa_cubagem(co.cubagem_m3)   AS faixa_cubagem,
    v.janela,
    v.melhor_cotacao     AS melhor_preco,
    tb.nome_curto        AS transportadora_mais_barata,
    v.diferenca_r        AS "diffR",
    v.diferenca_pct      AS "diffP",
    v.escolheu           AS esc,
    pc.prazo_contratado_dias,
    ve.prazo_alternativa_dias
  FROM v_ontem_comparacao v
  JOIN contratacoes ct           ON ct.id = v.contratacao_id
  LEFT JOIN cotacoes co          ON co.id = ct.cotacao_id
  LEFT JOIN clientes cl          ON cl.cnpj = ct.cnpj_cliente
  LEFT JOIN vencedora ve         ON ve.contratacao_id = v.contratacao_id
  LEFT JOIN transportadoras tb   ON tb.id = ve.transportadora_mais_barata_id
  LEFT JOIN prazo_contratado pc  ON pc.cotacao_id = ct.cotacao_id AND pc.transportadora_id = ct.transportadora_id
),
grupo_percentis AS (
  -- Percentis P25/P75 por tipo de cliente (idêntico ao _classificar() do
  -- enrich_dashboard_data.py) — só sobre diferenças positivas.
  SELECT
    tipo_cliente,
    percentile_disc(0.25) WITHIN GROUP (ORDER BY "diffR") AS p25_r,
    percentile_disc(0.25) WITHIN GROUP (ORDER BY "diffP") AS p25_p,
    percentile_disc(0.75) WITHIN GROUP (ORDER BY "diffR") AS p75_r,
    percentile_disc(0.75) WITHIN GROUP (ORDER BY "diffP") AS p75_p
  FROM base
  WHERE tipo_cliente IN ('Público', 'Privado')
    AND "diffR" IS NOT NULL AND "diffR" > 0
    AND "diffP" IS NOT NULL
  GROUP BY tipo_cliente
)
SELECT
  b.contratacao_id,
  b.pedido,
  b.nf,
  b.data_contratacao,
  b.cnpj_cliente,
  b.cliente_nome,
  b.tipo_cliente,
  b.cidade,
  b.regiao_normalizada,
  b.transportadora_contratada,
  b.valor_frete_contratado,
  b.peso_real_kg,
  b.faixa_peso,
  b.faixa_cubagem,
  b.janela,
  b.melhor_preco,
  b.transportadora_mais_barata,
  b."diffR",
  b."diffP",
  b.esc,
  b.prazo_contratado_dias,
  b.prazo_alternativa_dias,
  CASE
    WHEN b.esc = 'S' THEN 'verde'
    WHEN b.esc != 'N' THEN NULL
    WHEN b.tipo_cliente NOT IN ('Público', 'Privado') THEN 'alerta'
    WHEN b."diffR" <= gp.p25_r AND b."diffP" <= gp.p25_p
      AND b."diffR" IS NOT NULL AND b."diffP" IS NOT NULL
      THEN 'azul'
    WHEN b."diffR" >= gp.p75_r OR (b."diffP" IS NOT NULL AND b."diffP" >= gp.p75_p)
      THEN 'vermelho'
    ELSE 'laranja'
  END AS classif,
  (b.esc = 'N' AND b.transportadora_mais_barata = 'Leomar') AS risco_prazo_alt,
  (b.esc = 'N'
   AND b."diffR" IS NOT NULL AND b."diffR" > 0
   AND b.prazo_alternativa_dias IS NOT NULL
   AND b.prazo_alternativa_dias <= b.prazo_contratado_dias
   AND b.transportadora_mais_barata != 'Leomar') AS oportunidade_prazo
FROM base b
LEFT JOIN grupo_percentis gp ON gp.tipo_cliente = b.tipo_cliente;
