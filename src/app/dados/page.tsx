import Link from "next/link";
import { Suspense } from "react";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase-server";
import { FilterBar, type FilterDimension } from "@/components/FilterBar";
import { fmtBRL2, fmtKg, fmtMes, fmtPct, clsDif, EscPill, buildHref, parseMulti } from "@/lib/format";

// Página "Dados" (rodapé do Artifact original, c0abf79e-... v42) — a única
// das 10 tabelas do Artifact com busca + paginação reais (`tblDetalhe`).
// Porta `function renderTable(mask, resetPage)` 1:1: mesmas 4 colunas de
// busca (cliente, pedido, NF, romaneio), mesma ordenação por coluna clicável
// (era JS client-side no Artifact; aqui os cabeçalhos são <Link> que
// recarregam a página com ?sort=&dir= — mesmo resultado, sem duplicar em
// TypeScript a lógica de paginação/ordenação que já existe no Postgres).
//
// Diferença de arquitetura (Portar gráficos e tabelas restantes,
// agent_tasks#2, Hermes, 2026-09-14): o Artifact original paginava/ordenava
// em memória sobre os 6.915 registros já carregados no cliente. Aqui a
// página é ~5.196 linhas cruzadas (PostgREST limita a 1000/requisição, ver
// [D-05] em decisoes/LOG_DECISOES.md) — busca/ordenação/paginação rodam
// no Postgres via RPC `dados_detalhe` (migration `fn_dados_detalhe`), nunca
// buscando a base inteira pro cliente. Mesmo padrão recomendado no mapa de
// migração (Etapa 3: "Componente de tabela server-paginada").
//
// Coluna do Artifact original OMITIDA aqui: "Valor Declarado" (`BASE.vd`) —
// não existe em nenhuma tabela do schema atual (conferido: cotacoes,
// contratacoes, ofertas, clientes não têm esse campo). Por [R-DADO] a
// coluna fica de fora — não é preenchida com valor inventado.
//
// [TASK] MOTOR DE FILTRO GLOBAL — /dados ganha as 11 dimensões (mesmo padrão
// de /financeiro Visão Geral): migration `fn_dados_detalhe_add_filtro_
// global_11_dimensoes` estendeu `dados_detalhe` com os 11 parâmetros
// opcionais (default null), filtrando via `v_cotacao_filtros` ANTES da parte
// dinâmica da function (nunca embutindo os arrays como literal dentro do
// format()/execute já existente — evita reabrir superfície de SQL
// injection). Reaproveita `financeiro_filtro_opcoes_cascata` (já existe) para
// as 11 listas de opção dos dropdowns — nenhuma RPC nova de opções.
// Regressão validada direto no Supabase: sem filtro, total_count = 5.194
// (mesmo número de sempre); com mes='2026-08', total_count = 1.558, idêntico
// a `select count(*) from v_ontem_comparacao where cotacao_id in (select
// cotacao_id from v_cotacao_filtros where mes='2026-08')` feito à parte.
//
// Como esta página já usa a URL para busca/ordenação/paginação (`?q=/?sort=/
// ?dir=/?page=`), os filtros entram nos MESMOS search params
// (`?mes=/?transportadora=/...`) — `buildHref` (lib/format.tsx) agora aceita
// um `extra` pra repassar os filtros ativos nos links de cabeçalho de coluna
// e paginação, senão eles apagariam o filtro ao trocar de página/ordenação.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const SORT_COLUMNS = ["diferenca_r", "frete_contratado", "melhor_cotacao", "diferenca_pct", "dia"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];
const DEFAULT_SORT: SortColumn = "diferenca_r";

interface DadosRow {
  cotacao_id: string;
  romaneio: string | null;
  pedido: string | null;
  nf: string | null;
  cliente_nome: string | null;
  regiao_normalizada: string | null;
  peso_considerado: number | null;
  transportadora_contratada: string | null;
  frete_contratado: number;
  transportadora_mais_barata: string | null;
  melhor_cotacao: number | null;
  diferenca_r: number | null;
  diferenca_pct: number | null;
  escolheu: "S" | "N" | "SC";
  prazo_contratado: number | null;
  mes: string;
}

function parseSort(v: string | string[] | undefined): SortColumn {
  const s = Array.isArray(v) ? v[0] : v;
  return (SORT_COLUMNS as readonly string[]).includes(s ?? "") ? (s as SortColumn) : DEFAULT_SORT;
}
function parseDir(v: string | string[] | undefined): "asc" | "desc" {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "asc" ? "asc" : "desc";
}
function parsePage(v: string | string[] | undefined): number {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
function parseQ(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? "").trim();
}

// Filtros do motor de filtro global — mesma convenção de
// src/app/financeiro/page.tsx (`null` numa dimensão = sem filtro nela).
interface FiltrosDados {
  meses: string[] | null;
  transportadoras: string[] | null;
  regioes: string[] | null;
  tipos: string[] | null;
  romaneios: string[] | null;
  esc: string[] | null;
  prazos: number[] | null;
  cidades: string[] | null;
  janelas: string[] | null;
  faixasPeso: string[] | null;
  faixasCubagem: string[] | null;
}

function filtroArgsOf(filtros: FiltrosDados) {
  return {
    p_meses: filtros.meses,
    p_transportadoras: filtros.transportadoras,
    p_regioes: filtros.regioes,
    p_tipos: filtros.tipos,
    p_romaneios: filtros.romaneios,
    p_esc: filtros.esc,
    p_prazos: filtros.prazos,
    p_cidades: filtros.cidades,
    p_janelas: filtros.janelas,
    p_faixas_peso: filtros.faixasPeso,
    p_faixas_cubagem: filtros.faixasCubagem,
  };
}

async function getDadosDetalhe(opts: {
  q: string;
  sort: SortColumn;
  dir: "asc" | "desc";
  page: number;
  filtros: FiltrosDados;
}) {
  const supabase = await createSupabaseServerClient();
  const offset = (opts.page - 1) * PAGE_SIZE;
  const res = await supabase.rpc("dados_detalhe", {
    p_search: opts.q || null,
    p_sort: opts.sort,
    p_dir: opts.dir,
    p_limit: PAGE_SIZE,
    p_offset: offset,
    ...filtroArgsOf(opts.filtros),
  });
  if (res.error) throw new Error(res.error.message);
  const rows = ((res.data as Record<string, unknown>[]) ?? []).map(
    (r): DadosRow => ({
      cotacao_id: r.cotacao_id as string,
      romaneio: (r.romaneio as string) ?? null,
      pedido: (r.pedido as string) ?? null,
      nf: (r.nf as string) ?? null,
      cliente_nome: (r.cliente_nome as string) ?? null,
      regiao_normalizada: (r.regiao_normalizada as string) ?? null,
      peso_considerado: r.peso_considerado == null ? null : Number(r.peso_considerado),
      transportadora_contratada: (r.transportadora_contratada as string) ?? null,
      frete_contratado: Number(r.frete_contratado ?? 0),
      transportadora_mais_barata: (r.transportadora_mais_barata as string) ?? null,
      melhor_cotacao: r.melhor_cotacao == null ? null : Number(r.melhor_cotacao),
      diferenca_r: r.diferenca_r == null ? null : Number(r.diferenca_r),
      diferenca_pct: r.diferenca_pct == null ? null : Number(r.diferenca_pct),
      escolheu: r.escolheu as "S" | "N" | "SC",
      prazo_contratado: r.prazo_contratado == null ? null : Number(r.prazo_contratado),
      mes: r.mes as string,
    })
  );
  const totalCount = rows.length ? Number((res.data as Record<string, unknown>[])[0].total_count ?? 0) : 0;
  return { rows, totalCount };
}

const COLUMNS: { key: SortColumn | null; label: string; num?: boolean }[] = [
  { key: null, label: "Romaneio" },
  { key: null, label: "Pedido" },
  { key: null, label: "NF" },
  { key: null, label: "Cliente" },
  { key: null, label: "Região" },
  { key: null, label: "Peso", num: true },
  { key: "frete_contratado", label: "Frete pago", num: true },
  { key: null, label: "Transp. contratada" },
  { key: null, label: "Transp. mais barata" },
  { key: "melhor_cotacao", label: "Melhor cotação", num: true },
  { key: "diferenca_r", label: "Diferença R$", num: true },
  { key: "diferenca_pct", label: "Diferença %", num: true },
  { key: null, label: "Escolheu?" },
  { key: null, label: "Prazo" },
  { key: "dia", label: "Mês" },
];

type DadosSearchParams = Record<string, string | string[] | undefined>;

export default async function DadosPage({ searchParams }: { searchParams: Promise<DadosSearchParams> }) {
  // [D-28] Rede de segurança independente de proxy.ts — ver comentário em
  // src/lib/supabase-server.ts.
  await requireUser("/dados");
  const sp = await searchParams;
  const q = parseQ(sp.q);
  const sort = parseSort(sp.sort);
  const dir = parseDir(sp.dir);
  const page = parsePage(sp.page);
  const prazosParam = parseMulti(sp.prazo);
  const filtros: FiltrosDados = {
    meses: parseMulti(sp.mes),
    transportadoras: parseMulti(sp.transportadora),
    regioes: parseMulti(sp.regiao),
    tipos: parseMulti(sp.tipo),
    romaneios: parseMulti(sp.romaneio),
    esc: parseMulti(sp.esc),
    prazos: prazosParam ? prazosParam.map(Number) : null,
    cidades: parseMulti(sp.cidade),
    janelas: parseMulti(sp.janela),
    faixasPeso: parseMulti(sp.faixaPeso),
    faixasCubagem: parseMulti(sp.faixaCubagem),
  };
  // Repassado para buildHref (cabeçalhos de coluna e paginação) pra não
  // apagar o filtro ativo ao trocar de página/ordenação.
  const extraFiltroParams: Record<string, string | undefined> = {
    mes: sp.mes as string | undefined,
    transportadora: sp.transportadora as string | undefined,
    regiao: sp.regiao as string | undefined,
    tipo: sp.tipo as string | undefined,
    romaneio: sp.romaneio as string | undefined,
    esc: sp.esc as string | undefined,
    prazo: sp.prazo as string | undefined,
    cidade: sp.cidade as string | undefined,
    janela: sp.janela as string | undefined,
    faixaPeso: sp.faixaPeso as string | undefined,
    faixaCubagem: sp.faixaCubagem as string | undefined,
  };

  let rows: DadosRow[] = [];
  let totalCount = 0;
  let opcoesMeses: string[] = [];
  let opcoesTransportadoras: string[] = [];
  let opcoesRegioes: string[] = [];
  let opcoesTipos: string[] = [];
  let opcoesRomaneios: string[] = [];
  let opcoesEsc: string[] = [];
  let opcoesPrazos: number[] = [];
  let opcoesCidades: string[] = [];
  let opcoesJanelas: string[] = [];
  let opcoesFaixasPeso: string[] = [];
  let opcoesFaixasCubagem: string[] = [];
  let erro: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const [dataRes, opcoesRes] = await Promise.all([
      getDadosDetalhe({ q, sort, dir, page, filtros }),
      // Mesma RPC de cascata já usada em /financeiro — nenhuma function nova
      // de opções, só reaproveitada com os mesmos 11 argumentos.
      supabase.rpc("financeiro_filtro_opcoes_cascata", filtroArgsOf(filtros)),
    ]);
    if (opcoesRes.error) throw new Error(opcoesRes.error.message);
    rows = dataRes.rows;
    totalCount = dataRes.totalCount;
    const opcoesRow = (opcoesRes.data as Record<string, unknown>[])?.[0];
    opcoesMeses = (opcoesRow?.meses as string[] | null) ?? [];
    opcoesTransportadoras = (opcoesRow?.transportadoras as string[] | null) ?? [];
    opcoesRegioes = (opcoesRow?.regioes as string[] | null) ?? [];
    opcoesTipos = (opcoesRow?.tipos as string[] | null) ?? [];
    opcoesRomaneios = (opcoesRow?.romaneios as string[] | null) ?? [];
    opcoesEsc = (opcoesRow?.escs as string[] | null) ?? [];
    opcoesPrazos = ((opcoesRow?.prazos as string[] | null) ?? []).map(Number);
    opcoesCidades = (opcoesRow?.cidades as string[] | null) ?? [];
    opcoesJanelas = (opcoesRow?.janelas as string[] | null) ?? [];
    opcoesFaixasPeso = (opcoesRow?.faixas_peso as string[] | null) ?? [];
    opcoesFaixasCubagem = (opcoesRow?.faixas_cubagem as string[] | null) ?? [];
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  const filterDimensions: FilterDimension[] = [
    { param: "mes", labelAll: "Todos os meses", options: opcoesMeses, format: "mes" },
    { param: "transportadora", labelAll: "Todas as transportadoras", options: opcoesTransportadoras },
    { param: "regiao", labelAll: "Todas as regiões", options: opcoesRegioes },
    { param: "tipo", labelAll: "Todos os tipos", options: opcoesTipos },
    { param: "romaneio", labelAll: "Todos os romaneios", options: opcoesRomaneios },
    { param: "esc", labelAll: "Escolheu a mais barata: todos", options: opcoesEsc, format: "esc" },
    { param: "prazo", labelAll: "Todos os prazos", options: opcoesPrazos.map(String), format: "prazo" },
    { param: "cidade", labelAll: "Todas as cidades", options: opcoesCidades },
    { param: "janela", labelAll: "Todas as janelas", options: opcoesJanelas },
    { param: "faixaPeso", labelAll: "Todas as faixas de peso", options: opcoesFaixasPeso },
    { param: "faixaCubagem", labelAll: "Todas as faixas de cubagem", options: opcoesFaixasCubagem },
  ];

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
            <h1>Dados</h1>
            <p>
              Tabela detalhada, 1 linha por processo de cotação — busca por cliente, pedido, NF ou
              romaneio, ordenação por coluna, paginação server-side (a mesma tabela "Dados"
              do Artifact atual, agora lendo direto do Supabase). Já aceita as 11 dimensões do
              motor de filtro global (Mês, Transportadora Contratada, Região Comercial, Tipo
              Cliente, Romaneio, Escolheu a Mais Barata, Prazo, Cidade, Janela, Faixa de Peso,
              Faixa de Cubagem).
            </p>
            <nav className="crumbs">
              <Link href="/">← Visão Geral</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="content wide">
        {erro ? (
          <div className="status-banner erro">
            <b>Não foi possível consultar o Supabase.</b>
            <div style={{ marginTop: 6 }}>{erro}</div>
          </div>
        ) : (
          <section className="bloc" style={{ marginTop: 0 }}>
            <Suspense fallback={<div className="filterbar" />}>
              <FilterBar dimensions={filterDimensions} />
            </Suspense>
            <div className="bloc-head" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <div className="desc" id="tblCount">
                {totalCount.toLocaleString("pt-BR")} processos {q ? `encontrados para "${q}"` : "no total"}
              </div>
              <form action="/dados" method="get" style={{ display: "flex", gap: 8 }}>
                <input type="hidden" name="sort" value={sort} />
                <input type="hidden" name="dir" value={dir} />
                {Object.entries(extraFiltroParams).map(([k, v]) =>
                  v ? <input key={k} type="hidden" name={k} value={v} /> : null
                )}
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Buscar por cliente, pedido, NF ou romaneio…"
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--surface-card)",
                    color: "var(--text-primary)",
                    minWidth: 260,
                  }}
                />
                <button type="submit" className="tab-btn">
                  Buscar
                </button>
              </form>
            </div>

            <div className="table-scroll">
              <table className="data wide" id="tblDetalhe">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => {
                      if (!c.key) {
                        return (
                          <th key={c.label} className={c.num ? "num" : undefined}>
                            {c.label}
                          </th>
                        );
                      }
                      const isActive = c.key === sort;
                      const nextDir: "asc" | "desc" = isActive && dir === "desc" ? "asc" : "desc";
                      return (
                        <th key={c.label} className={c.num ? "num" : undefined}>
                          <Link href={buildHref({ q, sort: c.key, dir: nextDir, page: 1 }, extraFiltroParams)}>
                            {c.label}
                            {isActive ? (dir === "asc" ? " ▲" : " ▼") : ""}
                          </Link>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length} style={{ color: "var(--text-muted)", textAlign: "center", padding: 20 }}>
                        Nenhum processo encontrado com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const cls = clsDif(r.diferenca_r, r.diferenca_pct);
                      const style = cls ? { color: `var(--${cls})`, fontWeight: 700 } : undefined;
                      return (
                        <tr key={r.cotacao_id}>
                          <td>{r.romaneio ?? "—"}</td>
                          <td>{r.pedido ?? "—"}</td>
                          <td>{r.nf ?? "—"}</td>
                          <td>{r.cliente_nome ?? "—"}</td>
                          <td>{r.regiao_normalizada ?? "—"}</td>
                          <td className="num">{fmtKg(r.peso_considerado)}</td>
                          <td className="num">{fmtBRL2(r.frete_contratado)}</td>
                          <td>{r.transportadora_contratada ?? "—"}</td>
                          <td>{r.transportadora_mais_barata ?? "—"}</td>
                          <td className="num">{fmtBRL2(r.melhor_cotacao)}</td>
                          <td className="num" style={style}>
                            {fmtBRL2(r.diferenca_r)}
                          </td>
                          <td className="num" style={style}>
                            {fmtPct(r.diferenca_pct)}
                          </td>
                          <td>
                            <EscPill e={r.escolheu} />
                          </td>
                          <td className="num">{r.prazo_contratado ?? "—"}</td>
                          <td>{fmtMes(r.mes)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div id="pager" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              {currentPage > 1 ? (
                <Link href={buildHref({ q, sort, dir, page: currentPage - 1 }, extraFiltroParams)} className="tab-btn">
                  ‹ Anterior
                </Link>
              ) : (
                <span className="tab-btn disabled">‹ Anterior</span>
              )}
              <span>
                Página {currentPage} de {totalPages}
              </span>
              {currentPage < totalPages ? (
                <Link href={buildHref({ q, sort, dir, page: currentPage + 1 }, extraFiltroParams)} className="tab-btn">
                  Próxima ›
                </Link>
              ) : (
                <span className="tab-btn disabled">Próxima ›</span>
              )}
            </div>

            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              Coluna "Valor Declarado" do Artifact original não existe em nenhuma tabela do
              schema atual (cotações/contratações/ofertas/clientes) — não portada, nunca preenchida
              com valor estimado ([R-DADO]).
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        Documento-mãe desta migração: <code>mapa-migracao-tms-v3-2026-09-11.md</code> (projeto
        original, ver README).
      </footer>
    </div>
  );
}
