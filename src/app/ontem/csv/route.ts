import { createSupabaseServerClient, requireUser } from "@/lib/supabase-server";
import { fmtEscolheuLabel } from "@/lib/format";

// GET /ontem/csv?dia=AAAA-MM-DD — exporta TODAS as contratações do dia em
// CSV (sem nenhum filtro), pra abrir e filtrar no Excel. [Pedido do
// Mikael, 2026-09-21: "tem que levar todas as notas, depois filtramos"].
// Reaproveita as mesmas RPCs de src/app/ontem/page.tsx
// (ontem_dia_referencia / ontem_dias_disponiveis / ontem_contratacoes) —
// duplicadas aqui de propósito (função pequena e isolada) em vez de
// refatorar getOntemData(), pra não mexer na página existente.

function parseDiaParam(v: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function csvField(v: string | null | undefined): string {
  const s = v ?? "";
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvNum(v: number | null | undefined, decimals = 2): string {
  if (v == null || Number.isNaN(v)) return "";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export async function GET(request: Request) {
  await requireUser("/ontem");
  const supabase = await createSupabaseServerClient();

  const { searchParams } = new URL(request.url);
  const diaEscolhido = parseDiaParam(searchParams.get("dia"));

  const [refRes, diasRes] = await Promise.all([
    supabase.rpc("ontem_dia_referencia"),
    supabase.rpc("ontem_dias_disponiveis"),
  ]);
  if (refRes.error) {
    return new Response(`Erro ao consultar o Supabase: ${refRes.error.message}`, { status: 500 });
  }
  if (diasRes.error) {
    return new Response(`Erro ao consultar o Supabase: ${diasRes.error.message}`, { status: 500 });
  }

  const diaMaisRecente = (refRes.data as string | null) ?? null;
  const diasDisponiveis = ((diasRes.data as Record<string, unknown>[]) ?? []).map((r) => String(r.dia));
  const ref = diaEscolhido && diasDisponiveis.includes(diaEscolhido) ? diaEscolhido : diaMaisRecente;

  if (!ref) {
    return new Response("Sem contratações cruzadas a uma cotação nos dados atuais.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { data, error } = await supabase.rpc("ontem_contratacoes", { p_dia: ref });
  if (error) {
    return new Response(`Erro ao consultar o Supabase: ${error.message}`, { status: 500 });
  }

  const linhas = (data as Record<string, unknown>[]) ?? [];

  const header = [
    "Romaneio",
    "Cliente",
    "Cidade",
    "Transportadora contratada",
    "Frete pago",
    "Menor cotacao",
    "Diferenca R$",
    "Diferenca %",
    "Escolheu a mais barata",
    "Janela",
    "NF",
    "Endereco de entrega",
  ];

  const rows = linhas.map((r) => {
    const diferencaR = r.diferenca_r == null ? null : Number(r.diferenca_r);
    const diferencaPct = r.diferenca_pct == null ? null : Number(r.diferenca_pct) * 100;
    return [
      csvField(r.romaneio as string | null),
      csvField(r.cliente as string | null),
      csvField(r.cidade as string | null),
      csvField(r.transportadora as string | null),
      csvNum(Number(r.frete_contratado ?? 0)),
      csvNum(r.melhor_cotacao == null ? null : Number(r.melhor_cotacao)),
      csvNum(diferencaR),
      csvNum(diferencaPct, 1),
      csvField(fmtEscolheuLabel(String(r.escolheu ?? ""))),
      csvField(r.janela as string | null),
      csvField(r.nf as string | null),
      csvField(r.endereco_entrega as string | null),
    ].join(";");
  });

  // BOM (﻿) pra acentos abrirem certo no Excel; ";" como separador e
  // vírgula decimal seguem o padrão pt-BR (mesma convenção do resto do site).
  const csv = "﻿" + [header.join(";"), ...rows].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contratacoes-${ref}.csv"`,
    },
  });
}
