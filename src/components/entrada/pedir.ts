import type { EntradaALaVista } from "@/lib/entrada/acciones";

/** Lo que contesta la ruta de la Entrada a una acción. */
export type Contestado = { nota?: string; error?: string; errores?: Record<string, string>; tarea?: { linea: string; id: string; titulo: string }; entrada?: EntradaALaVista };

/** Pide una acción a la Entrada. Nunca lanza: si la aplicación no responde, lo dice como error. */
export async function enLaEntrada(cuerpo: Record<string, unknown>): Promise<Contestado & { ok: boolean }> {
  try {
    const r = await fetch("/api/fabrica/entrada", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
    const d = ((await r.json().catch(() => null)) ?? {}) as Contestado;
    return { ...d, ok: r.ok, ...(r.ok || d.error ? {} : { error: "La aplicación no lo hizo." }) };
  } catch {
    return { ok: false, error: "La aplicación no responde." };
  }
}

export const BOTON = "min-h-10 pointer-coarse:min-h-11 flex-none rounded-full bg-relieve px-4 text-sm font-bold disabled:opacity-45";
export const PRINCIPAL = `${BOTON} bg-realce`;
export const CAMPO = "min-h-10 pointer-coarse:min-h-11 w-full rounded-2xl bg-relieve px-3.5 text-sm text-texto outline-none placeholder:text-tenue focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-papel aria-[invalid=true]:outline-2 aria-[invalid=true]:outline-solid aria-[invalid=true]:outline-aviso";
export const ETIQUETA = "flex flex-col gap-1.5 text-sm font-bold";
