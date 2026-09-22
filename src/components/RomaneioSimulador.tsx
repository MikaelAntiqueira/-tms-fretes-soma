"use client";

import { useState } from "react";
import { fmtBRL, fmtNum } from "@/lib/format";

// Simulador de Frete por Romaneio — ver
// docs/superpowers/specs/2026-09-22-simulador-frete-romaneio-design.md.
// Client Component "burro": recebe via prop os dados do dia já carregados
// no servidor (mesmo padrão de drill-down dos cards D3/D4 do Radar) — nunca
// faz fetch próprio, então trocar de romaneio ou expandir um pedido não gera
// nenhuma chamada de rede nova.

export interface OfertaSimulada {
  transportadora_id: number;
  transportadora: string | null;
  preco_final: number;
  prazo_dias: number | null;
}

export interface PedidoSimulado {
  cotacao_id: number;
  pedido: string | null;
  nf: string | null;
  cliente: string | null;
  cidade: string | null;
  contratada_transportadora_id: number | null;
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
    <tr>
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

function PedidoRow({ p }: { p: PedidoSimulado }) {
  return (
    <details className="sim-pedido">
      <summary style={{ cursor: "pointer" }}>
        <span style={{ fontWeight: 700 }}>{p.pedido ?? "—"}</span>
        {" · "}NF {p.nf ?? "—"} · {p.cliente ?? "—"} · {p.cidade ?? "—"}
        {" · "}
        <span className="mono">{fmtBRL(p.contratada_valor)}</span> ({p.contratada_transportadora ?? "—"})
      </summary>
      <div className="table-scroll" style={{ marginTop: 6 }}>
        {p.ofertas.length === 0 ? (
          <div className="sim-empty" style={{ padding: 8 }}>
            Sem cotações concorrentes registradas para este pedido.
          </div>
        ) : (
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
        )}
      </div>
    </details>
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
      <div style={{ marginTop: 8 }}>
        {atual.pedidos.map((p) => (
          <PedidoRow p={p} key={p.cotacao_id} />
        ))}
      </div>
    </section>
  );
}
