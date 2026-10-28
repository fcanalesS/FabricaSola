"use client";

import { BOTON_DEL_AVISO, PantallaDeAviso } from "@/components/fabrica/aviso";

/**
 * Cuando una página se cae: dice que falló, cómo seguir y con qué código buscarlo en la terminal
 * donde corre la aplicación. En desarrollo muestra el mensaje; en producción, Next no lo manda al
 * navegador (podría traer una ruta o un dato), y queda solo el código.
 */
export default function ErrorDeLaPagina({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const enDesarrollo = process.env.NODE_ENV === "development";
  return (
    <PantallaDeAviso
      titulo="Esta página no se pudo mostrar"
      acciones={
        <button type="button" onClick={() => retry()} className={`${BOTON_DEL_AVISO} bg-realce`}>
          Intentar de nuevo
        </button>
      }
    >
      <p>Algo falló al prepararla. Lo demás de la fábrica sigue andando: una corrida o un proceso en marcha no se detiene por esto.</p>
      <p>Si vuelve a pasar, mira en Este equipo si falta algo, y en la terminal donde corre la aplicación qué dijo{error.digest ? <> (busca el código <code className="font-mono text-texto">{error.digest}</code>)</> : null}.</p>
      {enDesarrollo && error.message && <p className="rounded-2xl bg-relieve px-4 py-3 font-mono text-sm break-words text-texto">{error.message}</p>}
    </PantallaDeAviso>
  );
}
