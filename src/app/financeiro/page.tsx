import Link from "next/link";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FinanceiroTabs } from "./FinanceiroTabs";
import { CotadoContratadoCharts } from "./CotadoContratadoCharts";

// Página "Financeiro" — sub-abas "Visão Geral" (inalterada) + "Cotado ×
// Contratado" (nova, TASK-29 continuação, 2026-09-11/12), rota /financeiro.
// Porta, linha a linha, `aggBase(mask)` + `renderKPIs` + `renderJanelaHome` +
// `renderExec` (Visão Geral) e `renderEvolucao` + `renderEconomiaMes` +
// `renderEscolheu` (Cotado × Contratado) do Artifact original (v42) — ver
// `docs/mapa-migracao-tms-v3-2026-09-11.md`, `memoria/04_DICIONARIO_DADOS.md`
// e `memoria/05_DICIONARIO_KPIS.md` ([KPI-01]/[KPI-02]/[KPI-04]/[KPI-05]/
// [KPI-16], [DEC-25] FINAL — não há campo de "motivo").
//
// Diferença importante de universo vs. /ontem e /operacao: os KPIs desta
// página agregam TODA a base de cotações (6.915 linhas), não só as
// cruzadas com uma contratação — "Total de Cotações"/"Total de Pedidos"
// contam também processos ainda sem frete contratado. Só "Frete
// Contratado"/"Frete Médio"/os 3 baldes Sim-Não-Sem comparação olham para
// o subconjunto cruzado (5.194).
//
// Toda agregação é feita dentro do banco via RPC (`financeiro_visao_geral_kpis`,
// `financeiro_visao_geral_resumo` — migrations `fn_financeiro_visao_geral` +
// `fix_financeiro_pedido_e_regiao_normalizada`), reaproveitando
// `v_ontem_comparacao` (mesmo recorte Meio-dia = só Rede+Fritz concorrem,
// [DEC-18]/[KPI-16]) via view auxiliar `v_financeiro_base` — nunca duplica
// esse cálculo. Reaproveita também `operacao_por_janela()` (Bloco 2) e
// `transportadoras_comparativo()` (Bloco 3, maior participação/maior %
// mais barata) já existentes — não recalcula nada que essas duas já fazem.
//
// Sub-aba "Cotado × Contratado" (nova): agregação mensal via RPC nova
// `financeiro_evolucao_mensal()` (migration `fn_financeiro_evolucao_mensal_e_
// diff_n_esc_nao`) — 1 linha por mês (frete/melhor/nMelhor/diffPosSum),
// construída em cima de `v_financeiro_base` como CTE (não duplica a lógica
// de janela/melhor-cotação, só agrupa por mês de `cotacoes.criado_em`). O
// doughnut "Escolheu a Mais Barata?" reaproveita os contadores esc_s/esc_n/
// esc_sc que `financeiro_visao_geral_kpis()` já devolve (1896/1392/1906,
// conferido) — só a soma de `diferenca_r` das linhas `esc='N'` (`diffN` do
// Artifact) precisava de peça nova, via RPC `financeiro_diff_n_esc_nao()`.
//
// Confirmado por teste direto contra o Artifact v42 (Playwright, sem
// filtro): "Região Comercial" do resumo executivo é `clientes
// .regiao_normalizada` (ex. "LITORAL"), NÃO `regiao_comercial_bruta` (ex.
// "LITORAL PRIVADO" — inclui o sufixo de Tipo de Cliente). E "Total de
// Pedidos" usa COALESCE(cotacoes.pedido, pedido da contratação cruzada)
// porque cotacoes.pedido sozinho está incompleto (885 cruzadas com Pedido
// Nº só na contratação) — ver comentário da migration de correção.
//
// Validado campo a campo (Playwright) contra #kpiGrid / #homeJanelas /
// #execText do Artifact v42 sem nenhum filtro aplicado — os 8 KPIs, os 2
// mini-cards de janela e as 5 frases do resumo batem exatamente. Os 2
// gráficos de evolução mensal, o doughnut e o card de impacto da sub-aba
// nova foram validados do mesmo jeito contra #chartEvolucao/#chartEconomiaMes/
// #chartEscolheu/#impactoDecisao — ver relatório do TASK-29 continuação.
//
// Fora do escopo desta etapa, de propósito (ver bloco "Pendências" no fim
// da página): a "Simulação de Custo por Transportadora" (4º bloco da
// Visão Geral original) e as outras 2 sub-abas restantes da página
// Financeiro original (Padrões da Diferença, Peso/Cubagem & Custo).
export const dynamic = "force-dynamic";

interface FinanceiroKpis {
  freteTotal: number;
  freteN: number;
  diffPosSum: number;
  diffN: number;
  diffMedia: number | null;
  diffPMedia: number | null;
  escS: number;
  escN: number;
  escSC: number;
  cot: number;
  pedidos: number;
  totalContratacoes: number;
  contratacoesCruzadas: number;
}

interface FinanceiroResumo {
  topClienteNome: string | null;
  topClienteSoma: number | null;
  topRegiaoNome: string | null;
  topRegiaoMedia: number | null;
}

interface JanelaRow {
  janela: string;
  n_linhas: number;
  n_romaneios: number;
  n_pedidos: number;
  soma_peso_kg: number;
  soma_cubagem_m3: number;
  soma_frete_contratado: number;
}

interface TopTransportadora {
  transportadora: string;
  pct_participacao: number | null;
  pct_mais_barata: number | null;
}

interface EvolucaoMesRow {
  mes: string;
  frete: number;
  melhor: number;
  nMelhor: number;
  diffPosSum: number;
}

interface FinanceiroData {
  kpis: FinanceiroKpis | null;
  resumo: FinanceiroResumo | null;
  janelas: JanelaRow[];
  topTransportadora: TopTransportadora | null;
  evolucaoMensal: EvolucaoMesRow[];
  maxMes: string | null;
  diffNEscNao: number;
}

async function getFinanceiroData(): Promise<FinanceiroData> {
  const [kpisRes, resumoRes, janelasRes, transpRes, evolucaoRes, diffNRes] = await Promise.all([
    supabase.rpc("financeiro_visao_geral_kpis"),
    supabase.rpc("financeiro_visao_geral_resumo"),
    supabase.rpc("operacao_por_janela"),
    supabase.rpc("transportadoras_comparativo"),
    supabase.rpc("financeiro_evolucao_mensal"),
    supabase.rpc("financeiro_diff_n_esc_nao"),
  ]);
  for (const res of [kpisRes, resumoRes, janelasRes, transpRes, evolucaoRes, diffNRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const kpisRow = (kpisRes.data as Record<string, unknown>[])?.[0];
  const kpis: FinanceiroKpis | null = kpisRow
    ? {
        freteTotal: Number(kpisRow.frete_total ?? 0),
        freteN: Number(kpisRow.frete_n ?? 0),
        diffPosSum: Number(kpisRow.diff_pos_sum ?? 0),
        diffN: Number(kpisRow.diff_n ?? 0),
        diffMedia: kpisRow.diff_media == null ? null : Number(kpisRow.diff_media),
        diffPMedia: kpisRow.diff_p_media == null ? null : Number(kpisRow.diff_p_media),
        escS: Number(kpisRow.esc_s ?? 0),
        escN: Number(kpisRow.esc_n ?? 0),
        escSC: Number(kpisRow.esc_sc ?? 0),
        cot: Number(kpisRow.cot ?? 0),
        pedidos: Number(kpisRow.pedidos ?? 0),
        totalContratacoes: Number(kpisRow.total_contratacoes ?? 0),
        contratacoesCruzadas: Number(kpisRow.contratacoes_cruzadas ?? 0),
      }
    : null;

  const resumoRow = (resumoRes.data as Record<string, unknown>[])?.[0];
  const resumo: FinanceiroResumo | null = resumoRow
    ? {
        topClienteNome: (resumoRow.top_cliente_nome as string) ?? null,
        topClienteSoma: resumoRow.top_cliente_soma == null ? null : Number(resumoRow.top_cliente_soma),
        topRegiaoNome: (resumoRow.top_regiao_nome as string) ?? null,
        topRegiaoMedia: resumoRow.top_regiao_media == null ? null : Number(resumoRow.top_regiao_media),
      }
    : null;

  const janelas: JanelaRow[] = ((janelasRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    janela: String(r.janela),
    n_linhas: Number(r.n_linhas ?? 0),
    n_romaneios: Number(r.n_romaneios ?? 0),
    n_pedidos: Number(r.n_pedidos ?? 0),
    soma_peso_kg: Number(r.soma_peso_kg ?? 0),
    soma_cubagem_m3: Number(r.soma_cubagem_m3 ?? 0),
    soma_frete_contratado: Number(r.soma_frete_contratado ?? 0),
  }));

  // Já vem ordenado por valor_contratado desc — a 1a linha é a de maior
  // participação no valor contratado (topT do resumo executivo).
  const transpRows = (transpRes.data as Record<string, unknown>[]) ?? [];
  const topRow = transpRows[0];
  const topTransportadora: TopTransportadora | null = topRow
    ? {
        transportadora: String(topRow.transportadora),
        pct_participacao: topRow.pct_participacao == null ? null : Number(topRow.pct_participacao),
        pct_mais_barata: topRow.pct_mais_barata == null ? null : Number(topRow.pct_mais_barata),
      }
    : null;

  const evolucaoRows = (evolucaoRes.data as Record<string, unknown>[]) ?? [];
  const evolucaoMensal: EvolucaoMesRow[] = evolucaoRows.map((r) => ({
    mes: String(r.mes),
    frete: Number(r.frete ?? 0),
    melhor: Number(r.melhor ?? 0),
    nMelhor: Number(r.n_melhor ?? 0),
    diffPosSum: Number(r.diff_pos_sum ?? 0),
  }));
  const maxMes = evolucaoRows[0]?.max_mes != null ? String(evolucaoRows[0].max_mes) : null;
  const diffNEscNao = Number(diffNRes.data ?? 0);

  return { kpis, resumo, janelas, topTransportadora, evolucaoMensal, maxMes, diffNEscNao };
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtBRL2(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(v: number | null | undefined, d = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
}
// Porta `fmtMes` do Artifact original: "2026-07" -> "jul/2026".
function fmtMes(iso: string): string {
  const [y, m] = iso.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const idx = parseInt(m, 10) - 1;
  return `${nomes[idx] ?? "?"}/${y}`;
}

export default async function FinanceiroPage() {
  let data: FinanceiroData | null = null;
  let erro: string | null = null;
  try {
    data = await getFinanceiroData();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  const k = data?.kpis ?? null;
  const resumo = data?.resumo ?? null;
  const janelas = data?.janelas ?? [];
  const topT = data?.topTransportadora ?? null;
  const evolucaoMensal = data?.evolucaoMensal ?? [];
  const maxMes = data?.maxMes ?? null;
  const diffNEscNao = data?.diffNEscNao ?? 0;

  const pctBarata = k && k.escS + k.escN > 0 ? k.escS / (k.escS + k.escN) : null;
  const pctSobreContratado = k && k.freteTotal ? k.diffPosSum / k.freteTotal : null;
  const freteMedio = k && k.freteN ? k.freteTotal / k.freteN : null;
  const pctComparavel = k && k.freteN ? k.diffN / k.freteN : null;
  const pctNaoCruzada = k && k.totalContratacoes ? 1 - k.contratacoesCruzadas / k.totalContratacoes : null;

  // ---- renderEvolucao(mask) — porta exata do Artifact v42 ----
  // Só entram no gráfico os meses onde frete > 0 (meses sem contratação
  // cruzada, ex. mês em aberto, são omitidos). Se nMelhor de um mês é 0, o
  // ponto de "melhor" fica null (não desenha 0).
  const evoFiltrado = evolucaoMensal.filter((r) => r.frete > 0);
  const evoLabels = evoFiltrado.map((r) => fmtMes(r.mes));
  const freteData = evoFiltrado.map((r) => r.frete);
  const melhorData = evoFiltrado.map((r) => (r.nMelhor > 0 ? r.melhor : null));

  // ---- renderEconomiaMes(mask) — porta exata do Artifact v42 ----
  // Entra no gráfico se soma>0 OU se o mês é anterior ao mês mais recente da
  // base (mês em aberto com soma=0 fica de fora; mês fechado com soma=0
  // aparece como barra zerada). Comparação lexicográfica funciona porque o
  // formato é sempre "AAAA-MM".
  const ecoFiltrado = evolucaoMensal.filter((r) => r.diffPosSum > 0 || (maxMes != null && r.mes < maxMes));
  const ecoLabels = ecoFiltrado.map((r) => fmtMes(r.mes));
  const ecoData = ecoFiltrado.map((r) => r.diffPosSum);

  interface KpiTile {
    lbl: string;
    value: ReactNode;
    foot: string;
    nd?: boolean;
  }

  const kpiTiles: KpiTile[] = k
    ? [
        { lbl: "Frete Contratado", value: fmtBRL(k.freteTotal), foot: `${fmtNum(k.freteN)} processos com frete cruzado` },
        {
          lbl: "Diferença Financeira Identificada",
          value: fmtBRL(k.diffPosSum),
          foot: 'soma das diferenças positivas (pago acima da mais barata) — não é "economia perdida"',
        },
        {
          lbl: "Economia Capturada",
          value: "N/D",
          nd: true,
          foot: "a base não permite comprovar economia efetivamente capturada por uma ação confirmada",
        },
        {
          lbl: "% Escolheu a Mais Barata",
          value: fmtPct(pctBarata),
          foot: `${fmtNum(k.escS)} sim / ${fmtNum(k.escN)} não (${fmtNum(k.escSC)} sem comparação)`,
        },
        {
          lbl: "Diferença Média",
          value: (
            <>
              {fmtBRL2(k.diffMedia)} <small>/ {fmtPct(k.diffPMedia)}</small>
            </>
          ),
          foot: `sobre ${fmtNum(k.diffN)} processos comparáveis`,
        },
        { lbl: "Frete Médio", value: fmtBRL2(freteMedio), foot: "por processo com frete contratado" },
        { lbl: "Total de Cotações", value: fmtNum(k.cot), foot: "processos de cotação na base completa" },
        {
          lbl: "Total de Pedidos",
          value: fmtNum(k.pedidos),
          foot: "Pedido Nº distintos (grão adotado, ver comentário do código)",
        },
      ]
    : [];

  const JANELAS_FIXAS = ["Meio-dia", "Tarde"] as const;
  const JANELA_TAG: Record<(typeof JANELAS_FIXAS)[number], string> = {
    "Meio-dia": "Rede × Fritz",
    Tarde: "todas · ~18h+",
  };
  const janelaByName = new Map(janelas.map((j) => [j.janela, j]));

  const covNote = k ? (
    <div className="cov-note">
      <b>FATO — cobertura:</b> estes números cobrem ~1/3 da operação — {fmtNum(k.contratacoesCruzadas)}{" "}
      fretes contratados cruzam uma cotação ({fmtPct(pctComparavel)} comparáveis); os demais{" "}
      {pctNaoCruzada == null ? "—" : `~${fmtPct(pctNaoCruzada, 0)}`} ainda não têm cotação registrada
      para comparar. Limitação de fonte, não de método.
    </div>
  ) : null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
            <h1>Financeiro</h1>
            <p>
              KPIs executivos, evolução mensal e decisões de contratação — agregado sobre{" "}
              <b>toda a base de cotações</b> (sem filtro de período nesta etapa da migração).
            </p>
            <nav className="crumbs">
              <Link href="/">← Visão Geral</Link> · <Link href="/ontem">Ontem</Link> ·{" "}
              <Link href="/operacao">Operação</Link> · <Link href="/transportadoras">Transportadoras</Link>
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
        ) : !k ? (
          <div className="status-banner">Sem dados na base atual.</div>
        ) : (
          <FinanceiroTabs
            tabs={[
              { id: "fin-visao", label: "Visão Geral" },
              { id: "fin-cotado", label: "Cotado × Contratado" },
            ]}
            defaultTab="fin-visao"
          >
            <div className="subpage" data-subpage="fin-visao">
              <section className="bloc" style={{ marginTop: 0 }}>
                <div className="bloc-head">
                  <h2>KPIs executivos</h2>
                  <div className="desc">Base completa · sem comparação de período</div>
                </div>
                {covNote}
                <div className="grid kpis">
                  {kpiTiles.map((t) => (
                    <div className={`card kpi${t.nd ? " nd" : ""}`} key={t.lbl}>
                      <div className="lbl">{t.lbl}</div>
                      <div className="val">{t.value}</div>
                      <span className="delta na">sem comparação (período completo)</span>
                      <div className="foot">{t.foot}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bloc">
                <div className="bloc-head">
                  <h2>Meio-dia × Tarde</h2>
                  <div className="desc">os dois momentos de contratação do dia — janela pela hora da contratação (estimativa)</div>
                </div>
                <div className="grid cols2-even">
                  {JANELAS_FIXAS.map((jname) => {
                    const j = janelaByName.get(jname);
                    return (
                      <div className="card" key={jname}>
                        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {jname} <span className="pill sc">{JANELA_TAG[jname]}</span>
                        </h3>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: "8px 12px",
                            marginTop: 11,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>
                              Romaneios
                            </div>
                            <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>
                              {fmtNum(j?.n_romaneios)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>
                              Pedidos
                            </div>
                            <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>
                              {fmtNum(j?.n_pedidos)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>
                              Frete
                            </div>
                            <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>
                              {fmtBRL(j?.soma_frete_contratado)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>
                              Peso
                            </div>
                            <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
                              {fmtNum(j?.soma_peso_kg)} kg
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>
                              Cubagem
                            </div>
                            <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
                              {fmtNum(j?.soma_cubagem_m3, 1)} m³
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>
                              Contratações
                            </div>
                            <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
                              {fmtNum(j?.n_linhas)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="bloc">
                <div className="bloc-head">
                  <h2>Resumo executivo</h2>
                </div>
                {covNote}
                <div className="exec-card">
                  <h3>Leitura automática da base completa</h3>
                  <div>
                    <p>
                      No período filtrado ({fmtNum(k.cot)} processos de cotação), o frete contratado somou{" "}
                      <b>{fmtBRL(k.freteTotal)}</b>, com uma Diferença Financeira Identificada de{" "}
                      <b>{fmtBRL(k.diffPosSum)}</b> ({fmtPct(pctSobreContratado)} sobre o contratado) frente à
                      cotação mais barata disponível — valor objetivo, não confirma erro ou economia recuperável.
                    </p>
                    <p>
                      A opção mais barata foi escolhida em <b>{fmtPct(pctBarata)}</b> dos processos comparáveis (
                      {fmtNum(k.escS)} de {fmtNum(k.escS + k.escN)}).
                    </p>
                    {topT && (
                      <p>
                        <b>{topT.transportadora}</b> concentra a maior fatia do valor contratado (
                        {fmtPct(topT.pct_participacao)}), tendo vencido a cotação por preço em{" "}
                        {fmtPct(topT.pct_mais_barata)} das vezes em que participou.
                      </p>
                    )}
                    {resumo?.topClienteNome && resumo.topClienteSoma != null && (
                      <p>
                        O cliente com maior oportunidade de economia individual é <b>{resumo.topClienteNome}</b>,
                        com {fmtBRL2(resumo.topClienteSoma)} acima da cotação mais barata.
                      </p>
                    )}
                    {resumo?.topRegiaoNome && resumo.topRegiaoMedia != null && resumo.topRegiaoMedia > 0 && (
                      <p>
                        A Região Comercial com maior diferença média por processo é <b>{resumo.topRegiaoNome}</b>{" "}
                        ({fmtBRL2(resumo.topRegiaoMedia)} em média).
                      </p>
                    )}
                    <p>
                      Por decisão da gestão ([DEC-25]) não há campo de &quot;motivo&quot;: as {fmtNum(k.escN)}{" "}
                      escolhas que não seguiram o menor preço são analisadas caso a caso pela gestão com a equipe
                      de cotação, não por classificação automática.
                    </p>
                  </div>
                </div>
              </section>

              <section className="bloc">
                <div className="card">
                  <h3>Pendências desta etapa</h3>
                  <div className="sub">4º bloco da Visão Geral original + demais sub-abas da página Financeiro</div>
                  <div className="alert-card info" style={{ marginTop: 8 }}>
                    <ul>
                      <li>
                        <span className="name">Simulação de Custo por Transportadora</span>
                        <span className="num" style={{ color: "var(--text-muted)", whiteSpace: "normal", textAlign: "right" }}>
                          fora de propósito nesta etapa — regra &quot;nunca estima, sempre real, operação a
                          operação&quot; merece validação própria, com mais tempo
                        </span>
                      </li>
                      <li>
                        <span className="name">Padrões da Diferença</span>
                        <span className="num" style={{ color: "var(--text-muted)" }}>não portada ainda</span>
                      </li>
                      <li>
                        <span className="name">Peso, Cubagem &amp; Custo</span>
                        <span className="num" style={{ color: "var(--text-muted)" }}>não portada ainda</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            </div>

            <div className="subpage" data-subpage="fin-cotado">
              <section className="bloc" style={{ marginTop: 0 }}>
                <div className="bloc-head">
                  <h2>Evolução financeira mensal</h2>
                  <div className="desc">Frete contratado x melhor cotação disponível · diferença financeira identificada por mês</div>
                </div>
                {covNote}
                <CotadoContratadoCharts
                  evoLabels={evoLabels}
                  freteData={freteData}
                  melhorData={melhorData}
                  ecoLabels={ecoLabels}
                  ecoData={ecoData}
                  escolheu={{ s: k.escS, n: k.escN, sc: k.escSC }}
                  diffN={diffNEscNao}
                />
              </section>

              <section className="bloc">
                <div className="card">
                  <h3>Fora do escopo desta etapa</h3>
                  <div className="sub">demais sub-abas da página original &quot;Financeiro&quot;</div>
                  <div className="alert-card info" style={{ marginTop: 8 }}>
                    <ul>
                      <li>
                        <span className="name">Padrões da Diferença</span>
                        <span className="num" style={{ color: "var(--text-muted)" }}>não portada ainda</span>
                      </li>
                      <li>
                        <span className="name">Peso, Cubagem &amp; Custo</span>
                        <span className="num" style={{ color: "var(--text-muted)" }}>não portada ainda</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          </FinanceiroTabs>
        )}
      </main>

      <footer className="app-footer">
        Documento-mãe desta migração: <code>mapa-migracao-tms-v3-2026-09-11.md</code> (projeto
        original, ver README).
      </footer>
    </div>
  );
}
