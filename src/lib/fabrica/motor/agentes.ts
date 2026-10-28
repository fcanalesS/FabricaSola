// Solo servidor: los agentes que la fábrica puede poner en cada etapa, y cómo llegan a la corrida.
// Él los elige en la configuración, por proyecto (las claves `agente_<rol>` de factory/config.md).
// Los de un plugin que la corrida no carga (nikke: sus guardas piden una firma que nadie da sin
// interfaz) viajan con `--agents`: llega el agente, sin las guardas de su plugin. Lo pidió él el
// 19 de octubre de 2026, para usar en paralelo los agentes que tiene instalados.
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROLES_DE_AGENTE, type RolDeAgente } from "../modelos.ts";
import { nikkesDe } from "../habilidades/formato.ts";
import { partir } from "./formato.ts";

/** Un agente que se puede elegir. `enCorridas`: `si` si la corrida lo tiene; `inyectado` si viaja con --agents. */
export type AgenteDisponible = { nombre: string; origen: string; descripcion: string; enCorridas: "si" | "inyectado" };

/** Un agente leído de su archivo: el frontmatter y el cuerpo, que es su prompt. */
/** `nikkes`: las que el agente nombra en su frontmatter (`nikkes:`), cuyos archivos le pasa la corrida enteros. */
export type DefinicionDeAgente = { nombre: string; descripcion: string; prompt: string; tools: string[]; model: string | null; archivo: string; nikkes?: string[] };

/** Lee un agente de su .md. `null` si no tiene nombre ni cuerpo. Es lógica pura. */
export function agenteDesde(texto: string, archivo: string): DefinicionDeAgente | null {
  const { datos, cuerpo } = partir(texto);
  const nombre = (datos.name ?? path.basename(archivo, ".md")).trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(nombre) || !cuerpo.trim()) return null;
  return {
    nombre,
    descripcion: (datos.description ?? "").trim(),
    prompt: cuerpo.trim(),
    tools: (datos.tools ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    model: datos.model?.trim() && datos.model.trim() !== "inherit" ? datos.model.trim() : null,
    archivo,
    ...(nikkesDe(datos.nikkes).length ? { nikkes: nikkesDe(datos.nikkes) } : {}),
  };
}

const leer = (p: string) => fs.readFile(p, "utf8").catch(() => undefined);

async function agentesEn(dir: string, prefijo: string | null): Promise<DefinicionDeAgente[]> {
  const nombres = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".md")).sort();
  const out: DefinicionDeAgente[] = [];
  for (const n of nombres) {
    const a = agenteDesde((await leer(path.join(dir, n))) ?? "", path.join(dir, n));
    if (a) out.push({ ...a, nombre: prefijo ? `${prefijo}:${a.nombre}` : a.nombre });
  }
  return out;
}

/** Las carpetas de plugins de este equipo (CLAUDE_CODE_PLUGIN_DIRS, del entorno y de ~/.claude/settings.json), con su nombre. */
export async function carpetasDePlugins(): Promise<{ dir: string; nombre: string }[]> {
  let deSettings = "";
  try {
    const s = JSON.parse((await leer(path.join(os.homedir(), ".claude", "settings.json"))) ?? "") as { env?: Record<string, string> };
    deSettings = s.env?.CLAUDE_CODE_PLUGIN_DIRS ?? "";
  } catch {
    // Sin settings legible: queda lo del entorno.
  }
  const dirs = [...new Set([process.env.CLAUDE_CODE_PLUGIN_DIRS ?? "", deSettings].flatMap((v) => v.split(path.delimiter)).map((d) => d.trim()).filter(Boolean))];
  const out: { dir: string; nombre: string }[] = [];
  for (const dir of dirs) {
    let nombre = "";
    try {
      nombre = (JSON.parse((await leer(path.join(dir, ".claude-plugin", "plugin.json"))) ?? "") as { name?: string }).name ?? "";
    } catch {
      // Una carpeta sin manifiesto se deja como está.
    }
    out.push({ dir, nombre });
  }
  return out;
}

/** Los plugins instalados con `claude plugin install`: los carga toda sesión, también la corrida. */
async function pluginsInstalados(): Promise<{ dir: string; nombre: string }[]> {
  try {
    const j = JSON.parse((await leer(path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json"))) ?? "") as { plugins?: Record<string, { installPath?: string }[]> };
    return Object.entries(j.plugins ?? {}).flatMap(([clave, v]) => (Array.isArray(v) ? v : []).filter((i) => i.installPath).map((i) => ({ dir: i.installPath!, nombre: clave.split("@")[0]! })));
  } catch {
    return [];
  }
}

/**
 * Todos los agentes que se pueden poner en una etapa: los de la fábrica (de la aplicación), los del
 * usuario, los del proyecto y los de sus plugins. `conNikke`: si la corrida carga nikke; si no, los
 * suyos se inyectan. La fábrica y nikke no se repiten desde otra copia.
 */
export async function definicionesDisponibles(raiz: string | null, carpetaDelPlugin: string, conNikke: boolean): Promise<(DefinicionDeAgente & { origen: string; enCorridas: "si" | "inyectado" })[]> {
  const out: (DefinicionDeAgente & { origen: string; enCorridas: "si" | "inyectado" })[] = [];
  const sumar = (lista: DefinicionDeAgente[], origen: string, enCorridas: "si" | "inyectado") => {
    for (const a of lista) if (!out.some((x) => x.nombre === a.nombre)) out.push({ ...a, origen, enCorridas });
  };
  sumar(await agentesEn(path.join(carpetaDelPlugin, "agents"), "fabrica"), "la fábrica", "si");
  if (raiz) sumar(await agentesEn(path.join(raiz, ".claude", "agents"), null), "el proyecto", "si");
  sumar(await agentesEn(path.join(os.homedir(), ".claude", "agents"), null), "tus agentes", "si");
  for (const p of [...(await carpetasDePlugins()), ...(await pluginsInstalados())]) {
    if (!p.nombre || p.nombre === "fabrica") continue;
    sumar(await agentesEn(path.join(p.dir, "agents"), p.nombre), p.nombre, p.nombre === "nikke" && !conNikke ? "inyectado" : "si");
  }
  return out;
}

/** Lo que se muestra de cada agente: sin su prompt ni su ruta. */
export const disponibles = (defs: Awaited<ReturnType<typeof definicionesDisponibles>>): AgenteDisponible[] =>
  defs.map((d) => ({ nombre: d.nombre, origen: d.origen, descripcion: d.descripcion.slice(0, 300), enCorridas: d.enCorridas }));

// ---- Las habilidades de cada etapa ---------------------------------------------------------------

/** Los que el plugin prueba antes del suyo cuando el rol está en `auto` (fabrica/hooks/tareas.ts, `ROLES`). */
const PREFERIDOS: Record<RolDeAgente, readonly string[]> = {
  spec: [],
  construccion: ["nikke:centi-implementacion"],
  revision_codigo: ["nikke:anis-revision"],
  revision_seguridad: ["nikke:crow-abuso"],
  ui: [],
  aprobacion: [],
};

/** La etapa del catálogo de habilidades de cada rol: los tres revisores comparten `revision`. La misma del plugin. */
export const ETAPA_DEL_ROL: Record<RolDeAgente, "spec" | "construccion" | "revision" | "aprobacion"> = {
  spec: "spec",
  construccion: "construccion",
  revision_codigo: "revision",
  revision_seguridad: "revision",
  ui: "revision",
  aprobacion: "aprobacion",
};

/**
 * Las herramientas del validador de la Ley 21.719 (`ley21719-validator`, un servidor MCP de este
 * equipo) que analizan código: reciben un texto y no se conectan a nada. La que se conecta a una
 * base de datos con una cadena de conexión (`validate_sql_server_instance`) queda fuera. Las lleva
 * solo el revisor de seguridad: lo decidió él el 27 de octubre de 2026.
 */
export const HERRAMIENTAS_DEL_VALIDADOR = [
  "mcp__ley21719-validator__validate_csharp_backend",
  "mcp__ley21719-validator__validate_frontend",
  "mcp__ley21719-validator__validate_sql_ddl",
] as const;

/**
 * Las herramientas con que viaja el agente de un rol: las de su archivo, más la del veredicto en
 * aprobación y las del validador en seguridad. Una lista vacía quiere decir «todas»: no se toca,
 * porque sumarle algo la acotaría. Es lógica pura.
 */
export function herramientasDelRol(rol: RolDeAgente, tools: readonly string[]): string[] {
  if (!tools.length) return [];
  const extra: readonly string[] = rol === "aprobacion" ? ["mcp__fabrica__aprobar"] : rol === "revision_seguridad" ? HERRAMIENTAS_DEL_VALIDADOR : [];
  return [...tools, ...extra.filter((t) => !tools.includes(t))];
}

/** El agente de un rol con sus habilidades cargadas. El plugin lo prueba primero (`fabrica/hooks/habilidades.ts`). */
export const nombreConHabilidades = (rol: RolDeAgente) => `fabrica-hab-${rol.replace(/_/g, "-")}`;

type DefinicionEnCorrida = DefinicionDeAgente & { enCorridas: "si" | "inyectado" };

/**
 * El agente que la corrida usaría para un rol, como lo resuelve el plugin: el elegido (o, en
 * `auto`, el preferido que la corrida tenga) y si no, el de la fábrica. Uno que viaja con
 * `--agents` cuenta solo si él lo eligió. `null` si no hay ninguno. Es lógica pura.
 */
export function agenteDelRol(rol: RolDeAgente, valor: string, defs: readonly DefinicionEnCorrida[]): DefinicionEnCorrida | null {
  const lista = valor === "auto" ? [...PREFERIDOS[rol], ROLES_DE_AGENTE[rol].defecto] : [valor, ROLES_DE_AGENTE[rol].defecto];
  for (const nombre of lista) {
    const d = defs.find((x) => x.nombre === nombre);
    if (d && (d.enCorridas === "si" || nombre === valor)) return d;
  }
  return null;
}

/**
 * El prompt del agente de una etapa con las Nikkes de sus habilidades: el archivo entero de cada
 * una, tal como lo escribió él, con su historia, su voz y sus reglas. No se resume ni se corta: es
 * la decisión del 26 de octubre de 2026 (fabrica/docs/Plan-Spec.md, decisión 8). Su voz va solo al
 * abrir y al cerrar el resumen; lo que el agente escribe en el archivo de la tarea va neutro. Una
 * Nikke que no está en la carpeta de nikke se nombra como faltante. Es lógica pura.
 */
export function conSusNikkes(prompt: string, nikkes: readonly string[], textos: ReadonlyMap<string, string>): string {
  if (!nikkes.length) return prompt;
  const halladas = nikkes.filter((n) => textos.has(n));
  const faltan = nikkes.filter((n) => !textos.has(n));
  const partes = [
    prompt,
    "",
    "## Las Nikkes de tus habilidades",
    "",
    "Tus habilidades de esta etapa trabajan con estas Nikkes. Van sus archivos enteros, tal como los escribió él: su historia, su voz, su escuadrón y sus reglas.",
    "Aplica su método desde tu etapa: lo que ellas buscarían en el código ya escrito, tú lo pides o lo compruebas como dice tu habilidad.",
    "",
    "- **Su voz sale solo al abrir y al cerrar tu resumen final**, una línea cada una, como dicen sus propias reglas. Lo que escribes en el archivo de la tarea va técnico y neutro: sin su voz, sus nombres ni su lore, porque lo leen otros agentes.",
    "- **Tus límites mandan sobre los suyos.** Lo que ellas hacen y tú no puedes (correr, medir, editar otros archivos, revisar otro repositorio) no lo haces.",
    "- **Sus herramientas propias (`mcp__nikke__*`) no se usan aquí:** esperan una firma y la corrida quedaría parada. Lo que ellas entregarían con una herramienta, tú lo escribes en tu entrega.",
    ...(faltan.length ? [`- No llegaron, porque no están en la carpeta de nikke de este equipo: ${faltan.join(", ")}. Trabaja sin ellas y dilo en tu resumen.`] : []),
    ...halladas.flatMap((n) => ["", `### ${n}`, "", textos.get(n)!.replace(/\r\n?/g, "\n").trim()]),
  ];
  return partes.join("\n");
}

/** La carpeta de agentes del mod nikke en este equipo, o `null` si no está. */
export async function carpetaDeNikke(): Promise<string | null> {
  const p = [...(await carpetasDePlugins()), ...(await pluginsInstalados())].find((x) => x.nombre === "nikke");
  return p ? path.join(p.dir, "agents") : null;
}

/**
 * Los archivos enteros de esas Nikkes, leídos ahora de la carpeta de nikke: sin copiarlos a ningún
 * lado ni tocarlos. Solo nombres con forma válida y archivos que están justo en esa carpeta; los
 * demás no se leen. Solo para el servidor.
 */
export async function textosDeNikkes(nombres: readonly string[], dir: string | null = null): Promise<Map<string, string>> {
  const carpeta = dir ?? (await carpetaDeNikke());
  const out = new Map<string, string>();
  if (!carpeta) return out;
  for (const n of new Set(nombres)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(n)) continue;
    const texto = await leer(path.join(carpeta, `${n}.md`));
    if (texto?.trim()) out.set(n, texto);
  }
  return out;
}

/**
 * Lo que viaja con `--agents` para que cada etapa con habilidades tenga su agente con ellas
 * cargadas (`skills:`): una copia del agente que usaría, con el nombre fijo que el plugin prueba
 * primero. Las etapas sin habilidades no llevan nada: usan el de siempre. Es lógica pura.
 */
export function agentesConHabilidades(
  porRol: Record<RolDeAgente, string>,
  defs: readonly DefinicionEnCorrida[],
  porEtapa: Record<string, readonly { nombre: string; nikkes?: readonly string[] }[]>,
  textosDeNikkes: ReadonlyMap<string, string> = new Map(),
): Record<string, { description: string; prompt: string; tools?: string[]; model?: string; skills: string[] }> {
  const out: Record<string, { description: string; prompt: string; tools?: string[]; model?: string; skills: string[] }> = {};
  for (const rol of Object.keys(ROLES_DE_AGENTE) as RolDeAgente[]) {
    const skills = [...new Set((porEtapa[ETAPA_DEL_ROL[rol]] ?? []).map((h) => h.nombre))];
    if (!skills.length) continue;
    const d = agenteDelRol(rol, porRol[rol] ?? "auto", defs);
    if (!d) continue;
    const tools = herramientasDelRol(rol, d.tools);
    // Si el agente ya es una Nikke (Centi como constructor), su archivo es su prompt: no va otra vez.
    const propia = d.nombre.startsWith("nikke:") ? d.nombre.slice("nikke:".length) : null;
    const nikkes = [...new Set((porEtapa[ETAPA_DEL_ROL[rol]] ?? []).flatMap((h) => h.nikkes ?? []))].filter((n) => n !== propia);
    const prompt = conSusNikkes(d.prompt, nikkes, textosDeNikkes);
    out[nombreConHabilidades(rol)] = { description: d.descripcion || d.nombre, prompt, ...(tools.length ? { tools } : {}), ...(d.model ? { model: d.model } : {}), skills };
  }
  return out;
}

/**
 * Lo que viaja con `--agents` para que la corrida tenga los agentes elegidos de un plugin que no
 * carga: cada uno con su nombre sin el del plugin (el mod también los busca así). El de
 * aprobación lleva además la herramienta con que registra su veredicto, y el de seguridad las del
 * validador (`herramientasDelRol`). Es lógica pura.
 */
export function agentesParaInyectar(elegidos: Partial<Record<RolDeAgente, string>>, defs: readonly (DefinicionDeAgente & { enCorridas: "si" | "inyectado" })[]): Record<string, { description: string; prompt: string; tools?: string[]; model?: string }> {
  const out: Record<string, { description: string; prompt: string; tools?: string[]; model?: string }> = {};
  for (const rol of Object.keys(ROLES_DE_AGENTE) as RolDeAgente[]) {
    const d = defs.find((x) => x.nombre === elegidos[rol] && x.enCorridas === "inyectado");
    if (!d) continue;
    const nombre = d.nombre.split(":").at(-1)!;
    const tools = herramientasDelRol(rol, d.tools);
    out[nombre] = { description: d.descripcion || nombre, prompt: d.prompt, ...(tools.length ? { tools } : {}), ...(d.model ? { model: d.model } : {}) };
  }
  return out;
}

// ---- El agente de salida a producción ------------------------------------------------------------

/** El nombre con que viaja el agente de salida. El mod acepta su decisión solo de él. */
export const AGENTE_DE_SALIDA = "fabrica-salida";

/** Dónde está su definición: una plantilla que usa solo la aplicación, para que no aparezca entre los agentes que se eligen por etapa. */
export const archivoDelAgenteDeSalida = (carpetaDelPlugin: string) => path.join(carpetaDelPlugin, "plantillas", "agentes", "salida.md");

/**
 * Lo que viaja con `--agents` para el agente de salida (fabrica/docs/Plan-Aprobador.md, etapa 4):
 * su definición con los archivos enteros de sus Nikkes (Viper y Marian), como los agentes con
 * habilidades. Sin definición, nada. Es lógica pura.
 */
export function agenteDeSalida(def: DefinicionDeAgente | null, textos: ReadonlyMap<string, string>): Record<string, { description: string; prompt: string; tools?: string[]; model?: string }> {
  return agenteDePlantilla(AGENTE_DE_SALIDA, def, textos);
}

// ---- Label: lo que se lee sin mirar el código ------------------------------------------------------

/** El nombre con que viaja Label. El mod acepta su texto solo de él (fabrica/hooks/tareas.ts, el mismo nombre). */
export const AGENTE_DE_ANUNCIO = "fabrica-anuncio";

/** Dónde está su definición: una plantilla que usa solo la aplicación, como la del agente de salida. */
export const archivoDelAgenteDeAnuncio = (carpetaDelPlugin: string) => path.join(carpetaDelPlugin, "plantillas", "agentes", "anuncio.md");

/**
 * Lo que viaja con `--agents` para Label (fabrica/docs/Plan-Integracion.md, etapa 4): su definición
 * con el archivo entero de su Nikke. Sin definición, nada. Es lógica pura.
 */
export function agenteDeAnuncio(def: DefinicionDeAgente | null, textos: ReadonlyMap<string, string>): Record<string, { description: string; prompt: string; tools?: string[]; model?: string }> {
  return agenteDePlantilla(AGENTE_DE_ANUNCIO, def, textos);
}

// ---- El retrabajo: Snow White y Rapunzel -----------------------------------------------------------

/** El nombre con que viaja el agente de retrabajo. El mod lo cuenta como de la etapa de construcción. */
export const AGENTE_DE_RETRABAJO = "fabrica-retrabajo";

/** Dónde está su definición: una plantilla que usa solo la aplicación. */
export const archivoDelAgenteDeRetrabajo = (carpetaDelPlugin: string) => path.join(carpetaDelPlugin, "plantillas", "agentes", "retrabajo.md");

/**
 * Lo que viaja con `--agents` para el retrabajo (fabrica/docs/Plan-Integracion.md, etapa 6): su
 * definición con los archivos enteros de Snow White y Rapunzel, y las habilidades de construcción
 * de la línea (`skills:`). Las Nikkes de las especialidades de construcción no van: el retrabajo
 * corrige lo bloqueante, y sus habilidades ya traen el estándar de la línea. Sin `model`: lo pone el
 * orquestador, el de la construcción de la tarea. Sin definición, nada. Es lógica pura.
 */
export function agenteDeRetrabajo(
  def: DefinicionDeAgente | null,
  skills: readonly string[],
  textos: ReadonlyMap<string, string>,
): Record<string, { description: string; prompt: string; tools?: string[]; skills?: string[] }> {
  if (!def) return {};
  const unicas = [...new Set(skills)];
  return {
    [AGENTE_DE_RETRABAJO]: {
      description: def.descripcion || def.nombre,
      prompt: conSusNikkes(def.prompt, def.nikkes ?? [], textos),
      ...(def.tools.length ? { tools: def.tools } : {}),
      ...(unicas.length ? { skills: unicas } : {}),
    },
  };
}

/** Un agente de una plantilla de la fábrica, con el nombre con que viaja y los archivos enteros de sus Nikkes. */
function agenteDePlantilla(nombre: string, def: DefinicionDeAgente | null, textos: ReadonlyMap<string, string>): Record<string, { description: string; prompt: string; tools?: string[]; model?: string }> {
  if (!def) return {};
  return {
    [nombre]: {
      description: def.descripcion || def.nombre,
      prompt: conSusNikkes(def.prompt, def.nikkes ?? [], textos),
      ...(def.tools.length ? { tools: def.tools } : {}),
      ...(def.model ? { model: def.model } : {}),
    },
  };
}
