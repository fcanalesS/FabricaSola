// Solo servidor: correr la fábrica desde la aplicación. Lanza Claude Code sin interfaz
// (`claude -p "/fabrica:correr …"`) dentro del proyecto, con el plugin `fabrica` que viaja con la
// aplicación (app/fabrica/), y resume su salida en líneas legibles. Una corrida a la vez.
//
// La corrida no depende del servidor: Claude Code corre en un proceso aparte que escribe su salida
// en datos/corridas/<id>.jsonl, y el servidor solo lee ese archivo. Si el servidor se
// reinicia o se cae, la corrida sigue, y al volver se retoma desde el archivo.
//
// Claude Code se lanza por la ruta de COMPANIA_CLAUDE_CODE_BIN o, sin ella, el `claude` del PATH
// (`claude-code.ts`): sin ninguno no hay corridas. Usa la sesión de Claude Code de este equipo, es decir la suscripción, y
// no la clave de la API de la aplicación: a la corrida no le llega ninguna variable COMPANIA_ ni
// ANTHROPIC_.
//
// Nadie aprueba permisos en una corrida así: vale el modo de permisos de ~/.claude/settings.json
// (o COMPANIA_FABRICA_MODO_PERMISOS). Lo que ese modo no deje pasar termina la corrida, y la tarea
// queda donde el plugin la dejó, normalmente en "necesita-humano".
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { cerrarProceso } from "../../servicios/procesos.ts";
import { vaultDeLaPlanta } from "../memoria/vault.ts";
import { SIN_COMANDOS, sinComandos } from "../verificacion.ts";
import { habilidadesDeLaCorrida } from "../habilidades/disco.ts";
import { habilidadesConHuella } from "../habilidades/formato.ts";
import { AGENTE_DE_ANUNCIO, AGENTE_DE_RETRABAJO, agenteDeAnuncio, agenteDeRetrabajo, agenteDesde, agentesConHabilidades, agentesParaInyectar, archivoDelAgenteDeAnuncio, archivoDelAgenteDeRetrabajo, carpetasDePlugins, definicionesDisponibles, textosDeNikkes } from "./agentes.ts";
import { configDesde } from "./formato.ts";
import { agentesDelProyecto, agentesDeEsteEquipo, anotarPorRetomar, carpetaDeLaFabrica, esModeloDeClaude, esRamaProtegida, fijarCorridaConNikke, instantanea, leerAjustes, liberarTomadasPor, modeloDeLaCorrida, raiz, ramaActual, tomarPorRetomar } from "./proyecto.ts";
import { destinoDeTelemetria, entornoDeTelemetria, VARIABLES_CON_CONTENIDO } from "./telemetria.ts";
import { claudeCodeDeEsteEquipo, SIN_CLAUDE_CODE } from "./claude-code.ts";

export type EstadoCorrida = "corriendo" | "terminada" | "fallida" | "detenida"

export type Linea = { n: number; ts: string; tipo: "info" | "texto" | "herramienta" | "agente" | "error" | "fin"; texto: string }

/** Lo que dice el mensaje `result` de Claude Code al terminar: la estimación de costo es suya, no la factura. */
export type ResultadoCorrida = {
  subtipo: string
  turnos: number | null
  duracionMs: number | null
  duracionApiMs: number | null
  costoUsd: number | null
  porModelo: Record<string, { entrada: number; salida: number; cacheLeido: number; cacheCreado: number; costoUsd: number }>
  /** Las herramientas que el modo de permisos no dejó usar. */
  permisosNegados: string[]
  subagentes: { lanzados: number; completados: number; fallidos: number } | null
  razonDeFin: string | null
  detencionesDeSeguridad: number
  errorDeApi: string | null
}

export type Corrida = {
  id: string
  proyecto: string
  tareas: string[]
  modelo?: string
  inicio: string
  fin?: string
  estado: EstadoCorrida
  codigo?: number | null
  costoUsd?: number
  resumen?: string
  /** La sesión de Claude Code, para cruzarla con su telemetría. */
  sesion?: string
  resultado?: ResultadoCorrida
  /** Si se lanzó mandando su telemetría a este orquestador. */
  conTelemetria?: boolean
  /** Los servidores MCP que no conectaron al empezar, y los que algún agente intentó usar. */
  mcp?: { caidos: string[]; usados: string[] }
  /** Qué se le encargó a quién durante la corrida, tarea por tarea: lo que muestra el tablero. */
  actividad?: Actividad[]
  /** Si la detuvo la fábrica, por qué (un tope de gasto). */
  detenidaPor?: string
  lineas: Linea[]
}

/**
 * Un encargo de la corrida: a qué agente se le delegó una tarea (o qué herramienta de la fábrica
 * corrió sobre ella), desde cuándo, y lo último que ese agente hizo. `hasta`, cuando terminó;
 * `segundoPlano`, si se lanzó en segundo plano y su fin no se ve en la salida.
 */
export type Actividad = { id: string; tarea: string | null; agente: string; que: string; desde: string; hasta?: string; ultimo?: string; segundoPlano?: boolean }

const MAX_ACTIVIDAD = 120;
/** La tarea de la que habla un encargo: el primer id que nombra. */
const tareaEn = (...textos: unknown[]) => /\bF-\d+\b/.exec(textos.map((t) => (typeof t === "string" ? t : "")).join(" "))?.[0] ?? null;
/** Un agente lanzado en segundo plano contesta enseguida que arrancó: eso no es que haya terminado. */
const ARRANCO_EN_SEGUNDO_PLANO = /async|background|segundo plano|launched|running in the/i;

/** Un nombre de servidor MCP como aparece en el nombre de sus herramientas (`mcp__<servidor>__…`). */
export const nombreMcp = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "_");

const MAX_LINEAS = 1500;

/** Lo que se guarda de una corrida en datos/corridas/<id>.json. */
type Meta = {
  id: string
  proyecto: string
  tareas: string[]
  modelo?: string
  inicio: string
  comando: string
  /** CLAUDE_CODE_PLUGIN_DIRS con que se lanzó, para poder revisarlo después. */
  pluginDirs?: string
  pid?: number
  /** Si se lanzó mandando su telemetría a este orquestador. */
  conTelemetria?: boolean
  detenida?: boolean
  estado?: EstadoCorrida
  fin?: string
  /** Lo que costó, según Claude Code: se anota al terminar. */
  costoUsd?: number
  error?: string
  /** Por qué se detuvo, si la detuvo la fábrica (un tope de gasto). */
  detenidaPor?: string
  /** La actividad de la corrida, con sus horas de verdad: se guarda al terminar, para el informe. */
  actividad?: Actividad[]
  /** Las habilidades que tuvo cada etapa, con su huella al empezar. Sin las rutas de sus archivos. */
  habilidades?: Record<string, { nombre: string; huella: string; origen: string }[]>
}

/** Una corrida que se está siguiendo: lo leído de su salida y hasta dónde. */
type Seguimiento = { meta: Meta; c: Corrida; leido: number; resto: string; resultado?: "ok" | "error" }

// La clave lleva versión: lo que dejó en memoria una versión anterior de este módulo (sobrevive a
// la recarga en caliente de Next) tiene otra forma y no se debe leer como si fuera esta.
type Global = { __corridaFabricaV2?: { actual?: Seguimiento } }
const g = globalThis as unknown as Global;
const mem = (g.__corridaFabricaV2 ??= {});
const esSeguimiento = (x: unknown): x is Seguimiento =>
  !!x && typeof x === "object" && "meta" in x && typeof (x as Seguimiento).meta?.id === "string";

/** Donde quedan las corridas: su meta, su salida, su telemetría y su informe. */
export const carpetaDeCorridas = () => path.join(carpetaDeLaFabrica(), "corridas");
const dirLogs = carpetaDeCorridas;
const archivoMeta = (id: string) => path.join(dirLogs(), `${id}.json`);
const archivoSalida = (id: string) => path.join(dirLogs(), `${id}.jsonl`);

function agregar(c: Corrida, tipo: Linea["tipo"], texto: string) {
  const t = texto.replace(/\s+$/, "");
  if (!t) return;
  const n = (c.lineas.at(-1)?.n ?? 0) + 1;
  c.lineas.push({ n, ts: new Date().toISOString(), tipo, texto: t.length > 600 ? t.slice(0, 600) + "…" : t });
  if (c.lineas.length > MAX_LINEAS) c.lineas.splice(0, c.lineas.length - MAX_LINEAS);
}

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** El mensaje `result` de stream-json, en lo que interesa para el informe. */
function resultadoDe(j: Record<string, unknown>): ResultadoCorrida {
  const porModelo: ResultadoCorrida["porModelo"] = {};
  for (const [modelo, u] of Object.entries((j.modelUsage ?? {}) as Record<string, Record<string, unknown>>)) {
    porModelo[modelo] = {
      entrada: numero(u?.inputTokens) ?? 0,
      salida: numero(u?.outputTokens) ?? 0,
      cacheLeido: numero(u?.cacheReadInputTokens) ?? 0,
      cacheCreado: numero(u?.cacheCreationInputTokens) ?? 0,
      costoUsd: numero(u?.costUSD) ?? 0,
    };
  }
  const sub = j.subagent_stats as Record<string, unknown> | undefined;
  return {
    subtipo: String(j.subtype ?? ""),
    turnos: numero(j.num_turns),
    duracionMs: numero(j.duration_ms),
    duracionApiMs: numero(j.duration_api_ms),
    costoUsd: numero(j.total_cost_usd),
    porModelo,
    permisosNegados: ((j.permission_denials as { tool_name?: unknown }[] | undefined) ?? []).map((d) => String(d?.tool_name ?? "")).filter(Boolean),
    subagentes: sub ? { lanzados: numero(sub.spawned) ?? 0, completados: numero(sub.completed) ?? 0, fallidos: numero(sub.failed) ?? 0 } : null,
    razonDeFin: typeof j.terminal_reason === "string" ? j.terminal_reason : null,
    detencionesDeSeguridad: numero(j.safety_stops) ?? 0,
    errorDeApi: j.api_error_status == null ? null : String(j.api_error_status),
  };
}

const corto = (s: unknown, n = 120) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};

/** Una herramienta en una línea: lo que hace, sin el volcado entero de su entrada. */
function describirHerramienta(nombre: string, input: Record<string, unknown>): string {
  switch (nombre) {
    case "Agent":
    case "Task":
      return `delega en ${input.subagent_type ?? "un agente"}: ${corto(input.description, 80)}`;
    case "Bash":
    case "PowerShell":
      return `${nombre}: ${corto(input.command, 140)}`;
    case "Edit":
    case "Write":
    case "Read":
      return `${nombre} ${corto(input.file_path, 140)}`;
    case "Grep":
    case "Glob":
      return `${nombre} ${corto(input.pattern, 100)}`;
    case "mcp__fabrica__mover":
      return `mueve ${input.tarea} → ${input.a}${input.nota ? ` (${corto(input.nota, 80)})` : ""}`;
    case "mcp__fabrica__verificar":
      return `verifica ${input.tarea}`;
    case "mcp__fabrica__estado":
      return "lee el estado de la fábrica";
    case "mcp__fabrica__aprobar":
      return `veredicto ${input.tarea}: ${input.veredicto}`;
    case "mcp__fabrica__sincronizar":
      return `sincroniza ${input.tarea} con su rama de origen`;
    case "mcp__fabrica__decidir":
      return `decide qué hace falta en ${input.etapa} de ${input.tarea}`;
    case "mcp__fabrica__anuncio":
      return `Label escribe lo que se lee de ${input.tarea}`;
    case "mcp__fabrica__revisar_con_codex":
      return `Codex revisa ${input.tarea}`;
    case "mcp__fabrica__spec_con_antigravity":
      return `Antigravity escribe la spec de ${input.tarea}`;
    default:
      return nombre;
  }
}

/**
 * Lo que un `tool_use` dice de la actividad: si el orquestador delega en un agente o corre una
 * herramienta de la fábrica sobre una tarea, empieza un encargo; si lo hace un subagente, es lo
 * último que está haciendo el encargo que lo lanzó.
 */
function anotarActividad(c: Corrida, b: Record<string, unknown>, padre: string | null) {
  const nombre = String(b.name);
  const input = (b.input ?? {}) as Record<string, unknown>;
  const ahora = new Date().toISOString();
  if (padre) {
    const a = c.actividad?.find((x) => x.id === padre);
    if (a) a.ultimo = describirHerramienta(nombre, input);
    return;
  }
  let nueva: Actividad | null = null;
  if (nombre === "Agent" || nombre === "Task")
    nueva = { id: String(b.id ?? ""), tarea: tareaEn(input.description, input.prompt), agente: String(input.subagent_type ?? "general-purpose"), que: corto(input.description, 120), desde: ahora };
  else if (nombre.startsWith("mcp__fabrica__") && typeof input.tarea === "string")
    nueva = { id: String(b.id ?? ""), tarea: tareaEn(input.tarea), agente: "la fábrica", que: describirHerramienta(nombre, input), desde: ahora };
  if (!nueva) return;
  c.actividad = [...(c.actividad ?? []), nueva].slice(-MAX_ACTIVIDAD);
}

/** Su resultado cierra el encargo, salvo que solo diga que arrancó en segundo plano. */
function cerrarActividad(c: Corrida, id: string, texto: string) {
  const a = c.actividad?.find((x) => x.id === id);
  if (!a || a.hasta) return;
  if (a.agente !== "la fábrica" && ARRANCO_EN_SEGUNDO_PLANO.test(texto.slice(0, 400))) a.segundoPlano = true;
  else a.hasta = new Date().toISOString();
}

/** Solo para las pruebas: procesa una línea de la salida de Claude Code sobre una corrida. */
export const procesarLinea = (c: Corrida, linea: string) => procesar(c, linea);

/**
 * Traduce una línea de `--output-format stream-json` a lo que vale la pena mostrar. Devuelve cómo
 * terminó la corrida cuando la línea es el resultado final.
 */
function procesar(c: Corrida, linea: string): "ok" | "error" | undefined {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(linea) as Record<string, unknown>;
  } catch {
    // Lo que no es JSON es stderr de Claude Code o del sistema.
    if (linea.trim()) agregar(c, "error", linea);
    return;
  }
  const tipo = j.type;
  const deSubagente = j.parent_tool_use_id != null;

  if (tipo === "system") {
    if (j.subtype === "init") {
      // Claude Code vuelve a anunciar el inicio cada vez que retoma tras esperar a un agente: solo se
      // cuenta el primero, o en los pasos aparecería «Sesión iniciada» después de lo que ya hizo.
      const yaEmpezo = c.lineas.some((l) => l.texto.startsWith("Sesión de Claude Code iniciada"));
      if (typeof j.session_id === "string") c.sesion = j.session_id;
      // Los MCP que no conectaron, por su nombre: el informe dice cuál fue y si alguien lo usó.
      const caidosAhora = ((j.mcp_servers as { name?: string; status?: string }[] | undefined) ?? []).filter((m) => m?.name && m.status && m.status !== "connected" && m.status !== "pending").map((m) => String(m.name));
      if (caidosAhora.length) c.mcp = { caidos: [...new Set([...(c.mcp?.caidos ?? []), ...caidosAhora])], usados: c.mcp?.usados ?? [] };
      if (yaEmpezo) return;
      agregar(c, "info", `Sesión de Claude Code iniciada en ${j.cwd ?? c.proyecto}${j.model ? ` · ${j.model}` : ""}`);
      // Lo que cargó de verdad: si nikke aparece aquí, sus guardas están activas en esta corrida.
      const plugins = ((j.plugins as { name?: string }[] | undefined) ?? []).map((p) => p.name).filter((n): n is string => !!n && !n.startsWith("cc-plugin-"));
      if (plugins.length) agregar(c, plugins.includes("nikke") ? "error" : "info", `Plugins cargados: ${plugins.join(", ")}${plugins.includes("nikke") ? " (nikke está activo: sus guardas pueden frenar)" : ""}`);
    }
    else if (j.subtype === "post_turn_summary" && j.status_detail) c.resumen = String(j.status_detail);
    return;
  }
  if (tipo === "assistant") {
    const contenido = ((j.message as { content?: unknown[] })?.content ?? []) as Record<string, unknown>[];
    for (const b of contenido) {
      if (b.type === "text" && !deSubagente) agregar(c, "texto", String(b.text ?? ""));
      else if (b.type === "tool_use") {
        anotarActividad(c, b, deSubagente ? String(j.parent_tool_use_id) : null);
        const servidor = /^mcp__(.+?)__/.exec(String(b.name))?.[1];
        if (servidor && servidor !== "fabrica") c.mcp = { caidos: c.mcp?.caidos ?? [], usados: [...new Set([...(c.mcp?.usados ?? []), servidor])] };
        const d = describirHerramienta(String(b.name), (b.input ?? {}) as Record<string, unknown>);
        // De los subagentes solo interesa lo que cambia la fábrica, no cada lectura de archivo.
        if (!deSubagente || String(b.name).startsWith("mcp__fabrica__")) agregar(c, b.name === "Agent" || b.name === "Task" ? "agente" : "herramienta", d);
      }
    }
    return;
  }
  if (tipo === "user") {
    const contenido = ((j.message as { content?: unknown[] })?.content ?? []) as Record<string, unknown>[];
    for (const b of contenido) {
      if (b.type === "tool_result" && b.is_error && !deSubagente) agregar(c, "error", `rechazado: ${corto(typeof b.content === "string" ? b.content : JSON.stringify(b.content), 300)}`);
      if (b.type === "tool_result" && !deSubagente) cerrarActividad(c, String(b.tool_use_id ?? ""), typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? ""));
    }
    return;
  }
  if (tipo === "result" || typeof j.total_cost_usd === "number") {
    if (typeof j.total_cost_usd === "number") c.costoUsd = j.total_cost_usd;
    if (tipo === "result") c.resultado = resultadoDe(j);
    if (typeof j.session_id === "string") c.sesion ??= j.session_id;
    if (typeof j.result === "string" && j.result.trim()) agregar(c, "fin", j.result);
    if (j.is_error) agregar(c, "error", `La corrida terminó con error${j.subtype ? ` (${j.subtype})` : ""}.`);
    return j.is_error ? "error" : "ok";
  }
}

// ---- Qué plugins carga la corrida ---------------------------------------------------------------

/** El plugin `fabrica` que viaja con la aplicación. */
export const carpetaDelPlugin = () => path.join(/*turbopackIgnore: true*/ process.cwd(), "fabrica");

/**
 * Las carpetas de CLAUDE_CODE_PLUGIN_DIRS para la corrida. Sin nikke por defecto: sus guardas
 * piden la firma del dueño, y en una corrida sin interfaz nadie puede darla, así que solo frenan.
 * Tampoco otra copia del plugin `fabrica`: la de la aplicación va con --plugin-dir. Se pasa con
 * --settings (ver iniciarCorrida), y las sesiones normales de Claude Code no cambian.
 */
async function pluginsDeCorrida(conNikke: boolean): Promise<{ dirs: string[]; quitados: string[] }> {
  const dirs: string[] = [];
  const quitados: string[] = [];
  for (const { dir, nombre } of await carpetasDePlugins()) {
    if ((!conNikke && nombre === "nikke") || nombre === "fabrica") quitados.push(dir);
    else dirs.push(dir);
  }
  return { dirs, quitados };
}

// ---- Seguimiento: todo sale de los archivos, así sobrevive a un reinicio del servidor ----------

function vivo(pid?: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function nuevaVista(meta: Meta): Corrida {
  const c: Corrida = { id: meta.id, proyecto: meta.proyecto, tareas: meta.tareas, ...(meta.modelo ? { modelo: meta.modelo } : {}), inicio: meta.inicio, estado: "corriendo", ...(meta.conTelemetria ? { conTelemetria: true } : {}), lineas: [] };
  agregar(c, "info", meta.comando);
  if (meta.error) agregar(c, "error", meta.error);
  if (meta.detenidaPor) c.detenidaPor = meta.detenidaPor;
  return c;
}

const guardarMeta = (m: Meta) => fs.writeFile(archivoMeta(m.id), JSON.stringify(m, null, 2) + "\n");

async function ultimaCorrida(): Promise<Seguimiento | undefined> {
  const nombres = (await fs.readdir(dirLogs()).catch(() => [] as string[])).filter((n) => /^\d{8}T\d{6}\.json$/.test(n)).sort();
  const ultima = nombres.at(-1);
  if (!ultima) return;
  try {
    const meta = JSON.parse(await fs.readFile(path.join(dirLogs(), ultima), "utf8")) as Meta;
    return { meta, c: nuevaVista(meta), leido: 0, resto: "" };
  } catch {
    return;
  }
}

/** Lee lo nuevo de la salida y decide si la corrida sigue, terminó o se murió. */
async function ponerAlDia(s: Seguimiento) {
  const archivo = archivoSalida(s.meta.id);
  const st = await fs.stat(archivo).catch(() => undefined);
  if (st && st.size > s.leido) {
    const fh = await fs.open(archivo, "r");
    try {
      const buf = Buffer.alloc(st.size - s.leido);
      await fh.read(buf, 0, buf.length, s.leido);
      s.leido = st.size;
      const partes = (s.resto + buf.toString("utf8")).split(/\r?\n/);
      s.resto = partes.pop() ?? "";
      for (const p of partes) {
        const r = procesar(s.c, p);
        if (r) s.resultado = r;
      }
    } finally {
      await fh.close();
    }
  }

  if (s.c.estado !== "corriendo") return;
  // Ya terminada en una vida anterior del servidor: se muestra como quedó.
  if (s.meta.estado && s.meta.estado !== "corriendo") {
    s.c.estado = s.meta.estado;
    s.c.fin = s.meta.fin;
    // Releída de su archivo, la actividad tendría la hora de esta lectura: vale la que se guardó.
    if (s.meta.actividad) s.c.actividad = s.meta.actividad;
    return;
  }
  // Claude Code da un resultado cada vez que el orquestador se queda esperando a un agente en segundo
  // plano, y después sigue: la corrida termina cuando termina su proceso, y vale el último resultado.
  // Visto el 17 de octubre de 2026, en la primera corrida lanzada desde la aplicación.
  if (vivo(s.meta.pid)) return;
  if (s.resto) {
    const r = procesar(s.c, s.resto);
    if (r) s.resultado = r;
    s.resto = "";
  }
  const estado: EstadoCorrida = s.meta.detenida ? "detenida" : s.resultado === "ok" ? "terminada" : "fallida";
  if (!s.resultado && !s.meta.detenida) agregar(s.c, "error", "Claude Code se cerró sin dar un resultado.");
  s.c.estado = estado;
  s.c.fin = new Date().toISOString();
  agregar(s.c, "info", `Corrida ${estado}${typeof s.c.costoUsd === "number" ? ` · costo USD ${s.c.costoUsd.toFixed(2)}` : ""}`);
  s.meta.estado = estado;
  s.meta.fin = s.c.fin;
  if (typeof s.c.costoUsd === "number") s.meta.costoUsd = s.c.costoUsd;
  if (s.c.actividad?.length) s.meta.actividad = s.c.actividad;
  await guardarMeta(s.meta).catch(() => undefined);
  // Detenida o caída, su sesión no alcanzó a soltar lo que tenía tomado: se suelta aquí.
  if (s.c.sesion && s.meta.proyecto === (await raiz())) await liberarTomadasPor(s.c.sesion).catch(() => undefined);
  // El informe se escribe ahora y se rehace cuando alguien lo pide si llegó telemetría después: Claude
  // Code manda lo último al cerrarse, unos segundos después de su resultado.
  void import("./informes.ts").then((m) => m.guardarInforme(s.meta.id)).catch(() => undefined);
}

/** Una corrida cualquiera por su id, leída de sus archivos. `null` si no existe. */
export async function leerCorrida(id: string): Promise<Corrida | null> {
  if (!/^\d{8}T\d{6}$/.test(id)) return null;
  if (esSeguimiento(mem.actual) && mem.actual.meta.id === id) {
    await ponerAlDia(mem.actual);
    return mem.actual.c;
  }
  let meta: Meta;
  try {
    meta = JSON.parse(await fs.readFile(archivoMeta(id), "utf8")) as Meta;
  } catch {
    return null;
  }
  const s: Seguimiento = { meta, c: nuevaVista(meta), leido: 0, resto: "" };
  await ponerAlDia(s);
  return s.c;
}

/**
 * Lo que costaron hoy las corridas de un proyecto, según Claude Code: las que terminaron, con lo
 * anotado al terminar, y la que corre, con lo que lleva. Es la estimación de Claude Code, no la
 * factura.
 */
export async function gastoDeHoy(proyecto: string, ahora = Date.now()): Promise<number> {
  return (await gastoPorDia(proyecto, 1, ahora))[0]?.usd ?? 0;
}

/** Hasta cuántos días hacia atrás se cuenta el gasto. */
export const DIAS_DE_GASTO = 14;

/**
 * Lo que costaron las corridas de un proyecto cada día, de los últimos `dias` (hoy al final), con
 * los días sin gasto en cero. El día es el de su inicio, en la hora de este equipo. Las que
 * terminaron, con lo anotado al terminar; la que corre, con lo que lleva.
 */
export async function gastoPorDia(proyecto: string, dias = DIAS_DE_GASTO, ahora = Date.now()): Promise<{ dia: string; usd: number }[]> {
  const n = Math.max(1, Math.min(dias, 90));
  const lista = Array.from({ length: n }, (_, i) => ({ dia: new Date(ahora - (n - 1 - i) * 86_400_000).toLocaleDateString("sv"), usd: 0 }));
  const porDia = new Map(lista.map((d) => [d.dia, d]));
  const nombres = (await fs.readdir(dirLogs()).catch(() => [] as string[])).filter((x) => /^\d{8}T\d{6}\.json$/.test(x));
  for (const nombre of nombres) {
    try {
      const m = JSON.parse(await fs.readFile(path.join(dirLogs(), nombre), "utf8")) as Meta;
      const d = m.proyecto === proyecto ? porDia.get(new Date(m.inicio).toLocaleDateString("sv")) : undefined;
      if (!d) continue;
      const enCurso = esSeguimiento(mem.actual) && mem.actual.meta.id === m.id && !m.costoUsd ? await costoEnVivo(mem.actual) : undefined;
      d.usd += m.costoUsd ?? enCurso ?? 0;
    } catch {
      // Una corrida que no se puede leer no suma.
    }
  }
  return lista;
}

/** Las últimas corridas, de la más nueva a la más vieja, sin leer sus salidas. */
export async function listarCorridas(cuantas = 20): Promise<Pick<Meta, "id" | "proyecto" | "tareas" | "inicio" | "fin" | "estado" | "conTelemetria" | "habilidades">[]> {
  const nombres = (await fs.readdir(dirLogs()).catch(() => [] as string[])).filter((n) => /^\d{8}T\d{6}\.json$/.test(n)).sort().reverse().slice(0, cuantas);
  const metas = await Promise.all(
    nombres.map(async (n) => {
      try {
        const m = JSON.parse(await fs.readFile(path.join(dirLogs(), n), "utf8")) as Meta;
        return { id: m.id, proyecto: m.proyecto, tareas: m.tareas, inicio: m.inicio, fin: m.fin, estado: m.estado, conTelemetria: m.conTelemetria, ...(m.habilidades ? { habilidades: m.habilidades } : {}) };
      } catch {
        return null;
      }
    }),
  );
  return metas.filter((m): m is NonNullable<typeof m> => m !== null);
}

/** Una corrida de hoy, de cualquier línea, como la muestra la planta. */
export type CorridaDelDia = {
  id: string
  proyecto: string
  tareas: string[]
  inicio: string
  fin: string | null
  /** `null` si quedó sin cerrar y no es la que se sigue: no se inventa cómo terminó. */
  estado: EstadoCorrida | null
  /** La estimación de Claude Code; la que corre, con lo que lleva. */
  costoUsd: number | null
  /** Lo que se está haciendo ahora, si es la que corre: un encargo sin terminar por puesto. */
  trabajando: Pick<Actividad, "tarea" | "agente" | "que" | "desde">[]
}

/**
 * Las corridas que empezaron hoy, en la hora de este equipo, de todas las líneas, de la más vieja
 * a la más nueva. Solo lee sus metas (no sus salidas), salvo la que se sigue, que se pone al día.
 */
export async function corridasDelDia(ahora = Date.now()): Promise<CorridaDelDia[]> {
  const hoy = new Date(ahora).toLocaleDateString("sv");
  // El id es la hora UTC de inicio: el día de aquí cae, a lo sumo, un día antes o después.
  const dias = new Set([-1, 0, 1].map((d) => new Date(ahora + d * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "")));
  const nombres = (await fs.readdir(dirLogs()).catch(() => [] as string[])).filter((n) => /^\d{8}T\d{6}\.json$/.test(n) && dias.has(n.slice(0, 8))).sort();
  const actual = await corridaActual();
  const lista: CorridaDelDia[] = [];
  for (const nombre of nombres) {
    let m: Meta;
    try {
      m = JSON.parse(await fs.readFile(path.join(dirLogs(), nombre), "utf8")) as Meta;
    } catch {
      continue;
    }
    if (typeof m.inicio !== "string" || new Date(m.inicio).toLocaleDateString("sv") !== hoy) continue;
    const esLaActual = actual?.id === m.id && esSeguimiento(mem.actual);
    const estado = esLaActual ? actual.estado : (m.estado ?? null);
    const costoUsd = esLaActual && estado === "corriendo" ? await costoEnVivo(mem.actual!) : (m.costoUsd ?? (esLaActual ? (actual.costoUsd ?? null) : null));
    // Como en la columna: el último encargo de cada tarea, si no terminó.
    const ultimo = new Map<string, Actividad>();
    if (esLaActual && estado === "corriendo") for (const a of actual.actividad ?? []) if (a.tarea) ultimo.set(a.tarea, a);
    const trabajando = [...ultimo.values()].filter((a) => !a.hasta).map(({ tarea, agente, que, desde }) => ({ tarea, agente, que, desde }));
    lista.push({ id: m.id, proyecto: m.proyecto, tareas: Array.isArray(m.tareas) ? m.tareas : [], inicio: m.inicio, fin: (esLaActual ? actual.fin : m.fin) ?? null, estado, costoUsd, trabajando });
  }
  return lista;
}

/**
 * Lo que lleva gastado una corrida: lo que dijo Claude Code en su último resultado o, si llegó
 * más por la telemetría (que avisa llamada por llamada), eso. Es la estimación de Claude Code.
 */
async function costoEnVivo(s: Seguimiento): Promise<number> {
  const delResultado = s.c.costoUsd ?? 0;
  if (!s.meta.conTelemetria) return delResultado;
  const { leerTelemetria, resumirTelemetria } = await import("./telemetria.ts");
  const registros = await leerTelemetria(s.meta.id).catch(() => []);
  return Math.max(delResultado, registros.length ? resumirTelemetria(registros).costoUsd : 0);
}

/** Si un gasto llegó a un tope: el motivo, o `null`. Es lógica pura. */
export function topeAlcanzado(topes: { diarioUsd?: number; corridaUsd?: number } | undefined, gasto: { corrida: number; hoy: number }): string | null {
  const usd = (v: number) => `${v.toFixed(2).replace(".", ",")} USD`;
  if (topes?.corridaUsd && gasto.corrida >= topes.corridaUsd) return `la corrida llegó a ${usd(gasto.corrida)}, y el tope por corrida es ${usd(topes.corridaUsd)}`;
  if (topes?.diarioUsd && gasto.hoy >= topes.diarioUsd) return `hoy van ${usd(gasto.hoy)} en este proyecto, y el tope del día es ${usd(topes.diarioUsd)}`;
  return null;
}

/**
 * Lo que mira el vigía de la corrida en marcha: la pone al día (así su actividad lleva la hora de
 * verdad aunque nadie tenga la página abierta) y, si llegó a un tope de gasto, la detiene.
 * Devuelve el motivo si la detuvo.
 */
export async function vigilarLaCorrida(): Promise<string | null> {
  const c = await corridaActual();
  const s = mem.actual;
  if (!s || c?.estado !== "corriendo" || s.meta.detenida) return null;
  const topes = (await leerAjustes()).topes;
  if (!topes?.diarioUsd && !topes?.corridaUsd) return null;
  const motivo = topeAlcanzado(topes, { corrida: await costoEnVivo(s), hoy: await gastoDeHoy(s.meta.proyecto) });
  if (!motivo) return null;
  s.meta.detenidaPor = `Se detuvo sola: ${motivo}.`;
  s.c.detenidaPor = s.meta.detenidaPor;
  agregar(s.c, "error", s.meta.detenidaPor);
  await detenerCorrida();
  return motivo;
}

export async function corridaActual(): Promise<Corrida | null> {
  if (!esSeguimiento(mem.actual)) mem.actual = await ultimaCorrida();
  if (!mem.actual) return null;
  await ponerAlDia(mem.actual);
  return mem.actual.c;
}

/** Con qué se lanza Claude Code: su ruta exacta, y un `.cmd` o `.bat` de Windows por la consola. Es lógica pura. */
export function lanzadorDeClaude(bin: string, args: string[], plataforma: NodeJS.Platform = process.platform): { programa: string; argumentos: string[] } {
  return plataforma === "win32" && /\.(cmd|bat)$/i.test(bin) ? { programa: "cmd.exe", argumentos: ["/d", "/s", "/c", bin, ...args] } : { programa: bin, argumentos: args };
}

/**
 * El entorno de la corrida, sin lo que es de la aplicación: ninguna variable COMPANIA_ (sus claves
 * de Claude, de la voz, de YouTube…), ni ANTHROPIC_ (Claude Code usaría la API en vez de la
 * suscripción). La clave de Jev pasa con otro nombre, FABRICA_JEV_KEY, para que solo el plugin la
 * lea y las pruebas del proyecto no la vean. Las rutas de Codex y de Antigravity pasan como
 * FABRICA_CODEX_BIN y FABRICA_ANTIGRAVITY_BIN: el plugin los lanza por ahí. Es lógica pura.
 */
export function entornoDeLaCorrida(base: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(base)) if (!/^(COMPANIA_|ANTHROPIC_|FABRICA_)/.test(k) && k !== "TYPESAFE_AI_KEY") env[k] = v;
  if (base.TYPESAFE_AI_KEY?.trim()) env.FABRICA_JEV_KEY = base.TYPESAFE_AI_KEY;
  const { codex, antigravity } = agentesDeEsteEquipo(base);
  if (codex) env.FABRICA_CODEX_BIN = codex;
  if (antigravity) env.FABRICA_ANTIGRAVITY_BIN = antigravity;
  return env as NodeJS.ProcessEnv;
}

/**
 * El plugin instalado desde el marketplace de este repositorio (`.claude-plugin/marketplace.json`).
 * Una corrida lo apaga: va con la copia de la aplicación (--plugin-dir), y dos copias del mismo mod
 * registrarían dos veces cada herramienta.
 */
export const PLUGIN_INSTALADO = "fabrica@factoria";

/** La ruta de Claude Code en este equipo (la de la variable, o la del PATH), o `null`: sin ella no hay corridas. */
export const claudeCode = (entorno: NodeJS.ProcessEnv = process.env) => claudeCodeDeEsteEquipo(entorno)?.ruta ?? null;

export async function iniciarCorrida(opciones: { tareas?: string[]; modelo?: string; origen?: string | null }): Promise<Corrida> {
  if ((await corridaActual())?.estado === "corriendo") throw new Error("Ya hay una corrida en marcha. Espera a que termine o detenla.");
  const bin = claudeCode();
  if (!bin) throw new Error(SIN_CLAUDE_CODE);
  const proyecto = await raiz();
  if (!proyecto) throw new Error("Todavía no hay un proyecto elegido: elígelo en la configuración.");
  const textoConfig = await fs.readFile(path.join(proyecto, "factory", "config.md"), "utf8").catch(() => null);
  if (textoConfig === null) throw new Error("Este proyecto no tiene factory/config.md.");
  // Sin con qué verificar, cada tarea gasta agentes y termina esperando a una persona (19 de octubre de 2026).
  if (sinComandos(configDesde(textoConfig))) throw new Error(SIN_COMANDOS);
  // Sin rama de trabajo, las tareas salen de la rama de la raíz: si es protegida, todas irían a una persona.
  const enLaRaiz = (await ramaActual(proyecto)) ?? "";
  if (!configDesde(textoConfig).ramaTrabajo && esRamaProtegida(enLaRaiz)) throw new Error(`La raíz está en «${enLaRaiz}» y la fábrica no trabaja sobre esa rama: elige tu rama de trabajo en la configuración, o cámbiate a una rama tuya.`);
  // Con el tope del día alcanzado, no se lanza otra.
  const porTope = topeAlcanzado({ diarioUsd: (await leerAjustes()).topes?.diarioUsd }, { corrida: 0, hoy: await gastoDeHoy(proyecto) });
  if (porTope) throw new Error(`No se lanzó: ${porTope}. Súbelo en la configuración si quieres seguir.`);

  const tareas = (opciones.tareas ?? []).filter((t) => /^F-\d+$/.test(t));
  // El modelo del orquestador de Claude: el pedido para esta corrida, o el de la configuración.
  const modelo = esModeloDeClaude(opciones.modelo) ? opciones.modelo : ((await modeloDeLaCorrida()).modelo ?? undefined);
  const prompt = `/fabrica:correr${tareas.length ? " " + tareas.join(" ") : ""}`;
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--plugin-dir", carpetaDelPlugin()];
  if (modelo) args.push("--model", modelo);
  const modoPermisos = process.env.COMPANIA_FABRICA_MODO_PERMISOS?.trim();
  if (modoPermisos) args.push("--permission-mode", modoPermisos);

  const conNikke = !!(await leerAjustes()).corridaConNikke;
  const plugins = await pluginsDeCorrida(conNikke);
  const id = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  // Los agentes elegidos de un plugin que la corrida no carga (nikke) viajan aparte, sin sus guardas.
  const porRol = (await agentesDelProyecto())?.porRol;
  const defs = await definicionesDisponibles(proyecto, carpetaDelPlugin(), conNikke);
  // Con un catálogo de habilidades, cada etapa que tiene alguna lleva su agente con ellas cargadas
  // (`fabrica-hab-<rol>`, que el plugin prueba primero). Sin catálogo, como siempre.
  const porEtapa = porRol ? await habilidadesDeLaCorrida(proyecto).catch(() => null) : null;
  // Las Nikkes de esas habilidades van enteras al agente de su etapa (fabrica/docs/Plan-Spec.md, decisión 8).
  const nikkes = porEtapa ? await textosDeNikkes(Object.values(porEtapa).flatMap((l) => l.flatMap((h) => h.nikkes ?? []))) : new Map<string, string>();
  const inyectados = { ...agentesParaInyectar(porRol ?? {}, defs), ...(porRol && porEtapa ? agentesConHabilidades(porRol, defs, porEtapa, nikkes) : {}) };
  // Label viaja en cada corrida: escribe lo que se lee de cada tarea aprobada, el texto del PR de una
  // sencilla o lo que él prueba en una grande (fabrica/docs/Plan-Integracion.md, etapa 4). El agente
  // de salida ya no corre en cada tarea: vuelve cuando llegue producción con la CI/CD de cada línea.
  const archivoDeLabel = archivoDelAgenteDeAnuncio(carpetaDelPlugin());
  const defDeLabel = agenteDesde(await fs.readFile(archivoDeLabel, "utf8").catch(() => ""), archivoDeLabel);
  Object.assign(inyectados, agenteDeAnuncio(defDeLabel, await textosDeNikkes(defDeLabel?.nikkes ?? [])));
  // El retrabajo, con Snow White y Rapunzel y las habilidades de construcción de la línea (etapa 6).
  const archivoDeRetrabajo = archivoDelAgenteDeRetrabajo(carpetaDelPlugin());
  const defDeRetrabajo = agenteDesde(await fs.readFile(archivoDeRetrabajo, "utf8").catch(() => ""), archivoDeRetrabajo);
  Object.assign(inyectados, agenteDeRetrabajo(defDeRetrabajo, (porEtapa?.construccion ?? []).map((h) => h.nombre), await textosDeNikkes(defDeRetrabajo?.nikkes ?? [])));
  if (Object.keys(inyectados).length) {
    await fs.mkdir(dirLogs(), { recursive: true });
    const archivo = path.join(dirLogs(), `${id}.agentes.json`);
    await fs.writeFile(archivo, JSON.stringify(inyectados, null, 2) + "\n");
    args.push("--agents", archivo);
  }
  // La telemetría de la corrida viene a esta aplicación: costo y tokens por llamada, errores de la
  // API, herramientas, permisos negados, líneas y commits. Sale el informe de la corrida.
  const destino = destinoDeTelemetria(opciones.origen);
  const telemetria = destino ? entornoDeTelemetria(id, destino) : {};
  // La memoria de la planta vive en la aplicación: el plugin lee su ficha de esa carpeta (la del proyecto, de su factory/memoria/).
  // Las habilidades de cada etapa con su huella al empezar: el plugin las anota en cada tarea y ve si cambiaron.
  const conHuella = porEtapa ? habilidadesConHuella(porEtapa) : null;
  const env: NodeJS.ProcessEnv = {
    ...entornoDeLaCorrida(process.env),
    CLAUDE_CODE_PLUGIN_DIRS: plugins.dirs.join(path.delimiter),
    FABRICA_MEMORIA_PLANTA: vaultDeLaPlanta(),
    ...(conHuella ? { FABRICA_HABILIDADES: JSON.stringify(conHuella) } : {}),
    // El mod le dice al orquestador que lance a Label después de clasificar cada tarea aprobada.
    ...(inyectados[AGENTE_DE_ANUNCIO as keyof typeof inyectados] ? { FABRICA_ANUNCIO: "1" } : {}),
    // Y que lance el de retrabajo cuando una tarea vuelve por un BLOQUEANTE o por la verificación.
    ...(inyectados[AGENTE_DE_RETRABAJO as keyof typeof inyectados] ? { FABRICA_RETRABAJO: "1" } : {}),
    ...telemetria,
  };
  if (destino) for (const k of VARIABLES_CON_CONTENIDO) delete env[k];
  // La variable sola no alcanza: Claude Code aplica el `env` de ~/.claude/settings.json encima del
  // del proceso, y nikke volvería. --settings tiene más prioridad que el settings.json del usuario.
  // Lo mismo con la telemetría, y con los hooks de función, que el plugin necesita. Y la copia
  // instalada del plugin, si la hay, va apagada: la de la aplicación es la que corre.
  const encima = { CLAUDE_CODE_PLUGIN_DIRS: env.CLAUDE_CODE_PLUGIN_DIRS ?? "", CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1", ...telemetria };
  args.push("--settings", JSON.stringify({ env: encima, enabledPlugins: { [PLUGIN_INSTALADO]: false } }));
  const meta: Meta = {
    id,
    proyecto,
    tareas,
    ...(modelo ? { modelo } : {}),
    inicio: new Date().toISOString(),
    comando:
      // Los ajustes que van con --settings son largos: en la línea del comando se resumen.
      `${bin} ${args.map((a) => (a.startsWith("{") ? "'{…}'" : /\s/.test(a) ? `"${a}"` : a)).join(" ")}` +
      (plugins.quitados.length ? `\nSin el mod nikke ni otra copia del plugin: sus guardas no cargan en esta corrida.` : "") +
      (Object.keys(inyectados).length ? `\nAgentes que viajan con la corrida: ${Object.keys(inyectados).join(", ")}.` : "") +
      (destino ? `\nCon telemetría hacia ${destino}: al terminar queda su informe.` : ""),
    pluginDirs: env.CLAUDE_CODE_PLUGIN_DIRS,
    // Para el informe de rendimiento: qué habilidades tuvo cada etapa en esta corrida. Sin rutas.
    ...(conHuella ? { habilidades: Object.fromEntries(Object.entries(conHuella).map(([e, l]) => [e, l.map(({ nombre, huella, origen }) => ({ nombre, huella, origen }))])) } : {}),
    ...(destino ? { conTelemetria: true } : {}),
    estado: "corriendo",
  };
  await fs.mkdir(dirLogs(), { recursive: true });

  // Proceso aparte (detached) con la salida directo a un archivo: no cuelga del servidor.
  const salida = await fs.open(archivoSalida(meta.id), "a");
  try {
    const { programa, argumentos } = lanzadorDeClaude(bin, args);
    const hijo = spawn(programa, argumentos, { cwd: proyecto, env, detached: true, windowsHide: true, stdio: ["ignore", salida.fd, salida.fd] });
    meta.pid = hijo.pid;
    hijo.on("error", (err) => {
      meta.error = `No pude lanzar Claude Code (${bin}): ${err.message}. Revisa COMPANIA_CLAUDE_CODE_BIN, o el «claude» de tu PATH.`;
      if (mem.actual?.meta.id === meta.id) agregar(mem.actual.c, "error", meta.error);
      void guardarMeta(meta).catch(() => undefined);
    });
    hijo.unref();
  } catch (err) {
    meta.error = `No pude lanzar Claude Code (${bin}): ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    await salida.close();
  }
  await guardarMeta(meta);
  mem.actual = { meta, c: nuevaVista(meta), leido: 0, resto: "" };
  await ponerAlDia(mem.actual);
  return mem.actual.c;
}

/**
 * Que la fábrica siga con unas tareas después de un veredicto o una respuesta suya: si no hay corrida en marcha, la
 * lanza para ellas; si hay una, las deja anotadas y el vigía las lanza cuando esa termine (la que
 * corre también puede tomarlas antes, al releer el estado). Antes de lanzar, el mod nikke se apaga,
 * como en cualquier corrida desde la aplicación.
 */
export async function continuarTareas(tareas: string[], origen: string | null): Promise<{ encolada: boolean; corrida: Corrida | null }> {
  const validas = tareas.filter((t) => /^F-\d+$/.test(t));
  if (!validas.length) throw new Error("No hay tareas que continuar.");
  if ((await corridaActual())?.estado === "corriendo") {
    await anotarPorRetomar(validas, origen);
    return { encolada: true, corrida: await corridaActual() };
  }
  if ((await leerAjustes()).corridaConNikke) await fijarCorridaConNikke(false);
  return { encolada: false, corrida: await iniciarCorrida({ tareas: validas, origen }) };
}

/**
 * Lo que quedó anotado para retomar, lanzado cuando ya no corre nada. Solo las tareas que siguen
 * en aprobación esperando su veredicto, o esperándolo con una respuesta suya que nadie retomó: lo
 * que la corrida anterior ya tomó no se vuelve a correr.
 * Lo llama el vigía. Devuelve las tareas que lanzó.
 */
export async function lanzarLoPorRetomar(): Promise<string[]> {
  if ((await corridaActual())?.estado === "corriendo") return [];
  const anotado = await tomarPorRetomar();
  if (!anotado || anotado.raiz !== (await raiz())) return [];
  const i = await instantanea();
  const siguen = anotado.tareas.filter((id) => i?.tareas.some((t) => t.id === id && (t.estado === "aprobacion" || (t.estado === "necesita-humano" && t.respuesta))));
  if (!siguen.length) return [];
  if ((await leerAjustes()).corridaConNikke) await fijarCorridaConNikke(false);
  await iniciarCorrida({ tareas: siguen, origen: anotado.origen });
  return siguen;
}

export async function detenerCorrida(): Promise<Corrida | null> {
  const c = await corridaActual();
  const s = mem.actual;
  if (!s || c?.estado !== "corriendo" || !s.meta.pid) return c;
  s.meta.detenida = true;
  await guardarMeta(s.meta);
  agregar(s.c, "info", "Deteniendo la corrida…");
  // El árbol entero: Claude Code lanza subprocesos (agentes, shells).
  cerrarProceso(s.meta.pid);
  return s.c;
}
