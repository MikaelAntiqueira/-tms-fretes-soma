"use client";

// Menu lateral fixo unificando a navegação entre as páginas já portadas —
// [TASK-29] continuação (2026-09-12), a pedido do Mikael ("não era pra
// estar tudo junto numa página?"). Porta a marcação e o comportamento do
// <nav class="sidebar"> do Artifact original (c0abf79e-..., v42) para um
// client component React: mesmos ícones/labels, mesma regra de recolher
// (desktop) e abrir em overlay (mobile, <900px) — só troca manipulação de
// DOM/CSS-classes puras por estado do React + <Link> do Next (navegação
// real entre rotas, não troca de `.page[hidden]` como no Artifact).
//
// Item "Visão Geral" (/) não existe no Artifact (lá a 1ª aba já é "Hoje") —
// é a página de prova de conceito original desta migração; mantida como
// 1º item pra não sumir do menu, com um ícone genérico próprio.
// "Oportunidades" ainda não foi portada (ver 07_PROBLEMAS_ABERTOS.md →
// [ISSUE-23]) — aparece desabilitada, sem link, com indicação "em breve".
//
// NÃO altera nenhum src/app/*/page.tsx existente — só envolve `children`
// (vindos de src/app/layout.tsx) numa div com o offset de margem da
// sidebar (`.with-sidebar`, classe nova, não reaproveita `.app-shell`: essa
// já é usada dentro de cada page.tsx com um significado diferente — flex
// column simples, sem offset — pra não colidir as duas definições de CSS).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SOMA_LOGO_DATA_URI } from "./soma-logo";

interface NavItem {
  href: string;
  label: string;
  title: string;
  icon: ReactNode;
  disabled?: boolean;
}

const ICON_STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Visão Geral",
    title: "Visão Geral — prova de conceito da migração",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON_STROKE}>
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
        <path d="M10 20v-6h4v6" />
      </svg>
    ),
  },
  {
    href: "/ontem",
    label: "Hoje",
    title: "Hoje — decisões de contratação do último dia fechado",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON_STROKE}>
        <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
        <path d="M3.5 9h17" />
        <path d="M8 3v3" />
        <path d="M16 3v3" />
        <path d="M7.5 13.5l2.5 2.5 6-6" />
      </svg>
    ),
  },
  {
    href: "/operacao",
    label: "Operação",
    title: "Controle Operacional de Carregamento",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON_STROKE}>
        <path d="M3 16V7a1 1 0 0 1 1-1h9v10" />
        <path d="M13 10h4l3 3v3h-2" />
        <circle cx="7.5" cy="17.5" r="1.8" />
        <circle cx="17.5" cy="17.5" r="1.8" />
        <path d="M9.3 17.5h6.4" />
      </svg>
    ),
  },
  {
    href: "/financeiro",
    label: "Financeiro",
    title: "Financeiro — cotado × contratado, padrões e custo",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON_STROKE}>
        <path d="M3 7a2 2 0 0 1 2-2h12l3 3v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
        <path d="M16 13h2.5" />
      </svg>
    ),
  },
  {
    href: "/transportadoras",
    label: "Transportadoras & Cidades",
    title: "Transportadoras & Cidades",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON_STROKE}>
        <path d="M3 16V7a1 1 0 0 1 1-1h9v10" />
        <path d="M13 10h4l3 3v3h-2" />
        <circle cx="7.5" cy="17.5" r="1.8" />
        <circle cx="17.5" cy="17.5" r="1.8" />
        <path d="M9.3 17.5h6.4" />
      </svg>
    ),
  },
  {
    href: "/oportunidades",
    label: "Oportunidades",
    title: "Oportunidades — ainda não portada (depende de decisão de negócio, ver ISSUE-23)",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON_STROKE}>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
    disabled: true,
  },
];

export function DashboardShell({ children, stats }: { children: ReactNode; stats?: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className={`sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
        <div className="sidebar-brand">
          {/* Logo "Grupo SOMA Hospitalar" — portada do header do Artifact
              original (estava faltando em todo o Next.js até esta etapa,
              apontado pelo Mikael). Ver src/components/soma-logo.ts. */}
          <img className="sidebar-brand-logo" src={SOMA_LOGO_DATA_URI} alt="Grupo SOMA Hospitalar" />
          <span className="sidebar-brand-text">
            <span className="sidebar-brand-title">TMS FRETES</span>
            <span className="sidebar-brand-sub">Gestão &amp; Inteligência</span>
          </span>
        </div>

        {/* Badges + metadados do cabeçalho do Artifact original
            (<header class="top">/#hdrBadges/#hdrLastDate) — [TASK-29]
            continuação, 2026-09-12. `stats` vem de src/app/layout.tsx como
            <SidebarStats /> (Server Component que consulta o Supabase),
            passado por slot/prop porque este componente é "use client" e
            não pode fazer `await` direto. Ver src/components/SidebarStats.tsx
            para a decisão de design do rótulo "Atualizado em". */}
        {stats}

        <div className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            if (item.disabled) {
              return (
                <span key={item.href} className="nav-item disabled" title={item.title}>
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label} · em breve</span>
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item${active ? " active" : ""}`}
                title={item.title}
                onClick={() => setMobileOpen(false)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <button
        type="button"
        className={`sidebar-collapse-btn${collapsed ? " collapsed" : ""}`}
        aria-label="Recolher/expandir menu"
        title="Recolher/expandir menu"
        onClick={() => setCollapsed((c) => !c)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>

      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label="Abrir menu"
        onClick={() => setMobileOpen(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 6.5h17" />
          <path d="M3.5 12h17" />
          <path d="M3.5 17.5h17" />
        </svg>
      </button>
      <div className={`sidebar-scrim${mobileOpen ? " open" : ""}`} onClick={() => setMobileOpen(false)} />

      <div className={`with-sidebar${collapsed ? " collapsed" : ""}`}>{children}</div>
    </>
  );
}
