import { ImageResponse } from "next/og";

// Favicon gerado dinamicamente pelo Next.js (convenção `src/app/icon.tsx` do
// App Router — https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons),
// em vez de um arquivo binário de verdade. Motivo: as ferramentas de escrita
// desta migração (`mcp__github__push_files`/`create_or_update_file`) só
// aceitam texto puro — qualquer arquivo binário (PNG/ICO) vira base64
// corrompido/duplicado ao ser publicado por elas (mesmo problema já resolvido
// pra logo, ver `src/components/soma-logo.ts`). Um ícone gerado por código
// (`ImageResponse`) é sempre texto, então é o caminho seguro aqui.
//
// Achado 2026-09-12: produção retornava 404 em `/favicon.ico` (nenhum ícone
// de aba jamais existiu no Next.js) — item de polimento visual, mesma
// categoria da logo faltando (CHANGE-054).
//
// Desenho: quadrado arredondado com o mesmo gradiente do cabeçalho da
// página inicial (`.app-header`, `linear-gradient(150deg, --brand-900,
// --brand-700 65%, --brand-500)`) e um "S" branco bold — não é a logo
// completa "Grupo SOMA Hospitalar" (o wordmark é ilegível em 16-32px, um
// favicon precisa de uma marca simples), é a inicial do grupo na mesma
// paleta de cor da marca.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
          background: "linear-gradient(150deg, #005285, #088cb3 65%, #329dbb)",
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#ffffff",
            fontFamily: "Arial, sans-serif",
          }}
        >
          S
        </span>
      </div>
    ),
    { ...size }
  );
}
