"use client";

// Client component: alterna as sub-abas da página "Financeiro" (TASK-29
// continuação — adição da sub-aba "Cotado × Contratado", 2026-09-11/12).
// Porta o mecanismo `.subnav`/`.subpage` do Artifact original (v42, E1.3 —
// "abas internas: alterna .subpage dentro da mesma página-mãe, sem
// showPage") — mesmas classes CSS (ver globals.css), mesmos ids de
// data-subpage ("fin-visao"/"fin-cotado") para não colidir com o vocabulário
// já usado pelo Artifact quando as próximas sub-abas (Padrões da Diferença /
// Peso, Cubagem & Custo) forem portadas.
//
// Diferente do Artifact (que usa `hidden` no DOM + querySelectorAll puro),
// aqui os dois blocos de conteúdo já vêm renderizados no servidor (dados já
// buscados para as duas sub-abas de uma vez, sem refetch ao trocar de aba) e
// este componente só decide qual `<div className="subpage">` filho fica
// visível, clonando os filhos para aplicar o atributo `hidden` — o padrão
// recomendado para "server content + interação client-side simples" no App
// Router (nenhum dos filhos precisa ser client component).
import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";

export interface FinanceiroTabDef {
  id: string;
  label: string;
}

export function FinanceiroTabs({
  tabs,
  defaultTab,
  children,
}: {
  tabs: FinanceiroTabDef[];
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
