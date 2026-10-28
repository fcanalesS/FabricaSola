import path from "node:path";

/**
 * Las líneas de producción: cada una es un proyecto con su `factory/`. La
 * fábrica es una sola y trabaja varias; lo que entra (un documento, la deuda,
 * el formulario, un issue) va siempre a una línea por su id. Un id que no
 * existe es un error, nunca otra línea.
 *
 * Antes de esto la aplicación miraba un solo proyecto (`raiz` en los ajustes):
 * esos ajustes se leen como una línea, la activa, sin perder nada. Es lógica pura.
 */

export type Linea = { id: string; nombre: string; raiz: string };

/** Lo que de los ajustes guardados toca a las líneas, tal como puede venir del disco. */
export type AjustesDeLineas = { raiz?: unknown; lineas?: unknown; lineaActiva?: unknown };

const LARGO_DE_ID = 40;

/** El nombre de la carpeta del proyecto, que es como se ve la línea. */
export const nombreDeCarpeta = (raiz: string) => raiz.split(/[\\/]/).filter(Boolean).at(-1) ?? raiz;

/** Dos rutas son el mismo proyecto. En Windows no importan las mayúsculas. */
export function mismaRaiz(a: string, b: string, plataforma: NodeJS.Platform = process.platform): boolean {
  const normal = (r: string) => {
    const abs = path.resolve(r).replace(/[\\/]+$/, "");
    return plataforma === "win32" ? abs.toLowerCase() : abs;
  };
  return normal(a) === normal(b);
}

/**
 * El id de una línea nueva: el nombre de su carpeta en minúsculas, sin tildes y
 * con guiones. Si otra línea ya lo usa, se le agrega `-2`, `-3`…
 */
export function idDeLinea(raiz: string, usados: readonly string[]): string {
  const base =
    nombreDeCarpeta(raiz)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, LARGO_DE_ID)
      .replace(/-+$/, "") || "linea";
  if (!usados.includes(base)) return base;
  for (let n = 2; ; n++) if (!usados.includes(`${base}-${n}`)) return `${base}-${n}`;
}

const esLinea = (x: unknown): x is Linea => {
  if (!x || typeof x !== "object") return false;
  const l = x as Record<string, unknown>;
  return typeof l.id === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(l.id) && typeof l.nombre === "string" && typeof l.raiz === "string" && l.raiz.trim() !== "";
};

/**
 * Las líneas y la activa, de unos ajustes como estén en el disco. Con `lineas`
 * guardadas, valen esas (las mal formadas y los ids repetidos se ignoran). Sin
 * ellas, una `raiz` de antes es la única línea, y la activa. Una activa que no
 * es ninguna de las líneas no cuenta.
 */
export function lineasDe(a: AjustesDeLineas): { lineas: Linea[]; lineaActiva: string | null } {
  let lineas: Linea[] = [];
  if (Array.isArray(a.lineas)) {
    for (const l of a.lineas) if (esLinea(l) && !lineas.some((x) => x.id === l.id)) lineas.push({ id: l.id, nombre: l.nombre, raiz: l.raiz });
  } else if (typeof a.raiz === "string" && a.raiz.trim()) {
    const raiz = a.raiz.trim();
    const linea = { id: idDeLinea(raiz, []), nombre: nombreDeCarpeta(raiz), raiz };
    lineas = [linea];
    return { lineas, lineaActiva: linea.id };
  }
  const activa = typeof a.lineaActiva === "string" && lineas.some((l) => l.id === a.lineaActiva) ? a.lineaActiva : null;
  return { lineas, lineaActiva: activa };
}

/** Agrega el proyecto como línea, o devuelve la que ya lo tenía. No repite un proyecto. */
export function agregarLinea(lineas: readonly Linea[], raiz: string, plataforma: NodeJS.Platform = process.platform): { lineas: Linea[]; linea: Linea } {
  const ya = lineas.find((l) => mismaRaiz(l.raiz, raiz, plataforma));
  if (ya) return { lineas: [...lineas], linea: ya };
  const linea = { id: idDeLinea(raiz, lineas.map((l) => l.id)), nombre: nombreDeCarpeta(raiz), raiz };
  return { lineas: [...lineas, linea], linea };
}

/**
 * Las líneas sin esa. Quitar una línea es solo dejar de conocerla: su repositorio, sus tareas y su
 * memoria quedan como están, y volver a elegir su carpeta la agrega de nuevo. Un id que no existe es
 * un error.
 */
export function quitarLinea(lineas: readonly Linea[], id: string): { lineas: Linea[]; quitada: Linea } {
  const quitada = lineaPorId(lineas, id);
  return { lineas: lineas.filter((l) => l.id !== id), quitada };
}

/** La línea con ese id. Si no hay, un error que se puede mostrar: nunca otra línea. */
export function lineaPorId(lineas: readonly Linea[], id: string): Linea {
  const l = lineas.find((x) => x.id === id);
  if (!l) throw new Error(`No hay ninguna línea «${id.slice(0, LARGO_DE_ID)}».`);
  return l;
}
