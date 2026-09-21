"use client";

// Botão "Baixar PDF" (Opção A, pedido do Mikael 2026-09-21): aciona o
// print nativo do navegador — a pessoa escolhe "Salvar como PDF" no
// diálogo. Sem biblioteca nova; o layout de impressão vem do bloco
// `@media print` em globals.css.
export function PrintButton() {
  return (
    <button type="button" className="export-btn-primary" onClick={() => window.print()}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      Baixar PDF
    </button>
  );
}
