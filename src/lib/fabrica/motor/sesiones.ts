import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cerrarProceso } from "../../servicios/procesos.ts";
import { SIN_CLAUDE_CODE } from "./claude-code.ts";
import { claudeCode, entornoDeLaCorrida, lanzadorDeClaude } from "./corridas.ts";

/**
 * Las sesiones de Claude Code del proyecto elegido: las que él abrió en una
 * terminal y las de las corridas de la fábrica. Claude Code guarda cada una
 * en un `.jsonl` de su carpeta (la de `CLAUDE_CONFIG_DIR`, o `~/.claude`),
 * bajo `projects/` y la ruta del proyecto con cada signo cambiado por un
 * guion. De aquí solo se leen; lo que se escribe a una sesión va por Claude
 * Code (`retomarSesion`), con su suscripción y sin las claves de la
 * aplicación, como las corridas.
 */

/** Hasta cuántas se listan, de la más reciente a la más vieja. */
const SESIONES_A_LA_VISTA = 20;
/** Con actividad en este rato, la sesión puede estar abierta en una terminal. */
export const ACTIVA_MS = 3 * 60_000;
/** Cuánto del final de un archivo se lee: alcanza para lo último, sin cargar sesiones de decenas de megas. */
const COLA_BYTES = 1024 * 1024;
const CABEZA_BYTES = 256 * 1024;

const carpetaDeClaude = (entorno: NodeJS.ProcessEnv = process.env) => entorno.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), ".claude");

/** La carpeta donde Claude Code guarda las sesiones de un proyecto: su ruta con cada signo cambiado por un guion. Es lógica pura. */
export function carpetaDeSesiones(raiz: string, carpetaClaude: string): string {
  return path.join(carpetaClaude, "projects", raiz.replace(/[^A-Za-z0-9]/g, "-"));
}

const ID_DE_SESION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const esIdDeSesion = (v: unknown): v is string => typeof v === "string" && ID_DE_SESION.test(v);

/** Un trozo de un archivo, desde `desde` y hasta `bytes`. */
async function trozo(archivo: string, desde: number, bytes: number): Promise<string> {
  const fh = await fs.open(archivo, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, desde);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await fh.close();
  }
}

/** Las líneas enteras de un trozo: si no empieza al principio del archivo, la primera puede venir cortada. */
function lineas(texto: string, desdeElPrincipio: boolean): Record<string, unknown>[] {
  const partes = texto.split("\n");
  if (!desdeElPrincipio) partes.shift();
  return partes.flatMap((l) => {
    try {
      const d = JSON.parse(l) as unknown;
      return d && typeof d === "object" ? [d as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });
}

/** Lo que él escribió en una línea de la sesión, si es un mensaje suyo: no un comando local, ni una nota de Claude Code, ni otra sesión. */
function pedidoDe(d: Record<string, unknown>): string | null {
  if (d.type !== "user" || d.isMeta === true || d.isSidechain === true) return null;
  const origen = (d.origin && typeof d.origin === "object" ? (d.origin as { kind?: unknown }).kind : null) ?? "human";
  if (origen !== "human") return null;
  const contenido = (d.message as { content?: unknown } | undefined)?.content;
  const texto =
    typeof contenido === "string"
      ? contenido
      : Array.isArray(contenido)
        ? contenido.flatMap((b) => (b && typeof b === "object" && (b as { type?: unknown }).type === "text" ? [String((b as { text?: unknown }).text ?? "")] : [])).join("\n")
        : "";
  const limpio = texto.trim();
  return limpio && !limpio.startsWith("<") ? limpio : null;
}

export type PasoDeSesion = { ts: string | null; quien: "el" | "claude" | "herramienta"; texto: string };

/** Lo que hizo una herramienta, en una línea: su nombre y sobre qué, nunca lo que escribió. */
function herramienta(b: Record<string, unknown>): string {
  const entrada = (b.input && typeof b.input === "object" ? b.input : {}) as Record<string, unknown>;
  const sobre = [entrada.file_path, entrada.path, entrada.pattern, entrada.command, entrada.description, entrada.subagent_type].find((v) => typeof v === "string" && v.trim());
  return `${String(b.name ?? "herramienta")}${sobre ? ` ${String(sobre).replace(/\s+/g, " ").slice(0, 160)}` : ""}`;
}

/**
 * Los pasos de una sesión: lo que él pidió, lo que Claude contestó y qué herramientas usó, en
 * orden. Sin lo que pensó, sin los resultados de las herramientas, sin los subagentes y sin las
 * notas internas de Claude Code. Es lógica pura.
 */
export function pasosDe(registros: readonly Record<string, unknown>[]): PasoDeSesion[] {
  const pasos: PasoDeSesion[] = [];
  for (const d of registros) {
    const ts = typeof d.timestamp === "string" ? d.timestamp : null;
    const pedido = pedidoDe(d);
    if (pedido) {
      pasos.push({ ts, quien: "el", texto: pedido.slice(0, 2000) });
      continue;
    }
    if (d.type !== "assistant" || d.isSidechain === true) continue;
    const contenido = (d.message as { content?: unknown } | undefined)?.content;
    for (const b of Array.isArray(contenido) ? (contenido as Record<string, unknown>[]) : []) {
      if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) pasos.push({ ts, quien: "claude", texto: b.text.trim().slice(0, 2000) });
      else if (b?.type === "tool_use") pasos.push({ ts, quien: "herramienta", texto: herramienta(b) });
    }
  }
  return pasos;
}

export type SesionDeClaude = {
  id: string;
  /** El título que le puso Claude Code, o lo primero que él pidió. */
  titulo: string;
  ultima: string;
  activa: boolean;
  /** Si es de una corrida de la fábrica. */
  deLaFabrica: boolean;
  /** La carpeta donde corrió: retomarla tiene que ser ahí. */
  cwd: string | null;
  costoUsd: number | null;
};

/** Lo que se sabe de una sesión con su principio y su final. Es lógica pura. */
export function resumenDeSesion(id: string, cabeza: readonly Record<string, unknown>[], cola: readonly Record<string, unknown>[], ultima: Date, ahora: number): SesionDeClaude {
  const primero = cabeza.map(pedidoDe).find((p) => p !== null) ?? null;
  const titulo = [...cola, ...cabeza].reverse().find((d) => d.type === "ai-title" && typeof d.aiTitle === "string")?.aiTitle as string | undefined;
  const costo = [...cola].reverse().find((d) => d.type === "cost-state" && typeof d.totalCostUSD === "number")?.totalCostUSD as number | undefined;
  const cwd = [...cabeza, ...cola].find((d) => typeof d.cwd === "string")?.cwd as string | undefined;
  return {
    id,
    titulo: (titulo ?? primero ?? "Sin título").replace(/\s+/g, " ").trim().slice(0, 160),
    ultima: ultima.toISOString(),
    activa: ahora - ultima.getTime() < ACTIVA_MS,
    deLaFabrica: (primero ?? "").startsWith("/fabrica:"),
    cwd: cwd ?? null,
    costoUsd: costo ?? null,
  };
}

/** Las sesiones de Claude Code del proyecto, de la más reciente a la más vieja. Solo lee. */
export async function sesionesDelProyecto(raiz: string, ahora = Date.now()): Promise<SesionDeClaude[]> {
  const dir = carpetaDeSesiones(raiz, carpetaDeClaude());
  const nombres = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => esIdDeSesion(n.replace(/\.jsonl$/, "")) && n.endsWith(".jsonl"));
  const conFecha = await Promise.all(nombres.map(async (n) => ({ n, st: await fs.stat(path.join(dir, n)).catch(() => null) })));
  const recientes = conFecha.filter((x) => x.st).sort((a, b) => b.st!.mtimeMs - a.st!.mtimeMs).slice(0, SESIONES_A_LA_VISTA);
  return Promise.all(
    recientes.map(async ({ n, st }) => {
      const archivo = path.join(dir, n);
      const cabeza = lineas(await trozo(archivo, 0, CABEZA_BYTES).catch(() => ""), true);
      const desde = Math.max(0, st!.size - CABEZA_BYTES);
      const cola = desde > 0 ? lineas(await trozo(archivo, desde, CABEZA_BYTES).catch(() => ""), false) : [];
      return resumenDeSesion(n.replace(/\.jsonl$/, ""), cabeza, cola, st!.mtime, ahora);
    }),
  );
}

/** Los pasos del final de una sesión, después de `desde` si se da. `null` si no existe. Solo lee. */
export async function leerSesion(raiz: string, id: string, desde: string | null = null): Promise<{ sesion: SesionDeClaude; pasos: PasoDeSesion[] } | null> {
  if (!esIdDeSesion(id)) return null;
  const archivo = path.join(carpetaDeSesiones(raiz, carpetaDeClaude()), `${id}.jsonl`);
  const st = await fs.stat(archivo).catch(() => null);
  if (!st) return null;
  const inicio = Math.max(0, st.size - COLA_BYTES);
  const cola = lineas(await trozo(archivo, inicio, COLA_BYTES), inicio === 0);
  const cabeza = inicio === 0 ? cola : lineas(await trozo(archivo, 0, CABEZA_BYTES).catch(() => ""), true);
  const pasos = pasosDe(cola).filter((p) => !desde || (p.ts !== null && p.ts > desde));
  return { sesion: resumenDeSesion(id, cabeza, cola, st.mtime, Date.now()), pasos };
}

// ---- Retomar una sesión desde la aplicación ---------------------------------------------------------

export type Retoma = {
  sesion: string;
  /** Si siguió en una copia (la sesión estaba abierta en otra parte): la sesión nueva. */
  copia: string | null;
  estado: "corriendo" | "terminada" | "fallida" | "detenida";
  inicio: string;
  /** Lo que va diciendo y haciendo Claude Code, en líneas. Las últimas. */
  lineas: { tipo: "texto" | "herramienta" | "error"; texto: string }[];
  resultado: string | null;
  costoUsd: number | null;
};

const LINEAS_DE_RETOMA = 200;
// La que corre ahora. En `globalThis` para que sobreviva a la recarga de módulos de desarrollo.
const mem = ((globalThis as { __retomaDeSesion?: { retoma: Retoma | null; pid: number | null } }).__retomaDeSesion ??= { retoma: null, pid: null });

/** Lo que dice una línea de la salida de Claude Code (stream-json) para la retoma. Es lógica pura. */
export function procesarSalidaDeRetoma(r: Retoma, linea: string): void {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(linea) as Record<string, unknown>;
  } catch {
    return;
  }
  const agregar = (tipo: Retoma["lineas"][number]["tipo"], texto: string) => {
    r.lineas.push({ tipo, texto: texto.slice(0, 2000) });
    if (r.lineas.length > LINEAS_DE_RETOMA) r.lineas.splice(0, r.lineas.length - LINEAS_DE_RETOMA);
  };
  if (d.type === "system" && d.subtype === "init" && esIdDeSesion(d.session_id) && d.session_id !== r.sesion) r.copia = d.session_id;
  else if (d.type === "assistant") {
    for (const b of pasosDe([{ ...d, timestamp: null }])) agregar(b.quien === "herramienta" ? "herramienta" : "texto", b.texto);
  } else if (d.type === "result") {
    r.estado = d.is_error === true ? "fallida" : "terminada";
    r.resultado = typeof d.result === "string" ? d.result.slice(0, 8000) : null;
    r.costoUsd = typeof d.total_cost_usd === "number" ? d.total_cost_usd : null;
    if (d.is_error === true) agregar("error", r.resultado ?? "Claude Code terminó con un error.");
  }
}

/** La retoma de ahora o la última, si hubo. */
export const retomaActual = (): Retoma | null => mem.retoma;

/**
 * Le escribe a una sesión del proyecto, como si él siguiera en ella: Claude Code la retoma sin
 * terminal (`--resume`), en su carpeta y con su suscripción. Si la sesión tuvo actividad hace
 * poco puede estar abierta en una terminal, y entonces sigue en una copia (`--fork-session`) para
 * no escribirle desde dos lados. Lo que él escribió va por la entrada del proceso, no en la línea
 * del comando: así no lo interpreta ninguna consola. De a una retoma a la vez.
 */
export async function retomarSesion(raiz: string, id: string, texto: string): Promise<Retoma> {
  if (mem.retoma?.estado === "corriendo") throw new Error("Ya hay una sesión retomándose: espera a que termine o detenla.");
  const bin = claudeCode();
  if (!bin) throw new Error(SIN_CLAUDE_CODE);
  const limpio = texto.trim();
  if (!limpio) throw new Error("No hay nada que escribirle.");
  if (limpio.length > 8000) throw new Error("Es muy largo para escribírselo de una vez (más de 8000 caracteres).");
  const leida = await leerSesion(raiz, id);
  if (!leida) throw new Error("No existe esa sesión en este proyecto.");
  const args = ["-p", "--resume", id, "--output-format", "stream-json", "--verbose", ...(leida.sesion.activa ? ["--fork-session"] : [])];
  const retoma: Retoma = { sesion: id, copia: null, estado: "corriendo", inicio: new Date().toISOString(), lineas: [], resultado: null, costoUsd: null };
  mem.retoma = retoma;
  const { programa, argumentos } = lanzadorDeClaude(bin, args);
  const hijo = spawn(programa, argumentos, { cwd: leida.sesion.cwd ?? raiz, env: entornoDeLaCorrida(process.env), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  mem.pid = hijo.pid ?? null;
  let resto = "";
  hijo.stdout.on("data", (b: Buffer) => {
    const partes = (resto + b.toString("utf8")).split(/\r?\n/);
    resto = partes.pop() ?? "";
    for (const l of partes) procesarSalidaDeRetoma(retoma, l);
  });
  hijo.stderr.on("data", (b: Buffer) => {
    const t = b.toString("utf8").trim();
    if (t) retoma.lineas.push({ tipo: "error", texto: t.slice(0, 2000) });
  });
  hijo.on("error", (err) => {
    retoma.estado = "fallida";
    retoma.lineas.push({ tipo: "error", texto: `No pude lanzar Claude Code (${bin}): ${err.message}` });
  });
  hijo.on("close", (codigo) => {
    if (resto) procesarSalidaDeRetoma(retoma, resto);
    mem.pid = null;
    if (retoma.estado === "corriendo") retoma.estado = codigo === 0 ? "terminada" : "fallida";
  });
  hijo.stdin.end(limpio);
  return retoma;
}

/** Detiene la retoma en marcha, si hay. */
export function detenerRetoma(): Retoma | null {
  if (mem.retoma?.estado === "corriendo" && mem.pid) {
    cerrarProceso(mem.pid);
    mem.retoma.estado = "detenida";
  }
  return mem.retoma;
}

// ---- Con qué sesión está enganchada ella ----------------------------------------------------------------

/** La sesión a la que él enganchó a la compañera, para que sepa en qué anda. En `globalThis`, como la retoma. */
const vinculo = ((globalThis as { __sesionEnganchada?: { actual: { raiz: string; id: string } | null } }).__sesionEnganchada ??= { actual: null });

/** La engancha a una sesión del proyecto, o la suelta con `null`. */
export function engancharSesion(raiz: string, id: string | null): string | null {
  vinculo.actual = id && esIdDeSesion(id) ? { raiz, id } : null;
  return vinculo.actual?.id ?? null;
}

/** A qué sesión del proyecto está enganchada, si a alguna. */
export const sesionEnganchada = (raiz: string | null): string | null => (vinculo.actual && raiz && vinculo.actual.raiz === raiz ? vinculo.actual.id : null);
