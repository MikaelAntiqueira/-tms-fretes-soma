# TMS Fretes SOMA — Bot Telegram

Bot de comandos para consultar o dashboard TMS Fretes SOMA via Telegram.

## Configuração

### Variáveis de ambiente (arquivo `bot/.env`)

```env
# Supabase — tms-fretes-soma (jpoizkylaffircimxzrq)
NEXT_PUBLIC_SUPABASE_URL=https://jpoizkylaffircimxzrq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_aqui

# Telegram Bot
TELEGRAM_BOT_TOKEN=seu_token_do_botfather_aqui
TELEGRAM_ALLOWED_CHAT_IDS=seu_chat_id_aqui
```

**Atenção:** Nunca commite o `.env` com chaves reais no Git.

### Instalação

```bash
cd bot
npm install
```

## Comandos disponíveis

| Comando | Descrição |
|---------|-----------|
|| `/start` | Saudação e menu de comandos |
|| `/comandos` | Lista todos os comandos disponíveis |
|| `/kpis` | KPIs gerais do dashboard (cotações, contratações, frete total) |
|| `/financeiro` | Visão geral financeira (frete contratado, diferenças, % escolheu barata) |
|| `/ontem` | Decisões de contratação do dia (Radar de Decisão) |
|| `/operacao` | Controle operacional (romaneios, pedidos, janelas Meio-dia/Tarde, top transportadoras) |
|| `/transportadoras` | Comparação entre transportadoras (tabela com métricas) |
|| `/oportunidades` | Top 10 oportunidades por impacto financeiro |
|| `/dados [termo]` | Busca na tabela de dados (por cliente, pedido, NF, romaneio) |
|| `/frete [peso]` | Simulação de custo para um peso dado (ex: `/frete 100`) |
|| `/exec [comando]` | Executa comando no PC (ex: `/exec git status`) — uso restrito |

### Exemplos

```
/kpis
/financeiro
/operacao
/transportadoras
/oportunidades
/dados ClienteXYZ
/frete 100
```

## Como executar

```bash
cd bot
npm start
```

O bot iniciará e ficará ouvindo os comandos no Telegram.

## Segurança

- O bot só responde a chats configurados em `TELEGRAM_ALLOWED_CHAT_IDS`
- O token do bot não deve ser compartilhado
- O anon key do Supabase tem acesso apenas de leitura às tabelas

## Repositório

- GitHub: https://github.com/MikaelAntiqueira/-tms-fretes-soma
- Bot: @Mika_hermess_bot (ID: 8932530353)
- Chat autorizado: 8935191794 (Mikael Antiqueira)

## Tecnologia

- Node.js + Telegraf (framework Telegram)
- Supabase Client (@supabase/supabase-js)
- Leitura direta das RPCs e views do Supabase

## Arquitetura

```
Telegram Bot (@Mika_hermess_bot)
       │
       ▼
  Telegraf (Node.js)
       │
       ▼
  Supabase Client (anon key)
       │
       ▼
  Projeto jpoizkylaffircimxzrq
  ├── Tabelas: cotacoes, contratacoes, ofertas, clientes, transportadoras
  ├── Views: v_ontem_comparacao, v_cotacao_filtros, comparacoes
  └── RPCs: financeiro_visao_geral_kpis, operacao_dashboard_estatico,
            transportadoras_comparativo, sum_frete_contratado_cruzadas, etc.
```

## Limitações

- As simulações de `/frete` são estimativas baseadas em frete médio (não valores reais por pedido específico)
- O acesso é apenas leitura — não há comandos de escrita ou modificação
- Os dados refletem o estado atual do Supabase, não snapshot históricos

## Changelog

### v1.0.0 — 14/09/2026

- Bot inicial conectado ao Supabase
- 9 comandos implementados
- Leitura de KPIs, financeiro, operação, transportadoras, oportunidades, dados
- Simulação de frete por peso
- Restrição por chat ID para segurança
