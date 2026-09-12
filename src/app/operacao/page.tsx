import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ThemeToggle } from "@/components/ThemeToggle";

// Página "Operação" (Controle Operacional de Carregamento), rota /operacao.
// Diferente de /ontem: NÃO é por dia — agrega TODA a base de contratações
// cruzadas (cotacao_id preenchido), sem filtro de dia nem filtro global
// (mesma simplificação já usada em /ontem nesta etapa da migração). Porta,
// linha a linha, a lógica de `renderOperacao(mask)` do Artifact original
// (v42) — ver `docs/mapa-migracao-tms-v3-2026-09-11.md`,
// `memoria/05_DICIONARIO_KPIS.md` e `docs/frete-minimo-observado-2026-09.md`.
//
// Toda soma/contagem distinta é feita DENTRO do banco via RPC
// (`operacao_kpis`, `operacao_por_transportadora`, `operacao_por_janela`,
// `operacao_por_janela_transportadora`, `operacao_por_cidade` — migration
// `fn_operacao_view_e_funcoes` + `fix_operacao_base_dedup_e_peso_fallback`),
// nunca somando linhas cruas no cliente: são ~5.194 linhas cruzadas, acima
// do limite padrão de 1000 linhas/requisição do PostgREST.
//
// Reaproveita a view v_ontem_comparacao (romaneio recuperado do pedido,
// janela e melhor cotação no recorte certo) como base — não duplica essa
// lógica. O piso de frete OBSERVADO (ESTIMATIVA, não tabela oficial) vem de
// `transportadoras.frete_minimo_observado`, nunca hardcoded no TS.
export const dynamic = "force-dynamic";

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

interface OperacaoKpis {
  n_romaneios: number;
  n_pedidos: number;
  soma_volumes: number;
  soma_peso_kg: number;
  soma_cubagem_m3: number;
  soma_frete_contratado: number;
}

interface CarrierRow {
  transportadora: string;
  n_romaneios: number;
  n_pedidos: number;
  soma_volumes: number;
  soma_peso_kg: number;
  soma_cubagem_m3: number;
  soma_frete_contratado: number;
  frete_minimo_observado: number | null;
}

interface JanelaRow {
  janela: string;
  n_linhas: number;
  n_romaneios: number;
  n_pedidos: number;
  soma_peso_kg: number;
  soma_cubagem_m3: number;
  soma_frete_contratado: number;
}

interface JanelaCarrierRow {
  janela: string;
  transportadora: string;
  soma_frete_contratado: number;
}

interface CidadeRow {
  cidade: string;
  transportadora: string;
  n_romaneios: number;
  n_pedidos: number;
  soma_peso_kg: number;
  soma_cubagem_m3: number;
  soma_frete_contratado: number;
  soma_melhor_cotacao: number;
  soma_diferenca_r: number;
  cidade_total_frete: number;
}

interface OperacaoData {
  kpis: OperacaoKpis | null;
  carriers: CarrierRow[];
  janelas: JanelaRow[];
  janelaCarriers: JanelaCarrierRow[];
  cidades: CidadeRow[];
}

async function getOperacaoData(): Promise<OperacaoData> {
  const supabase = await createSupabaseServerClient();
  const [kpisRes, carriersRes, janelasRes, janelaCarriersRes, cidadesRes] = await Promise.all([
    supabase.rpc("operacao_kpis"),
    supabase.rpc("operacao_por_transportadora"),
    supabase.rpc("operacao_por_janela"),
    supabase.rpc("operacao_por_janela_transportadora"),
    supabase.rpc("operacao_por_cidade"),
  ]);
  for (const res of [kpisRes, carriersRes, janelasRes, janelaCarriersRes, cidadesRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const kpisRow = (kpisRes.data as Record<string, unknown>[])?.[0];
  const kpis: OperacaoKpis | null = kpisRow
    ? {
        n_romaneios: Number(kpisRow.n_romaneios ?? 0),
        n_pedidos: Number(kpisRow.n_pedidos ?? 0),
        soma_volumes: Number(kpisRow.soma_volumes ?? 0),
        soma_peso_kg: Number(kpisRow.soma_peso_kg ?? 0),
        soma_cubagem_m3: Number(kpisRow.soma_cubagem_m3 ?? 0),
        soma_frete_contratado: Number(kpisRow.soma_frete_contratado ?? 0),
      }
    : null;

  const carriers: CarrierRow[] = ((carriersRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    transportadora: String(r.transportadora),
    n_romaneios: Number(r.n_romaneios ?? 0),
    n_pedidos: Number(r.n_pedidos ?? 0),
    soma_volumes: Number(r.soma_volumes ?? 0),
    soma_peso_kg: Number(r.soma_peso_kg ?? 0),
    soma_cubagem_m3: Number(r.soma_cubagem_m3 ?? 0),
    soma_frete_contratado: Number(r.soma_frete_contratado ?? 0),
    frete_minimo_observado: r.frete_minimo_observado == null ? null : Number(r.frete_minimo_observado),
  }));

  const janelas: JanelaRow[] = ((janelasRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    janela: String(r.janela),
    n_linhas: Number(r.n_linhas ?? 0),
    n_romaneios: Number(r.n_romaneios ?? 0),
    n_pedidos: Number(r.n_pedidos ?? 0),
    soma_peso_kg: Number(r.soma_peso_kg ?? 0),
    soma_cubagem_m3: Number(r.soma_cubagem_m3 ?? 0),
    soma_frete_contratado: Number(r.soma_frete_contratado ?? 0),
  }));

  const janelaCarriers: JanelaCarrierRow[] = ((janelaCarriersRes.data as Record<string, unknown>[]) ?? []).map(
    (r) => ({
      janela: String(r.janela),
      transportadora: String(r.transportadora),
      soma_frete_contratado: Number(r.soma_frete_contratado ?? 0),
    })
  );

  const cidades: CidadeRow[] = ((cidadesRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    cidade: String(r.cidade),
    transportadora: String(r.transportadora),
    n_romaneios: Number(r.n_romaneios ?? 0),
    n_pedidos: Number(r.n_pedidos ?? 0),
    soma_peso_kg: Number(r.soma_peso_kg ?? 0),
    soma_cubagem_m3: Number(r.soma_cubagem_m3 ?? 0),
    soma_frete_contratado: Number(r.soma_frete_contratado ?? 0),
    soma_melhor_cotacao: Number(r.soma_melhor_cotacao ?? 0),
    soma_diferenca_r: Number(r.soma_diferenca_r ?? 0),
    cidade_total_frete: Number(r.cidade_total_frete ?? 0),
  }));

  return { kpis, carriers, janelas, janelaCarriers, cidades };
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtBRLSigned(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v) || v === 0) return "—";
  const s = Math.abs(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  return v > 0 ? `+${s}` : `-${s}`;
}
function fmtNum(v: number | null | undefined, d = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
}

// Classifica a magnitude da diferença sobre o frete DA PRÓPRIA LINHA (não
// sobre a menor cotação, como em /ontem) — regra exata do Artifact de
// referência para a tabela Cidade x Transportadora.
function clsDifSobreFrete(diff: number, frete: number): "" | "good" | "warning" | "serious" | "critical" {
  if (diff <= 0) return "good";
  const pct = frete > 0 ? diff / frete : 0;
  if (pct > 0.15) return "critical";
  if (pct > 0.05) return "serious";
  return "warning";
}

function CarrierDot({ t }: { t: string }) {
  return <span className="carrier-dot" style={{ background: carrierColor(t) }} />;
}

export default async function OperacaoPage() {
  let data: OperacaoData | null = null;
  let erro: string | null = null;
  try {
    data = await getOperacaoData();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  const kpis = data?.kpis ?? null;
  const carriers = data?.carriers ?? [];
  const janelas = data?.janelas ?? [];
  const janelaCarriers = data?.janelaCarriers ?? [];
  const cidades = data?.cidades ?? [];

  const kpiTiles: [string, string, string][] = kpis
    ? [
        ["Romaneios", fmtNum(kpis.n_romaneios), "distintos, toda a base cruzada"],
        ["Pedidos", fmtNum(kpis.n_pedidos), "distintos"],
        ["Volumes", fmtNum(kpis.soma_volumes), "soma de qtd. de volumes"],
        ["Peso real", `${fmtNum(kpis.soma_peso_kg)} kg`, "soma"],
        ["Cubagem", `${fmtNum(kpis.soma_cubagem_m3, 1)} m³`, "soma"],
        ["Frete contratado", fmtBRL(kpis.soma_frete_contratado), "soma"],
      ]
    : [];

  // ---- Distribuição — participação de cada transportadora no frete total ----
  const totalFreteCarriers = carriers.reduce((s, c) => s + c.soma_frete_contratado, 0);
  const top2Share =
    totalFreteCarriers > 0
      ? carriers.slice(0, 2).reduce((s, c) => s + c.soma_frete_contratado, 0) / totalFreteCarriers
      : null;

  // ---- Meio-dia x Tarde ----
  const JANELAS_FIXAS = ["Meio-dia", "Tarde"] as const;
  const janelaByName = new Map(janelas.map((j) => [j.janela, j]));
  const naoInformadaCount = janelas
    .filter((j) => !JANELAS_FIXAS.includes(j.janela as (typeof JANELAS_FIXAS)[number]))
    .reduce((s, j) => s + j.n_linhas, 0);
  function top3DaJanela(janela: string, freteBucket: number) {
    return janelaCarriers
      .filter((jc) => jc.janela === janela)
      .sort((a, b) => b.soma_frete_contratado - a.soma_frete_contratado)
      .slice(0, 3)
      .map((jc) => ({
        transportadora: jc.transportadora,
        frete: jc.soma_frete_contratado,
        pct: freteBucket > 0 ? jc.soma_frete_contratado / freteBucket : null,
      }));
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
            <h1>Operação — Controle Operacional de Carregamento</h1>
            <p>
              Quem está carregando, quando (Meio-dia × Tarde) e em quais cidades — agregado sobre{" "}
              <b>toda a base de contratações cruzadas a uma cotação</b> (sem filtro de dia, sem filtro
              global nesta etapa da migração).
            </p>
            <nav className="crumbs">
              <Link href="/">← Visão Geral</Link> · <Link href="/ontem">Ontem</Link>
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
        ) : !kpis ? (
          <div className="status-banner">Sem contratações cruzadas a uma cotação nos dados atuais.</div>
        ) : (
          <>
            <section className="bloc" style={{ marginTop: 0 }}>
              <div className="op-note" style={{ marginBottom: 16 }}>
                Toda a base cruzada &middot; <b>{fmtNum(kpis.n_pedidos)}</b> pedidos &middot;{" "}
                <b>{fmtNum(kpis.n_romaneios)}</b> romaneios &middot; <b>{fmtBRL(kpis.soma_frete_contratado)}</b>{" "}
                em frete contratado
              </div>
              <div className="grid op-kpis">
                {kpiTiles.map(([l, v, f]) => (
                  <div className="card kpi" key={l}>
                    <div className="lbl">{l}</div>
                    <div className="val">{v}</div>
                    <div className="foot">{f}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bloc">
              <div className="bloc-head">
                <h2>Quem está carregando</h2>
                <div className="desc">1 linha por transportadora contratada, ordenado por frete contratado desc</div>
              </div>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Transportadora</th>
                      <th className="num">Romaneios</th>
                      <th className="num">Pedidos</th>
                      <th className="num">Volumes</th>
                      <th className="num">Peso (kg)</th>
                      <th className="num">Cubagem (m³)</th>
                      <th className="num">Frete contratado</th>
                      <th className="num">Frete mín.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carriers.map((c) => (
                      <tr key={c.transportadora}>
                        <td>
                          <CarrierDot t={c.transportadora} /> {c.transportadora}
                        </td>
                        <td className="num">{fmtNum(c.n_romaneios)}</td>
                        <td className="num">{fmtNum(c.n_pedidos)}</td>
                        <td className="num">{fmtNum(c.soma_volumes)}</td>
                        <td className="num">{fmtNum(c.soma_peso_kg)}</td>
                        <td className="num">{fmtNum(c.soma_cubagem_m3, 1)}</td>
                        <td className="num">{fmtBRL(c.soma_frete_contratado)}</td>
                        <td className="num">
                          {c.frete_minimo_observado == null ? (
                            <span style={{ color: "var(--text-muted)" }}>Sem parâmetro</span>
                          ) : (
                            <>
                              {fmtBRL(c.frete_minimo_observado)}{" "}
                              <span className="pill sc" title="Piso observado estatisticamente — ESTIMATIVA, não tabela oficial">
                                · obs.
                              </span>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                &quot;Frete mín.&quot; = piso OBSERVADO na base (ESTIMATIVA estatística, não a tabela oficial da
                transportadora — ver <code>docs/frete-minimo-observado-2026-09.md</code>). Sem selo &quot;·
                obs.&quot; = sem parâmetro disponível ainda.
              </div>
            </section>

            <section className="bloc">
              <div className="bloc-head">
                <h2>Distribuição do frete contratado</h2>
                <div className="desc">participação de cada transportadora no total contratado (toda a base cruzada)</div>
              </div>
              <div className="card">
                <div className="dist-bar">
                  {carriers.map((c) => {
                    const pct = totalFreteCarriers > 0 ? c.soma_frete_contratado / totalFreteCarriers : 0;
                    return (
                      <span
                        key={c.transportadora}
                        style={{ width: `${pct * 100}%`, background: carrierColor(c.transportadora) }}
                        title={`${c.transportadora}: ${fmtPct(pct)}`}
                      />
                    );
                  })}
                </div>
                <div className="dist-legend">
                  {carriers.map((c) => {
                    const pct = totalFreteCarriers > 0 ? c.soma_frete_contratado / totalFreteCarriers : 0;
                    return (
                      <div className="item" key={c.transportadora}>
                        <CarrierDot t={c.transportadora} />
                        {c.transportadora} &middot; {fmtPct(pct)}
                      </div>
                    );
                  })}
                </div>
                {top2Share != null && (
                  <div className="foot" style={{ marginTop: 10 }}>
                    As 2 maiores transportadoras por frete ({carriers[0]?.transportadora} +{" "}
                    {carriers[1]?.transportadora}) somam <b>{fmtPct(top2Share)}</b> do frete contratado total.
                  </div>
                )}
              </div>
            </section>

            <section className="bloc">
              <div className="bloc-head">
                <h2>Meio-dia × Tarde</h2>
                <div className="desc">janela de contratação — toda a base cruzada, agrupada em 2 baldes fixos</div>
              </div>
              <div className="grid cols-auto">
                {JANELAS_FIXAS.map((jname) => {
                  const j = janelaByName.get(jname);
                  const top3 = j ? top3DaJanela(jname, j.soma_frete_contratado) : [];
                  return (
                    <div className="card" key={jname}>
                      <h3>{jname}</h3>
                      <div className="sub">
                        {j ? `${fmtNum(j.n_linhas)} contratações` : "sem contratações"}
                      </div>
                      {j ? (
                        <>
                          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                            <div>
                              <div className="lbl" style={{ fontSize: 10.5 }}>
                                Romaneios
                              </div>
                              <div className="val mono" style={{ fontSize: 16 }}>
                                {fmtNum(j.n_romaneios)}
                              </div>
                            </div>
                            <div>
                              <div className="lbl" style={{ fontSize: 10.5 }}>
                                Pedidos
                              </div>
                              <div className="val mono" style={{ fontSize: 16 }}>
                                {fmtNum(j.n_pedidos)}
                              </div>
                            </div>
                            <div>
                              <div className="lbl" style={{ fontSize: 10.5 }}>
                                Peso (kg)
                              </div>
                              <div className="val mono" style={{ fontSize: 16 }}>
                                {fmtNum(j.soma_peso_kg)}
                              </div>
                            </div>
                            <div>
                              <div className="lbl" style={{ fontSize: 10.5 }}>
                                Cubagem (m³)
                              </div>
                              <div className="val mono" style={{ fontSize: 16 }}>
                                {fmtNum(j.soma_cubagem_m3, 1)}
                              </div>
                            </div>
                          </div>
                          <div className="foot" style={{ marginBottom: 4 }}>
                            Frete contratado: <b>{fmtBRL(j.soma_frete_contratado)}</b>
                          </div>
                          {top3.map((t) => (
                            <div className="window-carrier-row" key={t.transportadora}>
                              <span className="name">
                                <CarrierDot t={t.transportadora} /> {t.transportadora}
                              </span>
                              <span className="bar">
                                <span
                                  style={{
                                    width: `${(t.pct ?? 0) * 100}%`,
                                    background: carrierColor(t.transportadora),
                                  }}
                                />
                              </span>
                              <span className="pct">{fmtPct(t.pct)}</span>
                            </div>
                          ))}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {naoInformadaCount > 0 && (
                <div className="foot" style={{ marginTop: 10 }}>
                  {fmtNum(naoInformadaCount)} contratações com janela não informada (fora dos 2 baldes acima).
                </div>
              )}
            </section>

            <section className="bloc">
              <div className="bloc-head">
                <h2>Cidade × Transportadora</h2>
                <div className="desc">
                  top 15 cidades por frete contratado total &middot; cor da diferença classifica a magnitude sobre o
                  frete da própria linha, não julga a decisão
                </div>
              </div>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Cidade</th>
                      <th>Transportadora</th>
                      <th className="num">Romaneios</th>
                      <th className="num">Pedidos</th>
                      <th className="num">Peso (kg)</th>
                      <th className="num">Cubagem (m³)</th>
                      <th className="num">Frete contratado</th>
                      <th className="num">Menor cotação</th>
                      <th className="num">Diferença</th>
                      <th className="num">% participação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cidades.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ color: "var(--text-muted)" }}>
                          Sem dados.
                        </td>
                      </tr>
                    ) : (
                      cidades.map((r, i) => {
                        const cls = clsDifSobreFrete(r.soma_diferenca_r, r.soma_frete_contratado);
                        const style = cls ? { color: `var(--${cls})`, fontWeight: 700 } : undefined;
                        const pctPart =
                          r.cidade_total_frete > 0 ? r.soma_frete_contratado / r.cidade_total_frete : null;
                        return (
                          <tr key={`${r.cidade}-${r.transportadora}-${i}`}>
                            <td>{r.cidade}</td>
                            <td>
                              <CarrierDot t={r.transportadora} /> {r.transportadora}
                            </td>
                            <td className="num">{fmtNum(r.n_romaneios)}</td>
                            <td className="num">{fmtNum(r.n_pedidos)}</td>
                            <td className="num">{fmtNum(r.soma_peso_kg)}</td>
                            <td className="num">{fmtNum(r.soma_cubagem_m3, 1)}</td>
                            <td className="num">{fmtBRL(r.soma_frete_contratado)}</td>
                            <td className="num">{r.soma_melhor_cotacao === 0 ? "—" : fmtBRL(r.soma_melhor_cotacao)}</td>
                            <td className="num" style={style}>
                              {fmtBRLSigned(r.soma_diferenca_r)}
                            </td>
                            <td className="num">{fmtPct(pctPart)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
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
