import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// POST /api/usuarios/excluir — remove o acesso de um usuário (auth.users +
// profiles via ON DELETE CASCADE). Rota separada (não Server Action), mesmo
// motivo de /api/usuarios/criar: precisa da service_role key
// (createSupabaseAdminClient), isolar num Route Handler deixa claro que esse
// código só roda no servidor, nunca é enviado ao navegador.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";

  if (!id) {
    return NextResponse.json({ error: "id do usuário é obrigatório." }, { status: 400 });
  }
  if (id === user.id) {
    return NextResponse.json({ error: "Você não pode remover o seu próprio acesso." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id });
}
