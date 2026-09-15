# Comando para o Claude Code (via navegador) — configurar env vars na Vercel

> Cole isto pro Claude Code no seu PC. Ele precisa de controle de navegador
> (Chrome/Playwright) e de você logado na Vercel no navegador que ele vai usar.

## Contexto (não pular — isso é o motivo real do "This page couldn't load")

O projeto Vercel **`tms-fretes-soma-app`** (o que está de fato conectado ao
repositório `github.com/MikaelAntiqueira/-tms-fretes-soma` e fazendo deploy
automático a cada push) **não tem as variáveis de ambiente do Supabase
configuradas**. Isso derrubou o build mais recente por completo (ver
commit `e0292c5` e decisão [D-29] em `central-contexto/decisoes/LOG_DECISOES.md`
pro histórico técnico completo).

Existe um SEGUNDO projeto na mesma conta Vercel, chamado **`tms-fretes-soma`**
(sem "-app"), que JÁ TEM essas variáveis configuradas — mas não é ele que
recebe os deploys automáticos do GitHub. Não mexer nesse segundo projeto por
enquanto; só documentando pra não confundir os dois nomes parecidos.

## Passo a passo

1. Abrir **https://vercel.com/dashboard**, confirmar que está logado como
   `MikaelAntiqueira`.
2. Entrar no projeto **`tms-fretes-soma-app`** (atenção ao nome — NÃO é o
   `tms-fretes-soma` sem sufixo).
3. Ir em **Settings → Environment Variables**.
4. Clicar em **Add New** e criar a primeira variável:
   - **Key**: `NEXT_PUBLIC_SUPABASE_URL`
   - **Value**: `https://jpoizkylaffircimxzrq.supabase.co`
   - Marcar os 3 ambientes: **Production**, **Preview**, **Development**
   - Salvar
5. Clicar em **Add New** de novo e criar a segunda:
   - **Key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwb2l6a3lsYWZmaXJjaW14enJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxMjI4MTgsImV4cCI6MjEwNDY5ODgxOH0.xFKDOcla5CPFaAV53jwgZdgr7VXU3Fdu5YIQxXOl_Hc`
   - Marcar os mesmos 3 ambientes
   - Salvar
6. Ir em **Deployments**, abrir o deployment mais recente (deve estar
   marcado como "Error" — commit `e0292c5` ou mais novo).
7. Clicar nos "..." (ou botão Redeploy) → **Redeploy**. Não precisa
   marcar "Use existing Build Cache" nem desmarcar — tanto faz, já que a
   causa era env var faltando, não cache.
8. Esperar o build terminar (normalmente ~1 min) e confirmar que o status
   virou **Ready** (verde), não **Error**.
9. Testar `https://tms-fretes-soma-app.vercel.app` (ou o domínio de produção
   que aparecer na aba Deployments) — todas as páginas devem carregar,
   inclusive `/operacao` e `/oportunidades`.

## Se der errado

- Se pedir confirmação de "Redeploy to Production", confirmar.
- Se o build falhar de novo com outro erro, ler o **Build Logs** e reportar
  o texto do erro — não é mais o problema de env var (esse já está
  documentado e resolvido no código, commit `e0292c5`).
- Se `tms-fretes-soma-app` não existir mais nessa conta/nome, procurar pelo
  projeto que aparece com o ícone do GitHub conectado ao repo
  `MikaelAntiqueira/-tms-fretes-soma` — pode ter sido renomeado.
