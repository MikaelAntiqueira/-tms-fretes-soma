import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  handlerStart,
  handlerComandos,
  handlerKpis,
  handlerFinanceiro,
  handlerOperacao,
  handlerTransportadoras,
  handlerFrete,
  handlerOportunidades,
  handlerDados,
  handlerExec,
  handlerOntem,
} from './handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatIds = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(id => id);

if (!botToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN não configurado no .env');
  process.exit(1);
}

console.log('🤖 Iniciando TMS Fretes SOMA Bot...');
console.log('📌 Chats permitidos:', allowedChatIds.join(', ') || 'NENHUM (bot não responde a ninguém)');

// Mensagem de privacidade para outros usuários
async function msgPrivacidade(ctx) {
  await ctx.reply(
    `🤖 *TMS Fretes SOMA Bot*\n\n` +
    `Este bot foi criado para atender o Mikael Antiqueira.\n` +
    `Gostaria de ter seu próprio bot? Crie um em @BotFather.\n\n` +
    `_Comandos disponíveis: /\`comandos\`_`,
    { parse_mode: 'Markdown' }
  );
}

const bot = new Telegraf(botToken);

// Middleware de segurança — só responde a chats autorizados (se configurados)
if (allowedChatIds.length > 0) {
  bot.use(async (ctx, next) => {
    const chatId = String(ctx.chat.id);
    if (!allowedChatIds.includes(chatId)) {
      await msgPrivacidade(ctx);
      return; // Não continua para os comandos
    }
    await next();
  });
}

// === COMANDOS ===
bot.command('start', handlerStart);
bot.command('comandos', handlerComandos);

// Dashboard
bot.command('kpis', handlerKpis);
bot.command('financeiro', handlerFinanceiro);
bot.command('operacao', handlerOperacao);
bot.command('transportadoras', handlerTransportadoras);
bot.command('oportunidades', handlerOportunidades);
bot.command('dados', handlerDados);

// Simulação de frete (com argumento opcional)
bot.command('frete', handlerFrete);

// Execução de comandosno PC (admin)
bot.command('exec', handlerExec);

// Resumo do dia
bot.command('ontem', handlerOntem);

// === MANEJO DE ERROS ===
bot.catch((err, ctx) => {
  console.error(`❌ Erro para ${ctx.updateType} de ${ctx.chat.id}:`, err);
  ctx.reply(`⚠️ Ocorreu um erro inesperado. Tente novamente ou contate o administrador.`);
});

// === INICIALIZAÇÃO ===
bot.launch().then(() => {
  console.log('✅ Bot TMS Fretes SOMA iniciado com sucesso!');
  console.log('📡 Ouvindo comandos...');
  console.log(`👤 Chat autorizado: ${allowedChatIds.join(', ') || 'NENHUM'}`);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('🕐 Iniciado em:', new Date().toISOString());