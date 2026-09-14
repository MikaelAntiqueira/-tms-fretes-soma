# Estado atual do projeto — TMS Fretes SOMA

> Última atualização: 2026-09-13
> Fonte: repo GitHub + claude.json backup + sessões do outro PC

## Projeto

**Nome**: TMS Fretes SOMA — V3 (Next.js + Supabase)
**Repo**: https://github.com/MikaelAntiqueira/-tms-fretes-soma
**Branch**: main
**Último commit**: 01659e8 — [TASK-29] Motor de filtro global — Fase 1, continuação /operacao

## O que é

Migração do dashboard "Frete Cotado × Frete Contratado" do Grupo SOMA/RS de HTML/Chart.js + pipeline Python para Next.js 16 + Supabase, deploy na Vercel.

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Auth)
- Chart.js + react-chartjs-2 (gráficos)
- @supabase/supabase-js + @supabase/ssr
- Vercel (deploy)

## Estado da migração

### Fase 6 — Auth (CONCLUÍDA)
- Infraestrutura de login construída (Supabase Auth)
- Admin inicial: mikaelantiqueira@gmail.com
- /login criado (signInWithPassword)
- SessionIndicator no sidebar (informativo, não bloqueia)
- Profiles automaticamente criados via trigger no auth.users
- Policy de escrita para admin autenticado em importacoes
- Policies de leitura pública temporárias mantidas (decisão deliberada — Mikael usa o site publicamente)

### Fase 5 — Esqueleto (CONCLUÍDA)
- Projeto Next.js criado e conectado ao Supabase
- Página inicial com 4 KPIs reais do Supabase
- Validação: Frete Contratado cruzado = R$ 494.417,43 (deve bater — se não bater, é bloqueio)

### Fase 1 — Filtro Global (11/11 dimensões, 2026-09-14 — falta validar campo a campo)
- Motor de filtro com as 11 dimensões portadas: Mês, Transportadora Contratada, Região Comercial,
  Tipo Cliente, Romaneio, Escolheu a Mais Barata, Prazo, Cidade, Janela, Faixa de Peso, Faixa de
  Cubagem (commit `0ffce75`)
- Só a sub-aba Visão Geral de /financeiro reage (mesmo escopo de sempre — não expandido)
- Cascade de opções continua NÃO implementada (limitação deliberada, ver PENDENTES.md)
- Falta: `tsc`/`build` limpo confirmado (pedido ao Hermes) e validação campo a campo das 7 novas
  dimensões contra o Artifact original (só as 4 da Fase 1 foram validadas por Playwright)

## Páginas portadas

| Página | Rota | Status | Notas |
|--------|------|--------|-------|
| Visão Geral | / | ✅ | 4 KPIs reais do Supabase |
| Hoje (Ontem) | /ontem | ✅ | Decisões de contratação D-1, Radar D2/D3/D4/D6 |
| Operação | /operacao | ✅ | Controle Operacional de Carregamento, janela Meio-dia × Tarde |
| Financeiro | /financeiro | ✅ | 4 sub-abas: Visão Geral, Cotado×Contratado, Padrões da Diferença, Peso/Cubagem/Custo |
| Transportadoras | /transportadoras | ✅ | 5 sub-abas: Comparativo, Preço×Prazo, Região Comercial, Clientes, Cidades |
| Oportunidades | /oportunidades | ✅ (corrigida 2026-09-14) | View `comparacoes` reconstruída sobre `v_ontem_comparacao` — estava quebrada desde a criação, ver PENDENTES.md |

## Componentes-chave

- `DashboardShell.tsx` — sidebar unificada com navegação
- `FilterBar.tsx` — motor de filtro global (Fase 1)
- `SessionIndicator.tsx` — indicador de sessão Supabase Auth
- `SidebarStats.tsx` — badges/header stats (Server Component)
- `FinanceiroTabs.tsx` — tabs de sub-aba financeira (client)
- Gráficos: `CotadoContratadoCharts`, `PadroesCharts`, `PesoCustoCharts`, `ComparativoCharts`, `PrecoPrazoChart`, `RegiaoComercialChart`, `ClientesChart`

## O que ainda falta (roadmap)

### Próximo (Fase atual)
- [ ] Filtro Global Fase 1 — completar as 7 dimensões restantes
- [ ] Validar filtro em todas as páginas afetadas
- [ ] Implementar cascade de opções (dropdown filtrado por outros filtros)

### Próximas fases (não started)
- [ ] Dashboard completo — portar os 16 gráficos restantes
- [ ] 10 tabelas restantes
- [ ] Motor de filtro global completo (11 dimensões)
- [ ] Simulação de Custo por Transportadora
- [ ] Área administrativa de importação de arquivos
- [ ] Remover policies de leitura pública temporárias (decisão futura do Mikael)
- [ ] Middleware de proteção de rota (após remover policies públicas)
- [ ] Fase 9 — validação final e rollback se necessário

## Estado dos agentes (informação do outro PC, verificar)

Do claude.json, 7 agentes paralelos foram usados no projeto:
- 00-orquestrador — coordenação (ultima sessão: b4226608)
- 01-dados-cotacoes — ingestão de cotações (ultima sessão: 9506fce8)
- 02-torre-controle — controle operacional (ultima sessão: cb22f7ea)
- 03-suporte-melhorias — melhorias (ultima sessão: 6b2aa2d0)
- 04-indicadores-dashboard — indicadores (ultima sessão: a82495df)
- 05-apresentacao-executiva — apresentação executiva (ultima sessão: 6d650e08)
- ocoren-rede.md — documento de rede OCOREN

> Aviso: essa lista de agentes é do outro PC. Precisa ser verificada com a sessão principal (23b18b04) para confirmar o estado real.

## Números validados

- Total de cotações: 6.915
- Contratações cruzadas: 5.194
- Frete Contratado cruzado: R$ 494.417,43
- Transportadoras: 7
- Total de processos no header: 6.915
- Clientes ativos: ~660
