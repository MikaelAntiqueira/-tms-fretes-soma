"use client";

// Client component: os 3 gráficos da sub-aba "Cotado × Contratado" da página
// Financeiro (TASK-29 continuação, 2026-09-11/12) — Chart.js via
// react-chartjs-2, mesmo padrão já usado em
// src/app/transportadoras/ComparativoCharts.tsx (paleta lida em runtime via
// getComputedStyle, funciona nos 2 temas).
//
// Porta, linha a linha, 3 funções do Artifact original (v42):
//   renderEvolucao(mask)      -> chartEvolucao (linha)
//   renderEconomiaMes(mask)   -> chartEconomiaMes (barra)
//   renderEscolheu(mask)      -> chartEscolheu (doughnut)
// A agregação por mês (frete/melhor/nMelhor/diffPosSum) e os contadores
// s/n/sc vêm prontos do servidor (RPCs `financeiro_evolucao_mensal` e
// `financeiro_visao_geral_kpis`, reaproveitados em page.tsx) — este
// componente só desenha, não recalcula nenhuma regra de negócio.
import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend);

const VAR_NAMES = [
  "--brand-900",
  "--brand-300",
  "--t2",
  "--good",
  "--critical",
  "--text-muted",
  "--text-primary",
  "--text-secondary",
  "--border",
  "--surface-card",
] as const;
type VarName = (typeof VAR_NAMES)[number];

// Fallback = valores do tema claro em globals.css (:root), usados apenas
// durante o primeiro render no servidor (sem `document`).
const FALLBACK: Record<VarName, string> = {
  "--brand-900": "#005285",
  "--brand-300": "#5fb0c5",
  "--t2": "#eb6834",
  "--good": "#0ca30c",
  "--critical": "#d03b3b",
  "--text-muted": "#7f97a6",
  "--text-primary": "#0d2436",
  "--text-secondary": "#4f758e",
  "--border": "rgba(13, 36, 54, 0.12)",
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

function fmtBRL(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR");
}
function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
}

export interface EscolheuCounts {
  s: number;
  n: number;
  sc: number;
}

export function CotadoContratadoCharts({
  evoLabels,
  freteData,
  melhorData,
  ecoLabels,
  ecoData,
  escolheu,
  diffN,
}: {
  evoLabels: string[];
  freteData: number[];
  melhorData: (number | null)[];
  ecoLabels: string[];
  ecoData: number[];
  escolheu: EscolheuCounts;
  diffN: number;
}) {
  const vars = useThemeVars();
  const fontFamily = "var(--font-ibm-plex-sans), system-ui, sans-serif";
  const tickColor = vars["--text-secondary"];
  const gridColor = vars["--border"];

  // ---- Gráfico 1: Frete Contratado x Melhor Cotação Disponível (linha) ----
  const lineOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: tickColor, font: { family: fontFamily, size: 11 }, boxWidth: 12, boxHeight: 12, usePointStyle: true },
      },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtBRL(ctx.parsed.y)}` } },
    },
    scales: {
      x: { ticks: { color: tickColor, font: { family: fontFamily, size: 11 } }, grid: { display: false } },
      y: {
        ticks: { color: tickColor, font: { family: fontFamily, size: 11 }, callback: (v) => fmtBRL(Number(v)) },
        grid: { color: gridColor },
      },
    },
  };
  const lineData = {
    labels: evoLabels,
    datasets: [
      {
        label: "Frete Contratado",
        data: freteData,
        borderColor: vars["--brand-900"],
        backgroundColor: vars["--brand-900"],
        borderWidth: 2.5,
        pointRadius: 3,
        tension: 0.25,
      },
      {
        label: "Melhor Cotação Disponível (soma)",
        data: melhorData,
        borderColor: vars["--brand-300"],
        backgroundColor: vars["--brand-300"],
        borderWidth: 2,
        borderDash: [5, 4],
        pointRadius: 3,
        tension: 0.25,
      },
    ],
  };

  // ---- Gráfico 2: Diferença Financeira Identificada por Mês (barra) ----
  const barOptions: ChartOptions<"bar"> = {
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
  const barData = {
    labels: ecoLabels,
    datasets: [
      {
        label: "Diferença Financeira Identificada",
        data: ecoData,
        backgroundColor: vars["--t2"],
        borderRadius: 5,
        maxBarThickness: 34,
      },
    ],
  };

  // ---- Gráfico 3: Escolheu a Mais Barata? (doughnut) ----
  const { s, n, sc } = escolheu;
  const total = s + n + sc;
  const doughnutOptions: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "62%",
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: tickColor, font: { family: fontFamily, size: 11 }, boxWidth: 12, boxHeight: 12 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${fmtNum(Number(ctx.parsed))} (${fmtPct(total ? Number(ctx.parsed) / total : null)})`,
        },
      },
    },
  };
  const doughnutData = {
    labels: ["Sim", "Não", "Sem comparação"],
    datasets: [
      {
        data: [s, n, sc],
        backgroundColor: [vars["--good"], vars["--critical"], vars["--text-muted"]],
        borderColor: vars["--surface-card"],
        borderWidth: 2,
      },
    ],
  };

  return (
    <>
      <div className="grid cols2">
        <div className="card">
          <h3>Frete Contratado x Melhor Cotação Disponível</h3>
          <div className="sub">Soma mensal, R$ — meses sem contratação cruzada (ex.: mês em aberto) são omitidos</div>
          <div style={{ position: "relative", height: 270 }}>
            <Line data={lineData} options={lineOptions} />
          </div>
        </div>
        <div className="card">
          <h3>Diferença Financeira Identificada por Mês</h3>
          <div className="sub">Soma das diferenças positivas (pago acima da mais barata), R$</div>
          <div style={{ position: "relative", height: 270 }}>
            <Bar data={barData} options={barOptions} />
          </div>
        </div>
      </div>

      <div className="grid cols2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Escolheu a Mais Barata?</h3>
          <div className="sub">Distribuição dos processos comparáveis</div>
          <div style={{ position: "relative", height: 270 }}>
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        </div>
        <div className="card" id="impacto-decisao-card">
          <h3>Impacto financeiro da decisão</h3>
          <div className="sub">Sobre toda a base (sem filtro nesta etapa)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, justifyContent: "center", height: "calc(100% - 34px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                Processos onde a mais barata <b>não</b> foi escolhida
              </span>
              <span className="mono" style={{ fontWeight: 700 }}>
                {fmtNum(n)} <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>({fmtPct(total ? n / total : null)})</span>
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                Diferença observada nesses processos (não confirma causa)
              </span>
              <span className="mono" style={{ fontWeight: 700, color: "var(--critical)" }}>{fmtBRL(diffN)}</span>
            </div>
            <div style={{ height: 1, background: "var(--border)" }} />
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Por decisão da gestão ([DEC-25], 2026-09-10) não se registra &quot;motivo&quot; da não escolha: a
              ferramenta expõe os casos e a análise do porquê é feita pela gestão junto com a equipe de cotação.
              Este é o valor observável.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
