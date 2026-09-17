import Link from "next/link";
import { Suspense } from "react";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase-server";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OntemTendenciaChart, type OntemTendenciaRow } from "@/components/OntemTendenciaChart";
import { DiaSelector } from "@/components/DiaSelector";
import { fmtBRL, fmtBRL2, fmtNum, fmtPct, fmtDate, fmtMes, parseMulti, clsDif, EscPill } from "@/lib/format";

// Página "Resumo do Dia" (D-1) — decisões de contratação do dia mais
// recente com contratação cruzada a uma cotação. Porta, linha a linha, a
// lógica de `renderOntem()` / `coverageStatus()` / `radarCards()` do
// Artifact original (v40/v42) — ver `docs/mapa-migracao-tms-v3-2026-09-11.md`
// e `memoria/05_DICIONARIO_KPIS.md` (KPI-16, KPI-18/D7, Radar de Decisão
// D2/D3/D4/D6). Toda agregação pesada (janelas de 60/30 dias, mediana/IQR
// por bucket) é feita dentro do banco via RPC (`ontem_dia_referencia`,
// `ontem_kpis`, `ontem_contratacoes`, `ontem_cobertura` — migration
// `fn_ontem_view_e_funcoes`; `radar_prazo_hist`, `radar_d2`, `radar_d3`,
// `radar_d4`, `radar_d5`, `radar_d6` — migrations `fn_radar_decisao_d2_d3_d4_d6`,
// `fn_radar_d2_d6_add_drill_columns` e `radar_d1_prazo_real_e_d5_frete_minimo_observado`
// [D-32]/[D-33], 2026-09-17), nunca somando/agrupando linhas cruas
// no cliente. Só o SCORING + DEDUPLICAÇÃO final do Radar (barato — dezenas
// de candidatos no máximo) roda aqui em TypeScript, replicando literalmente
// a lógica de `radarCards()`.
//
// [TASK] SELETOR DE DIA — Mikael pediu (2026-09-16): "/ontem" continua
// mostrando por padrão o último dia com contratação cruzada
// (`ontem_dia_referencia()`, inalterada), mas o usuário precisa poder
// escolher outro dia específico pra ver o mesmo painel daquele dia — não é
// o motor de filtro global (11 dimensões, FilterBar/v_cotacao_filtros) de
// /financeiro/dados, é um seletor de DATA simples (`?dia=AAAA-MM-DD`), já
// que "Ontem" sempre foi um recorte de UM dia, nunca um intervalo. As RPCs
// `ontem_kpis`/`ontem_contratacoes`/`ontem_cobertura`/`radar_d2`/`d3`/`d4`/
// `d6` já recebiam `p_dia` como parâmetro — só faltava deixar o usuário
// escolher esse dia. Nova RPC `ontem_dias_disponiveis()` (migration
// `fn_ontem_dias_disponiveis`) lista os dias com dado (100 dias, 2026-01-02
// a 2026-08-27 — validado direto no Supabase) pra popular o seletor, nunca
// deixando escolher um dia sem contratação cruzada nenhuma. `DiaSelector`
// (componente novo) segue a mesma convenção do FilterBar (estado na URL,
// nenhuma função cruzando a fronteira Server→Client Component — ver
// [FIX 2026-09-15, D-30] em FilterBar.tsx).
//
// [TÍTULO] "Resumo do Dia" (2026-09-17, a pedido do Mikael) — o nome
// exibido pro usuário mudou de "Ontem" pra "Resumo do Dia" (e o item do
// menu, de "Hoje" pra igual, ver DashboardShell.tsx): nem "Hoje" nem
// "Ontem" descrevem certo um conteúdo que agora tem seletor de dia — o
// usuário pode escolher qualquer data. A rota `/ontem` e os nomes
// internos (RPCs, variáveis) não mudam de propósito — só o texto visível.
export const dynamic = "force-dynamic";

interface OntemKpis {
  n_contratacoes: number;
  n_romaneios: number;
  frete_contratado: number;
  diferenca_pos_sum: number;
  n_escolheu_sim: number;
  n_escolheu_nao: number;
  n_sem_comparacao: number;
  perda_nao_escolheu: number;
  n_comparaveis: number;
}

interface OntemLinha {
  romaneio: string | null;
  cliente: string | null;
  cidade: string | null;
  transportadora: string | null;
  frete_contratado: number;
  melhor_cotacao: number | null;
  diferenca_r: number | null;
  diferenca_pct: number | null;
  escolheu: "S" | "N" | "SC";
  janela: string | null;
}

interface OntemCobertura {
  m_dia: number;
  n_dia: number;
  pct_dia: number | null;
  m_prev: number;
  n_prev: number;
  pct_prev: number | null;
  amostra_insuficiente: boolean;
  baixa: boolean | null;
}

// ---- Radar de Decisão (D2/D3/D4/D6) — tipos das RPCs `radar_*` ----
interface DrillRow {
  romaneio: string | null;
  cliente: string | null;
  transportadora: string | null;
  frete_contratado: number;
  melhor_cotacao: number | null;
  diferenca_r: number | null;
}

interface RadarD2Row {
  romaneio: string | null;
  cidade: string | null;
  cliente: string | null;
  transportadora_contratada: string | null;
  transportadora_barata: string | null;
  frete_contratado: number;
  melhor_cotacao: number | null;
  diferenca_r: number;
  diferenca_pct: number | null;
  prazo_contratada: number | null;
  prazo_barata: number | null;
}

interface RadarD5Row {
  romaneio: string | null;
  cidade: string | null;
  cliente: string | null;
  transportadora: string | null;
  frete_contratado: number;
  frete_minimo_observado: number;
  diferenca_r: number;
}

interface RadarD3Row {
  cliente: string | null;
  cidade: string | null;
  transportadora_contratada: string | null;
  n: number;
  soma: number;
  moda_transportadora_barata: string | null;
  moda_vezes: number | null;
  drill: DrillRow[];
}

interface RadarD4Row {
  cidade: string | null;
  top_transportadora: string | null;
  n: number;
  fret: number;
  share: number;
  seg2: number | null;
  drill: DrillRow[];
}

interface RadarD6Row {
  romaneio: string | null;
  cidade: string | null;
  cliente: string | null;
  transportadora: string | null;
  frete_contratado: number;
  melhor_cotacao: number | null;
  diferenca_r: number | null;
  mediana: number;
  limite: number;
  bucket_n: number;
  faixa_peso: string | null;
  faixa_cubagem: string | null;
}

type RadarConf = "ALTA" | "MÉDIA" | "BAIXA";

interface RadarCardData {
  tipo: string;
  transp: string | null;
  magNum: number;
  titulo: string;
  magTxt: string;
  evid: string[];
  regra: string;
  conf: RadarConf;
  confMot: string;
  acao: string;
  drill: DrillRow[];
  score?: number;
}

interface OntemData {
  ref: string | null;
  diaMaisRecente: string | null;
  diasDisponiveis: string[];
  kpis: OntemKpis | null;
  linhas: OntemLinha[];
  cobertura: OntemCobertura | null;
  radar: RadarCardData[];
  tendencia: OntemTendenciaRow[];
}

/** Extrai "?dia=AAAA-MM-DD" da URL — só o formato; a validação contra a
 * lista de dias com contratação cruzada acontece dentro de getOntemData
 * (que já busca essa lista), pra não duplicar a chamada. */
function parseDiaParam(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function toDrillRows(arr: unknown): DrillRow[] {
  return ((arr as Record<string, unknown>[] | null) ?? []).map((d) => ({
    romaneio: (d.romaneio as string) ?? null,
    cliente: (d.cliente as string) ?? null,
    transportadora: (d.transportadora as string) ?? null,
    frete_contratado: Number(d.frete_contratado ?? 0),
    melhor_cotacao: d.melhor_cotacao == null ? null : Number(d.melhor_cotacao),
    diferenca_r: d.diferenca_r == null ? null : Number(d.diferenca_r),
  }));
}

// ---- Radar de Decisão: monta os candidatos dos 4 detectores (D2/D3/D4/D6)
// já agregados pelo banco, e replica literalmente o scoring + deduplicação
// de `radarCards()` do Artifact original (v40/v42) — ver prompt desta etapa
// (TASK-29 continuação, 2026-09-11) para a lógica de referência exata,
// validada card a card contra o Artifact via Playwright para o dia
// 2026-08-27 (5/5 cards batendo: 2× CONCENTRAÇÃO, 2× RECORRÊNCIA, 1×
// ANOMALIA DE PREÇO — D2 e o restante de D6 não entraram no top-5 por causa
// do limite de diversidade, exatamente como no Artifact).
function buildRadarCards(
  d2: RadarD2Row[],
  d3: RadarD3Row[],
  d4: RadarD4Row[],
  d5: RadarD5Row[],
  d6: RadarD6Row[],
  prazoHist: Map<string, number | null>
): RadarCardData[] {
  const cand: RadarCardData[] = [];

  // ---- D1/D2 — Oportunidade objetiva (prazo real) / a verificar (proxy) ----
  // [D-32] (2026-09-17): D1 usa o prazo REAL da oferta da alternativa nesta
  // MESMA cotação (ofertas.prazo_dias via v_ontem_radar.prazo_barata, ~87,5%
  // de cobertura) — "prestação de serviço" é tratada como equivalente ao
  // prazo por decisão do Mikael, não bloqueia mais o detector. Quando o
  // prazo real da alternativa for PIOR que o da contratada, o dado já prova
  // que não é oportunidade (troca legítima por prazo) — descarta a linha,
  // não rebaixa a confiança (R-ZERO: diferença ≠ erro). Só cai no fallback
  // D2 (proxy = mediana histórica) quando o prazo real da alternativa não
  // existe para esta cotação específica (~12,5% dos casos).
  for (const r of d2) {
    const pr = r.prazo_contratada;
    const pb = r.prazo_barata;
    if (pb != null && pr != null) {
      if (pb > pr) continue;
      cand.push({
        tipo: "OPORTUNIDADE OBJETIVA",
        transp: r.transportadora_contratada,
        magNum: r.diferenca_r,
        titulo: `Rom. ${r.romaneio ?? "—"} · ${r.cidade ?? "—"}`,
        magTxt: `+${fmtBRL(r.diferenca_r)} · ${fmtPct(r.diferenca_pct)}`,
        evid: [
          `contratou ${r.transportadora_contratada ?? "—"}; ${r.transportadora_barata} cotou mais barato o mesmo romaneio`,
          `prazo da alternativa ${pb}d ≤ ${pr}d da contratada — dado real desta cotação, não é proxy`,
        ],
        regra: 'esc="N" ∧ diferença>0 ∧ alternativa cotou o mesmo romaneio ∧ prazo real da alternativa ≤ prazo contratado',
        conf: "ALTA",
        confMot: 'prazo real da própria cotação (ofertas.prazo_dias) — "prestação" tratada como equivalente ao prazo',
        acao: "Renegociar",
        drill: [
          {
            romaneio: r.romaneio,
            cliente: r.cliente,
            transportadora: r.transportadora_contratada,
            frete_contratado: r.frete_contratado,
            melhor_cotacao: r.melhor_cotacao,
            diferenca_r: r.diferenca_r,
          },
        ],
      });
      continue;
    }
    const ph = r.transportadora_barata ? prazoHist.get(r.transportadora_barata) ?? null : null;
    const prazoOk = pr != null && ph != null && ph <= pr;
    const phTxt = ph != null ? (Number.isInteger(ph) ? String(ph) : fmtNum(ph, 1)) : "";
    const prazoTxt =
      pr != null && ph != null
        ? prazoOk
          ? `prazo da alternativa ~${phTxt}d (histórico) ≤ ${pr}d da contratada`
          : `prazo da alternativa ~${phTxt}d > ${pr}d da contratada — pode ser troca por prazo`
        : "prazo não comparável nesta linha";
    cand.push({
      tipo: "OPORTUNIDADE A VERIFICAR",
      transp: r.transportadora_contratada,
      magNum: r.diferenca_r,
      titulo: `Rom. ${r.romaneio ?? "—"} · ${r.cidade ?? "—"}`,
      magTxt: `+${fmtBRL(r.diferenca_r)} · ${fmtPct(r.diferenca_pct)}`,
      evid: [
        `contratou ${r.transportadora_contratada ?? "—"}; ${r.transportadora_barata} cotou mais barato o mesmo romaneio`,
        prazoTxt,
        "sem prazo real desta oferta específica — usando proxy histórico",
      ],
      regra: 'esc="N" ∧ diferença>0 ∧ alternativa cotou o mesmo romaneio',
      conf: prazoOk ? "MÉDIA" : "BAIXA",
      confMot:
        pr != null && ph != null
          ? "prazo por proxy (mediana histórica) — prazo real desta cotação ausente"
          : "sem prazo comparável, nem real nem por proxy",
      acao: "Investigar",
      drill: [
        {
          romaneio: r.romaneio,
          cliente: r.cliente,
          transportadora: r.transportadora_contratada,
          frete_contratado: r.frete_contratado,
          melhor_cotacao: r.melhor_cotacao,
          diferenca_r: r.diferenca_r,
        },
      ],
    });
  }

  // ---- D5 — Frete mínimo fora do parâmetro ----
  // [D-33] (2026-09-17): usa transportadoras.frete_minimo_observado
  // (ESTIMATIVA estatística, D-04) por decisão do Mikael, até a gestão
  // enviar a tabela oficial (frete_minimo_config) — reconciliar quando
  // chegar. Sempre rotulado como estimativa aqui, nunca como regra oficial.
  for (const r of d5) {
    cand.push({
      tipo: "FRETE MÍNIMO FORA DO PARÂMETRO",
      transp: r.transportadora,
      magNum: r.diferenca_r,
      titulo: `Rom. ${r.romaneio ?? "—"} · ${r.cidade ?? "—"}`,
      magTxt: `${fmtBRL(r.frete_contratado)} vs. piso observado ${fmtBRL(r.frete_minimo_observado)}`,
      evid: [
        `${r.transportadora ?? "—"} — frete contratado ${fmtBRL(r.frete_contratado)} abaixo do piso estatístico observado (${fmtBRL(r.frete_minimo_observado)})`,
        "piso é uma estimativa sobre o histórico real, ainda não a tabela oficial da gestão — quando ela chegar, este card passa a comparar contra o valor oficial",
      ],
      regra: "frete contratado < piso observado da transportadora (estimativa estatística, D-04)",
      conf: "MÉDIA",
      confMot: "piso observado estatisticamente — ainda não é o parâmetro oficial da gestão",
      acao: "Investigar",
      drill: [
        {
          romaneio: r.romaneio,
          cliente: r.cliente,
          transportadora: r.transportadora,
          frete_contratado: r.frete_contratado,
          melhor_cotacao: null,
          diferenca_r: r.diferenca_r,
        },
      ],
    });
  }

  // ---- D3 — Recorrência ----
  for (const r of d3) {
    cand.push({
      tipo: "RECORRÊNCIA",
      transp: r.transportadora_contratada,
      magNum: r.soma,
      titulo: `${r.cidade ?? "—"} · ${r.cliente ?? "—"}`.slice(0, 60),
      magTxt: `${r.n}× · ${fmtBRL(r.soma)} acumulado (60 dias)`,
      evid: [
        `${r.n} contratações acima da alternativa, sempre ${r.transportadora_contratada}`,
        r.moda_transportadora_barata
          ? `alternativa mais frequente nas cotações: ${r.moda_transportadora_barata} (${r.moda_vezes ?? 0}×)`
          : "sem alternativa recorrente clara",
      ],
      regra: 'mesmo (cliente, cidade, transportadora) com esc="N" ≥ 8× em 60 dias',
      conf: "ALTA",
      confMot: 'é contagem factual; "é oportunidade" ainda depende de prazo/prestação',
      acao: "Renegociar",
      drill: r.drill,
    });
  }

  // ---- D4 — Concentração ----
  for (const r of d4) {
    cand.push({
      tipo: "CONCENTRAÇÃO",
      transp: r.top_transportadora,
      magNum: r.share * r.fret,
      titulo: `${r.cidade ?? "—"} · ${r.top_transportadora ?? "—"}`,
      magTxt: `${fmtPct(r.share)} das ${r.n} contratações (30 dias)`,
      evid: [
        `${r.top_transportadora ?? "—"} = ${fmtPct(r.share)}; 2ª colocada = ${r.seg2 ? fmtPct(r.seg2) : "—"}`,
        `frete da cidade no período: ${fmtBRL(r.fret)}`,
      ],
      regra: "cidade com ≥ 10 contratações, ≥ 2 transportadoras já usadas e 1 delas ≥ 80% (30 dias)",
      conf: "ALTA",
      confMot: "factual; não afirma risco — é para avaliar se há 2ª opção viável",
      acao: "Avaliar concentração",
      drill: r.drill,
    });
  }

  // ---- D6 — Anomalia de preço ----
  for (const r of d6) {
    cand.push({
      tipo: "ANOMALIA DE PREÇO",
      transp: r.transportadora,
      magNum: r.frete_contratado - r.mediana,
      titulo: `Rom. ${r.romaneio ?? "—"} · ${r.cidade ?? "—"}`,
      magTxt: `${fmtBRL(r.frete_contratado)} vs. mediana ${fmtBRL(r.mediana)}`,
      evid: [
        `${r.transportadora ?? "—"} em ${r.faixa_peso ?? "—"} / ${r.faixa_cubagem ?? "—"} (base de ${r.bucket_n} operações)`,
        `acima de mediana + 3× IQR (${fmtBRL(r.limite)})`,
      ],
      regra: "freteC > mediana + 3·IQR da mesma transportadora e faixa (amostra ≥ 30)",
      conf: "MÉDIA",
      confMot: "pode ser carga atípica legítima — conferir NF / valor declarado",
      acao: "Investigar",
      drill: [
        {
          romaneio: r.romaneio,
          cliente: r.cliente,
          transportadora: r.transportadora,
          frete_contratado: r.frete_contratado,
          melhor_cotacao: r.melhor_cotacao,
          diferenca_r: r.diferenca_r,
        },
      ],
    });
  }

  // ---- Scoring + diversidade (idêntico ao Artifact: no máx. 2 do mesmo
  // tipo, 2 da mesma transportadora, 5 no total) ----
  const maxMag = Math.max(1, ...cand.map((c) => c.magNum || 0));
  cand.forEach((c) => {
    const w = c.conf === "ALTA" ? 1 : c.conf === "MÉDIA" ? 0.6 : 0.3;
    c.score = ((c.magNum || 0) / maxMag) * w;
  });

  const seenT: Record<string, number> = {};
  const seenTr: Record<string, number> = {};
  const out: RadarCardData[] = [];

  // Vaga reservada pro D5 [D-33, decisão Mikael 2026-09-17]: "abaixo do
  // piso" é questão de conformidade, não de tamanho financeiro — os
  // desvios em R$ costumam ser pequenos (centavos a poucos reais) perto de
  // RECORRÊNCIA/CONCENTRAÇÃO, então nunca ganhava do scoring por magnitude
  // e ficava sempre fora do top-5. Garante 1 card D5 (o de maior desvio do
  // dia) antes do resto disputar normalmente pelas vagas restantes.
  const d5Cands = cand
    .filter((c) => c.tipo === "FRETE MÍNIMO FORA DO PARÂMETRO")
    .sort((a, b) => (b.magNum || 0) - (a.magNum || 0));
  const resto = cand.filter((c) => c.tipo !== "FRETE MÍNIMO FORA DO PARÂMETRO").concat(d5Cands.slice(1));
  if (d5Cands[0]) {
    const c = d5Cands[0];
    out.push(c);
    seenT[c.tipo] = 1;
    seenTr[c.transp || "-"] = (seenTr[c.transp || "-"] || 0) + 1;
  }

  resto.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  for (const c of resto) {
    const kt = c.tipo;
    const kr = c.transp || "-";
    if ((seenT[kt] || 0) >= 2 || (seenTr[kr] || 0) >= 2) continue;
    seenT[kt] = (seenT[kt] || 0) + 1;
    seenTr[kr] = (seenTr[kr] || 0) + 1;
    out.push(c);
    if (out.length >= 5) break;
  }
  return out;
}

async function getRadarData(ref: string): Promise<RadarCardData[]> {
  const supabase = await createSupabaseServerClient();
  const [prazoRes, d2Res, d3Res, d4Res, d5Res, d6Res] = await Promise.all([
    supabase.rpc("radar_prazo_hist"),
    supabase.rpc("radar_d2", { p_dia: ref }),
    supabase.rpc("radar_d3", { p_dia: ref }),
    supabase.rpc("radar_d4", { p_dia: ref }),
    supabase.rpc("radar_d5", { p_dia: ref }),
    supabase.rpc("radar_d6", { p_dia: ref }),
  ]);
  for (const res of [prazoRes, d2Res, d3Res, d4Res, d5Res, d6Res]) {
    if (res.error) throw new Error(res.error.message);
  }

  const prazoHist = new Map<string, number | null>();
  for (const r of (prazoRes.data as Record<string, unknown>[]) ?? []) {
    prazoHist.set(r.transportadora as string, r.mediana == null ? null : Number(r.mediana));
  }

  const d2: RadarD2Row[] = ((d2Res.data as Record<string, unknown>[]) ?? []).map((r) => ({
    romaneio: (r.romaneio as string) ?? null,
    cidade: (r.cidade as string) ?? null,
    cliente: (r.cliente as string) ?? null,
    transportadora_contratada: (r.transportadora_contratada as string) ?? null,
    transportadora_barata: (r.transportadora_barata as string) ?? null,
    frete_contratado: Number(r.frete_contratado ?? 0),
    melhor_cotacao: r.melhor_cotacao == null ? null : Number(r.melhor_cotacao),
    diferenca_r: Number(r.diferenca_r ?? 0),
    diferenca_pct: r.diferenca_pct == null ? null : Number(r.diferenca_pct),
    prazo_contratada: r.prazo_contratada == null ? null : Number(r.prazo_contratada),
    prazo_barata: r.prazo_barata == null ? null : Number(r.prazo_barata),
  }));

  const d5: RadarD5Row[] = ((d5Res.data as Record<string, unknown>[]) ?? []).map((r) => ({
    romaneio: (r.romaneio as string) ?? null,
    cidade: (r.cidade as string) ?? null,
    cliente: (r.cliente as string) ?? null,
    transportadora: (r.transportadora as string) ?? null,
    frete_contratado: Number(r.frete_contratado ?? 0),
    frete_minimo_observado: Number(r.frete_minimo_observado ?? 0),
    diferenca_r: Number(r.diferenca_r ?? 0),
  }));

  const d3: RadarD3Row[] = ((d3Res.data as Record<string, unknown>[]) ?? []).map((r) => ({
    cliente: (r.cliente as string) ?? null,
    cidade: (r.cidade as string) ?? null,
    transportadora_contratada: (r.transportadora_contratada as string) ?? null,
    n: Number(r.n ?? 0),
    soma: Number(r.soma ?? 0),
    moda_transportadora_barata: (r.moda_transportadora_barata as string) ?? null,
    moda_vezes: r.moda_vezes == null ? null : Number(r.moda_vezes),
    drill: toDrillRows(r.drill),
  }));

  const d4: RadarD4Row[] = ((d4Res.data as Record<string, unknown>[]) ?? []).map((r) => ({
    cidade: (r.cidade as string) ?? null,
    top_transportadora: (r.top_transportadora as string) ?? null,
    n: Number(r.n ?? 0),
    fret: Number(r.fret ?? 0),
    share: Number(r.share ?? 0),
    seg2: r.seg2 == null ? null : Number(r.seg2),
    drill: toDrillRows(r.drill),
  }));

  const d6: RadarD6Row[] = ((d6Res.data as Record<string, unknown>[]) ?? []).map((r) => ({
    romaneio: (r.romaneio as string) ?? null,
    cidade: (r.cidade as string) ?? null,
    cliente: (r.cliente as string) ?? null,
    transportadora: (r.transportadora as string) ?? null,
    frete_contratado: Number(r.frete_contratado ?? 0),
    melhor_cotacao: r.melhor_cotacao == null ? null : Number(r.melhor_cotacao),
    diferenca_r: r.diferenca_r == null ? null : Number(r.diferenca_r),
    mediana: Number(r.mediana ?? 0),
    limite: Number(r.limite ?? 0),
    bucket_n: Number(r.bucket_n ?? 0),
    faixa_peso: (r.faixa_peso as string) ?? null,
    faixa_cubagem: (r.faixa_cubagem as string) ?? null,
  }));

  return buildRadarCards(d2, d3, d4, d5, d6, prazoHist);
}

async function getOntemData(diaEscolhido: string | null): Promise<OntemData> {
  const supabase = await createSupabaseServerClient();
  const [refRes, diasRes] = await Promise.all([
    supabase.rpc("ontem_dia_referencia"),
    supabase.rpc("ontem_dias_disponiveis"),
  ]);
  if (refRes.error) throw new Error(refRes.error.message);
  if (diasRes.error) throw new Error(diasRes.error.message);
  const diaMaisRecente = (refRes.data as string | null) ?? null;
  const diasDisponiveis = ((diasRes.data as Record<string, unknown>[]) ?? []).map((r) => String(r.dia));
  // Só aceita o dia escolhido na URL se ele realmente tem contratação
  // cruzada — senão cai no padrão (último dia), silenciosamente, em vez de
  // mostrar um painel vazio pra um dia inválido/digitado à mão na URL.
  const ref = diaEscolhido && diasDisponiveis.includes(diaEscolhido) ? diaEscolhido : diaMaisRecente;

  if (!ref) {
    return {
      ref: null,
      diaMaisRecente,
      diasDisponiveis,
      kpis: null,
      linhas: [],
      cobertura: null,
      radar: [],
      tendencia: [],
    };
  }

  const [kpisRes, linhasRes, coberturaRes, tendenciaRes, radar] = await Promise.all([
    supabase.rpc("ontem_kpis", { p_dia: ref }),
    supabase.rpc("ontem_contratacoes", { p_dia: ref }),
    supabase.rpc("ontem_cobertura", { p_dia: ref }),
    supabase.rpc("ontem_tendencia_15_dias"),
    getRadarData(ref),
  ]);
  for (const res of [kpisRes, linhasRes, coberturaRes, tendenciaRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const kpisRow = (kpisRes.data as Record<string, unknown>[])?.[0];
  const coberturaRow = (coberturaRes.data as Record<string, unknown>[])?.[0];

  const kpis: OntemKpis | null = kpisRow
    ? {
        n_contratacoes: Number(kpisRow.n_contratacoes ?? 0),
        n_romaneios: Number(kpisRow.n_romaneios ?? 0),
        frete_contratado: Number(kpisRow.frete_contratado ?? 0),
        diferenca_pos_sum: Number(kpisRow.diferenca_pos_sum ?? 0),
        n_escolheu_sim: Number(kpisRow.n_escolheu_sim ?? 0),
        n_escolheu_nao: Number(kpisRow.n_escolheu_nao ?? 0),
        n_sem_comparacao: Number(kpisRow.n_sem_comparacao ?? 0),
        perda_nao_escolheu: Number(kpisRow.perda_nao_escolheu ?? 0),
        n_comparaveis: Number(kpisRow.n_comparaveis ?? 0),
      }
    : null;

  const linhas: OntemLinha[] = ((linhasRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    romaneio: (r.romaneio as string) ?? null,
    cliente: (r.cliente as string) ?? null,
    cidade: (r.cidade as string) ?? null,
    transportadora: (r.transportadora as string) ?? null,
    frete_contratado: Number(r.frete_contratado ?? 0),
    melhor_cotacao: r.melhor_cotacao == null ? null : Number(r.melhor_cotacao),
    diferenca_r: r.diferenca_r == null ? null : Number(r.diferenca_r),
    diferenca_pct: r.diferenca_pct == null ? null : Number(r.diferenca_pct),
    escolheu: r.escolheu as "S" | "N" | "SC",
    janela: (r.janela as string) ?? null,
  }));

  const cobertura: OntemCobertura | null = coberturaRow
    ? {
        m_dia: Number(coberturaRow.m_dia ?? 0),
        n_dia: Number(coberturaRow.n_dia ?? 0),
        pct_dia: coberturaRow.pct_dia == null ? null : Number(coberturaRow.pct_dia),
        m_prev: Number(coberturaRow.m_prev ?? 0),
        n_prev: Number(coberturaRow.n_prev ?? 0),
        pct_prev: coberturaRow.pct_prev == null ? null : Number(coberturaRow.pct_prev),
        amostra_insuficiente: Boolean(coberturaRow.amostra_insuficiente),
        baixa: coberturaRow.baixa == null ? null : Boolean(coberturaRow.baixa),
      }
    : null;

  const tendencia: OntemTendenciaRow[] = ((tendenciaRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    dia: r.dia as string,
    soma_diff_pos: Number(r.soma_diff_pos ?? 0),
  }));

  return { ref, diaMaisRecente, diasDisponiveis, kpis, linhas, cobertura, radar, tendencia };
}

// Cobertura do dia

function CoberturaNote({ c }: { c: OntemCobertura | null }) {
  if (!c || c.amostra_insuficiente) return null;
  const baixa = Boolean(c.baixa);
  const txt =
    `Cobertura do dia: <b>${fmtPct(c.pct_dia)}</b> (${fmtNum(c.n_dia)} de ${fmtNum(c.m_dia)} comparáveis)` +
    (c.m_prev ? ` · média dos 30 dias anteriores: ${fmtPct(c.pct_prev)}` : "") +
    (baixa
      ? " — poucas cotações pra comparar hoje; confira o pipeline (D7)."
      : " — dentro do padrão (D7).");
  return (
    <div
      className={`cov-note${baixa ? "" : " ok"}`}
      style={{ margin: 0, marginBottom: 14 }}
      dangerouslySetInnerHTML={{ __html: (baixa ? "⚠ " : "✓ ") + txt }}
    />
  );
}

// ---- Radar de Decisão: renderização do card — porta `radarCardHTML()` do
// Artifact original 1:1 (mesmo mapeamento tipo → classe CSS/pill). ----
function radarCls(tipo: string): "crit" | "warn" | "info" {
  if (tipo === "ANOMALIA DE PREÇO") return "crit";
  if (tipo.startsWith("OPORTUNIDADE") || tipo === "RECORRÊNCIA") return "warn";
  return "info";
}
function radarPill(cls: "crit" | "warn" | "info"): "n" | "laranja" | "azul" {
  return cls === "crit" ? "n" : cls === "warn" ? "laranja" : "azul";
}

function RadarCardView({ c }: { c: RadarCardData }) {
  const cls = radarCls(c.tipo);
  const pill = radarPill(cls);
  return (
    <div className={`alert-card ${cls}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h4 style={{ justifyContent: "space-between", width: "100%" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <span className="dot" />
          {c.tipo}
        </span>
        <span className={`pill ${pill}`}>{c.acao}</span>
      </h4>
      <div style={{ fontFamily: "var(--font-manrope)", fontWeight: 800, fontSize: 13, color: "var(--text-primary)" }}>
        {c.titulo}
      </div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
        {c.magTxt}
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          fontSize: 11.5,
          color: "var(--text-secondary)",
        }}
      >
        {c.evid.map((e, i) => (
          <li key={i}>• {e}</li>
        ))}
      </ul>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--text-muted)",
          borderTop: "1px dashed var(--border)",
          paddingTop: 6,
          lineHeight: 1.5,
        }}
      >
        Regra: {c.regra}
        <br />
        Confiabilidade: <b>{c.conf}</b> — {c.confMot}
      </div>
      {c.drill.length > 0 && (
        <details style={{ fontSize: 11 }}>
          <summary style={{ cursor: "pointer", color: "var(--brand-700)", fontWeight: 600 }}>
            ver {c.drill.length} operação(ões)
          </summary>
          <div className="table-scroll" style={{ marginTop: 6 }}>
            <table className="data compact">
              <thead>
                <tr>
                  <th>Rom.</th>
                  <th>Cliente</th>
                  <th>Transp.</th>
                  <th className="num">Frete</th>
                  <th className="num">Menor</th>
                  <th className="num">Dif R$</th>
                </tr>
              </thead>
              <tbody>
                {c.drill.map((d, i) => (
                  <tr key={i}>
                    <td>{d.romaneio ?? "—"}</td>
                    <td>{d.cliente ?? "—"}</td>
                    <td>{d.transportadora ?? "—"}</td>
                    <td className="num">{fmtBRL(d.frete_contratado)}</td>
                    <td className="num">{fmtBRL(d.melhor_cotacao)}</td>
                    <td className="num">{d.diferenca_r == null ? "—" : fmtBRL(d.diferenca_r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

type OntemSearchParams = Record<string, string | string[] | undefined>;

export default async function OntemPage({ searchParams }: { searchParams: Promise<OntemSearchParams> }) {
  // [D-28] Rede de segurança independente de proxy.ts — ver comentário em
  // src/lib/supabase-server.ts.
  await requireUser("/ontem");
  const sp = await searchParams;
  const diaEscolhido = parseDiaParam(sp.dia);
  let data: OntemData | null = null;
  let erro: string | null = null;
  try {
    data = await getOntemData(diaEscolhido);
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  const kpis = data?.kpis;
  const ref = data?.ref ?? null;
  const diaMaisRecente = data?.diaMaisRecente ?? null;
  const diasDisponiveis = data?.diasDisponiveis ?? [];
  const linhas = data?.linhas ?? [];
  const cobertura = data?.cobertura ?? null;
  const radarCardsList = data?.radar ?? [];

  const pctBarata =
    kpis && kpis.n_escolheu_sim + kpis.n_escolheu_nao > 0
      ? kpis.n_escolheu_sim / (kpis.n_escolheu_sim + kpis.n_escolheu_nao)
      : null;

  const kpiTiles: [string, string, string][] = kpis
    ? [
        ["Contratações", fmtNum(kpis.n_contratacoes), `${fmtNum(kpis.n_romaneios)} romaneios`],
        ["Frete contratado", fmtBRL(kpis.frete_contratado), "soma do dia"],
        ["Diferença vs. menor cotação", fmtBRL(kpis.diferenca_pos_sum), "só diferenças positivas"],
        [
          "Escolheu a mais barata",
          pctBarata == null ? "—" : fmtPct(pctBarata),
          `${fmtNum(kpis.n_escolheu_sim)} de ${fmtNum(kpis.n_escolheu_sim + kpis.n_escolheu_nao)} comparáveis`,
        ],
        [
          "Não escolheu a mais barata",
          fmtNum(kpis.n_escolheu_nao),
          `${fmtBRL(kpis.perda_nao_escolheu)} de diferença`,
        ],
        ["Sem comparação", fmtNum(kpis.n_sem_comparacao), "contratação sem cotação registrada"],
      ]
    : [];

  const comCmp = kpis?.n_comparaveis ?? 0;
  const totalDia = kpis?.n_contratacoes ?? 0;
  const tendencia = data?.tendencia ?? [];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
            <h1>Resumo do Dia — decisões de contratação</h1>
            <p>
              Fechamento do último dia com contratações registradas e comparadas a uma cotação.
              Você pode escolher outro dia específico no seletor abaixo.
            </p>
            <nav className="crumbs">
              <Link href="/">← Visão Geral</Link>
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
        ) : !ref ? (
          <div className="status-banner">Sem contratações cruzadas a uma cotação nos dados atuais.</div>
        ) : (
          <>
            <section className="bloc" style={{ marginTop: 0 }}>
              <div className="bloc-head" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <h2>Resumo do Dia — decisões de contratação</h2>
                <Suspense fallback={<div className="dia-selector" />}>
                  <DiaSelector dias={diasDisponiveis} atual={ref} diaMaisRecente={diaMaisRecente} />
                </Suspense>
              </div>
              <div className="op-note" style={{ marginBottom: 16 }}>
                Decisões de <b>{fmtDate(ref)}</b> &middot; {fmtNum(totalDia)} contratações &middot;{" "}
                {fmtNum(comCmp)} de {fmtNum(totalDia)} com cotação para comparar (
                {fmtPct(totalDia ? comCmp / totalDia : 0)})
              </div>
              <div className="grid op-kpis">
                {kpiTiles.map(([l, v, f]) => (
                  <div className="card kpi" key={l}>
                    <div className="lbl">{l}</div>
                    <div className="val">{v}</div>
                    <div className="foot">{f}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bloc">
              <div className="bloc-head">
                <h2>Radar de Decisão</h2>
                <div className="desc">
                  poucas situações que merecem atenção — cada card diz o que fazer, e apresenta
                  evidência (não acusa erro)
                </div>
              </div>
              <CoberturaNote c={cobertura} />
              {radarCardsList.length === 0 ? (
                <div className="sim-empty">
                  <b>Operação dentro do padrão neste dia.</b>
                  <br />
                  nenhuma situação passou dos limiares do Radar.
                </div>
              ) : (
                <div className="grid cols-auto">
                  {radarCardsList.map((c, i) => (
                    <RadarCardView c={c} key={i} />
                  ))}
                </div>
              )}
            </section>

            {/* Card "Aguardando dado / regra" (D1/D5) removido em 2026-09-17:
                os dois detectores que ele bloqueava foram ligados nesta
                etapa ([D-32]/[D-33]) — ver comentário no topo do arquivo. */}
            <section className="bloc">
              <OntemTendenciaChart rows={tendencia} diaRef={ref} />
            </section>

            <section className="bloc">
              <div className="bloc-head">
                <h2>Todas as contratações do dia</h2>
                <div className="desc">ordenado pela diferença em R$ — cor classifica a faixa, não julga a decisão</div>
              </div>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Romaneio</th>
                      <th>Cliente</th>
                      <th>Cidade</th>
                      <th>Transportadora contratada</th>
                      <th className="num">Frete pago</th>
                      <th className="num">Menor cotação</th>
                      <th className="num">Diferença R$</th>
                      <th className="num">Diferença %</th>
                      <th>Escolheu a + barata?</th>
                      <th>Janela</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ color: "var(--text-muted)" }}>
                          Sem contratações neste dia.
                        </td>
                      </tr>
                    ) : (
                      linhas.map((r, i) => {
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
