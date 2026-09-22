"use client";

import { useRef, useState } from "react";
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

  // [AJUSTE 2026-09-16] Mikael achou 3 campos de upload separados
  // complicado ("ficou ruim, muito arquivo") — a informação realmente vem de
  // 3 arquivos diferentes (não dá pra juntar sem perder cadastro de cliente
  // ou detalhe de contratação), mas a AÇÃO agora é uma só: ele seleciona a
  // pasta `codigo\` inteira (1 clique, <input webkitdirectory>) e o site
  // acha os 3 arquivos certos dentro dela pelo nome, ignorando o resto
  // (dashboard_data.json, fase1_*.csv etc. — não usados aqui).
  const [pastaSelecionada, setPastaSelecionada] = useState<string | null>(null);
  const [arquivosEncontrados, setArquivosEncontrados] = useState<{
    cotacoes: File | null;
    contratados: File | null;
    cnpj: File | null;
  }>({ cotacoes: null, contratados: null, cnpj: null });
  const inputRef = useRef<HTMLInputElement>(null);

  function onPastaEscolhida(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const achar = (nome: string) => files.find((f) => f.name === nome) ?? null;
    setArquivosEncontrados({
      cotacoes: achar("cotacoes_reais.json"),
      contratados: achar("contratados_reais.json"),
      cnpj: achar("cnpj_to_info.json"),
    });
    // webkitRelativePath vem como "codigo/cotacoes_reais.json" — mostra só a
    // pasta escolhida, não o caminho completo do disco (o navegador não
    // expõe isso por segurança, nem precisamos).
    const primeiro = files[0] as (File & { webkitRelativePath?: string }) | undefined;
    setPastaSelecionada(primeiro?.webkitRelativePath?.split("/")[0] ?? null);
  }

  const faltando = (["cotacoes", "contratados", "cnpj"] as const).filter((k) => !arquivosEncontrados[k]);

  async function analisar() {
    const { cotacoes: fCotacoes, contratados: fContratados, cnpj: fCnpj } = arquivosEncontrados;
    if (!fCotacoes || !fContratados || !fCnpj) return;
    setFase("analisando");
    setErro(null);
    try {
      const [cotacoes, contratados, cnpjInfo] = await Promise.all([
        lerJson<CotacaoRaw[]>(fCotacoes),
        lerJson<ContratadoRaw[]>(fContratados),
        lerJson<Record<string, CnpjInfo>>(fCnpj),
      ]);
      // Validação de conteúdo antes da prévia — um JSON que faz parse mas
      // está vazio/truncado (download interrompido, arquivo errado dentro da
      // pasta) passaria batido e o Mikael só descobriria depois de confirmar
      // a importação, já com cotações/ofertas/contratações substituídas.
      if (!Array.isArray(cotacoes) || cotacoes.length === 0) {
        throw new Error("cotacoes_reais.json não trouxe nenhuma cotação — arquivo vazio ou incompleto.");
      }
      if (!Array.isArray(contratados) || contratados.length === 0) {
        throw new Error("contratados_reais.json não trouxe nenhuma contratação — arquivo vazio ou incompleto.");
      }
      if (typeof cnpjInfo !== "object" || cnpjInfo === null || Object.keys(cnpjInfo).length === 0) {
        throw new Error("cnpj_to_info.json não trouxe nenhum cliente cadastrado — arquivo vazio ou incompleto.");
      }
      const resultado = buildImportRows({ cotacoes, contratados, cnpjInfo });
      if (resultado.cotacoes.length === 0 || resultado.contratacoes.length === 0) {
        throw new Error("A prévia ficou com cotações ou contratações zeradas — confira os arquivos antes de confirmar.");
      }
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
    setPastaSelecionada(null);
    setArquivosEncontrados({ cotacoes: null, contratados: null, cnpj: null });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="bloc" style={{ marginTop: 0 }}>
      {(fase === "selecionar" || fase === "analisando") && (
        <>
          <div className="bloc-head">
            <h2>1. Escolher a pasta</h2>
            <div className="desc">
              Selecione a pasta <code>codigo\</code> (dentro da pasta do projeto no Drive) — o site
              acha sozinho os 3 arquivos que precisa lá dentro.
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            // webkitdirectory: seleção de pasta inteira (Chrome/Edge/Firefox).
            // @ts-expect-error -- webkitdirectory/directory não estão nos tipos do React ainda
            webkitdirectory=""
            directory=""
            multiple
            onChange={onPastaEscolhida}
            style={{ display: "none" }}
          />
          <button type="button" className="tab-btn" onClick={() => inputRef.current?.click()}>
            Selecionar pasta…
          </button>

          {pastaSelecionada && (
            <div style={{ marginTop: 14, maxWidth: 480 }}>
              <div className="op-note" style={{ marginBottom: 10 }}>
                Pasta selecionada: <b>{pastaSelecionada}</b>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                <li>{arquivosEncontrados.cotacoes ? "✓" : "✗"} cotacoes_reais.json</li>
                <li>{arquivosEncontrados.contratados ? "✓" : "✗"} contratados_reais.json</li>
                <li>{arquivosEncontrados.cnpj ? "✓" : "✗"} cnpj_to_info.json</li>
              </ul>
              {faltando.length > 0 && (
                <div className="status-banner erro" style={{ marginTop: 10 }}>
                  Não achei {faltando.length === 1 ? "o arquivo" : "os arquivos"} acima marcado(s) com
                  ✗ dentro dessa pasta — confirme que selecionou a pasta <code>codigo\</code> certa.
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="tab-btn"
            style={{ marginTop: 16 }}
            disabled={faltando.length > 0 || !pastaSelecionada || fase === "analisando"}
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
