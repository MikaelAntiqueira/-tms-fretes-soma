import type { ReactNode } from "react";
import { SOMA_LOGO_DATA_URI } from "./soma-logo";

// Cabeçalho compartilhado das páginas do dashboard — extraído em 2026-09-18
// a pedido do Mikael (as 8 page.tsx repetiam a mesma marcação de header;
// texto de explicação por página já tinha sido removido numa etapa anterior
// e guardado em docs/EXPLICACOES_PAGINAS.md).
//
// Duas faixas, não uma só (Opção B decidida por ele entre 2 mockups):
//   1. `.app-header-brandbar` — faixa fina, mesma altura em toda página,
//      só a marca ("SOMA ⌄" + "TMS Fretes"). O selo branco com "SOMA" já
//      imita o formato de um controle clicável — [FUTURO, Mikael
//      2026-09-18] vai virar um menu de verdade pra trocar de
//      filial/unidade (hoje só SOMA/RS, esta plataforma é o piloto) — por
//      ora é só visual, sem nenhuma função de seleção.
//   2. `.app-header-hero` — o título grande da página + as migalhas de
//      navegação, sem repetir a marca (que já mora na faixa de cima).
// Ambas centralizadas (pedido dele: "centralize os textos").
interface PageHeaderProps {
  title: ReactNode;
  crumbs?: ReactNode;
  heroClassName?: string;
}

export function PageHeader({ title, crumbs, heroClassName }: PageHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-brandbar">
        <span className="app-header-brand-badge">
          <img src={SOMA_LOGO_DATA_URI} alt="Grupo SOMA Hospitalar" />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
        <span className="app-header-brand-text">TMS Fretes</span>
      </div>
      <div className={`app-header-hero${heroClassName ? ` ${heroClassName}` : ""}`}>
        <div className="app-header-hero-inner">
          <h1>{title}</h1>
          {crumbs && <nav className="crumbs">{crumbs}</nav>}
        </div>
      </div>
    </header>
  );
}
