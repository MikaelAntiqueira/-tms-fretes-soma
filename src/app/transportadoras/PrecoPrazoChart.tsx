"use client";

// Client component: gráfico de dispersão da sub-aba "Preço × Prazo" de
// /transportadoras (TASK-29 continuação, 2026-09-12). Porta `function
// renderQuadrante(mask)` do Artifact v42 — 1 ponto por transportadora,
// x = prazo médio contratado (dias), y = diferença média (R$), cor
// categórica --t1..--t7 (mesmo mapeamento de ComparativoCharts.tsx),
// tooltip "{transportadora}: prazo médio Xd, diferença média R$ Y".
//
// Dado vem pronto do servidor: `prazoMedio` = migration
// `fn_transportadoras_prazo_medio_e_prazo_hist` (`transportadoras_prazo_medio`,
// prazo da OFERTA VENCEDORA por transportadora CONTRATADA sobre a base
// cruzada — mesma base de `transportadoras_comparativo`'s CTE `contratada`,
// nunca recalculada aqui); `diferencaMedia` = `transportadoras_comparativo().
// diferenca_media`, já validada em etapa anterior — join feito em
// page.tsx por nome de transportadora (só 7 linhas). Só transportadoras
// com as DUAS métricas presentes chegam aqui (page.tsx já filtra).
//
// O rótulo direto no ponto é um "nice to have" desta etapa (spec): não
// reproduz o posicionamento inteligente esquerda/direita do plugin
// original — é um texto fixo à direita do ponto, com contorno para
// legibilidade nos 2 temas.
import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  ScatterController,
  type ChartOptions,
  type Plugin,
} from "chart.js";
import { Scatter } from "react-chartjs-2";

ChartJS.register(LinearScale, PointElement, Tooltip, ScatterController);

const VAR_NAMES = [
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
  "--surface-card",
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
  "--text-primary": "#0d2436",
  "--text-secondary": "#4f758e",
  "--border": "rgba(13, 36, 54, 0.12)",
  "--surface-card": "#ffffff",
};

// Mesmo mapeamento transportadora → variável categórica de
// ComparativoCharts.tsx/src/app/operacao/page.tsx — preservado aqui para a
// cor de cada transportadora ser sempre a mesma em toda a aplicação.
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

function fmtBRL2(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDias(v: number, d = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export interface PrazoMedioRow {
  transportadora: string;
  prazoMedio: number;
  diferencaMedia: number;
}

export function PrecoPrazoChart({ rows }: { rows: PrazoMedioRow[] }) {
  const vars = useThemeVars();
  const fontFamily = "var(--font-ibm-plex-sans), system-ui, sans-serif";
  const tickColor = vars["--text-secondary"];
  const gridColor = vars["--border"];

  // 1 dataset por transportadora (7 pontos) — permite cor individual por
  // ponto sem precisar de pointBackgroundColor em array (mais simples de
  // ler no tooltip via ctx.datasetIndex).
  const datasets = rows.map((r) => {
    const color = vars[CARRIER_VAR[r.transportadora]] ?? vars["--text-primary"];
    return {
      label: r.transportadora,
      data: [{ x: r.prazoMedio, y: r.diferencaMedia }],
      backgroundColor: color,
      borderColor: color,
      pointRadius: 8,
      pointHoverRadius: 9,
    };
  });

  const labelPlugin: Plugin<"scatter"> = {
    id: "carrierPointLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = `600 11px ${fontFamily}`;
      ctx.textBaseline = "middle";
      chart.data.datasets.forEach((ds, i) => {
        const meta = chart.getDatasetMeta(i);
        const point = meta.data[0];
        if (!point) return;
        const label = ds.label ?? "";
        const x = point.x + 11;
        const y = point.y;
        ctx.lineWidth = 3;
        ctx.strokeStyle = vars["--surface-card"];
        ctx.strokeText(label, x, y);
        ctx.fillStyle = vars["--text-primary"];
        ctx.fillText(label, x, y);
      });
      ctx.restore();
    },
  };

  const options: ChartOptions<"scatter"> = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { right: 70 } },
    scales: {
      x: {
        title: { display: true, text: "Prazo médio contratado (dias)", color: tickColor, font: { family: fontFamily, size: 11.5 } },
        ticks: { color: tickColor, font: { family: fontFamily, size: 11 } },
        grid: { color: gridColor },
      },
      y: {
        title: { display: true, text: "Diferença média (R$)", color: tickColor, font: { family: fontFamily, size: 11.5 } },
        ticks: { color: tickColor, font: { family: fontFamily, size: 11 }, callback: (v) => fmtBRL2(Number(v)) },
        grid: { color: gridColor },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const r = rows[ctx.datasetIndex];
            return `${r.transportadora}: prazo médio ${fmtDias(r.prazoMedio)}d, diferença média ${fmtBRL2(r.diferencaMedia)}`;
          },
        },
      },
    },
  };

  return (
    <div style={{ height: 380 }}>
      <Scatter data={{ datasets }} options={options} plugins={[labelPlugin]} />
    </div>
  );
}
