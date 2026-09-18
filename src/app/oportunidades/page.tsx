import { createSupabaseServerClient, requireUser } from "@/lib/supabase-server";
import { FilterBar, type FilterDimension } from "@/components/FilterBar";
import { Suspense } from "react";
import { OportunidadesTabsClient } from "./OportunidadesTabsClient";
import { parseMulti, clsDifSobreFrete, fmtBRL, fmtNum, fmtPct } from "@/lib/format";

// Página "Oportunidades" — sub-abas:
//   1. Classificação  (🔴🟠🔵🟢⚠️ — tabela + KPIs)
//   2. Clientes Prioritários (top clientes por impacto)
// [TASK-34] Fase 2 — builds sobre a view comparacoes, corrigida em
// 2026-09-14 (ver supabase/migrations/2026091303_create_comparacoes_view.sql)
// para ser construída SOBRE v_ontem_comparacao — mesma fonte de verdade de
// diffR/diffP/esc já usada em /financeiro e /ontem — em vez do ROW_NUMBER()
// ingênuo original, que nunca chegou a rodar (colunas inexistentes) e
// divergiria do recorte de janela "Meio-dia" se apenas remendado.
// A lógica de classificação aqui é idêntica ao _classificar() do
// enrich_dashboard_data.py (regra FINAL, não reinterpretar).
//
// Neste estágio, a view comparacoes existe no Postgres mas as functions
// RPC de conveniência (fn_oportunidades_...) AINDA NÃO FORAM CRIADAS — a
// página consulta a view diretamente via PostgREST (supabase.from) com os
// mesmos filtros de URL que /financeiro e /transportadoras usam.
//
// [FIX 2026-09-17] Dois achados ao trabalhar no motor de filtro desta
// página, nenhum deles pedido originalmente: (1) a busca não paginava —
// `comparacoes` tem 5.194 linhas, acima do "Max Rows" da API do Supabase
// (1000) — cortava silenciosamente em 1.000 e reportava isso como cobertura
// real ("14,5% da base" em vez de 75,1%); corrigido com paginação em lotes.
// (2) as opções dos dropdowns (mês/região/tipo) derivavam do resultado JÁ
// FILTRADO, então ativar um filtro colapsava o PRÓPRIO dropdown daquela
// dimensão pro único valor selecionado — corrigido com cascata real
// (passaFiltros(), cada dimensão exclui a si mesma), mesma regra de
// financeiro_filtro_opcoes_cascata() só que em JS (esta página usa
// `data_contratacao`, não `v_cotacao_filtros.mes` — semânticas diferentes,
// não dá pra só reaproveitar a RPC aqui sem também mudar o que "mês"
// significa nesta página).
// ============================================================================

const TRANSP_ORDER = [
  "Rede Nacional",
  "Fritz Express",
  "São Miguel",
  "Santa Cruz",
  "Leomar",
  "Minuano",
  "LKW",
  "B. Transportes",
];

const CLASSIF_ORDER = ["vermelho", "laranja", "azul", "verde", "alerta"];

const COLORS: Record<string, string> = {
  vermelho: "#ef4444",
  laranja:  "#f97316",
  azul:     "#3b82f6",
  verde:    "#22c55e",
  alerta:   "#8b5cf6",
};

// ---------------------------------------------------------------------------
// Tipos — colunas da view comparacoes (ver migration
// 2026091303_create_comparacoes_view.sql)
// ---------------------------------------------------------------------------
export interface ComparacaoRow {
  contratacao_id: string;
  pedido: string;
  nf: string;
  data_contratacao: string;
  cnpj_cliente: string;
  cliente_nome: string;
  tipo_cliente: string;
  cidade: string;
  regiao_normalizada: string;
  transportadora_contratada: string;
  valor_frete_contratado: number | null;
  peso_real_kg: number | null;
  faixa_peso: string;
  faixa_cubagem: string;
  janela: string;
  melhor_preco: number | null;
  transportadora_mais_barata: string | null;
  diffR: number | null;
  diffP: number | null;
  esc: string;
  prazo_contratado_dias: number | null;
  prazo_alternativa_dias: number | null;
  classif: string | null;
  risco_prazo_alt: boolean;
  oportunidade_prazo: boolean;
}

// ---------------------------------------------------------------------------
// Formatação (centralizada em @/lib/format)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Server-side: busca dados da view comparacoes via PostgREST
// ---------------------------------------------------------------------------
type FiltrosOportunidades = {
  meses: string[] | null;
  transportadoras: string[] | null;
  regioes: string[] | null;
  tipos: string[] | null;
};

// [FIX 2026-09-17] Cascata de opções — antes os 3 dropdowns dinâmicos (mês/
// região/tipo) derivavam suas opções do resultado JÁ FILTRADO (`rows`),
// então ativar um filtro fazia o PRÓPRIO dropdown daquela dimensão
// "colapsar" pra só o valor selecionado (impossível trocar de região sem
// antes limpar o filtro de região) — bug real, não cascata de verdade.
// Cascata correta: cada dimensão calcula suas opções aplicando as OUTRAS 3
// dimensões, nunca a si mesma — mesma regra de financeiro_filtro_opcoes_
// cascata() (reaproveitada em /financeiro, /operacao, /transportadoras),
// replicada aqui em JS porque esta página filtra client-side (ver comentário
// abaixo) sobre `data_contratacao`, não `v_cotacao_filtros.mes` (a RPC usa a
// data de CRIAÇÃO da cotação — semântica diferente da usada aqui).
function passaFiltros(
  row: Record<string, unknown>,
  filtros: FiltrosOportunidades,
  excluir: keyof FiltrosOportunidades | null
): boolean {
  if (excluir !== "meses" && filtros.meses && filtros.meses.length > 0) {
    const dc = row.data_contratacao as string | null | undefined;
    if (dc == null || dc === "" || !filtros.meses.some((m) => dc.startsWith(m))) return false;
  }
  if (excluir !== "transportadoras" && filtros.transportadoras && filtros.transportadoras.length > 0) {
    if (!filtros.transportadoras.includes(row.transportadora_contratada as string)) return false;
  }
  if (excluir !== "regioes" && filtros.regioes && filtros.regioes.length > 0) {
    if (!filtros.regioes.includes(row.regiao_normalizada as string)) return false;
  }
  if (excluir !== "tipos" && filtros.tipos && filtros.tipos.length > 0) {
    if (!filtros.tipos.includes(row.tipo_cliente as string)) return false;
  }
  return true;
}

async function fetchComparacoes(filtros: FiltrosOportunidades): Promise<{
  rows: ComparacaoRow[];
  totalCotacoes: number;
  opcoesMeses: string[];
  opcoesRegioes: string[];
  opcoesTipos: string[];
}> {
  const supabase = await createSupabaseServerClient();

  // [FIX 2026-09-17] `comparacoes` tem 5.194 linhas — acima do "Max Rows" da
  // API do Supabase (1000, config do projeto, não contornável só com
  // `.range()`: o servidor recorta a resposta de qualquer jeito). Sem isso,
  // a página buscava só as primeiras 1.000 e reportava como se fosse a
  // cobertura REAL da base ("1.000 processos, 14,5% da base") — quando o
  // real é 5.194 (75,1%). Fix: pagina em lotes de 1000 — 1ª página já traz
  // o total exato (`count: "exact"`), as demais páginas disparam em
  // paralelo (Promise.all), não em série, pra não somar latência à toa.
  // Achado ao trabalhar no motor de filtro desta página, não relacionado.
  const PAGE = 1000;
  const orderOpts = { ascending: false, nullsFirst: false } as const;

  const [{ data: firstPage, count: totalComparacoes, error: firstError }, { count: totalCotacoes }] = await Promise.all([
    supabase.from("comparacoes").select("*", { count: "exact" }).order("diffR", orderOpts).range(0, PAGE - 1),
    supabase.from("cotacoes").select("*", { count: "exact", head: true }),
  ]);
  if (firstError) throw new Error(firstError.message);

  const restPageCount = Math.max(0, Math.ceil((totalComparacoes ?? 0) / PAGE) - 1);
  const restPages = await Promise.all(
    Array.from({ length: restPageCount }, (_, i) => {
      const offset = (i + 1) * PAGE;
      return supabase.from("comparacoes").select("*").order("diffR", orderOpts).range(offset, offset + PAGE - 1);
    })
  );
  for (const p of restPages) {
    if (p.error) throw new Error(p.error.message);
  }
  const allRows: Record<string, unknown>[] = [...(firstPage ?? []), ...restPages.flatMap((p) => p.data ?? [])];

  // Aplicar filtros na linha (PostgREST não suporta filter string raw via SDK,
  // então filtramos manualmente no cliente com as mesmas condições). Cada
  // dimensão é OU dentro de si e AND entre dimensões — mesma convenção do
  // FilterBar em todas as outras páginas.
  const filtered = allRows.filter((row) => passaFiltros(row, filtros, null));

  // Opções dos dropdowns com cascata real (ver passaFiltros acima) — cada
  // dimensão exclui a si mesma do filtro aplicado antes de listar valores.
  const opcoesMeses = [...new Set(
    allRows
      .filter((row) => passaFiltros(row, filtros, "meses"))
      .map((row) => (row.data_contratacao as string | null)?.slice(0, 7))
      .filter((v): v is string => Boolean(v))
  )].sort();
  const opcoesRegioes = [...new Set(
    allRows
      .filter((row) => passaFiltros(row, filtros, "regioes"))
      .map((row) => row.regiao_normalizada as string | null)
      .filter((v): v is string => Boolean(v))
  )].sort();
  const opcoesTipos = [...new Set(
    allRows
      .filter((row) => passaFiltros(row, filtros, "tipos"))
      .map((row) => row.tipo_cliente as string | null)
      .filter((v): v is string => Boolean(v))
  )].sort();

  const rows: ComparacaoRow[] = filtered.map((r) => ({
    contratacao_id:            String(r.contratacao_id ?? ""),
    pedido:                    String(r.pedido ?? ""),
    nf:                        String(r.nf ?? ""),
    data_contratacao:          String(r.data_contratacao ?? ""),
    cnpj_cliente:              String(r.cnpj_cliente ?? ""),
    cliente_nome:              (r.cliente_nome as string) ?? "—",
    tipo_cliente:              (r.tipo_cliente as string) ?? "—",
    cidade:                    (r.cidade as string) ?? "—",
    regiao_normalizada:        (r.regiao_normalizada as string) ?? "—",
    transportadora_contratada: (r.transportadora_contratada as string) ?? "—",
    valor_frete_contratado:    r.valor_frete_contratado == null ? null : Number(r.valor_frete_contratado),
    peso_real_kg:              r.peso_real_kg == null ? null : Number(r.peso_real_kg),
    faixa_peso:                (r.faixa_peso as string) ?? "—",
    faixa_cubagem:             (r.faixa_cubagem as string) ?? "—",
    janela:                    (r.janela as string) ?? "—",
    melhor_preco:              r.melhor_preco == null ? null : Number(r.melhor_preco),
    transportadora_mais_barata: (r.transportadora_mais_barata as string) ?? null,
    diffR:                     r.diffR == null ? null : Number(r.diffR),
    diffP:                     r.diffP == null ? null : Number(r.diffP),
    esc:                       (r.esc as string) ?? "SC",
    prazo_contratado_dias:     r.prazo_contratado_dias == null ? null : Number(r.prazo_contratado_dias),
    prazo_alternativa_dias:    r.prazo_alternativa_dias == null ? null : Number(r.prazo_alternativa_dias),
    classif:                   (r.classif as string) ?? null,
    risco_prazo_alt:           Boolean(r.risco_prazo_alt),
    oportunidade_prazo:        Boolean(r.oportunidade_prazo),
  }));

  return { rows, totalCotacoes: totalCotacoes ?? 0, opcoesMeses, opcoesRegioes, opcoesTipos };
}

// ---------------------------------------------------------------------------
// Server Component — página
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OportunidadesPage({ searchParams }: PageProps) {
  // [D-28] Rede de segurança independente de proxy.ts — ver comentário em
  // src/lib/supabase-server.ts.
  await requireUser("/oportunidades");
  const sp = await searchParams;
  const filtros = {
    meses:        parseMulti(sp.mes),
    transportadoras: parseMulti(sp.transportadora),
    regioes:      parseMulti(sp.regiao),
    tipos:        parseMulti(sp.tipo),
  };

  let rows: ComparacaoRow[] = [];
  let totalCotacoes = 0;
  let opcoesMesesCascata: string[] = [];
  let opcoesRegioesCascata: string[] = [];
  let opcoesTiposCascata: string[] = [];
  let erro: string | null = null;

  try {
    const result = await fetchComparacoes(filtros);
    rows = result.rows;
    totalCotacoes = result.totalCotacoes;
    opcoesMesesCascata = result.opcoesMeses;
    opcoesRegioesCascata = result.opcoesRegioes;
    opcoesTiposCascata = result.opcoesTipos;
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  if (erro) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-inner">
            <div>
              <div className="eyebrow">TMS Fretes · grupo SOMA/RS</div>
              <h1>Oportunidades</h1>
              <nav className="crumbs"><a href="/">← Visão Geral</a></nav>
            </div>
          </div>
        </header>
        <main className="content">
          <div className="status-banner erro">
            <b>Não foi possível consultar o Supabase.</b>
            <div style={{ marginTop: 6 }}>{erro}</div>
          </div>
        </main>
        <footer className="app-footer">
          Documento-mãe: <code>mapa-migracao-tms-v3-2026-09-11.md</code>
        </footer>
      </div>
    );
  }

  // ── KPIs ──────────────────────────────────────────────────────────────
  const total = rows.length;
  const diffTotal = rows.reduce((s, r) => s + (r.diffR ?? 0), 0);
  const diffPositivoCount = rows.filter((r) => r.diffR != null && r.diffR > 0).length;
  const diffPositivoSum = rows.reduce((s, r) => s + (r.diffR != null && r.diffR > 0 ? r.diffR : 0), 0);
  const verdeCount = rows.filter((r) => r.classif === "verde").length;
  const vermelhoCount = rows.filter((r) => r.classif === "vermelho").length;
  const laranjaCount = rows.filter((r) => r.classif === "laranja").length;
  const azulCount = rows.filter((r) => r.classif === "azul").length;
  const alertaCount = rows.filter((r) => r.classif === "alerta").length;
  const naoEscolheuBarata = rows.filter((r) => r.esc === "N").length;
  const escolheuBarata = rows.filter((r) => r.esc === "S").length;
  const semComparacao = rows.filter((r) => r.esc === "SC").length;
  const comRiscoPrazo = rows.filter((r) => r.risco_prazo_alt).length;
  const comOportunidadePrazo = rows.filter((r) => r.oportunidade_prazo).length;
  const pctBarata = (escolheuBarata + naoEscolheuBarata) > 0
    ? escolheuBarata / (escolheuBarata + naoEscolheuBarata)
    : null;

  // Opções dos dropdowns com cascata real (calculadas em fetchComparacoes,
  // sobre TODAS as linhas — não sobre `rows`, que já está filtrado; ver
  // [FIX 2026-09-17] e passaFiltros() lá). [FIX 2026-09-16, ainda válido]:
  // tipo_cliente é "Publico" sem acento no banco — nunca hardcode "Público".
  const filterDimensions: FilterDimension[] = [
    { param: "mes", labelAll: "Todos os meses", options: opcoesMesesCascata, format: "mes" },
    { param: "transportadora", labelAll: "Todas as transportadoras", options: TRANSP_ORDER },
    { param: "regiao", labelAll: "Todas as regiões", options: opcoesRegioesCascata },
    { param: "tipo", labelAll: "Todos os tipos", options: opcoesTiposCascata },
  ];

  // Dados das abas (hidratados client-side via state)
  const classificacaoRows = rows.filter((r) => r.classif !== null && r.diffR != null && r.diffR > 0)
    .sort((a, b) => (b.diffR ?? 0) - (a.diffR ?? 0));

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <div className="eyebrow">TMS Fretes · grupo SOMA/RS</div>
            <h1>Oportunidades</h1>
            <nav className="crumbs"><a href="/">← Visão Geral</a></nav>
          </div>
        </div>
      </header>

      <main className="content wide">
        {!rows || rows.length === 0 ? (
          <div className="status-banner">
            Sem dados na base atual (confira se o filtro ativo não zerou o recorte).
          </div>
        ) : (
          <>
            {/* ── Filtro global ─────────────────────────────────────────── */}
            <Suspense fallback={<div className="filterbar" />}>
              <FilterBar dimensions={filterDimensions} />
            </Suspense>

            {/* ── KPIs ──────────────────────────────────────────────────── */}
            <section className="bloc" style={{ marginTop: 16 }}>
              <div className="bloc-head">
                <h2>KPIs de Oportunidade</h2>
                <div className="desc">Base completa · sem comparação de período</div>
              </div>
              <div className="grid kpis">
                <div className="card kpi">
                  <div className="lbl">Processos classificados</div>
                  <div className="val">{fmtNum(total)}</div>
                  <span className="delta na">sem comparação</span>
                  <div className="foot">{fmtNum(totalCotacoes)} cotações na base</div>
                </div>
                <div className="card kpi">
                  <div className="lbl">Diferença total (R$)</div>
                  <div className="val">{fmtBRL(diffTotal)}</div>
                  <span className="delta na">soma das diferenças positivas</span>
                  <div className="foot">{fmtNum(diffPositivoCount)} processos com diff &gt; 0</div>
                </div>
                <div className="card kpi">
                  <div className="lbl">Não escolheu a mais barata</div>
                  <div className="val">{fmtNum(naoEscolheuBarata)}</div>
                  <span className="delta na">
                    {pctBarata != null ? fmtPct(pctBarata) : "—"} escolheu a mais barata
                  </span>
                  <div className="foot">
                    {fmtNum(escolheuBarata)} contratou a mais barata · {fmtNum(semComparacao)} sem comparação
                  </div>
                </div>
                <div className="card kpi">
                  <div className="lbl">Risco prazo (Leomar)</div>
                  <div className="val">{fmtNum(comRiscoPrazo)}</div>
                  <span className="delta warning">econômico mas instável no prazo</span>
                  <div className="foot">mais barata = Leomar, pagou acima</div>
                </div>
                <div className="card kpi">
                  <div className="lbl">Oportunidade prazo objetiva</div>
                  <div className="val">{fmtNum(comOportunidadePrazo)}</div>
                  <span className="delta positive">alternativa ≤ prazo + ≠ Leomar</span>
                  <div className="foot">critério: esc=N + diffR&gt;0 + prazo_alt ≤ prazo_contr + alt≠Leomar</div>
                </div>
              </div>

              {/* Nota de cobertura (R-DADO) */}
              <div className="cov-note" style={{ marginTop: 10 }}>
                <b>FATO — cobertura:</b> estes números medem sobre {fmtNum(total)} processos com frete contratado e ≥ 1
                oferta comparável ({fmtPct(total / totalCotacoes)} da base de {fmtNum(totalCotacoes)} cotações).
                Sempre rotulado — nunca assumir que cobre 100% da operação. Limitação de fonte, não de método.
              </div>
            </section>

            {/* ── Tabs ──────────────────────────────────────────────────── */}
            <OportunidadesTabsClient
              rows={rows}
              classificacaoRows={classificacaoRows}
              totalCotacoes={totalCotacoes}
              colors={COLORS}
              classifOrder={CLASSIF_ORDER}
            />

            {/* ── Nota de cobertura final ────────────────────────────────── */}
            <div className="cov-note" style={{ marginTop: 16 }}>
              <p>
                <strong>Nota de cobertura:</strong> os números desta página medem sobre processos com frete contratado e ≥ 1
                oferta comparável ({fmtNum(total)} de {fmtNum(totalCotacoes)} cotações, ≈{fmtPct(total / totalCotacoes)}
                da base). Sempre rotulado — nunca assumir que cobre 100%.
              </p>
              <p style={{ marginTop: 6 }}>
                <strong>R-E-DAÍ:</strong> uma classificação 🔴/🟠 identifica onde há diferença financeira — não confirma
                erro, desperdício ou economia recuperável. Cada processo é analisado caso a caso pela gestão (ver DEC-25,
                não há campo de "motivo").
              </p>
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        Documento-mãe: <code>mapa-migracao-tms-v3-2026-09-11.md</code>
      </footer>
    </div>
  );
}

export function generateMetadata() {
  return {
    title: "Oportunidades — TMS Fretes SOMA",
    description: "Classificação de oportunidades de economia por impacto. Diferença ≠ erro — critério explícito.",
  };
}
