"use client";

import { useState } from "react";
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format";

// Simulador de Frete por Romaneio — ver
// docs/superpowers/specs/2026-09-22-simulador-frete-romaneio-design.md.
// Client Component "burro": recebe via prop os dados do dia já carregados
// no servidor (mesmo padrão de drill-down dos cards D3/D4 do Radar) — nunca
// faz fetch próprio, então trocar de romaneio ou expandir um pedido não gera
// nenhuma chamada de rede nova.

export interface OfertaSimulada {
  transportadora_id: string;
  transportadora: string | null;
  preco_final: number;
  prazo_dias: number | null;
}

export interface PedidoSimulado {
  cotacao_id: string;
  pedido: string | null;
  nf: string | null;
  cliente: string | null;
  cidade: string | null;
  contratada_transportadora_id: string | null;
  contratada_transportadora: string | null;
  contratada_valor: number;
  ofertas: OfertaSimulada[];
}

export interface RomaneioSimuladorRow {
  romaneio: string;
  n_pedidos: number;
  pedidos: PedidoSimulado[];
}

function OfertaTableRow({ o, contratada, maisBarata }: { o: OfertaSimulada; contratada: boolean; maisBarata: boolean }) {
  return (
    <tr className={contratada ? "sim-ped-contratada" : undefined}>
      <td>{o.transportadora ?? "—"}</td>
      <td className="num">{fmtBRL(o.preco_final)}</td>
      <td className="num">{o.prazo_dias != null ? `${fmtNum(o.prazo_dias)}d` : "—"}</td>
      <td>
        {contratada && <span className="pill azul">Contratada</span>}{" "}
        {maisBarata && <span className="pill s">Mais barata</span>}
      </td>
    </tr>
  );
}

// Card por pedido (2026-09-23, pedido do Mikael): antes era um <details>
// recolhido com uma tabela compacta dentro; virou um card sempre aberto,
// estilo Visão Geral (borda colorida à esquerda), com a tabela COMPLETA de
// ofertas sempre visível — a comparação de preço é a informação principal
// da tela, não deveria exigir clique nenhum pra aparecer.
function PedidoRow({ p }: { p: PedidoSimulado }) {
  const maisBarataPreco = p.ofertas[0]?.preco_final ?? null;
  const diff = maisBarataPreco != null ? p.contratada_valor - maisBarataPreco : null;
  const diffFrac = diff != null && maisBarataPreco ? diff / maisBarataPreco : null;

  return (
    <div className="sim-ped-card">
      <div className="sim-ped-head">
        <div>
          <div className="sim-ped-nf">NF {p.nf ?? "—"} · Pedido {p.pedido ?? "—"}</div>
          <div className="sim-ped-cliente">
            {p.cliente ?? "—"} · {p.cidade ?? "—"}
          </div>
        </div>
        <div className="sim-ped-valor-row">
          <div style={{ textAlign: "right" }}>
            <span className="sim-ped-valor mono">{fmtBRL(p.contratada_valor)}</span>
            <div className="sim-ped-transp">{p.contratada_transportadora ?? "transportadora não identificada"}</div>
          </div>
          {diff != null && (
            <span className={`sim-ped-diff ${diff > 0 ? "bad" : "ok"}`}>
              {diff === 0
                ? "mais barata"
                : `${diff > 0 ? "+" : ""}${fmtBRL(diff)}${diffFrac != null ? ` (${fmtPct(diffFrac)})` : ""}`}
            </span>
          )}
        </div>
      </div>
      {p.ofertas.length === 0 ? (
        <div className="sim-empty" style={{ padding: 8 }}>
          Sem cotações concorrentes registradas para este pedido.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data compact">
            <thead>
              <tr>
                <th>Transportadora</th>
                <th className="num">Preço cotado</th>
                <th className="num">Prazo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {p.ofertas.map((o, i) => (
                <OfertaTableRow
                  o={o}
                  contratada={o.transportadora_id === p.contratada_transportadora_id}
                  maisBarata={i === 0}
                  key={`${o.transportadora_id}-${i}`}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function RomaneioSimulador({ data }: { data: RomaneioSimuladorRow[] }) {
  const [romaneioSel, setRomaneioSel] = useState<string>(data[0]?.romaneio ?? "");

  if (data.length === 0) return null;

  const atual = data.find((r) => r.romaneio === romaneioSel) ?? data[0];

  return (
    <section className="bloc">
      <div className="bloc-head">
        <h2>Simulador de Frete por Romaneio</h2>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <label htmlFor="sim-romaneio-select" style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
          Romaneio:
        </label>
        <select
          id="sim-romaneio-select"
          value={atual.romaneio}
          onChange={(e) => setRomaneioSel(e.target.value)}
          style={{
            padding: "6px 8px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
            backgroundColor: "var(--surface-card)",
            color: "var(--text-primary)",
          }}
        >
          {data.map((r) => (
            <option key={r.romaneio} value={r.romaneio}>
              {r.romaneio} ({r.n_pedidos} pedido{r.n_pedidos === 1 ? "" : "s"})
            </option>
          ))}
        </select>
      </div>
      <div className="sim-ped-list">
        {atual.pedidos.map((p) => (
          <PedidoRow p={p} key={p.cotacao_id} />
        ))}
      </div>
    </section>
  );
}
