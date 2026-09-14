# Checkpoints de sessão

> Registro do estado ao final de cada sessão de trabalho significativa.
> Última atualização: 2026-09-13

## SSA 2026-09-13 — Sessão de sincronização

**Quando**: 2026-09-13
**O que foi feito**:
- Extraído e analisado o backup do Claude Code do outro PC (claude.json + claude.rar)
- Identificado: 7 agentes TMS, perfis de consumo, projetos do Mikael
- Criada a Central de Contexto neste repo:
  - PERFIL.md
  - PRINCIPIOS.md
  - INSTRUCOES-HERMES.md
  - memoria/README.md
  - projetos/estado-atual.md
  - decisoes/LOG_DECISOES.md
  - pendencias/PENDENTES.md
  - sync/PROTOCOLO-SYNC.md
- Clonado o repo GitHub (-tms-fretes-soma) com token
- Mapeada a estrutura completa do projeto: 5 páginas, 16 gráficos (parcial), Auth Fase 6, Filtro Fase 1

**Próximo passo**:
- Ler as transcrições da sessão principal (23b18b04) para recuperar a linha de raciocínio completa
- Adicionar os outros projetos (Fretes, Faturamento, Automações, Estudos) à Central

**Estado**: Central de Contexto criada com base no que está no GitHub + claude.json. Falta a deep dive nas sessões do outro PC para recuperar o raciocínio completo.

## SSA 2026-09-14 — Correção de /oportunidades, achados de segurança e Simulação de Custo

**Quando**: 2026-09-14 (sessão via GitHub + Supabase MCP conectados)
**O que foi feito**:
- **`/oportunidades` corrigida** — view `comparacoes` (nunca existia) reconstruída sobre
  `v_ontem_comparacao`, preservando classif/riscoPrazoAlt já corretos (confirmado contra
  `06_LOG_DECISOES.md` do Drive, [DEC-22]). `ComparacaoRow.contratacao_id` corrigido (era
  number/NaN). Migrations: `fix_create_comparacoes_view_sobre_v_ontem_comparacao`,
  `fix_comparacoes_dedup_ofertas_duplicadas_prazo_contratado`.
- **Bug de duplicação na raiz** — `v_ontem_comparacao` (usada por TODO `/ontem` +
  `dados_detalhe`) tinha o mesmo tipo de bug (CTE `oferta_propria` não agregava ofertas
  duplicadas). Corrigido — números batem exatamente com o baseline já documentado
  (5.194 / R$45.938,44). Ver [D-22] em LOG_DECISOES.md.
- **2 achados de segurança corrigidos**: `v_cotacao_filtros` sem `security_invoker=true`
  (bypassava RLS — 2ª vez que isso acontece nessa view, ver [D-23]/[D-25] sobre o pitfall
  de `CREATE OR REPLACE VIEW` não preservar reloptions); `financeiro_outliers_peso` com
  percentil interpolado em vez de por índice (fix já escrito por outra sessão, só faltava
  quem tivesse `apply_migration` liberado — aplicado agora).
- **Simulação de Custo por Transportadora portada** (4º bloco Visão Geral, era só descrita
  no mapa de migração) — RPC `financeiro_simulacao_custo`, bloco novo condicional em
  `/financeiro`, validado com Leomar filtrada.
- **Erro 500 em produção (`/operacao` + `/oportunidades`)** — reportado pelo Mikael com
  print (Vercel "This page couldn't load"). Banco/API 100% saudáveis (logs confirmam 200 em
  tudo); reproduzido local com dado real sem erro. Achado: `middleware.ts` (antigo) e
  `src/proxy.ts` (novo) coexistiam fazendo a mesma função de auth guard — comentário do
  proxy.ts já dizia que substituía o antigo, mas ele nunca foi apagado. Removido
  `middleware.ts`. **NÃO CONFIRMADO 100% como causa raiz** — sem acesso ao painel/logs da
  Vercel (mesma limitação do ISSUE-22) pra ver o stack trace exato do erro 500.
- Trazidos e lidos por completo `mapa-migracao-tms-v3-2026-09-11.md` e `06_LOG_DECISOES.md`
  do Google Drive — confirmações registradas em [D-25].
- `agent_tasks`: tasks #7/#8 marcadas concluídas, 4 tasks novas registradas (dedup
  v_ontem_comparacao, security_invoker fix, Simulação de Custo, investigação erro 500).

**Commits** (main): `bcd3140`, `e9279fc`, `dae08c4`, `5629230`, `d43c0e1`, `a9f1291`,
`beb05e2`, `3b249cf`.

**Próximo passo**:
- Confirmar se o erro 500 em `/operacao`/`/oportunidades` sumiu depois do redeploy (remoção
  do middleware.ts duplicado). Se persistir, precisa de alguém com acesso ao painel da
  Vercel pra ver o log de build/runtime exato — sem isso, fica difícil ir além por SQL/API.
- Ainda faltam (fora de escopo de bug, feature nova/fase seguinte, não urgente): página
  "Metodologia" (conteúdo só existe no Artifact HTML antigo, não em nenhum doc acessível),
  filtro global nas demais páginas/sub-abas (decisão [DEC-31] já valida o caminho: dar
  parâmetro novo pras RPCs existentes), validação campo a campo das 11 dimensões do filtro.

**Estado**: `/oportunidades` e Simulação de Custo entregues e validados contra as regras de
negócio FINAL. Erro 500 relatado pelo Mikael tem uma correção plausível aplicada
(middleware.ts duplicado removido) mas não 100% confirmada — depende de teste em produção
ou acesso à Vercel pra fechar com certeza.
