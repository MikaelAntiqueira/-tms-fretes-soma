# Explicações removidas do topo das páginas (2026-09-18)

A pedido do Mikael, os parágrafos de explicação que ficavam embaixo do título
(`<h1>`) de cada página foram tirados do topo — o cabeçalho agora mostra só o
nome da aba. O texto de cada um está guardado aqui, caso precise voltar a
mostrar alguma explicação em algum lugar da página (ex. um tooltip, um rodapé
de seção, ou de volta no topo).

## Visão Geral (`/`)
> Quem está carregando agora, por transportadora e janela de contratação.

## Dados (`/dados`)
> Tabela detalhada, 1 linha por processo de cotação — busca por cliente, pedido, NF ou
> romaneio, ordenação por coluna, paginação server-side (a mesma tabela "Dados"
> do Artifact atual, agora lendo direto do Supabase). Já aceita as 11 dimensões do
> motor de filtro global (Mês, Transportadora Contratada, Região Comercial, Tipo
> Cliente, Romaneio, Escolheu a Mais Barata, Prazo, Cidade, Janela, Faixa de Peso,
> Faixa de Cubagem).

## Financeiro (`/financeiro`)
> KPIs executivos, evolução mensal e decisões de contratação. As 4 sub-abas já aceitam as
> 11 dimensões do motor de filtro global (Mês, Transportadora Contratada, Região
> Comercial, Tipo Cliente, Romaneio, Escolheu a Mais Barata, Prazo, Cidade, Janela, Faixa
> de Peso, Faixa de Cubagem).

## Resumo do Dia (`/ontem`)
> Fechamento do último dia com contratações registradas e comparadas a uma cotação.
> Você pode escolher outro dia específico no seletor abaixo.

## Operação (`/operacao`)
> Quem está carregando, quando (Meio-dia × Tarde) e em quais cidades — agregado sobre
> toda a base de contratações cruzadas a uma cotação. Todas as seções já aceitam as
> 11 dimensões do motor de filtro global, com cascata de opções nos dropdowns.

## Oportunidades (`/oportunidades`)
> Classificação de oportunidades de economia por impacto.
> Diferença ≠ erro — critério explícito.

## Transportadoras & Cidades (`/transportadoras`)
> Comparação factual entre as 7 transportadoras, por Preço × Prazo, Região Comercial,
> Cliente e Cidade — sobre toda a base (ofertas e contratações cruzadas a uma
> cotação). As 5 sub-abas já aceitam as 11 dimensões do motor de filtro global (Mês,
> Transportadora Contratada, Região Comercial, Tipo Cliente, Romaneio, Escolheu a Mais
> Barata, Prazo, Cidade, Janela, Faixa de Peso, Faixa de Cubagem), com cascata de opções nos
> dropdowns.

## Importar Dados (`/importar`)
> Atualiza cotações, ofertas, contratações, clientes e transportadoras a partir dos
> arquivos gerados pelo `ATUALIZAR AUTOMATICO.bat`. Selecione a pasta
> `codigo\` — o site acha sozinho os 3 arquivos que precisa lá dentro (não
> a planilha `.xlsx` — ela não tem cubagem nem volumes).
