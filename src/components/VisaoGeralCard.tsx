"use client";

import { useState, type CSSProperties } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { fmtBRL, fmtBRL2, fmtNum } from "@/lib/format";

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
  ticketMedio: number;
  freteMinimoObservado: number | null;
  nClientesMinimo: number;
  valorMinimo: number | null;
  mes: string;
}

interface ClienteMinimoRow {
  cliente: string;
  cidade: string | null;
  vezes: number;
  valor_total: number;
}

// Card por transportadora × janela na Visão Geral — nome + valor em
// destaque (o que o Samuel pediu para bater o olho), peso/volumes/ticket
// médio/frete mínimo secundários. Quando a transportadora tem piso
// conhecido (frete_minimo_observado), o rodapé "N clientes no mínimo" abre
// um drill-down (modal) com a lista de clientes — RPC chamada só quando o
// usuário clica, não no carregamento da página.
export function VisaoGeralCard({ data }: { data: VisaoGeralCardData }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState<ClienteMinimoRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const temMinimo = data.freteMinimoObservado != null;
  const coberturaVolumes = data.nContratacoes > 0 ? data.nComVolume / data.nContratacoes : null;
  const volumesParcial = coberturaVolumes != null && coberturaVolumes < 0.9;

  async function abrir() {
    if (!temMinimo) return;
    setOpen(true);
    if (clientes || loading) return;
    setLoading(true);
    setErro(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: rows, error } = await supabase.rpc("visao_geral_clientes_minimo", {
        p_mes: data.mes,
        p_transportadora_id: data.transportadoraId,
        p_janela: data.janela,
      });
      if (error) throw new Error(error.message);
      setClientes((rows as ClienteMinimoRow[]) ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar o Supabase.");
    } finally {
      setLoading(false);
    }
  }

  const cardStyle: CSSProperties = { ["--vg-carrier-color" as never]: `var(${data.colorVar})` };

  return (
    <>
      <div
        className="vg-card"
        style={cardStyle}
        onClick={temMinimo ? abrir : undefined}
        role={temMinimo ? "button" : undefined}
        tabIndex={temMinimo ? 0 : undefined}
        onKeyDown={
          temMinimo
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  abrir();
                }
              }
            : undefined
        }
      >
        <div className="vg-card-top">
          <div>
            <div className="vg-card-name">{data.transportadora}</div>
            <div className="vg-card-value">{fmtBRL(data.valorTotal)}</div>
          </div>
          <table className="vg-card-metrics">
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
        </div>
        {temMinimo && (
          <div className="vg-card-minimo">
            {fmtNum(data.nClientesMinimo)} cliente(s) no mínimo · {fmtBRL(data.valorMinimo)}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </div>
        )}
        {volumesParcial && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
            * volumes só das contratações com cotação vinculada ({fmtNum((coberturaVolumes ?? 0) * 100, 0)}% deste bloco)
          </div>
        )}
      </div>

      {open && (
        <div className="vg-modal-scrim" onClick={() => setOpen(false)}>
          <div className="vg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vg-modal-head">
              <h3>
                {data.transportadora} · {data.janela} · atingiram o frete mínimo
              </h3>
              <button type="button" className="vg-modal-close" onClick={() => setOpen(false)}>
                fechar
              </button>
            </div>
            <div className="vg-modal-sub">
              {fmtNum(data.nClientesMinimo)} cliente(s) · {fmtBRL(data.valorMinimo)} pagos no piso de{" "}
              {fmtBRL2(data.freteMinimoObservado)} ou abaixo (estimativa, não tabela oficial)
            </div>
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
                    </tr>
                  </thead>
                  <tbody>
                    {(clientes ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ color: "var(--text-muted)" }}>
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
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
