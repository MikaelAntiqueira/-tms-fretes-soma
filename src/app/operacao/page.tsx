import Link from "next/link";
import { Suspense } from "react";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase-server";
import { PageHeader } from "@/components/PageHeader";
import { FilterBar, type FilterDimension } from "@/components/FilterBar";

// Página "Operação" (Controle Operacional de Carregamento), rota /operacao.
// Diferente de /ontem: NÃO é por dia — agrega TODA a base de contratações
// cruzadas (cotacao_id preenchido), sem filtro de dia (mesma simplificação
// já usada em /ontem nesta etapa da migração). Porta, linha a linha, a
// lógica de `renderOperacao(mask)` do Artifact original (v42) — ver
// `docs/mapa-migracao-tms-v3-2026-09-11.md`, `memoria/05_DICIONARIO_KPIS.md`
// e `docs/frete-minimo-observado-2026-09.md`.
//
// Toda soma/contagem distinta é feita DENTRO do banco via RPC
// (`operacao_kpis`, `operacao_por_transportadora`, `operacao_por_janela`,
// `operacao_por_janela_transportadora`, `operacao_por_cidade` — migration
// `fn_operacao_view_e_funcoes` + `fix_operacao_base_dedup_e_peso_fallback`),
// nunca somando linhas cruas no cliente: são ~5.194 linhas cruzadas, acima
// do limite padrão de 1000 linhas/requisição do PostgREST.
//
// Reaproveita a view v_ontem_comparacao (romaneio recuperado do pedido,
// janela e melhor cotação no recorte certo) como base — não duplica essa
// lógica. O piso de frete OBSERVADO (ESTIMATIVA, não tabela oficial) vem de
// `transportadoras.frete_minimo_observado`, nunca hardcoded no TS.
//
// ============================================================================
// [FIX 2026-09-16] KPIs do topo somavam só cruzadas — [D-06] pede TODA a base
// ============================================================================
// Achado validando contra o Artifact original (`function renderOperacao`,
// v40): Romaneios/Pedidos/Peso real/Volumes/Cubagem somam sobre TODA a base
// de cotações do recorte, não só as cruzadas a uma contratação — só "Frete
// Contratado" fica restrito às cruzadas. [D-06] (já FINAL neste repo) já
// dizia isso ("Total de Cotações"/"Total de Pedidos" contam toda a base).
// `operacao_dashboard_estatico()` corrigido (migration `fix_operacao_kpis_
// toda_base_nao_so_cruzadas`) pra usar `cotacoes` (com COALESCE pra pedido/
// peso puxando da contratação vinculada quando a cotação não tem — mesmo
// fallback do Python original, `codigo/build_workbook.py`). Validado: 4 dos
// 5 KPIs batem exato com o Artifact (Pedidos 5.324, Peso real 666.784 kg,
// Volumes 67.198, Cubagem 2.507,0 m³); só Romaneios fica em 429 (Artifact
// mostra 496) — a diferença é uma heurística legada de dado
// (`_romaneio_do_pedido()`, derivava um romaneio sintético do texto do
// pedido) que não existe mais no schema atual (`contratacoes` não tem
// coluna romaneio) — decisão deliberada de não replicar essa heurística.
// `carriers`/`janela_carriers`/`cidades` (tabelas "Quem está carregando" e
// "Cidade × Transportadora") NÃO mudaram — continuam só cruzadas, já
// validados exatos (precisam de "menor cotação", que só existe cruzada).
//
// ============================================================================
// [FIX 2026-09-14] 500 em produção — recomputo redundante de v_operacao_base
// ============================================================================
// Achado com prova em log: esta página disparava, num único Promise.all, 7
// RPCs — 4 delas (operacao_kpis, operacao_por_transportadora, operacao_por_
// janela_transportadora, operacao_por_cidade) recomputavam de forma
// INDEPENDENTE e CONCORRENTE a mesma view cara `v_operacao_base` (~900ms
// sozinha, warm cache — medido via EXPLAIN ANALYZE). Rodando as 4 ao mesmo
// tempo (mais a 5ª, operacao_por_janela, que também toca v_operacao_base),
// qualquer contenção ou cache frio empurra o tempo real acima do
// `statement_timeout` do role `authenticated` (8s — bem menor que os 2min do
// role padrão/postgres). Isso gerou 5 timeouts reais capturados em
// `postgrest_logs`/`postgres_logs` em 2026-09-14T12:10 (`POST /rpc/
// operacao_por_janela` → 500, "canceling statement due to statement
// timeout") — a causa raiz real do "erro 500 em /operacao" relatado pelo
// Mikael, distinta da duplicação de middleware.ts/proxy.ts corrigida numa
// sessão anterior (essa resolvia o guard de auth, não este timeout).
//
// Correção (migration `fix_operacao_dashboard_estatico_reduz_recomputo_v_
// operacao_base`, ver [D-26] em LOG_DECISOES.md): nova RPC
// `operacao_dashboard_estatico()` materializa v_operacao_base UMA vez e
// deriva dela as 4 agregações estáticas (kpis/carriers/janela×transportadora/
// cidades), retornando tudo num único jsonb. `operacao_por_janela` continua
// separada (é a única com os 4 parâmetros do filtro global — combiná-la
// aqui obrigaria a recomputar tudo a cada mudança de filtro), mas sua CTE
// interna ganhou `materialized` como segurança adicional. Resultado: 5
// recomputos concorrentes de v_operacao_base por carregamento →  2.
// As 4 functions antigas (operacao_kpis, operacao_por_transportadora,
// operacao_por_janela_transportadora, operacao_por_cidade) foram mantidas no
// banco (não removidas) — regredidas contra o novo RPC, números idênticos.
//
// ============================================================================
// [TASK-29] MOTOR DE FILTRO GLOBAL — FASE 1, continuação /operacao
// (2026-09-12/13). Estende para esta página o MESMO padrão já usado em
// /financeiro (ver comentário completo em src/components/FilterBar.tsx e no
// topo de src/app/financeiro/page.tsx): mesmo componente <FilterBar>, mesma
// convenção de URL (?mes=/?transportadora=/?regiao=/?tipo=, multi-valor por
// vírgula), mesma convenção de "null = todos".
//
// ESCOPO REDUZIDO, deliberado (mesma decisão já tomada em /financeiro): só a
// função `operacao_por_janela` já tinha os 4 parâmetros opcionais
// (`p_meses/p_transportadoras/p_regioes/p_tipos`, adicionados numa etapa
// anterior pensando nesta extensão futura — ver migration
// `fn_filtro_global_fase1_visao_geral`). As outras 4 RPCs desta página
// (`operacao_kpis`, `operacao_por_transportadora`,
// `operacao_por_janela_transportadora`, `operacao_por_cidade`) NÃO ganharam
// parâmetros nesta rodada — então só a seção "Meio-dia × Tarde" REAGE ao
// filtro (os 5 números agregados de cada janela: contratações/romaneios/
// pedidos/peso/cubagem/frete). As seções "KPIs" (topo), "Quem está
// carregando", "Distribuição do frete contratado" e "Cidade ×
// Transportadora" continuam mostrando SEMPRE a base completa, sem filtro —
// não é esquecimento, é o mesmo corte de escopo já documentado em
// /financeiro (lá só a sub-aba "Visão Geral" reage).
//
// LIMITAÇÃO ADICIONAL, também deliberada: dentro da própria seção "Meio-dia
// × Tarde", o "top 3 transportadoras" de cada janela (barra + %) vem de
// `operacao_por_janela_transportadora`, que também NÃO tem os 4 parâmetros
// — então, com um filtro ativo, os 5 números agregados do card (em cima)
// mudam, mas o "top 3" abaixo continua mostrando a distribuição da BASE
// COMPLETA daquela janela. Um aviso no card avisa disso quando há filtro
// ativo. Estender `operacao_por_janela_transportadora` do mesmo jeito
// (`create or replace function` com os 4 parâmetros novos, default null,
// mesma assinatura) fica para uma etapa futura — não foi necessário para
// entregar o pedido desta rodada (filtro global em /operacao e
// /transportadoras) e mantém a mudança de SQL desta etapa mínima (só 1
// function nova, aditiva: `filtro_opcoes_mes()`, ver abaixo).
//
// Opções dos 4 dropdowns: Mês vem de `filtro_opcoes_mes()` (function nova,
// aditiva — /financeiro já busca a lista de meses reaproveitando
// `financeiro_evolucao_mensal()`, que esta página não chama; `filtro_
// opcoes_mes()` existe justamente para não obrigar uma RPC nova maior só
// para listar 9 valores). Região/Tipo vêm de `financeiro_filtro_opcoes()`
// (já existe, reaproveitada — não criamos outra). Transportadora usa
// TRANSP_ORDER, a mesma lista fixa das 7 transportadoras já usada em
// CARRIER_COLOR nesta página e em /financeiro/transportadoras.
//
// Validado direto no Supabase (com e sem filtro): `operacao_por_janela()`
// sem args == Meio-dia 976 linhas/R$51.742,43, Tarde 4.218/R$442.675,00
// (mesmos números de sempre, regressão zero); `operacao_por_janela(mes=
// '2026-08')` == Meio-dia 276/R$13.685,36, Tarde 1.282/R$138.451,23 —
// idêntico a `select ... from v_operacao_base where cotacao_id in (select
// cotacao_id from v_cotacao_filtros where mes='2026-08')` direto em SQL.
//
// ATUALIZAÇÃO (2026-09-17): os parágrafos acima descrevem o escopo ORIGINAL
// (só "Meio-dia × Tarde" reage, só 4 dimensões) — mantidos como histórico.
// Desde então: `operacao_por_janela()` já tinha ganho as 11 dimensões de
// graça (reaproveitada por /financeiro); `operacao_dashboard_estatico()`
// ganhou as mesmas 11 (migration `fn_operacao_dashboard_estatico_add_
// filtro_global_11_dimensoes`) — como ela também gera `janela_carriers`
// (o "top 3 transportadoras" por janela), a "LIMITAÇÃO ADICIONAL" acima
// (`operacao_por_janela_transportadora` sem filtro) deixou de existir
// junto: essa function antiga nunca foi usada pelo card, só a
// deprecated/mantida por regressão (ver [FIX 2026-09-14]). `filtro_opcoes_
// mes()`/`financeiro_filtro_opcoes()` saíram de uso — as opções dos 11
// dropdowns (com cascata real) vêm de `financeiro_filtro_opcoes_cascata()`
// (mesma RPC de /financeiro e /transportadoras). `<FilterBar>` subiu pro
// topo da página (era só dentro de "Meio-dia × Tarde"). Todas as seções
// reagem ao filtro agora.
export const dynamic = "force-dynamic";

const CARRIER_COLOR: Record<string, string> = {
  "Fritz Express": "var(--t1)",
  LKW: "var(--t2)",
  Leomar: "var(--t3)",
  Minuano: "var(--t4)",
  "Rede Nacional": "var(--t5)",
  "Santa Cruz": "var(--t6)",
  "São Miguel": "var(--t7)",
};
function carrierColor(t: string | null): string {
  return (t && CARRIER_COLOR[t]) || "var(--text-muted)";
}

// Mesma lista fixa das 7 transportadoras usada em /financeiro (TRANSP_ORDER)
// — opções do dropdown "Transportadora Contratada" do FilterBar. Não é uma
// query nova: mesma decisão já usada em CARRIER_COLOR acima.
const TRANSP_ORDER = Object.keys(CARRIER_COLOR);

interface OperacaoKpis {
  n_romaneios: number;
  n_pedidos: number;
  soma_volumes: number;
  soma_peso_kg: number;
  soma_cubagem_m3: number;
  soma_frete_contratado: number;
}

interface CarrierRow {
  transportadora: string;
  n_romaneios: number;
  n_pedidos: number;
  soma_volumes: number;
  soma_peso_kg: number;
  soma_cubagem_m3: number;
  soma_frete_contratado: number;
  frete_minimo_observado: number | null;
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

interface JanelaCarrierRow {
  janela: string;
  transportadora: string;
  soma_frete_contratado: number;
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
  cidade_total_frete: number;
}

interface OperacaoData {
  kpis: OperacaoKpis | null;
  carriers: CarrierRow[];
  janelas: JanelaRow[];
  janelaCarriers: JanelaCarrierRow[];
  cidades: CidadeRow[];
  opcoesMeses: string[];
  opcoesRegioes: string[];
  opcoesTipos: string[];
  opcoesRomaneios: string[];
  opcoesEsc: string[];
  opcoesPrazos: number[];
  opcoesCidades: string[];
  opcoesJanelas: string[];
  opcoesFaixasPeso: string[];
  opcoesFaixasCubagem: string[];
}

// Filtros do motor de filtro global — as 11 dimensões completas (upgrade
// 2026-09-17, mesma convenção de src/app/financeiro/page.tsx; `null` numa
// dimensão = sem filtro nela). `prazos` fica number[] (não string[]) porque
// a coluna/param SQL são int[].
interface FiltrosOperacao {
  meses: string[] | null;
  transportadoras: string[] | null;
  regioes: string[] | null;
  tipos: string[] | null;
  romaneios: string[] | null;
  esc: string[] | null;
  prazos: number[] | null;
  cidades: string[] | null;
  janelas: string[] | null;
  faixasPeso: string[] | null;
  faixasCubagem: string[] | null;
}

// Shape do jsonb retornado por operacao_dashboard_estatico() — ver
// comentário [FIX 2026-09-14] no topo do arquivo.
interface DashboardEstatico {
  kpis?: Record<string, unknown> | null;
  carriers?: Record<string, unknown>[];
  janela_carriers?: Record<string, unknown>[];
  cidades?: Record<string, unknown>[];
}

async function getOperacaoData(filtros: FiltrosOperacao): Promise<OperacaoData> {
  const supabase = await createSupabaseServerClient();
  // [2026-09-17] Upgrade pras 11 dimensões completas — `operacao_por_janela`
  // já tinha os 11 parâmetros (ganhou de graça quando /financeiro passou a
  // reaproveitá-la, migration fn_filtro_global_fase1_7_dimensoes_restantes).
  // Só faltava `operacao_dashboard_estatico` (migration
  // fn_operacao_dashboard_estatico_add_filtro_global_11_dimensoes) — mantém
  // a mesma estrutura de 1 RPC só materializando v_operacao_base (ver [FIX
  // 2026-09-14] no topo do arquivo), não reintroduz o timeout do D-26.
  const filtroArgs = {
    p_meses: filtros.meses,
    p_transportadoras: filtros.transportadoras,
    p_regioes: filtros.regioes,
    p_tipos: filtros.tipos,
    p_romaneios: filtros.romaneios,
    p_esc: filtros.esc,
    p_prazos: filtros.prazos,
    p_cidades: filtros.cidades,
    p_janelas: filtros.janelas,
    p_faixas_peso: filtros.faixasPeso,
    p_faixas_cubagem: filtros.faixasCubagem,
  };

  const [dashRes, janelasRes, opcoesRes] = await Promise.all([
    // ---- [FIX 2026-09-14] 1 RPC só para as 4 agregações estáticas (antes
    // eram operacao_kpis + operacao_por_transportadora + operacao_por_
    // janela_transportadora + operacao_por_cidade, cada uma recomputando
    // v_operacao_base do zero — ver comentário no topo do arquivo) ----
    supabase.rpc("operacao_dashboard_estatico", filtroArgs),
    supabase.rpc("operacao_por_janela", filtroArgs),
    // ---- cascata real pras 11 dimensões (reaproveita a RPC de /financeiro,
    // page-agnostic — só lê v_cotacao_filtros) — Transportadora continua
    // TRANSP_ORDER (fixo, também usado em CARRIER_COLOR nesta página) ----
    supabase.rpc("financeiro_filtro_opcoes_cascata", filtroArgs),
  ]);
  for (const res of [dashRes, janelasRes, opcoesRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const dash = (dashRes.data ?? {}) as DashboardEstatico;

  const kpisRow = dash.kpis ?? undefined;
  const kpis: OperacaoKpis | null = kpisRow
    ? {
        n_romaneios: Number(kpisRow.n_romaneios ?? 0),
        n_pedidos: Number(kpisRow.n_pedidos ?? 0),
        soma_volumes: Number(kpisRow.soma_volumes ?? 0),
        soma_peso_kg: Number(kpisRow.soma_peso_kg ?? 0),
        soma_cubagem_m3: Number(kpisRow.soma_cubagem_m3 ?? 0),
        soma_frete_contratado: Number(kpisRow.soma_frete_contratado ?? 0),
      }
    : null;

  const carriers: CarrierRow[] = (dash.carriers ?? []).map((r) => ({
    transportadora: String(r.transportadora),
    n_romaneios: Number(r.n_romaneios ?? 0),
    n_pedidos: Number(r.n_pedidos ?? 0),
    soma_volumes: Number(r.soma_volumes ?? 0),
    soma_peso_kg: Number(r.soma_peso_kg ?? 0),
    soma_cubagem_m3: Number(r.soma_cubagem_m3 ?? 0),
    soma_frete_contratado: Number(r.soma_frete_contratado ?? 0),
    frete_minimo_observado: r.frete_minimo_observado == null ? null : Number(r.frete_minimo_observado),
  }));

  const janelas: JanelaRow[] = ((janelasRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    janela: String(r.janela),
    n_linhas: Number(r.n_linhas ?? 0),
    n_romaneios: Number(r.n_romaneios ?? 0),
    n_pedidos: Number(r.n_pedidos ?? 0),
    soma_peso_kg: Number(r.soma_peso_kg ?? 0),
    soma_cubagem_m3: Number(r.soma_cubagem_m3 ?? 0),
    soma_frete_contratado: Number(r.soma_frete_contratado ?? 0),
  }));

  const janelaCarriers: JanelaCarrierRow[] = (dash.janela_carriers ?? []).map((r) => ({
    janela: String(r.janela),
    transportadora: String(r.transportadora),
    soma_frete_contratado: Number(r.soma_frete_contratado ?? 0),
  }));

  const cidades: CidadeRow[] = (dash.cidades ?? []).map((r) => ({
    cidade: String(r.cidade),
    transportadora: String(r.transportadora),
    n_romaneios: Number(r.n_romaneios ?? 0),
    n_pedidos: Number(r.n_pedidos ?? 0),
    soma_peso_kg: Number(r.soma_peso_kg ?? 0),
    soma_cubagem_m3: Number(r.soma_cubagem_m3 ?? 0),
    soma_frete_contratado: Number(r.soma_frete_contratado ?? 0),
    soma_melhor_cotacao: Number(r.soma_melhor_cotacao ?? 0),
    soma_diferenca_r: Number(r.soma_diferenca_r ?? 0),
    cidade_total_frete: Number(r.cidade_total_frete ?? 0),
  }));

  const opcoesRow = (opcoesRes.data as Record<string, unknown>[])?.[0];
  const opcoesMeses: string[] = (opcoesRow?.meses as string[] | null) ?? [];
  const opcoesRegioes: string[] = (opcoesRow?.regioes as string[] | null) ?? [];
  const opcoesTipos: string[] = (opcoesRow?.tipos as string[] | null) ?? [];
  const opcoesRomaneios: string[] = (opcoesRow?.romaneios as string[] | null) ?? [];
  const opcoesEsc: string[] = (opcoesRow?.escs as string[] | null) ?? [];
  const opcoesPrazos: number[] = ((opcoesRow?.prazos as string[] | null) ?? []).map(Number);
  const opcoesCidades: string[] = (opcoesRow?.cidades as string[] | null) ?? [];
  const opcoesJanelas: string[] = (opcoesRow?.janelas as string[] | null) ?? [];
  const opcoesFaixasPeso: string[] = (opcoesRow?.faixas_peso as string[] | null) ?? [];
  const opcoesFaixasCubagem: string[] = (opcoesRow?.faixas_cubagem as string[] | null) ?? [];

  return {
    kpis, carriers, janelas, janelaCarriers, cidades,
    opcoesMeses, opcoesRegioes, opcoesTipos, opcoesRomaneios, opcoesEsc,
    opcoesPrazos, opcoesCidades, opcoesJanelas, opcoesFaixasPeso, opcoesFaixasCubagem,
  };
}

import { fmtBRL, fmtBRLSigned, fmtNum, fmtPct, parseMulti, clsDifSobreFrete } from "@/lib/format";

// Classifica a magnitude da diferença sobre o frete DA PRÓPRIA LINHA (não
// sobre a menor cotação, como em /ontem) — regra exata do Artifact de
// referência para a tabela Cidade x Transportadora (já em @/lib/format).
function CarrierDot({ t }: { t: string }) {
  return <span className="carrier-dot" style={{ background: carrierColor(t) }} />;
}

type OperacaoSearchParams = Record<string, string | string[] | undefined>;

export default async function OperacaoPage({
  searchParams,
}: {
  searchParams: Promise<OperacaoSearchParams>;
}) {
  // [D-28] Rede de segurança independente de proxy.ts — ver comentário em
  // src/lib/supabase-server.ts.
  await requireUser("/operacao");
  const sp = await searchParams;
  const prazosParam = parseMulti(sp.prazo);
  const filtros: FiltrosOperacao = {
    meses: parseMulti(sp.mes),
    transportadoras: parseMulti(sp.transportadora),
    regioes: parseMulti(sp.regiao),
    tipos: parseMulti(sp.tipo),
    romaneios: parseMulti(sp.romaneio),
    esc: parseMulti(sp.esc),
    prazos: prazosParam ? prazosParam.map(Number) : null,
    cidades: parseMulti(sp.cidade),
    janelas: parseMulti(sp.janela),
    faixasPeso: parseMulti(sp.faixaPeso),
    faixasCubagem: parseMulti(sp.faixaCubagem),
  };
  const filtroAtivo = Object.values(filtros).some((v) => v != null);

  let data: OperacaoData | null = null;
  let erro: string | null = null;
  try {
    data = await getOperacaoData(filtros);
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  const kpis = data?.kpis ?? null;
  const carriers = data?.carriers ?? [];
  const janelas = data?.janelas ?? [];
  const janelaCarriers = data?.janelaCarriers ?? [];
  const cidades = data?.cidades ?? [];
  const opcoesMeses = data?.opcoesMeses ?? [];
  const opcoesRegioes = data?.opcoesRegioes ?? [];
  const opcoesTipos = data?.opcoesTipos ?? [];
  const opcoesRomaneios = data?.opcoesRomaneios ?? [];
  const opcoesEsc = data?.opcoesEsc ?? [];
  const opcoesPrazos = data?.opcoesPrazos ?? [];
  const opcoesCidades = data?.opcoesCidades ?? [];
  const opcoesJanelas = data?.opcoesJanelas ?? [];
  const opcoesFaixasPeso = data?.opcoesFaixasPeso ?? [];
  const opcoesFaixasCubagem = data?.opcoesFaixasCubagem ?? [];

  const filterDimensions: FilterDimension[] = [
    { param: "mes", labelAll: "Todos os meses", options: opcoesMeses, format: "mes" },
    { param: "transportadora", labelAll: "Todas as transportadoras", options: TRANSP_ORDER },
    { param: "regiao", labelAll: "Todas as regiões", options: opcoesRegioes },
    { param: "tipo", labelAll: "Todos os tipos", options: opcoesTipos },
    { param: "romaneio", labelAll: "Todos os romaneios", options: opcoesRomaneios },
    { param: "esc", labelAll: "Escolheu a mais barata: todos", options: opcoesEsc, format: "esc" },
    { param: "prazo", labelAll: "Todos os prazos", options: opcoesPrazos.map(String), format: "prazo" },
    { param: "cidade", labelAll: "Todas as cidades", options: opcoesCidades },
    { param: "janela", labelAll: "Todas as janelas", options: opcoesJanelas },
    { param: "faixaPeso", labelAll: "Todas as faixas de peso", options: opcoesFaixasPeso },
    { param: "faixaCubagem", labelAll: "Todas as faixas de cubagem", options: opcoesFaixasCubagem },
  ];

  const kpiTiles: [string, string, string][] = kpis
    ? [
        ["Romaneios", fmtNum(kpis.n_romaneios), "distintos, toda a base cruzada"],
        ["Pedidos", fmtNum(kpis.n_pedidos), "distintos"],
        ["Volumes", fmtNum(kpis.soma_volumes), "soma de qtd. de volumes"],
        ["Peso real", `${fmtNum(kpis.soma_peso_kg)} kg`, "soma"],
        ["Cubagem", `${fmtNum(kpis.soma_cubagem_m3, 1)} m³`, "soma"],
        ["Frete contratado", fmtBRL(kpis.soma_frete_contratado), "soma"],
      ]
    : [];

  // ---- Distribuição — participação de cada transportadora no frete total ----
  const totalFreteCarriers = carriers.reduce((s, c) => s + c.soma_frete_contratado, 0);
  const top2Share =
    totalFreteCarriers > 0
      ? carriers.slice(0, 2).reduce((s, c) => s + c.soma_frete_contratado, 0) / totalFreteCarriers
      : null;

  // ---- Meio-dia x Tarde ----
  const JANELAS_FIXAS = ["Meio-dia", "Tarde"] as const;
  const janelaByName = new Map(janelas.map((j) => [j.janela, j]));
  const naoInformadaCount = janelas
    .filter((j) => !JANELAS_FIXAS.includes(j.janela as (typeof JANELAS_FIXAS)[number]))
    .reduce((s, j) => s + j.n_linhas, 0);
  function top3DaJanela(janela: string, freteBucket: number) {
    return janelaCarriers
      .filter((jc) => jc.janela === janela)
      .sort((a, b) => b.soma_frete_contratado - a.soma_frete_contratado)
      .slice(0, 3)
      .map((jc) => ({
        transportadora: jc.transportadora,
        frete: jc.soma_frete_contratado,
        pct: freteBucket > 0 ? jc.soma_frete_contratado / freteBucket : null,
      }));
  }

  return (
    <div className="app-shell">
      <PageHeader
        title="Operação — Controle Operacional de Carregamento"
        crumbs={
          <>
            <Link href="/">← Visão Geral</Link> · <Link href="/ontem">Ontem</Link>
          </>
        }
      />

      <main className="content wide">
        {erro ? (
          <div className="status-banner erro">
            <b>Não foi possível consultar o Supabase.</b>
            <div style={{ marginTop: 6 }}>{erro}</div>
          </div>
        ) : !kpis ? (
          <div className="status-banner">Sem contratações cruzadas a uma cotação nos dados atuais.</div>
        ) : (
          <>
            {/* Motor de filtro global — upgrade 2026-09-17: todas as seções
                desta página já reagem às 11 dimensões (KPIs, Quem está
                carregando, Distribuição, Meio-dia × Tarde incl. "top 3" por
                janela, Cidade × Transportadora) — por isso fica no topo,
                único pra página inteira, em vez de só dentro de "Meio-dia ×
                Tarde" como antes. */}
            <Suspense fallback={<div className="filterbar" />}>
              <FilterBar dimensions={filterDimensions} />
            </Suspense>

            <section className="bloc" style={{ marginTop: 16 }}>
              <div className="op-note" style={{ marginBottom: 16 }}>
                Toda a base cruzada &middot; <b>{fmtNum(kpis.n_pedidos)}</b> pedidos &middot;{" "}
                <b>{fmtNum(kpis.n_romaneios)}</b> romaneios &middot; <b>{fmtBRL(kpis.soma_frete_contratado)}</b>{" "}
                em frete contratado
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
                <h2>Quem está carregando</h2>
              </div>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Transportadora</th>
                      <th className="num">Romaneios</th>
                      <th className="num">Pedidos</th>
                      <th className="num">Volumes</th>
                      <th className="num">Peso (kg)</th>
                      <th className="num">Cubagem (m³)</th>
                      <th className="num">Frete contratado</th>
                      <th className="num">Frete mín.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carriers.map((c) => (
                      <tr key={c.transportadora}>
                        <td>
                          <CarrierDot t={c.transportadora} /> {c.transportadora}
                        </td>
                        <td className="num">{fmtNum(c.n_romaneios)}</td>
                        <td className="num">{fmtNum(c.n_pedidos)}</td>
                        <td className="num">{fmtNum(c.soma_volumes)}</td>
                        <td className="num">{fmtNum(c.soma_peso_kg)}</td>
                        <td className="num">{fmtNum(c.soma_cubagem_m3, 1)}</td>
                        <td className="num">{fmtBRL(c.soma_frete_contratado)}</td>
                        <td className="num">
                          {c.frete_minimo_observado == null ? (
                            <span style={{ color: "var(--text-muted)" }}>Sem parâmetro</span>
                          ) : (
                            <>
                              {fmtBRL(c.frete_minimo_observado)}{" "}
                              <span className="pill sc" title="Piso observado estatisticamente — ESTIMATIVA, não tabela oficial">
                                · obs.
                              </span>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                &quot;Frete mín.&quot; = piso OBSERVADO na base (ESTIMATIVA estatística, não a tabela oficial da
                transportadora — ver <code>docs/frete-minimo-observado-2026-09.md</code>). Sem selo &quot;·
                obs.&quot; = sem parâmetro disponível ainda.
              </div>
            </section>

            <section className="bloc">
              <div className="bloc-head">
                <h2>Distribuição do frete contratado</h2>
              </div>
              <div className="card">
                <div className="dist-bar">
                  {carriers.map((c) => {
                    const pct = totalFreteCarriers > 0 ? c.soma_frete_contratado / totalFreteCarriers : 0;
                    return (
                      <span
                        key={c.transportadora}
                        style={{ width: `${pct * 100}%`, background: carrierColor(c.transportadora) }}
                        title={`${c.transportadora}: ${fmtPct(pct)}`}
                      />
                    );
                  })}
                </div>
                <div className="dist-legend">
                  {carriers.map((c) => {
                    const pct = totalFreteCarriers > 0 ? c.soma_frete_contratado / totalFreteCarriers : 0;
                    return (
                      <div className="item" key={c.transportadora}>
                        <CarrierDot t={c.transportadora} />
                        {c.transportadora} &middot; {fmtPct(pct)}
                      </div>
                    );
                  })}
                </div>
                {top2Share != null && (
                  <div className="foot" style={{ marginTop: 10 }}>
                    As 2 maiores transportadoras por frete ({carriers[0]?.transportadora} +{" "}
                    {carriers[1]?.transportadora}) somam <b>{fmtPct(top2Share)}</b> do frete contratado total.
                  </div>
                )}
              </div>
            </section>

            <section className="bloc">
              <div className="bloc-head">
                <h2>Meio-dia × Tarde</h2>
              </div>
              {filtroAtivo && (
                <div className="cov-note ok">
                  Os 5 números de cada card e o &quot;top 3 transportadoras&quot; já refletem o filtro acima.
                </div>
              )}
              <div className="grid cols-auto">
                {JANELAS_FIXAS.map((jname) => {
                  const j = janelaByName.get(jname);
                  const top3 = j ? top3DaJanela(jname, j.soma_frete_contratado) : [];
                  return (
                    <div className="card" key={jname}>
                      <h3>{jname}</h3>
                      <div className="sub">
                        {j ? `${fmtNum(j.n_linhas)} contratações` : "sem contratações"}
                      </div>
                      {j ? (
                        <>
                          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                            <div>
                              <div className="lbl" style={{ fontSize: 10.5 }}>
                                Romaneios
                              </div>
                              <div className="val mono" style={{ fontSize: 16 }}>
                                {fmtNum(j.n_romaneios)}
                              </div>
                            </div>
                            <div>
                              <div className="lbl" style={{ fontSize: 10.5 }}>
                                Pedidos
                              </div>
                              <div className="val mono" style={{ fontSize: 16 }}>
                                {fmtNum(j.n_pedidos)}
                              </div>
                            </div>
                            <div>
                              <div className="lbl" style={{ fontSize: 10.5 }}>
                                Peso (kg)
                              </div>
                              <div className="val mono" style={{ fontSize: 16 }}>
                                {fmtNum(j.soma_peso_kg)}
                              </div>
                            </div>
                            <div>
                              <div className="lbl" style={{ fontSize: 10.5 }}>
                                Cubagem (m³)
                              </div>
                              <div className="val mono" style={{ fontSize: 16 }}>
                                {fmtNum(j.soma_cubagem_m3, 1)}
                              </div>
                            </div>
                          </div>
                          <div className="foot" style={{ marginBottom: 4 }}>
                            Frete contratado: <b>{fmtBRL(j.soma_frete_contratado)}</b>
                          </div>
                          {top3.map((t) => (
                            <div className="window-carrier-row" key={t.transportadora}>
                              <span className="name">
                                <CarrierDot t={t.transportadora} /> {t.transportadora}
                              </span>
                              <span className="bar">
                                <span
                                  style={{
                                    width: `${(t.pct ?? 0) * 100}%`,
                                    background: carrierColor(t.transportadora),
                                  }}
                                />
                              </span>
                              <span className="pct">{fmtPct(t.pct)}</span>
                            </div>
                          ))}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {naoInformadaCount > 0 && (
                <div className="foot" style={{ marginTop: 10 }}>
                  {fmtNum(naoInformadaCount)} contratações com janela não informada (fora dos 2 baldes acima).
                </div>
              )}
            </section>

            <section className="bloc">
              <div className="bloc-head">
                <h2>Cidade × Transportadora</h2>
              </div>
              <div className="table-scroll">
                <table className="data">
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
                      <th className="num">% participação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cidades.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ color: "var(--text-muted)" }}>
                          Sem dados.
                        </td>
                      </tr>
                    ) : (
                      cidades.map((r, i) => {
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
                            <td className="num">{r.soma_melhor_cotacao === 0 ? "—" : fmtBRL(r.soma_melhor_cotacao)}</td>
                            <td className="num" style={style}>
                              {fmtBRLSigned(r.soma_diferenca_r)}
                            </td>
                            <td className="num">{fmtPct(pctPart)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
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
