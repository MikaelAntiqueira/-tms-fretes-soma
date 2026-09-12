"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// ============================================================================
// FilterBar — motor de filtro global, [TASK-29] FASE 1 (infraestrutura + os
// 4 filtros mais usados). Ver também o comentário no topo de
// src/app/financeiro/page.tsx sobre como esta página consome o componente.
//
// ---------------------------------------------------------------------------
// O QUE EXISTE AGORA (Fase 1)
// ---------------------------------------------------------------------------
// No Artifact original ("Fretes Cotado x Contratado", c0abf79e-..., v42) há
// 11 dropdowns multi-seleção no topo (`MSEL_KEYS`, linha ~1216 do HTML de
// referência): mes, tContr, romaneio, uf, tipo, esc, prazo, cidade, janela,
// faixaPeso, faixaCubagem. Esta Fase 1 porta a INFRAESTRUTURA do motor
// (componente genérico + convenção de URL + convenção de SQL) e só 4 das 11
// dimensões — as citadas nos comentários de /transportadoras e /financeiro
// como "as que fazem sentido para dados agregados por transportadora":
//   1. Mês                       (?mes=2026-07,2026-08)
//   2. Transportadora Contratada (?transportadora=Fritz+Express,LKW)
//   3. Região Comercial          (?regiao=SUL,LITORAL)
//   4. Tipo Cliente               (?tipo=Privado,Publico)
//
// AS OUTRAS 7 DIMENSÕES AINDA FALTAM (etapas futuras, NÃO é bug/esquecimento
// desta rodada): romaneio, esc (escolheu a mais barata), prazo, cidade,
// janela, faixaPeso, faixaCubagem. Quando forem portadas, cada uma vira mais
// uma <FilterDimension> na lista passada para <FilterBar>, seguindo o mesmo
// padrão — nenhuma mudança estrutural neste componente deve ser necessária.
//
// CASCATA DE OPÇÕES — NÃO IMPLEMENTADA NESTA ETAPA. No Artifact original,
// cada dropdown só mostra valores que ainda produzem >=1 resultado dado o
// estado de TODOS OS OUTROS filtros ativos (`populateSelect()` chamado de
// novo a cada mudança, com a lista podada por `rowMatchesFilters(i, def.key)`
// — ver HTML de referência, linhas ~1305-1345). Aqui, a lista de opções de
// cada dropdown é SEMPRE A LISTA COMPLETA de valores possíveis na base
// inteira, buscada 1x no carregamento da página (nunca recalculada a cada
// clique) — ver `getFinanceiroData()` em page.tsx. Consequência visível:
// marcar "Mês = 2026-05" não reduz as opções do dropdown "Transportadora"
// mesmo que alguma transportadora não tenha operado naquele mês (ela
// aparece na lista, e simplesmente não devolve linhas se selecionada em
// conjunto). Isso é uma limitação deliberada desta Fase 1, não um bug —
// implementar a cascata exigiria recalcular as 4 listas de opções a cada
// mudança de filtro (ida ao banco ou lógica extra no cliente), escopo maior
// que "infraestrutura + 4 filtros", fica para uma etapa futura.
//
// SÓ A SUB-ABA "VISÃO GERAL" DE /financeiro REAGE A ESTES FILTROS por
// enquanto (KPIs executivos, Meio-dia × Tarde, Resumo executivo). As
// sub-abas "Cotado × Contratado", "Padrões da Diferença" e "Peso, Cubagem &
// Custo" da mesma página, e as páginas /, /ontem, /operacao e
// /transportadoras inteiras, continuam mostrando SEMPRE a base completa,
// sem filtro nenhum — de novo, decisão deliberada de escopo desta rodada
// (ver comentário completo em src/app/financeiro/page.tsx), não bug.
//
// ---------------------------------------------------------------------------
// CONVENÇÃO DE ESTADO: URL search params (não useState/Context client-side)
// ---------------------------------------------------------------------------
// Decisão desta etapa: o estado do filtro vive inteiramente na URL
// (?mes=...&transportadora=...&regiao=...&tipo=...), lida nativamente pelo
// Server Component da página via `searchParams` — sem round-trip de client
// fetch. Cada dimensão usa UM parâmetro, com MÚLTIPLOS valores separados por
// vírgula (`?mes=2026-07,2026-08`) — não repetição do parâmetro
// (`?mes=2026-07&mes=2026-08`), para ficar mais legível/curto ao colar o
// link. Ausência do parâmetro = "todos" (sem filtro nessa dimensão) — MESMA
// semântica do Artifact original (Set vazio = todos, nunca "zero
// resultados"). Isso é um upgrade real sobre o Artifact: lá, dar F5 na
// página perdia o filtro (estado só em memória JS); aqui, a URL é
// compartilhável/copiável e sobrevive a um F5.
//
// A interseção entre dimensões é E (uma linha só passa se atender a TODAS as
// dimensões com filtro ativo); dentro da mesma dimensão é OU (qualquer valor
// marcado serve) — mesma regra do Artifact (`rowMatchesFilters`). A lógica
// de fato mora nas functions SQL (ver migration
// `fn_filtro_global_fase1_visao_geral`), este componente só lê/escreve a URL.
// ============================================================================

export interface FilterDimension {
  /** nome do parâmetro na URL, ex. "mes" em ?mes=2026-07,2026-08 */
  param: string;
  /** rótulo do botão quando nada está selecionado nesta dimensão */
  labelAll: string;
  /** lista COMPLETA de valores possíveis (sem cascata — ver comentário acima) */
  options: string[];
  /** formatação opcional do valor bruto para exibição (ex. "2026-07" -> "jul/2026") */
  format?: (value: string) => string;
}

export function FilterBar({ dimensions }: { dimensions: FilterDimension[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  function selectedFor(param: string): string[] {
    const raw = searchParams.get(param);
    if (!raw) return [];
    return raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function commit(param: string, values: string[]) {
    const params = new URLSearchParams(searchParamsString);
    if (values.length === 0) params.delete(param);
    else params.set(param, values.join(","));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const anyActive = dimensions.some((d) => selectedFor(d.param).length > 0);

  return (
    <div className="filterbar">
      {dimensions.map((d) => (
        <MultiSelect key={d.param} dimension={d} selected={selectedFor(d.param)} onChange={(vals) => commit(d.param, vals)} />
      ))}
      {anyActive && (
        <button type="button" className="filterbar-clear" onClick={() => router.push(pathname, { scroll: false })}>
          limpar filtros
        </button>
      )}
    </div>
  );
}

function MultiSelect({
  dimension,
  selected,
  onChange,
}: {
  dimension: FilterDimension;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Fecha o popover ao clicar fora — mesmo comportamento do
  // `document.addEventListener('click', ...)` do Artifact original.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const fmt = (v: string) => (dimension.format ? dimension.format(v) : v);

  const label =
    selected.length === 0
      ? dimension.labelAll
      : selected.length === 1
        ? fmt(selected[0])
        : `${selected.length} selecionados`;

  const filteredOptions = dimension.options.filter((v) => fmt(v).toLowerCase().includes(query.toLowerCase()));

  function toggle(value: string) {
    const next = selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value];
    onChange(next);
  }

  return (
    <div className="msel" ref={ref}>
      <button
        type="button"
        className={`msel-btn${selected.length > 0 ? " on" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="msel-label">{label}</span>
        <span className="msel-cnt" hidden={selected.length < 2}>
          {selected.length}
        </span>
        <span className="msel-car">▾</span>
      </button>
      {open && (
        <div className="msel-pop" role="listbox" aria-multiselectable="true">
          <input
            className="msel-search"
            type="search"
            placeholder="filtrar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="msel-tools">
            <button type="button" data-all onClick={() => onChange([...dimension.options])}>
              todos
            </button>
            <button type="button" data-none onClick={() => onChange([])}>
              limpar
            </button>
          </div>
          <div className="msel-list">
            {filteredOptions.map((v) => (
              <label key={v}>
                <input type="checkbox" checked={selectedSet.has(v)} onChange={() => toggle(v)} />
                {fmt(v)}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
