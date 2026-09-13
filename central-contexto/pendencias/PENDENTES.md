# Pendências — TMS Fretes SOMA

> Tarefas abertas e esperando ação. Última atualização: 2026-09-13.
> Fonte: roadmap do README + análise das sessõs do outro PC.

## Filtro Global — Fase 1 (em andamento)

### A fazer agora
- [ ] Completar as 7 dimensões restantes do Filtro Global:
      romaneio, esc (escolheu a mais barata), prazo, cidade, janela, faixaPeso, faixaCubagem
- [ ] Implementar cascata de opções (dropdown filtrado por outros filtros ativos)
- [ ] Fazer outras páginas reagirem ao filtro (além de /financeiro Visão Geral)
- [ ] Validar filtro em todas as páginas afetadas

### Dependências
- RPCs com parâmetros opcionais para as 7 dimensões restantes
- Client-side cascade logic (ou extensão das RPCs existentes)

## Dashboard completo (fase futura)

### Gráficos restantes
- [ ] Portar os 16 gráficos restantes do Artifact para o Next.js
- [ ] Validar campo a campo cada gráfico com sistema de referência

### Tabelas restantes
- [ ] Portar as 10 tabelas restantes
- [ ] Validar cada tabela

### Funcionalidades
- [ ] Simulação de Custo por Transportadora (4º bloco da Visão Geral) — regra "nunca estima, sempre real"
- [ ] Área administrativa de importação de arquivos (usar policy nova de importacoes)

## Auth e segurança (fase futura)

- [ ] Remover policies de leitura pública temporárias (decisão futura do Mikael)
- [ ] Implementar middleware de redirecionamento para /login (após remover policies públicas)
- [ ] Proteger páginas administrativas

## Melhorias de qualidade

- [ ] Melhorar performance do Filtro Global com cascata
- [ ] Revisar uso do createSupabaseServerClient em páginas que poderiam usar
- [ ] Documentar RPCs criados (já parcialmente feito nos comments dos arquivos)

## Validação

- [ ] Confirmar que R$ 494.417,43 continua batendo após novas alterações
- [ ] Validar cada nova página/gráfico/tabela campo a campo antes de avançar

## Issues identificados

### ISSUE-23 — Oportunidades
- Página "Oportunidades" aparece desabilitada no menu (em breve)
- Depende de decisão de negócio ainda não tomada
- Ver mencionado em DashboardShell.tsx e README

### Doc de referência pendente
- `docs/mapa-migracao-tms-v3-2026-09-11.md` — documento-mãe da migração no Google Drive (não está neste repo)
  - Contém: auditoria da arquitetura atual, mapa de dados, mapa de regras de negócio, schema Postgres proposto, riscos, plano de rollback, plano de testes, 10 fases
  - Regras de negócio de ~9 meses de decisões vivem em `memoria/06_LOG_DECISOES.md` e `memoria/16_PROMPT_MESTRE.md` do projeto original (Google Drive)
  - **Não portar lógica de negócio para cá sem checar essas fontes primeiro**
