"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fmtMes, fmtDate } from "@/lib/format";

// Pílula compacta e centralizada de mês + dia para a Visão Geral
// (2026-09-17, substitui o MesSelector isolado — Mikael pediu um filtro
// menor e centralizado, e a possibilidade de recortar por um dia dentro do
// mês, igual ao Resumo do Dia). Trocar de mês limpa o dia escolhido (a
// lista de dias é sempre relativa ao mês atual — um dia de outro mês não
// faz sentido aqui). Estado vive na URL (?mes=, ?dia=AAAA-MM-DD), mesma
// convenção do FilterBar/DiaSelector — nenhuma função cruza a fronteira
// Server→Client Component (só strings), evitando a classe de bug
// documentada em FilterBar.tsx [FIX 2026-09-15, D-30].
export function PeriodoSelector({
  meses,
  mesAtual,
  mesMaisRecente,
  dias,
  diaAtual,
  ultimaContratacao,
}: {
  meses: string[];
  mesAtual: string;
  mesMaisRecente: string | null;
  dias: string[];
  diaAtual: string | null;
  ultimaContratacao: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChangeMes(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === mesMaisRecente) params.delete("mes");
    else params.set("mes", value);
    params.delete("dia");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function onChangeDia(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete("dia");
    else params.set("dia", value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="vg-periodo-wrap">
      <div className="vg-periodo-pill">
        <select aria-label="Mês" value={mesAtual} onChange={(e) => onChangeMes(e.target.value)}>
          {meses.map((m) => (
            <option key={m} value={m}>
              {fmtMes(m)}
              {m === mesMaisRecente ? " · mais recente" : ""}
            </option>
          ))}
        </select>
        <span className="vg-periodo-sep" />
        <select aria-label="Dia" value={diaAtual ?? ""} onChange={(e) => onChangeDia(e.target.value)}>
          <option value="">mês inteiro</option>
          {dias.map((d) => (
            <option key={d} value={d}>
              {fmtDate(d)}
            </option>
          ))}
        </select>
        {ultimaContratacao && (
          <span className="vg-periodo-meta">dados até {fmtDate(ultimaContratacao.slice(0, 10))}</span>
        )}
      </div>
    </div>
  );
}
