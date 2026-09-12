import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ThemeToggle } from "@/components/ThemeToggle";

// Página sempre busca dado fresco — é só uma prova de conceito de conexão
// com o Supabase, não tem cache a gerenciar ainda.
export const dynamic = "force-dynamic";

interface Kpis {
  totalCotacoes: number;
  totalContratacoes: number;
  contratacoesCruzadas: number;
  freteContratadoCruzadas: number;
}

async function getKpis(): Promise<Kpis> {
  const supabase = await createSupabaseServerClient();
  const [cotacoesRes, contratacoesRes, cruzadasRes, somaRes] = await Promise.all([
    // FATO — total de sessões de cotação (Enviado↔Recebido casados por chave estável).
    supabase.from("cotacoes").select("*", { count: "exact", head: true }),
    // FATO — total de contratações (export "Contratados" do painel Frete Rápido).
    supabase.from("contratacoes").select("*", { count: "exact", head: true }),
    // DADO DERIVADO — contratações que casaram com uma cotação (cotacao_id preenchido).
    supabase
      .from("contratacoes")
      .select("*", { count: "exact", head: true })
      .not("cotacao_id", "is", null),
    // Soma do Frete Contratado só das contratações cruzadas — feita DENTRO do
    // banco via RPC (function `sum_frete_contratado_cruzadas`, migration
    // `fn_sum_frete_contratado_cruzadas`), não buscando as linhas e somando
    // em JS: o PostgREST/Supabase limita a 1000 linhas por requisição por
    // padrão, e há 5.194 linhas cruzadas — somar no cliente vinha incompleto
    // (achado em produção: R$ 84.691,87 em vez de R$ 494.417,43).
    supabase.rpc("sum_frete_contratado_cruzadas"),
  ]);

  for (const res of [cotacoesRes, contratacoesRes, cruzadasRes, somaRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  return {
    totalCotacoes: cotacoesRes.count ?? 0,
    totalContratacoes: contratacoesRes.count ?? 0,
    contratacoesCruzadas: cruzadasRes.count ?? 0,
    freteContratadoCruzadas: Number(somaRes.data ?? 0),
  };
}

function formatInt(n: number) {
  return n.toLocaleString("pt-BR");
}

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function Home() {
  let kpis: Kpis | null = null;
  let erro: string | null = null;

  try {
    kpis = await getKpis();
  } catch (e) {
    erro =
      e instanceof Error
        ? e.message
        : "Erro desconhecido ao consultar o Supabase.";
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <div className="eyebrow">TMS Fretes · Grupo SOMA/RS</div>
            <h1>Frete Cotado × Frete Contratado</h1>
            <p>
              Esqueleto da migração V3 (Next.js + Supabase) — prova de conceito
              de conexão com dados reais. O dashboard completo é portado nas
              próximas fases, uma página de cada vez.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="content">
        <div className="section-label">Números de prova de conceito</div>

        {erro ? (
          <div className="status-banner erro">
            <b>Não foi possível consultar o Supabase.</b>
            <div style={{ marginTop: 6 }}>{erro}</div>
          </div>
        ) : (
          kpis && (
            <>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <span className="badge">FATO</span>
                  <div className="lbl">Total de Cotações</div>
                  <div className="val mono">{formatInt(kpis.totalCotacoes)}</div>
                  <div className="note">
                    Uma linha por sessão de cotação (Enviado↔Recebido casados
                    por chave estável). Tabela <code>cotacoes</code>.
                  </div>
                </div>

                <div className="kpi-card">
                  <span className="badge">FATO</span>
                  <div className="lbl">Total de Contratações</div>
                  <div className="val mono">{formatInt(kpis.totalContratacoes)}</div>
                  <div className="note">
                    Export &quot;Contratados&quot; do painel Frete Rápido.
                    Tabela <code>contratacoes</code>.
                  </div>
                </div>

                <div className="kpi-card">
                  <span className="badge">DADO DERIVADO</span>
                  <div className="lbl">Contratações Cruzadas com Cotação</div>
                  <div className="val mono">{formatInt(kpis.contratacoesCruzadas)}</div>
                  <div className="note">
                    Contratações com <code>cotacao_id</code> preenchido — cerca
                    de 1/3 da operação cruza uma cotação (cobertura estrutural,
                    não erro).
                  </div>
                </div>

                <div className="kpi-card">
                  <span className="badge">INDICADOR</span>
                  <div className="lbl">Frete Contratado (cruzadas)</div>
                  <div className="val mono">{formatBRL(kpis.freteContratadoCruzadas)}</div>
                  <div className="note">
                    Soma de <code>valor_frete_contratado</code> só das
                    contratações cruzadas — teste de aceitação desta etapa:
                    precisa bater R$ 494.417,43.
                  </div>
                </div>
              </div>

              <div className="status-banner">
                <b>Conexão com o Supabase OK.</b> Os 4 números acima vieram ao
                vivo do projeto <code>jpoizkylaffircimxzrq</code> (tms-fretes-soma).
              </div>
            </>
          )
        )}

        <div className="provisorio-note">
          <b>Provisório:</b> as tabelas <code>cotacoes</code>,{" "}
          <code>ofertas</code>, <code>contratacoes</code>,{" "}
          <code>clientes</code> e <code>transportadoras</code> têm uma policy
          de leitura pública (<code>for select using (true)</code>) só para
          destravar este esqueleto sem esperar a Fase 6 (Supabase Auth +
          policies reais de admin/user). Isso não é a política final de
          segurança do projeto.
        </div>
      </main>

      <footer className="app-footer">
        Documento-mãe desta migração:{" "}
        <code>mapa-migracao-tms-v3-2026-09-11.md</code> (projeto original, ver
        README).
      </footer>
    </div>
  );
}
