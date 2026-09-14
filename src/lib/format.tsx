// ============================================================================
// Utilitários de formatação — extraídos de várias páginas para centralizar
// Evita duplicação de fmtMes, parseMulti, fmtBRL, fmtBRL2, fmtBRLSigned,
// fmtNum, fmtPct, fmtPrazoMedio, clsDif, clsDifSobreFrete, fmtKg,
// clsDifPercentual, EscPill, buildHref e confiabilidade em várias páginas
// ============================================================================

/** Formata mês ISO (2026-07) para exibição (jul/2026) */
export function fmtMes(iso: string): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const nomes = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const idx = parseInt(m ?? "0", 10) - 1;
  return `${nomes[idx] ?? "?"}/${y}`;
}

/** Parse multi-valores de searchParams ("2026-07,2026-08" → ["2026-07","2026-08"]) */
export function parseMulti(raw: string | string[] | undefined): string[] | null {
  if (!raw) return null;
  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  const values = joined.split(",").map((v) => v.trim()).filter(Boolean);
  return values.length > 0 ? values : null;
}

/** Formata valor monetário BRL com 0 casas decimais (frete médio, totals grandes) */
export function fmtBRL(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Formata valor monetário BRL com 2 casas decimais (diferenciais, contratos) */
export function fmtBRL2(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Formata valor monetário com sinal (+/-) — usado para diferenças */
export function fmtBRLSigned(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v) || v === 0) return "—";
  const s = Math.abs(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  return v > 0 ? `+${s}` : `-${s}`;
}

/** Formata número com casas decimais configuráveis */
export function fmtNum(v: number | null | undefined, d = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Formata percentual */
export function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
}

/** Formata prazo médio (fixo, não localizado) — "(r.prz/r.prn).toFixed(1)+' d'" */
export function fmtPrazoMedio(v: number | null, n: number): string {
  if (n <= 0 || v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)} d`;
}

/** Formata data ISO YYYY-MM-DD para dd/mm/aaaa */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Formata peso em kg com 1 casa decimal */
export function fmtKg(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " kg";
}

/** Monta href de paginação para /dados */
export function buildHref(base: { q: string; sort: string; dir: "asc" | "desc"; page: number }): string {
  const params = new URLSearchParams();
  if (base.q) params.set("q", base.q);
  params.set("sort", base.sort);
  params.set("dir", base.dir);
  params.set("page", String(base.page));
  return `/dados?${params.toString()}`;
}

/** Pill de escolha (Sim/Não/Sem comp.) */
export function EscPill({ e }: { e: "S" | "N" | "SC" }) {
  if (e === "S") return <span className="pill s">Sim</span>;
  if (e === "N") return <span className="pill n">Não</span>;
  if (e === "SC") return <span className="pill sc">Sem comp.</span>;
  return <>—</>;
}

/** Classifica magnitude da diferença (clsDif) — usado em /ontem e /dados */
export function clsDif(dr: number | null, dp: number | null): "" | "good" | "warning" | "serious" | "critical" {
  if (dr == null) return "";
  if (dr <= 0) return "good";
  if (dp == null || dp <= 0.05) return "warning";
  if (dp <= 0.15) return "serious";
  return "critical";
}

/** Classifica magnitude da diferença sobre o frete DA PRÓPRIA LINHA
 * (clsDifSobreFrete) — usado em /transportadoras e /operacao */
export function clsDifSobreFrete(diff: number, frete: number): "" | "good" | "warning" | "serious" | "critical" {
  if (diff <= 0) return "good";
  const pct = frete > 0 ? diff / frete : 0;
  if (pct > 0.15) return "critical";
  if (pct > 0.05) return "serious";
  return "warning";
}

/** Diferença percentual formatada (clsDifPercentual) — usado em /oportunidades */
export function clsDifPercentual(diffP: number | null | undefined): string {
  if (diffP == null || Number.isNaN(diffP)) return "—";
  return `${(diffP * 100).toFixed(1)}%`;
}

/** Confiabilidade da mediana/média de prazo por transportadora — usado em
 * /transportadoras (aba Preço × Prazo) */
export function confiabilidade(n: number): { label: string; pillClass: string | null } {
  if (n >= 100) return { label: "boa", pillClass: null };
  if (n >= 30) return { label: "⚠️ amostra pequena", pillClass: "pill laranja" };
  return { label: "⚠️ insuficiente para conclusão", pillClass: "pill n" };
}
