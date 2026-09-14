"use client";

// Client component: doughnut "Classificação por impacto" da sub-aba
// "Classificação" de /oportunidades (Portar gráficos e tabelas restantes,
// TASK Supabase agent_tasks#2, 2026-09-14). Porta 1:1 `function
// renderClassif(mask)` do Artifact v42 -> canvas `chartClassif` — o único
// gráfico dessa página; até aqui a página só tinha a tabela "Contagem por
// classificação" como substituto (ver comentário removido em
// OportunidadesTabsClient.tsx: "sem Chart.js neste estágio").
//
// Mesmo padrão de leitura de tokens CSS em runtime (getComputedStyle) já
// usado em CotadoContratadoCharts.tsx/RegiaoComercialChart.tsx — duplicado
// aqui de propósito (ver comentário de TransportadorasTabs.tsx).
//
// Cores e ordem das classes vêm de fora (props `order`/`colors`) — são as
// MESMAS já usadas pela tabela "Contagem por classificação" e pelos badges
// em OportunidadesTabsClient.tsx (CLASSIF_ORDER/COLORS de page.tsx), para o
// gráfico nunca divergir da tabela ao lado. Os rótulos usam o mesmo texto
// capitalizado dos badges (não o texto do Artifact original) porque a regra
// de classificação já portada (percentis P25/P75 por grupo Público/Privado,
// ver "Legenda" abaixo do gráfico) é mais específica que a descrição textual
// do Artifact v42 — inventar um rótulo novo aqui divergiria da única fonte
// de verdade que já existe no código.
import { useEffect, useState } from "react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, type ChartOptions } from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

const VAR_NAMES = ["--text-secondary", "--surface-card"] as const;
type VarName = (typeof VAR_NAMES)[number];

// Fallback = valores do tema claro em globals.css (:root), usados apenas
// durante o primeiro render no servidor (sem `document`).
const FALLBACK: Record<VarName, string> = {
  "--text-secondary": "#4f758e",
  "--surface-card": "#ffffff",
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

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR");
}
function fmtPct(v: number | null, d = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface ClassifCounts {
  verde: number;
  azul: number;
  laranja: number;
  vermelho: number;
  alerta: number;
}

export function ClassificacaoChart({
  counts,
  order,
  colors,
}: {
  counts: ClassifCounts;
  order: string[];
  colors: Record<string, string>;
}) {
  const vars = useThemeVars();
  const fontFamily = "var(--font-ibm-plex-sans), system-ui, sans-serif";
  const tickColor = vars["--text-secondary"];

  const values = order.map((k) => counts[k as keyof ClassifCounts] ?? 0);
  const total = values.reduce((s, v) => s + v, 0);

  const doughnutOptions: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "60%",
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: tickColor, font: { family: fontFamily, size: 10.5 }, boxWidth: 11, boxHeight: 11 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${fmtNum(Number(ctx.parsed))} (${fmtPct(total ? Number(ctx.parsed) / total : null)})`,
        },
      },
    },
  };
  const doughnutData = {
    labels: order.map(capitalize),
    datasets: [
      {
        data: values,
        backgroundColor: order.map((k) => colors[k] ?? "#9ca3af"),
        borderColor: vars["--surface-card"],
        borderWidth: 2,
      },
    ],
  };

  return (
    <div className="card">
      <h3>Classificação por impacto</h3>
      <div className="sub">Processos comparáveis no filtro atual</div>
      <div style={{ position: "relative", height: 260 }}>
        <Doughnut data={doughnutData} options={doughnutOptions} />
      </div>
    </div>
  );
}
