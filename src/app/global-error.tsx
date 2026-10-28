"use client";

import "./globals.css";

/**
 * Cuando falla hasta el marco de la aplicación: reemplaza al layout, así que trae su propio
 * documento. Lo mismo que `error.tsx`, más corto y sin depender de nada más.
 */
export default function ErrorGlobal({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es">
      <body className="flex min-h-dvh items-center justify-center px-4 py-10 font-sans">
        <title>Algo falló</title>
        <main className="flex w-full max-w-xl flex-col gap-4 rounded-[28px] bg-ficha p-6">
          <h1 className="text-2xl leading-tight font-extrabold">La aplicación no se pudo mostrar</h1>
          <p className="text-tenue">
            Algo falló al prepararla. Mira en la terminal donde corre qué dijo{error.digest ? <> (busca el código <code className="font-mono text-texto">{error.digest}</code>)</> : null}, y vuelve a intentarlo.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => retry()} className="min-h-11 rounded-full bg-realce px-4 text-sm font-bold">
              Intentar de nuevo
            </button>
            {/* Un enlace normal: recarga todo, por si lo que falló fue la navegación. */}
            <a href="/fabrica" className="flex min-h-11 items-center rounded-full bg-relieve px-4 text-sm font-bold">
              Ir a la planta
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
