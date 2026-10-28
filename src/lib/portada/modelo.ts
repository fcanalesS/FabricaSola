// Solo servidor: el modelo Live2D que alguien puso para la portada (public/live2d/LEEME.md).
// Es opcional: sin modelo, la portada queda con su vista simple. El modelo y el Core de Cubism no
// entran al repositorio (sus licencias son de otros): cada quien pone los suyos en public/live2d/.
import { promises as fs } from "node:fs";
import path from "node:path";

/** Donde se ponen el Core y el modelo. Next sirve lo de `public/` en la raíz de la página. */
export const carpetaDeLive2D = () => path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "live2d");

/** El archivo del Core de Cubism, dentro de `core/`. */
export const ARCHIVO_DEL_CORE = "live2dcubismcore.min.js";
/** Hasta cuántos niveles de carpetas se busca el modelo dentro de `modelo/`. */
const PROFUNDIDAD = 3;
/** Un nombre de archivo o carpeta que se puede poner en una dirección sin sorpresas. */
const NOMBRE_SEGURO = /^[\p{L}\p{N}][\p{L}\p{N} ._()-]*$/u;

/**
 * Lo que hay para la portada: el modelo listo para cargar (`url`, desde la raíz de la página), un
 * modelo sin el Core (`falta`), o nada (`null`).
 */
export type ModeloDeLaPortada = { url: string; nombre: string } | { falta: "core"; nombre: string } | null;

/** Los `*.model3.json` bajo esa carpeta, con su ruta relativa, en orden. No sigue enlaces ni entra a lo oculto. */
async function modelosEn(dir: string, rel: string[] = [], nivel = 0): Promise<string[][]> {
  const entradas = await fs.readdir(path.join(dir, ...rel), { withFileTypes: true }).catch(() => []);
  const out: string[][] = [];
  for (const e of entradas.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (!NOMBRE_SEGURO.test(e.name) || e.isSymbolicLink()) continue;
    if (e.isFile() && e.name.endsWith(".model3.json")) out.push([...rel, e.name]);
    else if (e.isDirectory() && nivel < PROFUNDIDAD - 1) out.push(...(await modelosEn(dir, [...rel, e.name], nivel + 1)));
  }
  return out;
}

/** Si el Core está, como archivo común. */
async function hayCore(base: string) {
  const s = await fs.lstat(path.join(base, "core", ARCHIVO_DEL_CORE)).catch(() => null);
  return !!s && s.isFile();
}

/**
 * El modelo de la portada: el primer `*.model3.json` de `modelo/` por orden de su ruta, si el Core
 * de Cubism también está. Solo mira nombres y si existen: no lee los archivos.
 */
export async function modeloDeLaPortada(base: string = carpetaDeLive2D()): Promise<ModeloDeLaPortada> {
  const [primero] = await modelosEn(path.join(base, "modelo"));
  if (!primero) return null;
  const nombre = primero.at(-1)!.slice(0, -".model3.json".length);
  if (!(await hayCore(base))) return { falta: "core", nombre };
  return { url: `/live2d/modelo/${primero.map(encodeURIComponent).join("/")}`, nombre };
}
