import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ThemeToggle } from "@/components/ThemeToggle";

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

async function getDadosDetalhe(opts: { q: string; sort: SortColumn; dir: "asc" | "desc"; page: number }) {
  const supabase = await createSupabaseServerClient();
  const offset = (opts.page - 1) * PAGE_SIZE;
  const res = await supabase.rpc("dados_detalhe", {
    p_search: opts.q || null,
    p_sort: opts.sort,
    p_dir: opts.dir,
    p_limit: PAGE_SIZE,
    p_offset: offset,
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

// ---- formatação — mesma convenção pt-BR já usada nas demais páginas ----
function fmtBRL2(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtKg(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " kg";
}
function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
}
// Porta `fmtMes` do Artifact original / mesma function de /financeiro,
// /operacao, /transportadoras, /oportunidades: "2026-07" -> "jul/2026".
function fmtMes(iso: string): string {
  const [y, m] = iso.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const idx = parseInt(m, 10) - 1;
  return `${nomes[idx] ?? "?"}/${y}`;
}
function clsDif(dr: number | null, dp: number | null): "" | "good" | "warning" | "serious" | "critical" {
  if (dr == null) return "";
  if (dr <= 0) return "good";
  if (dp == null || dp <= 0.05) return "warning";
  if (dp <= 0.15) return "serious";
  return "critical";
}
function EscPill({ e }: { e: "S" | "N" | "SC" }) {
  if (e === "S") return <span className="pill s">Sim</span>;
  if (e === "N") return <span className="pill n">Não</span>;
  if (e === "SC") return <span className="pill sc">Sem comp.</span>;
  return <>—</>;
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

function buildHref(base: { q: string; sort: SortColumn; dir: "asc" | "desc"; page: number }): string {
  const params = new URLSearchParams();
  if (base.q) params.set("q", base.q);
  params.set("sort", base.sort);
  params.set("dir", base.dir);
  params.set("page", String(base.page));
  return `/dados?${params.toString()}`;
}

type DadosSearchParams = Record<string, string | string[] | undefined>;

export default async function DadosPage({ searchParams }: { searchParams: Promise<DadosSearchParams> }) {
  const sp = await searchParams;
  const q = parseQ(sp.q);
  const sort = parseSort(sp.sort);
  const dir = parseDir(sp.dir);
  const page = parsePage(sp.page);

  let rows: DadosRow[] = [];
  let totalCount = 0;
  let erro: string | null = null;
  try {
    const res = await getDadosDetalhe({ q, sort, dir, page });
    rows = res.rows;
    totalCount = res.totalCount;
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

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
              romaneio, ordenação por coluna, paginação server-side (a mesma tabela &quot;Dados&quot;
              do Artifact atual, agora lendo direto do Supabase).
            </p>
            <nav className="crumbs">
              <Link href="/">← Visão Geral</Link>
            </nav>
          </div>
          <ThemeToggle />
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
            <div className="bloc-head" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <div className="desc" id="tblCount">
                {totalCount.toLocaleString("pt-BR")} processos {q ? `encontrados para "${q}"` : "no total"}
              </div>
              {/* Busca client-independente: GET simples pra /dados, sem JS —
                  mesmo efeito do `<input id="tblSearch">` do Artifact original
                  (filtra por cliente/pedido/NF/romaneio), sempre volta pra
                  página 1 ao buscar. */}
              <form action="/dados" method="get" style={{ display: "flex", gap: 8 }}>
                <input type="hidden" name="sort" value={sort} />
                <input type="hidden" name="dir" value={dir} />
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
                          <Link href={buildHref({ q, sort: c.key, dir: nextDir, page: 1 })}>
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
                <Link href={buildHref({ q, sort, dir, page: currentPage - 1 })} className="tab-btn">
                  ‹ Anterior
                </Link>
              ) : (
                <span className="tab-btn disabled">‹ Anterior</span>
              )}
              <span>
                Página {currentPage} de {totalPages}
              </span>
              {currentPage < totalPages ? (
                <Link href={buildHref({ q, sort, dir, page: currentPage + 1 })} className="tab-btn">
                  Próxima ›
                </Link>
              ) : (
                <span className="tab-btn disabled">Próxima ›</span>
              )}
            </div>

            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              Coluna &quot;Valor Declarado&quot; do Artifact original não existe em nenhuma tabela do
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
