"use client";

// Client component: gráfico de barra "Diferença dos últimos 15 dias" da
// página /ontem (Portar gráficos e tabelas restantes, agent_tasks#2,
// Hermes, 2026-09-14). Porta 1:1 o trecho final de `function
// renderOntem(mask)` do Artifact v42 -> canvas `ontTendChart` — o único dos
// 16 gráficos que ainda faltava (`ontem/page.tsx` não tinha nenhum gráfico
// até aqui).
//
// Diferença de escopo em relação ao original: o Artifact tinha um
// `<select id="ontDia">` que deixava escolher qualquer um dos últimos 15
// dias como "dia de referência", e o destaque do gráfico seguia essa
// escolha. A migração desta página (`ontem/page.tsx`) já não portou esse
// seletor — `ref` é sempre `ontem_dia_referencia()` (o dia mais recente com
// contratação cruzada), sem escolha do usuário. Este componente segue essa
// mesma decisão já tomada: destaca sempre o dia de `ref`, nunca um dia
// escolhido interativamente. Não é uma redução de escopo desta entrega —
// é herdada da página que já existia.
//
// Dado vem pronto do servidor via RPC `ontem_tendencia_15_dias` (migration
// `fn_ontem_tendencia_15_dias`) — mesma fonte (`v_ontem_comparacao`) e
// mesma regra de soma (só diferenca_r > 0) já usadas em `ontem_kpis`
// (`diferenca_pos_sum`); este componente só desenha.
import { useEffect, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, type ChartOptions } from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const VAR_NAMES = ["--brand-700", "--brand-300", "--text-secondary", "--border"] as const;
type VarName = (typeof VAR_NAMES)[number];

// Fallback = valores do tema claro em globals.css (:root), usados apenas
// durante o primeiro render no servidor (sem `document`).
const FALLBACK: Record<VarName, string> = {
  "--brand-700": "#088cb3",
  "--brand-300": "#5fb0c5",
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

function fmtBRL(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
// Mesmo corte de `fmtDate(d).slice(0,5)` do Artifact original (DD/MM).
function fmtDiaCurto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export interface OntemTendenciaRow {
  dia: string; // YYYY-MM-DD
  soma_diff_pos: number;
}

export function OntemTendenciaChart({ rows, diaRef }: { rows: OntemTendenciaRow[]; diaRef: string | null }) {
  const vars = useThemeVars();
  const fontFamily = "var(--font-ibm-plex-sans), system-ui, sans-serif";
  const tickColor = vars["--text-secondary"];
  const gridColor = vars["--border"];

  const options: ChartOptions<"bar"> = {
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
  const data = {
    labels: rows.map((r) => fmtDiaCurto(r.dia)),
    datasets: [
      {
        data: rows.map((r) => r.soma_diff_pos),
        backgroundColor: rows.map((r) => (r.dia === diaRef ? vars["--brand-700"] : vars["--brand-300"])),
        borderRadius: 4,
        maxBarThickness: 28,
      },
    ],
  };

  return (
    <div className="card">
      <h3>Diferença dos últimos 15 dias</h3>
      <div className="sub">soma da diferença positiva (R$) por dia — o dia de referência (D-1) fica destacado</div>
      <div style={{ position: "relative", height: 150, marginTop: 8 }}>
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}
