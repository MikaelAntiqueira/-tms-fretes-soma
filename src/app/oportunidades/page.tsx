import { createSupabaseServerClient } from "@/lib/supabase-server";
import { FilterBar, type FilterDimension } from "@/components/FilterBar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Suspense } from "react";
import { OportunidadesTabsClient } from "./OportunidadesTabsClient";

// Página "Oportunidades" — sub-abas:
//   1. Classificação  (🔴🟠🔵🟢⚠️ — tabela + KPIs)
//   2. Clientes Prioritários (top clientes por impacto)
// [TASK-34] Fase 2 — builds sobre a view comparacoes criada em
// 2026091303_create_comparacoes_view.sql.
// A lógica de classificação aqui é idêntica ao _classificar() do
// enrich_dashboard_data.py (regra FINAL, não reinterpretar).
//
// Neste estágio, a view comparacoes existe no Postgres mas as functions
// RPC de conveniência (fn_oportunidades_...) AINDA NÃO FORAM CRIADAS — a
// página consulta a view diretamente via PostgREST (supabase.from) com os
// mesmos filtros de URL que /financeiro e /transportadoras usam.
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
  contratacao_id: number;
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
// Formatação
// ---------------------------------------------------------------------------
function fmtBRL(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtNum(v: number | null | undefined, d = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
}
function fmtMes(iso: string): string {
  const [y, m] = iso.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const idx = parseInt(m, 10) - 1;
  return `${nomes[idx] ?? "?"}/${y}`;
}
function parseMulti(raw: string | string[] | undefined): string[] | null {
  if (!raw) return null;
  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  const values = joined.split(",").map((v) => v.trim()).filter(Boolean);
  return values.length > 0 ? values : null;
}

// ---------------------------------------------------------------------------
// Server-side: busca dados da view comparacoes via PostgREST
// ---------------------------------------------------------------------------
async function fetchComparacoes(filtros: {
  meses: string[] | null;
  transportadoras: string[] | null;
  regioes: string[] | null;
  tipos: string[] | null;
}): Promise<{ rows: ComparacaoRow[]; totalCotacoes: number }> {
  const supabase = await createSupabaseServerClient();

  // Build PostgREST filter for the comparacoes view.
  // Cada dimensão vira um filtro `or` (OU dentro da dimensão) e as
  // dimensões se combinam com AND (interseção entre dimensões).
  //
  // A view comparacoes tem colunas:
  //   data_contratacao, transportadora_contratada,
  //   regiao_normalizada, tipo_cliente
  // que correspondem às 4 dimensões do filtro.

  const filterParts: string[] = [];

  if (filtros.meses && filtros.meses.length > 0) {
    const conditions = filtros.meses.map((m) => `data_contratacao~"${m}-"`);
    filterParts.push(`(${conditions.join(" or ")})`);
  }
  if (filtros.transportadoras && filtros.transportadoras.length > 0) {
    const conditions = filtros.transportadoras.map((t) => `transportadora_contratada=eq.${t}`);
    filterParts.push(`(${conditions.join(" or ")})`);
  }
  if (filtros.regioes && filtros.regioes.length > 0) {
    const conditions = filtros.regioes.map((r) => `regiao_normalizada=eq.${r}`);
    filterParts.push(`(${conditions.join(" or ")})`);
  }
  if (filtros.tipos && filtros.tipos.length > 0) {
    const conditions = filtros.tipos.map((t) => `tipo_cliente=eq.${t}`);
    filterParts.push(`(${conditions.join(" or ")})`);
  }

  const filter = filterParts.length > 0 ? filterParts.join(",") : undefined;

  // Contagem total de cotações na base (para cobertura).
  const [{ count: totalCotacoes }, { data, error }] = await Promise.all([
    supabase.from("cotacoes").select("*", { count: "exact", head: true }),
    supabase.from("comparacoes").select("*").order("diffR", { ascending: false, nullsFirst: false }),
  ]);

  if (error) throw new Error(error.message);

  // Aplicar filtros na linha (PostgREST não suporta filter string raw via SDK,
  // então filtramos manualmente no cliente com as mesmas condições).
  let filtered = data ?? [];
  if (filter) {
    filtered = filtered.filter((row) => {
      // data_contratacao~"2026-07" → começa com o mês
      if (filtros.meses && filtros.meses.length > 0) {
        const mesMatch = filtros.meses.some((m) => (row.data_contratacao as string).startsWith(m));
        if (!mesMatch) return false;
      }
      if (filtros.transportadoras && filtros.transportadoras.length > 0) {
        if (!filtros.transportadoras.includes(row.transportadora_contratada as string)) return false;
      }
      if (filtros.regioes && filtros.regioes.length > 0) {
        if (!filtros.regioes.includes(row.regiao_normalizada as string)) return false;
      }
      if (filtros.tipos && filtros.tipos.length > 0) {
        if (!filtros.tipos.includes(row.tipo_cliente as string)) return false;
      }
      return true;
    });
  }

  const rows: ComparacaoRow[] = filtered.map((r) => ({
    contratacao_id:            Number(r.contratacao_id ?? 0),
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

  return { rows, totalCotacoes: totalCotacoes ?? 0 };
}

// ---------------------------------------------------------------------------
// Server Component — página
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OportunidadesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filtros = {
    meses:        parseMulti(sp.mes),
    transportadoras: parseMulti(sp.transportadora),
    regioes:      parseMulti(sp.regiao),
    tipos:        parseMulti(sp.tipo),
  };

  let rows: ComparacaoRow[] = [];
  let totalCotacoes = 0;
  let erro: string | null = null;

  try {
    const result = await fetchComparacoes(filtros);
    rows = result.rows;
    totalCotacoes = result.totalCotacoes;
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  if (erro) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-inner">
            <div>
              <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
              <h1>Oportunidades</h1>
              <nav className="crumbs"><a href="/">← Visão Geral</a></nav>
            </div>
            <ThemeToggle />
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

  // Dados para filtros dinâmicos — meses vêm dos próprios dados.
  const opcoesMes = [...new Set(rows.map((r) => {
    const [y, m] = r.data_contratacao.split("-");
    return `${y}-${m}`;
  }))].sort();
  const opcoesRegioes = [...new Set(rows.map((r) => r.regiao_normalizada))].sort();

  const filterDimensions: FilterDimension[] = [
    { param: "mes", labelAll: "Todos os meses", options: opcoesMes, format: fmtMes },
    { param: "transportadora", labelAll: "Todas as transportadoras", options: TRANSP_ORDER },
    { param: "regiao", labelAll: "Todas as regiões", options: opcoesRegioes },
    { param: "tipo", labelAll: "Todos os tipos", options: ["Público", "Privado", "Grupo"] },
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
            <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
            <h1>Oportunidades</h1>
            <p className="desc" style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 14 }}>
              Classificação de oportunidades de economia por impacto.
              Diferença ≠ erro — critério explícito.
            </p>
            <nav className="crumbs"><a href="/">← Visão Geral</a></nav>
          </div>
          <ThemeToggle />
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
