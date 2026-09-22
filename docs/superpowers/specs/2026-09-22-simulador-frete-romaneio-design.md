# Simulador de Frete por Romaneio — Design

> Data: 2026-09-22
> Página afetada: `/ontem` ("Resumo do Dia")
> Origem: conversa com o Mikael sobre a página "Resumo do Dia" estar poluída
> demais para o público de diretoria/gestor. Escopo decomposto em 2
> sub-projetos: (1) este simulador (novo, maior) e (2) reduzir a poluição
> visual dos cards do Radar de Decisão com disclosure progressivo (menor,
> spec própria depois). A tabela "Todas as contratações do dia" + exportação
> CSV/PDF já existentes **não mudam** — o Mikael confirmou que essa parte já
> está boa.

## Problema

A página `/ontem` serve 2 públicos com necessidades diferentes: o próprio
Mikael (quer agir/investigar) e a diretoria (quer só o panorama). Hoje ela
empilha KPIs + até 5 cards de Radar sempre abertos + gráfico de tendência +
tabela completa, sem hierarquia — fica poluída para quem só quer o
panorama. O Mikael quer um jeito interativo de comparar, para um romaneio
específico do dia, quanto cada transportadora cotou em cada pedido daquele
romaneio — sem nunca estimar valores (regra permanente do projeto,
[R-DADO]/vários DEC-XX em `LOG_DECISOES.md`): só cotações reais que já
existem na tabela `ofertas`.

## Descoberta de dados (2026-09-22, consultado direto no Supabase)

- Um romaneio **não é 1 cotação só**: média de 10,35 cotações (pedidos) por
  romaneio, até 29 num mesmo romaneio (6.915 cotações / 429 romaneios
  distintos).
- Cada cotação tem em média 4,47 ofertas (cotações de transportadoras
  diferentes para aquele mesmo pedido).
- Tabelas relevantes:
  - `cotacoes(id, romaneio, cnpj_cliente, pedido, nf, ...)`
  - `ofertas(id, cotacao_id, transportadora_id, preco_final, prazo_dias, ranking)`
  - `contratacoes(id, cotacao_id, transportadora_id, valor_frete_contratado, data_contratacao, ...)`
  - `clientes(cnpj, nome, cidade, ...)`
  - `transportadoras(id, cnpj, nome_curto, ...)`

## Decisões confirmadas com o Mikael

1. **Só cotação real, nunca estimativa** — a "outra transportadora" mostrada
   é sempre uma oferta que essa transportadora realmente registrou em
   `ofertas` para aquele pedido específico. Pedido sem oferta de uma
   transportadora simplesmente não mostra linha dela (não gera número
   nenhum pra ela).
2. **Granularidade: romaneio → lista de pedidos → expande pedido** — não é
   1 comparação agregada por romaneio; cada pedido dentro do romaneio tem
   sua própria comparação de transportadoras.
3. **Restrito ao dia selecionado** — reaproveita o `DiaSelector` que já
   existe em `/ontem`; o seletor de romaneio só lista romaneios que tiveram
   ao menos 1 contratação no dia selecionado (mesmo recorte de
   `ontem_kpis`/`ontem_contratacoes`, que filtram por
   `contratacoes.data_contratacao::date = p_dia`).
4. **Ao expandir um pedido, mostra a lista completa de ofertas** (não só
   contratada × mais barata) — cada transportadora que cotou aquele pedido,
   com preço e prazo, ordenada da mais barata pra mais cara.
5. **Posição na página**: logo abaixo dos KPIs, acima do Radar de Decisão.

## Arquitetura

### RPC nova: `ontem_romaneio_simulador(p_dia date)`

`SECURITY INVOKER`, mesmo padrão de todas as outras RPCs do projeto (RLS de
`authenticated` já cobre as tabelas envolvidas). Devolve 1 linha por
romaneio do dia, com um jsonb aninhado por pedido — mesma técnica de
`jsonb_agg` que os cards D3/D4 do Radar já usam para o próprio drill-down
(nenhum padrão novo em termos de SQL).

```sql
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
  select
    cot.romaneio,
    count(distinct cot.id)::int as n_pedidos,
    jsonb_agg(
      jsonb_build_object(
        'cotacao_id', cot.id,
        'pedido', cot.pedido,
        'nf', cot.nf,
        'cliente', cli.nome,
        'cidade', cli.cidade,
        'contratada_transportadora_id', ctr.transportadora_id,
        'contratada_transportadora', t_contratada.nome_curto,
        'contratada_valor', ctr.valor_frete_contratado,
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
          where o.cotacao_id = cot.id
        )
      )
      order by cot.pedido
    ) as pedidos
  from cotacoes cot
  join contratacoes ctr on ctr.cotacao_id = cot.id
  left join clientes cli on cli.cnpj = cot.cnpj_cliente
  left join transportadoras t_contratada on t_contratada.id = ctr.transportadora_id
  where ctr.data_contratacao::date = p_dia
    and cot.romaneio is not null
  group by cot.romaneio
  order by cot.romaneio;
$$;
```

Chamada dentro de `fetchOntemDiaRpcs` (`src/app/ontem/page.tsx`), junto das
outras 10 RPCs já cacheadas por `unstable_cache` (revalidate 5 min, tag
`ontem-data`) — entra "de graça" no mesmo bundle, sem round-trip extra.

### Componente novo: `src/components/RomaneioSimulador.tsx`

Client Component. Recebe via prop o array já carregado do servidor
(`{ romaneio: string; n_pedidos: number; pedidos: PedidoSimulado[] }[]`) —
igual ao padrão de drill-down que os cards D3/D4 do Radar já usam: nenhuma
chamada de rede nova ao trocar de romaneio ou expandir pedido, tudo já está
na página.

1. `<select>` com os romaneios do dia, rótulo `"{romaneio} ({n_pedidos}
   pedidos)"`.
2. Ao selecionar, lista os pedidos daquele romaneio (pedido · NF · cliente ·
   cidade).
3. Cada pedido expande via `<details>` (mesmo padrão visual do drill-down
   existente) mostrando uma tabela Transportadora · Preço cotado · Prazo,
   com badge "Contratada" na linha cujo `transportadora_id` bate com
   `contratada_transportadora_id` (nunca por nome — evita colisão entre
   transportadoras com nomes parecidos), e badge "Mais barata" na primeira
   linha (já vem ordenada por preço ascendente) — podem ser a mesma linha.

### Integração em `/ontem`

- `OntemData` (interface em `src/app/ontem/page.tsx`) ganha o campo
  `simulador: RomaneioSimuladorData[]`.
- `getOntemData` mapeia `bundle.simulador` (novo campo retornado por
  `fetchOntemDiaRpcs`) para o formato tipado, igual ao que já faz com
  `linhas`/`tendencia`.
- `OntemPage` renderiza `<RomaneioSimulador data={data.simulador} />` entre
  a seção de KPIs e a seção do Radar de Decisão.

## Casos de borda

- **Romaneio sem contratação no dia**: nunca aparece no seletor — a RPC já
  faz `join contratacoes` (inner join), então só traz romaneio com ao menos
  1 pedido contratado naquele dia.
- **Pedido sem nenhuma oferta registrada**: `ofertas` do pedido vem como
  array vazio (`coalesce(..., '[]'::jsonb)`); a UI mostra "Sem cotações
  concorrentes registradas para este pedido" em vez de tabela vazia.
- **Cliente sem cadastro em `clientes`** (`cnpj_cliente` não bate com
  nenhum `clientes.cnpj`): `left join`, então `cliente`/`cidade` vêm `null`
  — UI mostra "—" nesses campos, não quebra a linha.
- **`transportadora_id` contratada não bate com nenhuma oferta da lista**
  (ex.: contratação por método de match diferente/manual): a badge
  "Contratada" simplesmente não aparece em nenhuma linha da tabela de
  ofertas — não é tratado como erro, só significa que a contratada não
  tinha oferta registrada nesse pedido especificamente (dado real, não bug
  a esconder).

## Validação planejada

1. `tsc --noEmit` e `eslint` limpos antes de considerar pronto (padrão do
   projeto).
2. Comparar manualmente 2-3 romaneios do simulador contra a tabela "Todas
   as contratações do dia" + exportação CSV já existente em `/ontem`
   (fonte de verdade confirmada pelo Mikael) — `contratada_valor` e
   `contratada_transportadora` de cada pedido devem bater exatamente com a
   linha correspondente da tabela.
3. Conferir ao menos 1 romaneio com pedido sem oferta e 1 com cliente sem
   cadastro, para validar os casos de borda acima na tela real.

## Fora de escopo (explicitamente, por decisão do Mikael)

- Mudar a tabela "Todas as contratações do dia" ou a exportação CSV/PDF —
  já estão boas, não mexer.
- Redesenhar os KPIs ou aplicar disclosure progressivo nos cards do Radar
  de Decisão — sub-projeto separado, spec própria depois.
- Qualquer estimativa de frete para transportadora que não cotou o pedido —
  proibido pela regra permanente do projeto de nunca estimar.
