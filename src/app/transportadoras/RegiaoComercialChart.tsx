"use client";

// Client component: gráfico de barra horizontal da sub-aba "Região
// Comercial" de /transportadoras (TASK-29 continuação, 2026-09-12). Porta
// 1:1 `function renderUf(mask)` do Artifact v42 — 1 dataset, cor
// `--brand-700`, valor contratado por `clientes.regiao_normalizada`
// (NUNCA `regiao_comercial_bruta` — achado já confirmado em
// `fix_financeiro_pedido_e_regiao_normalizada`), sobre toda a base cruzada,
// sem filtro de dia. Dado vem pronto do servidor via RPC
// `transportadoras_regiao_comercial` (migration
// `fn_transportadoras_regiao_comercial_e_clientes`) — este componente só
// desenha as N linhas (já cortadas em Top 15 por `page.tsx`), nunca agrega
// linha crua.
//
// Mesmo padrão de leitura de tokens CSS em runtime (getComputedStyle) já
// usado em ComparativoCharts.tsx/CotadoContratadoCharts.tsx — duplicado
// aqui de propósito (ver comentário de TransportadorasTabs.tsx).
import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const VAR_NAMES = ["--brand-700", "--text-primary", "--text-secondary", "--border"] as const;
type VarName = (typeof VAR_NAMES)[number];

// Fallback = valores do tema claro em globals.css (:root), usados apenas
// durante o primeiro render no servidor (sem `document`).
const FALLBACK: Record<VarName, string> = {
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

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR");
}

export interface RegiaoComercialRow {
  regiao: string;
  valor_contratado: number;
  n_processos: number;
}

export function RegiaoComercialChart({ rows }: { rows: RegiaoComercialRow[] }) {
  const vars = useThemeVars();
  const fontFamily = "var(--font-ibm-plex-sans), system-ui, sans-serif";
  const tickColor = vars["--text-secondary"];
  const gridColor = vars["--border"];

  const labels = rows.map((r) => r.regiao);
  const data = rows.map((r) => r.valor_contratado);
  const n = rows.map((r) => r.n_processos);

  const options: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        beginAtZero: true,
        ticks: { color: tickColor, font: { family: fontFamily, size: 11 }, callback: (v) => fmtBRL(Number(v)) },
        grid: { color: gridColor },
      },
      y: { ticks: { color: vars["--text-primary"], font: { family: fontFamily, size: 11 } }, grid: { display: false } },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx) => `${fmtBRL(Number(ctx.raw))} · ${fmtNum(n[ctx.dataIndex])} processos`,
        },
      },
    },
  };

  const chartData = {
    labels,
    datasets: [
      {
        label: "Valor Contratado",
        data,
        backgroundColor: vars["--brand-700"],
        borderRadius: 4,
        maxBarThickness: 22,
      },
    ],
  };

  return (
    <div style={{ height: Math.max(320, rows.length * 28) }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}
