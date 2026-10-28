import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Nunito va en el repositorio (src/app/fuentes/): bajarla de Google al compilar falla en una red que lo bloquee.
const nunito = localFont({
  src: "./fuentes/nunito-latin.woff2",
  weight: "200 1000",
  style: "normal",
  variable: "--font-nunito",
});

// El nombre del programa. Es el único lugar del código que lo dice.
const NOMBRE_DEL_PROGRAMA = "La fábrica";

export const metadata: Metadata = {
  // Cada página pone lo suyo, y el nombre va detrás.
  title: { default: NOMBRE_DEL_PROGRAMA, template: `%s · ${NOMBRE_DEL_PROGRAMA}` },
  description: "Una fábrica de software con Claude Code: varias líneas, cada una con su cola de tareas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
