import { createSupabaseServerClient } from "@/lib/supabase-server";

// Cabeçalho global (badges + metadados) portado do Artifact original
// (<header class="top"> / #hdrBadges / #hdrLastDate / #hdrFileDate,
// c0abf79e-..., v42) para a sidebar compartilhada — [TASK-29] continuação,
// 2026-09-12, a pedido do Mikael (elemento visível que faltava em toda a
// migração Next.js).
//
// Server Component: busca no Supabase via a function agregada
// `header_stats()` (todo o count/distinct/max feito no Postgres — nunca
// fetch-e-conta-em-JS no cliente; o PostgREST limita a 1000 linhas por
// página por padrão, e esse exato erro já aconteceu nesta migração:
// R$84.691,87 errado vs R$494.417,43 certo, documentado em
// 06_LOG_DECISOES.md/10_CHANGELOG.md). É passado como slot/prop
// (`stats`) para dentro do client component DashboardShell, que não pode
// fazer `await supabase...` direto por ser "use client".
//
// No Artifact original os 3 badges (processos/clientes/transportadoras
// ativas) refletiam o universo FILTRADO, recalculado a cada mudança de
// filtro (renderHeaderBadges(mask), chamado a cada recompute()). Esta
// migração ainda não tem o motor de filtro global (fase futura, grande,
// fora do escopo de hoje) — aqui os 3 números refletem a BASE INTEIRA, que
// é visualmente idêntico ao estado inicial do Artifact (sem filtro ativo):
// o próprio comentário do Artifact original registra "6.915 processos /
// ~660 clientes / 7 transportadoras" para esse estado.
//
// DECISÃO DE DESIGN — rótulo "Atualizado em" do Artifact original:
// lá, esse rótulo mostrava um timestamp ESTÁTICO (`META.fileUpdated`)
// gravado pelo pipeline Python (enrich_dashboard_data.py) no momento em
// que o arquivo dashboard_data.json foi gerado. Esse conceito ("quando o
// arquivo foi exportado") não existe mais nesta arquitetura: os dados vêm
// direto do Supabase em tempo real a cada carregamento de página, não de
// um arquivo estático — não há "arquivo" para carimbar, e fingir um
// timestamp fixo seria menos honesto que a arquitetura real.
// Escolhida a opção (a): trocar o rótulo por "Fonte: Supabase (dados em
// tempo real)", sem timestamp fixo — em vez da opção (b) (carimbar
// `Date.now()` do Server Component na hora do render), que pareceria
// "quando os dados foram atualizados" quando na verdade seria só "quando
// esta página foi montada", uma diferença sutil e potencialmente confusa
// para o Mikael. (a) comunica de forma mais clara que os dados são
// sempre atuais (ao vivo), que é o ponto real desta migração.
//
// [TASK-29] Fase 6 (Supabase Auth, 2026-09-12) — usa createSupabaseServerClient()
// (cookie-aware) em vez do cliente compartilhado sem sessão: as policies de
// leitura foram restritas a `authenticated`, e esta function precisa do JWT
// do usuário logado para não vir vazia (ver commit em src/app/page.tsx).
export async function SidebarStats() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("header_stats").single();

  if (error || !data) {
    // Falha aqui não pode derrubar o resto da página (sidebar/menu são
    // compartilhados por todas as rotas) — simplesmente não mostra o bloco.
    return null;
  }

  const stats = data as {
    total_processos: number;
    total_clientes: number;
    total_transportadoras_ativas: number;
    data_ultima_cotacao: string | null;
  };

  const fmtNum = (n: number) => n.toLocaleString("pt-BR");
  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const transp = stats.total_transportadoras_ativas;

  return (
    <div className="sidebar-stats">
      <div className="sidebar-stats-badges">
        <span className="badge">{fmtNum(stats.total_processos)} processos</span>
        <span className="badge">{fmtNum(stats.total_clientes)} clientes</span>
        <span className="badge">
          {fmtNum(transp)} transportadora{transp === 1 ? "" : "s"} ativa{transp === 1 ? "" : "s"}
        </span>
      </div>
      <div className="sidebar-stats-meta">
        <div>
          Última cotação: <strong>{fmtDate(stats.data_ultima_cotacao)}</strong>
        </div>
        <div className="sidebar-stats-secondary">Fonte: Supabase (dados em tempo real)</div>
        <div className="sidebar-stats-secondary">Analista: Mikael Antiqueira · TMS: Frete Rápido</div>
      </div>
    </div>
  );
}
