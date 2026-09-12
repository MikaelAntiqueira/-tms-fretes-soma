import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ComparativoCharts } from "./ComparativoCharts";
import { TransportadorasTabs } from "./TransportadorasTabs";
import { PrecoPrazoChart, type PrazoMedioRow } from "./PrecoPrazoChart";
import { RegiaoComercialChart, type RegiaoComercialRow } from "./RegiaoComercialChart";
import { ClientesChart, type ClienteMetricaRow } from "./ClientesChart";

// Página "Transportadoras & Cidades" — sub-abas "Comparativo" (TASK-29
// continuação, 2026-09-11, inalterada nesta etapa), "Preço × Prazo" (nova,
// TASK-29 continuação, 2026-09-12), "Região Comercial" e "Clientes"
// (inalteradas nesta etapa), rota /transportadoras. Porta, linha a linha,
// `function renderTransportadoras(mask, qmask)` (Comparativo), `function
// renderQuadrante(mask)` + `function renderPrazoHist()` (Preço × Prazo),
// `function renderUf(mask)` (Região Comercial) e `function
// renderClientes(mask)` (Clientes) do Artifact original (v42) — ver
// `docs/mapa-migracao-tms-v3-2026-09-11.md`, `memoria/04_DICIONARIO_DADOS.md`
// e `memoria/05_DICIONARIO_KPIS.md` ([KPI-08]/[KPI-15], [DEC-15] FINAL —
// "% Mais Barata" é uma distribuição, não desempenho absoluto isolado;
// [DEC-02] FINAL — Região Comercial ≠ UF, usa sempre
// `clientes.regiao_normalizada`, nunca `regiao_comercial_bruta`).
//
// A sub-aba original "Performance" NÃO foi recriada de propósito: no
// Artifact ela é a MESMA tabela que já está fundida na nossa aba
// "Comparativo" (decisão de uma etapa anterior — ver comentário abaixo, na
// seção "fora do escopo").
//
// Comparativo/Preço×Prazo/Região Comercial/Clientes são comparação FACTUAL
// entre transportadoras — de propósito, SEM nenhuma classificação de
// oportunidade/risco (essa camada fica fora, ver `07_PROBLEMAS_ABERTOS.md`
// → [ISSUE-23]). Só agregação factual de valor contratado / diferença
// financeira identificada / prazo / contagem de processos, sem classificar
// causa.
//
// Toda agregação é feita dentro do banco via RPC (`transportadoras_
// comparativo`, `transportadoras_prazo_medio`, `transportadoras_prazo_hist`,
// `transportadoras_regiao_comercial`, `transportadoras_clientes_metricas` —
// migrations `fn_transportadoras_comparativo` + `fix_transportadoras_
// comparativo_qtdcotada_e_maisbarata` + `fn_transportadoras_prazo_medio_e_
// prazo_hist` + `fix_transportadoras_prazo_hist_universo` + `fn_
// transportadoras_regiao_comercial_e_clientes`), nunca somando linhas cruas
// no cliente — são ~21.836 ofertas, ~6.915 cotações e ~5.194 contratações
// cruzadas, acima do limite padrão de 1000 linhas/requisição do PostgREST.
//
// Universo: Comparativo, Preço×Prazo e Região Comercial agregam sobre toda
// a base CRUZADA (contratações que cruzam uma cotação, mesmo universo de
// v_ontem_comparacao); Clientes usa o mesmo universo para Frete
// Contratado/Diferença, mas a Qtd. de Processos conta toda a base de
// cotações do cliente (cruzada ou não) — replica exatamente `BASE.cli[i]`
// do Artifact original, que não depende de contrato cruzado.
//
// ACHADO desta etapa (Preço × Prazo, Bloco 2 — tabela "Perfil histórico de
// prazo"): a leitura inicial da instrução ("mesmos dados de
// radar_prazo_hist()") não bateu com o Artifact de referência.
// `radar_prazo_hist()` calcula sobre TODA a grade de ofertas
// (`ofertas.prazo_dias`, ~21.836 linhas — correto para o detector D2 do
// Radar de Decisão, seu único consumidor hoje) e por isso tem N muito maior
// (ex. Fritz Express N=1.059) do que o Artifact v42 mostra na tabela
// "Perfil histórico de prazo" (Fritz Express N=453). Validação campo a
// campo (Playwright lendo `META.prazoHist` embutido no Artifact) provou que
// essa tabela na verdade usa a MESMA base de `transportadoras_prazo_medio`
// (prazo da oferta vencedora, só transportadora CONTRATADA, sobre a base
// cruzada) — bateu dígito a dígito (mean 1.0022075055187638 / N 453 para
// Fritz Express). Por isso `transportadoras_prazo_hist()` (nova, migration
// `fix_transportadoras_prazo_hist_universo`) usa essa base, não a de
// `radar_prazo_hist()` — que permanece intocada, sem uso nesta página.
//
// Validado campo a campo (Playwright, servindo o Artifact v42 localmente e
// lendo `Chart.getChart(canvas).data` de #chartQuadrante e o DOM de
// #tblPrazoHist) contra as duas functions novas — ver relatório da etapa.
// Drift residual esperado: Rede Nacional tem N=55 no Supabase atual contra
// N=54 no snapshot do Artifact (1 contratação a mais desde a publicação do
// v42) — mesmo padrão de drift normal já documentado nas sub-abas Região
// Comercial/Clientes.
//
// Fora do escopo desta etapa (não portada ainda, ver mapa de migração):
// "Cidades" (tabela de todas as cidades × transportadora, com prazo médio
// — precisa de function nova além de `operacao_por_cidade`, que não pode
// ser alterada). "Performance" nunca vai ser portada como aba própria — é
// a mesma tabela de "Comparativo" (fusão já decidida e publicada numa
// etapa anterior).
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

interface PrazoMedioRawRow {
  transportadora: string;
  prazo_medio: number | null;
  prazo_n: number;
}

interface PrazoHistRow {
  transportadora: string;
  mediana: number;
  media: number;
  n: number;
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

interface TransportadorasData {
  comparativo: TransportadoraRow[];
  quadrante: PrazoMedioRow[];
  prazoHist: PrazoHistRow[];
  regiaoComercial: RegiaoComercialRow[];
  clientes: ClienteMetricaRow[];
}

async function getTransportadorasData(): Promise<TransportadorasData> {
  const [compRes, prazoMedioRes, prazoHistRes, regiaoRes, clientesRes] = await Promise.all([
    supabase.rpc("transportadoras_comparativo"),
    supabase.rpc("transportadoras_prazo_medio"),
    supabase.rpc("transportadoras_prazo_hist"),
    supabase.rpc("transportadoras_regiao_comercial"),
    supabase.rpc("transportadoras_clientes_metricas"),
  ]);
  for (const res of [compRes, prazoMedioRes, prazoHistRes, regiaoRes, clientesRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const comparativo: TransportadoraRow[] = ((compRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
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
  comparativo.sort((a, b) => b.valor_contratado - a.valor_contratado);

  // "Preço × Prazo", Bloco 1 (quadrante): join em memória de
  // transportadoras_prazo_medio (prazoMedio) + transportadoras_comparativo
  // (diferencaMedia), por nome — só 7 linhas. Só entram transportadoras com
  // AS DUAS métricas presentes (renderQuadrante do Artifact original só
  // plota quem tem prazoN>0 E diffN>0).
  const prazoMedioRaw: PrazoMedioRawRow[] = ((prazoMedioRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    transportadora: String(r.transportadora),
    prazo_medio: r.prazo_medio == null ? null : Number(r.prazo_medio),
    prazo_n: Number(r.prazo_n ?? 0),
  }));
  const diferencaPorTransportadora = new Map(comparativo.map((r) => [r.transportadora, r.diferenca_media]));
  const quadrante: PrazoMedioRow[] = prazoMedioRaw
    .map((r) => {
      const diferencaMedia = diferencaPorTransportadora.get(r.transportadora) ?? null;
      if (r.prazo_medio == null || diferencaMedia == null) return null;
      return { transportadora: r.transportadora, prazoMedio: r.prazo_medio, diferencaMedia };
    })
    .filter((r): r is PrazoMedioRow => r !== null);

  // "Preço × Prazo", Bloco 2 (perfil histórico): ordenado por mediana asc
  // (mesma regra do Artifact original — TRANSP_ORDER.map(...).sort((a,b)=>
  // a.median-b.median)).
  const prazoHist: PrazoHistRow[] = ((prazoHistRes.data as Record<string, unknown>[]) ?? [])
    .map((r) => ({
      transportadora: String(r.transportadora),
      mediana: Number(r.mediana ?? 0),
      media: Number(r.media ?? 0),
      n: Number(r.n ?? 0),
    }))
    .sort((a, b) => a.mediana - b.mediana || a.media - b.media);

  const regiaoComercial: RegiaoComercialRow[] = ((regiaoRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    regiao: String(r.regiao),
    valor_contratado: Number(r.valor_contratado ?? 0),
    n_processos: Number(r.n_processos ?? 0),
  }));
  // defensivo: a função SQL já devolve ordenado por valor_contratado desc
  regiaoComercial.sort((a, b) => b.valor_contratado - a.valor_contratado);

  const clientes: ClienteMetricaRow[] = ((clientesRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    cliente: String(r.cliente),
    frete_contratado: Number(r.frete_contratado ?? 0),
    diferenca_positiva: Number(r.diferenca_positiva ?? 0),
    n_processos: Number(r.n_processos ?? 0),
  }));

  return { comparativo, quadrante, prazoHist, regiaoComercial, clientes };
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

// Confiabilidade da mediana/média de prazo por transportadora — mesma
// regra do Artifact original (renderPrazoHist): n>=100 = "boa" (sem cor
// especial), n>=30 = "amostra pequena" (--warning), senão = "insuficiente
// para conclusão" (--critical). Reaproveita as classes `.pill.laranja`
// (--warning) e `.pill.n` (--critical) já existentes em globals.css — não
// precisa de CSS novo.
function confiabilidade(n: number): { label: string; pillClass: string | null } {
  if (n >= 100) return { label: "boa", pillClass: null };
  if (n >= 30) return { label: "⚠️ amostra pequena", pillClass: "pill laranja" };
  return { label: "⚠️ insuficiente para conclusão", pillClass: "pill n" };
}

export default async function TransportadorasPage() {
  let data: TransportadorasData | null = null;
  let erro: string | null = null;
  try {
    data = await getTransportadorasData();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  const rows = data?.comparativo ?? [];
  const quadrante = data?.quadrante ?? [];
  const prazoHist = data?.prazoHist ?? [];
  const regiaoTodas = data?.regiaoComercial ?? [];
  const regiaoTop15 = regiaoTodas.slice(0, 15);
  const clientes = data?.clientes ?? [];

  const custoTotal = rows.reduce((s, r) => s + r.valor_contratado, 0);
  const totalContratos = rows.reduce((s, r) => s + r.qtd_contratada, 0);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
            <h1>Transportadoras &amp; Cidades</h1>
            <p>
              Comparação factual entre as 7 transportadoras, por Preço × Prazo, Região Comercial e
              por Cliente — sobre <b>toda a base</b> (ofertas e contratações cruzadas a uma
              cotação, sem filtro de dia nem filtro global nesta etapa). Sem classificação de
              oportunidade/risco de propósito.
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
            <TransportadorasTabs
              tabs={[
                { id: "transp-comparativo", label: "Comparativo" },
                { id: "transp-preco-prazo", label: "Preço × Prazo" },
                { id: "transp-regiao", label: "Região Comercial" },
                { id: "transp-clientes", label: "Clientes" },
              ]}
              defaultTab="transp-comparativo"
            >
              <div className="subpage" data-subpage="transp-comparativo">
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
              </div>

              <div className="subpage" data-subpage="transp-preco-prazo">
                <section className="bloc" style={{ marginTop: 0 }}>
                  <div className="bloc-head">
                    <h2>Prazo Médio × Diferença Média por Transportadora</h2>
                    <div className="desc">
                      1 ponto por transportadora &middot; eixo X = prazo médio da oferta vencedora nas
                      contratações cruzadas (dias); eixo Y = diferença média (mesma métrica de
                      &quot;Diferença Média&quot; do Comparativo). Só entram transportadoras com as duas
                      métricas disponíveis.
                    </div>
                  </div>
                  {quadrante.length === 0 ? (
                    <div className="status-banner">
                      Sem transportadoras com prazo E diferença média disponíveis simultaneamente.
                    </div>
                  ) : (
                    <div className="card">
                      <PrecoPrazoChart rows={quadrante} />
                    </div>
                  )}
                </section>

                <section className="bloc">
                  <div className="bloc-head">
                    <h2>Perfil histórico de prazo por transportadora</h2>
                    <div className="desc">
                      Prazo da oferta vencedora nas contratações cruzadas, por transportadora
                      contratada &middot; sempre a base completa (não depende de filtro) &middot;
                      ordenado por mediana asc. Confiabilidade: N&ge;100 = boa; N entre 30 e 99 =
                      amostra pequena; N&lt;30 = insuficiente para conclusão.
                    </div>
                  </div>
                  {prazoHist.length === 0 ? (
                    <div className="status-banner">Sem dados de prazo histórico nos dados atuais.</div>
                  ) : (
                    <div className="table-scroll">
                      <table className="data" id="tblPrazoHist">
                        <thead>
                          <tr>
                            <th>Transportadora</th>
                            <th className="num">Mediana (dias)</th>
                            <th className="num">Média (dias)</th>
                            <th className="num">N registros</th>
                            <th>Confiabilidade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prazoHist.map((r) => {
                            const conf = confiabilidade(r.n);
                            return (
                              <tr key={r.transportadora}>
                                <td>
                                  <CarrierDot t={r.transportadora} /> {r.transportadora}
                                </td>
                                <td className="num">{fmtNum(r.mediana, 1)}</td>
                                <td className="num">{fmtNum(r.media, 2)}</td>
                                <td className="num">{fmtNum(r.n)}</td>
                                <td>
                                  {conf.pillClass ? <span className={conf.pillClass}>{conf.label}</span> : conf.label}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>

              <div className="subpage" data-subpage="transp-regiao">
                <section className="bloc" style={{ marginTop: 0 }}>
                  <div className="bloc-head">
                    <h2>Região Comercial</h2>
                    <div className="desc">
                      Top 15 de {fmtNum(regiaoTodas.length)} Regiões Comerciais por valor contratado —
                      toda a base cruzada, sem filtro de dia. Região Comercial (`clientes.regiao_normalizada`)
                      é a região de venda do cadastro, não é UF/estado ([DEC-02] FINAL).
                    </div>
                  </div>
                  {regiaoTop15.length === 0 ? (
                    <div className="status-banner">Sem dados de Região Comercial nos dados atuais.</div>
                  ) : (
                    <div className="card">
                      <RegiaoComercialChart rows={regiaoTop15} />
                    </div>
                  )}
                </section>
              </div>

              <div className="subpage" data-subpage="transp-clientes">
                <section className="bloc" style={{ marginTop: 0 }}>
                  <div className="bloc-head">
                    <h2>Clientes</h2>
                    <div className="desc">
                      Top 12 clientes pela métrica escolhida — Frete Contratado e Diferença Financeira
                      Identificada olham só para a base cruzada (mesmo universo do Comparativo); Qtd. de
                      Processos conta toda cotação do cliente, cruzada ou não.
                    </div>
                  </div>
                  {clientes.length === 0 ? (
                    <div className="status-banner">Sem dados de Clientes nos dados atuais.</div>
                  ) : (
                    <div className="card">
                      <ClientesChart rows={clientes} />
                    </div>
                  )}
                </section>
              </div>
            </TransportadorasTabs>

            <section className="bloc">
              <div className="card">
                <h3>Fora do escopo desta etapa</h3>
                <div className="sub">demais itens da página original &quot;Transportadoras &amp; Cidades&quot;</div>
                <div className="alert-card info" style={{ marginTop: 8 }}>
                  <ul>
                    <li>
                      <span className="name">Cidades</span>
                      <span className="num" style={{ color: "var(--text-muted)" }}>não portada ainda</span>
                    </li>
                    <li>
                      <span className="name">Performance</span>
                      <span className="num" style={{ color: "var(--text-muted)" }}>
                        não é uma aba própria — mesma tabela de &quot;Comparativo&quot; (fusão já decidida)
                      </span>
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
