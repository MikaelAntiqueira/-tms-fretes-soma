"use client";

// Client component: gráfico de barra horizontal da sub-aba "Clientes" de
// /transportadoras (TASK-29 continuação, 2026-09-12). Porta 1:1 `function
// renderClientes(mask)` do Artifact v42 — no original há um `<select>` de
// métrica (`fClienteMetric`: freteC/diffR/n); aqui a mesma escolha vira 3
// botões (decisão técnica desta etapa, mesmo efeito: troca a métrica em
// runtime sem refetch, os 3 rankings já vêm prontos do servidor via RPC
// `transportadoras_clientes_metricas`).
//
// Top 12 pela métrica escolhida, cor `--brand-900` (1 dataset). Nomes de
// cliente com mais de 34 caracteres são truncados com "…" no eixo Y —
// tooltip sempre mostra o nome completo (via closure sobre o array de
// labels completos, não sobre o texto truncado do eixo).
//
// Métricas: freteC = "Frete Contratado" (BRL, só linhas cruzadas), diffR =
// "Diferença Financeira Identificada" (BRL, só diferença positiva), n =
// "Qtd. Processos" (número puro, toda a base de cotações do cliente,
// cruzada ou não — ver comentário da migration
// `fn_transportadoras_regiao_comercial_e_clientes`).
import { useMemo, useState } from "react";
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

const VAR_NAMES = ["--brand-900", "--text-primary", "--text-secondary", "--border"] as const;
type VarName = (typeof VAR_NAMES)[number];

const FALLBACK: Record<VarName, string> = {
  "--brand-900": "#005285",
  "--text-primary": "#0d2436",
  "--text-secondary": "#4f758e",
  "--border": "rgba(13, 36, 54, 0.12)",
};

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR");
}
function truncate(s: string, max = 34): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export interface ClienteMetricaRow {
  cliente: string;
  frete_contratado: number;
  diferenca_positiva: number;
  n_processos: number;
}

type Metric = "freteC" | "diffR" | "n";

const METRIC_DEF: Record<Metric, { label: string; format: (v: number) => string; pick: (r: ClienteMetricaRow) => number }> = {
  freteC: { label: "Frete Contratado", format: fmtBRL, pick: (r) => r.frete_contratado },
  diffR: { label: "Diferença Financeira Identificada", format: fmtBRL, pick: (r) => r.diferenca_positiva },
  n: { label: "Qtd. Processos", format: fmtNum, pick: (r) => r.n_processos },
};

export function ClientesChart({ rows }: { rows: ClienteMetricaRow[] }) {
  const vars = useThemeVars(VAR_NAMES, FALLBACK);
  const [metric, setMetric] = useState<Metric>("diffR");
  const fontFamily = "var(--font-ibm-plex-sans), system-ui, sans-serif";
  const tickColor = vars["--text-secondary"];
  const gridColor = vars["--border"];

  const def = METRIC_DEF[metric];

  const top12 = useMemo(() => {
    return rows
      .map((r) => ({ cliente: r.cliente, value: def.pick(r) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [rows, def]);

  const fullLabels = top12.map((r) => r.cliente);
  const labels = fullLabels.map((l) => truncate(l));
  const data = top12.map((r) => r.value);

  const options: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        beginAtZero: true,
        ticks: { color: tickColor, font: { family: fontFamily, size: 11 }, callback: (v) => def.format(Number(v)) },
        grid: { color: gridColor },
      },
      y: { ticks: { color: vars["--text-primary"], font: { family: fontFamily, size: 11 } }, grid: { display: false } },
    },
    plugins: {
      tooltip: {
        callbacks: {
          title: (ctx) => fullLabels[ctx[0]?.dataIndex ?? 0] ?? "",
          label: (ctx) => `${def.label}: ${def.format(Number(ctx.raw))}`,
        },
      },
    },
  };

  const chartData = {
    labels,
    datasets: [
      {
        label: def.label,
        data,
        backgroundColor: vars["--brand-900"],
        borderRadius: 4,
        maxBarThickness: 22,
      },
    ],
  };

  return (
    <div>
      <div className="metric-select">
        {(Object.keys(METRIC_DEF) as Metric[]).map((m) => (
          <button
            key={m}
            type="button"
            className={metric === m ? "active" : ""}
            onClick={() => setMetric(m)}
          >
            {METRIC_DEF[m].label}
          </button>
        ))}
      </div>
      <div style={{ height: Math.max(320, top12.length * 28) }}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
}
