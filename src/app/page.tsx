import { Suspense } from "react";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase-server";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MesSelector } from "@/components/MesSelector";
import { VisaoGeralCard, type VisaoGeralCardData } from "@/components/VisaoGeralCard";
import { fmtBRL, fmtBRL2, fmtNum, fmtMes, fmtDate } from "@/lib/format";

// Página "Visão Geral" (/) — redesenho MVE 2026-09-17. Ver o comentário do
// commit para o histórico da decisão (3 áudios do Mikael com o Samuel).
// Não é a página de prova de conceito da Fase 5 da migração (removida) —
// esta é a "capa" real do dashboard, primeira tela que o Samuel vê.
export const dynamic = "force-dynamic";

// Mesmo mapeamento nome→slot categórico já usado em ComparativoCharts.tsx e
// src/app/operacao/page.tsx (CARRIER_COLOR/CARRIER_VAR) — só os HEX de cada
// slot mudaram em globals.css (cores de costume da empresa), o mapeamento
// nome→slot continua o mesmo em toda a aplicação.
const CARRIER_VAR: Record<string, string> = {
  "Fritz Express": "--t1",
  LKW: "--t2",
  Leomar: "--t3",
  Minuano: "--t4",
  "Rede Nacional": "--t5",
  "Santa Cruz": "--t6",
  "São Miguel": "--t7",
};

// Rede Nacional e Fritz Express sempre primeiro nas duas seções (Manhã e
// Tarde) — pedido do Mikael: são o foco, as mais competitivas na janela da
// tarde, e ele quer poder comparar Manhã×Tarde de cada uma lado a lado sem
// precisar procurar. As outras 5 só existem na Tarde (não operam Meio-dia).
const ORDEM_TARDE = ["Rede Nacional", "Fritz Express", "São Miguel", "Santa Cruz", "Leomar", "LKW", "Minuano"];
const ORDEM_MANHA = ["Rede Nacional", "Fritz Express"];

interface KpisVisaoGeral {
  mes: string;
  mesAnterior: string;
  freteTotal: number;
  freteTotalMesAnterior: number;
  pagoAMais: number;
  pagoAMaisMesAnterior: number;
  nCruzadasPagoAMais: number;
  nContratacoes: number;
}

interface BlocoRow {
  transportadoraId: string;
  transportadora: string;
  janela: string;
  valorTotal: number;
  nContratacoes: number;
  ticketMedio: number;
  pesoRealKg: number;
  pesoFreteKg: number;
  volumes: number;
  nComVolume: number;
  freteMinimoObservado: number | null;
  nClientesMinimo: number;
  valorMinimo: number | null;
}

interface VisaoGeralData {
  meses: string[];
  mesAtual: string | null;
  mesMaisRecente: string | null;
  kpis: KpisVisaoGeral | null;
  blocos: BlocoRow[];
  ultimaContratacao: string | null;
}

async function getVisaoGeralData(mesEscolhido: string | null): Promise<VisaoGeralData> {
  const supabase = await createSupabaseServerClient();

  const [mesesRes, ultimaRes] = await Promise.all([
    supabase.rpc("visao_geral_meses_disponiveis"),
    supabase.from("contratacoes").select("data_contratacao").order("data_contratacao", { ascending: false }).limit(1),
  ]);
  if (mesesRes.error) throw new Error(mesesRes.error.message);
  if (ultimaRes.error) throw new Error(ultimaRes.error.message);

  const meses = ((mesesRes.data as { mes: string }[]) ?? []).map((r) => r.mes);
  const mesMaisRecente = meses[0] ?? null;
  const mesAtual = mesEscolhido && meses.includes(mesEscolhido) ? mesEscolhido : mesMaisRecente;
  const ultimaContratacao = (ultimaRes.data as { data_contratacao: string }[])?.[0]?.data_contratacao ?? null;

  if (!mesAtual) {
    return { meses, mesAtual: null, mesMaisRecente: null, kpis: null, blocos: [], ultimaContratacao };
  }

  const [kpisRes, blocosRes] = await Promise.all([
    supabase.rpc("visao_geral_kpis", { p_mes: mesAtual }),
    supabase.rpc("visao_geral_blocos", { p_mes: mesAtual }),
  ]);
  if (kpisRes.error) throw new Error(kpisRes.error.message);
  if (blocosRes.error) throw new Error(blocosRes.error.message);

  const k = kpisRes.data as Record<string, unknown>;
  const kpis: KpisVisaoGeral = {
    mes: String(k.mes),
    mesAnterior: String(k.mes_anterior),
    freteTotal: Number(k.frete_total ?? 0),
    freteTotalMesAnterior: Number(k.frete_total_mes_anterior ?? 0),
    pagoAMais: Number(k.pago_a_mais ?? 0),
    pagoAMaisMesAnterior: Number(k.pago_a_mais_mes_anterior ?? 0),
    nCruzadasPagoAMais: Number(k.n_cruzadas_pago_a_mais ?? 0),
    nContratacoes: Number(k.n_contratacoes ?? 0),
  };

  const blocos: BlocoRow[] = ((blocosRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    transportadoraId: String(r.transportadora_id),
    transportadora: String(r.transportadora),
    janela: String(r.janela),
    valorTotal: Number(r.valor_total ?? 0),
    nContratacoes: Number(r.n_contratacoes ?? 0),
    ticketMedio: Number(r.ticket_medio ?? 0),
    pesoRealKg: Number(r.peso_real_kg ?? 0),
    pesoFreteKg: Number(r.peso_frete_kg ?? 0),
    volumes: Number(r.volumes ?? 0),
    nComVolume: Number(r.n_com_volume ?? 0),
    freteMinimoObservado: r.frete_minimo_observado == null ? null : Number(r.frete_minimo_observado),
    nClientesMinimo: Number(r.n_clientes_minimo ?? 0),
    valorMinimo: r.valor_minimo == null ? null : Number(r.valor_minimo),
  }));

  return { meses, mesAtual, mesMaisRecente, kpis, blocos, ultimaContratacao };
}

function tendenciaTxt(atual: number, anterior: number, mesAnterior: string): string {
  if (anterior === 0) return `sem dado em ${fmtMes(mesAnterior)}`;
  const pct = ((atual - anterior) / anterior) * 100;
  const sinal = pct > 0 ? "+" : "";
  return `${sinal}${pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% vs. ${fmtMes(mesAnterior)}`;
}

function BlocoCard({ b, mes }: { b: BlocoRow; mes: string }) {
  const data: VisaoGeralCardData = {
    transportadoraId: b.transportadoraId,
    transportadora: b.transportadora,
    janela: b.janela,
    colorVar: CARRIER_VAR[b.transportadora] ?? "--brand-700",
    valorTotal: b.valorTotal,
    nContratacoes: b.nContratacoes,
    pesoRealKg: b.pesoRealKg,
    volumes: b.volumes,
    nComVolume: b.nComVolume,
    ticketMedio: b.ticketMedio,
    freteMinimoObservado: b.freteMinimoObservado,
    nClientesMinimo: b.nClientesMinimo,
    valorMinimo: b.valorMinimo,
    mes,
  };
  return <VisaoGeralCard data={data} />;
}

type VisaoGeralSearchParams = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<VisaoGeralSearchParams> }) {
  // [D-28] Rede de segurança independente de proxy.ts — ver comentário em
  // src/lib/supabase-server.ts.
  await requireUser("/");
  const sp = await searchParams;
  const mesParam = Array.isArray(sp.mes) ? sp.mes[0] : sp.mes;

  let data: VisaoGeralData | null = null;
  let erro: string | null = null;
  try {
    data = await getVisaoGeralData(mesParam ?? null);
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido ao consultar o Supabase.";
  }

  const meses = data?.meses ?? [];
  const mesAtual = data?.mesAtual ?? null;
  const mesMaisRecente = data?.mesMaisRecente ?? null;
  const kpis = data?.kpis ?? null;
  const blocos = data?.blocos ?? [];
  const ultimaContratacao = data?.ultimaContratacao ?? null;

  const porTransportadoraJanela = new Map(blocos.map((b) => [`${b.transportadora}__${b.janela}`, b]));
  const blocosManha = ORDEM_MANHA.map((t) => porTransportadoraJanela.get(`${t}__Meio-dia`)).filter(
    (b): b is BlocoRow => !!b
  );
  const blocosTarde = ORDEM_TARDE.map((t) => porTransportadoraJanela.get(`${t}__Tarde`)).filter(
    (b): b is BlocoRow => !!b
  );

  return (
    <div className="app-shell">
      <header className="app-header vg-header">
        <div className="app-header-inner">
          <div>
            <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
            <h1>Visão geral</h1>
            <p>Frete total e quem está carregando, por transportadora e janela de contratação.</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="content wide vg-main">
        {erro ? (
          <div className="status-banner erro">
            <b>Não foi possível consultar o Supabase.</b>
            <div style={{ marginTop: 6 }}>{erro}</div>
          </div>
        ) : !mesAtual || !kpis ? (
          <div className="status-banner">Sem contratações nos dados atuais.</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                {ultimaContratacao ? <>Dados até {fmtDate(ultimaContratacao.slice(0, 10))}</> : null}
              </div>
              <Suspense fallback={<div />}>
                <MesSelector meses={meses} atual={mesAtual} mesMaisRecente={mesMaisRecente} />
              </Suspense>
            </div>

            <div className="vg-hero-grid">
              <div className="vg-hero-card">
                <div className="lbl">Frete total no período</div>
                <div className="val">{fmtBRL(kpis.freteTotal)}</div>
                <div className="trend">{tendenciaTxt(kpis.freteTotal, kpis.freteTotalMesAnterior, kpis.mesAnterior)}</div>
              </div>
              <div className="vg-hero-card">
                <div className="lbl">Diferença identificada</div>
                <div className="val neg">{fmtBRL(kpis.pagoAMais)}</div>
                <div className="trend">{tendenciaTxt(kpis.pagoAMais, kpis.pagoAMaisMesAnterior, kpis.mesAnterior)}</div>
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: -8, marginBottom: 14, textAlign: "center" }}>
              Diferença = só as {fmtNum(kpis.nCruzadasPagoAMais)} contratações com cotação para comparar — o frete
              total acima é sobre toda a base.
            </div>

            {blocosManha.length > 0 && (
              <>
                <div className="vg-section-label">Manhã</div>
                <div className="vg-grid">
                  {blocosManha.map((b) => (
                    <BlocoCard key={`${b.transportadora}-${b.janela}`} b={b} mes={mesAtual} />
                  ))}
                </div>
              </>
            )}

            {blocosTarde.length > 0 && (
              <>
                <div className="vg-section-label">Tarde</div>
                <div className="vg-grid" style={{ marginBottom: 0 }}>
                  {blocosTarde.map((b) => (
                    <BlocoCard key={`${b.transportadora}-${b.janela}`} b={b} mes={mesAtual} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
