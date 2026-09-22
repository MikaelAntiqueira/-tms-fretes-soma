# Simulador de Frete por Romaneio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar à página `/ontem` uma seção que deixa comparar, por pedido dentro de um romaneio contratado no dia, todas as cotações reais registradas por cada transportadora (nunca estimativas).

**Architecture:** RPC nova `ontem_romaneio_simulador(p_dia date)` no Supabase (mesmo padrão `security invoker` + `jsonb_agg` aninhado já usado pelo drill-down do Radar D3/D4) entra na chamada já cacheada `fetchOntemDiaRpcs` de `src/app/ontem/page.tsx`, sem round-trip novo. Um Client Component novo (`RomaneioSimulador.tsx`) recebe os dados já carregados via prop e renderiza `<select>` de romaneio → lista de pedidos → `<details>` por pedido com a tabela de ofertas, sem nenhuma chamada de rede adicional. Os tipos (`OfertaSimulada`/`PedidoSimulado`/`RomaneioSimuladorRow`) nascem no componente e são importados de volta em `page.tsx` — mesma direção que `OntemTendenciaRow` já segue hoje (definido em `OntemTendenciaChart.tsx`, importado por `page.tsx`), não o contrário: exportar tipos extras de um arquivo `page.tsx` do App Router é arriscado (é um módulo de rota especial, com exports permitidos restritos) e nunca é feito hoje neste projeto.

**Tech Stack:** Next.js 16 (App Router, Server Components + 1 Client Component), TypeScript, Supabase (Postgres, RPC via `supabase-js`), CSS global do projeto (`src/app/globals.css`, sem framework de estilo). Projeto não tem suite de testes automatizados (sem Jest/Vitest configurado) — validação é `tsc --noEmit` + `eslint` + comparação manual dos dados na UI, como em todas as features anteriores desta página.

**Spec:** `docs/superpowers/specs/2026-09-22-simulador-frete-romaneio-design.md`

## Global Constraints

- Nunca estimar frete — toda oferta mostrada tem que vir de uma linha real em `ofertas` para aquele `cotacao_id` específico; pedido sem oferta de uma transportadora não gera número nenhum pra ela.
- RPC nova usa `security invoker`, mesmo padrão de todas as outras RPCs do projeto (RLS de `authenticated` já cobre `cotacoes`/`ofertas`/`contratacoes`/`clientes`/`transportadoras`).
- Badge "Contratada" na tabela de ofertas compara sempre por `transportadora_id` (nunca por nome), para evitar colisão entre transportadoras com nomes parecidos.
- A tabela "Todas as contratações do dia" e a exportação CSV/PDF existentes em `/ontem` não mudam.
- Sem chamada de rede nova ao trocar de romaneio ou expandir pedido — todos os dados do dia já vêm carregados do servidor numa única prop.
- `tsc --noEmit` e `eslint` têm que ficar limpos antes de considerar qualquer tarefa pronta (padrão do projeto, sem exceção).

---

## Task 1: RPC `ontem_romaneio_simulador` no Supabase

**Files:**
- Create: `supabase/migrations/2026092201_create_ontem_romaneio_simulador.sql`

**Interfaces:**
- Produces: RPC Postgres `ontem_romaneio_simulador(p_dia date) returns table (romaneio text, n_pedidos int, pedidos jsonb)` — chamada pela Task 3 via `supabase.rpc("ontem_romaneio_simulador", { p_dia: ref })`. Cada elemento de `pedidos` é um objeto jsonb com as chaves: `cotacao_id` (int), `pedido` (text|null), `nf` (text|null), `cliente` (text|null), `cidade` (text|null), `contratada_transportadora_id` (int|null), `contratada_transportadora` (text|null), `contratada_valor` (numeric), `ofertas` (array jsonb, cada item com `transportadora_id` int, `transportadora` text|null, `preco_final` numeric, `prazo_dias` int|null — já ordenado por `preco_final asc`).

- [ ] **Step 1: Escrever o arquivo de migration**

```sql
-- ============================================================================
-- Migration: 2026092201_create_ontem_romaneio_simulador.sql
-- Simulador de Frete por Romaneio — ver
-- docs/superpowers/specs/2026-09-22-simulador-frete-romaneio-design.md
--
-- 1 linha por romaneio do dia (só romaneios com ao menos 1 contratação
-- naquele dia — inner join com contratacoes), com jsonb_agg aninhado por
-- pedido e, dentro de cada pedido, jsonb_agg de todas as ofertas reais
-- registradas em `ofertas` para aquela cotação (nunca estimativa; pedido
-- sem oferta traz array vazio, nunca gera número inventado). Ofertas
-- ordenadas por preco_final asc para a UI marcar a primeira como "mais
-- barata" sem lógica extra.
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

- [ ] **Step 2: Aplicar a migration no projeto Supabase**

Use a ferramenta `mcp__supabase__apply_migration` com `project_id: "jpoizkylaffircimxzrq"`, `name: "create_ontem_romaneio_simulador"` e o SQL do Step 1 como `query`.

- [ ] **Step 3: Validar a RPC direto no banco antes de tocar em código TS**

Rode via `mcp__supabase__execute_sql` (mesmo `project_id`), usando um dia que você já sabe que teve contratação (confira com `select data_contratacao::date, count(*) from contratacoes group by 1 order by 1 desc limit 5;` se não souber um de cabeça):

```sql
select * from ontem_romaneio_simulador('2026-08-27'::date) limit 3;
```

Confirme visualmente no resultado:
- `n_pedidos` bate com a contagem de pedidos distintos daquele romaneio.
- Pelo menos um `pedidos[].ofertas` não vazio, ordenado por `preco_final` crescente.
- Se algum registro tiver `contratada_transportadora_id` sem oferta correspondente na lista de `ofertas` daquele pedido, isso é esperado (não é bug) — só confirme que não quebra a query.

- [ ] **Step 4: Comparar contra a tabela "Todas as contratações do dia" (fonte de verdade)**

Para o mesmo dia do Step 3, rode:

```sql
select romaneio, pedido, nf, transportadora
from v_ontem_comparacao
where data_contratacao::date = '2026-08-27'::date
order by romaneio, pedido
limit 10;
```

(ajuste o nome da view/RPC de referência se `v_ontem_comparacao` não tiver as colunas — o objetivo é só conferir que `contratada_transportadora`/`contratada_valor` da RPC nova batem linha a linha com o que a tabela existente do `/ontem` mostra para os mesmos `romaneio`/`pedido`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026092201_create_ontem_romaneio_simulador.sql
git commit -m "feat: adiciona RPC ontem_romaneio_simulador"
```

---

## Task 2: Componente `RomaneioSimulador`

**Files:**
- Create: `src/components/RomaneioSimulador.tsx`

**Interfaces:**
- Produces: tipos `OfertaSimulada`, `PedidoSimulado`, `RomaneioSimuladorRow` (exportados deste arquivo) e o componente `RomaneioSimulador({ data }: { data: RomaneioSimuladorRow[] })` — todos consumidos pela Task 3 (tipos, para tipar o retorno da RPC em `page.tsx`) e pela Task 4 (componente, na renderização).

- [ ] **Step 1: Escrever o componente e seus tipos**

```tsx
"use client";

import { useState } from "react";
import { fmtBRL, fmtNum } from "@/lib/format";

// Simulador de Frete por Romaneio — ver
// docs/superpowers/specs/2026-09-22-simulador-frete-romaneio-design.md.
// Client Component "burro": recebe via prop os dados do dia já carregados
// no servidor (mesmo padrão de drill-down dos cards D3/D4 do Radar) — nunca
// faz fetch próprio, então trocar de romaneio ou expandir um pedido não gera
// nenhuma chamada de rede nova.

export interface OfertaSimulada {
  transportadora_id: number;
  transportadora: string | null;
  preco_final: number;
  prazo_dias: number | null;
}

export interface PedidoSimulado {
  cotacao_id: number;
  pedido: string | null;
  nf: string | null;
  cliente: string | null;
  cidade: string | null;
  contratada_transportadora_id: number | null;
  contratada_transportadora: string | null;
  contratada_valor: number;
  ofertas: OfertaSimulada[];
}

export interface RomaneioSimuladorRow {
  romaneio: string;
  n_pedidos: number;
  pedidos: PedidoSimulado[];
}

function OfertaTableRow({ o, contratada, maisBarata }: { o: OfertaSimulada; contratada: boolean; maisBarata: boolean }) {
  return (
    <tr>
      <td>{o.transportadora ?? "—"}</td>
      <td className="num">{fmtBRL(o.preco_final)}</td>
      <td className="num">{o.prazo_dias == null ? "—" : `${fmtNum(o.prazo_dias)}d`}</td>
      <td>
        {contratada && <span className="pill azul">Contratada</span>}{" "}
        {maisBarata && <span className="pill s">Mais barata</span>}
      </td>
    </tr>
  );
}

function PedidoRow({ p }: { p: PedidoSimulado }) {
  return (
    <details className="sim-pedido">
      <summary style={{ cursor: "pointer" }}>
        <span style={{ fontWeight: 700 }}>{p.pedido ?? "—"}</span>
        {" · "}NF {p.nf ?? "—"} · {p.cliente ?? "—"} · {p.cidade ?? "—"}
        {" · "}
        <span className="mono">{fmtBRL(p.contratada_valor)}</span> ({p.contratada_transportadora ?? "—"})
      </summary>
      <div className="table-scroll" style={{ marginTop: 6 }}>
        {p.ofertas.length === 0 ? (
          <div className="sim-empty" style={{ padding: 8 }}>
            Sem cotações concorrentes registradas para este pedido.
          </div>
        ) : (
          <table className="data compact">
            <thead>
              <tr>
                <th>Transportadora</th>
                <th className="num">Preço cotado</th>
                <th className="num">Prazo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {p.ofertas.map((o, i) => (
                <OfertaTableRow
                  o={o}
                  contratada={o.transportadora_id === p.contratada_transportadora_id}
                  maisBarata={i === 0}
                  key={o.transportadora_id}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}

export function RomaneioSimulador({ data }: { data: RomaneioSimuladorRow[] }) {
  const [romaneioSel, setRomaneioSel] = useState<string>(data[0]?.romaneio ?? "");

  if (data.length === 0) return null;

  const atual = data.find((r) => r.romaneio === romaneioSel) ?? data[0];

  return (
    <section className="bloc">
      <div className="bloc-head">
        <h2>Simulador de Frete por Romaneio</h2>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <label htmlFor="sim-romaneio-select" style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
          Romaneio:
        </label>
        <select
          id="sim-romaneio-select"
          value={atual.romaneio}
          onChange={(e) => setRomaneioSel(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--surface-card)",
            color: "var(--text-primary)",
          }}
        >
          {data.map((r) => (
            <option key={r.romaneio} value={r.romaneio}>
              {r.romaneio} ({r.n_pedidos} pedidos)
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {atual.pedidos.map((p) => (
          <PedidoRow p={p} key={p.cotacao_id} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Checar tipos e lint**

```bash
npx tsc --noEmit
npx eslint src/components/RomaneioSimulador.tsx
```

Esperado: ambos limpos, sem erro.

- [ ] **Step 3: Commit**

```bash
git add src/components/RomaneioSimulador.tsx
git commit -m "feat: adiciona componente RomaneioSimulador"
```

---

## Task 3: Buscar e tipar os dados da RPC em `src/app/ontem/page.tsx`

**Files:**
- Modify: `src/app/ontem/page.tsx`

**Interfaces:**
- Consumes: RPC `ontem_romaneio_simulador` (Task 1) e tipos `RomaneioSimuladorRow` exportado de `@/components/RomaneioSimulador` (Task 2).
- Produces: campo `simulador: RomaneioSimuladorRow[]` em `OntemData`, populado por `getOntemData` — consumido pela Task 4 (`data.simulador`).

- [ ] **Step 1: Importar o tipo do componente**

No topo de `src/app/ontem/page.tsx`, junto dos outros imports de componente (perto da linha 6):

```typescript
import type { RomaneioSimuladorRow } from "@/components/RomaneioSimulador";
```

- [ ] **Step 2: Adicionar o campo `simulador` em `OntemData`**

Em `interface OntemData` (linha ~177), adicione o campo depois de `tendencia`:

```typescript
interface OntemData {
  ref: string | null;
  diaMaisRecente: string | null;
  diasDisponiveis: string[];
  kpis: OntemKpis | null;
  linhas: OntemLinha[];
  cobertura: OntemCobertura | null;
  radar: RadarCardData[];
  tendencia: OntemTendenciaRow[];
  simulador: RomaneioSimuladorRow[];
}
```

- [ ] **Step 3: Incluir a chamada da RPC em `fetchOntemDiaRpcs`**

Modifique a função (linha ~554) para incluir a nova RPC no `Promise.all`, no loop de erro, e no objeto de retorno:

```typescript
async function fetchOntemDiaRpcs(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, ref: string) {
  const [kpisRes, linhasRes, coberturaRes, tendenciaRes, prazoRes, d2Res, d3Res, d4Res, d5Res, d6Res, simuladorRes] =
    await Promise.all([
      supabase.rpc("ontem_kpis", { p_dia: ref }),
      supabase.rpc("ontem_contratacoes", { p_dia: ref }),
      supabase.rpc("ontem_cobertura", { p_dia: ref }),
      supabase.rpc("ontem_tendencia_15_dias"),
      supabase.rpc("radar_prazo_hist"),
      supabase.rpc("radar_d2", { p_dia: ref }),
      supabase.rpc("radar_d3", { p_dia: ref }),
      supabase.rpc("radar_d4", { p_dia: ref }),
      supabase.rpc("radar_d5", { p_dia: ref }),
      supabase.rpc("radar_d6", { p_dia: ref }),
      supabase.rpc("ontem_romaneio_simulador", { p_dia: ref }),
    ]);
  for (const res of [kpisRes, linhasRes, coberturaRes, tendenciaRes, prazoRes, d2Res, d3Res, d4Res, d5Res, d6Res, simuladorRes]) {
    if (res.error) throw new Error(res.error.message);
  }
  return {
    kpis: kpisRes.data,
    linhas: linhasRes.data,
    cobertura: coberturaRes.data,
    tendencia: tendenciaRes.data,
    prazo: prazoRes.data,
    d2: d2Res.data,
    d3: d3Res.data,
    d4: d4Res.data,
    d5: d5Res.data,
    d6: d6Res.data,
    simulador: simuladorRes.data,
  };
}
```

- [ ] **Step 4: Mapear `bundle.simulador` em `getOntemData`**

Logo depois do bloco que monta `tendencia` (linha ~673-676) e antes do `return { ref, diaMaisRecente, ... }` final, adicione:

```typescript
  const simulador: RomaneioSimuladorRow[] = ((bundle.simulador as Record<string, unknown>[]) ?? []).map((r) => ({
    romaneio: r.romaneio as string,
    n_pedidos: Number(r.n_pedidos ?? 0),
    pedidos: ((r.pedidos as Record<string, unknown>[]) ?? []).map((p) => ({
      cotacao_id: Number(p.cotacao_id),
      pedido: (p.pedido as string) ?? null,
      nf: (p.nf as string) ?? null,
      cliente: (p.cliente as string) ?? null,
      cidade: (p.cidade as string) ?? null,
      contratada_transportadora_id:
        p.contratada_transportadora_id == null ? null : Number(p.contratada_transportadora_id),
      contratada_transportadora: (p.contratada_transportadora as string) ?? null,
      contratada_valor: Number(p.contratada_valor ?? 0),
      ofertas: ((p.ofertas as Record<string, unknown>[]) ?? []).map((o) => ({
        transportadora_id: Number(o.transportadora_id),
        transportadora: (o.transportadora as string) ?? null,
        preco_final: Number(o.preco_final ?? 0),
        prazo_dias: o.prazo_dias == null ? null : Number(o.prazo_dias),
      })),
    })),
  }));
```

E ajuste o `return` final da função (linha ~678) para incluir o campo:

```typescript
  return { ref, diaMaisRecente, diasDisponiveis, kpis, linhas, cobertura, radar, tendencia, simulador };
```

Também ajuste o `return` antecipado de "sem dia" (linha ~601-611, quando `!ref`) para incluir `simulador: []`:

```typescript
  if (!ref) {
    return {
      ref: null,
      diaMaisRecente,
      diasDisponiveis,
      kpis: null,
      linhas: [],
      cobertura: null,
      radar: [],
      tendencia: [],
      simulador: [],
    };
  }
```

- [ ] **Step 5: Checar tipos e lint**

```bash
npx tsc --noEmit
npx eslint src/app/ontem/page.tsx
```

Esperado: ambos limpos. Se `tsc` reclamar de campo/tipo incompatível entre o que a RPC devolve e `RomaneioSimuladorRow`, corrija o mapeamento do Step 4 (não o tipo — o tipo é a interface pública que a Task 4 e o componente já assumem).

- [ ] **Step 6: Commit**

```bash
git add src/app/ontem/page.tsx
git commit -m "feat: busca e tipa dados do simulador de frete por romaneio"
```

---

## Task 4: Integrar o simulador na página `/ontem`

**Files:**
- Modify: `src/app/ontem/page.tsx`

**Interfaces:**
- Consumes: `RomaneioSimulador` (componente, Task 2) e `data.simulador` (Task 3).

- [ ] **Step 1: Importar o componente**

No topo de `src/app/ontem/page.tsx`, junto do import de tipo já adicionado na Task 3 (ou substituindo-o por um import combinado):

```typescript
import { RomaneioSimulador, type RomaneioSimuladorRow } from "@/components/RomaneioSimulador";
```

(Remova o `import type { RomaneioSimuladorRow } from "@/components/RomaneioSimulador";` da Task 3 se ele tiver ficado como uma linha separada — um único import combinado é suficiente.)

- [ ] **Step 2: Extrair `simulador` das props de dados**

Junto das outras extrações de `data` dentro de `OntemPage` (perto da linha 818, ao lado de `const radarCardsList = data?.radar ?? [];`):

```typescript
  const simuladorData = data?.simulador ?? [];
```

- [ ] **Step 3: Renderizar a seção entre os KPIs e o Radar de Decisão**

Insira a seção nova logo depois do `</section>` que fecha o bloco de KPIs (linha ~886, o `<section className="bloc" style={{ marginTop: 0 }}>` que contém `kpiTiles`) e antes do `<section className="bloc">` do Radar de Decisão (linha ~888):

```tsx
            </section>

            <RomaneioSimulador data={simuladorData} />

            <section className="bloc">
              <div className="bloc-head">
                <h2>Radar de Decisão</h2>
              </div>
```

- [ ] **Step 4: Checar tipos e lint**

```bash
npx tsc --noEmit
npx eslint src/app/ontem/page.tsx
```

Esperado: ambos limpos, sem nenhum erro.

- [ ] **Step 5: Rodar o servidor de dev e validar manualmente na tela**

```bash
npm run dev
```

Abra `/ontem` no navegador (Mikael: use o dia mais recente e depois troque de dia pelo `DiaSelector` para confirmar que o simulador atualiza junto) e confira, contra os casos de borda da spec:

1. A seção "Simulador de Frete por Romaneio" aparece entre os KPIs e o "Radar de Decisão".
2. O `<select>` de romaneio lista só romaneios com contratação naquele dia, no formato `"{romaneio} ({n_pedidos} pedidos)"`.
3. Expandir um pedido mostra a tabela de ofertas ordenada da mais barata pra mais cara.
4. Encontre pelo menos 1 pedido cuja transportadora contratada também aparece na tabela de ofertas — confirme que a badge "Contratada" aparece na linha certa (compare o `preco_final`/`transportadora` dessa linha com a coluna "Transportadora contratada" da tabela "Todas as contratações do dia", mesma linha de romaneio+pedido).
5. Encontre pelo menos 1 pedido sem nenhuma oferta registrada — confirme a mensagem "Sem cotações concorrentes registradas para este pedido" (sem tabela vazia).
6. Se conseguir achar um cliente sem cadastro em `clientes` (cliente/cidade nulos na RPC), confirme que a UI mostra "—" nesses campos em vez de quebrar.
7. Trocar de romaneio no `<select>` e expandir/recolher pedidos não deve gerar nenhuma requisição de rede nova — confirme na aba Network do DevTools que não há chamadas ao trocar romaneio ou expandir `<details>`.

- [ ] **Step 6: Commit**

```bash
git add src/app/ontem/page.tsx
git commit -m "feat: integra o simulador de frete por romaneio na pagina /ontem"
```
