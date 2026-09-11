"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "tms-theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

/**
 * Alternador de tema — demonstra o suporte a dark mode manual (data-theme)
 * além do automático (prefers-color-scheme), conforme a Etapa 1.1 do mapa de
 * migração. "Automático" segue a preferência do sistema operacional.
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

  function handleSelect(next: Theme) {
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage indisponível (ex.: navegação privada) — não é crítico aqui.
    }
    applyTheme(next);
  }

  const options: { value: Theme; label: string }[] = [
    { value: "light", label: "Claro" },
    { value: "system", label: "Automático" },
    { value: "dark", label: "Escuro" },
  ];

  return (
    <div className="theme-toggle" role="group" aria-label="Tema da página">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={theme === opt.value ? "on" : ""}
          onClick={() => handleSelect(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
