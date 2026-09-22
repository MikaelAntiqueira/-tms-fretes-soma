"use client";

// Indicador de sessão no rodapé da sidebar — infraestrutura de Supabase
// Auth ([TASK-29] Fase 6, 2026-09-12). Componente isolado (não mexe na
// lógica do DashboardShell.tsx) para manter a edição desse arquivo mínima
// — ele também é tocado por outro agente em paralelo (motor de filtro
// global). Puramente INFORMATIVO nesta etapa: mostra "Visitante" sem
// sessão, ou o e-mail + botão "Sair" com sessão ativa — não bloqueia nem
// redireciona ninguém (isso só faria sentido depois que as policies
// públicas temporárias forem removidas, decisão futura do Mikael, ver
// README). O site inteiro continua 100% acessível sem login.
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export function SessionIndicator() {
  // undefined = ainda checando a sessão (evita "piscar" Visitante -> e-mail
  // no primeiro render); null = sem sessão; string = e-mail logado.
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      // env vars ausentes em runtime — cai pra "Visitante" em vez de travar em "checando"
      setEmail(null);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setEmail(data.session?.user.email ?? null);
      })
      .catch(() => {
        if (active) setEmail(null);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setEmail(null);
  }

  if (email === undefined) {
    return <div className="sidebar-session" aria-hidden="true" />;
  }

  return (
    <div className="sidebar-session">
      {email ? (
        <>
          <span className="who" title={email}>
            <strong>{email}</strong>
          </span>
          <button type="button" className="link-btn" onClick={handleSignOut}>
            Sair
          </button>
        </>
      ) : (
        <span className="who">Visitante</span>
      )}
    </div>
  );
}
