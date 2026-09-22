-- ============================================================================
-- Migration: 2026092201_create_ontem_romaneio_simulador.sql
-- Simulador de Frete por Romaneio — ver
-- docs/superpowers/specs/2026-09-22-simulador-frete-romaneio-design.md
--
-- 1 linha por romaneio do dia (só romaneios com ao menos 1 contratação
-- naquele dia — inner join com contratacoes), com jsonb_agg aninhado por
-- pedido e, dentro de cada pedido, jsonb_agg de todas ofertas reais
-- registradas em `ofertas` para aquela cotação
-- ============================================================================

CREATE OR REPLACE FUNCTION ontem_romaneio_simulador(p_dia date)
RETURNS TABLE (
  romaneio text,
  n_pedidos int,
  pedidos jsonb
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = 'public'
AS $$
  WITH pedidos_por_cotacao AS (
    SELECT
      cot.id,
      cot.pedido,
      cot.nf,
      cli.nome AS cliente,
      cli.cidade,
      ctr.transportadora_id AS contratada_transportadora_id,
      t_contratada.nome_curto AS contratada_transportadora,
      ctr.valor_frete_contratado AS contratada_valor,
      COALESCE(
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'transportadora_id', o.transportadora_id,
            'transportadora', t.nome_curto,
            'preco_final', o.preco_final,
            'prazo_dias', o.prazo_dias
          )
          ORDER BY o.preco_final ASC
        ) FILTER (WHERE o.transportadora_id IS NOT NULL),
        '[]'::jsonb
      ) AS ofertas
    FROM cotacoes cot
    INNER JOIN contratacoes ctr ON ctr.cotacao_id = cot.id
    LEFT JOIN clientes cli ON cli.cnpj = cot.cnpj_cliente
    LEFT JOIN transportadoras t_contratada ON t_contratada.id = ctr.transportadora_id
    LEFT JOIN ofertas o ON o.cotacao_id = cot.id
    LEFT JOIN transportadoras t ON t.id = o.transportadora_id
    WHERE ctr.data_contratacao::date = p_dia
      AND cot.romaneio IS NOT NULL
    GROUP BY cot.id, cot.pedido, cot.nf, cli.nome, cli.cidade, ctr.transportadora_id, t_contratada.nome_curto, ctr.valor_frete_contratado
  )
  SELECT
    cot.romaneio,
    COUNT(DISTINCT ppc.id)::int AS n_pedidos,
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'cotacao_id', ppc.id,
        'pedido', ppc.pedido,
        'nf', ppc.nf,
        'cliente', ppc.cliente,
        'cidade', ppc.cidade,
        'contratada_transportadora_id', ppc.contratada_transportadora_id,
        'contratada_transportadora', ppc.contratada_transportadora,
        'contratada_valor', ppc.contratada_valor,
        'ofertas', ppc.ofertas
      )
      ORDER BY ppc.pedido
    ) AS pedidos
  FROM pedidos_por_cotacao ppc
  JOIN cotacoes cot ON cot.id = ppc.id
  GROUP BY cot.romaneio
  ORDER BY cot.romaneio;
$$;
