import { mkdtempSync, rmSync } from "node:fs";
import * as modulo from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { NextRequest } from "next/server";
import { fijarClaudeEnElPath } from "../lib/fabrica/motor/claude-code.ts";
import { aLaFabricaDePrueba, instalarRed, red } from "./red.ts";

/**
 * Donde corren las pruebas de las rutas. Importarlo deja todo listo, y tiene
 * que ir antes de cargar cualquier ruta:
 *
 *  - Una carpeta aparte, recién hecha, como carpeta de trabajo. Los datos se
 *    buscan desde ahí, así que los de verdad no se leen ni se tocan.
 *  - Claves de mentira y la red de mentira (`red.ts`): nada sale del equipo
 *    ni gasta créditos.
 *  - Las rutas se cargan como las escribe Next, con `@/` y sin extensión.
 *
 * Cada archivo de pruebas corre en su propio proceso, con su propia carpeta.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const carpeta = mkdtempSync(path.join(os.tmpdir(), "fabrica-rutas-"));
process.chdir(carpeta);
// Windows no deja borrar un archivo abierto ni la carpeta de trabajo del propio proceso (EBUSY).
// Antes de borrar se vacía el WAL de cada base que abrió la fábrica (`abiertas`, en
// `datos.ts`; las demás de las pruebas son `:memory:`), se cierra y se sale de la carpeta.
// Aun cerrados, el antivirus o el indexador pueden retener un momento los archivos auxiliares de
// SQLite (`-wal`, `-shm`): por eso `rmSync` reintenta.
type BaseAbierta = { isOpen?: boolean; exec(sql: string): void; close(): void };
process.on("exit", () => {
  for (const db of (globalThis as { __basesDeDatos?: Map<string, BaseAbierta> }).__basesDeDatos?.values() ?? []) {
    if (db.isOpen === false) continue;
    // Si el checkpoint o el cierre fallan, el archivo queda retenido y lo dirá el aviso de abajo.
    try {
      db.exec("pragma wal_checkpoint(truncate)");
    } catch {}
    try {
      db.close();
    } catch {}
  }
  process.chdir(os.tmpdir());
  try {
    rmSync(carpeta, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch (e) {
    // Si ni así se pudo, no se tumba un archivo cuyas pruebas pasaron: la carpeta no es de una
    // prueba, es del entorno. Pero queda a la vista, con su ruta, para que no se acumulen a
    // escondidas. Se escribe directo a stderr porque en `exit` ya no corre nada asíncrono.
    process.stderr.write(`AVISO: no se pudo borrar la carpeta temporal de las pruebas ${carpeta}: ${(e as Error).message}\n`);
  }
});

// Su carpeta de Claude Code (sus habilidades, sus sesiones) tampoco: la de la prueba está vacía.
process.env.CLAUDE_CONFIG_DIR = path.join(carpeta, "claude");

// Ninguna clave de verdad llega a una prueba, aunque quien la corre las tenga puestas.
for (const nombre of Object.keys(process.env)) if (/^(COMPANIA_|TYPESAFE_)/.test(nombre)) delete process.env[nombre];
// Con `npm run test:vacio`, ni la de Jev: como en un equipo que recién instaló la fábrica.
export const conElEntornoVacio = process.env.FABRICA_PRUEBAS === "vacio";
if (!conElEntornoVacio) {
  Object.assign(process.env, {
    TYPESAFE_AI_KEY: "clave-de-prueba",
  });
}
instalarRed();
// Tampoco el Claude Code de quien las corre: sin COMPANIA_CLAUDE_CODE_BIN, la prueba no lo
// encuentra en el PATH, aunque esté. Así ninguna corrida de verdad sale de una prueba.
fijarClaudeEnElPath(null);

type Resolver = (especificador: string, contexto: { parentURL?: string }) => { url: string };
// Los tipos de Node que usa el proyecto son anteriores a `registerHooks`.
(modulo as unknown as { registerHooks: (ganchos: { resolve: (especificador: string, contexto: { parentURL?: string }, siguiente: Resolver) => { url: string } }) => void }).registerHooks({
  resolve(especificador, contexto, siguiente) {
    // Solo lo de la aplicación: lo que traen las dependencias se resuelve como siempre.
    if (contexto.parentURL?.includes("/node_modules/")) return siguiente(especificador, contexto);
    const pedido = especificador.startsWith("@/") ? pathToFileURL(path.join(SRC, especificador.slice(2))).href : especificador;
    if (/^(\.|file:)/.test(pedido) && !/\.[a-z]+$/.test(pedido)) return siguiente(`${pedido}.ts`, contexto);
    return siguiente(pedido, contexto);
  },
});

// La fábrica de las rutas es la de mentira: lo que contesta lo dice cada prueba. El motor tiene sus propias pruebas.
const { usarFabricaDePrueba } = await import("../lib/fabrica/cliente.ts");
usarFabricaDePrueba(aLaFabricaDePrueba);

export { red };

type Ruta = (peticion: NextRequest) => Promise<Response>;

/** Llama a una ruta con un cuerpo JSON, como la página. */
export function pedir(ruta: Ruta, cuerpo: unknown, direccion = "http://127.0.0.1:3000/api"): Promise<Response> {
  const sinCuerpo = cuerpo === undefined;
  return ruta(new Request(direccion, sinCuerpo ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) }) as unknown as NextRequest);
}
