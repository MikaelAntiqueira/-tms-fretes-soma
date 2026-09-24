"use client";

import { useMemo, useState } from "react";
import { PrintButton } from "./PrintButton";
import { fmtBRL, fmtPct, clsDif, EscPill } from "@/lib/format";
import type { OntemLinha } from "./page";

// [Pedido do Mikael, 2026-09-24] Filtro Público/Privado ao lado do título
// "Todas as contratações do dia" — client-side puro sobre `linhas` (já
// vieram todas do servidor), sem RPC nova: nenhum marcado = mostra tudo
// (comportamento anterior preservado), um ou os dois marcados restringe.
// Extraído pra Client Component só por causa do estado dos checkboxes —
// mesmo motivo de RomaneioSimulador/OportunidadesTabsClient (Server
// Component não pode ter state/onChange).
//
// [FIX 2026-09-24] A prop com a data do dia era chamada `ref` na primeira
// versão — nome reservado do React (usado para a passagem de refs entre
// componentes), o que quebrou a hidratação em produção e fez a seção
// inteira sumir da página (React error #418/#441). Renomeada para `dia`.
export function ContratacoesTable({ linhas, dia }: { linhas: OntemLinha[]; dia: string }) {
  const [publico, setPublico] = useState(false);
  const [privado, setPrivado] = useState(false);

  const linhasFiltradas = useMemo(() => {
    if (!publico && !privado) return linhas;
    return linhas.filter((r) => {
      if (publico && r.tipo_cliente === "Publico") return true;
      if (privado && r.tipo_cliente === "Privado") return true;
      return false;
    });
  }, [linhas, publico, privado]);

  return (
    <section className="bloc">
      <div className="bloc-head">
        <div className="bloc-head-text">
          <h2>Todas as contratações do dia</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-muted)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
              <input type="checkbox" checked={publico} onChange={(e) => setPublico(e.target.checked)} /> Público
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
              <input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} /> Privado
            </label>
          </div>
        </div>
        {/* [Pedido do Mikael, 2026-09-21] "Baixar CSV" (todas as
            notas do dia, sem filtro, via /ontem/csv) e "Baixar PDF"
            (window.print(), sem lib nova — Opção A). `no-print`
            esconde os dois botões quando a impressão de fato
            acontece. O filtro Público/Privado acima NÃO afeta o CSV
            (mantém "todas as notas, sem filtro" como já rotulado) — o
            PDF é window.print() da página, então imprime só o que está
            visível na tabela filtrada. */}
        <div className="export-actions no-print">
          <a href={`/ontem/csv?dia=${dia}`} className="export-link-btn">
            Baixar CSV (todas as notas, sem filtro)
          </a>
          <PrintButton />
        </div>
      </div>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Romaneio</th>
              <th>Cliente</th>
              <th>Cidade</th>
              <th>Transportadora</th>
              <th className="num">Frete pago</th>
              <th className="num">Menor cotação</th>
              <th className="num">Diferença R$</th>
              <th className="num">Diferença %</th>
              <th>Escolheu a + barata?</th>
              <th>Janela</th>
              <th>Endereço de entrega</th>
              <th>NF</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={13} style={{ color: "var(--text-muted)" }}>
                  {linhas.length === 0 ? "Sem contratações neste dia." : "Nenhuma contratação para o filtro selecionado."}
                </td>
              </tr>
            ) : (
              linhasFiltradas.map((r, i) => {
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
                    <td>{r.endereco_entrega ?? "—"}</td>
                    <td>{r.nf ?? "—"}</td>
                    <td>{r.tipo_cliente === "Publico" ? "Público" : r.tipo_cliente === "Privado" ? "Privado" : "—"}</td>
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
  );
}
