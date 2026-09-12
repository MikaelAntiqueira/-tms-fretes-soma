"use client";

// Client component: os 2 gráficos da sub-aba "Peso, Cubagem & Custo" da
// página Financeiro (TASK-29 continuação, 2026-09-12) — Chart.js via
// react-chartjs-2, mesmo padrão já usado em CotadoContratadoCharts.tsx.
//
// Porta, linha a linha, `function renderPeso(mask)` e `function
// renderPrazo(mask)` do Artifact original (v42 — ver
// scratchpad/renderPeso_full.js extraído do HTML de referência):
//   chartPeso  -> bolha, x = faixa de peso (PESO_BINS, 8 faixas fixas —
//                 CONFIRMADAS na constante `PESO_BINS` do Artifact, linha
//                 ~2113: [0,10) [10,25) [25,50) [50,100) [100,250)
//                 [250,500) [500,1000) [1000,+) — DIFERENTES das 6 faixas
//                 de faixa_peso já usadas em /operacao), y = frete médio,
//                 r = qtd. de processos (mesma fórmula de raio do
//                 Artifact: min(28, 5+sqrt(n)*1.6))
//   chartPrazo -> barra vertical, frete médio por VALOR de prazo contratado
//                 (dias) — diferente de PrecoPrazoChart.tsx (prazo médio
//                 HISTÓRICO por transportadora)
// Toda agregação já vem pronta do servidor via RPCs `financeiro_peso_frete`/
// `financeiro_prazo_frete_medio` (migration
// `fn_financeiro_padroes_e_peso_cubagem`) — este componente só desenha.
import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  BubbleController,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Bar, Bubble } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, BubbleController, Tooltip);

const VAR_NAMES = ["--brand-500", "--brand-700", "--text-primary", "--text-secondary", "--border"] as const;
type VarName = (typeof VAR_NAMES)[number];

// Fallback = valores do tema claro em globals.css (:root), usados apenas
// durante o primeiro render no servidor (sem `document`).
const FALLBACK: Record<VarName, string> = {
  "--brand-500": "#329dbb",
  "--brand-700": "#088cb3",
  "--text-primary": "#0d2436",
  "--text-secondary": "#4f758e",
  "--border": "rgba(13, 36, 54, 0.12)",
};

function readVars(): Record<VarName, string> {
  if (typeof window === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK };
  for (const n of VAR_NAMES) {
    const v = cs.getPropertyValue(n).trim();
    if (v) out[n] = v;
  }
  return out;
}

function useThemeVars(): Record<VarName, string> {
  const [vars, setVars] = useState<Record<VarName, string>>(FALLBACK);
  useEffect(() => {
    setVars(readVars());
    const mo = new MutationObserver(() => setVars(readVars()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setVars(readVars());
    mq.addEventListener("change", onChange);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", onChange);
    };
  }, []);
  return vars;
}

function hexAlpha(hex: string, a: number): string {
  hex = hex.trim();
  if (hex[0] !== "#") return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

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

export interface PesoBinRow {
  binIdx: number;
  binLabel: string;
  n: number;
  freteMedio: number;
}
export interface PrazoFreteRow {
  prazo: number;
  freteMedio: number;
  n: number;
}

export function PesoCustoCharts({ pesoBins, prazoRows }: { pesoBins: PesoBinRow[]; prazoRows: PrazoFreteRow[] }) {
  const vars = useThemeVars();
  const fontFamily = "var(--font-ibm-plex-sans), system-ui, sans-serif";
  const tickColor = vars["--text-secondary"];
  const gridColor = vars["--border"];

  // ---- chartPeso: bolha, x = índice da faixa de peso, y = frete médio, r = qtd. processos ----
  const bubbleData = {
    datasets: [
      {
        data: pesoBins.map((b) => ({
          x: b.binIdx,
          y: b.freteMedio,
          r: Math.min(28, 5 + Math.sqrt(b.n) * 1.6),
          n: b.n,
          label: b.binLabel,
        })),
        backgroundColor: hexAlpha(vars["--brand-500"], 0.55),
        borderColor: vars["--brand-700"],
        borderWidth: 1.5,
      },
    ],
  };
  const bubbleOptions: ChartOptions<"bubble"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const raw = ctx.raw as { label: string; y: number; n: number };
            return `${raw.label}: frete médio ${fmtBRL2(raw.y)} (${fmtNum(raw.n)} processos)`;
          },
        },
      },
    },
    scales: {
      x: {
        min: -0.5,
        max: pesoBins.length - 0.5,
        ticks: {
          color: tickColor,
          font: { family: fontFamily, size: 10 },
          stepSize: 1,
          callback: (v) => pesoBins[Math.round(Number(v))]?.binLabel ?? "",
        },
        grid: { display: false },
      },
      y: {
        ticks: { color: tickColor, font: { family: fontFamily, size: 11 }, callback: (v) => fmtBRL(Number(v)) },
        grid: { color: gridColor },
      },
    },
  };

  // ---- chartPrazo: barra vertical, frete médio por prazo contratado (dias) ----
  const prazoLabels = prazoRows.map((r) => `${r.prazo}${r.prazo === 1 ? " dia" : " dias"}`);
  const prazoData = {
    labels: prazoLabels,
    datasets: [
      {
        data: prazoRows.map((r) => r.freteMedio),
        backgroundColor: vars["--brand-700"],
        borderRadius: 5,
        maxBarThickness: 40,
      },
    ],
  };
  const prazoOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `Frete médio: ${fmtBRL2(ctx.parsed.y)} (${fmtNum(prazoRows[ctx.dataIndex]?.n)} processos)`,
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

  return (
    <div className="grid cols2">
      <div className="card">
        <h3>Peso x Frete Contratado</h3>
        <div className="sub">Faixas de peso — bolha = quantidade de processos, eixo Y = frete médio</div>
        <div style={{ position: "relative", height: 305 }}>
          <Bubble data={bubbleData} options={bubbleOptions} />
        </div>
      </div>
      <div className="card">
        <h3>Prazo Contratado x Frete Médio</h3>
        <div className="sub">Frete médio por prazo contratado (dias)</div>
        <div style={{ position: "relative", height: 305 }}>
          <Bar data={prazoData} options={prazoOptions} />
        </div>
      </div>
    </div>
  );
}
