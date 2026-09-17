"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fmtMes } from "@/lib/format";

// Seletor de mês para a página "Visão Geral" (/). Mesma convenção já usada
// em DiaSelector.tsx (/ontem): estado vive na URL (?mes=AAAA-MM), sem
// parâmetro = mês mais recente com contratação. Nenhuma função cruza a
// fronteira Server→Client Component (só strings) — mesmo cuidado documentado
// em FilterBar.tsx [FIX 2026-09-15, D-30].
export function MesSelector({
  meses,
  atual,
  mesMaisRecente,
}: {
  meses: string[];
  atual: string | null;
  mesMaisRecente: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === mesMaisRecente) params.delete("mes");
    else params.set("mes", value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <select
      aria-label="Mês"
      value={atual ?? ""}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "7px 12px",
        borderRadius: 8,
        border: "1px solid var(--border-strong)",
        background: "var(--surface-card)",
        color: "var(--text-primary)",
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {meses.map((m) => (
        <option key={m} value={m}>
          {fmtMes(m)}
          {m === mesMaisRecente ? " · mais recente" : ""}
        </option>
      ))}
    </select>
  );
}
