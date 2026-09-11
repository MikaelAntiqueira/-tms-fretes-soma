import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ThemeToggle } from "@/components/ThemeToggle";

// Página "Ontem" (D-1) — decisões de contratação do dia mais recente com
// contratação cruzada a uma cotação. Porta, linha a linha, a lógica de
// `renderOntem()` / `coverageStatus()` do Artifact original (v40) — ver
// `docs/mapa-migracao-tms-v3-2026-09-11.md` e `memoria/05_DICIONARIO_KPIS.md`
// (KPI-16, KPI-18/D7). Toda soma/contagem é feita dentro do banco via RPC
// (`ontem_dia_referencia`, `ontem_kpis`, `ontem_contratacoes`,
// `ontem_cobertura` — migration `fn_ontem_view_e_funcoes`), nunca somando
// linhas cruas no cliente.
export const dynamic = "force-dynamic";

interface OntemKpis {
  n_contratacoes: number;
  n_romaneios: number;
  frete_contratado: number;
  diferenca_pos_sum: number;
  n_escolheu_sim: number;
  n_escolheu_nao: number;
  n_sem_comparacao: number;
  perda_nao_escolheu: number;
  n_comparaveis: number;
}

interface OntemLinha {
  romaneio: string | null;
  cliente: string | null;
  cidade: string | null;
  transportadora: string | null;
  frete_contratado: number;
  melhor_cotacao: number | null;
  diferenca_r: number | null;
  diferenca_pct: number | null;
  escolheu: "S" | "N" | "SC";
  janela: string | null;
}

interface OntemCobertura {
  m_dia: number;
  n_dia: number;
  pct_dia: number | null;
  m_prev: number;
  n_prev: number;
  pct_prev: number | null;
  amostra_insuficiente: boolean;
  baixa: boolean | null;
}

interface OntemData {
  ref: string | null;
  kpis: OntemKpis | null;
  linhas: OntemLinha[];
  cobertura: OntemCobertura | null;
}

async function getOntemData(): Promise<OntemData> {
  const refRes = await supabase.rpc("ontem_dia_referencia");
  if (refRes.error) throw new Error(refRes.error.message);
  const ref = (refRes.data as string | null) ?? null;

  if (!ref) {
    return { ref: null, kpis: null, linhas: [], cobertura: null };
  }

  const [kpisRes, linhasRes, coberturaRes] = await Promise.all([
    supabase.rpc("ontem_kpis", { p_dia: ref }),
    supabase.rpc("ontem_contratacoes", { p_dia: ref }),
    supabase.rpc("ontem_cobertura", { p_dia: ref }),
  ]);
  for (const res of [kpisRes, linhasRes, coberturaRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const kpisRow = (kpisRes.data as Record<string, unknown>[])?.[0];
  const coberturaRow = (coberturaRes.data as Record<string, unknown>[])?.[0];

  const kpis: OntemKpis | null = kpisRow
    ? {
        n_contratacoes: Number(kpisRow.n_contratacoes ?? 0),
        n_romaneios: Number(kpisRow.n_romaneios ?? 0),
        frete_contratado: Number(kpisRow.frete_contratado ?? 0),
        diferenca_pos_sum: Number(kpisRow.diferenca_pos_sum ?? 0),
        n_escolheu_sim: Number(kpisRow.n_escolheu_sim ?? 0),
        n_escolheu_nao: Number(kpisRow.n_escolheu_nao ?? 0),
        n_sem_comparacao: Number(kpisRow.n_sem_comparacao ?? 0),
        perda_nao_escolheu: Number(kpisRow.perda_nao_escolheu ?? 0),
        n_comparaveis: Number(kpisRow.n_comparaveis ?? 0),
      }
    : null;

  const linhas: OntemLinha[] = ((linhasRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    romaneio: (r.romaneio as string) ?? null,
    cliente: (r.cliente as string) ?? null,
    cidade: (r.cidade as string) ?? null,
    transportadora: (r.transportadora as string) ?? null,
    frete_contratado: Number(r.frete_contratado ?? 0),
    melhor_cotacao: r.melhor_cotacao == null ? null : Number(r.melhor_cotacao),
    diferenca_r: r.diferenca_r == null ? null : Number(r.diferenca_r),
    diferenca_pct: r.diferenca_pct == null ? null : Number(r.diferenca_pct),
    escolheu: r.escolheu as "S" | "N" | "SC",
    janela: (r.janela as string) ?? null,
  }));

  const cobertura: OntemCobertura | null = coberturaRow
    ? {
        m_dia: Number(coberturaRow.m_dia ?? 0),
        n_dia: Number(coberturaRow.n_dia ?? 0),
        pct_dia: coberturaRow.pct_dia == null ? null : Number(coberturaRow.pct_dia),
        m_prev: Number(coberturaRow.m_prev ?? 0),
        n_prev: Number(coberturaRow.n_prev ?? 0),
        pct_prev: coberturaRow.pct_prev == null ? null : Number(coberturaRow.pct_prev),
        amostra_insuficiente: Boolean(coberturaRow.amostra_insuficiente),
        baixa: coberturaRow.baixa == null ? null : Boolean(coberturaRow.baixa),
      }
    : null;

  return { ref, kpis, linhas, cobertura };
}

// ---- formatação — reproduz fmtBRL/fmtPct/fmtNum/fmtDate do Artifact original
// (mesma locale pt-BR, mesmas casas decimais), para não deslocar nenhum
// número por causa de arredondamento diferente entre JS e o Artifact. ----
function fmtBRL(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtNum(v: number | null | undefined, d = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Mesma classificação de cor da célula de diferença do Artifact original
// (`clsDif`): nunca classifica a decisão, só a magnitude da diferença %.
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

function CoberturaNote({ c }: { c: OntemCobertura | null }) {
  if (!c || c.amostra_insuficiente) return null;
  const baixa = Boolean(c.baixa);
  const txt =
    `Cobertura do dia: <b>${fmtPct(c.pct_dia)}</b> (${fmtNum(c.n_dia)} de ${fmtNum(c.m_dia)} comparáveis)` +
    (c.m_prev ? ` · média dos 30 dias anteriores: ${fmtPct(c.pct_prev)}` : "") +
    (baixa
      ? " — poucas cotações pra comparar hoje; confira o pipeline (D7)."
      : " — dentro do padrão (D7).");
  return (
    <div
      className={`cov-note${baixa ? "" : " ok"}`}
      style={{ margin: 0 }}
      dangerouslySetInnerHTML={{ __html: (baixa ? "⚠ " : "✓ ") + txt }}
    />
  );
}

export default async function OntemPage() {
  let data: OntemData | null = null;
  let erro: string | null = null;
  try {
    data = await getOntemData();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  const kpis = data?.kpis;
  const ref = data?.ref ?? null;
  const linhas = data?.linhas ?? [];
  const cobertura = data?.cobertura ?? null;

  const pctBarata =
    kpis && kpis.n_escolheu_sim + kpis.n_escolheu_nao > 0
      ? kpis.n_escolheu_sim / (kpis.n_escolheu_sim + kpis.n_escolheu_nao)
      : null;

  const kpiTiles: [string, string, string][] = kpis
    ? [
        ["Contratações", fmtNum(kpis.n_contratacoes), `${fmtNum(kpis.n_romaneios)} romaneios`],
        ["Frete contratado", fmtBRL(kpis.frete_contratado), "soma do dia"],
        ["Diferença vs. menor cotação", fmtBRL(kpis.diferenca_pos_sum), "só diferenças positivas"],
        [
          "Escolheu a mais barata",
          pctBarata == null ? "—" : fmtPct(pctBarata),
          `${fmtNum(kpis.n_escolheu_sim)} de ${fmtNum(kpis.n_escolheu_sim + kpis.n_escolheu_nao)} comparáveis`,
        ],
        [
          "Não escolheu a mais barata",
          fmtNum(kpis.n_escolheu_nao),
          `${fmtBRL(kpis.perda_nao_escolheu)} de diferença`,
        ],
        ["Sem comparação", fmtNum(kpis.n_sem_comparacao), "contratação sem cotação registrada"],
      ]
    : [];

  const comCmp = kpis?.n_comparaveis ?? 0;
  const totalDia = kpis?.n_contratacoes ?? 0;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
            <h1>Ontem — decisões de contratação</h1>
            <p>
              Fechamento do último dia com contratações cruzadas a uma cotação — os mesmos
              indicadores e a mesma tabela da página &quot;Ontem&quot; do Artifact atual, agora lendo
              direto do Supabase.
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
        ) : !ref ? (
          <div className="status-banner">Sem contratações cruzadas a uma cotação nos dados atuais.</div>
        ) : (
          <>
            <section className="bloc" style={{ marginTop: 0 }}>
              <div className="bloc-head" style={{ alignItems: "center" }}>
                <h2>Ontem — decisões de contratação</h2>
              </div>
              <div className="op-note" style={{ marginBottom: 16 }}>
                Decisões de <b>{fmtDate(ref)}</b> &middot; {fmtNum(totalDia)} contratações &middot;{" "}
                {fmtNum(comCmp)} de {fmtNum(totalDia)} com cotação para comparar (
                {fmtPct(totalDia ? comCmp / totalDia : 0)})
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
                <h2>Radar de Decisão</h2>
                <div className="desc">
                  poucas situações que merecem atenção — cada card diz o que fazer, e apresenta
                  evidência (não acusa erro)
                </div>
              </div>
              <CoberturaNote c={cobertura} />
              <div className="card">
                <h3>Detectores D2/D3/D4/D6 — pendente nesta etapa</h3>
                <div className="sub">
                  Oportunidade a verificar, Recorrência, Concentração e Anomalia de Preço dependem de
                  janelas históricas (60/30 dias), faixas de peso/cubagem e prazo histórico por
                  transportadora que ainda não foram portados com a mesma fidelidade da tabela acima —
                  ver relatório desta etapa. A faixa de cobertura (D7) acima já está ativa.
                </div>
                <div className="alert-card info">
                  <ul>
                    <li>
                      <span className="name">Oportunidade objetiva (prazo + prestação iguais)</span>
                      <span className="num" style={{ color: "var(--text-muted)" }}>
                        aguarda prazo e prestação por oferta (TMS/API)
                      </span>
                    </li>
                    <li>
                      <span className="name">Frete mínimo fora do parâmetro</span>
                      <span className="num" style={{ color: "var(--text-muted)" }}>
                        aguarda os valores por transportadora (gestão)
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="bloc">
              <div className="bloc-head">
                <h2>Todas as contratações do dia</h2>
                <div className="desc">ordenado pela diferença em R$ — cor classifica a faixa, não julga a decisão</div>
              </div>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Romaneio</th>
                      <th>Cliente</th>
                      <th>Cidade</th>
                      <th>Transportadora contratada</th>
                      <th className="num">Frete pago</th>
                      <th className="num">Menor cotação</th>
                      <th className="num">Diferença R$</th>
                      <th className="num">Diferença %</th>
                      <th>Escolheu a + barata?</th>
                      <th>Janela</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ color: "var(--text-muted)" }}>
                          Sem contratações neste dia.
                        </td>
                      </tr>
                    ) : (
                      linhas.map((r, i) => {
                        const cls = clsDif(r.diferenca_r, r.diferenca_pct);
                        const style = cls ? { color: `var(--${cls})`, fontWeight: 700 } : undefined;
                        return (
                          <tr key={i}>
                            <td>{r.romaneio ?? "—"}</td>
                            <td>{r.cliente ?? "—"}</td>
                            <td>{r.cidade ?? "—"}</td>
                            <td>{r.transportadora ?? "—"}</td>
                            <td className="num">{fmtBRL(r.frete_contratado)}</td>
                            <td className="num">{fmtBRL(r.melhor_cotacao)}</td>
                            <td className="num" style={style}>
                              {r.diferenca_r == null ? "—" : fmtBRL(r.diferenca_r)}
                            </td>
                            <td className="num" style={style}>
                              {r.diferenca_pct == null ? "—" : fmtPct(r.diferenca_pct)}
                            </td>
                            <td>
                              <EscPill e={r.escolheu} />
                            </td>
                            <td>{r.janela ?? "—"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                &quot;Tempo real&quot; = fechamento do dia (D-1). O dia mostrado é o{" "}
                <b>último com contratações cruzadas</b> nos dados — enquanto o robô diário do
                relatório &quot;Contratados&quot; não estiver ligado, pode ficar alguns dias atrás (a
                cobertura de cruzamento cotação↔contratação é ~1/3 da operação — limitação da fonte,
                não desta tela).
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
