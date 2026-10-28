// Solo servidor: el modelo Live2D de la portada. Es opcional: sin modelo, la portada queda con su
// vista simple. Hay dos maneras de ponerlo, y la primera gana:
//  - Indicar en Configuración › Portada la carpeta del modelo y dónde está el Core de Cubism, donde
//    ya estén en este equipo. Se guarda en datos/portada.json y la aplicación los sirve desde ahí
//    (`/api/portada/live2d/…`), sin copiarlos.
//  - Copiarlos a public/live2d/ (public/live2d/LEEME.md).
// El modelo y el Core no entran al repositorio: sus licencias son de otros.
import { promises as fs } from "node:fs";
import path from "node:path";
import { carpetaDeDatos } from "../datos.ts";

/** Donde se ponen el Core y el modelo copiados. Next sirve lo de `public/` en la raíz de la página. */
export const carpetaDeLive2D = () => path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "live2d");

/** El archivo del Core de Cubism, dentro de `core/`. */
export const ARCHIVO_DEL_CORE = "live2dcubismcore.min.js";
/** Hasta cuántos niveles de carpetas se busca el modelo dentro de su carpeta. */
const PROFUNDIDAD = 3;
/** Un nombre de archivo o carpeta que se puede poner en una dirección sin sorpresas. */
const NOMBRE_SEGURO = /^[\p{L}\p{N}][\p{L}\p{N} ._()-]*$/u;

/** Las direcciones con que la portada carga lo indicado en la configuración. */
export const URL_DEL_CORE_INDICADO = "/api/portada/live2d/core";
const URL_DEL_MODELO_INDICADO = "/api/portada/live2d/modelo";

/**
 * Lo que hay para la portada: el modelo listo para cargar (`url` del modelo y `core`, desde la raíz
 * de la página), un modelo sin el Core (`falta: "core"`), lo indicado en la configuración que ya no
 * está (`falta: "indicado"`, con el porqué), o nada (`null`).
 */
export type ModeloDeLaPortada =
  | { url: string; core: string; nombre: string }
  | { falta: "core"; nombre: string }
  | { falta: "indicado"; motivo: string }
  | null;

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

const esArchivo = async (ruta: string) => !!(await fs.lstat(ruta).catch(() => null))?.isFile();
const nombreDelModelo = (segmentos: string[]) => segmentos.at(-1)!.slice(0, -".model3.json".length);
const direccion = (base: string, segmentos: string[]) => `${base}/${segmentos.map(encodeURIComponent).join("/")}`;

/**
 * El modelo copiado a public/live2d/: el primer `*.model3.json` de `modelo/` por orden de su ruta,
 * si el Core de Cubism también está en `core/`. Solo mira nombres y si existen: no lee los archivos.
 */
export async function modeloEnPublic(base: string = carpetaDeLive2D()): Promise<ModeloDeLaPortada> {
  const [primero] = await modelosEn(path.join(base, "modelo"));
  if (!primero) return null;
  const nombre = nombreDelModelo(primero);
  if (!(await esArchivo(path.join(base, "core", ARCHIVO_DEL_CORE)))) return { falta: "core", nombre };
  return { url: direccion("/live2d/modelo", primero), core: `/live2d/core/${ARCHIVO_DEL_CORE}`, nombre };
}

// ---- Lo indicado en la configuración ------------------------------------------------------------

/**
 * Lo que él indicó: la carpeta del modelo, cuál de sus `*.model3.json` (relativo a ella, con «/») y
 * el archivo del Core. Las rutas son absolutas.
 */
export type Live2DIndicado = { carpeta: string; archivo: string; core: string };

const archivoDeLaPortada = () => path.join(carpetaDeDatos(), "portada.json");

/** Lo indicado en la configuración, o `null`. Unos datos rotos o a medias cuentan como nada. */
export async function leerLive2DIndicado(): Promise<Live2DIndicado | null> {
  try {
    const { live2d: l } = JSON.parse(await fs.readFile(archivoDeLaPortada(), "utf8")) as { live2d?: Partial<Live2DIndicado> };
    return l && typeof l.carpeta === "string" && typeof l.archivo === "string" && typeof l.core === "string" ? { carpeta: l.carpeta, archivo: l.archivo, core: l.core } : null;
  } catch {
    return null;
  }
}

async function guardar(live2d: Live2DIndicado | null) {
  await fs.mkdir(carpetaDeDatos(), { recursive: true });
  await fs.writeFile(archivoDeLaPortada(), JSON.stringify(live2d ? { live2d } : {}, null, 2) + "\n");
}

/**
 * El Core a partir de lo que él señaló: el archivo mismo, o una carpeta que lo tiene adentro o en
 * `Core/` (la del Cubism SDK for Web, tal como viene).
 */
async function coreDesde(ruta: string): Promise<string | null> {
  if (path.basename(ruta) === ARCHIVO_DEL_CORE && (await esArchivo(ruta))) return ruta;
  for (const candidato of [path.join(ruta, ARCHIVO_DEL_CORE), path.join(ruta, "Core", ARCHIVO_DEL_CORE)]) if (await esArchivo(candidato)) return candidato;
  return null;
}

/**
 * El modelo a partir de lo que él señaló: un `*.model3.json`, o una carpeta con uno adentro (el
 * primero por orden de su ruta, hasta tres niveles). Devuelve la carpeta y el archivo dentro de ella.
 */
async function modeloDesde(ruta: string): Promise<{ carpeta: string; segmentos: string[] } | null> {
  if (ruta.endsWith(".model3.json") && (await esArchivo(ruta))) return { carpeta: path.dirname(ruta), segmentos: [path.basename(ruta)] };
  const [primero] = await modelosEn(ruta);
  return primero ? { carpeta: ruta, segmentos: primero } : null;
}

/**
 * Guarda el modelo y el Core que él indicó, si están: no se guarda algo que la portada no podría
 * cargar. Cada uno puede ser el archivo o la carpeta que lo tiene.
 */
export async function indicarLive2D(modelo: string, core: string): Promise<{ hecho: true; indicado: Live2DIndicado } | { hecho: false; motivo: string }> {
  const m = modelo.trim();
  const c = core.trim();
  if (!m || !c) return { hecho: false, motivo: "Indica la carpeta del modelo y dónde está el Core de Cubism." };
  if (!path.isAbsolute(m) || !path.isAbsolute(c)) return { hecho: false, motivo: "Las rutas van completas, desde la unidad o la raíz." };
  const delModelo = await modeloDesde(path.resolve(m));
  if (!delModelo) return { hecho: false, motivo: `En ${m} no hay un *.model3.json, ni en sus carpetas hasta tres niveles. Tiene que ser un modelo de Cubism 3 o posterior.` };
  const delCore = await coreDesde(path.resolve(c));
  if (!delCore) return { hecho: false, motivo: `En ${c} no está ${ARCHIVO_DEL_CORE}: es el archivo de la carpeta Core del Cubism SDK for Web.` };
  const indicado = { carpeta: delModelo.carpeta, archivo: delModelo.segmentos.join("/"), core: delCore };
  await guardar(indicado);
  return { hecho: true, indicado };
}

/** Deja de usar lo indicado: la portada vuelve a public/live2d/ o a su vista simple. No borra nada del modelo. */
export async function quitarLive2DIndicado(): Promise<void> {
  await guardar(null);
}

/** Cómo está lo indicado ahora: listo para cargar, o por qué no. */
async function modeloIndicado(i: Live2DIndicado): Promise<ModeloDeLaPortada> {
  const segmentos = i.archivo.split("/");
  if (!(await archivoDelModelo(segmentos, i))) return { falta: "indicado", motivo: `ya no está ${path.join(i.carpeta, ...segmentos)}` };
  if (!(await archivoDelCore(i))) return { falta: "indicado", motivo: `ya no está ${i.core}` };
  return { url: direccion(URL_DEL_MODELO_INDICADO, segmentos), core: URL_DEL_CORE_INDICADO, nombre: nombreDelModelo(segmentos) };
}

/** El modelo de la portada: el indicado en la configuración, si hay uno; si no, el de public/live2d/. */
export async function modeloDeLaPortada(): Promise<ModeloDeLaPortada> {
  const indicado = await leerLive2DIndicado();
  return indicado ? modeloIndicado(indicado) : modeloEnPublic();
}

// ---- Los archivos que se sirven -------------------------------------------------------------------

/** Lo que un modelo de Cubism trae y la portada pide, con su tipo. Nada más se sirve. */
const TIPOS: Record<string, string> = {
  ".json": "application/json",
  ".moc3": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};
/** Hasta cuántas carpetas abajo se sirve un archivo del modelo. */
const NIVELES_SERVIDOS = 8;

/** Si `ruta` queda dentro de `base`, ya resueltos los enlaces de las dos. */
async function quedaDentro(base: string, ruta: string): Promise<boolean> {
  const [b, r] = await Promise.all([fs.realpath(base).catch(() => null), fs.realpath(ruta).catch(() => null)]);
  return !!b && !!r && r.startsWith(b.endsWith(path.sep) ? b : b + path.sep);
}

/**
 * Un archivo del modelo indicado, para servirlo: solo dentro de su carpeta (sin «..», sin lo
 * oculto, sin un enlace que lleve afuera) y solo de los tipos que trae un modelo. Si no, `null`.
 */
export async function archivoDelModelo(segmentos: string[], indicado?: Live2DIndicado | null): Promise<{ ruta: string; tipo: string } | null> {
  const i = indicado === undefined ? await leerLive2DIndicado() : indicado;
  if (!i || !segmentos.length || segmentos.length > NIVELES_SERVIDOS || !segmentos.every((s) => NOMBRE_SEGURO.test(s))) return null;
  const tipo = TIPOS[path.extname(segmentos.at(-1)!).toLowerCase()];
  if (!tipo) return null;
  const ruta = path.join(i.carpeta, ...segmentos);
  if (!(await quedaDentro(i.carpeta, ruta)) || !(await fs.stat(ruta).catch(() => null))?.isFile()) return null;
  return { ruta, tipo };
}

/** El Core indicado, para servirlo: el archivo guardado, si sigue siendo un archivo con ese nombre. */
export async function archivoDelCore(indicado?: Live2DIndicado | null): Promise<string | null> {
  const i = indicado === undefined ? await leerLive2DIndicado() : indicado;
  return i && path.basename(i.core) === ARCHIVO_DEL_CORE && (await esArchivo(i.core)) ? i.core : null;
}
