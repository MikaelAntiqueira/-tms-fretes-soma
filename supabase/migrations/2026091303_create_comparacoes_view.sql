-- ============================================================================
-- Migration: 001_create_comparacoes_view.sql
-- View que reproduz a classificação do enrich_dashboard_data.py no Postgres.
-- → 5 colunas de classificação: classif, risco_prazo_alt, oportunidade_prazo,
--   faixa_peso, faixa_cubagem
-- → Reutiliza: cotacoes, ofertas, contratacoes, transportadoras, clientes
-- ============================================================================

-- --------------------------------------------------------------------
-- 1. Funções auxiliares (ficam antes da view por dependência)
-- --------------------------------------------------------------------

-- faixa_peso: [DEC-26] cortes em 10/20/50/100/250 → 0-10/10-20/20-50/50-100/100-250/250+
CREATE OR REPLACE FUNCTION fn_faixa_peso(p numeric)
RETURNS text AS $$
  SELECT CASE
    WHEN p IS NULL THEN 'Não informado'
    WHEN p < 10  THEN '0–10 kg'
    WHEN p < 20  THEN '10–20 kg'
    WHEN p < 50  THEN '20–50 kg'
    WHEN p < 100 THEN '50–100 kg'
    WHEN p < 250 THEN '100–250 kg'
    ELSE '250+ kg'
  END;
$$ LANGUAGE SQL IMMUTABLE;

-- faixa_cubagem: <0,05 / 0,05-0,15 / 0,15-0,5 / 0,5-2 / 2+
CREATE OR REPLACE FUNCTION fn_faixa_cubagem(c numeric)
RETURNS text AS $$
  SELECT CASE
    WHEN c IS NULL THEN 'Não informada'
    WHEN c <  0.05 THEN '<0,05 m³'
    WHEN c <  0.15 THEN '0,05–0,15 m³'
    WHEN c <  0.5  THEN '0,15–0,5 m³'
    WHEN c <  2    THEN '0,5–2 m³'
    ELSE '2+ m³'
  END;
$$ LANGUAGE SQL IMMUTABLE;

-- janela: [DEC-18] "Meio-dia" só se tContr ∈ {Rede Nacional, Fritz Express}
-- E hora < 15:00; senão "Tarde"; sem hora → "Não informada"
CREATE OR REPLACE FUNCTION fn_janela(hr time, t_contr text)
RETURNS text AS $$
  SELECT CASE
    WHEN hr IS NULL THEN 'Não informada'
    WHEN t_contr IN ('Rede Nacional', 'Fritz Express') AND hr < '15:00'::time
      THEN 'Meio-dia'
    ELSE 'Tarde'
  END;
$$ LANGUAGE SQL IMMUTABLE;

-- --------------------------------------------------------------------
-- 2. View comparacoes — equivalente SQL da classificação do Python
--    base: 1 linha por contratação, com melhor preço + diffR/diffP/esc
--    classificacao: verde/azul/laranja/vermelho/alerta (idem _classificar)
--    risco_prazo_alt: esc='N' AND mais_barata=Leomar (DEC-22)
--    oportunidade_prazo: esc='N'+diffR>0+prazo_alt≤prazo_contr+alt≠Leomar (TASK-25)
-- --------------------------------------------------------------------

CREATE OR REPLACE VIEW comparacoes AS
WITH melhor_oferta AS (
  -- A oferta mais barata de cada cotação (1 linha por cotação)
  SELECT
    o.cotacao_id,
    o.transportadora_id   AS transportadora_mais_barata_id,
    o.preco_final         AS melhor_preco,
    o.prazo_dias          AS prazo_mais_barata_dias,
    ROW_NUMBER() OVER (
      PARTITION BY o.cotacao_id
      ORDER BY o.preco_final ASC, o.transportadora_id ASC
    ) AS rn
  FROM ofertas o
  WHERE o.preco_final IS NOT NULL
),
base AS (
  -- 1 linha por contratação
  SELECT
    c.id AS contratacao_id,
    c.pedido,
    c.nf,
    c.data_contratacao,
    c.cnpj_cliente,
    cl.nome       AS cliente_nome,
    cl.tipo_cliente,
    cl.cidade,
    cl.regiao_normalizada,
    t.nome_curto AS transportadora_contratada,
    c.valor_frete_contratado,
    c.peso_real_kg,
    c.peso_cubado_kg,
    c.cubagem_m3,
    fn_faixa_peso(c.peso_real_kg)         AS faixa_peso,
    fn_faixa_cubagem(c.cubagem_m3)        AS faixa_cubagem,
    fn_janela(c.hr, t.nome_curto)         AS janela,
    -- Melhor preço e transportadora mais barata
    COALESCE(m.melhor_preco, c.valor_frete_contratado) AS melhor_preco,
    m.transportadora_mais_barata_id,
    t2.nome_curto                                      AS transportadora_mais_barata,
    -- diffR = frete contratado - melhor preço
    CASE WHEN m.melhor_preco IS NOT NULL
      THEN c.valor_frete_contratado - m.melhor_preco
    END                                               AS diffR,
    -- diffP = diffR / melhor preço
    CASE WHEN m.melhor_preco IS NOT NULL AND m.melhor_preco > 0
      THEN (c.valor_frete_contratado - m.melhor_preco) / m.melhor_preco
    END                                               AS diffP,
    -- esc: S (contratada = mais barata), N (pagou mais), SC (sem comparação)
    CASE
      WHEN m.melhor_preco IS NULL
        THEN 'SC'                                     -- sem oferta
      WHEN c.valor_frete_contratado <= m.melhor_preco
        THEN 'S'                                      -- contratada ≤ melhor
      ELSE 'N'
    END                                               AS esc,
    -- Prazo contratado (só quando a contratada também cotou)
    c.prazo_dias                                      AS prazo_contratado_dias,
    -- Prazo da alternativa mais barata
    m.prazo_mais_barata_dias                          AS prazo_alternativa_dias
  FROM contratacoes c
  LEFT JOIN melhor_oferta  m   ON m.cotacao_id = c.cotacao_id
  LEFT JOIN clientes       cl  ON cl.cnpj = c.cnpj_cliente
  LEFT JOIN transportadoras t  ON t.id = c.transportadora_id
  LEFT JOIN transportadoras t2 ON t2.id = m.transportadora_mais_barata_id
),
grupo_percentis AS (
  -- Percentis P25/P75 por tipo de cliente (Público/Privado)
  -- idênticos ao _classificar() do enrich_dashboard_data.py
  SELECT
    tipo_cliente,
    percentile_disc(0.25) WITHIN GROUP (ORDER BY diffR) AS p25_r,
    percentile_disc(0.25) WITHIN GROUP (ORDER BY diffP) AS p25_p,
    percentile_disc(0.75) WITHIN GROUP (ORDER BY diffR) AS p75_r,
    percentile_disc(0.75) WITHIN GROUP (ORDER BY diffP) AS p75_p
  FROM base
  WHERE tipo_cliente IN ('Público', 'Privado')
    AND diffR IS NOT NULL
    AND diffR > 0
    AND diffP IS NOT NULL
  GROUP BY tipo_cliente
)
SELECT
  -- Identificação
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
  -- Comparacao
  b.melhor_preco,
  b.diffR,
  b.diffP,
  b.esc,
  b.prazo_contratado_dias,
  b.prazo_alternativa_dias,
  -- Classificacao (E5) — idêntica ao _classificar() do Python
  CASE
    WHEN b.esc = 'S' THEN 'verde'
    WHEN b.esc != 'N' THEN NULL
    WHEN b.tipo_cliente NOT IN ('Público', 'Privado') THEN 'alerta'
    WHEN b.diffR <= gp.p25_r
      AND b.diffP <= gp.p25_p
      AND b.diffR IS NOT NULL
      AND b.diffP IS NOT NULL
      THEN 'azul'
    WHEN b.diffR >= gp.p75_r
      OR (b.diffP IS NOT NULL AND b.diffP >= gp.p75_p)
      THEN 'vermelho'
    ELSE 'laranja'
  END AS classif,
  -- riscoPrazoAlt (DEC-22): esc='N' AND mais_barata=Leomar
  (b.esc = 'N'
   AND b.transportadora_mais_barata = 'Leomar') AS risco_prazo_alt,
  -- oportunidade_prazo (TASK-25): esc='N'+diffR>0+prazo_alt≤prazo_contr+alt≠Leomar
  (b.esc = 'N'
   AND b.diffR IS NOT NULL AND b.diffR > 0
   AND b.prazo_alternativa_dias IS NOT NULL
   AND b.prazo_alternativa_dias <= b.prazo_contratado_dias
   AND b.transportadora_mais_barata != 'Leomar') AS oportunidade_prazo
FROM base b
LEFT JOIN grupo_percentis gp ON gp.tipo_cliente = b.tipo_cliente;

-- --------------------------------------------------------------------
-- Índices sugeridos para performance (rodar separadamente depois, se
-- necessário — não criamos aqui pois o schema pode ainda não ter sido
-- populado).
-- --------------------------------------------------------------------
-- CREATE INDEX idx_ofertas_cotacao_preco ON ofertas(cotacao_id, preco_final);
-- CREATE INDEX idx_contratacoes_cnpj ON contratacoes(cnpj_cliente);
