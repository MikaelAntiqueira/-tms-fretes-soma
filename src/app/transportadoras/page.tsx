import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ComparativoCharts } from "./ComparativoCharts";

// Página "Transportadoras & Cidades" — SÓ a sub-aba "Comparativo" nesta
// etapa (TASK-29 continuação, 2026-09-11), rota /transportadoras. Porta,
// linha a linha, `function renderTransportadoras(mask, qmask)` do Artifact
// original (v42) — ver `docs/mapa-migracao-tms-v3-2026-09-11.md`,
// `memoria/04_DICIONARIO_DADOS.md` e `memoria/05_DICIONARIO_KPIS.md`
// ([KPI-08]/[KPI-15], [DEC-15] FINAL — "% Mais Barata" é uma distribuição,
// não desempenho absoluto isolado).
//
// É comparação FACTUAL entre transportadoras (cotada × contratada × mais
// barata) — de propósito, SEM nenhuma classificação de oportunidade/risco
// (essa camada fica fora, ver `07_PROBLEMAS_ABERTOS.md` → [ISSUE-23]).
//
// Toda agregação é feita dentro do banco via RPC `transportadoras_comparativo`
// (migrations `fn_transportadoras_comparativo` +
// `fix_transportadoras_comparativo_qtdcotada_e_maisbarata`), nunca somando
// linhas cruas no cliente — são ~21.836 ofertas e ~5.194 contratações
// cruzadas, acima do limite padrão de 1000 linhas/requisição do PostgREST.
//
// Validado campo a campo (Playwright) contra a tabela #tblTransp do Artifact
// v42 sem nenhum filtro aplicado — as 7 linhas batem em todas as 9 colunas.
//
// Fora do escopo desta etapa (não portadas ainda, ver mapa de migração):
// as outras 5 sub-abas da página original "Transportadoras & Cidades"
// (Preço × Prazo, Performance, Clientes, Região Comercial, Cidades). Por
// isso não há menu de sub-abas ainda — só o conteúdo do Comparativo.
export const dynamic = "force-dynamic";

interface TransportadoraRow {
  transportadora: string;
  qtd_cotada: number;
  qtd_contratada: number;
  valor_contratado: number;
  frete_medio: number | null;
  vezes_mais_barata: number;
  pct_mais_barata: number | null;
  diferenca_media: number | null;
  pct_participacao: number | null;
  pct_contratada: number | null;
}

const CARRIER_COLOR: Record<string, string> = {
  "Fritz Express": "var(--t1)",
  LKW: "var(--t2)",
  Leomar: "var(--t3)",
  Minuano: "var(--t4)",
  "Rede Nacional": "var(--t5)",
  "Santa Cruz": "var(--t6)",
  "São Miguel": "var(--t7)",
};
function carrierColor(t: string | null): string {
  return (t && CARRIER_COLOR[t]) || "var(--text-muted)";
}
function CarrierDot({ t }: { t: string }) {
  return <span className="carrier-dot" style={{ background: carrierColor(t) }} />;
}

async function getTransportadorasData(): Promise<TransportadoraRow[]> {
  const { data, error } = await supabase.rpc("transportadoras_comparativo");
  if (error) throw new Error(error.message);
  const rows: TransportadoraRow[] = ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    transportadora: String(r.transportadora),
    qtd_cotada: Number(r.qtd_cotada ?? 0),
    qtd_contratada: Number(r.qtd_contratada ?? 0),
    valor_contratado: Number(r.valor_contratado ?? 0),
    frete_medio: r.frete_medio == null ? null : Number(r.frete_medio),
    vezes_mais_barata: Number(r.vezes_mais_barata ?? 0),
    pct_mais_barata: r.pct_mais_barata == null ? null : Number(r.pct_mais_barata),
    diferenca_media: r.diferenca_media == null ? null : Number(r.diferenca_media),
    pct_participacao: r.pct_participacao == null ? null : Number(r.pct_participacao),
    pct_contratada: r.pct_contratada == null ? null : Number(r.pct_contratada),
  }));
  // defensivo: a função SQL já devolve ordenado por valor_contratado desc
  return rows.sort((a, b) => b.valor_contratado - a.valor_contratado);
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtBRL2(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(v: number | null | undefined, d = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
}

export default async function TransportadorasPage() {
  let rows: TransportadoraRow[] = [];
  let erro: string | null = null;
  try {
    rows = await getTransportadorasData();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  const custoTotal = rows.reduce((s, r) => s + r.valor_contratado, 0);
  const totalContratos = rows.reduce((s, r) => s + r.qtd_contratada, 0);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
            <h1>Transportadoras — Comparativo</h1>
            <p>
              Comparação factual entre as 7 transportadoras — cotada × contratada × mais barata —
              sobre <b>toda a base</b> (ofertas e contratações cruzadas a uma cotação, sem filtro de
              dia nem filtro global nesta etapa). Sem classificação de oportunidade/risco de propósito.
            </p>
            <nav className="crumbs">
              <Link href="/">← Visão Geral</Link> · <Link href="/ontem">Ontem</Link> ·{" "}
              <Link href="/operacao">Operação</Link>
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
        ) : rows.length === 0 ? (
          <div className="status-banner">Sem dados de transportadoras nos dados atuais.</div>
        ) : (
          <>
            <section className="bloc" style={{ marginTop: 0 }}>
              <div className="op-note" style={{ marginBottom: 16 }}>
                {fmtNum(rows.length)} transportadoras &middot; <b>{fmtBRL(custoTotal)}</b> em frete
                contratado (toda a base cruzada) &middot; <b>{fmtNum(totalContratos)}</b> contratações
              </div>

              <div className="bloc-head">
                <h2>Comparativo</h2>
                <div className="desc">
                  1 linha por transportadora, ordenado por Valor Contratado desc &middot; &quot;Qtd.
                  Cotada&quot; conta toda oferta registrada (vencedora ou não); &quot;Vezes Mais
                  Barata&quot; considera todas as cotações comparáveis da base (não só as
                  contratadas) — [KPI-08]/[DEC-15]: é uma distribuição, as % somam 100% entre
                  transportadoras, não é desempenho absoluto isolado.
                </div>
              </div>

              <div className="table-scroll">
                <table className="data" id="tblTransp">
                  <thead>
                    <tr>
                      <th>Transportadora</th>
                      <th className="num">Qtd. Cotada</th>
                      <th className="num">Qtd. Contratada</th>
                      <th className="num">Valor Contratado</th>
                      <th className="num">Frete Médio</th>
                      <th className="num">Vezes Mais Barata</th>
                      <th className="num">% Mais Barata</th>
                      <th className="num">Diferença Média</th>
                      <th className="num">% Participação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.transportadora}>
                        <td>
                          <CarrierDot t={r.transportadora} /> {r.transportadora}
                        </td>
                        <td className="num">{fmtNum(r.qtd_cotada)}</td>
                        <td className="num">{fmtNum(r.qtd_contratada)}</td>
                        <td className="num">{fmtBRL(r.valor_contratado)}</td>
                        <td className="num">{fmtBRL2(r.frete_medio)}</td>
                        <td className="num">{fmtNum(r.vezes_mais_barata)}</td>
                        <td className="num">{fmtPct(r.pct_mais_barata)}</td>
                        <td className="num">{fmtBRL2(r.diferenca_media)}</td>
                        <td className="num">{fmtPct(r.pct_participacao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bloc">
              <div className="bloc-head">
                <h2>Contratada × Mais Barata · Ranking</h2>
                <div className="desc">mesmos dados da tabela acima, em gráfico</div>
              </div>
              <ComparativoCharts
                rows={rows.map((r) => ({
                  transportadora: r.transportadora,
                  qtd_cotada: r.qtd_cotada,
                  vezes_mais_barata: r.vezes_mais_barata,
                  pct_mais_barata: r.pct_mais_barata,
                  pct_contratada: r.pct_contratada,
                }))}
              />
            </section>

            <section className="bloc">
              <div className="card">
                <h3>Fora do escopo desta etapa</h3>
                <div className="sub">demais sub-abas da página original &quot;Transportadoras &amp; Cidades&quot;</div>
                <div className="alert-card info" style={{ marginTop: 8 }}>
                  <ul>
                    <li>
                      <span className="name">Preço × Prazo</span>
                      <span className="num" style={{ color: "var(--text-muted)" }}>não portada ainda</span>
                    </li>
                    <li>
                      <span className="name">Performance</span>
                      <span className="num" style={{ color: "var(--text-muted)" }}>não portada ainda</span>
                    </li>
                    <li>
                      <span className="name">Clientes</span>
                      <span className="num" style={{ color: "var(--text-muted)" }}>não portada ainda</span>
                    </li>
                    <li>
                      <span className="name">Região Comercial</span>
                      <span className="num" style={{ color: "var(--text-muted)" }}>não portada ainda</span>
                    </li>
                    <li>
                      <span className="name">Cidades</span>
                      <span className="num" style={{ color: "var(--text-muted)" }}>não portada ainda</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        Documento-mãe desta migração: <code>mapa-migracao-tms-v3-2026-09-11.md</code> (projeto
        original, ver README).
      </footer>
    </div>
  );
}
