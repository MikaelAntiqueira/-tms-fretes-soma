# PRINCIPIOS — Linha de trabalho do Mikael

> Extraído do claude.json backup, das sessões do TMS e do README do repo.
> Última revisão: 2026-09-13

## 1. Conhecimento persistente

O contexto de trabalho não fica preso à sessão nem ao PC. Tudo relevante é registrado em:
- Central de Contexto (este repo) — para o Hermes/Claude acessar entre sessões e entre PCs
- Obsidian — para conhecimento estruturado de longo prazo
- Git — para histórico e sync entre os dois PCs

## 2. Migração incremental

Nunca reescrever do zero quando há um sistema funcional em produção. A migração V3 do TMS segue essa regra:
- Sistema atual (HTML/Chart.js + pipeline Python) continua rodando
- Novo sistema (Next.js + Supabase) é construído em paralelo, uma página de cada vez
- Validação campo a campo antes de avançar
- Rollback planejado para cada fase

## 3. Validação rigorosa

Números importam. Cada KPI, gráfico, tabela deve bater dígito a dígito com o sistema de referência antes de ser considerado pronto. Isso é mais importante que rapidez.

## 4. Decisões documentadas

Toda decisão de negócio ou técnica significativa é registrada em `decisoes/`. O motivo importa tanto quanto a decisão em si.

## 5. Diferença financeira ≠ potencial evitável

Uma decisão crítica do negócio do TMS: **não confundir diferença financeira identificada com potencialmente evitável**. Nem toda diferença entre frete cotado e contratado é uma oportunidade de economia — depende do contexto (Privado/Grupo, urgência, disponibilidade de transportadora, prazo).

## 6. Menor frete não é sempre melhor

Regras de contratação:
- Público: critério de preço é dominante, mas prazo e disponibilidade contam
- Privado: relação e confiabilidade podem pesar mais que preço
- Grupo: critérios próprio do grupo, não assumir regra universal

## 7. Tela de gestor

Existe uma tela de gestor no sistema atual com funcionalidades que precisam ser mapeadas e portadas conforme a migração avança.

## 8. Automação progressiva

O sistema TODO/Fretes Rápido tem automações existentes que precisam ser preservadas e, onde possível, aprimoradas — não substituídas sem benefício claro.

## 9. Segurança e acesso

- Supabase RLS ativo em todas as tabelas
- Policy de leitura pública temporária apenas durante a fase de desenvolvimento aberto
- Auth de admin inicial: mikaelantiqueira@gmail.com
- Credenciais nunca commitadas no Git

## 10. Trabalho entre dois PCs

Quando os dois PCs não estão na mesma rede, a sincronização via Git é a estratégia. O push/pull é a troca de contexto. O Claude Code aqui (MikaelAntiqueira) salva configuração em `.claude.json` e transcrições em `.claude/sessions/` — esses dados são a memória de trabalho.
