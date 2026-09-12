"use client";

// Client component: os 2 gráficos de barra horizontal da aba "Comparativo"
// (Chart.js via react-chartjs-2 — dependência nova, decisão técnica desta
// etapa, ver relatório do TASK-29 continuação / rota /transportadoras).
// Reaproveita a paleta categórica --t1..--t7 já portada em globals.css,
// lida em runtime via getComputedStyle (funciona nos 2 temas: claro/escuro
// automático e o toggle manual data-theme, observado via MutationObserver).
import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const VAR_NAMES = [
  "--t1",
  "--t2",
  "--t3",
  "--t4",
  "--t5",
  "--t6",
  "--t7",
  "--brand-700",
  "--text-primary",
  "--text-secondary",
  "--border",
] as const;
type VarName = (typeof VAR_NAMES)[number];

// Fallback = valores do tema claro em globals.css (:root), usados apenas
// durante o primeiro render no servidor (sem `document`).
const FALLBACK: Record<VarName, string> = {
  "--t1": "#2a78d6",
  "--t2": "#eb6834",
  "--t3": "#1baf7a",
  "--t4": "#c98500",
  "--t5": "#e0629a",
  "--t6": "#1a8f1a",
  "--t7": "#4a3aa7",
  "--brand-700": "#088cb3",
  "--text-primary": "#0d2436",
  "--text-secondary": "#4f758e",
  "--border": "rgba(13, 36, 54, 0.12)",
};

// Mesmo mapeamento transportadora → variável categórica usado em
// src/app/operacao/page.tsx (CARRIER_COLOR) — preservado aqui para a cor de
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

export interface ComparativoChartRow {
  transportadora: string;
  qtd_cotada: number;
  vezes_mais_barata: number;
  pct_mais_barata: number | null;
  pct_contratada: number | null;
}

export function ComparativoCharts({ rows }: { rows: ComparativoChartRow[] }) {
  const vars = useThemeVars();

  const tickColor = vars["--text-secondary"];
  const gridColor = vars["--border"];
  const fontFamily = "var(--font-ibm-plex-sans), system-ui, sans-serif";

  // ---- Gráfico 1: Contratada x Mais Barata (mesma ordem da tabela, por
  // valor contratado desc) ----
  const labels1 = rows.map((r) => r.transportadora);
  const dataContratada = rows.map((r) => (r.pct_contratada ?? 0) * 100);
  const dataMaisBarata = rows.map((r) => (r.pct_mais_barata ?? 0) * 100);

  const chart1Options: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        min: 0,
        max: 100,
        ticks: { color: tickColor, callback: (v) => `${v}%` },
        grid: { color: gridColor },
      },
      y: { ticks: { color: vars["--text-primary"] }, grid: { display: false } },
    },
    plugins: {
      legend: { position: "top", labels: { color: tickColor, font: { family: fontFamily, size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
        },
      },
    },
  };

  const chart1Data = {
    labels: labels1,
    datasets: [
      { label: "% Vezes Contratada", data: dataContratada, backgroundColor: vars["--brand-700"] },
      { label: "% Vezes Mais Barata", data: dataMaisBarata, backgroundColor: vars["--t2"] },
    ],
  };

  // ---- Gráfico 2: Ranking mais barata — só quem foi cotado (qtd_cotada>0),
  // ordenado por vezes_mais_barata desc, cor por transportadora (--t1..--t7) ----
  const ranking = rows
    .filter((r) => r.qtd_cotada > 0)
    .slice()
    .sort((a, b) => b.vezes_mais_barata - a.vezes_mais_barata);

  const chart2Options: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { beginAtZero: true, ticks: { color: tickColor }, grid: { color: gridColor } },
      y: { ticks: { color: vars["--text-primary"] }, grid: { display: false } },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${Number(ctx.raw).toLocaleString("pt-BR")} vez(es)`,
        },
      },
    },
  };

  const chart2Data = {
    labels: ranking.map((r) => r.transportadora),
    datasets: [
      {
        label: "Vezes mais barata (cotações comparáveis)",
        data: ranking.map((r) => r.vezes_mais_barata),
        backgroundColor: ranking.map((r) => vars[CARRIER_VAR[r.transportadora]] ?? vars["--brand-700"]),
      },
    ],
  };

  return (
    <div className="grid cols-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
      <div className="card">
        <h3>Contratada × Mais Barata</h3>
        <div className="sub">% de vezes contratada vs. % de vezes que foi a cotação mais barata — por transportadora</div>
        <div style={{ height: 320 }}>
          <Bar data={chart1Data} options={chart1Options} />
        </div>
      </div>
      <div className="card">
        <h3>Ranking — mais barata</h3>
        <div className="sub">nº de cotações comparáveis em que cada transportadora foi a mais barata</div>
        <div style={{ height: 320 }}>
          <Bar data={chart2Data} options={chart2Options} />
        </div>
      </div>
    </div>
  );
}
