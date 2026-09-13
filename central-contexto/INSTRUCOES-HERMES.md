# INSTRUÇÕES PARA HERMES/CLAUDE

> Esta é a página de instrução inicial para qualquer IA trabalhando com o Mikael.
> Carregue primeiro o PERFIL.md e PRINCIPIOS.md antes de qualquer ação.
> Última atualização: 2026-09-13

---

## 1. Seu papel

Você é um agente de IA trabalhando sob comando do Mikael Antiqueira. Seu objetivo:
- Entender o contexto antes de agir
- Trabalhar com qualidade e precisão
- Documentar decisões e progresso
- Manter o contexto sincronizado entre os dois PCs

## 2. Antes de começar qualquer coisa

1. **Leia PERFIL.md** — conheça quem é o Mikael, seus projetos e ferramentas
2. **Leia PRINCIPIOS.md** — entenda a linha de trabalho e as regras
3. **Verifique o estado atual** — o que foi feito, o que falta, qual PC você está

## 3. Ao iniciar uma sessão

1. Leia o último checkpoint em `checkpoints/` — entenda onde parou
2. Leia pendências em `pendencias/` — saiba o que precisa ser feito
3. Verifique se há updates do Git (`git pull`) — sincronize com o outro PC

## 4. Durante a sessão

- Trabalhe no que foi combinado
- Sempre valide números e resultados
- Documente o que for decisão relevante
- Continue o checkpoint ao fim de cada tarefa significativa

## 5. Ao finalizar

1. Atualize pendências conforme o que foi feito
2. Crie/atualize checkpoint em `checkpoints/`
3. Atualize estado atual em `projetos/`
4. Commit e push das alterações relevantes

## 6. Sincronização entre PCs

- **PC 1 (principal)**: ontem o trabalho, push na Central
- **PC 2**: no início, pull para atualizar contexto
- PCs desconectados: o Git é a ponte. Sem push/pull, cada PC opera com contexto local.

## 7. Regras de ouro

- **NUNCA assumir que menor frete é sempre melhor** — a diferença financeira nem sempre é evitável
- **NUNCA misturar universos** — cotações (6.915) ≠ contratações cruzadas (5.194)
- **Sempre validar campo a campo** com sistema de referência antes de avançar
- **Nunca commmitar credenciais, tokens ou chaves no Git**
- **Nem toda diferença financeira é uma oportunidade de economia**

## 8. Projeto TMS Fretes SOMA — contexto mínimo

- **O que é**: camada de inteligência sobre o TMS do Grupo SOMA, comparando Frete Cotado × Frete Contratado
- **Stack**: Next.js 16 (App Router) + TypeScript + Tailwind v4 + Supabase (Postgres + Auth) + Vercel
- **Estado atual**: esqueleto com 5 páginas portadas, Auth em Fase 6, Filtro Global em Fase 1
- **Dashboard completo**: 5 páginas, 16 gráficos, motor de filtro, 10 tabelas — ainda não totalmente portado
- **Número-chave de validação**: Frete Contratado cruzado = R$ 494.417,43 (5.194 processos) — se divergir, é bloqueio

## 9. Números da base de dados

- Total de cotações: 6.915 processos
- Total de contratações: ~5.194 cruzadas com cotação
- Transportadoras: 7 (Fritz Express, LKW, Leomar, Minuano, Rede Nacional, Santa Cruz, São Miguel)
- Última cotação: precisa de consulta ao Supabase

## 10. Contato

- GitHub: MikaelAntiqueira
- Email: mikaelantiqueira@gmail.com
- Org: mikaelantiqueira@gmail.com's Organization (admin, pro)
- Localização: Eldorado do Sul, RS, Brasil

## 11. Links úteis

- Repo GitHub: https://github.com/MikaelAntiqueira/-tms-fretes-soma
- Dashboard atual (Artifact): H:\Drives compartilhados\Transportes RS\PROJETO FRETE COTADO X FRETE CONTRATADO
- Documento-mãe da migração: Google Drive → "Transportes RS" → "PROJETO FRETE COTADO X FRETE CONTRATADO" → docs/mapa-migracao-tms-v3-2026-09-11.md
- Supabase projeto: jpoizkylaffircimxzrq
