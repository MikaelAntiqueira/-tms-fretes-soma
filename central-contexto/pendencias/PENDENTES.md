# Pendências — TMS Fretes SOMA

> Tarefas abertas e esperando ação. Última atualização: 2026-09-22.
> Fonte: roadmap do README + análise das sessõs do outro PC.

## ⚠️ NOVO ACHADO (2026-09-22, sessão do outro PC/Drive) — job_diario.bat não sincroniza o Supabase; base de contratações real também parada em 27/08

Investigando um caso suspeito de diferença >700% que o Mikael viu na tela "Ontem" (produção), a
sessão da pasta compartilhada (`H:\...\PROJETO FRETE COTADO X FRETE CONTRATADO`, projeto-fonte do
pipeline Python) encontrou 2 achados relacionados — resumo para não duplicar investigação, detalhe
completo em `memoria/07_PROBLEMAS_ABERTOS.md` ([ISSUE-24]/[ISSUE-25]) e `memoria/09_PROXIMAS_ACOES.md`
([TASK-31]) daquele repositório (Google Drive, fora deste repo git):

1. **Cruzamento cotação↔contratação sem checar endereço de entrega** — quando o mesmo CNPJ tem 2+
   entregas em endereços diferentes no mesmo dia/romaneio, o parser podia casar o frete PAGO de uma
   com a MENOR COTAÇÃO de outra, inflando a "Diferença R$". **Corrigido no pipeline Python**
   (`codigo/parse_contratados.py`): quando 2+ candidatas com a mesma transportadora têm endereços
   conhecidos e diferentes, o script não cruza mais (novo `motivo_sem_match` +
   `stats["ambiguo_endereco_diferente"]`) em vez de chutar pelo horário mais próximo. Validado sem
   regressão (`matched` segue 5.194); checagem exercitada 93× na base atual, 0 conflitos reais
   encontrados nesta base específica.
2. **`job_diario.bat` nunca chamou `load_to_supabase.py`** — não existe hoje nenhuma sincronização
   diária Python → Supabase. `load_to_supabase.py` só rodou 1× (carga histórica de 11/09, mesma
   citada abaixo na área "Área administrativa de importação").

**Gravidade reavaliada no mesmo dia (22/09), antes de agir em produção**: conferido que a base LOCAL
de contratações (`contratados_reais.json` — a mesma fonte que alimentaria uma recarga do Supabase)
também tem `max(data) = 2026-08-27`, idêntico ao que já está no banco. Não existe hoje nenhum dado de
contratação mais novo em lugar nenhum (falta `Contratados-202609.csv`; só existe até
`Contratados-202608.csv`). O Mikael está fora da empresa e só volta a exportar dado novo dia 24/09.

**Conclusão prática — não recarreguem o Supabase agora**: rodar `load_to_supabase.py` ou usar
`/importar` hoje não traria nenhum dado novo, só reprocessaria o mesmo lote de 27/08 já carregado,
com risco em produção sem ganho real. **Ação fica agendada para 24/09**: quando o Mikael exportar
`Contratados-202609.csv`, rodar o pipeline (já sai com a correção de endereço embutida) e só então
recarregar o Supabase (via `/importar` ou `load_to_supabase.py`) — aí a correção de endereço passa a
valer de fato na tela "Ontem" em produção.

**Pendência de processo, não urgente até 24/09**: decidir se `load_to_supabase.py` vira um passo
incremental do `job_diario.bat` (hoje é `TRUNCATE` + reload completo das 3 tabelas de fato, não
incremental) ou se o `/importar` manual (já pronto, ver seção "Área administrativa de importação"
abaixo) basta enquanto a coleta automática nos PCs de cotação não for retomada.

## RESOLVIDO (2026-09-21) — 4 achados ALTO da `AUDITORIA_AG03.md` (A1-A4)

Auditoria completa do projeto (app Next.js + bot Telegram novo em `bot/`)
gerou `AUDITORIA_AG03.md` (21 achados: 3 CRÍTICO, 7 ALTO, 7 MÉDIO, 6 BAIXO).
Os 3 CRÍTICO (token do bot logado, `handlerOntem` ausente, blacklist fraca do
`/exec`) já estavam corrigidos no código antes desta sessão. Corrigidos agora
os 4 primeiros ALTO:

- **A1** — `/oportunidades` só implementava 4 das 11 dimensões do Filtro
  Global (mes/transportadora/regiao/tipo). Adicionadas as 7 restantes
  (romaneio/esc/prazo/cidade/janela/faixaPeso/faixaCubagem) em
  `src/app/oportunidades/page.tsx`, incluindo ordenação fixa pra faixaPeso/
  faixaCubagem (essa página computa cascatas em JS a partir da view
  `comparacoes`, não via RPC, então não tinha ORDER BY do Postgres pra
  herdar). Exigiu adicionar a coluna `romaneio` à view `comparacoes`
  (migration `fix_comparacoes_add_romaneio_dimensao_filtro`, aplicada no
  Supabase e replicada no arquivo consolidado local — ver A4). Validado com
  `tsc --noEmit` limpo e `npm run build` completo sem erros. **Confirmado
  2026-09-21** em sessão autenticada real (Playwright + login do Mikael): os
  11 botões de filtro renderizam na ordem certa, o dropdown de faixaPeso
  mostra as 6 faixas na ordem fixa esperada, e selecionar `50–100 kg`
  recalcula a página inteira de 5.194→787 processos (11,4% da base) com os
  KPIs corretos (R$ 5.978 de diferença, 224 não escolheram a mais barata) —
  confirma que o fix funciona ponta a ponta, não só no `tsc`/`build`.
- **A2** — `/frete [peso]` do bot (`bot/src/handlers.js`) calculava uma
  "estimativa" fake multiplicando `frete_medio` global por `peso/100`, sem
  relação real com o histórico. Trocado por chamada à RPC
  `transportadoras_comparativo` filtrada por `p_faixas_peso` (mesma faixa que
  `fn_faixa_peso()` usa no banco) — agora mostra a média REAL contratada com
  cada transportadora pra cotações na mesma faixa de peso, sem extrapolação.
- **A3** — `TRANSP_ORDER` em `/oportunidades` incluía "B. Transportes", uma
  transportadora fantasma que não existe no banco (só há 7 reais). Removida.
- **A4** — o arquivo consolidado `supabase/migrations/2026091303_create_
  comparacoes_view.sql` estava divergente do banco real: ainda tinha
  `'Público'` (com acento, nunca bate com o `tipo_cliente` gravado) e não
  tinha a coluna `romaneio` adicionada pelo A1. Reescrito pra refletir o
  estado final do banco (confirmado via `pg_get_viewdef` ao vivo no projeto
  `jpoizkylaffircimxzrq`).

## RESOLVIDO (2026-09-21, mesmo dia) — restante da `AUDITORIA_AG03.md`: A7, M1-M7, B1, B3, B6

Segunda rodada na mesma auditoria, cobrindo tudo que tinha ficado pra depois
acima (exceto A5 e A6, ver por quê logo abaixo):

- **A7** — `VisaoGeralCard.tsx` mandava `p_dia: data.dia` sempre pra RPC
  `visao_geral_clientes_minimo`, mesmo quando `null` (a function já tem
  default `p_dia date DEFAULT NULL` no Postgres — confirmado via
  `pg_proc`/Supabase MCP). Trocado por spread condicional (`...(data.dia ? {
  p_dia: data.dia } : {})`) — evita mandar um parâmetro null sem necessidade.
- **M1** — `useThemeVars`/`readVars()` (leitura de variáveis CSS do tema,
  claro/escuro) estava copiado e colado em 9 componentes de gráfico
  (`OntemTendenciaChart`, `ClassificacaoChart`, `PrecoPrazoChart`,
  `RegiaoComercialChart`, `ClientesChart`, `ComparativoCharts`,
  `PadroesCharts`, `PesoCustoCharts`, `CotadoContratadoCharts`). Extraído
  para hook compartilhado genérico `src/hooks/useThemeVars.ts` (recebe
  `VAR_NAMES`/`FALLBACK` como parâmetros, já que cada gráfico lê um
  subconjunto diferente de variáveis) — os 9 arquivos só mantêm seus próprios
  `VAR_NAMES`/`FALLBACK` e chamam `useThemeVars(VAR_NAMES, FALLBACK)`.
  Comentários desatualizados que justificavam a duplicação (em
  `ClassificacaoChart.tsx`, `RegiaoComercialChart.tsx` e
  `TransportadorasTabs.tsx`) foram atualizados. `tsc --noEmit` limpo.
- **M2** — `/exec` do bot (`handlerExec`) não tinha limite de chamadas —
  mesmo restrito à whitelist de comandos de leitura, dava pra esgotar CPU/IO
  do PC do Mikael disparando várias execuções em sequência (ex: `npm run
  build` repetido). Adicionado rate limit em memória: no máx. 5 execuções por
  minuto por chat, janela deslizante.
- **M3** — `SessionIndicator.tsx` não tinha try/catch — se
  `createSupabaseBrowserClient()`/`getSession()` falhasse (env var ausente em
  runtime, por exemplo), o indicador ficava travado pra sempre em "checando
  sessão" (nem "Visitante" nem e-mail aparecia). Adicionado try/catch e
  `.catch()`, caindo pra "Visitante" em vez de travar.
- **M4** — `/importar` deixava confirmar a importação mesmo se
  `cotacoes_reais.json`/`contratados_reais.json`/`cnpj_to_info.json`
  estivessem vazios ou truncados (JSON válido, mas sem conteúdo real) — só
  falharia depois de já ter começado a substituir cotações/ofertas/
  contratações. Adicionada validação em `ImportarClient.tsx` logo após o
  parse: rejeita arquivos com array/objeto vazio antes mesmo de chegar na
  prévia.
- **M5** — confirmado que `src/proxy.ts` existe (renomeado de
  `middleware.ts` numa sessão anterior, [D-27]/[D-28]) — nenhuma ação
  necessária.
- **M6** — bot já loga os erros do `bot.catch` com `console.error` em
  `bot/src/index.js` — nenhuma ação necessária.
- **M7** — verificado que `OportunidadesTabsClient` não usa `Math.random`,
  `Date.now()` nem `window` na renderização inicial (só dentro de
  `useEffect`, via `useThemeVars`) — sem risco real de hydration mismatch,
  nenhuma ação necessária.
- **B1** — comentário desatualizado em `DashboardShell.tsx` sobre o item
  "Oportunidades" (referenciava uma nota antiga sobre estar "desabilitada"
  que não valia mais desde que a página foi portada) — simplificado.
- **B3** — conferido via Vercel MCP: `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` estão configuradas para
  Production/Preview/Development nos dois projetos Vercel (`tms-fretes-soma`
  e `tms-fretes-soma-app`) — nenhuma ação necessária.
- **B4, B5** — já estavam fechados pelo texto da própria auditoria (sem
  import órfão de `src/lib/supabase.ts`; `outputFileTracingIncludes` é
  monitorar upstream, não corrigir agora) — sem ação.
- **B6** — comportamento de `maxMes == null` (base vazia) no filtro
  `ecoFiltrado` de `src/app/financeiro/page.tsx` não estava documentado —
  adicionada uma frase explicando que, nesse caso, a lista resultante fica
  vazia mesmo (não é bug).
- **Extra (achado ao rodar eslint, não da auditoria):** `/financeiro` ainda
  tinha um card "Pendências desta etapa" visível pro Mikael dizendo que
  `/oportunidades` só implementava 4 das 11 dimensões do Filtro Global — isso
  ficou desatualizado assim que o A1 foi corrigido (mesma sessão, rodada
  anterior). Card removido de `src/app/financeiro/page.tsx`.

**Ficaram de fora de propósito:**
- **A5** — `/oportunidades` busca as 5.194 linhas da view `comparacoes`
  inteira (paginado em lotes de 1000) e só filtra depois, em JS, no servidor
  (não é filtro client-side no navegador como a auditoria descreveu — mas o
  efeito de desperdício é o mesmo: sempre busca a base inteira do Supabase a
  cada carregamento, não só o recorte filtrado). Resolver de verdade exige
  estender a view/criar uma RPC nova que aceite as 11 dimensões de filtro
  como parâmetros — uma migration nova no Supabase de produção, não um ajuste
  de código isolado. Não tentado nesta sessão por ser mudança de schema em
  produção; requer decisão e teste dedicados.
- **A6** — `loading.tsx` genérico (não diferencia "navegando" de
  "filtrando") — a própria auditoria marca como "Opcional", não feito.

Com isso, restam só A5 e A6 em aberto na `AUDITORIA_AG03.md`. O arquivo em si
e a pasta `bot/` inteira continuam não commitados no git.

## ✅ IMPLEMENTADO 2026-09-21/22 — Página `/usuarios` (Gestão de Usuários)

Rascunho planejado em 2026-09-18 (seção abaixo mantida como referência histórica)
foi implementado e commitado: commit `7d31126`, push pra `main` em 2026-09-22.
Duas ações nesta entrega — **criar usuário** (e-mail + senha provisória definida
pelo admin, via `POST /api/usuarios/criar`, usa a `SUPABASE_SERVICE_ROLE_KEY` em
`src/lib/supabase-admin.ts`) e **trocar papel** (admin ⇄ usuário, RPC
`admin_trocar_role`) — protegidas por `requireAdmin()`, mesmo padrão de
`/importar`. RPCs `admin_listar_usuarios`/`admin_trocar_role` já aplicadas no
Supabase de produção (migration `fn_admin_listar_usuarios_e_trocar_role`,
20260922020222). `tsc --noEmit` e `npm run build` limpos antes do commit.
**Resetar senha fica para uma entrega futura** — decisão deliberada do Mikael
pra manter o escopo enxuto nesta etapa; sem campo de nome/matrícula e sem
status "Ativo/Inativo" pelo mesmo motivo (ver perguntas em aberto do rascunho
original abaixo — seguem valendo se ele quiser essa extensão depois).

**✅ "Remover acesso" IMPLEMENTADO 2026-09-23** (Mikael pediu ao ver a tela
`/usuarios` sem essa opção): `POST /api/usuarios/excluir` (mesmo padrão de
`/api/usuarios/criar`, `service_role` via `src/lib/supabase-admin.ts`) chama
`auth.admin.deleteUser(id)` — o `ON DELETE CASCADE` de `profiles.id →
auth.users.id` já cuidava da limpeza, sem precisar de lógica extra. Botão
"Remover acesso" em `UsuariosClient.tsx`, com `window.confirm()` antes de
disparar e desabilitado pro próprio usuário logado (mesma proteção `isSelf`
já usada em "trocar papel"). `tsc --noEmit` e `npm run build` limpos. Ainda
**não commitado/testado em produção** nesta sessão (feito direto na working
tree local) — falta o Mikael revisar, testar em `/usuarios` e decidir se
commita/dá push.

**Bug pós-deploy encontrado e corrigido no mesmo dia (2026-09-22)**: a página
não carregava — `admin_listar_usuarios()` batia em erro 42702 do Postgres
(referência de coluna ambígua entre as colunas de saída do `RETURNS TABLE` e
`profiles.id`/`profiles.role` referenciadas no guard de acesso). Corrigido na
migration `fix_admin_listar_usuarios_ambiguous_id_role` (20260922024948) — ver
[D-34] em `LOG_DECISOES.md` pra causa raiz completa e a lição pra RPCs
futuras com `RETURNS TABLE`. **Confirmado pelo Mikael em produção (2026-09-22):
`/usuarios` carrega certo.** Este item está fechado — nenhuma ação pendente
além do que já está registrado acima como entrega futura (resetar senha).

### Rascunho original (2026-09-18), mantido como referência

Mikael pediu pra deixar isso pré-organizado pra desenvolver depois (explicitamente:
"não implante nada para não dar erro") — ele viu essa funcionalidade em outro
sistema (matrícula/nome/status "Ativo-Inativo") e quer o equivalente aqui, mas
adaptado ao que este app realmente tem hoje.

### Estado atual (levantado 2026-09-18, direto no Supabase)
- Schema de usuário é bem mais simples do que o outro sistema que ele mostrou:
  só existe a tabela `public.profiles (id uuid PK/FK auth.users(id) ON DELETE
  CASCADE, role text CHECK IN ('admin','user'), criado_em timestamptz)`. **Não
  tem** matrícula, nome, nem status ativo/inativo — essas 3 coisas precisam de
  decisão + migration nova antes de implementar, se ele quiser (ver "Perguntas
  em aberto" abaixo).
- **2 usuários hoje**: `mikaelantiqueira@gmail.com` (role=admin) e
  `transportes.rs@somahospitalar.com.br` (role=user).
- **Não existe NENHUMA UI no app pra criar/gerenciar usuário** — hoje isso só
  dá pra fazer direto no painel do Supabase (Auth → Users → convidar). O texto
  da tela de login já reflete isso ("Use o link enviado por e-mail pelo
  Supabase Auth — convite/recuperação de senha").
- `role='admin'` só existe pro Mikael por decisão prévia ([DEC-29], D-12) — ver
  seção "Auth e segurança" mais abaixo neste arquivo.
- **Nota histórica (válida até 2026-09-21)**: até a implementação abaixo,
  nenhum código deste projeto usava a `service_role` key do Supabase — só
  existia um comentário em `ImportarClient.tsx` dizendo explicitamente que ela
  NÃO era usada. Isso mudou com a página `/usuarios` (ver seção "✅
  IMPLEMENTADO" no topo deste arquivo): a ação de criar usuário exige
  `supabase.auth.admin.createUser`, que só funciona com a `service_role`
  key — isolada em `src/lib/supabase-admin.ts`, nunca importada por código
  client-side (bypassa toda RLS do banco, não pode rodar no navegador).

### Proposta de página (rascunho, ainda não validado com o Mikael)
Rota `/usuarios`, mesmo padrão de admin-only de `/importar` (`requireAdmin()`
+ item sempre visível no menu, mas a página redireciona pra `/` quem não é
admin).

- **Tabela**: E-mail · Papel (badge Admin/Usuário) · Criado em · Último
  acesso · Confirmado? (`email_confirmed_at is not null`) — todos esses campos
  já existem hoje, sem precisar de migration nenhuma (vêm de `auth.users` via
  API admin + `profiles.role`).
- **Ação "trocar papel"** (admin ⇄ usuário): só um `UPDATE profiles SET role=...`
  — não precisa de service_role, RLS/policy de admin já bastaria (ainda não
  auditado se `profiles` tem policy de UPDATE pra admin — checar antes de
  implementar).
- **Ação "convidar usuário"**: formulário com só o e-mail →
  `supabase.auth.admin.inviteUserByEmail(email)` — dispara e-mail do próprio
  Supabase, a pessoa define a senha pelo link (mesmo fluxo que já existe hoje
  pra recuperação). O trigger `handle_new_user` (`SECURITY DEFINER`, já
  existe) cria a linha em `profiles` automaticamente com `role='user'` —
  o admin promove depois, se precisar, com a ação de trocar papel acima.
- **Ação "reenviar link de redefinição de senha"**:
  `supabase.auth.admin.generateLink({type: 'recovery', email})` (ou
  `resetPasswordForEmail` do lado do client, que já é público).
- **Ação "remover acesso"**: `supabase.auth.admin.deleteUser(id)` — o
  `ON DELETE CASCADE` do FK `profiles.id → auth.users.id` já limpa o profile
  sozinho, não precisa de lógica extra de limpeza.

### Arquitetura necessária (não existe ainda, é a parte que mais precisa de cuidado)
1. Nova env var **só de servidor** — `SUPABASE_SERVICE_ROLE_KEY` (sem prefixo
   `NEXT_PUBLIC_`, nunca pode ir pro bundle do navegador). Configurar no
   Vercel (Production + Preview) e no `.env.local` do Mikael — igual foi feito
   antes pra outras env vars (ver `COMANDO_configurar_env_vars_vercel.md`
   nesta mesma pasta, mesmo padrão de instrução passo a passo).
2. Client novo **server-only**, ex. `src/lib/supabase-admin.ts` — só pode ser
   importado de Server Actions/Route Handlers, nunca de um Client Component
   (mesmo cuidado arquitetural já documentado em `FilterBar.tsx`/[D-30] sobre
   nunca cruzar Server→Client com coisa que não devia).
3. As 4 ações (convidar/trocar papel/resetar senha/remover) viram Server
   Actions chamadas do formulário — nenhuma delas pode rodar
   `createSupabaseBrowserClient()` com a service_role, só o client novo do
   item 2, e só no servidor.

### Perguntas em aberto (perguntar ao Mikael antes de implementar)
- Quer adicionar **nome** e/ou **matrícula** de verdade (como no outro
  sistema)? Se sim, precisa de migration em `profiles` (colunas novas) — hoje
  o único "nome" disponível é o e-mail.
- Quer um status **"Ativo/Inativo"** independente de excluir de fato? Hoje só
  existe "existe ou não existe" (via `auth.users`) — um "inativo" de verdade
  precisaria de uma coluna nova + travar login de quem está inativo (mudança
  em `requireUser()`/`proxy.ts`, superfície de segurança maior, pensar com
  calma).
- Confirmar que só admin pode acessar `/usuarios` mesmo (nenhum meio-termo
  tipo "usuário comum vê só o próprio perfil").

### Não fazer sem o Mikael validar
Não implementar nada disso ainda — ele pediu explicitamente pra só deixar
organizado ("não implante nada para não dar erro"). Quando ele topar seguir,
a ordem natural é: 1) decidir as 3 perguntas em aberto acima, 2) configurar a
`SUPABASE_SERVICE_ROLE_KEY`, 3) implementar o client server-only, 4) as 4
Server Actions, 5) a página em si.

## ✅ CORRIGIDO 2026-09-16 — faixa de peso do filtro global não seguia [DEC-26]

Ao validar a dimensão `faixaPeso` do motor de filtro global contra o Artifact
v40, achado bug real: `v_cotacao_filtros.faixa_peso` usava cortes ANTIGOS
(10/25/50/100/250/500/1.000 kg, 8 faixas) em vez dos cortes FINAIS de
[DEC-26] (resposta do Mikael, 2026-09-10): **10/20/50/100/250 kg, 6 faixas**
(`0–10`/`10–20`/`20–50`/`50–100`/`100–250`/`250+`), confirmados tanto no
dropdown do Artifact (`ORD_FAIXA_PESO`) quanto no código-fonte Python
original (`codigo/enrich_dashboard_data.py::faixa_peso()`, comentário cita
[DEC-26] literalmente). **Corrigido** (migration
`fix_faixa_peso_alinha_com_dec26`): `v_cotacao_filtros` agora usa os 6 cortes
certos — afeta a dimensão `faixaPeso` do filtro global em TODAS as páginas
que a usam (/financeiro, /dados, /operacao, /transportadoras).

**Cuidado, NÃO unificar mais que isso**: o gráfico "Peso x Frete Contratado"
e a tabela "Outliers de Peso x Frete" (sub-aba "Peso, Cubagem & Custo" de
/financeiro — RPCs `financeiro_peso_frete`/`financeiro_outliers_peso`) usam
de propósito um esquema DIFERENTE e mais fino (`PESO_BINS`, 8 faixas, os
cortes ANTIGOS) — confirmado no próprio JS do Artifact v40, coexistindo com
`ORD_FAIXA_PESO` sem ligação entre os dois. Tentei unificar essas 2 functions
pros mesmos 6 cortes numa primeira tentativa e **revertido** (migration
`revert_financeiro_peso_frete_outliers_para_8_faixas`) depois de achar essa
distinção no código-fonte — não é bug, são 2 conceitos diferentes que sempre
coexistiram no sistema original. Cubagem não tem esse problema (só 1 esquema,
já batia em todo lugar).

**Achado adicional, registrado mas NÃO corrigido** (precisa de mais
investigação, não é claramente um bug): ao testar `faixaPeso=20–50kg` contra
o Artifact v40, os NÚMEROS totais (`frete_n`=776 no Supabase vs. 1.235 no
Artifact; `cot`=1084 vs. 1.543) não bateram, mesmo com os cortes já corretos.
Hipótese mais provável: [DEC-26] e [DEC-27] ("peso considerado" = maior entre
peso real e peso cubado) foram decididos no MESMO DIA (10/09) pelo Mikael, e
o Artifact v40 é de 11/09 — pode ter recebido só os RÓTULOS do DEC-26 no
dropdown, sem propagar ainda o DEC-27 pro campo de peso usado ali. O SQL
atual (`v_cotacao_filtros`, `GREATEST(peso_real_kg, peso_cubado_kg)`) já
segue DEC-27 integralmente — pode estar CERTO e mais atualizado que essa
versão específica do Artifact, não errado. Não alterado até confirmar com o
Mikael ou achar uma versão do Artifact posterior a ambas as decisões pra
comparar. Ver [D-08]/[DEC-27] em LOG_DECISOES.md.

## ✅ INVESTIGADO 2026-09-16 — issue #1 do GitHub ("Possible exposed API Key"), falso alarme

Bot público (`Leakwatch-Alert-Bot`) abriu a [issue #1](https://github.com/MikaelAntiqueira/-tms-fretes-soma/issues/1)
alertando um "JWT exposto" no commit `6129876` (arquivo `COMANDO_configurar_
env_vars_vercel.md`). Investigado: é a `NEXT_PUBLIC_SUPABASE_ANON_KEY` —
exatamente a chave pública/anon do Supabase, feita pra ser embutida em
código client-side (por isso o prefixo `NEXT_PUBLIC_`; ela já vai em todo
bundle JS que o navegador baixa, exposta de qualquer forma). Confirmado
direto no banco: as 5 tabelas de dado (`clientes`/`cotacoes`/`ofertas`/
`contratacoes`/`transportadoras`) têm RLS habilitado (`relrowsecurity=true`)
com policy de SELECT restrita à role `authenticated` — a anon key sozinha
não lê nenhum dado de negócio. **Não precisa rotacionar nada.** **Fechada
pelo Mikael em 2026-09-16** (o token GitHub desta sessão só tem permissão de
"Contents", não de "Issues" — comentar/fechar via API retornou 403; ele
fechou direto no GitHub).

## ✅ RESOLVIDO 2026-09-14 — 500 em /operacao: causa raiz real era timeout de DB, não (só) o middleware

A task #15 (sessão anterior, mesmo dia) tinha corrigido a duplicação
`middleware.ts`/`proxy.ts` como hipótese para o 500 relatado pelo Mikael em
`/operacao` e `/oportunidades`, mas marcou como "não confirmado 100%". Task
#16 achou a causa raiz real de `/operacao`, com **prova em log** (não
hipótese): `postgrest_logs`/`postgres_logs` mostram 5x `POST /rpc/
operacao_por_janela` → 500 em 2026-09-14T12:10, "canceling statement due to
statement timeout". Motivo: a página disparava 7 RPCs num só `Promise.all`,
5 delas recomputando de forma concorrente a mesma view cara
`v_operacao_base` (~900ms isolada) — sob contenção, isso passa do
`statement_timeout=8s` do role `authenticated` (bem menor que o do
postgres/service_role, por isso não reproduzia em testes diretos no banco).

**Correção** (migration `fix_operacao_dashboard_estatico_reduz_recomputo_v_
operacao_base` + commit `393a6b7` em `src/app/operacao/page.tsx`): nova RPC
`operacao_dashboard_estatico()` materializa a view 1 vez para as 4
agregações estáticas (kpis/carriers/janela×transportadora/cidades),
retornando tudo num único jsonb — reduz de 5 para 2 os recomputos
concorrentes de `v_operacao_base` por carregamento de página. Regredido:
números idênticos às functions antigas (mantidas no banco, só não são mais
chamadas por `/operacao`). Detalhe completo em [D-26], `LOG_DECISOES.md`.

**Não confirmado ainda**: não há como testar em produção com sessão
autenticada sem logar como o Mikael (ação que não posso executar). Falta
ele confirmar que o erro não volta em uso normal. Nenhum 500 de
`/oportunidades` apareceu nos logs das últimas 24h (só `operacao_por_
janela`) — se `/oportunidades` ainda falhar, o padrão a investigar é
diferente deste.

## ✅ RESOLVIDO 2026-09-14 — página /oportunidades estava quebrada em produção

Task #5 (validação campo a campo) encontrou que `/oportunidades` retornava
erro pra todo visitante desde o commit que a criou (`12a4916`): a página
consultava `supabase.from("comparacoes")`, mas essa view não existia no
banco (o arquivo de migration original referenciava 3 colunas inexistentes
em `contratacoes` e nunca chegou a rodar). Isso também bloqueava o
`chartClassif` da task #2.

**Correção aplicada** (2 migrations no projeto Supabase
`jpoizkylaffircimxzrq`: `fix_create_comparacoes_view_sobre_v_ontem_comparacao`
+ `fix_comparacoes_dedup_ofertas_duplicadas_prazo_contratado`; arquivo local
`supabase/migrations/2026091303_create_comparacoes_view.sql` reescrito pra
refletir o estado final): `comparacoes` foi reconstruída SOBRE
`v_ontem_comparacao` (mesma fonte de verdade de diffR/diffP/esc do resto do
app) em vez do ROW_NUMBER() ingênuo original, evitando a segunda fonte de
verdade divergente que a recomendação do audit já tinha sinalizado.
No caminho, achado um bug adicional: `ofertas` tem registros duplicados
(mesma cotação+transportadora+preço, import duplicado) que multiplicavam a
linha da contratação num JOIN não agregado — corrigido agregando por
`(cotacao_id, transportadora_id)`. Validado: **5.196 linhas, soma
diffR>0 = R$ 45.957,95 — bate exatamente com `v_ontem_comparacao`**, sem
divergência. Também corrigido `ComparacaoRow.contratacao_id` no front
(`page.tsx`): era tipado/convertido como `number` (`Number(uuid)` = `NaN`
sempre), quebrando a `key` de React na tabela; agora é `string`. Limpeza:
função órfã `fn_janela` (resíduo de tentativa anterior) removida; `search_path`
fixado em `fn_faixa_peso`/`fn_faixa_cubagem` (lint de segurança do Supabase).
Build de produção (`next build`) rodou limpo depois da correção — ver item
"tsc/build limpo" abaixo, também resolvido por tabela.

**Achado adicional na mesma investigação**: o mesmo bug de duplicação existia
na RAIZ, em `v_ontem_comparacao` (não só na cópia que eu tinha feito em
`comparacoes`) — afetava também `/ontem` inteiro (ontem_kpis,
ontem_contratacoes, ontem_cobertura, ontem_tendencia_15_dias) e
`dados_detalhe`. Corrigido na view em si (migration
`fix_v_ontem_comparacao_dedup_oferta_propria`) — ver [D-22] em
LOG_DECISOES.md. Depois da correção, os números batem exatamente com o
baseline já documentado logo abaixo (494.417,43 / 6.915 / 5.194 /
45.938,44) — confirmado que a divergência estava só do lado de
`v_ontem_comparacao`, não em `v_cotacao_filtros`/`v_ontem_radar` (usados por
/financeiro), que já tratavam a duplicata corretamente.

## Filtro Global — Fase 1 (11/11 dimensões prontas, 2026-09-14)

- [x] Completar as 7 dimensões restantes do Filtro Global:
      romaneio, esc (escolheu a mais barata), prazo, cidade, janela, faixaPeso, faixaCubagem —
      migrations `fn_filtro_global_fase1_7_dimensoes_restantes` +
      `fn_filtro_opcoes_add_cidade_romaneio_prazo`, commit `0ffce75` (sessão principal,
      2026-09-14). `v_cotacao_filtros` estendida reaproveitando `v_financeiro_padroes_base`/
      bins de `financeiro_peso_frete`/CASE de janela de `transportadoras_comparativo` — nenhuma
      lógica nova. Baseline validado sem regressão (494.417,43 / 6.915 / 5.194 / 45.938,44).
      **✅ Confirmado 2026-09-14**: `npm run build` (Next.js 16 / Turbopack) rodou limpo —
      compilação, checagem de TypeScript e geração de todas as 10 rotas sem erro (validado numa
      máquina com RAM suficiente pro `npm install`; único ruído foram os fetches de Google Fonts
      bloqueados pela rede do sandbox de validação, sem relação com o código).

- [x] Implementar cascata de opções — RPC `financeiro_filtro_opcoes_cascata`, commit da sessão
      principal 2026-09-14. Sai "de graça" no mesmo round-trip (página já é Server Component
      re-renderizado a cada mudança de URL). Ver comentário no topo de `FilterBar.tsx` pra
      pegadinha de performance (materializar a view numa CTE, não referenciar direto em 11
      subqueries — deu timeout na primeira versão).

### A fazer agora
- [x] ~~Fazer outras páginas reagirem ao filtro~~ — **`/dados` portado 2026-09-16** (commit
      `ae8d0c4`, migration `fn_dados_detalhe_add_filtro_global_11_dimensoes`): `dados_detalhe`
      ganhou os 11 parâmetros opcionais, mesmo padrão de `v_cotacao_filtros` já usado em
      /operacao e /transportadoras; opções dos dropdowns reaproveitam `financeiro_filtro_opcoes_
      cascata` (nenhuma RPC nova). Regressão validada direto no Supabase: sem filtro,
      total_count = 5.194 (baseline); com `mes=2026-08`, total_count = 1.558 = contagem
      cruzada feita à parte. **Ainda falta** `/` (Visão Geral/home — mas é só uma página de
      prova de conceito, candidata a ser descontinuada, não um dos 5 painéis do dashboard
      original — decisão do Mikael antes de investir nisso).
      **Confirmado 2026-09-21** em sessão autenticada real (Playwright + login do Mikael,
      dev server local): página carrega sem erro, 11/11 dropdowns presentes, filtro de mês
      aplicado (`?mes=2026-01`) reduz corretamente de 5.194 para 146 processos, paginação
      recalcula (104 → 3 páginas) e todas as linhas da tabela passam a mostrar `jan/2026` —
      sem repetir o "This page couldn't load" das rodadas anteriores.
- [x] ~~`/ontem` — seletor de dia específico~~ — **portado 2026-09-16** (commit `1aff130`,
      migration `fn_ontem_dias_disponiveis`). Mikael esclareceu que `/ontem` NÃO precisa do
      motor de filtro global de 11 dimensões (é um recorte de 1 dia só, filtrar por mês não faz
      sentido) — o que fazia falta era poder escolher OUTRO dia específico além do padrão
      (último dia com contratação cruzada). Nova RPC `ontem_dias_disponiveis()` lista os 100
      dias com dado (2026-01-02 a 2026-08-27); `?dia=AAAA-MM-DD` na URL escolhe o dia, ignorado
      silenciosamente se inválido/sem dado (cai no padrão). Componente novo `DiaSelector.tsx`
      segue a mesma convenção do FilterBar (nenhuma função cruza a fronteira Server→Client).
      Validado direto no Supabase com um dia arbitrário do meio da série (2026-07-16):
      ontem_kpis/ontem_contratacoes/radar_d2/d3/d4/d6 todos retornam dados consistentes.
      **Confirmado 2026-09-21** em sessão autenticada real (Playwright + login do Mikael,
      dev server local): dia padrão carrega 27/08/2026 (mais recente); ao trocar pra
      12/01/2026 no seletor a URL vira `?dia=2026-01-12` e KPIs (20→17 contratações, 45,0%→
      0,0% cobertura), Radar de Decisão (cards trocam de CONCENTRAÇÃO/RECORRÊNCIA para FRETE
      MÍNIMO FORA DO PARÂMETRO/ANOMALIA DE PREÇO) e a tabela de contratações do dia mudam
      juntos, sem quebrar a página.
- [x] ~~Validar as 11 dimensões campo a campo contra o Artifact original~~ — **11 de 11
      validadas, 2026-09-16** (Browser tool servindo `dashboard-restore-points/
      artifact-v40-2026-09-11.html` localmente + comparação direta com
      `financeiro_visao_geral_kpis()`/`v_cotacao_filtros`). Mês/Transportadora/Região/Tipo já
      eram da Fase 1; validadas nesta rodada: esc, janela, romaneio, prazo, cidade,
      faixaCubagem (todas bateram dígito a dígito de primeira) e **faixaPeso** (achou e
      corrigiu um bug real — ver seção "CORRIGIDO 2026-09-16" acima, D-31 em
      LOG_DECISOES.md). Único ponto aberto: o total de processos da dimensão faixaPeso
      ainda não bate 100% com essa versão específica do Artifact (provável DEC-27 não
      propagado no v40) — não é uma dimensão pendente de validar, é uma nuance registrada
      pra confirmação futura do Mikael.

## Dashboard completo (fase futura)

### Gráficos restantes — inventário corrigido em 2026-09-14

> A cifra "16 gráficos restantes" (herdada do mapa de migração, que descreve os
> 16 gráficos do Artifact TODO, não os que faltam) estava desatualizada — 13
> dos 16 já tinham sido portados nos commits anteriores. Auditoria feita
> comparando os 16 `upsertChart(...)` do Artifact original (`c0abf79e`, v39)
> com os componentes já existentes em `src/app/*/`:
>
> | Canvas original | Onde já está portado |
> |---|---|
> | chartEvolucao, chartEconomiaMes, chartEscolheu | `financeiro/CotadoContratadoCharts.tsx` |
> | chartDiffPrazo, chartDiffUf, chartDiffTransp, chartDiffTipo | `financeiro/PadroesCharts.tsx` |
> | chartPeso | `financeiro/PesoCustoCharts.tsx` |
> | chartPrazo | `transportadoras/PrecoPrazoChart.tsx` |
> | chartContrxBarata, chartMaisBarata | `transportadoras/ComparativoCharts.tsx` |
> | chartUf | `transportadoras/RegiaoComercialChart.tsx` |
> | chartClientes | `transportadoras/ClientesChart.tsx` |
> | chartQuadrante | `transportadoras/PrecoPrazoChart.tsx` — **nome do arquivo engana**: o comentário do próprio arquivo diz "Porta `function renderQuadrante(mask)`" (prazo médio histórico × diferença média por transportadora), não é o `chartPrazo` (esse é o de `PesoCustoCharts.tsx`). Corrigido aqui em 2026-09-14 depois de eu (Hermes) ter reportado `chartQuadrante` como faltante por engano numa mensagem anterior — checar sempre o comentário/`renderXxx` portado, não só o nome do componente. |
> | chartClassif | `components/ClassificacaoChart.tsx` — **portado nesta sessão (Hermes, 2026-09-14)**, ver `oportunidades/OportunidadesTabsClient.tsx` |

- [x] chartClassif ("Classificação por impacto", doughnut) — portado em `src/components/ClassificacaoChart.tsx`
- [x] `ontTendChart` ("Diferença dos últimos 15 dias", barra) — portado em `src/components/OntemTendenciaChart.tsx` + RPC `ontem_tendencia_15_dias` (migration `fn_ontem_tendencia_15_dias`). Os 16/16 gráficos do Artifact original agora têm equivalente no Next.js.
- [x] ~~Validar campo a campo cada gráfico portado com sistema de referência~~ — **16/16
      feito 2026-09-16**, ver seção "Filtro Global — Fase 1" mais abaixo (técnica
      `Chart.instances` + comparação com as RPCs).

### Tabelas restantes — inventário corrigido em 2026-09-14

> Mesmo problema do item acima: 9 das 10 tabelas do Artifact original já
> existem no Next.js. Conferido por id/cabeçalho de coluna:
>
> | Tabela original | Onde já está |
> |---|---|
> | ontTabela | `ontem/page.tsx` ("Todas as contratações do dia") |
> | tblOutliers | `financeiro/page.tsx` |
> | tblCbmCusto | `financeiro/page.tsx` |
> | tblPrazoHist, tblTransp, tblCidades | `transportadoras/page.tsx` (mesmo id) |
> | tblOportunidades | `oportunidades/OportunidadesTabsClient.tsx` ("Processos classificados — detalhe") |
> | opQuem, opCidades | `operacao/page.tsx` |

- [x] `tblDetalhe` — tabela paginada/pesquisável da página "Dados" — portada em `src/app/dados/page.tsx` + RPC `dados_detalhe` (migration `fn_dados_detalhe`, busca/ordenação/paginação no Postgres, nunca carregando a base inteira pro cliente — [D-05]). Reaproveita `v_ontem_comparacao` (mesma fonte de melhor cotação/diferença/escolheu já usada no resto do app) em vez de recalcular. Coluna "Valor Declarado" do original NÃO existe em nenhuma tabela do schema atual — omitida, não estimada ([R-DADO]). Item adicionado ao menu lateral (`DashboardShell.tsx`), antes só acessível pelo rodapé no Artifact original. As 10/10 tabelas do Artifact original agora têm equivalente no Next.js.
- [x] ~~Página "Metodologia" (dicionário de indicadores)~~ — **decisão do Mikael 2026-09-16:
      NÃO como rota do site** (o Artifact original só REFERENCIA um "Dicionário de Indicadores",
      nunca embute o conteúdo completo dele numa página própria — não é uma das 10 tabelas).
      Escrito como arquivo markdown de referência no próprio repositório —
      `central-contexto/METODOLOGIA.md` — reconciliado com o valor/regra ATUAL de cada
      indicador (RPCs já validadas e decisões D-XX/DEC-XX FINAIS), não com o dicionário
      original de ~9 meses atrás (esse tinha números já superados por correções posteriores).
- [x] ~~Validar tabela "Cubagem e custo unitário" (tblCbmCusto) e "Outliers de Peso x Frete"~~ —
      **validadas 2026-09-16** contra o Artifact v40: `financeiro_cubagem_custo()` bate
      dígito a dígito em 5 das 6 faixas (n/peso/cbm/frete/custo_kg/custo_m3 idênticos). Única
      diferença: a faixa "Não informado" mostra peso=0 hoje (era 147.586kg no v40) — confirmado
      direto no banco que as 1.906 linhas dessa faixa têm `peso_considerado` NULL agora em
      `v_financeiro_padroes_base` (0 de 1.906 com peso). n e frete continuam idênticos (1.906 /
      R$162.214), só o peso mudou — não é um bug de lógica SQL (a fórmula está certa,
      `sum(coalesce(peso,0))`), é o DADO em si que mudou entre o snapshot do Artifact (11/09) e
      hoje (16/09), provavelmente por alguma correção de qualidade de dado no meio do caminho
      ([D-22]/[D-24] mexeram em views próximas dessa). `financeiro_outliers_peso()` tem drift
      parecido (medianas por faixa mudaram ~10-30%, ranking dos top-10 mudou) — mesma explicação
      provável (dados mudaram em 5 dias de correções, não lógica errada). Não investigado a
      fundo qual migration especificamente zerou o peso dessas 1.906 linhas — se importar,
      abrir uma investigação dedicada com `git log` das migrations entre 11/09 e 14/09.
- [x] ~~Validar 11 dos 16 gráficos portados campo a campo~~ — **2026-09-16**, técnica nova:
      o Chart.js mantém `Chart.instances` viva mesmo depois de trocar de aba no Artifact v40
      (SPA sem destruir canvas antigos) — bastou navegar pelas abas uma vez e ler
      `Chart.instances` via `javascript_tool` pra capturar os dados de quase todos os gráficos
      de uma vez, sem precisar interagir com cada um. **Bateram exatos** (valores ou % com
      diferença só de arredondamento): `chartEvolucao`/`chartEconomiaMes`
      (`financeiro_evolucao_mensal`), `chartEscolheu` (esc_s/n/sc), `chartDiffPrazo`
      (`financeiro_diff_por_prazo`), `chartDiffUf` (`financeiro_diff_por_regiao`),
      `chartDiffTransp` (`financeiro_diff_por_transportadora`), `chartDiffTipo`
      (`financeiro_diff_por_tipo_cliente`), `chartPrazo` (`financeiro_prazo_frete_medio`),
      `ontTendChart` (`ontem_tendencia_15_dias`), `chartMaisBarata` + `chartContrxBarata`
      (`transportadoras_comparativo` — vezes_mais_barata/pct_mais_barata/pct_contratada, 7
      transportadoras, todas exatas).
      **`chartPeso` (`financeiro_peso_frete`) tem a MESMA causa de drift já registrada acima**
      (faixa de peso/outliers): o total de linhas com `peso_considerado` não-nulo caiu de 5.194
      (no snapshot do Artifact, 11/09) pra 3.288 (hoje) — as MESMAS 1.906 linhas que perderam o
      peso na tabela de cubagem também afetam este gráfico. Formato/ordem dos 8 buckets e a
      tendência (n caindo, frete_medio subindo por faixa) continuam corretos — só a MAGNITUDE
      dos números mudou, coerente com dado que mudou entre 11/09 e hoje, não lógica errada.
      **Os 5 gráficos restantes foram validados na sequência (mesmo dia, 2026-09-16)** —
      `chartUf`/`chartClientes` (`transportadoras_regiao_comercial`/`clientes_metricas`) e
      `chartQuadrante` (`transportadoras_prazo_medio` + `comparativo`) bateram exatos, dígito a
      dígito, nas 15/12/7 linhas checadas. `chartClassif` achou um **bug real** — ver seção
      "CORRIGIDO — bug de acento" abaixo. **16 de 16 gráficos agora validados.**

      **10 de 10 tabelas também validadas, mesmo dia**: `tblTransp` (Comparativo, 7
      transportadoras × 8 colunas, tudo exato), `tblPrazoHist` (7 transportadoras, só 1 célula
      com drift de dado esperado — N de Rede Nacional 54→55), `tblCidades` (top 10 linhas,
      tudo exato), `ontTabela` (KPIs do dia 27/08 + top 3 linhas da tabela de contratações,
      tudo exato), `tblOportunidades` (Clientes Prioritários, top 3 clientes por diferença
      acumulada, tudo exato — só depois do fix do bug de acento abaixo). `opQuem`/`opCidades`
      bateram exatos na tabela por transportadora — **mas o KPI do topo de `/operacao` tem um
      achado importante NÃO corrigido, ver seção própria abaixo.**

      **Resumo final da rodada de validação (2026-09-16): 16/16 gráficos + 10/10 tabelas + 11/11
      dimensões do filtro global testadas campo a campo contra o Artifact original. 3 bugs reais
      encontrados e corrigidos** (faixa de peso do filtro/DEC-26, acento "Publico" na
      classificação de oportunidades, feedback visual de carregamento) **+ 1 achado sério
      documentado sem correção ainda** (KPIs do topo de /operacao, precisa de mais
      investigação antes de tocar).

## ✅ CORRIGIDO 2026-09-16 — bug de acento quebrava classificação e filtro "Tipo" em /oportunidades

Validando `chartClassif` contra o Artifact: a view `comparacoes` comparava `tipo_cliente` com
o literal `'Público'` (COM acento), mas a coluna `clientes.tipo_cliente` armazena `'Publico'`
(SEM acento — confirmado com `select distinct tipo_cliente from clientes`). Resultado: TODO
cliente Publico (219 dos 1.392 processos `esc='N'`) caía na classificação `'alerta'` ("sem
critério disponível") em vez de usar os percentis do próprio grupo Publico como qualquer
Privado. Contagem batia a assinatura exata do bug: 219 (Publico) + 2 (Grupo) + 6 (Fornecedores)
= 227 — e o Artifact mostrava só 8 (só Grupo/vazio de verdade).

**Corrigido** (migration `fix_comparacoes_classif_acento_publico`): `alerta` caiu de 227 pra 8
(bate exato); `azul` bateu exato (268); `laranja`/`vermelho` têm só ~13 linhas de diferença
(drift de dado esperado, mesmo padrão já visto em outras validações). Commit `23c12dc` também
corrigiu o dropdown "Tipo" de `/oportunidades.page.tsx` (tinha o MESMO bug — array fixo
`["Público","Privado","Grupo"]` que nunca casava com "Publico" real — agora deriva das
próprias linhas, como mes/regiao já faziam).

## ✅ CORRIGIDO 2026-09-16 (tarde) — KPIs do topo de /operacao contavam universo errado

Validando `opQuem`/`opCidades` contra o Artifact: a tabela "Quem está carregando" (por
transportadora) bate EXATA (7 transportadoras, todas as colunas) — mas os **KPIs do topo da
página** (Romaneios/Pedidos/Volumes/Peso real/Cubagem, antes da tabela) não batem, e a
diferença é grande:

| KPI | Banco (`operacao_dashboard_estatico().kpis`) | Artifact v40 |
|---|---|---|
| Romaneios | 487 | 496 |
| Pedidos | 5.193 | 5.324 |
| Volumes | 48.321 | **67.198** |
| Peso real | 426.509 kg | **666.784 kg** |
| Cubagem | 1.372,7 m³ | 2.507,0 m³ |
| Frete Contratado | 494.417,43 | 494.417 (bate) |

Lendo o JS original (`function renderOperacao`, artifact v40): os 5 primeiros KPIs somam sobre
**TODO O RECORTE de cotações filtradas** (`for i in 0..N`, sem checar se a cotação tem
contratação cruzada) — só o "Frete Contratado" soma condicionalmente (`if BASE.freteC[i]!=null`,
que só existe pra cruzadas). Ou seja: o design ORIGINAL do "Controle Operacional" mistura os
dois universos de propósito (operação = toda cotação que passou pelo processo físico; frete
contratado = só o que tem preço fechado) — mas a migration atual (`operacao_dashboard_
estatico()`, sobre `v_operacao_base` = só cruzadas) restringiu TUDO a cruzadas, subcontando a
visão operacional real.

**Investigado a fundo em `codigo/build_workbook.py` (a pedido do Mikael) e corrigido**: linha
549 mostra `romaneio = s["romaneio"] or <derivado do pedido da contratação>` e linha 593 mostra
`peso_val = s["peso"] if not None else contratado.peso_real_kg` — o Python original tinha
fallbacks pra pedido/peso que a migration não replicava. Testado com `COALESCE` pra pedido/peso
puxando da contratação vinculada quando a cotação não tem (`left join lateral` em
`contratacoes`): bateu EXATO em 4 dos 5 KPIs.

**Corrigido** (migration `fix_operacao_kpis_toda_base_nao_so_cruzadas`, commit `bcaac7b`):
`operacao_dashboard_estatico().kpis` agora soma sobre `cotacoes` (com o COALESCE acima), não
mais sobre `v_operacao_base`. Validado: Pedidos 5.324 ✓, Peso real 666.784 kg ✓, Volumes
67.198 ✓, Cubagem 2.507,0 m³ ✓, Frete Contratado 494.417,43 ✓ (inalterado, já estava certo).
Só **Romaneios ficou em 429** (Artifact mostra 496) — decisão deliberada de NÃO replicar a
heurística legada `_romaneio_do_pedido()` (derivava um romaneio sintético do texto do pedido
quando a cotação não tinha nenhum) porque `contratacoes` não tem coluna `romaneio` no schema
atual — usar `cotacoes.romaneio` direto é mais correto pro schema normalizado de hoje.
`carriers`/`janela_carriers`/`cidades` (tabelas "Quem está carregando"/"Cidade × Transportadora")
NÃO mudaram — continuam só cruzadas, já validados exatos antes desta correção.

## ✅ CORRIGIDO 2026-09-16 — cliques no filtro/seletor de dia pareciam "travados" (sem feedback visual)

Mikael relatou (em produção, /ontem e /financeiro): "as transições estão lentas, quando eu
clico demora pra fazer a ação". Investigado: nenhuma rota tinha `loading.tsx` (convenção do
Next.js App Router) — como FilterBar/DiaSelector navegam via `router.push` (troca de URL, sem
`<Link>` com prefetch), o clique não mostrava NENHUM feedback até o Server Component terminar
de buscar tudo no Supabase — parecia tela travada mesmo que o servidor estivesse processando
normalmente. **Corrigido**: `src/app/loading.tsx` (raiz do app, cobre todas as rotas com um
único Suspense boundary automático do Next.js) — mostra um spinner imediatamente a cada
navegação/mudança de filtro. **Confirmado pelo Mikael em produção (2026-09-16): a lentidão
melhorou.**

**Achado de performance real, não corrigido ainda** (fora do escopo desta correção pontual):
`/financeiro` dispara **16 RPCs em paralelo** a cada clique no filtro (`getFinanceiroData()`),
mas só ~6 delas de fato usam os parâmetros do filtro — as outras ~10 (`financeiro_evolucao_
mensal`, `financeiro_diff_por_prazo/regiao/transportadora/tipo_cliente`, `financeiro_peso_
frete`, `financeiro_outliers_peso`, `financeiro_prazo_frete_medio`, `financeiro_cubagem_custo`)
são "base completa, não reage ao filtro" — ou seja, retornam o MESMO resultado independente do
filtro, mas são recalculadas do zero a cada clique porque a página é `force-dynamic` sem cache
entre requisições. O seletor de dia de `/ontem` tem problema parecido: trocar o dia dispara
~7 RPCs (`ontem_kpis`/`ontem_contratacoes`/`ontem_cobertura`/`ontem_tendencia_15_dias` +
`radar_prazo_hist`/`radar_d2`/`radar_d3`/`radar_d4`/`radar_d6` dentro de `getRadarData`). Como
todas rodam em paralelo (`Promise.all`), o tempo total tende ao da mais lenta, não à soma — mas
ainda é uma banda desnecessária de conexões simultâneas no Supabase. Otimização futura: cache
(`unstable_cache`/`revalidate`) nas ~10 RPCs de `/financeiro` que nunca mudam com o filtro —
não fiz agora porque é uma mudança de arquitetura maior, não algo pra decidir sob pressão de
"fechar hoje".

### Funcionalidades
- [x] ~~Simulação de Custo por Transportadora (4º bloco da Visão Geral)~~ — **portada 2026-09-14**
      (RPC `financeiro_simulacao_custo`, migration `fn_financeiro_simulacao_custo`). Regra "nunca
      estima" preservada; validado com Leomar filtrada (394 processos, R$37.011,91 real) — São
      Miguel/Santa Cruz mais baratas com boa cobertura, Fritz/Rede Nacional cobertura baixa
      (só competem na janela Meio-dia), consistente com o caso já conhecido [DEC-22].
- [x] ~~Área administrativa de importação de arquivos~~ — **feito 2026-09-16** (commit
      `890cff9`). Achado ao investigar: nenhum dado entra no banco desde a carga histórica
      única de 11/09 (todas as linhas com o mesmo `inserido_em`, numa janela de segundos) —
      nunca houve atualização desde então. Nova página `/importar` (só `role='admin'`, via
      `requireAdmin()`) recebe upload de `cotacoes_reais.json`/`contratados_reais.json`/
      `cnpj_to_info.json` (os 3 arquivos que `ATUALIZAR AUTOMATICO.bat` já gera em `codigo/`,
      nenhum passo extra do Mikael) e recarrega cotações/ofertas/contratações/clientes/
      transportadoras. `src/lib/importacao.ts` é porta fiel de `codigo/load_to_supabase.py`
      (script que já fez a carga original) — validado rodando a versão TS contra os dados
      reais: todos os totais e a soma de frete contratado cruzado (R$ 494.417,43) batem
      exatos com a versão Python. RPCs novas `importar_iniciar/importar_lote_*/
      importar_finalizar` (SECURITY DEFINER, migrations `fn_importar_carga_completa` +
      `fix_importar_transportadoras_upsert_por_nome`), chamadas em lotes paralelos direto do
      navegador (arquivos somam ~23MB, além do limite de corpo de requisição de uma function
      da Vercel). Ponte deliberadamente simples/temporária — Mikael confirmou que isso só
      existe até surgir uma fonte de dados melhor (API do TMS/ERP), não é arquitetura final.
      **Ajuste 2026-09-16 (tarde)**: Mikael achou 3 campos de upload separados complicado —
      trocado por seleção de PASTA única (`codigo\`, `<input webkitdirectory>`, commit
      `2e0673f`): 1 clique, o site acha os 3 arquivos certos por nome dentro da pasta e mostra
      quais achou/faltou antes de liberar. Confirmado que não dá pra reduzir a 1 ou 2 arquivos
      de verdade sem perder dado — a aba "Clientes" da planilha é só uma lista de pendências
      manuais (664 linhas), não o cadastro completo (3.563 em `cnpj_to_info.json`).
      **Não confirmado ainda**: falta o Mikael testar de fato (selecionar a pasta e ver os
      totais baterem na tela) — não há como logar como ele pra testar isso no navegador.

## Auth e segurança — RESOLVIDO 2026-09-14 (doc estava desatualizada, corrigida agora)

> Auditoria (task #3, sessão principal): as 5 tabelas de dado (`clientes`, `cotacoes`, `ofertas`,
> `contratacoes`, `transportadoras`) estão com SELECT restrito a `authenticated` desde
> `restringir_leitura_a_usuarios_autenticados` (2026-09-12).

- [x] ~~Remover policies de leitura pública temporárias~~ — feito em 2026-09-12
- [x] **Decisão do Mikael tomada** (2026-09-14, registrada em agent_tasks#10): manter acesso
      `authenticated`-only (não reverter pra pública) + criar middleware de redirecionamento.
- [x] **Middleware de redirecionamento para `/login` implementado** — `middleware.ts` na raiz
      do repo (commits `6192324`, `e94d1ac`, `c280bae`, `9884768`), usa `@supabase/ssr` +
      `getUser()` pra revalidar o token a cada requisição. `/login` ajustado com `?redirect=`
      de volta pra página original. Testado em produção: `/financeiro` sem sessão redireciona
      corretamente pra `/login?redirect=/financeiro`. **Nota 2026-09-14**: o arquivo em si foi
      renomeado pra `src/proxy.ts` numa sessão posterior (Next.js 16 depreciou o nome
      `middleware.ts` — ver comentário no topo de `proxy.ts`); a lógica/comportamento descritos
      aqui continuam os mesmos, só o arquivo mudou de nome.
- [x] `v_cotacao_filtros` — achado à parte (não relacionado ao middleware): faltava
      `security_invoker=true`, bypassando RLS nesse endpoint específico mesmo com o resto
      correto. Corrigido 2026-09-14, ver [D-23] em LOG_DECISOES.md.
- [x] ~~Proteger páginas administrativas~~ — **feito 2026-09-16**: `requireAdmin()` (nova, em
      `supabase-server.ts`) estende `requireUser()` exigindo `profiles.role='admin'` (D-12),
      redirecionando pra `/` quem está logado mas não é admin. Usada pela página `/importar`
      (ver "Área administrativa de importação" abaixo).

## Melhorias de qualidade

- [x] ~~Revisar uso do createSupabaseServerClient em páginas que poderiam usar~~ — **Confirmado
      2026-09-14**: nenhuma página/componente importa mais `@/lib/supabase` (cliente sem cookie);
      todas usam `createSupabaseServerClient()`. Conferido também que todas as RPCs de dado são
      `SECURITY INVOKER` (só `handle_new_user`, o trigger de provisionamento, é `SECURITY DEFINER`
      — correto, precisa de privilégio elevado pra criar o profile no signup). RLS restrita a
      `authenticated` está sendo respeitada de ponta a ponta.
- [x] ~~Documentar RPCs criados~~ — **feito 2026-09-16**, via `COMMENT ON FUNCTION` (migrations
      `docs_comment_on_function_rpcs_restantes` + `docs_comment_handle_new_user`): as 39
      functions do schema `public` agora têm comentário (proposito/página que consome/se reage
      ao filtro global) — só 7 já tinham antes desta rodada. Zero mudança de comportamento
      (só metadados). Consultável com `\df+` no psql ou `obj_description(oid, 'pg_proc')`.

## Validação

- [x] Confirmar que R$ 494.417,43 continua batendo após novas alterações — **confirmado 2026-09-14**
      (R$ 494.417,43 / 5.194 contratações cruzadas, consulta direta em `contratacoes`, sem
      passar por nenhuma view — inabalado pelas correções desta sessão)
- [x] ~~Validar cada nova página/gráfico/tabela campo a campo antes de avançar~~ — feito para
      tudo que existe hoje (16 gráficos/10 tabelas/11 dimensões, 2026-09-16). Continua valendo
      como prática padrão pra qualquer página/gráfico/tabela nova que for portada no futuro —
      não é um item que "termina", é uma regra permanente do projeto.

## Issues identificados

### ISSUE-23 — Oportunidades (RESOLVIDO / doc estava desatualizada, 2026-09-14)
- A nota "aparece desabilitada no menu (em breve)" estava errada: nenhum item
  de `NAV_ITEMS` em `DashboardShell.tsx` seta `disabled: true` — o link
  sempre foi clicável desde que a página foi criada. O que estava
  genuinamente quebrado era a página em si (view `comparacoes` inexistente,
  ver seção resolvida acima), não o menu.
- Comentário desatualizado no topo de `DashboardShell.tsx` corrigido.

### Doc de referência pendente
- `docs/mapa-migracao-tms-v3-2026-09-11.md` — documento-mãe da migração no Google Drive (não está neste repo)
  - Contém: auditoria da arquitetura atual, mapa de dados, mapa de regras de negócio, schema Postgres proposto, riscos, plano de rollback, plano de testes, 10 fases
  - Regras de negócio de ~9 meses de decisões vivem em `memoria/06_LOG_DECISOES.md` e `memoria/16_PROMPT_MESTRE.md` do projeto original (Google Drive)
  - **Não portar lógica de negócio para cá sem checar essas fontes primeiro**
