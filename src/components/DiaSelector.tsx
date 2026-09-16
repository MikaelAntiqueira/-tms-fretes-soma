"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fmtDate } from "@/lib/format";

// Seletor de dia específico para /ontem. Mikael pediu (2026-09-16): o padrão
// continua sendo "o último dia com contratação cruzada" (comportamento
// original, sem parâmetro na URL), mas o usuário precisa poder escolher
// outro dia específico pra ver o mesmo painel daquele dia. Estado vive na
// URL (?dia=AAAA-MM-DD), mesma convenção do FilterBar — nenhuma função cruza
// a fronteira Server→Client Component (só strings), evitando a classe de
// bug já documentada em FilterBar.tsx [FIX 2026-09-15, D-30].
export function DiaSelector({
  dias,
  atual,
  diaMaisRecente,
}: {
  dias: string[];
  atual: string | null;
  diaMaisRecente: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === diaMaisRecente) params.delete("dia");
    else params.set("dia", value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="dia-selector" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <label htmlFor="dia-select" style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
        Ver o dia:
      </label>
      <select
        id="dia-select"
        value={atual ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--surface-card)",
          color: "var(--text-primary)",
        }}
      >
        {dias.map((d) => (
          <option key={d} value={d}>
            {fmtDate(d)}
            {d === diaMaisRecente ? " · mais recente" : ""}
          </option>
        ))}
      </select>
      {atual && atual !== diaMaisRecente && (
        <button type="button" className="filterbar-clear" onClick={() => onChange("")}>
          voltar para o dia mais recente
        </button>
      )}
    </div>
  );
}
