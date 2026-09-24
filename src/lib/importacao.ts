// Porta fiel das funções de transformação de codigo/load_to_supabase.py
// (script Python que fez a carga histórica de 2026-09-11 no Supabase) —
// mesma lógica de negócio, mesmas regras confirmadas lendo o código-fonte
// original (ver docstring completo daquele arquivo). Usado pela área
// administrativa de importação (/importar) pra transformar cotacoes_reais.
// json/contratados_reais.json/cnpj_to_info.json (gerados automaticamente
// pelo ATUALIZAR AUTOMATICO.bat, pasta `codigo/`) no mesmo formato que as
// RPCs importar_lote_*()/importar_finalizar() esperam.
//
// [DIFERENÇA DELIBERADA] do script Python `transportadoras.id` NÃO é
// calculado aqui (lá era `uuid.uuid5(NAMESPACE, "transportadora:"+nome)`,
// determinístico) — replicar UUID v5 em TypeScript e arriscar um bit
// diferente do Python duplicaria a transportadora em vez de atualizar a
// existente, quebrando toda FK construída sobre o id antigo. Em vez
// disso, `importar_lote_transportadoras` faz upsert por `nome_curto` (chave de
// negócio natural, única na tabela) — o Postgres decide o id via
// `gen_random_uuid()` só pra linha nova, nunca recalcula o de uma existente.

const REGIOES_GRUPO = new Set(["GRUPO SOMA", "SOMA/RS"]);
export const TRANSP_RISCO_PRAZO = new Set(["Leomar"]);
export const PAR_MEIO_DIA = new Set(["Rede Nacional", "Fritz Express"]);

export interface CotacaoRaw {
  cot_id: string;
  transportadora: string | null;
  cnpj_cliente_raw?: string | null;
  romaneio?: string | null;
  data?: string | null;
  hora?: string | null;
  peso_total_kg?: number | null;
  cubagem_m3?: number | null;
  qtd_volumes?: number | null;
  pedido_direto?: string | null;
  nf_direto?: string | null;
  valor?: number | null;
  prazo?: number | null;
  valor_declarado?: number | null;
  endereco_direto?: string | null;
  cep_direto?: string | null;
}

export interface ContratadoRaw {
  id_frete?: string | null;
  pedido?: string | null;
  nf?: string | null;
  data?: string | null;
  hora?: string | null;
  cnpj_cliente_raw?: string | null;
  transportadora?: string | null;
  valor_frete_contratado?: number | null;
  valor_frete_cobrado?: number | null;
  peso_real_kg?: number | null;
  peso_cubado_kg?: number | null;
  match_cot_id?: string | null;
  matched_por_pedido?: boolean;
  matched_por_romaneio?: boolean;
  cnpj_transportadora?: string | null;
}

export interface CnpjInfo {
  nome?: string | null;
  cidade?: string | null;
  regiao?: string | null;
  tipo?: string | null;
}

/** Mesma condição de sufixo de tipo_from_regiao() (build_client_lookup.py). */
export function regiaoNormalizada(regiaoBruta: string | null | undefined): string | null {
  if (!regiaoBruta) return null;
  const r = regiaoBruta.trim();
  const ru = r.toUpperCase();
  if (ru.endsWith(" PUBLICO")) return r.slice(0, -" PUBLICO".length).trim() || null;
  if (ru.endsWith(" PRIVADO")) return r.slice(0, -" PRIVADO".length).trim() || null;
  return r;
}

/** tipo_from_regiao() + regra "Grupo" de resolve_cliente_tipo() (build_workbook.py). */
export function tipoClienteEnum(regiaoBruta: string | null | undefined, tipoRaw: string | null | undefined): string | null {
  const ru = (regiaoBruta || "").trim().toUpperCase();
  if (REGIOES_GRUPO.has(ru)) return "Grupo";
  const mapa: Record<string, string> = { Público: "Publico", Privado: "Privado", Fornecedores: "Fornecedores" };
  return (tipoRaw && mapa[tipoRaw]) || null;
}

export interface ClienteRow {
  cnpj: string;
  nome: string | null;
  cidade: string | null;
  regiao_comercial_bruta: string | null;
  regiao_normalizada: string | null;
  tipo_cliente: string | null;
}

export function buildClientesRows(cnpjInfo: Record<string, CnpjInfo>, orphanCnpjs: string[]): ClienteRow[] {
  const rows: ClienteRow[] = [];
  for (const [cnpj, info] of Object.entries(cnpjInfo)) {
    const regiaoBruta = info.regiao || null;
    rows.push({
      cnpj,
      nome: info.nome || null,
      cidade: info.cidade || null,
      regiao_comercial_bruta: regiaoBruta,
      regiao_normalizada: regiaoNormalizada(regiaoBruta),
      tipo_cliente: tipoClienteEnum(regiaoBruta, info.tipo || ""),
    });
  }
  // CNPJ visto em cotacoes/contratados mas ausente do cadastro -- entra só
  // com o CNPJ (FK de cotacoes/contratacoes precisa existir), resto NULL.
  for (const cnpj of orphanCnpjs) {
    rows.push({ cnpj, nome: null, cidade: null, regiao_comercial_bruta: null, regiao_normalizada: null, tipo_cliente: null });
  }
  return rows;
}

export interface TransportadoraRow {
  nome_curto: string;
  cnpj: string | null;
  risco_prazo: boolean;
  opera_janela_meio_dia: boolean;
}

export function buildTransportadorasRows(cotacoes: CotacaoRaw[], contratados: ContratadoRaw[]): TransportadoraRow[] {
  const nomes = new Set<string>();
  for (const r of cotacoes) if (r.transportadora) nomes.add(r.transportadora);
  for (const r of contratados) if (r.transportadora) nomes.add(r.transportadora);

  const cnpjPorNome = new Map<string, string>();
  for (const r of contratados) {
    if (r.transportadora && r.cnpj_transportadora && !cnpjPorNome.has(r.transportadora)) {
      cnpjPorNome.set(r.transportadora, r.cnpj_transportadora.trim());
    }
  }

  return [...nomes].sort().map((nome) => ({
    nome_curto: nome,
    cnpj: cnpjPorNome.get(nome) ?? null,
    risco_prazo: TRANSP_RISCO_PRAZO.has(nome),
    opera_janela_meio_dia: PAR_MEIO_DIA.has(nome),
  }));
}

/** 'YYYY-MM-DD' + 'HH:MM' (hora local RS) -> literal timestamptz com offset
 * fixo -03:00 (Brasil sem horário de verão desde 2019; base sempre 2026). */
function tsLiteral(data?: string | null, hora?: string | null): string | null {
  if (!data) return null;
  const h = hora || "00:00";
  return `${data}T${h}:00-03:00`;
}

export interface StgCotacaoRow {
  cot_id: string;
  romaneio: string | null;
  cnpj_cliente: string | null;
  criado_em: string | null;
  peso_real_kg: number | null;
  cubagem_m3: number | null;
  qtd_volumes: number | null;
  pedido: string | null;
  nf: string | null;
  valor_declarado: number | null;
  endereco_entrega: string | null;
  cep_entrega: string | null;
}

/** Agrupa cotacoes_reais.json por cot_id -- quando o pareamento funde uma
 * grade de ofertas com sua "linha eco" de contratação direta (transportadora
 * null, cubagem/volumes nunca preenchidos nela), usa a 1ª linha COM OFERTA
 * pra romaneio/data/peso/cubagem/volumes/pedido/nf; só cai pra linha eco
 * quando não há nenhuma oferta no grupo (contratação direta sem grade). */
export function buildStgCotacoesRows(
  cotacoes: CotacaoRaw[],
  matchedByCotId: Map<string, ContratadoRaw>
): StgCotacaoRow[] {
  const byCot = new Map<string, CotacaoRaw[]>();
  for (const r of cotacoes) {
    const arr = byCot.get(r.cot_id);
    if (arr) arr.push(r);
    else byCot.set(r.cot_id, [r]);
  }
  const rows: StgCotacaoRow[] = [];
  for (const [cotId, group] of byCot) {
    const offerRows = group.filter((r) => r.transportadora !== null && r.transportadora !== undefined);
    const primary = offerRows[0] ?? group[0];
    let cnpjCliente = primary.cnpj_cliente_raw ?? null;
    if (!cnpjCliente) {
      const contratado = matchedByCotId.get(cotId);
      if (contratado) cnpjCliente = contratado.cnpj_cliente_raw ?? null;
    }
    rows.push({
      cot_id: cotId,
      romaneio: primary.romaneio ?? null,
      cnpj_cliente: cnpjCliente,
      criado_em: tsLiteral(primary.data, primary.hora),
      peso_real_kg: primary.peso_total_kg ?? null,
      cubagem_m3: primary.cubagem_m3 ?? null,
      qtd_volumes: primary.qtd_volumes ?? null,
      pedido: primary.pedido_direto ?? null,
      nf: primary.nf_direto ?? null,
      valor_declarado: primary.valor_declarado ?? null,
      endereco_entrega: primary.endereco_direto ?? null,
      cep_entrega: primary.cep_direto ?? null,
    });
  }
  return rows;
}

export interface StgOfertaRow {
  cot_id: string;
  transportadora: string;
  preco_final: number;
  prazo_dias: number | null;
}

/** 1 linha por registro de cotacoes_reais.json com transportadora != null --
 * linhas "eco" de contratação direta (sem oferta pra comparar) não entram. */
export function buildStgOfertasRows(cotacoes: CotacaoRaw[]): StgOfertaRow[] {
  const rows: StgOfertaRow[] = [];
  for (const r of cotacoes) {
    if (r.transportadora === null || r.transportadora === undefined) continue;
    rows.push({
      cot_id: r.cot_id,
      transportadora: r.transportadora,
      preco_final: r.valor as number,
      prazo_dias: r.prazo ?? null,
    });
  }
  return rows;
}

/** Cascata de 3 chaves confirmada em parse_contratados.py -- as 2 flags e
 * match_cot_id são setados de forma mutuamente exclusiva pelo próprio script. */
function metodoMatchDe(c: ContratadoRaw): string | null {
  if (!c.match_cot_id) return null;
  if (c.matched_por_pedido) return "pedido";
  if (c.matched_por_romaneio) return "romaneio_cnpj";
  return "cnpj_dia_transportadora";
}

export interface StgContratacaoRow {
  id_frete_painel: string | null;
  pedido: string | null;
  nf: string | null;
  data_contratacao: string | null;
  cnpj_cliente: string | null;
  transportadora: string | null;
  valor_frete_contratado: number;
  valor_frete_cobrado: number | null;
  peso_real_kg: number | null;
  peso_cubado_kg: number | null;
  match_cot_id: string | null;
  metodo_match: string | null;
}

export function buildStgContratacoesRows(contratados: ContratadoRaw[]): StgContratacaoRow[] {
  return contratados.map((c) => ({
    id_frete_painel: c.id_frete || null,
    pedido: c.pedido || null,
    nf: c.nf || null,
    data_contratacao: tsLiteral(c.data, c.hora),
    cnpj_cliente: c.cnpj_cliente_raw || null,
    transportadora: c.transportadora || null,
    valor_frete_contratado: c.valor_frete_contratado as number,
    valor_frete_cobrado: c.valor_frete_cobrado ?? null,
    peso_real_kg: c.peso_real_kg ?? null,
    peso_cubado_kg: c.peso_cubado_kg ?? null,
    match_cot_id: c.match_cot_id || null,
    metodo_match: metodoMatchDe(c),
  }));
}

export interface ImportInput {
  cotacoes: CotacaoRaw[];
  contratados: ContratadoRaw[];
  cnpjInfo: Record<string, CnpjInfo>;
}

export interface ImportBuilt {
  clientes: ClienteRow[];
  transportadoras: TransportadoraRow[];
  cotacoes: StgCotacaoRow[];
  ofertas: StgOfertaRow[];
  contratacoes: StgContratacaoRow[];
}

export function buildImportRows({ cotacoes, contratados, cnpjInfo }: ImportInput): ImportBuilt {
  const cnpjsCadastro = new Set(Object.keys(cnpjInfo));
  const cnpjsUsados = new Set<string>();
  for (const r of cotacoes) if (r.cnpj_cliente_raw) cnpjsUsados.add(r.cnpj_cliente_raw);
  for (const c of contratados) if (c.cnpj_cliente_raw) cnpjsUsados.add(c.cnpj_cliente_raw);
  const orphanCnpjs = [...cnpjsUsados].filter((c) => !cnpjsCadastro.has(c)).sort();

  const matchedByCotId = new Map<string, ContratadoRaw>();
  for (const c of contratados) if (c.match_cot_id) matchedByCotId.set(c.match_cot_id, c);

  return {
    clientes: buildClientesRows(cnpjInfo, orphanCnpjs),
    transportadoras: buildTransportadorasRows(cotacoes, contratados),
    cotacoes: buildStgCotacoesRows(cotacoes, matchedByCotId),
    ofertas: buildStgOfertasRows(cotacoes),
    contratacoes: buildStgContratacoesRows(contratados),
  };
}

/** Parte um array em pedaços de até `size` itens -- usado pra respeitar o
 * tamanho de payload de cada chamada de importar_lote_*(). */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
