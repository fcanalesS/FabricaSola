import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Para elegir la carpeta del proyecto sin escribir la ruta: lo que hay dentro
 * de una carpeta de este equipo, solo carpetas, y de cada una si es un
 * repositorio git y si ya tiene factory/. Lo pidió él el 17 de octubre de
 * 2026. Solo para el servidor, y solo en el modo trabajo (lo cuida la ruta).
 *
 * No se muestran las carpetas ocultas ni node_modules: un proyecto no vive
 * ahí. Nada se abre ni se lee por dentro, salvo mirar si existen `.git` y
 * `factory/config.md`.
 */

export type Carpeta = { nombre: string; ruta: string; git: boolean; fabrica: boolean };
export type Listado = {
  /** La carpeta que se está mirando, entera. */
  ruta: string;
  /** La de arriba, o `null` en la raíz. */
  padre: string | null;
  carpetas: Carpeta[];
  /** En Windows, las unidades que hay, para cambiar de una a otra. */
  unidades: string[];
  /** Si la de arriba es un repositorio o ya tiene fábrica: lo que se elegiría. */
  git: boolean;
  fabrica: boolean;
};

/** Cuántas se muestran como mucho: una carpeta con miles no es la de un proyecto. */
const MAXIMO = 400;

const ocultar = (nombre: string) => nombre.startsWith(".") || nombre === "node_modules" || nombre === "$RECYCLE.BIN" || nombre === "System Volume Information";

/** Las unidades de Windows que existen, de la C a la Z. */
function unidadesDeWindows(): string[] {
  return "CDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => `${l}:\\`).filter((u) => existsSync(u));
}

/** Lo que hay en `ruta` (por defecto, la carpeta del usuario). Lanza un error que se puede mostrar si no se puede leer. */
export async function listarCarpetas(ruta: string | null | undefined, plataforma: NodeJS.Platform = process.platform): Promise<Listado> {
  const actual = path.resolve(ruta?.trim() || os.homedir());
  const st = await fs.stat(actual).catch(() => null);
  if (!st?.isDirectory()) throw new Error(`No existe la carpeta ${actual}.`);
  let entradas: import("node:fs").Dirent[];
  try {
    entradas = await fs.readdir(actual, { withFileTypes: true });
  } catch {
    throw new Error(`No se puede leer ${actual}: sin permiso.`);
  }
  const hay = (dir: string, p: string) => fs.access(path.join(dir, p)).then(() => true, () => false);
  const carpetas = await Promise.all(
    entradas
      .filter((e) => e.isDirectory() && !ocultar(e.name))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
      .slice(0, MAXIMO)
      .map(async (e) => {
        const r = path.join(actual, e.name);
        return { nombre: e.name, ruta: r, git: await hay(r, ".git"), fabrica: await hay(r, path.join("factory", "config.md")) };
      }),
  );
  const padre = path.dirname(actual);
  return {
    ruta: actual,
    padre: padre === actual ? null : padre,
    carpetas,
    unidades: plataforma === "win32" ? unidadesDeWindows() : [],
    git: await hay(actual, ".git"),
    fabrica: await hay(actual, path.join("factory", "config.md")),
  };
}
