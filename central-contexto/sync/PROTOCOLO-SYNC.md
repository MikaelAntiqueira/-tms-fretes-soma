# Protocolo de sincronização entre PCs

> Como manter o contexto sincronizado quando os dois PCs não estão na mesma rede.
> Última atualização: 2026-09-13

## Visão geral

A Central de Contexto vive neste repositório (`-tms-fretes-soma`). Qualquer alteração relevante é commitada e pushada, e o outro PC puxa via `git pull`.

```
PC 1 (principal)                    PC 2
     │                                  │
     │  edita arquivos da Central       │
     │  commit + push                   │
     ▼                                  ▼
  GitHub (repo privado) ◄──────────── pull
```

## Fluxo de trabalho

### No PC 1 (principal)

```bash
# 1. Editar arquivos da Central
# 2. Commitar
git add central-contexto/
git commit -m "Atualiza contexto: <resumo>"

# 3. Push
git push origin main
```

### No PC 2 (quando sincronizar)

```bash
# 1. Na pasta do projeto
cd caminho/do/-tms-fretes-soma

# 2. Pull das atualizações
git pull origin main

# 3. Ler os arquivos atualizados da Central
#    PERFIL.md, PRINCIPIOS.md, INSTRUCOES-HERMES.md,
#    projetos/estado-atual.md, pendencias/PENDENTES.md,
#    decisoes/LOG_DECISOES.md
```

## O que sincronizar

- **PERFIL.md** — atualizado quando há mudança no perfil ou ferramentas
- **PRINCIPIOS.md** — atualizado quando princípio muda
- **INSTRUCOES-HERMES.md** — atualizado quando instrução muda
- **projetos/estado-atual.md** — atualizado a cada alteração relevante no estado do projeto
- **pendencias/PENDENTES.md** — atualizado quando tarefa é criada, concluída ou modificada
- **decisoes/LOG_DECISOES.md** — atualizado quando decisão é tomada
- **checkpoints/** — sessões criadas aqui, atualizadas a cada sessão
- **sync/historico-sincronizacao.md** — registrado a cada sync entre PCs

## O que NÃO sincronizar

- Credenciais, tokens, chaves (já fora do git por .gitignore)
- Dados do Supabase (banco externo)
- Node modules, build outputs (.next, dist)
- Arquivos de sessão do Claude Code (.claude/sessions/) — são locais, não sync

## .gitignore já cobre

Veja `.gitignore` na raiz do repo. Ele já ignora:
- `/node_modules`, `/.next`, `/out`, `/build`
- `*.env*` (exceto `.env*.example`)
- `package-lock.json` (por decisão desta fase)
- `*.pem`, logs de debug

## Quando os PCs estão na mesma rede

Se ambos estão na mesma rede e tem acesso ao arquivo, pode-se usar compartilhamento de rede ou uma pasta sync direta. Mas o Git continua sendo a estratégia preferencial para garantir rastreabilidade e não depender de conexão contínua.

## Regras de conflito

- Se o mesmo arquivo foi editado nos dois PCs, o `git pull` vai mostrar conflito
- Resolver conflito manualmente, preferindo a versão mais recente e completa
- Após resolver, commit e push para sincronizar novamente
- Para evitar conflitos, comunicar antes de editar o mesmo arquivo em ambos os PCs quando possível

## Histórico de sincronização

Veja `sync/historico-sincronizacao.md` para o registro das sincronizações entre PCs.
