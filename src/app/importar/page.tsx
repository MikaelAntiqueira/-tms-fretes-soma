import Link from "next/link";
import { requireAdmin } from "@/lib/supabase-server";
import { PageHeader } from "@/components/PageHeader";
import { ImportarClient } from "./ImportarClient";

// Página "Importar Dados" — área administrativa pedida pelo Mikael
// (2026-09-16): hoje não existe NENHUM jeito de atualizar cotacoes/ofertas/
// contratacoes/clientes/transportadoras depois da carga histórica única de
// 2026-09-11 (confirmado direto no banco: todas as linhas têm o mesmo
// `inserido_em`, numa janela de segundos, e nada mudou desde então). Esta
// página fecha essa lacuna com a opção mais simples/rápida que ele pediu
// ("preciso de algo prático" / "rápido toda a manhã"): ele sobe os 3
// arquivos que o `ATUALIZAR AUTOMATICO.bat` já gera automaticamente na pasta
// `codigo/` (cotacoes_reais.json, contratados_reais.json, cnpj_to_info.json)
// — nenhum passo extra além do que ele já faz hoje.
//
// A transformação (src/lib/importacao.ts) é uma porta fiel de
// codigo/load_to_supabase.py, o script que já fez a carga histórica de
// 2026-09-11 com sucesso (mesmas regras de negócio, mesma estratégia de
// idempotência: TRUNCATE explícito de cotacoes/ofertas/contratacoes antes de
// recarregar — "rodar de novo == recarregar do zero, nunca duplica";
// clientes/transportadoras via upsert). As RPCs importar_iniciar()/
// importar_lote_*()/importar_finalizar() (migrations fn_importar_carga_
// completa + fix_importar_transportadoras_upsert_por_nome) fazem o mesmo
// trabalho que load_to_supabase.py fazia gerando arquivos .sql pra um agente
// executar — só que direto do navegador, autenticado como o próprio Mikael,
// sem precisar de nenhum agente no meio.
//
// Protegida por requireAdmin() (não só requireUser()) — só role='admin'
// (D-12) pode truncar as tabelas de fato do sistema inteiro.
//
// [CONTEXTO, Mikael 2026-09-16] Esta ponte (planilha Excel/JSON local +
// upload manual) existe só porque não foi encontrada, até agora, uma
// alternativa mais rápida pra execução do projeto — é deliberadamente
// simples, não uma arquitetura definitiva. Se no futuro o TMS/ERP passar a
// oferecer uma fonte de dados já pronta (API ou export direto, sem precisar
// gerar nem subir nada manualmente), a expectativa é substituir esta página
// por essa fonte, não sofisticá-la.
export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  await requireAdmin("/importar");

  return (
    <div className="app-shell">
      <PageHeader title="Importar Dados" crumbs={<Link href="/">← Visão Geral</Link>} />

      <main className="content">
        <ImportarClient />
      </main>

      <footer className="app-footer">
        Área administrativa — só visível/acessível pra quem tem role &quot;admin&quot;.
      </footer>
    </div>
  );
}
