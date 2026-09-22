// Handlers do bot Telegram — TMS Fretes SOMA
import { execSync } from 'child_process';
import { supabase, fmtBRL, fmtNum, fmtPct, fmtPrazo } from './supabase.js';

// === COMANDOS DE INFORMAÇÃO GERAL ===

export async function handlerStart(ctx) {
  await ctx.reply(
    `👋 *TMS Fretes SOMA* — Bot de Comandos\n\n` +
    `Projeto: TMS Fretes SOMA — V3 (Next.js + Supabase)\n` +
    `Repo: https://github.com/MikaelAntiqueira/-tms-fretes-soma\n\n` +
    `💡 *Use /exec para executar comandos no PC*\n` +
    `Ex: /exec git status\n\n` +
    `📊 *Comandos disponíveis:*\n\n` +
    `*/kpis* — KPIs gerais do dashboard\n` +
    `*/financeiro* — Visão geral financeira\n` +
    `*/ontem* — Decisões de contratação do dia\n` +
    `*/operacao* — Controle operacional\n` +
    `*/transportadoras* — Comparação de transportadoras\n` +
    `*/oportunidades* — Classificação de oportunidades\n` +
    `*/dados* — Tabela detalhada (búsqueda)\n` +
    `*/frete* [peso kg] — Simulação de custo (ex: /frete 100)\n` +
    `*/exec* [comando] — Executa comando no PC (ex: /exec git status)\n` +
    `*/comandos* — Lista este menu\n\n` +
    `⚠ *Nota:* Diferença ≠ erro. Os dados são informativos.`,
    { parse_mode: 'Markdown' }
  );
}

export async function handlerComandos(ctx) {
  await handlerStart(ctx);
}

// === KPIs GERAIS ===

export async function handlerKpis(ctx) {
  try {
    const [cotacoesRes, contratacoesRes, cruzadasRes, somaRes] = await Promise.all([
      supabase.from('cotacoes').select('*', { count: 'exact', head: true }),
      supabase.from('contratacoes').select('*', { count: 'exact', head: true }),
      supabase
        .from('contratacoes')
        .select('*', { count: 'exact', head: true })
        .not('cotacao_id', 'is', null),
      supabase.rpc('sum_frete_contratado_cruzadas'),
    ]);

    if (cotacoesRes.error) throw new Error(cotacoesRes.error.message);
    if (contratacoesRes.error) throw new Error(contratacoesRes.error.message);
    if (cruzadasRes.error) throw new Error(cruzadasRes.error.message);
    if (somaRes.error) throw new Error(somaRes.error.message);

    const totalCotacoes = cotacoesRes.count ?? 0;
    const totalContratacoes = contratacoesRes.count ?? 0;
    const contratacoesCruzadas = cruzadasRes.count ?? 0;
    const freteContratado = Number(somaRes.data ?? 0);

    await ctx.reply(
      `📊 *KPIs — TMS Fretes SOMA*\n\n` +
      `▪ *Total de Cotações:* ${fmtNum(totalCotacoes)}\n` +
      `▪ *Total de Contratações:* ${fmtNum(totalContratacoes)}\n` +
      `▪ *Contratações Cruzadas:* ${fmtNum(contratacoesCruzadas)}\n` +
      `▪ *Frete Contratado:* ${fmtBRL(freteContratado)}\n\n` +
      `Fonte: Supabase (dados em tempo real)`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    await ctx.reply(`❌ Erro ao consultar KPIs: ${e.message}`);
  }
}

// === FINANCEIRO - VISÃO GERAL ===

export async function handlerFinanceiro(ctx) {
  try {
    const supabaseClient = supabase;
    const resultado = await supabaseClient.rpc('financeiro_visao_geral_kpis', {
      p_meses: null,
      p_transportadoras: null,
      p_regioes: null,
      p_tipos: null,
      p_romaneios: null,
      p_esc: null,
      p_prazos: null,
      p_cidades: null,
      p_janelas: null,
      p_faixas_peso: null,
      p_faixas_cubagem: null,
    });

    if (resultado.error) throw new Error(resultado.error.message);

    const row = resultado.data?.[0];
    if (!row) {
      await ctx.reply('Não há dados financeiros no momento.');
      return;
    }

    const k = {
      freteTotal: Number(row.frete_total ?? 0),
      freteN: Number(row.frete_n ?? 0),
      diffPosSum: Number(row.diff_pos_sum ?? 0),
      diffMedia: row.diff_media == null ? null : Number(row.diff_media),
      diffPMedia: row.diff_p_media == null ? null : Number(row.diff_p_media),
      escS: Number(row.esc_s ?? 0),
      escN: Number(row.esc_n ?? 0),
      escSC: Number(row.esc_sc ?? 0),
      cot: Number(row.cot ?? 0),
      pedidos: Number(row.pedidos ?? 0),
      totalContratacoes: Number(row.total_contratacoes ?? 0),
      contratacoesCruzadas: Number(row.contratacoes_cruzadas ?? 0),
    };

    const pctBarata = k.escS + k.escN > 0 ? k.escS / (k.escS + k.escN) : null;
    const pctSobreContratado = k.freteTotal > 0 ? k.diffPosSum / k.freteTotal : null;
    const freteMedio = k.freteN > 0 ? k.freteTotal / k.freteN : null;
    const pctComparavel = k.freteN > 0 ? k.diffN / k.freteN : null;

    await ctx.reply(
      `💰 *Financeiro — Visão Geral*\n\n` +
      `▪ *Frete Contratado:* ${fmtBRL(k.freteTotal)} (${fmtNum(k.freteN)} processos)\n` +
      `▪ *Diferença Financeira Identificada:* ${fmtBRL(k.diffPosSum)}\n` +
      `  → ${fmtPct(pctSobreContratado)} sobre o contratado\n` +
      `▪ *Diferença Média:* ${k.diffMedia != null ? fmtBRL(k.diffMedia) : '—'}\n` +
      `  ${k.diffPMedia != null ? `${fmtPct(k.diffPMedia)} por processo` : ''}\n` +
      `▪ *% Escolheu a Mais Barata:* ${pctBarata != null ? fmtPct(pctBarata) : '—'}\n` +
      `  (${fmtNum(k.escS)} sim / ${fmtNum(k.escN)} não / ${fmtNum(k.escSC)} sem comparação)\n` +
      `▪ *Frete Médio:* ${freteMedio != null ? fmtBRL(freteMedio) : '—'}\n` +
      `▪ *Total de Cotações:* ${fmtNum(k.cot)}\n` +
      `▪ *Total de Pedidos:* ${fmtNum(k.pedidos)}\n` +
      `▪ *Contratações Cruzadas:* ${fmtNum(k.contratacoesCruzadas)}/${fmtNum(k.totalContratacoes)}\n\n` +
      `Fonte: Supabase · financeiro_visao_geral_kpis()`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    await ctx.reply(`❌ Erro ao consultar financeiro: ${e.message}`);
  }
}

// === OPERAÇÃO ===

export async function handlerOperacao(ctx) {
  try {
    const resultado = await supabase.rpc('operacao_dashboard_estatico');

    if (resultado.error) throw new Error(resultado.error.message);

    const dash = resultado.data || {};

    const kpisRow = dash.kpis;
    const kpis = kpisRow
      ? {
          n_romaneios: Number(kpisRow.n_romaneios ?? 0),
          n_pedidos: Number(kpisRow.n_pedidos ?? 0),
          soma_volumes: Number(kpisRow.soma_volumes ?? 0),
          soma_peso_kg: Number(kpisRow.soma_peso_kg ?? 0),
          soma_cubagem_m3: Number(kpisRow.soma_cubagem_m3 ?? 0),
          soma_frete_contratado: Number(kpisRow.soma_frete_contratado ?? 0),
        }
      : null;

    if (!kpis) {
      await ctx.reply('Não há dados de operação no momento.');
      return;
    }

    // Transportadoras (top 3)
    const carriers = (dash.carriers || []).slice(0, 3).map(c => ({
      transportadora: String(c.transportadora),
      frete: Number(c.soma_frete_contratado ?? 0),
      pct: kpis.soma_frete_contratado > 0 ? Number(c.soma_frete_contratado ?? 0) / kpis.soma_frete_contratado : null,
    }));

    // Janelas
    const janelasRes = await supabase.rpc('operacao_por_janela', {
      p_meses: null, p_transportadoras: null, p_regioes: null, p_tipos: null,
    });
    if (janelasRes.error) throw new Error(janelasRes.error.message);

    const janelas = janelasRes.data || [];
    const janelaMap = new Map(janelas.map(j => [j.janela, j]));

    const medioDia = janelaMap.get('Meio-dia');
    const tarde = janelaMap.get('Tarde');

    let msg = `⚙️ *Operação — Controle de Carregamento*\n\n`;
    msg += `▪ *Romaneios:* ${fmtNum(kpis.n_romaneios)}\n`;
    msg += `▪ *Pedidos:* ${fmtNum(kpis.n_pedidos)}\n`;
    msg += `▪ *Volumes:* ${fmtNum(kpis.soma_volumes)}\n`;
    msg += `▪ *Peso:* ${fmtNum(kpis.soma_peso_kg)} kg\n`;
    msg += `▪ *Cubagem:* ${fmtNum(kpis.soma_cubagem_m3, 1)} m³\n`;
    msg += `▪ *Frete Contratado:* ${fmtBRL(kpis.soma_frete_contratado)}\n\n`;

    msg += `🕐 *Meio-dia × Tarde*\n`;
    if (medioDia) {
      msg += `  *Meio-dia:* ${fmtNum(medioDia.n_linhas)} linhas · ${fmtBRL(medioDia.soma_frete_contratado)}\n`;
    } else {
      msg += `  *Meio-dia:* —\n`;
    }
    if (tarde) {
      msg += `  *Tarde:* ${fmtNum(tarde.n_linhas)} linhas · ${fmtBRL(tarde.soma_frete_contratado)}\n`;
    } else {
      msg += `  *Tarde:* —\n`;
    }

    if (carriers.length > 0) {
      msg += `\n🏆 *Top 3 Transportadoras*\n`;
      carriers.forEach((c, i) => {
        msg += `  ${i + 1}. ${c.transportadora}: ${fmtBRL(c.frete)}`;
        if (c.pct != null) msg += ` (${fmtPct(c.pct)})`;
        msg += '\n';
      });
    }

    msg += `\nFonte: Supabase · operacao_dashboard_estatico()`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (e) {
    await ctx.reply(`❌ Erro ao consultar operação: ${e.message}`);
  }
}

// === TRANSPORTADORAS ===

export async function handlerTransportadoras(ctx) {
  try {
    const resultado = await supabase.rpc('transportadoras_comparativo', {
      p_meses: null, p_transportadoras: null, p_regioes: null, p_tipos: null,
    });

    if (resultado.error) throw new Error(resultado.error.message);

    const rows = resultado.data || [];
    if (rows.length === 0) {
      await ctx.reply('Não há dados de transportadoras no momento.');
      return;
    }

    let msg = `🚚 *Transportadoras — Comparativo*\n\n`;
    msg += `| Transportadora | Qtd.Cotada | Qtd.Contrat | Frete Total | Frete Médio | % Barata |\n`;
    msg += `|---|---|---|---|---|---|\n`;

    rows.forEach(r => {
      const transportadora = String(r.transportadora);
      const qtdCotada = fmtNum(r.qtd_cotada);
      const qtdContratada = fmtNum(r.qtd_contratada);
      const valorContratado = fmtBRL(Number(r.valor_contratado));
      const freteMedio = r.frete_medio != null ? fmtBRL(r.frete_medio) : '—';
      const pctBarata = r.pct_mais_barata != null ? fmtPct(r.pct_mais_barata) : '—';

      msg += `| ${transportadora} | ${qtdCotada} | ${qtdContratada} | ${valorContratado} | ${freteMedio} | ${pctBarata} |\n`;
    });

    msg += `\nFonte: Supabase · transportadoras_comparativo()`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (e) {
    await ctx.reply(`❌ Erro ao consultar transportadoras: ${e.message}`);
  }
}

// === FRETES - SIMULAÇÃO DE CUSTO ===

// Mesma regra de fn_faixa_peso() (supabase/migrations/2026091303_create_comparacoes_view.sql)
// — bucket usado por todas as páginas do site pra filtrar por peso.
function faixaPeso(p) {
  if (p < 10) return '0–10 kg';
  if (p < 20) return '10–20 kg';
  if (p < 50) return '20–50 kg';
  if (p < 100) return '50–100 kg';
  if (p < 250) return '100–250 kg';
  return '250+ kg';
}

export async function handlerFrete(ctx) {
  const args = ctx.message.text.split(' ');
  const pesoStr = args[1];

  if (!pesoStr || isNaN(Number(pesoStr))) {
    await ctx.reply(
      `📦 *Frete médio real por faixa de peso*\n\n` +
      `Use: */frete [peso em kg]*\n\n` +
      `Exemplo: */frete 100*\n\n` +
      `Mostra o frete médio REALMENTE contratado com cada transportadora\n` +
      `para cotações na mesma faixa de peso do valor informado — não é uma\n` +
      `estimativa calculada, é a média histórica das contratações reais.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const peso = Number(pesoStr);
  const faixa = faixaPeso(peso);

  try {
    // Mesma RPC/filtro de /transportadoras, restrita à faixa de peso do
    // valor informado — frete_medio já é a média REAL contratada nessa
    // faixa (não uma extrapolação linear por kg).
    const resultado = await supabase.rpc('transportadoras_comparativo', {
      p_meses: null, p_transportadoras: null, p_regioes: null, p_tipos: null,
      p_romaneios: null, p_esc: null, p_prazos: null, p_cidades: null,
      p_janelas: null, p_faixas_peso: [faixa], p_faixas_cubagem: null,
    });

    if (resultado.error) throw new Error(resultado.error.message);

    const rows = (resultado.data || []).filter(r => r.qtd_contratada > 0);
    if (rows.length === 0) {
      await ctx.reply(`Sem contratações registradas na faixa de peso ${faixa} (${fmtNum(peso)} kg).`);
      return;
    }

    let msg = `📦 *Frete médio real — faixa ${faixa}*\n\n`;
    msg += `| Transportadora | Frete médio | Contratações |\n`;
    msg += `|---|---|---|\n`;

    rows
      .sort((a, b) => (a.frete_medio ?? Infinity) - (b.frete_medio ?? Infinity))
      .forEach(r => {
        msg += `| ${String(r.transportadora)} | ${fmtBRL(r.frete_medio)} | ${fmtNum(r.qtd_contratada)} |\n`;
      });

    msg += `\nℹ *Nota:* média das contratações reais já feitas nessa faixa de peso\n`;
    msg += `(${fmtNum(peso)} kg cai em "${faixa}") — não estima cubagem, prazo ou região.\n\n`;
    msg += `Fonte: Supabase · transportadoras_comparativo(faixaPeso=${faixa})`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (e) {
    await ctx.reply(`❌ Erro ao simular: ${e.message}`);
  }
}

// === OPORTUNIDADES ===

export async function handlerOportunidades(ctx) {
  try {
    // Consulta a view comparacoes diretamente
    const resultado = await supabase
      .from('comparacoes')
      .select(`
        contratacao_id,
        pedido,
        cliente_nome,
        transportadora_contratada,
        transportadora_mais_barata,
        valor_frete_contratado,
        melhor_preco,
        diffR,
        diffP,
        esc,
        classif,
        risco_prazo_alt
      `)
      .gt('diffR', 0)
      .order('diffR', { ascending: false })
      .limit(10);

    if (resultado.error) throw new Error(resultado.error.message);

    const rows = resultado.data || [];
    if (rows.length === 0) {
      await ctx.reply('Não há oportunidades identificadas no momento.');
      return;
    }

    let msg = `🎯 *Oportunidades — Top 10 por Impacto*\n\n`;
    msg += `| Cliente | Transportadora | Dif.R$ | Dif.% | Classif |\n`;
    msg += `|---|---|---|---|---|\n`;

    rows.forEach((r, i) => {
      const cliente = (r.cliente_nome || '—').toString().slice(0, 20);
      const transportadora = (r.transportadora_contratada || '—').toString();
      const diffR = r.diffR != null ? fmtBRL(Number(r.diffR)) : '—';
      const diffP = r.diffP != null ? fmtPct(Number(r.diffP)) : '—';
      const classif = r.classif || '—';

      // Emoji de classificação
      let emoji = '';
      if (classif === 'vermelho') emoji = '🔴';
      else if (classif === 'laranja') emoji = '🟠';
      else if (classif === 'azul') emoji = '🔵';
      else if (classif === 'verde') emoji = '🟢';
      else if (classif === 'alerta') emoji = '⚠️';

      msg += `| ${cliente} | ${transportadora} | ${diffR} | ${diffP} | ${emoji} ${classif} |\n`;
    });

    msg += `\n🔴/🟠 = maior impacto financeiro\n`;
    msg += `⚠️ = risco de prazo (Leomar)\n\n`;
    msg += `Fonte: Supabase · view comparacoes`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (e) {
    await ctx.reply(`❌ Erro ao consultar oportunidades: ${e.message}`);
  }
}

// === DADOS - TABELA DETALHADA (BUSCA) ===

export async function handlerDados(ctx) {
  const args = ctx.message.text.split(' ');
  const query = args.slice(1).join(' ');

  try {
    let resultado;
    if (query) {
      // Busca com filtro de texto
      resultado = await supabase
        .from('comparacoes')
        .select(`
          romaneio,
          pedido,
          nf,
          cliente_nome,
          transportadora_contratada,
          valor_frete_contratado,
          melhor_preco,
          diffR,
          diffP,
          esc
        `)
        .or(`cliente_nome.ilike.%${query},pedido.ilike.%${query},romaneio.ilike.%${query}`)
        .order('diffR', { ascending: false })
        .limit(15);
    } else {
      // Top 15 por diferença
      resultado = await supabase
        .from('comparacoes')
        .select(`
          romaneio,
          pedido,
          cliente_nome,
          transportadora_contratada,
          valor_frete_contratado,
          melhor_preco,
          diffR,
          diffP,
          esc
        `)
        .not('diffR', 'is', null)
        .gt('diffR', 0)
        .order('diffR', { ascending: false })
        .limit(15);
    }

    if (resultado.error) throw new Error(resultado.error.message);

    const rows = resultado.data || [];
    if (rows.length === 0) {
      await ctx.reply(
        query
          ? `Nenhum processo encontrado para "${query}".`
          : 'Não há processos com diferença positiva no momento.'
      );
      return;
    }

    let msg = query
      ? `📋 *Resultados para "${query}" — Top ${rows.length}*`
      : `📋 *Top ${rows.length} Processos por Diferença*`;
    msg += `\n\n`;

    msg += `| Romaneio | Cliente | Transp. | Frete | Menor | Dif.R$ |\n`;
    msg += `|---|---|---|---|---|---|\n`;

    rows.forEach((r) => {
      const romaneio = (r.romaneio || '—').toString();
      const cliente = (r.cliente_nome || '—').toString().slice(0, 15);
      const transportadora = (r.transportadora_contratada || '—').toString().slice(0, 12);
      const frete = r.valor_frete_contratado != null ? fmtBRL(Number(r.valor_frete_contratado)) : '—';
      const melhor = r.melhor_preco != null ? fmtBRL(Number(r.melhor_preco)) : '—';
      const diffR = r.diffR != null ? fmtBRL(Number(r.diffR)) : '—';

      msg += `| ${romaneio} | ${cliente} | ${transportadora} | ${frete} | ${melhor} | ${diffR} |\n`;
    });

    msg += `\nUse /dados [termo de busca] para pesquisar.\n`;
    msg += `Fonte: Supabase · view comparacoes`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (e) {
    await ctx.reply(`❌ Erro ao consultar dados: ${e.message}`);
  }
}

// === EXECUÇÃO DE COMANDOS NO PC ===

export async function handlerOntem(ctx) {
  try {
    // KPIs do dia
    const kpisRes = await supabase.rpc('ontem_kpis');
    if (kpisRes.error) throw new Error(kpisRes.error.message);

    const kpis = kpisRes.data?.[0];
    if (!kpis) {
      await ctx.reply('Não há dados do dia atualmente.');
      return;
    }

    const nContratacoes = Number(kpis.n_contratacoes ?? 0);
    const freteContratado = Number(kpis.frete_contratado ?? 0);
    const nOportunidades = Number(kpis.n_oportunidades ?? 0);
    const cobertura = Number(kpis.cobertura ?? 0);
    const tendencia = Number(kpis.tendencia ?? 0);
    const diffPosSum = Number(kpis.diff_pos_sum ?? 0);

    // Radar cards (D2, D3, D4, D6)
    const [radarD2, radarD3, radarD4, radarD6] = await Promise.all([
      supabase.rpc('radar_d2'),
      supabase.rpc('radar_d3'),
      supabase.rpc('radar_d4'),
      supabase.rpc('radar_d6'),
    ]);
    if (radarD2.error) throw new Error(radarD2.error.message);
    if (radarD3.error) throw new Error(radarD3.error.message);
    if (radarD4.error) throw new Error(radarD4.error.message);
    if (radarD6.error) throw new Error(radarD6.error.message);

    const tendencia15 = await supabase.rpc('ontem_tendencia_15_dias');
    if (tendencia15.error) throw new Error(tendencia15.error.message);

    // Montar mensagem
    let msg = `📋 *Resumo do Dia — ${kpis.dia || 'Hoje'}*\n\n`;

    msg += `▪ *Contratações:* ${nContratacoes}\n`;
    msg += `▪ *Frete Contratado:* ${fmtBRL(freteContratado)}\n`;
    msg += `▪ *Diferença Identificada:* ${fmtBRL(diffPosSum)}\n`;
    msg += `▪ *Oportunidades:* ${nOportunidades} processos\n`;
    msg += `▪ *Cobertura de cotação:* ${cobertura}%\n`;
    msg += `▪ *Tendência (15 dias):* ${tendencia > 0 ? '↑' : tendencia < 0 ? '↓' : '→'} ${fmtPct(Math.abs(tendencia))}\n\n`;

    // Radar de Decisão
    const cards = [
      ...radarD2.data || [],
      ...radarD3.data || [],
      ...radarD4.data || [],
      ...radarD6.data || [],
    ].sort((a, b) => {
      const magA = Math.abs(Number(a.diff_r ?? 0)) + Math.abs(Number(a.diff_pct ?? 0)) * 100;
      const magB = Math.abs(Number(b.diff_r ?? 0)) + Math.abs(Number(b.diff_pct ?? 0)) * 100;
      return magB - magA;
    }).slice(0, 5);

    if (cards.length > 0) {
      msg += `🎯 *Radar de Decisão — Top 5*\n\n`;
      cards.forEach((c, i) => {
        const diffR = Number(c.diff_r ?? 0);
        const diffP = Number(c.diff_pct ?? 0);
        const cliente = (c.cliente_nome || '—').toString().slice(0, 25);
        const transp = (c.transportadora_contratada || '—').toString().slice(0, 15);

        let emoji = '';
        if (c.detector === 'D2') emoji = '🔍';
        else if (c.detector === 'D3') emoji = '💰';
        else if (c.detector === 'D4') emoji = '🏢';
        else if (c.detector === 'D6') emoji = '⚠️';

        const conf = c.confiabilidade || '';
        msg += `${emoji} ${i+1}. ${cliente} × ${transp}\n`;
        msg += `   Diferença: ${fmtBRL(Math.abs(diffR))} (${fmtPct(Math.abs(diffP))})\n`;
        msg += `   ${conf ? conf + ' · ' : ''}${c.card_tip || ''}\n\n`;
      });
    }

    // Tendência 15 dias
    const tend = tendencia15.data || [];
    if (tend.length > 0) {
      msg += `📈 *Tendência dos últimos 15 dias* (Frete Contratado)\n`;
      tend.slice(-5).reverse().forEach(d => {
        const val = Number(d.frete_contratado ?? 0);
        msg += `  ${d.dia || '?'}: ${fmtBRL(val)}\n`;
      });
      msg += `\n`;
    }

    msg += `Fonte: Supabase (dados em tempo real)`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (e) {
    await ctx.reply(`❌ Erro ao consultar Resumo do Dia: ${e.message}`);
  }
}


// Rate limit do /exec — janela deslizante por chat, em memória (processo
// único do bot, não precisa de Redis pra isso). Sem isso, alguém com acesso
// ao chat poderia disparar dezenas de execSync em sequência e esgotar CPU/IO
// do PC do Mikael mesmo usando só comandos da whitelist (ex: /exec npm run build
// repetido).
const EXEC_RATE_LIMIT = 5; // execuções
const EXEC_RATE_WINDOW_MS = 60 * 1000; // por minuto
const execTimestamps = new Map(); // chatId -> number[]

function excedeuRateLimit(chatId) {
  const agora = Date.now();
  const timestamps = (execTimestamps.get(chatId) || []).filter((t) => agora - t < EXEC_RATE_WINDOW_MS);
  timestamps.push(agora);
  execTimestamps.set(chatId, timestamps);
  return timestamps.length > EXEC_RATE_LIMIT;
}

export async function handlerExec(ctx) {
  const args = ctx.message.text.split(' ');
  const comando = args.slice(1).join(' ');

  if (comando && excedeuRateLimit(ctx.chat.id)) {
    await ctx.reply(`🚫 Limite de ${EXEC_RATE_LIMIT} execuções por minuto atingido. Aguarde um pouco e tente de novo.`);
    return;
  }

  if (!comando) {
    await ctx.reply(
      `💻 *Execução de Comandos no PC*\n\n` +
      `Use: */exec [comando]*\n\n` +
      `Exemplos:\n` +
      `*/exec git status*\n` +
      `*/exec git log --oneline -5*\n` +
      `*/exec npm run build*\n` +
      `*/exec ls -la*\n` +
      `*/exec cat package.json*\n\n` +
      `⚠ O comando será executado neste PC e o resultado enviado de volta.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Validação de segurança — whitelist de comandos permitidos (apenas leitura/negócio)
  // Cmdos permitidos: git, npm, node, ls, cat de arquivos do projeto, próps, tree, find, wc, head, tail, grep
  // NÃO permitidos: rm, cp, mv, curl, wget, ssh, bash -c, PowerShell, cmd, python (salvo scripts do projeto), bash, sh
  const comandosPermitidos = [
    /^git\s+/,
    /^npm\s+/,
    /^node\s+/,
    /^npx\s+/,
    /^ls\s+/,
    /^dir\s+/,
    /^cd\s+/,
    /^pwd\s+/,
    /^echo\s+/,
    /^cat\s+/,
    /^type\s+/,
    /^head\s+/,
    /^tail\s+/,
    /^grep\s+/,
    /^find\s+/,
    /^tree\s+/,
    /^wc\s+/,
    /^mkdir\s+/,
    /^rmdir\s+/,
    /^whoami\s+/,
    /^hostname\s+/,
    /^date\s+/,
    /^cal\s+/,
    /^vista\s+/,
    /^tasklist\s+/,
    /^get-childitem\s+/i,  // PowerShell alias
    /^Get-ChildItem\s+/i,
    /^Test-Path\s+/i,
    /^\s*$/,  // linha vazia (deve ser bloqueada pelo check abaixo)
  ];

  const comandoLower = comando.trim().toLowerCase();

  // Bloquear comandos vazios (já tratado acima, mas por segurança)
  if (!comando.trim()) {
    await ctx.reply('🚫 Comando vazio. Use /exec [comando]');
    return;
  }

  // Hierarquia de segurança: primeiramente bloquear shells e interpretadores
  const shellPatterns = [
    /bash\s+-c/i, /bash\s+-[a-z]/i, /zsh\s+-c/i, /fish\s+-c/i,
    /sh\s+/, /cmd\s+vbs/i, /cscript/i, /wscript/i,
    /powershell/i, /pwsh/i, /iex\s+/i, /Invoke-Expression/i,
    /python\s+/i, /pythonw\s+/i, /node\s+-e/i, /perl\s+/i,
    /ruby\s+/i, /php\s+/i, /lua\s+/i, /tclsh/i,
  ];
  if (shellPatterns.some(p => p.test(comando))) {
    await ctx.reply('🚫 Execução de interpretador/script não permitida para segurança.');
    return;
  }

  // Bloquear operações de escrita/destrutivas
  const escritaPatterns = [
    /rm\s+-rf/i, /rm\s+-r/i, /rmdir\s+/i, /rm\s+/i,
    /del\s+/i, /erase\s+/i, /rd\s+/i, /rmdir\s+/i,
    /cp\s+/i, /copy\s+/i, /xcopy/i, /robocopy/i,
    /mv\s+/i, /move\s+/i, /ren\s+/i, /rename\s+/i,
    /mkfs/i, /format/i, /dd\s+if=/i,
    />\s*\/|\|.*>/i,  // redirecionamento de saída para arquivo
    /sudo\s+/i, /runas\s+/i,
    /:\)|\)\s*&&|exec\s+/i,
    /curl\s+/i, /wget\s+/i, /axel/i, /aria2c/i,
    /ftp\s+/i, /sftp\s+/i, /scp\s+/i, /rsync/i,
    /ssh\s+/i, /telnet/i, /nc\s+/i, /netcat/i,
    /ncat\s+/i, /socat/i,
    /mount\s+/i, /umount/i, /net\s+use/i,
    /taskkill/i, /shutdown/i, /reboot/i, /init\s+0/i,
    /chmod\s+/i, /chown\s+/i, /chgrp\s+/i,
    /set\s+/i, /setx\s+/i, /export\s+/i, /env\s+/i,
    /assoc\s+/i, /ftype/i,
  ];
  if (escritaPatterns.some(p => p.test(comando))) {
    await ctx.reply('🚫 Operação de escrita/destrutiva/remota não permitida para segurança.');
    return;
  }

  // Verificar se o comando começa com um dos prefixos permitidos
  const isPermitido = comandosPermitidos.some(p => p.test(comando.trim()));
  if (!isPermitido && comando.trim()) {
    await ctx.reply(
      `🚫 Comando não permitido: "${comando.split(' ')[0]}".\n` +
      `Comandos permitidos: git, npm, node, npx, ls, dir, cd, pwd, echo, cat, type, head, tail, grep, find, tree, wc, mkdir, rmdir, whoami, hostname, date, cal, tasklist.\n` +
      `Use /comandos para ver o menu.`
    );
    return;
  }

  try {
    // Executar com timeout e buffer limitado
    const output = execSync(comando, {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: '/c/Users/User/-tms-fretes-soma',
      maxBuffer: 10 * 1024 * 1024,
    });

    // Formatar output para Telegram (limitar tamanho)
    let outputFormatted = output;

    // Se output for muito grande, truncar
    if (output.length > 3000) {
      outputFormatted = output.substring(0, 3000) + '\n\n... (output truncado, use /exec novamente com mais especifico)';
    }

    // Formatar como código
    const msg = `✅ *Resultado de:*\n\`\`\`\n${comando}\n\`\`\`\n\n\`\`\`\n${outputFormatted}\n\`\`\``;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (e) {
    // Erro na execução
    let erroMsg = e.message || 'Erro desconhecido';

    // Se for timeout, avisar
    if (e.killed) {
      erroMsg = '⏱ Timeout: comando demorou mais de 30 segundos';
    }

    // Se tiver stderr, incluir
    if (e.stderr) {
      erroMsg += '\n' + e.stderr;
    }

    // Limitar tamanho
    if (erroMsg.length > 2000) {
      erroMsg = erroMsg.substring(0, 2000) + '\n\n... (erro truncado)';
    }

    await ctx.reply(
      `❌ *Erro ao executar:*\n\`\`\`\n${comando}\n\`\`\`\n\n\`\`\`\n${erroMsg}\n\`\`\``,
      { parse_mode: 'Markdown' }
    );
  }
}
