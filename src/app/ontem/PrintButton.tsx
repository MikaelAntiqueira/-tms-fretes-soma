"use client";

// Botão "Baixar PDF" (Opção A, pedido do Mikael 2026-09-21) + o CSS dos
// dois botões desta seção ("Baixar CSV" incluso, ver page.tsx). O
// <style> fica aqui em vez de globals.css de propósito: são só 4 classes
// novas, usadas só nesta seção — colocá-las num arquivo compartilhado de
// 52KB por todas as páginas seria mais risco (e mais difícil de revisar)
// do que precisar.
//
// window.print() aciona o diálogo nativo do navegador — a pessoa escolhe
// "Salvar como PDF". Sem biblioteca nova. O `@media print` esconde a
// sidebar/rodapé e preserva as cores de fundo dos pills/diferenças, que
// os navegadores removem por padrão ao imprimir.
export function PrintButton() {
  return (
    <>
      <style>{`
        .bloc-head-text { display: flex; flex-direction: column; gap: 2px; }
        .export-actions { display: flex; align-items: center; gap: 16px; }

        .export-link-btn {
          all: unset;
          cursor: pointer;
          color: var(--brand-700);
          font-weight: 600;
          font-size: 12px;
          font-family: var(--font-ibm-plex-sans), sans-serif;
        }
        .export-link-btn:hover { text-decoration: underline; }

        .export-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font: 600 12.5px var(--font-ibm-plex-sans), sans-serif;
          padding: 9px 16px;
          border-radius: var(--radius-sm);
          border: none;
          background: var(--brand-700);
          color: #fff;
          cursor: pointer;
        }
        .export-btn-primary:hover { background: var(--brand-900); }

        @media print {
          .no-print { display: none !important; }
          .sidebar, .sidebar-collapse-btn, .mobile-nav-toggle, .sidebar-scrim, .app-footer {
            display: none !important;
          }
          .with-sidebar { margin-left: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
      <button type="button" className="export-btn-primary" onClick={() => window.print()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Baixar PDF
      </button>
    </>
  );
}
