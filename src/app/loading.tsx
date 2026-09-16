// loading.tsx (convenção do Next.js App Router) — Mikael relatou que os
// cliques no filtro global (FilterBar) e no seletor de dia (DiaSelector)
// "demoram pra fazer a ação": como nenhuma rota tinha loading.tsx, o clique
// não mostrava NENHUM feedback visual até o Server Component terminar de
// buscar tudo no Supabase — parecia que o clique não tinha feito nada. Este
// arquivo cobre TODAS as rotas (fica na raiz de `src/app`, um único Suspense
// boundary automático do Next.js) — troca de página/filtro passa a mostrar
// este spinner imediatamente, em vez de tela "travada".
export default function Loading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        minHeight: "60vh",
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "3px solid var(--border)",
          borderTopColor: "var(--brand-700, var(--text-muted))",
          animation: "tms-spin 0.7s linear infinite",
        }}
      />
      <span>Carregando…</span>
      <style>{`@keyframes tms-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
