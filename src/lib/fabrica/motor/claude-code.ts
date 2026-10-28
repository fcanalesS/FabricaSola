import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

/**
 * Dónde está Claude Code en este equipo. Primero la ruta de `FACTORIA_CLAUDE_CODE_BIN`, si está;
 * si no, `claude` en el PATH, buscado una sola vez por proceso: el mismo que correría quien
 * levantó la aplicación desde su terminal. Así se corre sin configurar nada.
 *
 * No importa nada de la aplicación: lo usan también los scripts de `scripts/fabrica/`.
 */

export type ClaudeCode = { ruta: string; de: "variable" | "path" };

export const SIN_CLAUDE_CODE =
  "No encontré Claude Code: no está en el PATH y falta FACTORIA_CLAUDE_CODE_BIN en .env.local. Instálalo (o pon su ruta en esa variable) y reinicia la aplicación.";

/** Las extensiones que se pueden lanzar en Windows: un `.exe`, o un `.cmd`/`.bat` con `cmd /c`. */
const LANZABLES = [".com", ".exe", ".bat", ".cmd"];

/**
 * La ruta de `nombre` en el PATH de `entorno`, o `null`. Solo mira carpetas absolutas: una
 * relativa (`.`) haría que mande la carpeta desde donde se arrancó. En Windows prueba las
 * extensiones de PATHEXT que se pueden lanzar, en su orden; en Mac y Linux, que sea ejecutable.
 * `esEjecutable` es para las pruebas.
 */
export function buscarEnElPath(
  nombre: string,
  entorno: Record<string, string | undefined> = process.env,
  plataforma: NodeJS.Platform = process.platform,
  esEjecutable: (ruta: string) => boolean = (ruta) => ejecutable(ruta, plataforma),
): string | null {
  const windows = plataforma === "win32";
  const p = windows ? path.win32 : path.posix;
  // En Windows la variable puede llamarse Path.
  const valor = Object.entries(entorno).find(([k]) => (windows ? k.toUpperCase() === "PATH" : k === "PATH"))?.[1] ?? "";
  const extensiones = windows
    ? (entorno.PATHEXT ?? Object.entries(entorno).find(([k]) => k.toUpperCase() === "PATHEXT")?.[1] ?? ".COM;.EXE;.BAT;.CMD")
        .split(";")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => LANZABLES.includes(e))
    : [""];
  for (const crudo of valor.split(windows ? ";" : ":")) {
    const carpeta = crudo.trim().replace(/^"(.*)"$/, "$1");
    if (!carpeta || !p.isAbsolute(carpeta)) continue;
    for (const ext of extensiones) {
      const ruta = p.join(carpeta, nombre + ext);
      if (esEjecutable(ruta)) return ruta;
    }
  }
  return null;
}

function ejecutable(ruta: string, plataforma: NodeJS.Platform): boolean {
  try {
    if (!statSync(ruta).isFile()) return false;
    if (plataforma !== "win32") accessSync(ruta, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const memoria = globalThis as { __claudeEnElPath?: string | null };

/** Claude Code en este equipo, y de dónde salió; `null` si no está: sin él no hay corridas. */
export function claudeCodeDeEsteEquipo(entorno: Record<string, string | undefined> = process.env): ClaudeCode | null {
  const variable = entorno.FACTORIA_CLAUDE_CODE_BIN?.trim();
  if (variable) return { ruta: variable, de: "variable" };
  if (memoria.__claudeEnElPath === undefined) memoria.__claudeEnElPath = buscarEnElPath("claude");
  return memoria.__claudeEnElPath ? { ruta: memoria.__claudeEnElPath, de: "path" } : null;
}

/** Para las pruebas: cuál dar por encontrado en el PATH (`null`, ninguno), sin mirar el de verdad. */
export function fijarClaudeEnElPath(ruta: string | null): void {
  memoria.__claudeEnElPath = ruta;
}
