"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "tms-theme";
const ORDER: Theme[] = ["light", "dark", "system"];
const LABEL: Record<Theme, string> = { light: "Claro", dark: "Escuro", system: "Automático" };

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

/**
 * Alternador de tema — ícone único no rodapé da sidebar (2026-09-18, a
 * pedido do Mikael: a versão anterior era uma pílula "Claro/Automático/
 * Escuro" repetida no cabeçalho de cada página, ocupando espaço à toa).
 * Um clique avança Claro → Escuro → Automático → Claro..., trocando só o
 * ícone (sol/lua/meio-a-meio) — sem texto, mesmo padrão visual de
 * `.sidebar-collapse-btn`. "Automático" continua seguindo o SO
 * (prefers-color-scheme), igual antes.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setTheme(stored);
      applyTheme(stored);
    }
  }, []);

  function handleClick() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage indisponível (ex.: navegação privada) — não é crítico aqui.
    }
    applyTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle-btn"
      title={`Tema: ${LABEL[theme]} (clique para trocar)`}
      aria-label={`Tema: ${LABEL[theme]}, clique para trocar`}
      onClick={handleClick}
    >
      {theme === "light" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 3v2.2M12 18.8V21M4.2 12H2M22 12h-2.2M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5" />
        </svg>
      )}
      {theme === "dark" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
        </svg>
      )}
      {theme === "system" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" stroke="none" />
        </svg>
      )}
    </button>
  );
}
