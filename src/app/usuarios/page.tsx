import Link from "next/link";
import { requireAdmin, createSupabaseServerClient } from "@/lib/supabase-server";
import { PageHeader } from "@/components/PageHeader";
import { UsuariosClient, type UsuarioRow } from "./UsuariosClient";

// Página "Usuários" — área administrativa pedida pelo Mikael (2026-09-21).
// Três ações: "criar usuário" (e-mail + senha provisória definida pelo
// admin, via POST /api/usuarios/criar — usa a service_role key, service
// dedicado em src/lib/supabase-admin.ts), "trocar papel" (admin <-> user,
// via RPC admin_trocar_role) e "remover acesso" (POST /api/usuarios/excluir,
// também service_role — auth.admin.deleteUser). Resetar senha fica para uma
// entrega futura.
//
// Sem campo de nome/matrícula (e-mail já identifica os usuários de hoje) e
// sem log de auditoria — decisão deliberada do Mikael para manter o escopo
// enxuto nesta etapa.
//
// Protegida por requireAdmin() (não só requireUser()), mesmo padrão de
// /importar — só role='admin' (D-12) pode ver e alterar papéis de outros
// usuários.
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await requireAdmin("/usuarios");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_listar_usuarios");

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="app-shell">
      <PageHeader title="Usuários" crumbs={<Link href="/">← Visão Geral</Link>} />

      <main className="content">
        <UsuariosClient rows={(data ?? []) as UsuarioRow[]} currentUserId={user.id} />
      </main>

      <footer className="app-footer">
        Área administrativa — só visível/acessível pra quem tem role &quot;admin&quot;.
      </footer>
    </div>
  );
}
