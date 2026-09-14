import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FilterBar, type FilterDimension } from "@/components/FilterBar";
import { FinanceiroTabs } from "./FinanceiroTabs";
import { CotadoContratadoCharts } from "./CotadoContratadoCharts";
import { PadroesCharts } from "./PadroesCharts";
import { PesoCustoCharts } from "./PesoCustoCharts";

// Página "Financeiro" — 4 sub-abas ("Visão Geral", "Cotado × Contratado",
// "Padrões da Diferença", "Peso, Cubagem & Custo"), rota /financeiro.
// [TASK-29] continuação, 2026-09-11/12/13. Porta, linha a linha, `aggBase
// (mask)` + `renderKPIs` + `renderJanelaHome` + `renderExec` (Visão Geral),
// `renderEvolucao` + `renderEconomiaMes` + `renderEscolheu` (Cotado ×
// Contratado), `renderPadroes` (Padrões da Diferença) e `renderPeso` +
// `renderPrazo` + `renderCubagemCusto` (Peso, Cubagem & Custo) do Artifact
// original (v42) — ver `docs/mapa-migracao-tms-v3-2026-09-11.md`,
// `memoria/04_DICIONARIO_DADOS.md` e `memoria/05_DICIONARIO_KPIS.md`
// ([KPI-01]/[KPI-02]/[KPI-04]/[KPI-05]/[KPI-16], [DEC-25] FINAL — não há
// campo de "motivo", [DEC-26] faixas de peso/cubagem, [DEC-27] "peso
// considerado" = max(peso real, peso cubado)).
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
// Sub-aba "Cotado × Contratado": agregação mensal via RPC `financeiro_
// evolucao_mensal()` (migration `fn_financeiro_evolucao_mensal_e_
// diff_n_esc_nao`) — 1 linha por mês (frete/melhor/nMelhor/diffPosSum),
// construída em cima de `v_financeiro_base` como CTE. O doughnut "Escolheu
// a Mais Barata?" reaproveita os contadores esc_s/esc_n/esc_sc de
// `financeiro_visao_geral_kpis()` — só a soma de `diferenca_r` das linhas
// `esc='N'` precisava de peça nova, via RPC `financeiro_diff_n_esc_nao()`.
//
// Sub-abas "Padrões da Diferença" e "Peso, Cubagem & Custo" (novas, 2026-09-
// 13): 8 RPCs novas (migration `fn_financeiro_padroes_e_peso_cubagem`),
// todas em cima de uma view auxiliar nova `v_financeiro_padroes_base`
// (1 linha por cotação, mesmo grão de `v_financeiro_base`, estendida com
// tipo_cliente/nome do cliente, transportadora CONTRATADA e prazo
// contratado — a oferta da PRÓPRIA transportadora contratada, mesmo padrão
// de `v_ontem_radar.prazo` —, peso considerado e faixa de cubagem):
// `financeiro_diff_por_prazo`, `financeiro_diff_por_regiao`,
// `financeiro_diff_por_transportadora`, `financeiro_diff_por_tipo_cliente`,
// `financeiro_peso_frete`, `financeiro_outliers_peso`,
// `financeiro_prazo_frete_medio`, `financeiro_cubagem_custo`. IMPORTANTE:
// "Região Comercial" aqui usa `regiao_normalizada` (mesmo campo que
// RegiaoComercialChart.tsx de /transportadoras já usa) — o Artifact
// original faz `BASE.regiaoComercial = BASE.uf.map(normalizarRegiaoComercial)`
// (HTML de referência, linha ~1184-1191): é a região JÁ normalizada (sem o
// sufixo " PRIVADO"/" PUBLICO"), nunca a bruta.
//
// Validado campo a campo (Playwright) contra #kpiGrid/#homeJanelas/
// #execText do Artifact v42 sem nenhum filtro aplicado — os 8 KPIs, os 2
// mini-cards de janela e as 5 frases do resumo batem exatamente. Os 2
// gráficos de evolução mensal, o doughnut e o card de impacto da sub-aba
// "Cotado × Contratado" foram validados do mesmo jeito. Os 4 gráficos de
// "Padrões da Diferença" e os 2 gráficos + outliers + tabela de cubagem de
// "Peso, Cubagem & Custo" foram validados por raciocínio linha a linha
// sobre a lógica replicada + conferência cruzada de total:
// `financeiro_cubagem_custo()` soma R$ 494.417,43 de frete contratado
// (5.194 processos) — o MESMO total já validado em `financeiro_visao_geral_
// kpis().frete_total` (ver ISSUE de paginação do PostgREST, `06_LOG_
// DECISOES.md`) — e a soma de `financeiro_diff_por_tipo_cliente()` bate
// com `financeiro_visao_geral_kpis().diff_pos_sum` (R$ 45.938,44).
//
// Fora do escopo desta etapa, de propósito (ver bloco "Pendências" no fim
// da página): a "Simulação de Custo por Transportadora" (4º bloco da
// Visão Geral original) — regra "nunca estima, sempre real, operação a
// operação" merece validação própria, com mais tempo.
//
// ============================================================================
// [TASK-29] MOTOR DE FILTRO GLOBAL — FASE 1 (2026-09-12). Página piloto.
// ============================================================================
// Esta é a PRIMEIRA página do Next.js a ganhar o motor de filtro global do
// Artifact original (11 dropdowns multi-seleção que recalculam tudo ao
// vivo — `MSEL_KEYS`, HTML de referência linha ~1216). Escopo desta Fase 1,
// deliberadamente pequeno (ver spec completa em `src/components/
// FilterBar.tsx`, que documenta o motor genérico):
//
//   - SÓ 4 das 11 dimensões: Mês, Transportadora Contratada, Região
//     Comercial (`clientes.regiao_normalizada`, JÁ normalizada — [DEC-02]
//     FINAL) e Tipo Cliente. AINDA FALTAM: romaneio, esc (escolheu a mais
//     barata), prazo, cidade, janela, faixaPeso, faixaCubagem — próximas
//     etapas, não bug desta rodada.
//   - SÓ a sub-aba "Visão Geral" reage aos filtros (KPIs executivos,
//     Meio-dia × Tarde, Resumo executivo). "Cotado × Contratado", "Padrões
//     da Diferença" e "Peso, Cubagem & Custo" continuam mostrando SEMPRE a
//     base completa, sem filtro algum — próxima etapa natural desta
//     migração, não esquecimento.
//   - SEM cascata de opções: as 4 listas de opções (meses/transportadoras/
//     regiões/tipos) são sempre a lista COMPLETA de valores possíveis na
//     base inteira, nunca podada pelos outros filtros ativos — ver
//     FilterBar.tsx para o racional completo.
//
// Estado do filtro: URL search params (`?mes=...&transportadora=...&
// regiao=...&tipo=...`, multi-valor separado por vírgula), NUNCA
// useState/Context client-side efêmero — Server Components leem
// `searchParams` nativamente (sem round-trip extra) e a URL fica
// compartilhável/copiável e sobrevive a um F5 (o Artifact original perdia o
// filtro ao recarregar a página, só estado em memória JS). Ausência de um
// parâmetro = "todos" (sem filtro nessa dimensão) — mesma semântica do
// Artifact (Set vazio = todos, nunca "zero resultados").
//
// Convenção SQL (documentada por completo na migration
// `fn_filtro_global_fase1_visao_geral`): as 4 functions que a Visão Geral
// usa ganharam 4 parâmetros novos, todos `default null` (aditivos, nunca
// quebram quem já chama sem eles — validado com regressão zero, ver
// relatório desta tarefa): `financeiro_visao_geral_kpis`, `financeiro_
// visao_geral_resumo` (só esta página as chama) e `operacao_por_janela` +
// `transportadoras_comparativo` (REAPROVEITADAS de /operacao e
// /transportadoras — parâmetros opcionais adicionados na function
// ORIGINAL, não duplicada, porque `/operacao` e `/transportadoras`
// continuam chamando sem argumentos e recebem exatamente os mesmos números
// de sempre).
//
// ATENÇÃO — pegadinha real encontrada e corrigida nesta etapa: `create or
// replace function` com uma assinatura DIFERENTE (parâmetros novos) cria um
// OVERLOAD em vez de substituir a function. Como os 4 parâmetros novos têm
// `default null`, a versão nova também aceita ser chamada com ZERO
// argumentos — isso deixou, por um instante, DUAS versões de cada function
// (a antiga sem parâmetros + a nova com 4 parâmetros default null), e uma
// chamada sem argumentos ficou AMBÍGUA ("function ... is not unique"),
// quebrando temporariamente /operacao e /transportadoras. Corrigido
// removendo a assinatura antiga (`drop function ... ()`) logo em seguida —
// migration `fn_filtro_global_fase1_remove_overloads_zero_arg`. Lição para
// quem tocar essas functions de novo: nunca deixe 2 overloads coexistindo.
//
// Nota sobre a "cobertura estrutural" (covNote, mais abaixo): os campos
// `total_contratacoes`/`contratacoes_cruzadas` de `financeiro_visao_geral_
// kpis()` são DELIBERADAMENTE não afetados pelo filtro (sempre a base
// inteira) — é uma limitação de FONTE (a maior parte das contratações
// nunca teve uma cotação para cruzar), não uma métrica que dependa do
// recorte do usuário. Ver comentário completo na migration.
//
// [TASK-29] Fase 6 (Supabase Auth, 2026-09-12) — usa createSupabaseServerClient()
// (cookie-aware) em vez do cliente compartilhado sem sessão: as policies de
// leitura foram restritas a `authenticated`, e todas as RPCs abaixo precisam
// do JWT do usuário logado para não virem vazias (ver commit em
// src/app/page.tsx). Não altera nada do motor de filtro global (Fase 1)
// documentado acima.
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

interface DiffPorPrazoRow {
  prazo: number;
  diffMedia: number;
  n: number;
}

interface DiffPorRegiaoRow {
  regiao: string;
  diffSum: number;
}

interface DiffPorTransportadoraRow {
  transportadora: string;
  diffSum: number;
}

interface DiffPorTipoRow {
  tipo: string;
  diffSum: number;
}

interface PesoBinRow {
  binIdx: number;
  binLabel: string;
  n: number;
  freteMedio: number;
}

interface OutlierPesoRow {
  cliente: string;
  peso: number;
  frete: number;
  faixa: string;
  mediana: number;
}

interface PrazoFreteRow {
  prazo: number;
  freteMedio: number;
  n: number;
}

interface CubagemCustoRow {
  faixa: string;
  n: number;
  peso: number;
  cbm: number;
  frete: number;
  custoKg: number | null;
  custoM3: number | null;
}

// Simulação de Custo por Transportadora — 4º bloco da Visão Geral original,
// portado em 2026-09-14 (RPC financeiro_simulacao_custo, migration
// fn_financeiro_simulacao_custo). Só faz sentido com exatamente 1
// transportadora no filtro (ver condição de render mais abaixo) — regra
// "nunca estima, sempre real": custoAlternativo soma só ofertas reais da
// alternativa nas MESMAS linhas do filtro; coberturaN/processosFiltrados
// é sempre mostrado explícito (nunca esconde que a comparação é parcial).
interface SimulacaoCustoRow {
  alternativa: string;
  custoAlternativo: number | null;
  coberturaN: number;
  diferenca: number | null;
}

interface FinanceiroData {
  kpis: FinanceiroKpis | null;
  resumo: FinanceiroResumo | null;
  janelas: JanelaRow[];
  topTransportadora: TopTransportadora | null;
  evolucaoMensal: EvolucaoMesRow[];
  maxMes: string | null;
  diffNEscNao: number;
  diffPorPrazo: DiffPorPrazoRow[];
  comPrazo: number;
  semPrazo: number;
  diffPorRegiao: DiffPorRegiaoRow[];
  diffPorTransportadora: DiffPorTransportadoraRow[];
  diffPorTipo: DiffPorTipoRow[];
  pesoBins: PesoBinRow[];
  outliersPeso: OutlierPesoRow[];
  prazoFrete: PrazoFreteRow[];
  cubagemCusto: CubagemCustoRow[];
  custoKgGeral: number | null;
  custoM3Geral: number | null;
  simulacaoCusto: SimulacaoCustoRow[];
  processosFiltrados: number;
  custoRealSimulado: number | null;
  opcoesMeses: string[];
  opcoesTransportadoras: string[];
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

// Filtros do motor de filtro global — as 4 da Fase 1 + as 7 que faltavam
// (migration fn_filtro_global_fase1_7_dimensoes_restantes, 2026-09-14).
// `null` numa dimensão = sem filtro nela (mesma convenção das functions
// SQL, default null = "todos"). `prazos` fica number[] (não string[]) porque
// a coluna/param SQL são int[] — as demais dimensões continuam text[].
interface FiltrosVisaoGeral {
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

// Rótulo de exibição do valor bruto "esc" (S/N/SC) — as OPÇÕES do dropdown
// em si vêm da cascata (financeiro_filtro_opcoes_cascata), não daqui; isto
// só formata o valor já filtrado pelo cascade.
const ESC_LABELS: Record<string, string> = { S: "Sim", N: "Não", SC: "Sem comparação" };

async function getFinanceiroData(filtros: FiltrosVisaoGeral): Promise<FinanceiroData> {
  const supabase = await createSupabaseServerClient();
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

  const [
    kpisRes,
    resumoRes,
    janelasRes,
    transpRes,
    opcoesRes,
    evolucaoRes,
    diffNRes,
    diffPrazoRes,
    diffRegiaoRes,
    diffTranspRes,
    diffTipoRes,
    pesoFreteRes,
    outliersRes,
    prazoFreteRes,
    cubagemRes,
    simulacaoRes,
  ] = await Promise.all([
    // ---- as 4 RPCs que a sub-aba "Visão Geral" usa: reagem ao filtro ----
    supabase.rpc("financeiro_visao_geral_kpis", filtroArgs),
    supabase.rpc("financeiro_visao_geral_resumo", filtroArgs),
    supabase.rpc("operacao_por_janela", filtroArgs),
    supabase.rpc("transportadoras_comparativo", filtroArgs),
    // ---- opções completas (sem cascata) para os dropdowns Região/Tipo ----
    // Cascata de opções [TASK-29] 2026-09-14: cada dimensão só mostra valores
    // que ainda produzem >=1 resultado dado o estado das OUTRAS 10 dimensões
    // ativas — porta rowMatchesFilters(i, exclude) do Artifact original. Por
    // isso recebe o filtroArgs completo (a function ignora internamente o
    // parâmetro da própria dimensão de cada lista que calcula).
    supabase.rpc("financeiro_filtro_opcoes_cascata", filtroArgs),
    // ---- demais sub-abas: FORA do escopo desta Fase 1, sempre base completa ----
    supabase.rpc("financeiro_evolucao_mensal"),
    supabase.rpc("financeiro_diff_n_esc_nao"),
    supabase.rpc("financeiro_diff_por_prazo"),
    supabase.rpc("financeiro_diff_por_regiao"),
    supabase.rpc("financeiro_diff_por_transportadora"),
    supabase.rpc("financeiro_diff_por_tipo_cliente"),
    supabase.rpc("financeiro_peso_frete"),
    supabase.rpc("financeiro_outliers_peso"),
    supabase.rpc("financeiro_prazo_frete_medio"),
    supabase.rpc("financeiro_cubagem_custo"),
    // ---- Simulação de Custo por Transportadora (4º bloco Visão Geral) —
    // reage ao filtro; a própria function só devolve linhas com exatamente
    // 1 transportadora filtrada (ver migration fn_financeiro_simulacao_custo).
    supabase.rpc("financeiro_simulacao_custo", filtroArgs),
  ]);
  for (const res of [
    kpisRes,
    resumoRes,
    janelasRes,
    transpRes,
    opcoesRes,
    evolucaoRes,
    diffNRes,
    diffPrazoRes,
    diffRegiaoRes,
    diffTranspRes,
    diffTipoRes,
    pesoFreteRes,
    outliersRes,
    prazoFreteRes,
    cubagemRes,
    simulacaoRes,
  ]) {
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

  const opcoesRow = (opcoesRes.data as Record<string, unknown>[])?.[0];
  const opcoesMeses: string[] = (opcoesRow?.meses as string[] | null) ?? [];
  const opcoesTransportadoras: string[] = (opcoesRow?.transportadoras as string[] | null) ?? [];
  const opcoesRegioes: string[] = (opcoesRow?.regioes as string[] | null) ?? [];
  const opcoesTipos: string[] = (opcoesRow?.tipos as string[] | null) ?? [];
  const opcoesRomaneios: string[] = (opcoesRow?.romaneios as string[] | null) ?? [];
  const opcoesEsc: string[] = (opcoesRow?.escs as string[] | null) ?? [];
  // `prazos` volta como text[] da RPC (ver comentário da migration) — converte pra
  // number[] aqui, único lugar que precisa saber que prazo é numérico.
  const opcoesPrazos: number[] = ((opcoesRow?.prazos as string[] | null) ?? []).map(Number);
  const opcoesCidades: string[] = (opcoesRow?.cidades as string[] | null) ?? [];
  const opcoesJanelas: string[] = (opcoesRow?.janelas as string[] | null) ?? [];
  const opcoesFaixasPeso: string[] = (opcoesRow?.faixas_peso as string[] | null) ?? [];
  const opcoesFaixasCubagem: string[] = (opcoesRow?.faixas_cubagem as string[] | null) ?? [];

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

  const diffPrazoRows = (diffPrazoRes.data as Record<string, unknown>[]) ?? [];
  const diffPorPrazo: DiffPorPrazoRow[] = diffPrazoRows.map((r) => ({
    prazo: Number(r.prazo),
    diffMedia: Number(r.diff_media ?? 0),
    n: Number(r.n ?? 0),
  }));
  const comPrazo = Number(diffPrazoRows[0]?.com_prazo ?? 0);
  const semPrazo = Number(diffPrazoRows[0]?.sem_prazo ?? 0);

  const diffPorRegiao: DiffPorRegiaoRow[] = ((diffRegiaoRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    regiao: String(r.regiao),
    diffSum: Number(r.diff_sum ?? 0),
  }));

  const diffPorTransportadora: DiffPorTransportadoraRow[] = ((diffTranspRes.data as Record<string, unknown>[]) ?? []).map(
    (r) => ({
      transportadora: String(r.transportadora),
      diffSum: Number(r.diff_sum ?? 0),
    })
  );

  const diffPorTipo: DiffPorTipoRow[] = ((diffTipoRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    tipo: String(r.tipo),
    diffSum: Number(r.diff_sum ?? 0),
  }));

  const pesoBins: PesoBinRow[] = ((pesoFreteRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    binIdx: Number(r.bin_idx),
    binLabel: String(r.bin_label),
    n: Number(r.n ?? 0),
    freteMedio: Number(r.frete_medio ?? 0),
  }));

  const outliersPeso: OutlierPesoRow[] = ((outliersRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    cliente: (r.cliente as string) ?? "—",
    peso: Number(r.peso ?? 0),
    frete: Number(r.frete ?? 0),
    faixa: String(r.faixa),
    mediana: Number(r.mediana ?? 0),
  }));

  const prazoFrete: PrazoFreteRow[] = ((prazoFreteRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    prazo: Number(r.prazo),
    freteMedio: Number(r.frete_medio ?? 0),
    n: Number(r.n ?? 0),
  }));

  const cubagemRows = (cubagemRes.data as Record<string, unknown>[]) ?? [];
  const cubagemCusto: CubagemCustoRow[] = cubagemRows.map((r) => ({
    faixa: String(r.faixa),
    n: Number(r.n ?? 0),
    peso: Number(r.peso ?? 0),
    cbm: Number(r.cbm ?? 0),
    frete: Number(r.frete ?? 0),
    custoKg: r.custo_kg == null ? null : Number(r.custo_kg),
    custoM3: r.custo_m3 == null ? null : Number(r.custo_m3),
  }));
  const custoKgGeral = cubagemRows[0]?.custo_kg_geral == null ? null : Number(cubagemRows[0].custo_kg_geral);
  const custoM3Geral = cubagemRows[0]?.custo_m3_geral == null ? null : Number(cubagemRows[0].custo_m3_geral);

  const simulacaoRows = (simulacaoRes.data as Record<string, unknown>[]) ?? [];
  const simulacaoCusto: SimulacaoCustoRow[] = simulacaoRows.map((r) => ({
    alternativa: String(r.alternativa),
    custoAlternativo: r.custo_alternativo == null ? null : Number(r.custo_alternativo),
    coberturaN: Number(r.cobertura_n ?? 0),
    diferenca: r.diferenca == null ? null : Number(r.diferenca),
  }));
  const processosFiltrados = Number(simulacaoRows[0]?.processos_filtrados ?? 0);
  const custoRealSimulado = simulacaoRows[0]?.custo_real == null ? null : Number(simulacaoRows[0].custo_real);

  return {
    kpis,
    resumo,
    janelas,
    topTransportadora,
    evolucaoMensal,
    maxMes,
    diffNEscNao,
    diffPorPrazo,
    comPrazo,
    semPrazo,
    diffPorRegiao,
    diffPorTransportadora,
    diffPorTipo,
    pesoBins,
    outliersPeso,
    prazoFrete,
    cubagemCusto,
    simulacaoCusto,
    processosFiltrados,
    custoRealSimulado,
    custoKgGeral,
    custoM3Geral,
    opcoesMeses,
    opcoesTransportadoras,
    opcoesRegioes,
    opcoesTipos,
    opcoesRomaneios,
    opcoesEsc,
    opcoesPrazos,
    opcoesCidades,
    opcoesJanelas,
    opcoesFaixasPeso,
    opcoesFaixasCubagem,
  };
}

import { fmtMes, parseMulti, fmtBRL, fmtBRL2, fmtBRLSigned, fmtNum, fmtPct } from "@/lib/format";

type FinanceiroSearchParams = Record<string, string | string[] | undefined>;

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<FinanceiroSearchParams>;
}) {
  const sp = await searchParams;
  const prazosParam = parseMulti(sp.prazo);
  const filtros: FiltrosVisaoGeral = {
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

  let data: FinanceiroData | null = null;
  let erro: string | null = null;
  try {
    data = await getFinanceiroData(filtros);
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
  const diffPorPrazo = data?.diffPorPrazo ?? [];
  const comPrazo = data?.comPrazo ?? 0;
  const semPrazo = data?.semPrazo ?? 0;
  const diffPorRegiao = data?.diffPorRegiao ?? [];
  const diffPorTransportadora = data?.diffPorTransportadora ?? [];
  const diffPorTipo = data?.diffPorTipo ?? [];
  const pesoBins = data?.pesoBins ?? [];
  const outliersPeso = data?.outliersPeso ?? [];
  const prazoFrete = data?.prazoFrete ?? [];
  const cubagemCusto = data?.cubagemCusto ?? [];
  const simulacaoCusto = data?.simulacaoCusto ?? [];
  const processosFiltrados = data?.processosFiltrados ?? 0;
  const custoRealSimulado = data?.custoRealSimulado ?? null;
  const custoKgGeral = data?.custoKgGeral ?? null;
  const custoM3Geral = data?.custoM3Geral ?? null;
  const opcoesMeses = data?.opcoesMeses ?? [];
  const opcoesTransportadoras = data?.opcoesTransportadoras ?? [];
  const opcoesRegioes = data?.opcoesRegioes ?? [];
  const opcoesTipos = data?.opcoesTipos ?? [];
  const opcoesRomaneios = data?.opcoesRomaneios ?? [];
  const opcoesEsc = data?.opcoesEsc ?? [];
  const opcoesPrazos = data?.opcoesPrazos ?? [];
  const opcoesCidades = data?.opcoesCidades ?? [];
  const opcoesJanelas = data?.opcoesJanelas ?? [];
  const opcoesFaixasPeso = data?.opcoesFaixasPeso ?? [];
  const opcoesFaixasCubagem = data?.opcoesFaixasCubagem ?? [];

  // Opções do dropdown "Mês": todos os meses presentes na base (mesma lista
  // que `financeiro_evolucao_mensal()` já devolve, sem filtro nenhum — não
  // é uma query nova, só reaproveita o que a página já busca para a sub-aba
  // "Cotado × Contratado").
  // As 11 listas de opções vêm todas de financeiro_filtro_opcoes_cascata()
  // (cascata real — cada uma já considera as outras 10 dimensões ativas).
  // As constantes fixas que existiam antes (TRANSP_ORDER, ESC_OPTIONS,
  // JANELA_OPTIONS, FAIXA_*_OPTIONS) foram removidas — ficaram redundantes
  // e sem uso assim que a cascata passou a alimentar os 11 dropdowns.
  const filterDimensions: FilterDimension[] = [
    { param: "mes", labelAll: "Todos os meses", options: opcoesMeses, format: fmtMes },
    { param: "transportadora", labelAll: "Todas as transportadoras", options: opcoesTransportadoras },
    { param: "regiao", labelAll: "Todas as regiões", options: opcoesRegioes },
    { param: "tipo", labelAll: "Todos os tipos", options: opcoesTipos },
    { param: "romaneio", labelAll: "Todos os romaneios", options: opcoesRomaneios },
    { param: "esc", labelAll: "Escolheu a mais barata: todos", options: opcoesEsc, format: (v) => ESC_LABELS[v] ?? v },
    {
      param: "prazo",
      labelAll: "Todos os prazos",
      options: opcoesPrazos.map(String),
      format: (v) => `${v} dia${v === "1" ? "" : "s"}`,
    },
    { param: "cidade", labelAll: "Todas as cidades", options: opcoesCidades },
    { param: "janela", labelAll: "Todas as janelas", options: opcoesJanelas },
    { param: "faixaPeso", labelAll: "Todas as faixas de peso", options: opcoesFaixasPeso },
    { param: "faixaCubagem", labelAll: "Todas as faixas de cubagem", options: opcoesFaixasCubagem },
  ];

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

  // ---- renderPadroes(mask) — porta exata do Artifact v42 ----
  const totalComp = comPrazo + semPrazo;
  const coverageLabel =
    totalComp > 0
      ? `Cobertura: ${fmtPct(comPrazo / totalComp)} dos processos comparáveis no filtro (${fmtNum(comPrazo)} de ${fmtNum(
          totalComp
        )})`
      : "Cobertura: —";

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
      para comparar. Limitação de fonte, não de método. Estes 2 números de cobertura não mudam com o
      filtro acima (são sempre a base inteira — ver comentário no topo do código desta página).
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
              KPIs executivos, evolução mensal e decisões de contratação. A sub-aba <b>Visão Geral</b>{" "}
              já aceita as 11 dimensões do motor de filtro global (Mês, Transportadora Contratada,
              Região Comercial, Tipo Cliente, Romaneio, Escolheu a Mais Barata, Prazo, Cidade, Janela,
              Faixa de Peso, Faixa de Cubagem); as demais 3 sub-abas ainda mostram sempre a base
              completa, sem filtro.
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
          <div className="status-banner">Sem dados na base atual (confira se o filtro ativo não zerou o recorte).</div>
        ) : (
          <FinanceiroTabs
            tabs={[
              { id: "fin-visao", label: "Visão Geral" },
              { id: "fin-cotado", label: "Cotado × Contratado" },
              { id: "fin-padroes", label: "Padrões da Diferença" },
              { id: "fin-peso", label: "Peso, Cubagem & Custo" },
            ]}
            defaultTab="fin-visao"
          >
            <div className="subpage" data-subpage="fin-visao">
              {/* Motor de filtro global — Fase 1. Escopo/limitações completos
                  no comentário do topo deste arquivo e em FilterBar.tsx. Fica
                  só dentro desta sub-aba de propósito: é a única que reage ao
                  filtro nesta etapa — colocá-lo fora daqui (ex. acima das
                  abas) sugeriria que "Cotado × Contratado"/"Padrões da
                  Diferença"/"Peso, Cubagem & Custo" também reagem, o que
                  ainda não é verdade. */}
              <Suspense fallback={<div className="filterbar" />}>
                <FilterBar dimensions={filterDimensions} />
              </Suspense>

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

              {filtros.transportadoras?.length === 1 && (
                <section className="bloc">
                  <div className="bloc-head">
                    <h2>Simulação de Custo por Transportadora</h2>
                    <div className="sub">
                      Se todo o volume filtrado de <b>{filtros.transportadoras[0]}</b> tivesse sido contratado com
                      cada alternativa — só com cotações reais, nunca estimadas
                    </div>
                  </div>
                  <div className="cov-note" style={{ marginBottom: 10 }}>
                    <b>FATO:</b> custo real de {filtros.transportadoras[0]} no recorte filtrado ({fmtNum(processosFiltrados)}{" "}
                    processos): <b>{fmtBRL(custoRealSimulado)}</b>. Para cada alternativa abaixo, o valor soma só as
                    ofertas em que ela realmente cotou nas mesmas linhas — a cobertura mostra quantas das{" "}
                    {fmtNum(processosFiltrados)} são comparáveis; sem oferta real, a linha não entra na soma (nunca
                    estimada).
                  </div>
                  {simulacaoCusto.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Nenhuma transportadora ativa para comparar.</p>
                  ) : (
                    <table className="data" style={{ fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th>Alternativa</th>
                          <th className="num">Cobertura</th>
                          <th className="num">Custo simulado (R$)</th>
                          <th className="num">Diferença vs. real (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simulacaoCusto.map((s) => (
                          <tr key={s.alternativa}>
                            <td>{s.alternativa}</td>
                            <td className="num">
                              {fmtNum(s.coberturaN)} / {fmtNum(processosFiltrados)}
                            </td>
                            <td className="num">{s.custoAlternativo == null ? "— sem cotação" : fmtBRL(s.custoAlternativo)}</td>
                            <td
                              className="num"
                              style={{ color: s.diferenca == null ? undefined : s.diferenca < 0 ? "var(--good)" : "var(--critical)" }}
                            >
                              {s.diferenca == null ? "—" : fmtBRLSigned(s.diferenca)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}

              <section className="bloc">
                <div className="card">
                  <h3>Pendências desta etapa</h3>
                  <div className="sub">próximas etapas do motor de filtro</div>
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
                        <span className="name">Motor de filtro — cascata de opções</span>
                        <span className="num" style={{ color: "var(--text-muted)", whiteSpace: "normal", textAlign: "right" }}>
                          os dropdowns ainda mostram sempre a lista completa de valores, não podada pelos
                          outros filtros ativos (ver FilterBar.tsx)
                        </span>
                      </li>
                      <li>
                        <span className="name">Motor de filtro — demais sub-abas/páginas</span>
                        <span className="num" style={{ color: "var(--text-muted)", whiteSpace: "normal", textAlign: "right" }}>
                          &quot;Cotado × Contratado&quot;/&quot;Padrões da Diferença&quot;/&quot;Peso, Cubagem
                          &amp; Custo&quot; e as demais 4 páginas do dashboard ainda não reagem ao filtro
                        </span>
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
                  <div className="desc">
                    Frete contratado x melhor cotação disponível · diferença financeira identificada por mês ·
                    base completa, ainda não reage ao filtro acima (ver Pendências na Visão Geral)
                  </div>
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
            </div>

            <div className="subpage" data-subpage="fin-padroes">
              <section className="bloc" style={{ marginTop: 0 }}>
                <div className="bloc-head">
                  <h2>Padrões da diferença financeira</h2>
                  <div className="desc">
                    Onde a diferença financeira se concentra — diferença observada, não erro nem economia perdida; a
                    correlação não confirma motivo. Base completa, ainda não reage ao filtro da Visão Geral.
                  </div>
                </div>
                <PadroesCharts
                  prazoRows={diffPorPrazo}
                  coverageLabel={coverageLabel}
                  regiaoRows={diffPorRegiao}
                  transpRows={diffPorTransportadora}
                  tipoRows={diffPorTipo}
                />
              </section>
            </div>

            <div className="subpage" data-subpage="fin-peso">
              <section className="bloc" style={{ marginTop: 0 }}>
                <div className="bloc-head">
                  <h2>Peso, Cubagem &amp; Custo</h2>
                  <div className="desc">
                    Relação entre peso, cubagem, prazo contratado e valor do frete · base completa, ainda não
                    reage ao filtro da Visão Geral
                  </div>
                </div>
                <PesoCustoCharts pesoBins={pesoBins} prazoRows={prazoFrete} />

                <div className="grid cols2" style={{ marginTop: 14 }}>
                  <div className="card">
                    <h3>Outliers de Peso x Frete</h3>
                    <div className="sub">Fora de 1,5x o intervalo interquartil (IQR) da própria faixa de peso</div>
                    <div className="table-scroll">
                      <table className="data compact">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Peso (kg)</th>
                            <th>Frete</th>
                            <th>Faixa</th>
                            <th>Mediana da faixa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {outliersPeso.length ? (
                            outliersPeso.map((o, i) => (
                              <tr key={i}>
                                <td>{o.cliente.slice(0, 30)}</td>
                                <td className="num">{fmtNum(o.peso)}</td>
                                <td className="num">{fmtBRL2(o.frete)}</td>
                                <td>{o.faixa}</td>
                                <td className="num">{fmtBRL2(o.mediana)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} style={{ color: "var(--text-muted)" }}>
                                Nenhum outlier acima de 1,5×IQR no filtro atual.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>

              <section className="bloc">
                <div className="bloc-head">
                  <h2>Cubagem e custo unitário</h2>
                  <div className="desc">Perfil de carga por faixa e custo por kg / por m³ no recorte atual</div>
                </div>
                <div className="grid op-kpis" style={{ marginBottom: 14 }}>
                  <div className="kpi">
                    <div className="lbl">Custo / kg — geral</div>
                    <div className="val">{fmtBRL2(custoKgGeral)}</div>
                    <div className="foot">
                      Σ frete contratado ÷ Σ peso real · <b>DADO DERIVADO</b>
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="lbl">Custo / m³ — geral</div>
                    <div className="val">{fmtBRL2(custoM3Geral)}</div>
                    <div className="foot">
                      Σ frete contratado ÷ Σ cubagem, só cargas com grade · <b>DADO DERIVADO</b>
                    </div>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Faixa de cubagem</th>
                        <th className="num">Processos</th>
                        <th className="num">Peso (kg)</th>
                        <th className="num">Cubagem (m³)</th>
                        <th className="num">Frete contratado</th>
                        <th className="num">Custo / kg</th>
                        <th className="num">Custo / m³</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cubagemCusto.length ? (
                        cubagemCusto
                          .filter((r) => r.n > 0)
                          .map((r) => (
                            <tr key={r.faixa}>
                              <td>{r.faixa}</td>
                              <td className="num">{fmtNum(r.n)}</td>
                              <td className="num">{fmtNum(r.peso)}</td>
                              <td className="num">{fmtNum(r.cbm, 1)}</td>
                              <td className="num">{fmtBRL(r.frete)}</td>
                              <td className="num">{r.custoKg != null ? fmtBRL2(r.custoKg) : "—"}</td>
                              <td className="num">{r.custoM3 != null ? fmtBRL2(r.custoM3) : "—"}</td>
                            </tr>
                          ))
                      ) : (
                        <tr>
                          <td colSpan={7} style={{ color: "var(--text-muted)" }}>
                            Sem dados no recorte atual.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  Cubagem m³ = Σ (altura·largura·comprimento) dos volumes da cotação — <b>dado derivado</b>.
                  &quot;Não informado&quot; = cotação sem grade de volumes (contratação direta).
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
