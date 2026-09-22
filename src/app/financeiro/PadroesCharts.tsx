"use client";

// Client component: os 4 gráficos da sub-aba "Padrões da Diferença" da
// página Financeiro (TASK-29 continuação, 2026-09-12) — Chart.js via
// react-chartjs-2, mesmo padrão já usado em CotadoContratadoCharts.tsx /
// PrecoPrazoChart.tsx (paleta lida em runtime via getComputedStyle, funciona
// nos 2 temas).
//
// Porta, linha a linha, `function renderPadroes(mask)` do Artifact original
// (v42, linha ~2248 do HTML de referência):
//   chartDiffPrazo  -> barra vertical, diferença MÉDIA por prazo contratado
//   chartDiffUf     -> barra horizontal, top 10 diferença ACUMULADA (só
//                      diffR>0) por Região Comercial NORMALIZADA — o
//                      Artifact faz `BASE.regiaoComercial =
//                      BASE.uf.map(normalizarRegiaoComercial)` (linha
//                      ~1184-1191 do HTML de referência): é a MESMA
//                      transformação/campo que RegiaoComercialChart.tsx de
//                      /transportadoras já usa (regiao_normalizada) — NÃO a
//                      bruta com sufixo PRIVADO/PUBLICO.
//   chartDiffTransp -> barra horizontal, diferença ACUMULADA por
//                      transportadora CONTRATADA, só escolheu='N'
//   chartDiffTipo   -> barra vertical, diferença ACUMULADA (só diffR>0) por
//                      Tipo Cliente
// Toda agregação (média/soma/contagem) já vem pronta do servidor via RPCs
// `financeiro_diff_por_prazo`/`financeiro_diff_por_regiao`/
// `financeiro_diff_por_transportadora`/`financeiro_diff_por_tipo_cliente`
// (migration `fn_financeiro_padroes_e_peso_cubagem`) — este componente só
// desenha, não recalcula nenhuma regra de negócio.
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { useThemeVars } from "@/hooks/useThemeVars";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const VAR_NAMES = [
  "--brand-900",
  "--brand-700",
  "--brand-500",
  "--t1",
  "--t2",
  "--t3",
  "--t4",
  "--t5",
  "--t6",
  "--t7",
  "--text-primary",
  "--text-secondary",
  "--border",
] as const;
type VarName = (typeof VAR_NAMES)[number];

// Fallback = valores do tema claro em globals.css (:root), usados apenas
// durante o primeiro render no servidor (sem `document`).
const FALLBACK: Record<VarName, string> = {
  "--brand-900": "#005285",
  "--brand-700": "#088cb3",
  "--brand-500": "#329dbb",
  "--t1": "#2a78d6",
  "--t2": "#eb6834",
  "--t3": "#1baf7a",
  "--t4": "#c98500",
  "--t5": "#e0629a",
  "--t6": "#1a8f1a",
  "--t7": "#4a3aa7",
  "--text-primary": "#0d2436",
  "--text-secondary": "#4f758e",
  "--border": "rgba(13, 36, 54, 0.12)",
};

// Mesmo mapeamento transportadora -> variável categórica de
// PrecoPrazoChart.tsx/ComparativoCharts.tsx — preservado aqui para a cor de
// cada transportadora ser sempre a mesma em toda a aplicação.
const CARRIER_VAR: Record<string, VarName> = {
  "Fritz Express": "--t1",
  LKW: "--t2",
  Leomar: "--t3",
  Minuano: "--t4",
  "Rede Nacional": "--t5",
  "Santa Cruz": "--t6",
  "São Miguel": "--t7",
};

function fmtBRL(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtBRL2(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR");
}

export interface DiffPorPrazoRow {
  prazo: number;
  diffMedia: number;
  n: number;
}
export interface DiffPorRegiaoRow {
  regiao: string;
  diffSum: number;
}
export interface DiffPorTransportadoraRow {
  transportadora: string;
  diffSum: number;
}
export interface DiffPorTipoRow {
  tipo: string;
  diffSum: number;
}

export function PadroesCharts({
  prazoRows,
  coverageLabel,
  regiaoRows,
  transpRows,
  tipoRows,
}: {
  prazoRows: DiffPorPrazoRow[];
  coverageLabel: string;
  regiaoRows: DiffPorRegiaoRow[];
  transpRows: DiffPorTransportadoraRow[];
  tipoRows: DiffPorTipoRow[];
}) {
  const vars = useThemeVars(VAR_NAMES, FALLBACK);
  const fontFamily = "var(--font-ibm-plex-sans), system-ui, sans-serif";
  const tickColor = vars["--text-secondary"];
  const gridColor = vars["--border"];

  // ---- chartDiffPrazo: barra vertical, diferença média por prazo ----
  const prazoLabels = prazoRows.map((r) => `${r.prazo}${r.prazo === 1 ? " dia" : " dias"}`);
  const prazoOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `Diferença média: ${fmtBRL2(ctx.parsed.y)} (${fmtNum(prazoRows[ctx.dataIndex]?.n)} processos)`,
        },
      },
    },
    scales: {
      x: { ticks: { color: tickColor, font: { family: fontFamily, size: 11 } }, grid: { display: false } },
      y: {
        ticks: { color: tickColor, font: { family: fontFamily, size: 11 }, callback: (v) => fmtBRL(Number(v)) },
        grid: { color: gridColor },
      },
    },
  };
  const prazoData = {
    labels: prazoLabels,
    datasets: [
      {
        data: prazoRows.map((r) => r.diffMedia),
        backgroundColor: vars["--brand-700"],
        borderRadius: 5,
        maxBarThickness: 40,
      },
    ],
  };

  // ---- chartDiffUf: barra horizontal, top 10 diferença acumulada por Região Comercial ----
  const ufOptions: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => fmtBRL(ctx.parsed.x) } },
    },
    scales: {
      x: {
        ticks: { color: tickColor, font: { family: fontFamily, size: 11 }, callback: (v) => fmtBRL(Number(v)) },
        grid: { color: gridColor },
      },
      y: { ticks: { color: tickColor, font: { family: fontFamily, size: 10.5 } }, grid: { display: false } },
    },
  };
  const ufData = {
    labels: regiaoRows.map((r) => r.regiao),
    datasets: [
      {
        data: regiaoRows.map((r) => r.diffSum),
        backgroundColor: vars["--brand-500"],
        borderRadius: 4,
        maxBarThickness: 16,
      },
    ],
  };

  // ---- chartDiffTransp: barra horizontal, diferença acumulada por transportadora contratada (esc='N') ----
  const transpOptions: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => fmtBRL(ctx.parsed.x) } },
    },
    scales: {
      x: {
        ticks: { color: tickColor, font: { family: fontFamily, size: 11 }, callback: (v) => fmtBRL(Number(v)) },
        grid: { color: gridColor },
      },
      y: { ticks: { color: tickColor, font: { family: fontFamily, size: 11 } }, grid: { display: false } },
    },
  };
  const transpData = {
    labels: transpRows.map((r) => r.transportadora),
    datasets: [
      {
        data: transpRows.map((r) => r.diffSum),
        backgroundColor: transpRows.map((r) => vars[CARRIER_VAR[r.transportadora]] ?? vars["--brand-700"]),
        borderRadius: 5,
        maxBarThickness: 26,
      },
    ],
  };

  // ---- chartDiffTipo: barra vertical, diferença acumulada por Tipo Cliente ----
  const tipoOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => fmtBRL(ctx.parsed.y) } },
    },
    scales: {
      x: { ticks: { color: tickColor, font: { family: fontFamily, size: 11 } }, grid: { display: false } },
      y: {
        ticks: { color: tickColor, font: { family: fontFamily, size: 11 }, callback: (v) => fmtBRL(Number(v)) },
        grid: { color: gridColor },
      },
    },
  };
  const tipoData = {
    labels: tipoRows.map((r) => r.tipo),
    datasets: [
      {
        data: tipoRows.map((r) => r.diffSum),
        backgroundColor: vars["--brand-900"],
        borderRadius: 5,
        maxBarThickness: 34,
      },
    ],
  };

  return (
    <>
      <div className="grid cols2">
        <div className="card">
          <h3>Diferença média por prazo contratado</h3>
          <div className="sub">{coverageLabel}</div>
          <div style={{ position: "relative", height: 260 }}>
            <Bar data={prazoData} options={prazoOptions} />
          </div>
        </div>
        <div className="card">
          <h3>Diferença acumulada por Região Comercial</h3>
          <div className="sub">Top 10 por diferença financeira identificada</div>
          <div style={{ position: "relative", height: 260 }}>
            <Bar data={ufData} options={ufOptions} />
          </div>
        </div>
      </div>

      <div className="grid cols2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Diferença acumulada por transportadora contratada</h3>
          <div className="sub">Nos processos em que ela não foi a mais barata</div>
          <div style={{ position: "relative", height: 260 }}>
            <Bar data={transpData} options={transpOptions} />
          </div>
        </div>
        <div className="card">
          <h3>Diferença acumulada por tipo de cliente</h3>
          <div className="sub">Público × Privado × Grupo</div>
          <div style={{ position: "relative", height: 260 }}>
            <Bar data={tipoData} options={tipoOptions} />
          </div>
        </div>
      </div>
    </>
  );
}
