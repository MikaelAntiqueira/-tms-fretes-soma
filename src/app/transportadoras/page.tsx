import Link from "next/link";
import { Suspense } from "react";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase-server";
import { FilterBar, type FilterDimension } from "@/components/FilterBar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ComparativoCharts } from "./ComparativoCharts";
import { TransportadorasTabs } from "./TransportadorasTabs";
import { PrecoPrazoChart, type PrazoMedioRow } from "./PrecoPrazoChart";
import { RegiaoComercialChart, type RegiaoComercialRow } from "./RegiaoComercialChart";
import { ClientesChart, type ClienteMetricaRow } from "./ClientesChart";
import { parseMulti, fmtBRL, fmtBRL2, fmtBRLSigned, fmtNum, fmtPct, fmtPrazoMedio, clsDifSobreFrete, confiabilidade } from "@/lib/format";

// Página "Transportadoras & Cidades" — sub-abas "Comparativo" (TASK-29
// continuação, 2026-09-11, inalterada nesta etapa), "Preço × Prazo",
// "Região Comercial", "Clientes" (2026-09-12, inalteradas nesta etapa) e
// "Cidades" (nova, TASK-29 continuação, 2026-09-12), rota /transportadoras.
// Porta, linha a linha, `function renderTransportadoras(mask, qmask)`
// (Comparativo), `function renderQuadrante(mask)` + `function
// renderPrazoHist()` (Preço × Prazo), `function renderUf(mask)` (Região
// Comercial), `function renderClientes(mask)` (Clientes) e `function
// renderCidades(mask)` (Cidades) do Artifact original (v42) — ver
// `docs/mapa-migracao-tms-v3-2026-09-11.md`, `memoria/04_DICIONARIO_DADOS.md`
// e `memoria/05_DICIONARIO_KPIS.md` ([KPI-08]/[KPI-15], [DEC-15] FINAL —
// "% Mais Barata" é uma distribuição, não desempenho absoluto isolado;
// [DEC-02] FINAL — Região Comercial ≠ UF, usa sempre
// `clientes.regiao_normalizada`, nunca `regiao_comercial_bruta`; [DEC-19]
// FINAL — cidade do cadastro do cliente = cidade real de entrega, linha sem
// cidade entra como "Não informada", nunca é descartada).
//
// A sub-aba original "Performance" NÃO foi recriada de propósito: no
// Artifact ela é a MESMA tabela que já está fundida na nossa aba
// "Comparativo" (decisão de uma etapa anterior — ver comentário abaixo, na
// seção "fora do escopo").
//
// [TASK-29] MOTOR DE FILTRO GLOBAL — FASE 2, /transportadoras (2026-09-13).
// Estende para esta página o MESMO padrão já usado em /financeiro (Fase 1) e
// /operacao (Fase 1 continuação): mesmo componente <FilterBar>, mesma convenção
// de URL (?mes=/?transportadora=/?regiao=/?tipo=, multi-valor por vírgula), mesma
// convenção de "null = todos". Só a sub-aba "Comparativo" reage ao filtro nesta
// etapa — as demais 4 sub-abas (Preço × Prazo, Região Comercial, Clientes,
// Cidades) continuam mostrando sempre a base completa, sem filtro — mesmo corte
// de escopo já documentado em /financeiro (lá só a Visão Geral reage).
//
// ESCOPO: a RPC `transportadoras_comparativo` já tinha os 4 parâmetros opcionais
// (`p_meses/p_transportadoras/p_regioes/p_tipos`, default null) adicionados
// numa etapa anterior pensando nesta extensão — ver comentário no topo de
// src/app/financeiro/page.tsx e migration `fn_filtro_global_fase1_visao_geral`.
// As demais 5 RPCs desta página (prazo_medio, prazo_hist, regiao_comercial,
// clientes_metricas, cidades) NÃO ganharam parâmetros — então só o Comparativo
// (tabela + ranking + gráfico) reage ao filtro. O Quadrante (Preço × Prazo) é
// derivado do Comparativo em memória, então reflete o filtro também — mas só
// bate quando a transportadora tem AMBAS as métricas naquele recorte. Prazo
// Histórico, Região Comercial, Clientes e Cidades usam sempre a base completa.
//
// ATUALIZAÇÃO (2026-09-17): as 5 RPCs restantes (prazo_medio, prazo_hist,
// regiao_comercial, clientes_metricas, cidades) ganharam os mesmos 11
// parâmetros de filtro (migration `fn_transportadoras_add_filtro_global_
// demais_subabas`) — todas as 5 sub-abas já reagem ao recorte. `filtroArgs`
// nesta página continua só com os 4 parâmetros do <FilterBar> local (Mês/
// Transportadora/Região/Tipo); as outras 7 dimensões das functions ficam
// sempre null (= "todos") até esta página ganhar os mesmos 11 dropdowns já
// usados em /financeiro e /dados — próxima etapa separada, não feita agora.
// Cascata de opções também não foi estendida pra cá ainda.
//
// Opções dos 4 dropdowns: Mês vem de `filtro_opcoes_mes()` (function nova,
// aditiva — /transportadoras não chama `financeiro_evolucao_mensal()`; `filtro_
// opcoes_mes()` existe justamente para não obrigar uma RPC nova maior só para
// listar os meses). Região/Tipo vêm de `financeiro_filtro_opcoes()` (já existe,
// reaproveitada — não criamos outra). Transportadora usa TRANSP_ORDER, a mesma
// lista fixa das 7 transportadoras já usada em CARRIER_COLOR.
//
// Validação esperada (post-deployment, manual): chamada sem args == 7 linhas,
// R$ 494.417,43 (mesmos números de sempre, regressão zero); chamada com
// mes='2026-08' deve bater com `select ... from v_ontem_comparacao where
// cotacao_id in (select cotacao_id from v_cotacao_filtros where mes='2026-08')`.
//
// Toda agregação é feita dentro do banco via RPC (`transportadoras_
// comparativo`, `transportadoras_prazo_medio`, `transportadoras_prazo_hist`,
// `transportadoras_regiao_comercial`, `transportadoras_clientes_metricas`,
// `transportadoras_cidades` — migrations `fn_transportadoras_comparativo` +
// `fix_transportadoras_comparativo_qtdcotada_e_maisbarata` + `fn_
// transportadoras_prazo_medio_e_prazo_hist` + `fix_transportadoras_
// prazo_hist_universo` + `fn_transportadoras_regiao_comercial_e_clientes` +
// `fn_transportadoras_cidades`), nunca somando linhas cruas no cliente —
// Cidades sozinha já devolve 563 combinações cidade×transportadora (todas
// as cidades, sem corte de top 15), acima do limite padrão de 1000
// linhas/requisição do PostgREST somado às demais RPCs desta página.
//
// Universo: Comparativo, Preço×Prazo, Região Comercial e Cidades agregam
// sobre toda a base CRUZADA (contratações que cruzam uma cotação, mesmo
// universo de v_ontem_comparacao); Clientes usa o mesmo universo para Frete
// Contratado/Diferença, mas a Qtd. de Processos conta toda a base de
// cotações do cliente (cruzada ou não) — replica exatamente `BASE.cli[i]`
// do Artifact original, que não depende de contrato cruzado.
//
// ACHADO desta etapa (Preço × Prazo, Bloco 2 — tabela "Perfil histórico de
// prazo"): a leitura inicial da instrução ("mesmos dados de
// radar_prazo_hist()") não bateu com o Artifact de referência.
// `radar_prazo_hist()` calcula sobre TODA a grade de ofertas
// (`ofertas.prazo_dias`, ~21.836 linhas — correto para o detector D2 do
// Radar de Decisão, seu único consumidor hoje) e por isso tem N muito maior
// (ex. Fritz Express N=1.059) do que o Artifact v42 mostra na tabela
// "Perfil histórico de prazo" (Fritz Express N=453). Validação campo a
// campo (Playwright lendo `META.prazoHist` embutido no Artifact) provou que
// essa tabela na verdade usa a MESMA base de `transportadoras_prazo_medio`
// (prazo da oferta vencedora, só transportadora CONTRATADA, sobre a base
// cruzada) — bateu dígito a dígito (mean 1.0022075055187638 / N 453 para
// Fritz Express). Por isso `transportadoras_prazo_hist()` (nova, migration
// `fix_transportadoras_prazo_hist_universo`) usa essa base, não a de
// `radar_prazo_hist()` — que permanece intocada, sem uso nesta página.
//
// Cidades (nova, 2026-09-12): reaproveita a MESMA lógica de agregação de
// `operacao_por_cidade()` (view `v_operacao_base`, dedup, campos agregados)
// como referência/CTE — `operacao_por_cidade()` NÃO foi alterada (é usada
// por /operacao, que mostra só o top 15). `transportadoras_cidades()` é uma
// function NOVA que devolve TODAS as cidades (incluindo "Não informada"),
// mais a coluna "Prazo méd." (prazo da oferta vencedora por (cidade,
// transportadora), mesma base de `transportadoras_prazo_medio`). Validado
// campo a campo (Playwright, servindo o Artifact v42 localmente e lendo o
// DOM de `#tblCidades` sem filtro nenhum aplicado): 563 combinações
// cidade×transportadora nos dois lados, 10 primeiras linhas idênticas
// dígito a dígito, soma total de frete R$ 494.417,43 = [KPI-01]. Drift
// residual esperado só no desempate de cidades com `cidade_total_frete`
// EXATAMENTE igual (cauda da lista, ~10 cidades de frete único ~R$27-33) —
// o Artifact desempata pela ordem de inserção no array original (não
// reproduzível em SQL puro); este SQL usa só os 2 critérios pedidos (frete
// da cidade desc, frete da linha desc), igual a `operacao_por_cidade()` —
// não afeta nenhuma cidade relevante.
//
// Fora do escopo desta etapa (não portada ainda, ver mapa de migração):
// "Performance" nunca vai ser portada como aba própria — é a mesma tabela
// de "Comparativo" (fusão já decidida e publicada numa etapa anterior).
export const dynamic = "force-dynamic";

interface TransportadoraRow {
  transportadora: string;
  qtd_cotada: number;
  qtd_contratada: number;
  valor_contratado: number;
  frete_medio: number | null;
  vezes_mais_barata: number;
  pct_mais_barata: number | null;
  diferenca_media: number | null;
  pct_participacao: number | null;
  pct_contratada: number | null;
}

interface PrazoMedioRawRow {
  transportadora: string;
  prazo_medio: number | null;
  prazo_n: number;
}

interface PrazoHistRow {
  transportadora: string;
  mediana: number;
  media: number;
  n: number;
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
  prazo_medio: number | null;
  prazo_n: number;
  cidade_total_frete: number;
}

const CARRIER_COLOR: Record<string, string> = {
  "Fritz Express": "var(--t1)",
  LKW: "var(--t2)",
  Leomar: "var(--t3)",
  Minuano: "var(--t4)",
  "Rede Nacional": "var(--t5)",
  "Santa Cruz": "var(--t6)",
  "São Miguel": "var(--t7)",
};
const TRANSP_ORDER = Object.keys(CARRIER_COLOR);
function carrierColor(t: string | null): string {
  return (t && CARRIER_COLOR[t]) || "var(--text-muted)";
}
function CarrierDot({ t }: { t: string }) {
  return <span className="carrier-dot" style={{ background: carrierColor(t) }} />;
}

interface TransportadorasData {
  comparativo: TransportadoraRow[];
  quadrante: PrazoMedioRow[];
  prazoHist: PrazoHistRow[];
  regiaoComercial: RegiaoComercialRow[];
  clientes: ClienteMetricaRow[];
  cidades: CidadeRow[];
}

async function getTransportadorasData(filtros: FiltrosTransp): Promise<TransportadorasData> {
  const supabase = await createSupabaseServerClient();
  const filtroArgs = {
    p_meses: filtros.meses,
    p_transportadoras: filtros.transportadoras,
    p_regioes: filtros.regioes,
    p_tipos: filtros.tipos,
  };
  const [compRes, prazoMedioRes, prazoHistRes, regiaoRes, clientesRes, cidadesRes] = await Promise.all([
    // As 6 RPCs desta página reagem ao recorte (2026-09-17, migration
    // fn_transportadoras_add_filtro_global_demais_subabas) — `filtroArgs`
    // só tem os 4 parâmetros que esta página já usa (Mês/Transportadora/
    // Região/Tipo); as outras 7 dimensões das functions ficam null
    // (equivalente a "todos"), aditivo — upgrade pras 11 dimensões
    // completas (como em /financeiro e /dados) é próxima etapa separada.
    supabase.rpc("transportadoras_comparativo", filtroArgs),
    supabase.rpc("transportadoras_prazo_medio", filtroArgs),
    supabase.rpc("transportadoras_prazo_hist", filtroArgs),
    supabase.rpc("transportadoras_regiao_comercial", filtroArgs),
    supabase.rpc("transportadoras_clientes_metricas", filtroArgs),
    supabase.rpc("transportadoras_cidades", filtroArgs),
  ]);
  for (const res of [compRes, prazoMedioRes, prazoHistRes, regiaoRes, clientesRes, cidadesRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const comparativo: TransportadoraRow[] = ((compRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    transportadora: String(r.transportadora),
    qtd_cotada: Number(r.qtd_cotada ?? 0),
    qtd_contratada: Number(r.qtd_contratada ?? 0),
    valor_contratado: Number(r.valor_contratado ?? 0),
    frete_medio: r.frete_medio == null ? null : Number(r.frete_medio),
    vezes_mais_barata: Number(r.vezes_mais_barata ?? 0),
    pct_mais_barata: r.pct_mais_barata == null ? null : Number(r.pct_mais_barata),
    diferenca_media: r.diferenca_media == null ? null : Number(r.diferenca_media),
    pct_participacao: r.pct_participacao == null ? null : Number(r.pct_participacao),
    pct_contratada: r.pct_contratada == null ? null : Number(r.pct_contratada),
  }));
  // defensivo: a função SQL já devolve ordenado por valor_contratado desc
  comparativo.sort((a, b) => b.valor_contratado - a.valor_contratado);

  // "Preço × Prazo", Bloco 1 (quadrante): join em memória de
  // transportadoras_prazo_medio (prazoMedio) + transportadoras_comparativo
  // (diferencaMedia), por nome — só 7 linhas. Só entram transportadoras com
  // AS DUAS métricas presentes (renderQuadrante do Artifact original só
  // plota quem tem prazoN>0 E diffN>0).
  const prazoMedioRaw: PrazoMedioRawRow[] = ((prazoMedioRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    transportadora: String(r.transportadora),
    prazo_medio: r.prazo_medio == null ? null : Number(r.prazo_medio),
    prazo_n: Number(r.prazo_n ?? 0),
  }));
  const diferencaPorTransportadora = new Map(comparativo.map((r) => [r.transportadora, r.diferenca_media]));
  const quadrante: PrazoMedioRow[] = prazoMedioRaw
    .map((r) => {
      const diferencaMedia = diferencaPorTransportadora.get(r.transportadora) ?? null;
      if (r.prazo_medio == null || diferencaMedia == null) return null;
      return { transportadora: r.transportadora, prazoMedio: r.prazo_medio, diferencaMedia };
    })
    .filter((r): r is PrazoMedioRow => r !== null);

  // "Preço × Prazo", Bloco 2 (perfil histórico): ordenado por mediana asc
  // (mesma regra do Artifact original — TRANSP_ORDER.map(...).sort((a,b)=>
  // a.median-b.median)).
  const prazoHist: PrazoHistRow[] = ((prazoHistRes.data as Record<string, unknown>[]) ?? [])
    .map((r) => ({
      transportadora: String(r.transportadora),
      mediana: Number(r.mediana ?? 0),
      media: Number(r.media ?? 0),
      n: Number(r.n ?? 0),
    }))
    .sort((a, b) => a.mediana - b.mediana || a.media - b.media);

  const regiaoComercial: RegiaoComercialRow[] = ((regiaoRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    regiao: String(r.regiao),
    valor_contratado: Number(r.valor_contratado ?? 0),
    n_processos: Number(r.n_processos ?? 0),
  }));
  // defensivo: a função SQL já devolve ordenado por valor_contratado desc
  regiaoComercial.sort((a, b) => b.valor_contratado - a.valor_contratado);

  const clientes: ClienteMetricaRow[] = ((clientesRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    cliente: String(r.cliente),
    frete_contratado: Number(r.frete_contratado ?? 0),
    diferenca_positiva: Number(r.diferenca_positiva ?? 0),
    n_processos: Number(r.n_processos ?? 0),
  }));

  // Cidades: a função SQL já devolve TODAS as cidades (sem corte de top 15),
  // ordenado por cidade_total_frete desc, soma_frete_contratado desc — não
  // reordenar aqui (ver nota de drift no comentário do topo do arquivo).
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
    prazo_medio: r.prazo_medio == null ? null : Number(r.prazo_medio),
    prazo_n: Number(r.prazo_n ?? 0),
    cidade_total_frete: Number(r.cidade_total_frete ?? 0),
  }));

  return { comparativo, quadrante, prazoHist, regiaoComercial, clientes, cidades };
}

// Filtros da Fase 2 do motor de filtro global
// src/app/financeiro/page.tsx (`null` numa dimensão = sem filtro nela).
interface FiltrosTransp {
  meses: string[] | null;
  transportadoras: string[] | null;
  regioes: string[] | null;
  tipos: string[] | null;
}

export default async function TransportadorasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // [D-28] Rede de segurança independente de proxy.ts — ver comentário em
  // src/lib/supabase-server.ts.
  await requireUser("/transportadoras");
  const sp = await searchParams;
  const filtros: FiltrosTransp = {
    meses: parseMulti(sp.mes),
    transportadoras: parseMulti(sp.transportadora),
    regioes: parseMulti(sp.regiao),
    tipos: parseMulti(sp.tipo),
  };
  const filtroAtivo = Boolean(filtros.meses || filtros.transportadoras || filtros.regioes || filtros.tipos);

  let data: TransportadorasData | null = null;
  let opcoesMeses: string[] = [];
  let opcoesRegioes: string[] = [];
  let opcoesTipos: string[] = [];
  let erro: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const [dataRes, mesesRes, opcoesRes] = await Promise.all([
      getTransportadorasData(filtros),
      supabase.rpc("filtro_opcoes_mes"),
      supabase.rpc("financeiro_filtro_opcoes"),
    ]);
    for (const res of [mesesRes, opcoesRes]) {
      if (res.error) throw new Error(res.error.message);
    }
    data = dataRes;
    opcoesMeses = ((mesesRes.data as Record<string, unknown>[])?.[0]?.meses as string[] | null) ?? [];
    const opcoesRow = (opcoesRes.data as Record<string, unknown>[])?.[0];
    opcoesRegioes = (opcoesRow?.regioes as string[] | null) ?? [];
    opcoesTipos = (opcoesRow?.tipos as string[] | null) ?? [];
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  const rows = data?.comparativo ?? [];
  const quadrante = data?.quadrante ?? [];
  const prazoHist = data?.prazoHist ?? [];
  const regiaoTodas = data?.regiaoComercial ?? [];
  const regiaoTop15 = regiaoTodas.slice(0, 15);
  const clientes = data?.clientes ?? [];
  const cidades = data?.cidades ?? [];
  const cidadesUnicas = new Set(cidades.map((r) => r.cidade)).size;

  const custoTotal = rows.reduce((s, r) => s + r.valor_contratado, 0);
  const totalContratos = rows.reduce((s, r) => s + r.qtd_contratada, 0);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
            <h1>Transportadoras &amp; Cidades</h1>
            <p>
              Comparação factual entre as 7 transportadoras, por Preço × Prazo, Região Comercial,
              Cliente e Cidade — sobre <b>toda a base</b> (ofertas e contratações cruzadas a uma
              cotação). As 5 sub-abas já aceitam os filtros de Mês, Transportadora Contratada, Região
              Comercial e Tipo Cliente — as outras 7 dimensões do motor de filtro global (Romaneio,
              Escolheu a Mais Barata, Prazo, Cidade, Janela, Faixa de Peso, Faixa de Cubagem) ainda não
              chegaram nesta página.
            </p>
            <nav className="crumbs">
              <Link href="/">← Visão Geral</Link> · <Link href="/ontem">Ontem</Link> ·{" "}
              <Link href="/operacao">Operação</Link>
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
        ) : rows.length === 0 ? (
          <div className="status-banner">Sem dados de transportadoras nos dados atuais.</div>
        ) : (
          <>
            <Suspense fallback={<div className="filterbar" />}>
              <FilterBar
                dimensions={[
                  {
                    param: "mes",
                    labelAll: "Todos os meses",
                    options: opcoesMeses,
                    format: "mes",
                  },
                  {
                    param: "transportadora",
                    labelAll: "Todas as transportadoras",
                    options: TRANSP_ORDER,
                  },
                  {
                    param: "regiao",
                    labelAll: "Todas as regiões",
                    options: opcoesRegioes,
                  },
                  {
                    param: "tipo",
                    labelAll: "Todos os tipos",
                    options: opcoesTipos,
                  },
                ]}
              />
            </Suspense>
            {filtroAtivo && (
              <div className="cov-note ok">
                As 5 sub-abas (Comparativo, Preço × Prazo, Região Comercial, Clientes, Cidades) já
                refletem o filtro acima.
              </div>
            )}
            <TransportadorasTabs
              tabs={[
                { id: "transp-comparativo", label: "Comparativo" },
                { id: "transp-preco-prazo", label: "Preço × Prazo" },
                { id: "transp-regiao", label: "Região Comercial" },
                { id: "transp-clientes", label: "Clientes" },
                { id: "transp-cidades", label: "Cidades" },
              ]}
              defaultTab="transp-comparativo"
            >
              <div className="subpage" data-subpage="transp-comparativo">
                <section className="bloc" style={{ marginTop: 0 }}>
                  <div className="op-note" style={{ marginBottom: 16 }}>
                    {fmtNum(rows.length)} transportadoras &middot; <b>{fmtBRL(custoTotal)}</b> em frete
                    contratado (toda a base cruzada) &middot; <b>{fmtNum(totalContratos)}</b> contratações
                  </div>

                  <div className="bloc-head">
                    <h2>Comparativo</h2>
                    <div className="desc">
                      1 linha por transportadora, ordenado por Valor Contratado desc &middot; &quot;Qtd.
                      Cotada&quot; conta toda oferta registrada (vencedora ou não); &quot;Vezes Mais
                      Barata&quot; considera todas as cotações comparáveis da base (não só as
                      contratadas) — [KPI-08]/[DEC-15]: é uma distribuição, as % somam 100% entre
                      transportadoras, não é desempenho absoluto isolado.
                    </div>
                  </div>

                  <div className="table-scroll">
                    <table className="data" id="tblTransp">
                      <thead>
                        <tr>
                          <th>Transportadora</th>
                          <th className="num">Qtd. Cotada</th>
                          <th className="num">Qtd. Contratada</th>
                          <th className="num">Valor Contratado</th>
                          <th className="num">Frete Médio</th>
                          <th className="num">Vezes Mais Barata</th>
                          <th className="num">% Mais Barata</th>
                          <th className="num">Diferença Média</th>
                          <th className="num">% Participação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.transportadora}>
                            <td>
                              <CarrierDot t={r.transportadora} /> {r.transportadora}
                            </td>
                            <td className="num">{fmtNum(r.qtd_cotada)}</td>
                            <td className="num">{fmtNum(r.qtd_contratada)}</td>
                            <td className="num">{fmtBRL(r.valor_contratado)}</td>
                            <td className="num">{fmtBRL2(r.frete_medio)}</td>
                            <td className="num">{fmtNum(r.vezes_mais_barata)}</td>
                            <td className="num">{fmtPct(r.pct_mais_barata)}</td>
                            <td className="num">{fmtBRL2(r.diferenca_media)}</td>
                            <td className="num">{fmtPct(r.pct_participacao)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="bloc">
                  <div className="bloc-head">
                    <h2>Contratada × Mais Barata · Ranking</h2>
                    <div className="desc">mesmos dados da tabela acima, em gráfico</div>
                  </div>
                  <ComparativoCharts
                    rows={rows.map((r) => ({
                      transportadora: r.transportadora,
                      qtd_cotada: r.qtd_cotada,
                      vezes_mais_barata: r.vezes_mais_barata,
                      pct_mais_barata: r.pct_mais_barata,
                      pct_contratada: r.pct_contratada,
                    }))}
                  />
                </section>
              </div>

              <div className="subpage" data-subpage="transp-preco-prazo">
                <section className="bloc" style={{ marginTop: 0 }}>
                  <div className="bloc-head">
                    <h2>Prazo Médio × Diferença Média por Transportadora</h2>
                    <div className="desc">
                      1 ponto por transportadora &middot; eixo X = prazo médio da oferta vencedora nas
                      contratações cruzadas (dias); eixo Y = diferença média (mesma métrica de
                      &quot;Diferença Média&quot; do Comparativo). Só entram transportadoras com as duas
                      métricas disponíveis.
                    </div>
                  </div>
                  {quadrante.length === 0 ? (
                    <div className="status-banner">
                      Sem transportadoras com prazo E diferença média disponíveis simultaneamente.
                    </div>
                  ) : (
                    <div className="card">
                      <PrecoPrazoChart rows={quadrante} />
                    </div>
                  )}
                </section>

                <section className="bloc">
                  <div className="bloc-head">
                    <h2>Perfil histórico de prazo por transportadora</h2>
                    <div className="desc">
                      Prazo da oferta vencedora nas contratações cruzadas, por transportadora
                      contratada &middot; sempre a base completa (não depende de filtro) &middot;
                      ordenado por mediana asc. Confiabilidade: N&ge;100 = boa; N entre 30 e 99 =
                      amostra pequena; N&lt;30 = insuficiente para conclusão.
                    </div>
                  </div>
                  {prazoHist.length === 0 ? (
                    <div className="status-banner">Sem dados de prazo histórico nos dados atuais.</div>
                  ) : (
                    <div className="table-scroll">
                      <table className="data" id="tblPrazoHist">
                        <thead>
                          <tr>
                            <th>Transportadora</th>
                            <th className="num">Mediana (dias)</th>
                            <th className="num">Média (dias)</th>
                            <th className="num">N registros</th>
                            <th>Confiabilidade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prazoHist.map((r) => {
                            const conf = confiabilidade(r.n);
                            return (
                              <tr key={r.transportadora}>
                                <td>
                                  <CarrierDot t={r.transportadora} /> {r.transportadora}
                                </td>
                                <td className="num">{fmtNum(r.mediana, 1)}</td>
                                <td className="num">{fmtNum(r.media, 2)}</td>
                                <td className="num">{fmtNum(r.n)}</td>
                                <td>
                                  {conf.pillClass ? <span className={conf.pillClass}>{conf.label}</span> : conf.label}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>

              <div className="subpage" data-subpage="transp-regiao">
                <section className="bloc" style={{ marginTop: 0 }}>
                  <div className="bloc-head">
                    <h2>Região Comercial</h2>
                    <div className="desc">
                      Top 15 de {fmtNum(regiaoTodas.length)} Regiões Comerciais por valor contratado —
                      toda a base cruzada, sem filtro de dia. Região Comercial (`clientes.regiao_normalizada`)
                      é a região de venda do cadastro, não é UF/estado ([DEC-02] FINAL).
                    </div>
                  </div>
                  {regiaoTop15.length === 0 ? (
                    <div className="status-banner">Sem dados de Região Comercial nos dados atuais.</div>
                  ) : (
                    <div className="card">
                      <RegiaoComercialChart rows={regiaoTop15} />
                    </div>
                  )}
                </section>
              </div>

              <div className="subpage" data-subpage="transp-clientes">
                <section className="bloc" style={{ marginTop: 0 }}>
                  <div className="bloc-head">
                    <h2>Clientes</h2>
                    <div className="desc">
                      Top 12 clientes pela métrica escolhida — Frete Contratado e Diferença Financeira
                      Identificada olham só para a base cruzada (mesmo universo do Comparativo); Qtd. de
                      Processos conta toda cotação do cliente, cruzada ou não.
                    </div>
                  </div>
                  {clientes.length === 0 ? (
                    <div className="status-banner">Sem dados de Clientes nos dados atuais.</div>
                  ) : (
                    <div className="card">
                      <ClientesChart rows={clientes} />
                    </div>
                  )}
                </section>
              </div>

              <div className="subpage" data-subpage="transp-cidades">
                <section className="bloc" style={{ marginTop: 0 }}>
                  <div className="bloc-head">
                    <h2>Cidades</h2>
                    <div className="desc">
                      Quais transportadoras carregaram para cada cidade — todas as cidades do recorte,
                      ordenadas por frete.
                    </div>
                  </div>
                  <div className="op-note" style={{ marginBottom: 16 }}>
                    Cidade = cidade do cadastro do cliente (pode diferir da cidade real de entrega).
                    Linha sem cidade no cadastro entra como &quot;Não informada&quot;, nunca é
                    descartada. {fmtNum(cidades.length)} combinações cidade × transportadora em{" "}
                    {fmtNum(cidadesUnicas)} cidades.
                  </div>
                  {cidades.length === 0 ? (
                    <div className="status-banner">Sem dados de Cidades nos dados atuais.</div>
                  ) : (
                    <div className="table-scroll">
                      <table className="data" id="tblCidades">
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
                            <th className="num">Prazo méd.</th>
                            <th className="num">% part.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cidades.map((r, i) => {
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
                                <td className="num">
                                  {r.soma_melhor_cotacao === 0 ? "—" : fmtBRL(r.soma_melhor_cotacao)}
                                </td>
                                <td className="num" style={style}>
                                  {fmtBRLSigned(r.soma_diferenca_r)}
                                </td>
                                <td className="num">{fmtPrazoMedio(r.prazo_medio, r.prazo_n)}</td>
                                <td className="num">{fmtPct(pctPart)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            </TransportadorasTabs>

            <section className="bloc">
              <div className="card">
                <h3>Fora do escopo desta etapa</h3>
                <div className="sub">demais itens da página original "Transportadoras & Cidades"</div>
                <div className="alert-card info" style={{ marginTop: 8 }}>
                  <ul>
                    <li className="notes">
                      <span className="name">Performance</span>
                      <span className="num notes" style={{ color: "var(--text-muted)" }}>
                        não é uma aba própria — mesma tabela de "Comparativo" (fusão já decidida)
                      </span>
                    </li>
                    <li className="notes">
                      <span className="name">Motor de filtro — só 4 das 11 dimensões nesta página</span>
                      <span className="num notes" style={{ color: "var(--text-muted)" }}>
                        as 5 sub-abas já reagem a Mês/Transportadora/Região/Tipo (2026-09-17); as outras
                        7 dimensões (Romaneio, Escolheu a Mais Barata, Prazo, Cidade, Janela, Faixa de
                        Peso, Faixa de Cubagem) — já disponíveis em /financeiro e /dados — ainda não
                        chegaram aqui
                      </span>
                    </li>
                    <li className="notes">
                      <span className="name">Motor de filtro — cascata de opções e /oportunidades</span>
                      <span className="num notes" style={{ color: "var(--text-muted)" }}>
                        os dropdowns desta página ainda mostram sempre a lista completa de valores, não
                        podada pelos outros filtros ativos; /oportunidades também ainda não aplica o
                        filtro na consulta
                      </span>
                    </li>
                  </ul>
                </div>
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
