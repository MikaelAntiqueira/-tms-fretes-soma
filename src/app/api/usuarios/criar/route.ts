import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// POST /api/usuarios/criar — cria um novo usuário com e-mail + senha
// provisória definida pelo próprio admin na tela /usuarios (2026-09-21,
// decisão do Mikael: evitar depender do e-mail de convite padrão do
// Supabase, já que este projeto não tem SMTP customizado configurado —
// corre risco de atraso/spam/limite de envio). `email_confirm: true`
// deixa a conta já ativa, sem etapa de confirmação por e-mail. O role
// inicial vem de handle_new_user() (D-12: sempre 'user' aqui — só
// mikaelantiqueira@gmail.com nasce admin; promoção depois via
// admin_trocar_role em /usuarios).
//
// Rota separada (não Server Action) porque precisa da service_role key
// (createSupabaseAdminClient) — isolar num Route Handler deixa claro que
// esse código só roda no servidor, nunca é enviado ao navegador.
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
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const senha = typeof body?.senha === "string" ? body.senha : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (senha.length < 6) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: created.user?.id, email: created.user?.email });
}
