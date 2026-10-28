import type { Hallazgo } from "@/lib/fabrica/memoria/formato";
import type { MemoriaALaVista } from "@/lib/fabrica/memoria/pantalla";

/** Lo que contesta la ruta de la memoria. */
export type ContestadoPorLaMemoria = { nota?: string; error?: string; avisos?: string[]; memoria?: MemoriaALaVista; hallazgos?: Hallazgo[] };

async function leer(r: Promise<Response>): Promise<ContestadoPorLaMemoria & { ok: boolean }> {
  try {
    const respuesta = await r;
    const d = ((await respuesta.json().catch(() => null)) ?? {}) as ContestadoPorLaMemoria;
    return { ...d, ok: respuesta.ok, ...(respuesta.ok || d.error ? {} : { error: "La aplicación no lo hizo." }) };
  } catch {
    return { ok: false, error: "La aplicación no responde." };
  }
}

/** Pide un cambio a la memoria. Nunca lanza: si la aplicación no responde, lo dice como error. */
export const enLaMemoria = (cuerpo: Record<string, unknown>) =>
  leer(fetch("/api/fabrica/memoria", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }));

/** Busca en todo un vault. */
export const buscarEnElVault = (en: string, texto: string) => leer(fetch(`/api/fabrica/memoria?en=${encodeURIComponent(en)}&buscar=${encodeURIComponent(texto)}`));
