import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

/**
 * Lo que cambia entre Mac y Windows al levantar y detener los servicios
 * (`camara.ts`, `oido.ts`). Solo para el servidor. Las funciones `comando…` y
 * `rutaDe…` son lógica pura, con la plataforma como argumento, para probar
 * las dos desde cualquier equipo.
 *
 * En Windows no hay `ps` ni grupos de procesos: el programa de un proceso se
 * pregunta a PowerShell, y se cierra con `taskkill /T`, que cierra también lo
 * que haya lanzado.
 */

export type Plataforma = NodeJS.Platform;

/** Con qué se pregunta qué programa es un proceso. Lo que escribe incluye la línea de comando. */
export function comandoParaVerProceso(pid: number, plataforma: Plataforma): [string, string[]] {
  if (plataforma === "win32")
    return ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`]];
  return ["ps", ["-p", String(pid), "-o", "command="]];
}

/** La línea de comando del proceso, o `null` si ya no existe. */
export function lineaDelProceso(pid: number, plataforma: Plataforma = process.platform): string | null {
  try {
    const [programa, argumentos] = comandoParaVerProceso(pid, plataforma);
    const linea = execFileSync(programa, argumentos, { encoding: "utf8", windowsHide: true, timeout: 5_000 }).trim();
    return linea || null;
  } catch {
    return null;
  }
}

/** Si una línea de comando es la de ese programa. Las barras de Windows se leen como `/`. */
export function esDelPrograma(linea: string | null, programa: string): boolean {
  return !!linea && linea.replaceAll("\\", "/").includes(programa);
}

/**
 * Cierra un proceso que se lanzó separado (`detached`) y lo que haya lanzado
 * él. En Mac se lanzó como cabeza de su grupo, así que se cierra el grupo.
 */
export function cerrarProceso(pid: number, plataforma: Plataforma = process.platform): void {
  if (plataforma === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: 10_000 });
    } catch {
      // Ya no estaba.
    }
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ya no estaba.
    }
  }
}

/** El Python de un entorno virtual: `bin/python` en Mac, `Scripts\python.exe` en Windows. */
export function rutaDePython(entorno: string, plataforma: Plataforma = process.platform): string {
  return plataforma === "win32" ? path.win32.join(entorno, "Scripts", "python.exe") : path.posix.join(entorno, "bin", "python");
}

/** Una ruta que empieza con `~/` (o `~\` en Windows), desde la carpeta del usuario. */
export function expandirCasa(ruta: string, casa: string = os.homedir()): string {
  return /^~[\\/]/.test(ruta) ? path.join(casa, ruta.slice(2)) : ruta;
}

/** Las últimas líneas de un registro, sin los `\r` de Windows. */
export function ultimasLineas(texto: string, cuantas: number): string[] {
  return texto.trim().split(/\r?\n/).slice(-cuantas);
}
