-- ============================================================================
-- Migration: 2026092202_fix_ontem_romaneio_simulador_paridade.sql
-- Fix Round 1 da revisão final do Simulador de Frete por Romaneio — ver
-- docs/superpowers/plans/2026-09-22-simulador-frete-romaneio-design.md.
--
-- A versão original de ontem_romaneio_simulador (2026092201) filtrava por
-- ctr.data_contratacao::date = p_dia e usava cot.romaneio puro. O resto de
-- /ontem usa a view v_ontem_comparacao, cuja definição real de "dia" é
-- (cotacoes.criado_em AT TIME ZONE 'UTC')::date e de "romaneio" é
-- COALESCE(cotacoes.romaneio, split_part(contratacoes.pedido, '-', 1)) —
-- não o que a spec original descrevia. Sem essa paridade a seção nova
-- ficava vazia no dia de referência padrão da página e mostrava só um
-- subconjunto dos romaneios em outros dias. Também troca nf de cot.nf puro
-- para COALESCE(ctr.nf, cot.nf), igual à view, pra bater com a NF mostrada
-- na tabela "Todas as contratações do dia".
--
-- Validado direto no banco (2026-09-22): contagem de pedidos e de romaneios
-- distintos bate 100% com v_ontem_comparacao em 6 dias testados
-- (27/08, 26/08, 25/08, 24/08, 19/08, 17/08 de 2026).
-- ============================================================================

create or replace function ontem_romaneio_simulador(p_dia date)
returns table (
  romaneio text,
  n_pedidos int,
  pedidos jsonb
)
security invoker
language sql
stable
as $$
  with base as (
    select
      cot.id as cotacao_id,
      cot.pedido,
      coalesce(ctr.nf, cot.nf) as nf,
      cli.nome as cliente,
      cli.cidade,
      ctr.transportadora_id as contratada_transportadora_id,
      t_contratada.nome_curto as contratada_transportadora,
      ctr.valor_frete_contratado as contratada_valor,
      coalesce(
        cot.romaneio,
        case when ctr.pedido like '%-%' then split_part(ctr.pedido, '-', 1) else null end
      ) as romaneio
    from cotacoes cot
    join contratacoes ctr on ctr.cotacao_id = cot.id
    left join clientes cli on cli.cnpj = ctr.cnpj_cliente
    left join transportadoras t_contratada on t_contratada.id = ctr.transportadora_id
    where (cot.criado_em at time zone 'UTC')::date = p_dia
  )
  select
    b.romaneio,
    count(distinct b.cotacao_id)::int as n_pedidos,
    jsonb_agg(
      jsonb_build_object(
        'cotacao_id', b.cotacao_id,
        'pedido', b.pedido,
        'nf', b.nf,
        'cliente', b.cliente,
        'cidade', b.cidade,
        'contratada_transportadora_id', b.contratada_transportadora_id,
        'contratada_transportadora', b.contratada_transportadora,
        'contratada_valor', b.contratada_valor,
        'ofertas', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'transportadora_id', o.transportadora_id,
              'transportadora', t.nome_curto,
              'preco_final', o.preco_final,
              'prazo_dias', o.prazo_dias
            ) order by o.preco_final asc
          ), '[]'::jsonb)
          from ofertas o
          join transportadoras t on t.id = o.transportadora_id
          where o.cotacao_id = b.cotacao_id
        )
      )
      order by b.pedido
    ) as pedidos
  from base b
  where b.romaneio is not null
  group by b.romaneio
  order by b.romaneio;
$$;
