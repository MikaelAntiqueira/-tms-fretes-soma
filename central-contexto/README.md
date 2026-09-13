# Central de Contexto — Mikael Antiqueira

> Esta é a fonte da verdade de contexto para Hermes/Claude entre os dois PCs.
> Estrutura: https://github.com/MikaelAntiqueira/-tms-fretes-soma

## O que é

Central de Contexto é a camada intermediária entre o conhecimento (Obsidian) e o histórico (Git). O objetivo é que o contexto de trabalho não fique preso a uma sessão ou a um PC.

## Arquitetura

```
                    CENTRAL DE CONTEXTO
                            │
                 ┌──────────┴──────────┐
                 │                     │
              OBSIDIAN                 GIT
           conhecimento            histórico
                 │                     │
                 └──────────┬──────────┘
                            │
                     HERMES / CLAUDE
                            │
              ┌─────────────┴─────────────┐
              │                           │
             PC 1                        PC 2
              │                           │
              └───────────┬───────────────┘
                          │
                    MESMO CONTEXTO
```

## Como usar

1. **PC 1 (principal)**: trabaja a partir da Central. Após cada sessão significativa, o Hermes atualiza os arquivos aqui.
2. **Git**: cada atualização relevante é commitada e pushada.
3. **PC 2**: faz pull no início da sessão e trabalha com o mesmo contexto.

## Regras

- Alterações no conhecimento ficam no Obsidian.
- Alterações no estado do projeto, decisões, pendências e checkpoint ficam aqui.
- Nada de credenciais, tokens ou chaves neste diretório.
- Cada sessão cria um checkpoint em `checkpoints/`.
- Sincronização via `git pull`/`git push`.
