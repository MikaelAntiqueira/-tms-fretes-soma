"use client";

// Client component: alterna as sub-abas da página "Transportadoras &
// Cidades" (TASK-29 continuação — adição de "Região Comercial" e
// "Clientes", 2026-09-12). Cópia local (não compartilhada) do mesmo
// mecanismo genérico de `src/app/financeiro/FinanceiroTabs.tsx`
// (`.subnav`/`.subpage`, ver globals.css) — duplicado aqui em vez de
// extraído para um componente compartilhado porque a instrução desta etapa
// veda tocar em `src/app/financeiro/*`. [AUDITORIA_AG03.md M1, 2026-09-21]:
// a mesma duplicação nos hooks de gráfico (`useThemeVars`, antes copiado em
// ~9 componentes) foi extraída para `src/hooks/useThemeVars.ts` — este
// mecanismo de abas continua local de propósito, pelo motivo acima. Mesmo
// mecanismo de tabs: dois blocos de conteúdo já vêm renderizados no servidor (dados buscados
// uma vez, sem refetch ao trocar de aba) e este componente só decide qual
// `<div className="subpage">` filho fica visível.
import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";

export interface TransportadorasTabDef {
  id: string;
  label: string;
}

export function TransportadorasTabs({
  tabs,
  defaultTab,
  children,
}: {
  tabs: TransportadorasTabDef[];
  defaultTab: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(defaultTab);

  return (
    <>
      <div className="subnav">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={active === t.id ? "active" : ""}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const el = child as ReactElement<{ "data-subpage"?: string; hidden?: boolean }>;
        const subId = el.props["data-subpage"];
        if (subId == null) return child;
        return cloneElement(el, { hidden: subId !== active });
      })}
    </>
  );
}
