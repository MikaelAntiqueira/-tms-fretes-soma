"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  buildImportRows,
  chunk,
  type CotacaoRaw,
  type ContratadoRaw,
  type CnpjInfo,
  type ImportBuilt,
} from "@/lib/importacao";

// Roda inteiramente no navegador (não numa Server Action) de propósito: os
// 3 arquivos somam ~23 MB (cotacoes_reais.json ~13 MB, contratados_reais.json
// ~9 MB) — passar isso por uma function serverless da Vercel bateria no
// limite de tamanho de corpo de requisição bem antes de qualquer limite do
// navegador. O parse/transform roda aqui; as chamadas RPC (importar_iniciar/
// importar_lote_*/importar_finalizar) usam a sessão autenticada do próprio
// Mikael via createSupabaseBrowserClient() — nenhuma chave nova, nenhum
// segredo de service_role exposto.
const CHUNK_SIZE = 1000;
// Concorrência limitada, não Promise.all cru — Mikael pediu "rápido toda a
// manhã", mas 60+ lotes todos de uma vez poderia esgotar o pool de conexões
// do Postgres; 6 em paralelo já reduz o tempo total de ~1 chamada por vez
// pra uma fração, sem sobrecarregar.
const CONCURRENCY = 6;

type Fase = "selecionar" | "analisando" | "previa" | "importando" | "concluido" | "erro";

interface ProgressoLote {
  nome: string;
  enviados: number;
  total: number;
}

async function lerJson<T>(file: File): Promise<T> {
  const texto = await file.text();
  return JSON.parse(texto) as T;
}

async function executarEmLotes<T>(
  rows: T[],
  chamarLote: (lote: T[]) => PromiseLike<{ error: { message: string } | null }>,
  onProgresso: (enviados: number) => void
): Promise<void> {
  const lotes = chunk(rows, CHUNK_SIZE);
  let concluidos = 0;
  for (let i = 0; i < lotes.length; i += CONCURRENCY) {
    const grupo = lotes.slice(i, i + CONCURRENCY);
    const resultados = await Promise.all(grupo.map((lote) => chamarLote(lote)));
    for (const r of resultados) {
      if (r.error) throw new Error(r.error.message);
    }
    concluidos += grupo.length;
    onProgresso(Math.min(concluidos * CHUNK_SIZE, rows.length));
  }
}

export function ImportarClient() {
  const [fase, setFase] = useState<Fase>("selecionar");
  const [erro, setErro] = useState<string | null>(null);
  const [built, setBuilt] = useState<ImportBuilt | null>(null);
  const [progresso, setProgresso] = useState<ProgressoLote[]>([]);
  const [resultadoFinal, setResultadoFinal] = useState<Record<string, number> | null>(null);

  const [fCotacoes, setFCotacoes] = useState<File | null>(null);
  const [fContratados, setFContratados] = useState<File | null>(null);
  const [fCnpj, setFCnpj] = useState<File | null>(null);

  async function analisar() {
    if (!fCotacoes || !fContratados || !fCnpj) return;
    setFase("analisando");
    setErro(null);
    try {
      const [cotacoes, contratados, cnpjInfo] = await Promise.all([
        lerJson<CotacaoRaw[]>(fCotacoes),
        lerJson<ContratadoRaw[]>(fContratados),
        lerJson<Record<string, CnpjInfo>>(fCnpj),
      ]);
      const resultado = buildImportRows({ cotacoes, contratados, cnpjInfo });
      setBuilt(resultado);
      setFase("previa");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao ler os arquivos.");
      setFase("erro");
    }
  }

  async function confirmar() {
    if (!built) return;
    setFase("importando");
    setErro(null);
    const supabase = createSupabaseBrowserClient();
    const passos: { nome: string; rows: unknown[]; rpc: string }[] = [
      { nome: "Clientes", rows: built.clientes, rpc: "importar_lote_clientes" },
      { nome: "Transportadoras", rows: built.transportadoras, rpc: "importar_lote_transportadoras" },
      { nome: "Cotações", rows: built.cotacoes, rpc: "importar_lote_cotacoes" },
      { nome: "Ofertas", rows: built.ofertas, rpc: "importar_lote_ofertas" },
      { nome: "Contratações", rows: built.contratacoes, rpc: "importar_lote_contratacoes" },
    ];
    setProgresso(passos.map((p) => ({ nome: p.nome, enviados: 0, total: p.rows.length })));

    try {
      const iniciarRes = await supabase.rpc("importar_iniciar");
      if (iniciarRes.error) throw new Error(iniciarRes.error.message);

      for (const passo of passos) {
        await executarEmLotes(
          passo.rows,
          (lote) => supabase.rpc(passo.rpc, { p_rows: lote }),
          (enviados) =>
            setProgresso((prev) => prev.map((p) => (p.nome === passo.nome ? { ...p, enviados } : p)))
        );
      }

      const finalRes = await supabase.rpc("importar_finalizar");
      if (finalRes.error) throw new Error(finalRes.error.message);
      setResultadoFinal(finalRes.data as Record<string, number>);
      setFase("concluido");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido durante a importação.");
      setFase("erro");
    }
  }

  function reiniciar() {
    setFase("selecionar");
    setErro(null);
    setBuilt(null);
    setProgresso([]);
    setResultadoFinal(null);
    setFCotacoes(null);
    setFContratados(null);
    setFCnpj(null);
  }

  return (
    <section className="bloc" style={{ marginTop: 0 }}>
      {(fase === "selecionar" || fase === "analisando") && (
        <>
          <div className="bloc-head">
            <h2>1. Escolher os 3 arquivos</h2>
            <div className="desc">
              Todos ficam em <code>codigo\</code>, dentro da pasta do projeto no Drive.
            </div>
          </div>
          <div className="grid" style={{ gap: 14, maxWidth: 520 }}>
            <label>
              <div className="lbl" style={{ marginBottom: 4 }}>
                cotacoes_reais.json
              </div>
              <input
                type="file"
                accept="application/json"
                onChange={(e) => setFCotacoes(e.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              <div className="lbl" style={{ marginBottom: 4 }}>
                contratados_reais.json
              </div>
              <input
                type="file"
                accept="application/json"
                onChange={(e) => setFContratados(e.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              <div className="lbl" style={{ marginBottom: 4 }}>
                cnpj_to_info.json
              </div>
              <input type="file" accept="application/json" onChange={(e) => setFCnpj(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <button
            type="button"
            className="tab-btn"
            style={{ marginTop: 16 }}
            disabled={!fCotacoes || !fContratados || !fCnpj || fase === "analisando"}
            onClick={analisar}
          >
            {fase === "analisando" ? "Lendo arquivos…" : "Analisar"}
          </button>
        </>
      )}

      {fase === "previa" && built && (
        <>
          <div className="bloc-head">
            <h2>2. Confirmar</h2>
            <div className="desc">Isso vai SUBSTITUIR cotações, ofertas e contratações pelo conteúdo destes arquivos.</div>
          </div>
          <div className="cov-note" style={{ marginBottom: 14 }}>
            <b>Atenção:</b> cotações, ofertas e contratações são totalmente recarregadas (o que
            estiver nos arquivos passa a ser a verdade) — clientes e transportadoras só são
            atualizados/adicionados, nada é apagado deles.
          </div>
          <table className="data" style={{ maxWidth: 420, marginBottom: 16 }}>
            <tbody>
              <tr>
                <td>Clientes</td>
                <td className="num">{built.clientes.length.toLocaleString("pt-BR")}</td>
              </tr>
              <tr>
                <td>Transportadoras</td>
                <td className="num">{built.transportadoras.length.toLocaleString("pt-BR")}</td>
              </tr>
              <tr>
                <td>Cotações</td>
                <td className="num">{built.cotacoes.length.toLocaleString("pt-BR")}</td>
              </tr>
              <tr>
                <td>Ofertas</td>
                <td className="num">{built.ofertas.length.toLocaleString("pt-BR")}</td>
              </tr>
              <tr>
                <td>Contratações</td>
                <td className="num">{built.contratacoes.length.toLocaleString("pt-BR")}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="tab-btn" onClick={confirmar}>
              Confirmar importação
            </button>
            <button type="button" className="tab-btn" onClick={reiniciar}>
              Cancelar
            </button>
          </div>
        </>
      )}

      {fase === "importando" && (
        <>
          <div className="bloc-head">
            <h2>Importando…</h2>
            <div className="desc">Não feche esta página até terminar.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
            {progresso.map((p) => (
              <div key={p.nome}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                  <span>{p.nome}</span>
                  <span className="mono">
                    {p.enviados.toLocaleString("pt-BR")} / {p.total.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      background: "var(--brand-700, var(--text-muted))",
                      width: `${p.total ? (p.enviados / p.total) * 100 : 100}%`,
                      transition: "width 0.2s",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {fase === "concluido" && resultadoFinal && (
        <>
          <div className="status-banner">
            <b>Importação concluída.</b>
          </div>
          <table className="data" style={{ maxWidth: 420, marginTop: 14, marginBottom: 16 }}>
            <tbody>
              {Object.entries(resultadoFinal).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ textTransform: "capitalize" }}>{k}</td>
                  <td className="num">{Number(v).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="tab-btn" onClick={reiniciar}>
            Importar outra carga
          </button>
        </>
      )}

      {fase === "erro" && (
        <>
          <div className="status-banner erro">
            <b>Não foi possível concluir.</b>
            <div style={{ marginTop: 6 }}>{erro}</div>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "10px 0" }}>
            Se a importação já tinha começado, é seguro tentar de novo — o primeiro passo sempre
            zera o que ficou pendente antes de recomeçar.
          </div>
          <button type="button" className="tab-btn" onClick={reiniciar}>
            Tentar de novo
          </button>
        </>
      )}
    </section>
  );
}
