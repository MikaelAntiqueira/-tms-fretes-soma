"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

// Client component: as três ações interativas da página /usuarios —
// criar usuário (POST /api/usuarios/criar, precisa da service_role key,
// por isso passa por um Route Handler), trocar papel admin/usuário (RPC
// admin_trocar_role, migration fn_admin_listar_usuarios_e_trocar_role,
// só usa a sessão normal do admin) e remover acesso (POST
// /api/usuarios/excluir, também via service_role — auth.admin.deleteUser,
// o ON DELETE CASCADE de profiles.id cuida do resto). Resetar senha fica
// para uma entrega futura.
export interface UsuarioRow {
  id: string;
  email: string;
  role: string;
  criado_em: string;
  ultimo_acesso: string | null;
}

const CARACTERES_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function gerarSenha(tamanho = 10): string {
  let s = "";
  for (let i = 0; i < tamanho; i++) {
    s += CARACTERES_SENHA[Math.floor(Math.random() * CARACTERES_SENHA.length)];
  }
  return s;
}

function fmtData(iso: string | null): string {
  if (!iso) return "Nunca acessou";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function UsuariosClient({
  rows: initialRows,
  currentUserId,
}: {
  rows: UsuarioRow[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState(initialRows);

  // --- Criar usuário ---
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState<string | null>(null);
  const [sucessoCriar, setSucessoCriar] = useState<string | null>(null);

  async function criarUsuario(e: FormEvent) {
    e.preventDefault();
    setErroCriar(null);
    setSucessoCriar(null);
    setCriando(true);
    try {
      const res = await fetch("/api/usuarios/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar usuário.");

      setRows((prev) => [
        ...prev,
        {
          id: data.id as string,
          email: data.email as string,
          role: "user",
          criado_em: new Date().toISOString(),
          ultimo_acesso: null,
        },
      ]);
      setSucessoCriar(
        `Usuário ${data.email} criado e já pode entrar. Combine a senha com a pessoa por fora daqui — ela não fica salva em lugar nenhum.`
      );
      setEmail("");
      setSenha("");
    } catch (err) {
      setErroCriar(err instanceof Error ? err.message : "Erro desconhecido ao criar usuário.");
    } finally {
      setCriando(false);
    }
  }

  // --- Trocar papel ---
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [erroRole, setErroRole] = useState<string | null>(null);

  async function trocarRole(id: string, novoRole: string) {
    setErroRole(null);
    setLoadingId(id);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.rpc("admin_trocar_role", { p_user_id: id, p_role: novoRole });
    setLoadingId(null);
    if (error) {
      setErroRole(error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, role: novoRole } : r)));
  }

  // --- Remover acesso ---
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [erroRemover, setErroRemover] = useState<string | null>(null);

  async function removerAcesso(id: string, email: string) {
    if (!window.confirm(`Remover o acesso de ${email}? Essa ação não pode ser desfeita.`)) return;
    setErroRemover(null);
    setRemovendoId(id);
    try {
      const res = await fetch("/api/usuarios/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao remover acesso.");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setErroRemover(err instanceof Error ? err.message : "Erro desconhecido ao remover acesso.");
    } finally {
      setRemovendoId(null);
    }
  }

  return (
    <>
      <form onSubmit={criarUsuario} className="bloc" style={{ marginTop: 0, marginBottom: 20 }}>
        <div className="bloc-head">
          <h2>Criar usuário</h2>
          <div className="desc">
            Define e-mail e uma senha provisória — a conta já nasce ativa, sem precisar confirmar
            nada por e-mail. Combine a senha com a pessoa por fora (WhatsApp etc.).
          </div>
        </div>

        {erroCriar && (
          <div className="status-banner erro" style={{ marginBottom: 12 }}>
            {erroCriar}
          </div>
        )}
        {sucessoCriar && (
          <div className="status-banner" style={{ marginBottom: 12 }}>
            {sucessoCriar}
          </div>
        )}

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-field" style={{ minWidth: 240 }}>
            <label htmlFor="novo-email">E-mail</label>
            <input
              id="novo-email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-field" style={{ minWidth: 200 }}>
            <label htmlFor="nova-senha">Senha provisória</label>
            <input
              id="nova-senha"
              type="text"
              autoComplete="off"
              required
              minLength={6}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          <button type="button" className="tab-btn" onClick={() => setSenha(gerarSenha())}>
            Gerar senha
          </button>
          <button type="submit" className="form-submit-btn" disabled={criando}>
            {criando ? "Criando…" : "Criar usuário"}
          </button>
        </div>
      </form>

      <section className="bloc" style={{ marginTop: 0 }}>
        {erroRole && (
          <div className="status-banner erro" style={{ marginBottom: 14 }}>
            {erroRole}
          </div>
        )}
        {erroRemover && (
          <div className="status-banner erro" style={{ marginBottom: 14 }}>
            {erroRemover}
          </div>
        )}
        <table className="data">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Criado em</th>
              <th>Último acesso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSelf = r.id === currentUserId;
              const novoRole = r.role === "admin" ? "user" : "admin";
              return (
                <tr key={r.id}>
                  <td>{r.email}</td>
                  <td>
                    <span className={`pill ${r.role === "admin" ? "s" : "sc"}`}>
                      {r.role === "admin" ? "Administrador" : "Usuário"}
                    </span>
                  </td>
                  <td>{fmtData(r.criado_em)}</td>
                  <td>{fmtData(r.ultimo_acesso)}</td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="tab-btn"
                      disabled={isSelf || loadingId === r.id}
                      title={isSelf ? "Você não pode alterar seu próprio papel." : undefined}
                      onClick={() => trocarRole(r.id, novoRole)}
                    >
                      {loadingId === r.id ? "Salvando…" : novoRole === "admin" ? "Tornar admin" : "Tornar usuário"}
                    </button>
                    <button
                      type="button"
                      className="tab-btn"
                      disabled={isSelf || removendoId === r.id}
                      title={isSelf ? "Você não pode remover o seu próprio acesso." : undefined}
                      onClick={() => removerAcesso(r.id, r.email)}
                    >
                      {removendoId === r.id ? "Removendo…" : "Remover acesso"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
