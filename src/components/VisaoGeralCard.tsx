"use client";

import { useState, type CSSProperties } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { fmtBRL, fmtBRL2, fmtNum, fmtPct, fmtDate } from "@/lib/format";

export interface VisaoGeralCardData {
  transportadoraId: string;
  transportadora: string;
  janela: string;
  colorVar: string; // ex "--t1"
  valorTotal: number;
  nContratacoes: number;
  pesoRealKg: number;
  volumes: number;
  nComVolume: number;
  cubagemM3: number;
  valorDeclarado: number | null;
  ticketMedio: number;
  freteMinimoObservado: number | null;
  nClientesMinimo: number;
  valorMinimo: number | null;
  mes: string;
  dia: string | null;
}

interface ClienteMinimoRow {
  cliente: string;
  cidade: string | null;
  vezes: number;
  valor_total: number;
  notas: string | null;
}

// Card por transportadora × janela na Visão Geral — a pedido da gestão
// (via Mikael, 2026-09-18): 5 números de destaque ("selos") em vez de só o
// valor total — Frete total, Valor das notas, % Frete (frete/valor da
// mercadoria), Custo/kg e Custo/m³. Peso real/Volumes/Ticket médio/Frete
// mínimo (secundários) saíram da face do card e foram pro modal de detalhe,
// que agora abre em QUALQUER transportadora (não só as com piso conhecido)
// — a lista de "N clientes no mínimo" continua só aparecendo dentro dele
// quando a transportadora já tem frete_minimo_observado cadastrado.
export function VisaoGeralCard({ data }: { data: VisaoGeralCardData }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState<ClienteMinimoRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const temMinimo = data.freteMinimoObservado != null;
  const coberturaVolumes = data.nContratacoes > 0 ? data.nComVolume / data.nContratacoes : null;
  const volumesParcial = coberturaVolumes != null && coberturaVolumes < 0.9;

  const percentualFrete =
    data.valorDeclarado != null && data.valorDeclarado > 0 ? data.valorTotal / data.valorDeclarado : null;
  const custoKg = data.pesoRealKg > 0 ? data.valorTotal / data.pesoRealKg : null;
  const custoM3 = data.cubagemM3 > 0 ? data.valorTotal / data.cubagemM3 : null;

  const selos: { label: string; valor: string; variante: "total" | "calculado" }[] = [
    { label: "Frete total", valor: fmtBRL(data.valorTotal), variante: "total" },
    { label: "Valor das notas", valor: fmtBRL(data.valorDeclarado), variante: "total" },
    { label: "% frete", valor: fmtPct(percentualFrete), variante: "calculado" },
    { label: "Custo/kg", valor: fmtBRL2(custoKg), variante: "calculado" },
    { label: "Custo/m³", valor: fmtBRL2(custoM3), variante: "calculado" },
  ];

  async function abrir() {
    setOpen(true);
    if (!temMinimo || clientes || loading) return;
    setLoading(true);
    setErro(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: rows, error } = await supabase.rpc("visao_geral_clientes_minimo", {
        p_mes: data.mes,
        p_transportadora_id: data.transportadoraId,
        p_janela: data.janela,
        ...(data.dia ? { p_dia: data.dia } : {}),
      });
      if (error) throw new Error(error.message);
      setClientes((rows as ClienteMinimoRow[]) ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar o Supabase.");
    } finally {
      setLoading(false);
    }
  }

  const cardStyle = { "--vg-carrier-color": `var(${data.colorVar})` } as CSSProperties;

  return (
    <>
      <div
        className="vg-card"
        style={cardStyle}
        onClick={abrir}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            abrir();
          }
        }}
      >
        <div className="vg-card-name">{data.transportadora}</div>
        <div className="vg-card-selos">
          {selos.map((s) => (
            <div className={`vg-selo vg-selo-${s.variante}`} key={s.label}>
              <span className="vg-selo-label">{s.label}</span>
              <span className="vg-selo-valor">{s.valor}</span>
            </div>
          ))}
        </div>
        <div className="vg-card-minimo">
          ver detalhes{temMinimo ? ` · ${fmtNum(data.nClientesMinimo)} cliente(s) no mínimo` : ""}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </div>
      </div>

      {open && (
        <div className="vg-modal-scrim" onClick={() => setOpen(false)}>
          <div className="vg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vg-modal-head">
              <h3>
                {data.transportadora} · {data.janela}
                {data.dia ? ` · ${fmtDate(data.dia)}` : ""}
              </h3>
              <button type="button" className="vg-modal-close" onClick={() => setOpen(false)}>
                fechar
              </button>
            </div>
            <table className="vg-card-metrics" style={{ marginBottom: 14 }}>
              <tbody>
                <tr>
                  <td>Peso real</td>
                  <td>{fmtNum(data.pesoRealKg)} kg</td>
                </tr>
                <tr>
                  <td>Volumes{volumesParcial ? " *" : ""}</td>
                  <td>{fmtNum(data.volumes)} un.</td>
                </tr>
                <tr>
                  <td>Ticket médio</td>
                  <td>{fmtBRL2(data.ticketMedio)}</td>
                </tr>
                {temMinimo && (
                  <tr>
                    <td>Frete mínimo</td>
                    <td>{fmtBRL2(data.freteMinimoObservado)} · est.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {volumesParcial && (
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: -8, marginBottom: 14 }}>
                * volumes só das contratações com cotação vinculada ({fmtNum((coberturaVolumes ?? 0) * 100, 0)}% deste bloco)
              </div>
            )}
            {temMinimo && (
              <>
                <div className="vg-modal-sub">
                  {fmtNum(data.nClientesMinimo)} cliente(s) · {fmtBRL(data.valorMinimo)} pagos no piso de{" "}
                  {fmtBRL2(data.freteMinimoObservado)} ou abaixo (estimativa, não tabela oficial)
                </div>
                <div className="vg-modal-body">
                  {loading ? (
                    <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando…</div>
                  ) : erro ? (
                    <div className="status-banner erro">{erro}</div>
                  ) : (
                    <div className="table-scroll">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Cidade</th>
                            <th className="num">Vezes</th>
                            <th className="num">Valor total</th>
                            <th>Nota(s) fiscal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(clientes ?? []).length === 0 ? (
                            <tr>
                              <td colSpan={5} style={{ color: "var(--text-muted)" }}>
                                Sem clientes neste recorte.
                              </td>
                            </tr>
                          ) : (
                            (clientes ?? []).map((c, i) => (
                              <tr key={i}>
                                <td>{c.cliente}</td>
                                <td>{c.cidade ?? "—"}</td>
                                <td className="num">{fmtNum(c.vezes)}</td>
                                <td className="num">{fmtBRL2(c.valor_total)}</td>
                                <td style={{ whiteSpace: "normal" }}>{c.notas ?? "—"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
