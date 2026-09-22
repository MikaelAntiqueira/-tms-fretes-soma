"use client";

// Hook compartilhado — lógica de leitura de variáveis CSS do tema (claro/escuro)
// para os gráficos Chart.js, antes duplicada em ~9 componentes (cada um com seu
// próprio VAR_NAMES/FALLBACK/readVars/useThemeVars copiado e colado). O conjunto
// de variáveis lidas varia por gráfico (nem todos usam --t1..--t7, por exemplo),
// então VAR_NAMES/FALLBACK continuam declarados em cada componente — só a
// mecânica de leitura (getComputedStyle + observar troca de tema) foi extraída.
//
// AUDITORIA_AG03.md M1 (2026-09-21).
import { useEffect, useState } from "react";

export function useThemeVars<K extends string>(varNames: readonly K[], fallback: Record<K, string>): Record<K, string> {
  const [vars, setVars] = useState<Record<K, string>>(fallback);

  useEffect(() => {
    function readVars(): Record<K, string> {
      const cs = getComputedStyle(document.documentElement);
      const out = { ...fallback };
      for (const n of varNames) {
        const v = cs.getPropertyValue(n).trim();
        if (v) out[n] = v;
      }
      return out;
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- varNames/fallback são const de módulo em cada chamador, nunca mudam entre renders
  }, []);

  return vars;
}
