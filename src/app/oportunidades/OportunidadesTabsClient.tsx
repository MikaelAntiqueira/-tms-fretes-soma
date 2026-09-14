"use client";

import { useState } from "react";
import type { ComparacaoRow } from "./page";

// Componente de tabs (client-side state para alternar entre abas)
function OportunidadesTabsClient({
  rows,
  classificacaoRows,
  totalCotacoes,
  colors,
  classifOrder,
}: {
  rows: ComparacaoRow[];
  classificacaoRows: ComparacaoRow[];
  totalCotacoes: number;
  colors: Record<string, string>;
  classifOrder: string[];
}) {
  const [activeTab, setActiveTab] = useState<"classificacao" | "clientes">("classificacao");

  const verdeCount = rows.filter((r) => r.classif === "verde").length;
  const vermelhoCount = rows.filter((r) => r.classif === "vermelho").length;
  const laranjaCount = rows.filter((r) => r.classif === "laranja").length;
  const azulCount = rows.filter((r) => r.classif === "azul").length;
  const alertaCount = rows.filter((r) => r.classif === "alerta").length;

  // Agrupamento por cliente (aba Clientes Prioritários)
  const clienteMap = new Map<string, {
    nome: string;
    regiao: string;
    tipo: string;
    qtd: number;
    diffTotal: number;
    diffMedio: number | null;
    escS: number;
    escN: number;
    escSC: number;
    comRiscoPrazo: number;
    comOportunidadePrazo: number;
  }>();

  for (const r of rows) {
    const key = r.cnpj_cliente || r.cliente_nome;
    const entry = clienteMap.get(key) ?? {
      nome: r.cliente_nome,
      regiao: r.regiao_normalizada,
      tipo: r.tipo_cliente,
      qtd: 0,
      diffTotal: 0,
      diffMedio: null,
      escS: 0,
      escN: 0,
      escSC: 0,
      comRiscoPrazo: 0,
      comOportunidadePrazo: 0,
    };
    entry.qtd += 1;
    entry.diffTotal += r.diffR ?? 0;
    entry.escS += r.esc === "S" ? 1 : 0;
    entry.escN += r.esc === "N" ? 1 : 0;
    entry.escSC += r.esc === "SC" ? 1 : 0;
    entry.comRiscoPrazo += r.risco_prazo_alt ? 1 : 0;
    entry.comOportunidadePrazo += r.oportunidade_prazo ? 1 : 0;
    clienteMap.set(key, entry);
  }

  const clientesSorted = [...clienteMap.values()]
    .filter((c) => c.diffTotal > 0)
    .sort((a, b) => b.diffTotal - a.diffTotal);

  const total = rows.length;

  return (
    <>
      {/* ── Barra de tabs ─────────────────────────────────────────── */}
      <div className="subnav" style={{ marginTop: 16 }}>
        <button
          className={`tab-btn${activeTab === "classificacao" ? " active" : ""}`}
          onClick={() => setActiveTab("classificacao")}
        >
          Classificação
        </button>
        <button
          className={`tab-btn${activeTab === "clientes" ? " active" : ""}`}
          onClick={() => setActiveTab("clientes")}
        >
          Clientes Prioritários
        </button>
      </div>

      {/* ── Conteúdo da aba ativa ──────────────────────────────────── */}
      <div className="subpage-content">
        {activeTab === "classificacao" && (
          <>
            {/* Doughnut de classificação (tabela + legenda, sem Chart.js neste estágio) */}
            <section className="bloc" style={{ marginTop: 8 }}>
              <div className="bloc-head">
                <h2>Classificação por impacto</h2>
                <div className="desc">🟢 = mais barata · 🔵 = baixo · 🟠 = médio · 🔴 = alto · ⚠️ = amostra insuficiente</div>
              </div>
              <div className="grid cols2-even">
                {/* Resumo por classificação */}
                <div className="card">
                  <h3>Contagem por classificação</h3>
                  <table className="data" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>Classificação</th>
                        <th className="num">Qtd</th>
                        <th className="num">% total</th>
                        <th className="num">Dif. total (R$)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classifOrder.map((c) => {
                        const count = c === "vermelho" ? vermelhoCount
                          : c === "laranja" ? laranjaCount
                          : c === "azul" ? azulCount
                          : c === "verde" ? verdeCount
                          : alertaCount;
                        const pct = total > 0 ? (count / total) * 100 : 0;
                        const totalDiff = rows
                          .filter((r) => r.classif === c && r.diffR != null && r.diffR > 0)
                          .reduce((s, r) => s + (r.diffR ?? 0), 0);
                        return (
                          <tr key={c}>
                            <td>
                              <span className="classif-badge-sm" style={{ backgroundColor: colors[c] ?? "#9ca3af" }}>
                                {c.charAt(0).toUpperCase() + c.slice(1)}
                              </span>
                            </td>
                            <td className="num">{count}</td>
                            <td className="num">{pct.toFixed(1)}%</td>
                            <td className="num">{totalDiff > 0 ? totalDiff.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Legenda */}
                <div className="card">
                  <h3>Legenda</h3>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { classif: "verde",  label: "Contratada foi a mais barata (esc=S)" },
                      { classif: "azul",   label: "Baixo impacto — diffR ≤ P25 e diffP ≤ P25 do seu grupo" },
                      { classif: "laranja",label: "Médio impacto — entre P25 e P75 do seu grupo" },
                      { classif: "vermelho",label: "Alto impacto — diffR ≥ P75 ou diffP ≥ P75 do seu grupo" },
                      { classif: "alerta", label: "Amostra insuficiente — tipo não Público/Privado" },
                    ].map(({ classif, label }) => (
                      <div key={classif} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: colors[classif] ?? "#9ca3af", flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Tabela de processos classificados (top 50 por diffR) */}
            <section className="bloc" style={{ marginTop: 16 }}>
              <div className="bloc-head">
                <h2>Processos classificados — detalhe</h2>
                <div className="desc">
                  Ordenados por diferença (R$) decrescente — os maiores impactos primeiro.
                </div>
              </div>
              <div className="tabela-pagina">
                <table className="data" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>NF</th>
                      <th>Cliente</th>
                      <th>Transportadora</th>
                      <th className="num">Contrato (R$)</th>
                      <th className="num">Melhor cotação (R$)</th>
                      <th className="num">Diferença (R$)</th>
                      <th className="num">Diferença (%)</th>
                      <th>Classif.</th>
                      <th>Risco prazo</th>
                      <th>Oportunidade prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classificacaoRows.slice(0, 50).map((r, i) => (
                      <tr key={r.contratacao_id}>
                        <td className="num">{i + 1}</td>
                        <td>{r.nf}</td>
                        <td>{r.cliente_nome}</td>
                        <td>{r.transportadora_contratada}</td>
                        <td className="num">{r.valor_frete_contratado?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "—"}</td>
                        <td className="num">{r.melhor_preco?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "—"}</td>
                        <td className="num" style={{ color: "var(--t-red)" }}>
                          {r.diffR != null ? r.diffR.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                        </td>
                        <td className="num">{r.diffP != null ? `${(r.diffP * 100).toFixed(1)}%` : "—"}</td>
                        <td>
                          {r.classif && (
                            <span className="classif-badge-sm" style={{ backgroundColor: colors[r.classif] ?? "#9ca3af" }}>
                              {r.classif.charAt(0).toUpperCase() + r.classif.slice(1)}
                            </span>
                          )}
                        </td>
                        <td>{r.risco_prazo_alt ? "⚠️ Sim" : "—"}</td>
                        <td>{r.oportunidade_prazo ? "✅ Sim" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {classificacaoRows.length > 50 && (
                  <p className="nota-mais-registros" style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                    Mostrando os 50 maiores impactos. Existem{" "}
                    {classificacaoRows.length - 50} registros adicionais — filtre por mês, transportadora ou região
                    para explorar.
                  </p>
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === "clientes" && (
          <section className="bloc" style={{ marginTop: 8 }}>
            <div className="bloc-head">
              <h2>Clientes Prioritários — Maior Impacto</h2>
              <div className="desc">
                Lista de clientes com maior diferença acumulada (R$). Ordenação por impacto total — não por
                número de processos.
              </div>
            </div>
            <div className="tabela-pagina">
              <table className="data" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Região</th>
                    <th className="num">Tipo</th>
                    <th className="num">Qtd processos</th>
                    <th className="num">Diferença total (R$)</th>
                    <th className="num">Diferença média (R$)</th>
                    <th className="num">Escolheu a mais barata</th>
                    <th className="num">Risco prazo</th>
                    <th className="num">Oportunidade prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesSorted.map((c) => (
                    <tr key={c.nome}>
                      <td>{c.nome}</td>
                      <td>{c.regiao}</td>
                      <td className="num">{c.tipo}</td>
                      <td className="num">{c.qtd}</td>
                      <td className="num" style={{ color: "var(--t-red)" }}>{c.diffTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                      <td className="num">{c.diffMedio?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "—"}</td>
                      <td className="num">
                        {c.escS + c.escN > 0
                          ? (c.escS / (c.escS + c.escN) * 100).toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 1 })
                          : "—"}
                      </td>
                      <td className="num">{c.comRiscoPrazo > 0 ? "⚠️ " + c.comRiscoPrazo : "—"}</td>
                      <td className="num">{c.comOportunidadePrazo > 0 ? "✅ " + c.comOportunidadePrazo : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Nota para aba clientes */}
            <div className="cov-note" style={{ marginTop: 12 }}>
              <p>
                <strong>DADO DERIVADO:</strong> "Diferença média" = diferença total ÷ quantidade de processos. Não é
                uma métrica da base — é calculada nesta página para facilitar a priorização.
              </p>
              <p style={{ marginTop: 4 }}>
                <strong>R-E-DAÍ:</strong> um cliente com alta diferença total pode ter poucos processos de alto valor, ou
                muitos de médio valor. A coluna "Qtd processos" ajuda a distinguir os dois casos.
              </p>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

export { OportunidadesTabsClient };
