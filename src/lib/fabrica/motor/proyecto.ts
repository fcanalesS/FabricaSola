import { promises as fs } from "node:fs";
import path from "node:path";
import { carpetaDeDatos } from "../../datos.ts";
import { cerrarProceso } from "../../servicios/procesos.ts";
import { esModeloDeRol, esNombreDeAgente, esRolDeAgente, modeloDeRolDesde, PARALELO, ROLES_DE_AGENTE, type ModeloDeRol, type RolDeAgente } from "../modelos.ts";
import { detenidasDesde, eligeModeloDeConstruccion, eligeModeloDeSpec } from "../planta/lectura.ts";
import { reglasDesde, revisarNotas, revisarReglas, type Reglas } from "../reglas.ts";
import { NOMBRES_DE_COMANDO, revisarComandos, type ComandosDelProyecto, type PruebaDeComando } from "../verificacion.ts";
import { colaDe, detectarComandos, enShell, entornoDelProyecto, hayQueLeer, type ArchivoDelProyecto } from "./comandos.ts";
import { anotar, anotarRespuestaEn, cicloEn, configDesde, eventosDesde, partir, siguienteId, slug, tareaDesde, tareaNueva, unir, veredictoDesde, type Datos } from "./formato.ts";
import type { TareaPropuesta } from "./requerimientos.ts";
import { hallazgosMenores, pedidoDeDeuda, seccionDe } from "./deuda.ts";
import { agregarLinea, lineaPorId, lineasDe, mismaRaiz, quitarLinea, type Linea } from "./lineas.ts";
import { lineaDeDebioEsperar, lineasDeJev, marcadasConDebioEsperar } from "./jev.ts";
import { esEstado, type Config, type Estado, type Evento, type HallazgoDeDeuda, type Instantanea, type Tarea, type Veredicto } from "./tipos.ts";

/**
 * El proyecto que mira la fábrica, dentro de la aplicación: lee su `factory/`
 * y escribe lo poco que el contrato del plugin deja escribir desde fuera (una
 * respuesta, un veredicto, tareas nuevas). El estado de una tarea lo cambia
 * solo el plugin. Solo para el servidor.
 *
 * Viene del orquestador de Factory-IA, que fue la prueba de concepto: él
 * pidió el 17 de octubre de 2026 que la fábrica viviera en la aplicación, sin
 * levantar otro servidor. Quedaron fuera la demo, el teléfono y el sondeo
 * para las pestañas del orquestador: la Columna pregunta sola.
 */

const EVENTOS_EN_INSTANTANEA = 200;

/** Donde la fábrica guarda lo suyo en este equipo: los ajustes y las corridas. No entra al repositorio. */
export const carpetaDeLaFabrica = () => carpetaDeDatos();
const archivoAjustes = () => path.join(carpetaDeLaFabrica(), "ajustes.json");

// ---- Ajustes: qué líneas hay y cuál se mira ---------------------------------------------------------

export type Ajustes = {
  /**
   * Las líneas de producción: los proyectos con `factory/` que conoce la fábrica. Unos ajustes de
   * antes, con un solo proyecto en `raiz`, se leen como una línea (ver `lineas.ts`) y se guardan
   * así desde el próximo cambio.
   */
  lineas?: Linea[];
  /** La línea que miran la Columna y la configuración, y donde corren las corridas. */
  lineaActiva?: string;
  /** Cargar el mod nikke en las corridas. Va apagado: sus guardas piden una firma que nadie da en una corrida sola. */
  corridaConNikke?: boolean;
  /** El modelo del orquestador de Claude en las corridas. Sin él, el de Claude Code. */
  modelo?: string;
  /** Si el teléfono suena solo cuando algo lo espera. Va apagado: cada llamada cuesta. */
  llamarSola?: boolean;
  /**
   * Las tareas a las que él dio su veredicto mientras corría otra corrida: se retoman cuando esa
   * termine. Con el proyecto en que se dieron, y la dirección para la telemetría.
   */
  porRetomar?: { raiz: string; tareas: string[]; origen: string | null };
  /**
   * Hasta cuánto se gasta, en USD según Claude Code: por día en el proyecto elegido y por corrida.
   * Al llegar, la corrida se detiene y no se lanza otra. Sin tope, no hay límite.
   */
  topes?: { diarioUsd?: number; corridaUsd?: number };
  /**
   * Los procesos que él encendió para que arranquen solos al integrar una tarea, como
   * `linea/proceso`. Que el archivo diga `cuando: al-integrar` no alcanza: lo enciende él, aquí.
   */
  procesosSolos?: string[];
  /**
   * Los procesos en que él quitó su clic para producción, como `linea/proceso`. Solo vale mientras
   * el proceso cumpla las condiciones (`porQueNoSinClic`): se miran cada vez que corre.
   */
  procesosSinClic?: string[];
};

/** Fija los topes de gasto. `null` quita uno. */
export async function fijarTopes(diarioUsd: number | null, corridaUsd: number | null) {
  const valido = (v: number | null) => v === null || (Number.isFinite(v) && v > 0 && v <= 10_000);
  if (!valido(diarioUsd) || !valido(corridaUsd)) throw new Error("Un tope va en USD, mayor que cero y hasta 10.000.");
  const a = await leerAjustes();
  const topes = { ...(diarioUsd !== null ? { diarioUsd } : {}), ...(corridaUsd !== null ? { corridaUsd } : {}) };
  const resto = { ...a };
  delete resto.topes;
  await guardarAjustes(Object.keys(topes).length ? { ...resto, topes } : resto);
}

/** Anota tareas para retomarlas cuando termine la corrida en marcha. Se suman a las que ya había del mismo proyecto. */
export async function anotarPorRetomar(tareas: string[], origen: string | null) {
  const a = await leerAjustes();
  const r = await raizElegida();
  const previas = a.porRetomar?.raiz === r ? a.porRetomar.tareas : [];
  await guardarAjustes({ ...a, porRetomar: { raiz: r, tareas: [...new Set([...previas, ...tareas])], origen } });
}

/**
 * Suelta las tareas que tenía tomadas una sesión de Claude Code que ya terminó: la de una corrida
 * detenida o caída no alcanza a soltarlas sola, y la siguiente esperaría media hora. Solo esos dos
 * campos, con una línea en la bitácora. Devuelve las tareas que soltó.
 */
export async function liberarTomadasPor(sesion: string): Promise<string[]> {
  const r = await raiz();
  if (!r || !sesion) return [];
  const sueltas: string[] = [];
  const ts = new Date().toISOString();
  for (const ent of await listar(rutas(r).tareas)) {
    if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
    const archivo = path.join(rutas(r).tareas, ent.name);
    const { datos, cuerpo } = partir((await leer(archivo)) ?? "");
    if (datos.tomada_por?.trim() !== sesion) continue;
    await fs.writeFile(archivo, unir({ ...datos, tomada_por: "", tomada_hasta: "" }, anotar(cuerpo, `${ts} · la corrida que la trabajaba terminó: queda libre`)));
    sueltas.push(datos.id ?? ent.name);
  }
  return sueltas;
}

/** Lo anotado para retomar, y lo borra: quien lo toma decide si lanza. */
export async function tomarPorRetomar(): Promise<Ajustes["porRetomar"] | null> {
  const a = await leerAjustes();
  if (!a.porRetomar) return null;
  const resto = { ...a };
  delete resto.porRetomar;
  await guardarAjustes(resto);
  return a.porRetomar;
}

/** Los alias de modelo que acepta Claude Code para una corrida o un agente. */
export const MODELOS_DE_CLAUDE = ["haiku", "sonnet", "opus", "fable"] as const;
export const esModeloDeClaude = (v: unknown): v is (typeof MODELOS_DE_CLAUDE)[number] => typeof v === "string" && (MODELOS_DE_CLAUDE as readonly string[]).includes(v);

export async function leerAjustes(): Promise<Ajustes> {
  let guardados: Ajustes & { raiz?: unknown };
  try {
    guardados = JSON.parse(await fs.readFile(archivoAjustes(), "utf8")) as Ajustes & { raiz?: unknown };
  } catch {
    return {};
  }
  if (!guardados || typeof guardados !== "object") return {};
  // Las líneas, también de unos ajustes de antes con un solo proyecto. Se guarda la forma nueva al cambiar algo.
  const { lineas, lineaActiva } = lineasDe(guardados);
  const resto: Ajustes & { raiz?: unknown } = { ...guardados };
  delete resto.raiz;
  delete resto.lineaActiva;
  return { ...resto, lineas, ...(lineaActiva ? { lineaActiva } : {}) };
}

async function guardarAjustes(a: Ajustes) {
  await fs.mkdir(carpetaDeLaFabrica(), { recursive: true });
  await fs.writeFile(archivoAjustes(), JSON.stringify(a, null, 2) + "\n");
}

/** El modelo con que se lanzan las corridas: el elegido en la configuración, o el de Claude Code. */
export async function modeloDeLaCorrida(): Promise<{ modelo: string | null; fuente: "configuracion" | "claude" }> {
  const elegido = (await leerAjustes()).modelo;
  return esModeloDeClaude(elegido) ? { modelo: elegido, fuente: "configuracion" } : { modelo: null, fuente: "claude" };
}

/** Elige el modelo de las corridas. `null` vuelve al de Claude Code. */
export async function fijarModelo(modelo: string | null) {
  if (modelo !== null && !esModeloDeClaude(modelo)) throw new Error(`Modelo desconocido: «${modelo}». Vale ${MODELOS_DE_CLAUDE.join(", ")}.`);
  const resto = { ...(await leerAjustes()) };
  delete resto.modelo;
  await guardarAjustes(modelo === null ? resto : { ...resto, modelo });
}

export async function fijarLlamarSola(valor: boolean) {
  await guardarAjustes({ ...(await leerAjustes()), llamarSola: valor });
}

/** De una lista `linea/proceso` de los ajustes, los procesos de esa línea. Solo los que tienen forma de id. */
const procesosDeLaLista = (todos: unknown, linea: string) =>
  (Array.isArray(todos) ? todos : [])
    .filter((x): x is string => typeof x === "string" && x.startsWith(`${linea}/`))
    .map((x) => x.slice(linea.length + 1))
    .filter((p) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p));

/** Pone o saca `linea/proceso` de una de esas listas. */
async function fijarEnLaLista(clave: "procesosSolos" | "procesosSinClic", linea: string, proceso: string, valor: boolean) {
  const a = await leerAjustes();
  const id = `${linea}/${proceso}`;
  const otros = (Array.isArray(a[clave]) ? a[clave] : []).filter((x) => typeof x === "string" && x !== id);
  await guardarAjustes({ ...a, [clave]: valor ? [...otros, id] : otros });
}

/** Los procesos de una línea que arrancan solos al integrar. */
export const procesosSolosDe = async (linea: string) => procesosDeLaLista((await leerAjustes()).procesosSolos, linea);
/** Enciende o apaga que un proceso arranque solo al integrar en esa línea. */
export const fijarProcesoSolo = (linea: string, proceso: string, valor: boolean) => fijarEnLaLista("procesosSolos", linea, proceso, valor);
/** Los procesos de una línea en que él quitó su clic para producción. */
export const procesosSinClicDe = async (linea: string) => procesosDeLaLista((await leerAjustes()).procesosSinClic, linea);
/** Quita o vuelve a poner su clic para producción en un proceso de esa línea. Las condiciones las mira quien llama. */
export const fijarProcesoSinClic = (linea: string, proceso: string, valor: boolean) => fijarEnLaLista("procesosSinClic", linea, proceso, valor);

export async function fijarCorridaConNikke(valor: boolean) {
  await guardarAjustes({ ...(await leerAjustes()), corridaConNikke: valor });
}

/** El proyecto de la línea activa, o `null` si todavía no hay una. */
export async function raiz(): Promise<string | null> {
  const a = await leerAjustes();
  return a.lineas?.find((l) => l.id === a.lineaActiva)?.raiz ?? null;
}

/** Las líneas que conoce la fábrica, en el orden en que se agregaron. */
export async function lineasDeLaFabrica(): Promise<Linea[]> {
  return (await leerAjustes()).lineas ?? [];
}

/** El proyecto de una línea. Un id que no existe es un error, nunca otra línea. */
/** La configuración de una línea, o `null` si no tiene factory/config.md. Un id desconocido es un error. */
export async function configDeLinea(id: string): Promise<Config | null> {
  const texto = await leer(rutas(await raizDeLinea(id)).config);
  return texto === undefined ? null : configDesde(texto);
}

export async function raizDeLinea(id: string): Promise<string> {
  return lineaPorId(await lineasDeLaFabrica(), id).raiz;
}

/** El proyecto elegido; si no hay, un error que se puede mostrar. */
/** La raíz de esa línea (un id desconocido es un error, nunca otra línea) o, sin línea, la de la activa. */
const raizPara = (linea?: string) => (linea === undefined ? raizElegida() : raizDeLinea(linea));

async function raizElegida(): Promise<string> {
  const r = await raiz();
  if (!r) throw new Error("Todavía no hay un proyecto elegido: elígelo en la configuración.");
  return r;
}

export type EstadoProyecto = { existe: boolean; esCarpeta: boolean; tieneFabrica: boolean; tieneGit: boolean };

export async function revisarProyecto(ruta: string): Promise<EstadoProyecto> {
  const st = await fs.stat(ruta).catch(() => undefined);
  const esCarpeta = !!st?.isDirectory();
  const hay = (p: string) => fs.access(path.join(ruta, p)).then(() => true, () => false);
  return { existe: !!st, esCarpeta, tieneFabrica: esCarpeta && (await hay(path.join("factory", "config.md"))), tieneGit: esCarpeta && (await hay(".git")) };
}

/**
 * Elige el proyecto a mirar: lo agrega como línea si todavía no lo es, y la deja activa. `null`
 * deja de mirar la que estaba; la línea sigue en la lista.
 */
export async function elegirProyecto(ruta: string | null): Promise<EstadoProyecto | null> {
  const previos = await leerAjustes();
  if (ruta === null) {
    const resto = { ...previos };
    delete resto.lineaActiva;
    await guardarAjustes(resto);
    return null;
  }
  const abs = path.resolve(ruta.trim());
  const estado = await revisarProyecto(abs);
  if (!estado.esCarpeta) throw new Error(`No existe la carpeta ${abs}.`);
  const { lineas, linea } = agregarLinea(previos.lineas ?? [], abs);
  await guardarAjustes({ ...previos, lineas, lineaActiva: linea.id });
  return estado;
}

/**
 * Saca una línea de la fábrica sin tocar su repositorio: sus tareas, su factory/ y su memoria quedan
 * como están. Si era la activa, la fábrica queda sin proyecto elegido (no se elige otro por él), y
 * lo que esperaba retomarse en ese proyecto se olvida. Una corrida en marcha la frena quien llama.
 */
export async function quitarLineaDeLaFabrica(id: string): Promise<{ linea: Linea; eraLaActiva: boolean }> {
  const previos = await leerAjustes();
  const { lineas, quitada } = quitarLinea(previos.lineas ?? [], id);
  const resto: Ajustes = { ...previos, lineas };
  const eraLaActiva = previos.lineaActiva === id;
  if (eraLaActiva) delete resto.lineaActiva;
  if (resto.porRetomar && mismaRaiz(resto.porRetomar.raiz, quitada.raiz)) delete resto.porRetomar;
  await guardarAjustes(resto);
  return { linea: quitada, eraLaActiva };
}

export const rutas = (r: string) => ({
  factory: path.join(r, "factory"),
  config: path.join(r, "factory", "config.md"),
  tareas: path.join(r, "factory", "tareas"),
  veredictos: path.join(r, "factory", "veredictos"),
  respuestas: path.join(r, "factory", "respuestas"),
  eventos: path.join(r, "factory", "eventos.jsonl"),
  jev: path.join(r, "factory", "jev.jsonl"),
});

const leer = (p: string) => fs.readFile(p, "utf8").catch(() => undefined);
const listar = (p: string) => fs.readdir(p, { withFileTypes: true }).catch(() => []);

// ---- Lo que el plugin lee de factory/config.md -----------------------------------------------------

/** Los roles con modelo propio, con su clave en factory/config.md. */
export const ROLES_CON_MODELO = { spec: "modelo_spec", construccion: "modelo_construccion", revision: "modelo_revision", aprobacion: "modelo_aprobacion" } as const;
export type RolConModelo = keyof typeof ROLES_CON_MODELO;

/** El modelo de cada rol, como está en config.md. Si no dice nada, lo mismo que el plugin: la spec en Opus, los revisores en Sonnet, el resto `inherit`. */
export async function modelosPorRol(): Promise<Record<RolConModelo, string> | null> {
  const r = await raiz();
  const texto = r ? await leer(rutas(r).config) : undefined;
  if (texto === undefined) return null;
  const { datos } = partir(texto);
  return Object.fromEntries((Object.entries(ROLES_CON_MODELO) as [RolConModelo, string][]).map(([rol, clave]) => [rol, modeloDeRolDesde(datos[clave], rol)])) as Record<RolConModelo, string>;
}

/**
 * Quién revisa el código y quién escribe la spec, además de Claude. Vienen
 * apagados: Codex y Antigravity mandan código del proyecto a OpenAI o a Google.
 */
export const AGENTES_EXTERNOS = { revisorCodigo: { clave: "revisor_codigo", valores: ["claude", "codex", "ambos"] }, escritorSpec: { clave: "escritor_spec", valores: ["claude", "antigravity"] } } as const;
export type AgenteExterno = keyof typeof AGENTES_EXTERNOS;

export async function agentesExternos(): Promise<Record<AgenteExterno, string> | null> {
  const r = await raiz();
  const texto = r ? await leer(rutas(r).config) : undefined;
  if (texto === undefined) return null;
  const datos = partir(texto).datos;
  return Object.fromEntries(
    (Object.entries(AGENTES_EXTERNOS) as [AgenteExterno, (typeof AGENTES_EXTERNOS)[AgenteExterno]][]).map(([k, { clave, valores }]) => {
      const v = datos[clave]?.trim();
      return [k, v && (valores as readonly string[]).includes(v) ? v : "claude"];
    }),
  ) as Record<AgenteExterno, string>;
}

/** Cambia una clave de factory/config.md, conservando el resto del archivo. Sin `linea`, en la activa. */
async function fijarEnConfig(clave: string, valor: string, linea?: string) {
  await fijarVariasEnConfig({ [clave]: valor }, linea);
}

/** Cambia varias claves de factory/config.md de una vez, conservando el resto del archivo y el orden. */
async function fijarVariasEnConfig(valores: Record<string, string>, linea?: string) {
  const ruta = rutas(await raizPara(linea)).config;
  const texto = await leer(ruta);
  if (texto === undefined) throw new Error("Este proyecto no tiene factory/config.md.");
  const { datos, cuerpo } = partir(texto);
  await fs.writeFile(ruta, unir({ ...datos, ...valores }, cuerpo));
}

// ---- Las reglas del proyecto y las notas para los agentes ----------------------------------------

/** Las reglas de config.md (con los valores por defecto del plugin) y sus notas para los agentes. `null` sin fábrica. */
export async function reglasDelProyecto(): Promise<{ reglas: Reglas; notas: string } | null> {
  const r = await raiz();
  const texto = r ? await leer(rutas(r).config) : undefined;
  if (texto === undefined) return null;
  const { datos, cuerpo } = partir(texto);
  return { reglas: reglasDesde(datos), notas: cuerpo.trim() };
}

/** Cambia reglas de config.md, solo las que vienen y revisadas. El resto del archivo queda igual. */
export async function fijarReglas(dato: unknown) {
  const revisado = revisarReglas(dato);
  if ("error" in revisado) throw new Error(revisado.error);
  if (!Object.keys(revisado.reglas).length) throw new Error("No hay reglas que cambiar.");
  await fijarVariasEnConfig(revisado.reglas as Record<string, string>);
}

/** Reemplaza las notas para los agentes, debajo del frontmatter de config.md, que queda igual. */
export async function fijarNotas(dato: unknown) {
  const revisado = revisarNotas(dato);
  if ("error" in revisado) throw new Error(revisado.error);
  const ruta = rutas(await raizElegida()).config;
  const texto = await leer(ruta);
  if (texto === undefined) throw new Error("Este proyecto no tiene factory/config.md.");
  await fs.writeFile(ruta, unir(partir(texto).datos, `\n${revisado.notas}\n`));
}

// ---- Los agentes de cada etapa y cuántas tareas a la vez ------------------------------------------

/** El agente de cada etapa (`auto` o su nombre) y cuántas tareas trabaja a la vez, de config.md. `null` sin fábrica. */
export async function agentesDelProyecto(): Promise<{ porRol: Record<RolDeAgente, string>; paraleloMax: number } | null> {
  const r = await raiz();
  const texto = r ? await leer(rutas(r).config) : undefined;
  if (texto === undefined) return null;
  const { datos } = partir(texto);
  const porRol = Object.fromEntries(
    (Object.entries(ROLES_DE_AGENTE) as [RolDeAgente, (typeof ROLES_DE_AGENTE)[RolDeAgente]][]).map(([rol, { clave }]) => {
      const v = datos[clave]?.trim();
      return [rol, v && esNombreDeAgente(v) ? v : "auto"];
    }),
  ) as Record<RolDeAgente, string>;
  const n = Number.parseInt(datos.paralelo_max ?? "", 10);
  return { porRol, paraleloMax: Number.isFinite(n) ? Math.min(PARALELO.max, Math.max(PARALELO.min, n)) : 2 };
}

/** Pone un agente en una etapa: `auto` o uno de los que se pueden elegir (`existe` lo dice). */
export async function fijarAgenteDeRol(rol: string, valor: string, existe: (nombre: string) => Promise<boolean>) {
  if (!esRolDeAgente(rol)) throw new Error(`Etapa desconocida: «${rol}».`);
  if (valor !== "auto" && !(esNombreDeAgente(valor) && (await existe(valor)))) throw new Error(`No hay un agente «${valor}» en este equipo.`);
  await fijarEnConfig(ROLES_DE_AGENTE[rol].clave, valor);
}

/** Cuántas tareas trabaja la fábrica a la vez en este proyecto. Sin git, igual va de a una. */
export async function fijarParalelo(n: number) {
  if (!Number.isInteger(n) || n < PARALELO.min || n > PARALELO.max) throw new Error(`Van de ${PARALELO.min} a ${PARALELO.max} tareas a la vez.`);
  await fijarEnConfig("paralelo_max", String(n));
}


/** Corre git sin shell en una carpeta. Nunca lanza: vuelve el código, la salida junta y lo que escribió en la salida normal. */
async function correrGit(args: string[], cwd: string): Promise<{ codigo: number; salida: string; stdout: string }> {
  const { execFile } = await import("node:child_process");
  return new Promise((listo) => {
    execFile("git", args, { cwd, timeout: 60_000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) =>
      listo({ codigo: err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 1) : 0, salida: `${stdout}\n${stderr}`.trim(), stdout: String(stdout) }),
    );
  });
}

/**
 * Cuántos archivos de una carpeta tienen cambios sin commit (también los nuevos). `null` si git no
 * lo pudo decir: la carpeta no está en un repositorio, o git no está.
 */
export async function sinCommitEn(carpeta: string): Promise<number | null> {
  const r = await correrGit(["status", "--porcelain", "--untracked-files=all", "--", "."], carpeta);
  if (r.codigo !== 0) return null;
  return r.stdout.split(/\r?\n/).filter((l) => l.trim()).length;
}

// ---- Lo que cambió una tarea ------------------------------------------------------------------------

/** Hasta cuánto del diff se devuelve: lo demás se corta, y se dice. */
export const CAMBIOS_MAX = 200_000;
/** Los archivos de la fábrica no son cambios de la tarea. */
const SIN_LA_FABRICA = ["--", ".", ":(exclude)factory"];

export type CambiosDeTarea =
  | {
      tarea: string;
      /** La rama de la que salió y el commit donde se separó de ella. */
      base: string;
      desde: string;
      /** `null` en las cifras: un archivo binario. `nuevo`: todavía sin commit ni seguimiento. */
      archivos: { ruta: string; agregadas: number | null; quitadas: number | null; nuevo: boolean }[];
      diff: string;
      cortado: boolean;
    }
  | { tarea: string; motivo: string };

/** Lo que dice `git diff --numstat`, por archivo. Es lógica pura. */
export function cifrasDelDiff(numstat: string): { ruta: string; agregadas: number | null; quitadas: number | null; nuevo: boolean }[] {
  return numstat
    .split(/\r?\n/)
    .map((l) => l.split("\t"))
    .filter((c) => c.length >= 3 && c[2])
    .map(([a, q, ...ruta]) => ({ ruta: ruta.join("\t"), agregadas: a === "-" ? null : Number(a), quitadas: q === "-" ? null : Number(q), nuevo: false }));
}

/**
 * Lo que cambió una tarea respecto del punto donde se separó de su rama de origen, en su worktree:
 * lo que tiene commit y lo que no, sin los archivos de la fábrica. Es para mirarla antes de darle el
 * veredicto: una ya integrada es parte de su rama, y se dice. Solo lee.
 */
export async function cambiosDeLaTarea(id: string, linea?: string): Promise<CambiosDeTarea> {
  const r = linea === undefined ? await raiz() : await raizDeLinea(linea);
  if (!r) throw new Error("Todavía no hay un proyecto elegido.");
  const i = await instantaneaDe(r);
  const t = i.tareas.find((x) => x.id === id);
  if (!t) return { tarea: id, motivo: "No hay una tarea con ese id." };
  if (t.integrada) return { tarea: id, motivo: `Ya está integrada en ${t.ramaOrigen ?? "su rama"}, con el commit ${t.integrada.slice(0, 7)}: sus cambios ya son parte de esa rama.` };
  const wt = t.worktree ? path.resolve(r, t.worktree) : null;
  if (!wt || !(await fs.stat(wt).then((s) => s.isDirectory(), () => false))) return { tarea: id, motivo: "Todavía no tiene su worktree: no hay cambios que mirar." };
  const base = t.ramaOrigen || i.config?.ramaBase || "main";
  const mb = await correrGit(["merge-base", "HEAD", base], wt);
  const desde = mb.stdout.trim();
  if (mb.codigo !== 0 || !/^[0-9a-f]{7,64}$/i.test(desde)) return { tarea: id, motivo: `git no encontró dónde se separó de ${base}.` };
  const [cifras, diff, nuevos] = await Promise.all([
    correrGit(["diff", "--numstat", desde, ...SIN_LA_FABRICA], wt),
    correrGit(["diff", "--no-color", "--no-ext-diff", desde, ...SIN_LA_FABRICA], wt),
    correrGit(["ls-files", "--others", "--exclude-standard", ...SIN_LA_FABRICA], wt),
  ]);
  if (cifras.codigo !== 0 || diff.codigo !== 0) return { tarea: id, motivo: `git no pudo sacar sus cambios: ${diff.salida.split("\n")[0]}` };
  const archivos = [
    ...cifrasDelDiff(cifras.stdout),
    ...nuevos.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((ruta) => ({ ruta, agregadas: null, quitadas: null, nuevo: true })),
  ];
  return { tarea: id, base, desde, archivos, diff: diff.stdout.slice(0, CAMBIOS_MAX), cortado: diff.stdout.length > CAMBIOS_MAX };
}

// ---- Las ramas de la fábrica que ya no sirven -------------------------------------------------------

/** Las etapas en que una tarea todavía usa su rama: esas no se tocan. */
const TODAVIA_LA_USA = new Set(["pendiente", "spec", "construccion", "revision", "verificacion", "aprobacion", "necesita-humano"]);

export type RamaDeLaFabrica = {
  rama: string;
  /** La tarea de la rama y en qué quedó; `null` si ya no existe. */
  tarea: string | null;
  estado: string | null;
  /** Contra qué se miró si está integrada: su rama de origen o, sin ella, la actual. */
  base: string;
  /** Los commits que tiene y su base no. `null` si git no lo pudo decir. */
  commits: number | null;
  /** Su worktree, si tiene uno en disco. */
  worktree: string | null;
};
export type RamasDeLaFabrica = { integradas: RamaDeLaFabrica[]; sinIntegrar: RamaDeLaFabrica[]; enCurso: string[] };

/** De `git worktree list --porcelain`, qué carpeta tiene cada rama. Es lógica pura. */
export function worktreesPorRama(porcelain: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const bloque of porcelain.replace(/\r\n/g, "\n").split(/\n\n+/)) {
    const carpeta = /^worktree (.+)$/m.exec(bloque)?.[1];
    const rama = /^branch refs\/heads\/(.+)$/m.exec(bloque)?.[1];
    if (carpeta && rama) out.set(rama, carpeta.trim());
  }
  return out;
}

/**
 * Las ramas `fabrica/*` del proyecto, en tres grupos: las que ya están integradas en su base (no
 * tienen nada que su base no tenga), las que tienen commits sin integrar, y las de tareas que
 * todavía las usan (en curso, esperándolo o tomadas por una sesión), que no se tocan. Tampoco la
 * rama en que está la raíz. Solo lee.
 */
export async function ramasDeLaFabrica(): Promise<RamasDeLaFabrica> {
  const vacio: RamasDeLaFabrica = { integradas: [], sinIntegrar: [], enCurso: [] };
  const r = await raiz();
  if (!r) return vacio;
  const lista = await correrGit(["for-each-ref", "--format=%(refname:short)", "refs/heads/fabrica/"], r);
  const nombres = lista.codigo === 0 ? lista.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  if (!nombres.length) return vacio;
  const actual = (await correrGit(["branch", "--show-current"], r)).stdout.trim();
  const carpetas = worktreesPorRama((await correrGit(["worktree", "list", "--porcelain"], r)).stdout);
  const i = await instantanea();
  const porRama = new Map((i?.tareas ?? []).map((t) => [t.rama || `fabrica/${t.id}`, t]));
  const existe = async (rama: string) => (await correrGit(["rev-parse", "--verify", "--quiet", `refs/heads/${rama}`], r)).codigo === 0;
  const out: RamasDeLaFabrica = { integradas: [], sinIntegrar: [], enCurso: [] };
  for (const rama of nombres) {
    const t = porRama.get(rama);
    const tomada = !!t?.tomadaPor && Date.parse(t.tomadaHasta ?? "") > Date.now();
    if (rama === actual || (t && (TODAVIA_LA_USA.has(t.estado) || tomada))) {
      out.enCurso.push(rama);
      continue;
    }
    const base = t?.ramaOrigen && (await existe(t.ramaOrigen)) ? t.ramaOrigen : actual || i?.config?.ramaBase || "main";
    const cuenta = await correrGit(["rev-list", "--count", `${base}..${rama}`], r);
    const commits = cuenta.codigo === 0 && /^\d+$/.test(cuenta.stdout.trim()) ? Number(cuenta.stdout.trim()) : null;
    const carpeta = carpetas.get(rama);
    const fila: RamaDeLaFabrica = {
      rama,
      tarea: t?.id ?? /^fabrica\/([A-Za-z]{1,8}-\d{1,6})$/.exec(rama)?.[1] ?? null,
      estado: t?.estado ?? null,
      base,
      commits,
      worktree: carpeta && path.resolve(carpeta) !== path.resolve(r) ? path.resolve(carpeta) : null,
    };
    (commits === 0 ? out.integradas : out.sinIntegrar).push(fila);
  }
  return out;
}

/**
 * Limpia las ramas de la fábrica que ya no sirven. Lo pide él con un clic. Primero `git worktree
 * prune`, que olvida los worktrees cuya carpeta ya no está. Después, la lista se vuelve a armar aquí
 * (no se confía en la de la página): las integradas se borran todas, y de las que tienen commits
 * sin integrar, solo las que él eligió, a sabiendas de que se pierde ese trabajo. Las de tareas
 * en curso no se tocan nunca. Un worktree con cambios sin commit no se quita, y su rama queda.
 */
export async function limpiarRamas(elegidas: readonly string[]): Promise<{ limpiadas: string[]; saltadas: { rama: string; motivo: string }[] }> {
  const r = await raizElegida();
  await correrGit(["worktree", "prune"], r);
  const { integradas, sinIntegrar } = await ramasDeLaFabrica();
  const quiere = new Set(elegidas);
  const limpiadas: string[] = [];
  const saltadas: { rama: string; motivo: string }[] = [];
  const porBorrar = [...integradas.map((x) => ({ x, forzar: false })), ...sinIntegrar.filter((x) => quiere.has(x.rama)).map((x) => ({ x, forzar: true }))];
  for (const elegida of elegidas) if (!porBorrar.some((p) => p.x.rama === elegida)) saltadas.push({ rama: elegida, motivo: "ya no está entre las que se pueden borrar" });
  for (const { x, forzar } of porBorrar) {
    if (x.worktree) {
      // Sin el node_modules enlazado: en Mac y Linux es un enlace simbólico, y un `node_modules/` del .gitignore no lo cubre.
      const sucio = await correrGit(["status", "--porcelain", "--", ".", ":(exclude)node_modules"], x.worktree);
      if (sucio.codigo !== 0) {
        saltadas.push({ rama: x.rama, motivo: `git no pudo leer su worktree: ${sucio.salida.split("\n")[0]}` });
        continue;
      }
      if (sucio.stdout.trim()) {
        saltadas.push({ rama: x.rama, motivo: "su worktree tiene cambios sin commit" });
        continue;
      }
      // El node_modules enlazado a la raíz se suelta antes: quitar el worktree no puede tocar el de la raíz.
      const nm = path.join(x.worktree, "node_modules");
      if ((await fs.lstat(nm).catch(() => null))?.isSymbolicLink()) await (process.platform === "win32" ? fs.rmdir(nm) : fs.unlink(nm));
      const wt = await correrGit(["worktree", "remove", x.worktree], r);
      if (wt.codigo !== 0) {
        saltadas.push({ rama: x.rama, motivo: `git no quitó su worktree: ${wt.salida.split("\n")[0]}` });
        continue;
      }
    }
    // Integrada en su rama de origen, `-d` puede negarse si esa no es la actual: ya se comprobó que no tiene nada que su base no tenga.
    let borrada = await correrGit(["branch", forzar ? "-D" : "-d", x.rama], r);
    if (borrada.codigo !== 0 && !forzar && x.commits === 0) borrada = await correrGit(["branch", "-D", x.rama], r);
    if (borrada.codigo === 0) limpiadas.push(x.rama);
    else saltadas.push({ rama: x.rama, motivo: `git no la borró: ${borrada.salida.split("\n")[0]}` });
  }
  return { limpiadas, saltadas };
}

// ---- Los comandos de verificación del proyecto ----------------------------------------------------

/** Los comandos de build, test y lint y la rama base del proyecto elegido, de su config.md. `null` sin fábrica. */
export async function comandosDelProyecto(): Promise<ComandosDelProyecto | null> {
  const r = await raiz();
  const texto = r ? await leer(rutas(r).config) : undefined;
  if (texto === undefined) return null;
  const c = configDesde(texto);
  return { build: c.build, test: c.test, lint: c.lint, ramaBase: c.ramaBase };
}

/** Guarda los comandos y la rama base en el config.md del proyecto elegido. Las demás claves no se tocan. */
export async function fijarComandos(dato: unknown) {
  const revisado = revisarComandos(dato);
  if ("error" in revisado) throw new Error(revisado.error);
  const { build, test, lint, ramaBase } = revisado.comandos;
  await fijarVariasEnConfig({ build, test, lint, rama_base: ramaBase });
}

/** Lo más que espera cada comando al probarlo desde la configuración. */
const PRUEBA_MS = 10 * 60_000;

/**
 * Corre build, test y lint en la raíz del proyecto, uno tras otro, con la misma shell que la
 * verificación del plugin y sin las claves de la aplicación. Lo pide él con un clic. Un lint con
 * `{archivos}` no se prueba aquí: solo tiene sentido con los archivos de una tarea.
 */
export async function probarComandos(): Promise<PruebaDeComando[]> {
  const r = await raizElegida();
  const c = await comandosDelProyecto();
  if (!c) throw new Error("Este proyecto no tiene factory/config.md.");
  const { spawn } = await import("node:child_process");
  const windows = process.platform === "win32";
  const out: PruebaDeComando[] = [];
  for (const nombre of NOMBRES_DE_COMANDO) {
    const comando = c[nombre].trim();
    if (!comando) {
      out.push({ nombre, comando, resultado: "vacio", codigo: null, salida: "", ms: 0 });
      continue;
    }
    if (comando.includes("{archivos}")) {
      out.push({ nombre, comando, resultado: "omitido", codigo: null, salida: "Usa {archivos}: se prueba al verificar cada tarea, con lo que ella cambió.", ms: 0 });
      continue;
    }
    const desde = Date.now();
    const [programa, ...args] = enShell(comando, windows);
    const { codigo, salida } = await new Promise<{ codigo: number | null; salida: string }>((listo) => {
      let texto = "";
      const hijo = spawn(programa!, args, { cwd: r, env: entornoDelProyecto(process.env) as NodeJS.ProcessEnv, windowsHide: true });
      const tope = setTimeout(() => {
        texto += `\nPasó de ${PRUEBA_MS / 60_000} minutos: se detuvo.`;
        if (hijo.pid) cerrarProceso(hijo.pid);
        else hijo.kill();
      }, PRUEBA_MS);
      // Se guarda solo el final: es lo que dice por qué falló.
      const juntar = (b: Buffer) => (texto = (texto + b.toString("utf8")).slice(-20_000));
      hijo.stdout.on("data", juntar);
      hijo.stderr.on("data", juntar);
      hijo.on("error", (err) => {
        clearTimeout(tope);
        listo({ codigo: -1, salida: String(err.message) });
      });
      hijo.on("close", (c) => {
        clearTimeout(tope);
        listo({ codigo: c, salida: texto });
      });
    });
    const ok = codigo === 0;
    out.push({ nombre, comando, resultado: ok ? "ok" : "fallo", codigo, salida: ok ? "" : colaDe(salida, 15), ms: Date.now() - desde });
  }
  return out;
}

/**
 * Las rutas exactas de Codex y de Antigravity en este equipo, de `.env.local`, o `null`. Sin la
 * suya, ese agente queda apagado: no se busca en el PATH. Es lógica pura.
 */
export const agentesDeEsteEquipo = (entorno: Record<string, string | undefined> = process.env) => ({
  codex: entorno.COMPANIA_CODEX_BIN?.trim() || null,
  antigravity: entorno.COMPANIA_ANTIGRAVITY_BIN?.trim() || null,
});

export async function fijarAgenteExterno(cual: string, valor: string) {
  const def = AGENTES_EXTERNOS[cual as AgenteExterno];
  if (!def) throw new Error(`No se conoce «${cual}».`);
  if (!(def.valores as readonly string[]).includes(valor)) throw new Error(`«${valor}» no vale para ${def.clave}: ${def.valores.join(", ")}.`);
  const enEsteEquipo = agentesDeEsteEquipo();
  if ((valor === "codex" || valor === "ambos") && !enEsteEquipo.codex) throw new Error("Falta COMPANIA_CODEX_BIN en .env.local: la ruta exacta de Codex en este equipo.");
  if (valor === "antigravity" && !enEsteEquipo.antigravity) throw new Error("Falta COMPANIA_ANTIGRAVITY_BIN en .env.local: la ruta exacta de Antigravity en este equipo.");
  await fijarEnConfig(def.clave, valor);
}

/** El modelo de un rol en factory/config.md de esa línea; sin `linea`, en la activa. Una línea desconocida es un error. */
export async function fijarModeloDeRol(rol: string, modelo: string, linea?: string) {
  // `in` aceptaría «constructor» o «toString»: solo valen las claves propias.
  if (!Object.hasOwn(ROLES_CON_MODELO, rol)) throw new Error(`Rol desconocido: «${rol}».`);
  if (!esModeloDeRol(modelo)) throw new Error(`Modelo desconocido: «${modelo}».`);
  await fijarEnConfig(ROLES_CON_MODELO[rol as RolConModelo], modelo, linea);
}

/** Las carpetas que no se miran al buscar los archivos del proyecto: dependencias, salidas de build, git. */
const NO_SE_MIRAN = new Set(["node_modules", ".git", "bin", "obj", "dist", "build", "out", ".next", "target", ".venv", "venv", "__pycache__", "packages", "factory"]);

/** Los archivos de la raíz y de un nivel más abajo, con el contenido de los que hacen falta para detectar los comandos. */
/** Los archivos de la raíz y de un nivel más abajo, con el contenido de los manifiestos. Los usan los comandos y la memoria. */
export async function archivosParaDetectar(r: string): Promise<ArchivoDelProyecto[]> {
  const out: ArchivoDelProyecto[] = [];
  const agregar = async (relativa: string) => {
    const leido = hayQueLeer(relativa) ? await leer(path.join(r, relativa)) : undefined;
    // Un manifiesto enorme no es un manifiesto: se lista sin contenido.
    out.push(leido !== undefined && leido.length <= 2_000_000 ? { ruta: relativa, contenido: leido } : { ruta: relativa });
  };
  for (const ent of await listar(r)) {
    if (ent.isFile()) await agregar(ent.name);
    else if (ent.isDirectory() && !NO_SE_MIRAN.has(ent.name.toLowerCase())) {
      out.push({ ruta: ent.name });
      for (const sub of await listar(path.join(r, ent.name))) if (sub.isFile()) await agregar(`${ent.name}/${sub.name}`);
    }
  }
  return out;
}

/** La rama activa del repo, o `null` si no es un repo o está en detached HEAD. */
export async function ramaActual(r: string): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  return new Promise((listo) => {
    execFile("git", ["branch", "--show-current"], { cwd: r, timeout: 10_000, windowsHide: true }, (err, stdout) => listo(err ? null : String(stdout).trim() || null));
  });
}

// ---- La rama de trabajo ------------------------------------------------------------------------------

/**
 * Las ramas en que la fábrica no trabaja nunca: las mismas que frena el plugin (`RAMAS_PROTEGIDAS`,
 * en fabrica/hooks/tareas.ts). Lo decidió él el 20 de octubre de 2026: lo que llega a main lo lleva él.
 */
export const RAMAS_PROTEGIDAS = ["main", "master"] as const;
export const esRamaProtegida = (rama: string) => (RAMAS_PROTEGIDAS as readonly string[]).includes(rama.trim().toLowerCase());

export type RamaDeTrabajo = {
  /** La de config.md; vacía, la activa en la raíz. */
  elegida: string;
  /** En qué rama está la raíz ahora. `null` sin git o en detached HEAD. */
  raizEn: string | null;
  /** Las que se pueden elegir: las locales, sin las de la fábrica ni las protegidas. */
  opciones: string[];
};

/** La rama de trabajo del proyecto elegido y las que se pueden elegir. `null` sin fábrica. */
export async function ramaDeTrabajo(): Promise<RamaDeTrabajo | null> {
  const r = await raiz();
  const texto = r ? await leer(rutas(r).config) : undefined;
  if (!r || texto === undefined) return null;
  const locales = await correrGit(["for-each-ref", "--format=%(refname:short)", "refs/heads/"], r);
  const opciones = locales.codigo === 0 ? locales.stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("fabrica/") && !esRamaProtegida(l)) : [];
  return { elegida: configDesde(texto).ramaTrabajo, raizEn: await ramaActual(r), opciones };
}

/**
 * Elige la rama de trabajo, o la quita con "". Tiene que ser una rama local que exista, que no sea de
 * la fábrica y que no sea protegida. Se guarda en factory/config.md, sin tocar lo demás.
 */
export async function fijarRamaDeTrabajo(valor: string) {
  const rama = valor.trim();
  if (rama) {
    if (esRamaProtegida(rama)) throw new Error(`La fábrica no trabaja sobre «${rama}»: elige una rama tuya.`);
    if (rama.startsWith("fabrica/")) throw new Error("Esa es una rama de una tarea, no una de trabajo.");
    const r = await raizElegida();
    if ((await correrGit(["rev-parse", "--verify", "--quiet", `refs/heads/${rama}`], r)).codigo !== 0) throw new Error(`No hay una rama local «${rama}» en este proyecto.`);
  }
  await fijarEnConfig("rama_trabajo", rama);
}

export type FabricaCreada = { build: string; test: string; lint: string; ramaBase: string; avisos: string[] };

/**
 * Una factory/ para empezar, con los comandos de build, test y lint del
 * proyecto ya detectados (la misma tabla que /fabrica:init, y su CLAUDE.md
 * manda sobre ella) y la rama actual como rama base. Lo que no se pudo
 * detectar vuelve en `avisos`, para mostrarlo: nunca queda vacío sin decirlo.
 */
export async function inicializarFabrica(): Promise<FabricaCreada> {
  const r = await raizElegida();
  const rt = rutas(r);
  if (await fs.access(rt.config).then(() => true, () => false)) throw new Error("Este proyecto ya tiene factory/config.md.");
  const claudeMd = (await leer(path.join(r, "CLAUDE.md"))) ?? (await leer(path.join(r, "claude.md"))) ?? null;
  const detectados = detectarComandos(await archivosParaDetectar(r), claudeMd);
  const rama = await ramaActual(r);
  const avisos = [...detectados.avisos];
  if (!rama) avisos.push("No se pudo leer la rama actual (no es un repo git, o está en detached HEAD): la rama base quedó en main.");
  const ramaBase = rama ?? "main";
  await fs.mkdir(rt.tareas, { recursive: true });
  await fs.mkdir(rt.veredictos, { recursive: true });
  await fs.writeFile(path.join(rt.tareas, ".gitkeep"), "");
  await fs.writeFile(path.join(rt.veredictos, ".gitkeep"), "");
  const datos = {
    build: detectados.build,
    test: detectados.test,
    lint: detectados.lint,
    rama_base: ramaBase,
    max_vueltas: "3",
    paralelo_max: "2",
    ui: "auto",
    aprobacion: "ambas",
    integracion: "auto",
    worktrees: `../${path.basename(r)}-fabrica`,
    agente_spec: "auto",
    agente_construccion: "auto",
    agente_revision_codigo: "auto",
    agente_revision_seguridad: "auto",
    agente_ui: "auto",
    agente_aprobacion: "auto",
  };
  const sinComandos = !detectados.build && !detectados.test && !detectados.lint;
  const cuerpo = `
# Fábrica de este proyecto

Creada desde la aplicación de compañía. ${sinComandos ? "No se reconocieron los comandos de build, test y lint: escríbelos arriba o en la configuración de la aplicación. Sin ellos la verificación no puede correr." : "Los comandos de build, test y lint se detectaron solos: revísalos y pruébalos en la configuración de la aplicación."}

Notas para los agentes: convenciones, carpetas que no se tocan, skills del proyecto.
`;
  await fs.writeFile(rt.config, unir(datos, cuerpo));
  return { build: detectados.build, test: detectados.test, lint: detectados.lint, ramaBase, avisos };
}

// ---- Lectura ------------------------------------------------------------------------------------

async function respuestaDe(r: string, id: string): Promise<{ texto: string; por: string; fecha: string } | undefined> {
  const t = await leer(path.join(rutas(r).respuestas, `${id}.json`));
  try {
    const j = t ? (JSON.parse(t) as { texto?: unknown; por?: unknown; fecha?: unknown }) : undefined;
    return j && typeof j.texto === "string" && typeof j.fecha === "string" ? { texto: j.texto, por: String(j.por ?? "humano"), fecha: j.fecha } : undefined;
  } catch {
    return undefined;
  }
}

async function veredictos(r: string) {
  const dir = rutas(r).veredictos;
  const out = new Map<string, { veredicto: Veredicto; motivo: string; por: string; mtime: number }>();
  for (const ent of await listar(dir)) {
    if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
    const p = path.join(dir, ent.name);
    const v = veredictoDesde((await leer(p)) ?? "");
    const st = await fs.stat(p).catch(() => undefined);
    if (v && st) out.set(ent.name.slice(0, -5), { ...v, mtime: st.mtimeMs });
  }
  return out;
}

/** Un veredicto vale solo si llegó después de que la tarea entró en aprobación (la misma regla del plugin). */
const vigente = (mtime: number, desde?: string) => {
  if (!desde) return true;
  const t = Date.parse(desde);
  return !Number.isFinite(t) || mtime >= t;
};

/** Lo que hay en la fábrica de la línea activa: sus tareas, su config y sus últimos eventos. `null` si no hay proyecto elegido. */
export async function instantanea(): Promise<Instantanea | null> {
  const r = await raiz();
  return r ? instantaneaDe(r) : null;
}

/**
 * Lo que hay en la fábrica de un proyecto cualquiera, por su raíz: sus tareas, su config y sus
 * últimos `maxEventos` eventos (la planta pide más, para contar lo hecho en la semana).
 */
export async function instantaneaDe(r: string, maxEventos = EVENTOS_EN_INSTANTANEA): Promise<Instantanea> {
  const rt = rutas(r);
  const textoConfig = await leer(rt.config);
  const tareas: Tarea[] = [];
  const menores: Omit<HallazgoDeDeuda, "convertidoEn">[] = [];
  for (const ent of await listar(rt.tareas)) {
    if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
    const archivo = path.join(rt.tareas, ent.name);
    const texto = (await leer(archivo)) ?? "";
    const t = tareaDesde(texto, archivo);
    if (!t) continue;
    tareas.push(t);
    // La deuda: lo MENOR que dejaron sin corregir las tareas terminadas.
    if (t.estado === "hecho") menores.push(...hallazgosMenores(t, partir(texto).cuerpo));
  }
  const convertidos = new Map(tareas.filter((t) => t.origenHallazgo).map((t) => [t.origenHallazgo!, t.id]));
  const deuda: HallazgoDeDeuda[] = menores.map((h) => ({ ...h, convertidoEn: convertidos.get(h.id) ?? null }));
  const ver = await veredictos(r);
  for (const t of tareas) {
    const v = ver.get(t.id);
    if (v && vigente(v.mtime, t.enAprobacionDesde)) t.veredictoExterno = { veredicto: v.veredicto, motivo: v.motivo, por: v.por };
    if (t.estado === "necesita-humano") {
      const resp = await respuestaDe(r, t.id);
      // Solo cuenta si llegó después del bloqueo: una de un bloqueo anterior ya se usó.
      if (resp && (!t.actualizada || resp.fecha > t.actualizada)) t.respuesta = resp;
    }
  }
  tareas.sort((a, b) => a.id.localeCompare(b.id));
  const eventos = eventosDesde((await leer(rt.eventos)) ?? "").slice(-maxEventos);
  return { raiz: r, esDemo: false, config: textoConfig ? configDesde(textoConfig) : null, tareas, eventos, deuda, ramaActual: await ramaActual(r), leidaEn: new Date().toISOString() };
}

// ---- Escritura: lo que el contrato deja hacer desde fuera ---------------------------------------

async function archivoDe(r: string, id: string) {
  const dir = rutas(r).tareas;
  const nombre = (await listar(dir)).find((x) => x.isFile() && (x.name === `${id}.md` || x.name.startsWith(`${id}-`)))?.name;
  return nombre ? path.join(dir, nombre) : undefined;
}

/**
 * La respuesta de una persona a una tarea que la espera. Va al cuerpo de la
 * tarea (la leen los agentes) y a factory/respuestas/<id>.json (la lee el
 * plugin para saber que hay algo nuevo). El estado no cambia: lo mueve el
 * plugin al retomarla.
 */
export async function escribirRespuesta(id: string, texto: string, por: string, linea?: string) {
  if (!/^F-\d+$/.test(id)) throw new Error("Id de tarea inválido.");
  const limpio = texto.trim();
  if (!limpio) throw new Error("La respuesta está vacía.");
  if (limpio.length > 4000) throw new Error("La respuesta es muy larga (más de 4000 caracteres): ponla en la spec o en un documento.");
  const r = await raizPara(linea);
  const archivo = await archivoDe(r, id);
  if (!archivo) throw new Error(`No existe la tarea ${id}.`);
  const { datos, cuerpo } = partir((await leer(archivo)) ?? "");
  if (datos.estado !== "necesita-humano") throw new Error(`${id} no está esperando a una persona (está en «${datos.estado}»).`);
  const fecha = new Date().toISOString();
  const citado = limpio.split("\n").map((l) => `> ${l}`).join("\n");
  const entrada = `**${fecha} · ${por}** (a: ${datos.motivo || "la pregunta de la tarea"})\n\n${citado}`;
  // El frontmatter se reescribe tal cual: los campos de estado no se tocan.
  await fs.writeFile(archivo, unir(datos, anotarRespuestaEn(cuerpo, entrada)));
  await fs.mkdir(rutas(r).respuestas, { recursive: true });
  await fs.writeFile(path.join(rutas(r).respuestas, `${id}.json`), JSON.stringify({ tarea: id, texto: limpio, por, fecha, pregunta: datos.motivo ?? "" }, null, 2) + "\n");
  return { tarea: id, fecha };
}

/**
 * Un veredicto sobre una tarea en aprobación: factory/veredictos/<id>.json.
 * Con la respuesta, es lo que el contrato deja escribir sobre una tarea
 * existente; el estado lo cambia el plugin, salvo el descarte de una que no
 * llegó a revisión (`descartarTarea`).
 */
export async function escribirVeredicto(id: string, veredicto: Veredicto, motivo: string, por: string, linea?: string) {
  if (!/^F-\d+$/.test(id)) throw new Error("Id de tarea inválido.");
  const r = await raizPara(linea);
  const archivo = await archivoDe(r, id);
  if (!archivo) throw new Error(`No existe la tarea ${id}.`);
  const t = tareaDesde((await leer(archivo)) ?? "", archivo);
  if (t?.estado !== "aprobacion") throw new Error(`${id} no está en aprobación (está en «${t?.estado}»).`);
  if (veredicto === "rechazada" && !motivo.trim()) throw new Error("Un rechazo necesita motivo: es lo que lee quien lo arregla.");
  await fs.mkdir(rutas(r).veredictos, { recursive: true });
  const cuerpo = { tarea: id, veredicto, motivo: motivo.trim(), por, fecha: new Date().toISOString() };
  await fs.writeFile(path.join(rutas(r).veredictos, `${id}.json`), JSON.stringify(cuerpo, null, 2) + "\n");
  return cuerpo;
}

/** Hasta cuánto de cada sección se devuelve para mirarla: lo demás está en el archivo. */
const SECCION_MAX = 30_000;

/**
 * Lo que dice una tarea. `paraElPR` y `probarAMano` los escribe Label (fabrica/docs/Plan-Integracion.md,
 * etapa 4): se muestran en su pantalla, nunca en voz alta.
 */
export type SeccionesDeTarea = { pedido: string; spec: string; hallazgos: string; respuesta: string; paraElPR: string; probarAMano: string };

/** Lo que dice una tarea, para mirarla antes del veredicto: su pedido, su spec, los hallazgos de revisión y su respuesta. Solo lee. */
export async function seccionesDeLaTarea(id: string, linea?: string): Promise<SeccionesDeTarea | null> {
  const r = linea === undefined ? await raiz() : await raizDeLinea(linea);
  const archivo = r ? await archivoDe(r, id) : undefined;
  if (!archivo) return null;
  const { cuerpo } = partir((await leer(archivo)) ?? "");
  const de = (nombre: string) => seccionDe(cuerpo, nombre).slice(0, SECCION_MAX);
  return { pedido: de("Pedido"), spec: de("Spec"), hallazgos: de("Hallazgos de revisión"), respuesta: de("Respuesta del humano"), paraElPR: de("Para el PR"), probarAMano: de("Para probar a mano") };
}

/**
 * Las etapas desde las que él puede descartar una tarea desde la aplicación: las mismas desde las que
 * el mod deja pasar a `descartada` (sus SALIDAS). Desde revisión en adelante se rechaza o se le
 * contesta, y la fábrica decide.
 */
export const DESCARTABLES = ["pendiente", "spec", "construccion"] as const;

/**
 * Descarta una tarea que él ya no quiere: la excepción al contrato que él decidió el 20 de octubre
 * de 2026. Solo una pendiente, en spec o en construcción, que no tenga tomada ninguna sesión; que
 * no haya una corrida en marcha lo mira quien llama, antes. Cambia el estado y la fecha, deja la
 * línea en su bitácora y el movimiento en eventos.jsonl, como lo haría el mod. Su worktree y su rama
 * quedan como estaban.
 */
export async function descartarTarea(id: string, motivo: string, por: string, linea?: string) {
  if (!/^F-\d+$/.test(id)) throw new Error("Id de tarea inválido.");
  const limpio = motivo.replace(/\s+/g, " ").trim().slice(0, 600);
  const r = await raizPara(linea);
  const archivo = await archivoDe(r, id);
  if (!archivo) throw new Error(`No existe la tarea ${id}.`);
  const { datos, cuerpo } = partir((await leer(archivo)) ?? "");
  const estado = datos.estado ?? "";
  if (!(DESCARTABLES as readonly string[]).includes(estado)) throw new Error(`${id} está en «${estado}»: desde ahí no se descarta. Recházala o contéstale, y la fábrica decide.`);
  if (datos.tomada_por?.trim() && Date.parse(datos.tomada_hasta ?? "") > Date.now()) throw new Error(`${id} la tiene tomada una sesión de Claude Code: espera a que la suelte.`);
  const ts = new Date().toISOString();
  await fs.writeFile(archivo, unir({ ...datos, estado: "descartada", actualizada: ts }, anotar(cuerpo, `${ts} · descartada por ${por}${limpio ? `: ${limpio}` : ""}`)));
  await fs.appendFile(rutas(r).eventos, JSON.stringify({ ts, tarea: id, de: estado as Evento["de"], a: "descartada", agente: por, ...(limpio ? { nota: limpio } : {}) } satisfies Evento) + "\n");
  return { tarea: id, de: estado, fecha: ts };
}

/**
 * Con qué modelo se escribe la spec de una tarea, elegido por él para esa tarea; `null` vuelve al
 * de la línea. Solo mientras la spec no se escribió, o se detuvo a preguntarle
 * (`eligeModeloDeSpec`), y no con la tarea tomada por una sesión. El campo lo escribe solo la
 * aplicación: el mod frena a un agente que lo edite.
 */
export async function fijarModeloDeSpecDeTarea(id: string, modelo: ModeloDeRol | null, por: string, linea?: string) {
  return fijarModeloDeTarea("spec", id, modelo, por, linea);
}

/**
 * Con qué modelo se construye una tarea, elegido por él para esa tarea; `null` vuelve al de la
 * línea. Manda sobre Jev, que no lo abarata, y vale en cada vuelta de retrabajo. Se elige
 * mientras la tarea pueda volver a construirse (`eligeModeloDeConstruccion`), y no con la tarea
 * tomada por una sesión. El campo lo escribe solo la aplicación: el mod frena a un agente que lo edite.
 */
export async function fijarModeloDeConstruccionDeTarea(id: string, modelo: ModeloDeRol | null, por: string, linea?: string) {
  return fijarModeloDeTarea("construccion", id, modelo, por, linea);
}

const MODELO_DE_TAREA = {
  spec: {
    campo: "modelo_spec",
    se: "la spec se escribe con",
    cuando: "el modelo de la spec se elige antes de escribirla, o cuando se detuvo a preguntarte",
    puede: (estado: Estado, eventos: Evento[], id: string) => eligeModeloDeSpec(estado, detenidasDesde(eventos).get(id)?.de ?? null),
  },
  construccion: {
    campo: "modelo_construccion",
    se: "se construye con",
    cuando: "el modelo de la construcción se elige mientras la tarea pueda volver a construirse",
    puede: (estado: Estado) => eligeModeloDeConstruccion(estado),
  },
} as const;

/** Lo común a elegir el modelo de una tarea: la guardia, el campo y la línea en su bitácora. */
async function fijarModeloDeTarea(rol: keyof typeof MODELO_DE_TAREA, id: string, modelo: ModeloDeRol | null, por: string, linea?: string) {
  const m = MODELO_DE_TAREA[rol];
  if (!/^F-\d+$/.test(id)) throw new Error("Id de tarea inválido.");
  if (modelo !== null && !esModeloDeRol(modelo)) throw new Error(`Modelo desconocido: «${String(modelo)}».`);
  const r = await raizPara(linea);
  const archivo = await archivoDe(r, id);
  if (!archivo) throw new Error(`No existe la tarea ${id}.`);
  const { datos, cuerpo } = partir((await leer(archivo)) ?? "");
  const estado = esEstado(datos.estado) ? datos.estado : "pendiente";
  const eventos = eventosDesde((await leer(rutas(r).eventos)) ?? "");
  if (!m.puede(estado, eventos, id)) throw new Error(`${id} está en «${estado}»: ${m.cuando}.`);
  if (datos.tomada_por?.trim() && Date.parse(datos.tomada_hasta ?? "") > Date.now()) throw new Error(`${id} la tiene tomada una sesión de Claude Code: espera a que la suelte.`);
  if ((datos[m.campo] ?? null) === modelo) return { tarea: id, modelo, cambio: false };
  const ts = new Date().toISOString();
  const resto: Datos = { ...datos, actualizada: ts };
  if (modelo === null) delete resto[m.campo];
  else resto[m.campo] = modelo;
  const dicho = modelo === null ? "el de la línea" : modelo === "inherit" ? "el de la corrida" : modelo;
  await fs.writeFile(archivo, unir(resto, anotar(cuerpo, `${ts} · ${m.se} ${dicho}: lo eligió ${por}`)));
  return { tarea: id, modelo, cambio: true };
}

/**
 * «Debió esperarme» (fabrica/docs/Plan-Integracion.md, etapa 2): una tarea que Jev dejó entrar sola
 * y tenía que esperarlo. Queda en factory/jev.jsonl como un error de Jev, y su umbral se aprieta; si
 * él la quita, queda una línea que lo retira. Vale solo para una tarea que Jev clasificó sencilla:
 * una regla no aprende, y una grande ya lo esperó. Marcar lo que ya está marcado no anota nada.
 */
export async function marcarDebioEsperar(id: string, marcar: boolean, linea?: string): Promise<{ tarea: string; marcada: boolean; cambio: boolean }> {
  if (!/^F-\d+$/.test(id)) throw new Error("Id de tarea inválido.");
  const r = await raizPara(linea);
  const archivo = await archivoDe(r, id);
  if (!archivo) throw new Error(`No existe la tarea ${id}.`);
  const { datos } = partir((await leer(archivo)) ?? "");
  if (datos.integracion_clase !== "sencilla" || datos.integracion_por !== "jev") throw new Error(`${id} no la dejó entrar sola Jev: no hay nada que aprender de ella.`);
  const ruta = rutas(r).jev;
  const texto = (await leer(ruta)) ?? "";
  if (marcadasConDebioEsperar(lineasDeJev(texto)).has(id) === marcar) return { tarea: id, marcada: marcar, cambio: false };
  const salto = texto && !texto.endsWith("\n") ? "\n" : "";
  await fs.appendFile(ruta, `${salto}${JSON.stringify(lineaDeDebioEsperar(id, marcar, new Date().toISOString()))}\n`);
  return { tarea: id, marcada: marcar, cambio: true };
}

/** Las tareas de una raíz que él marcó con «Debió esperarme». */
export async function marcadasDe(r: string): Promise<Set<string>> {
  return marcadasConDebioEsperar(lineasDeJev((await leer(rutas(r).jev)) ?? ""));
}

/** Las dependencias de las tareas que ya están en la cola, por id. */
async function grafoDeDependencias(dir: string): Promise<Map<string, string[]>> {
  const grafo = new Map<string, string[]>();
  for (const ent of await listar(dir)) {
    if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
    const t = tareaDesde((await leer(path.join(dir, ent.name))) ?? "", ent.name);
    if (t) grafo.set(t.id, t.dependeDe);
  }
  return grafo;
}

const comparable = (titulo: string) => titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Crea las tareas propuestas en `pendiente` y guarda el documento original en
 * factory/requerimientos/, para que la spec lo pueda consultar. Encolar tareas
 * nuevas es lo que el contrato deja hacer; cambiar una que existe, no (salvo descartarla). Lo que
 * dice `### Depende de` de cada sección (ids de la cola o títulos de otras
 * secciones) queda en `depende_de`; una referencia que no se reconoce o un
 * ciclo rechazan el documento entero, antes de escribir nada.
 */
export async function crearTareas(documento: { titulo: string; texto: string }, tareas: TareaPropuesta[]) {
  if (!tareas.length) throw new Error("No hay tareas que crear: el documento está vacío.");
  if (tareas.length > 50) throw new Error("Son más de 50 tareas: parte el documento en varios.");
  const r = await raizElegida();
  const rt = rutas(r);
  const planeadas = await planearTareas(r, tareas.map((t) => ({ titulo: t.titulo.trim().slice(0, 80) || documento.titulo, pedido: t.pedido, dependeDe: t.dependeDe ?? [] })), "ni otra sección del documento");

  const ts = new Date().toISOString();
  const dirReq = path.join(rt.factory, "requerimientos");
  await fs.mkdir(dirReq, { recursive: true });
  const nombreDoc = `${ts.slice(0, 16).replace(/[-:T]/g, "")}-${slug(documento.titulo)}.md`;
  await fs.writeFile(path.join(dirReq, nombreDoc), documento.texto.trim() + "\n");
  const refDoc = `factory/requerimientos/${nombreDoc}`;
  const conDocumento = planeadas.map((t) => ({ ...t, pedido: `${t.pedido.trim()}\n\n_Documento de requerimientos: \`${refDoc}\`_` }));
  const creadas = await escribirTareas(r, conDocumento, ts, "la aplicación de compañía");
  return { documento: refDoc, creadas };
}

type TareaPorPlanear = { titulo: string; pedido: string; dependeDe: readonly string[] };
type TareaPlaneada = { id: string; titulo: string; pedido: string; dependeDe: string[]; origenHallazgo?: string; origenEntrada?: string; tituloAjeno?: boolean; modeloSpec?: ModeloDeRol; modeloConstruccion?: ModeloDeRol };

/**
 * Los ids y las dependencias de tareas nuevas en un proyecto, antes de escribir nada: si algo no
 * cuadra, lanza y no queda nada a medias. Cada una recibe el siguiente id libre de ese proyecto.
 * Una dependencia es un id de la cola o el título de otra de las nuevas; lo desconocido, depender
 * de sí misma o un ciclo, se rechazan. `ademas` completa el mensaje de lo desconocido.
 */
async function planearTareas(r: string, tareas: readonly TareaPorPlanear[], ademas = ""): Promise<TareaPlaneada[]> {
  const rt = rutas(r);
  if (!(await fs.access(rt.config).then(() => true, () => false))) throw new Error("Este proyecto no tiene factory/config.md.");
  await fs.mkdir(rt.tareas, { recursive: true });
  const grafo = await grafoDeDependencias(rt.tareas);
  const ids = (await listar(rt.tareas)).map((x) => /^(F-\d+)/.exec(x.name)?.[1]).filter((x): x is string => !!x);

  const planeadas: TareaPlaneada[] = [];
  for (const t of tareas) planeadas.push({ id: siguienteId([...ids, ...planeadas.map((c) => c.id)]), titulo: t.titulo, pedido: t.pedido, dependeDe: [] });
  for (const [i, t] of tareas.entries()) {
    const propia = planeadas[i]!;
    for (const ref of t.dependeDe) {
      const id = /^F-\d+$/i.test(ref) ? ref.toUpperCase() : planeadas.find((p) => comparable(p.titulo) === comparable(ref))?.id;
      if (!id || (!grafo.has(id) && !planeadas.some((p) => p.id === id))) throw new Error(`«${propia.titulo}» depende de «${ref}», que no es una tarea de la cola${ademas ? ` ${ademas}` : ""}.`);
      if (id === propia.id) throw new Error(`«${propia.titulo}» no puede depender de sí misma.`);
      if (!propia.dependeDe.includes(id)) propia.dependeDe.push(id);
    }
  }
  for (const p of planeadas) grafo.set(p.id, p.dependeDe);
  const ciclo = cicloEn(grafo);
  if (ciclo) throw new Error(`Las dependencias forman un ciclo (${ciclo.join(" → ")}): ninguna podría arrancar.`);
  return planeadas;
}

/** Escribe en `pendiente` las tareas ya planeadas, con su evento cada una. Encolar es lo que el contrato del plugin deja hacer desde fuera. */
async function escribirTareas(r: string, planeadas: readonly TareaPlaneada[], ts: string, origen: string): Promise<{ id: string; titulo: string }[]> {
  const rt = rutas(r);
  const creadas: { id: string; titulo: string }[] = [];
  let lineas = "";
  for (const t of planeadas) {
    await fs.writeFile(path.join(rt.tareas, `${t.id}-${slug(t.titulo)}.md`), tareaNueva(t.id, t.titulo, t.pedido, ts, origen, { dependeDe: t.dependeDe, origenHallazgo: t.origenHallazgo, origenEntrada: t.origenEntrada, tituloAjeno: t.tituloAjeno, modeloSpec: t.modeloSpec, modeloConstruccion: t.modeloConstruccion }));
    lineas += JSON.stringify({ ts, tarea: t.id, de: null, a: "pendiente", agente: "aplicacion", nota: t.titulo } satisfies Evento) + "\n";
    creadas.push({ id: t.id, titulo: t.titulo });
  }
  await fs.appendFile(rt.eventos, lineas);
  return creadas;
}

/** Lo más largo que puede ser el título de una tarea: es también el nombre de su archivo y de su rama. */
export const TITULO_MAX = 80;

/**
 * Encola una tarea nueva en una línea, la elegida o cualquier otra. Es por donde entra lo que no
 * sale de un documento ni de la deuda: el formulario y, después, lo que llegue de una fuente. Un
 * id de línea que no existe es un error, nunca otra línea. El pedido va tal cual: quien llama
 * decide si cita texto ajeno.
 */
export async function crearTareaEn(
  linea: string,
  tarea: { titulo: string; pedido: string; dependeDe?: readonly string[]; origenEntrada?: string; tituloAjeno?: boolean; modeloSpec?: ModeloDeRol; modeloConstruccion?: ModeloDeRol },
  origen = "la aplicación de compañía",
) {
  // Una sola línea: el título va al frontmatter, al nombre del archivo y a la rama.
  const titulo = tarea.titulo.replace(/\s+/g, " ").trim();
  if (!titulo) throw new Error("La tarea necesita un título.");
  if (titulo.length > TITULO_MAX) throw new Error(`El título va hasta ${TITULO_MAX} caracteres.`);
  if (!tarea.pedido.trim()) throw new Error("La tarea necesita un pedido: qué hay que hacer.");
  const r = await raizDeLinea(linea);
  const planeadas = await planearTareas(r, [{ titulo, pedido: tarea.pedido, dependeDe: tarea.dependeDe ?? [] }]);
  const conOrigen = planeadas.map((t) => ({ ...t, origenEntrada: tarea.origenEntrada, tituloAjeno: tarea.tituloAjeno, modeloSpec: tarea.modeloSpec, modeloConstruccion: tarea.modeloConstruccion }));
  const [creada] = await escribirTareas(r, conOrigen, new Date().toISOString(), origen);
  return { linea, ...creada! };
}

/** Las tareas abiertas de una línea (ni hechas ni descartadas), para elegir de qué depende una nueva. */
export async function tareasAbiertasDe(linea: string): Promise<{ id: string; titulo: string }[]> {
  const dir = rutas(await raizDeLinea(linea)).tareas;
  const abiertas: { id: string; titulo: string }[] = [];
  for (const ent of await listar(dir)) {
    if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
    const t = tareaDesde((await leer(path.join(dir, ent.name))) ?? "", ent.name);
    if (t && t.estado !== "hecho" && t.estado !== "descartada") abiertas.push({ id: t.id, titulo: t.titulo });
  }
  return abiertas.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Convierte un hallazgo MENOR de una tarea terminada en una tarea nueva, en
 * `pendiente`, que lo cita. Lo pide él con un clic: nunca se crean solas. Un
 * hallazgo ya convertido no se vuelve a ofrecer ni a convertir.
 */
export async function crearTareaDeDeuda(hallazgo: string) {
  if (!/^[0-9a-f]{16}$/.test(hallazgo)) throw new Error("Hallazgo inválido.");
  const i = await instantanea();
  if (!i) throw new Error("Todavía no hay un proyecto elegido: elígelo en la configuración.");
  if (!i.config) throw new Error("Este proyecto no tiene factory/config.md.");
  const h = i.deuda.find((x) => x.id === hallazgo);
  if (!h) throw new Error("Ese hallazgo ya no está entre los menores de las tareas terminadas.");
  if (h.convertidoEn) throw new Error(`Ese hallazgo ya es la tarea ${h.convertidoEn}.`);
  const { titulo, pedido } = pedidoDeDeuda(h);
  const planeadas = await planearTareas(i.raiz, [{ titulo, pedido, dependeDe: [] }]);
  const [creada] = await escribirTareas(i.raiz, planeadas.map((t) => ({ ...t, origenHallazgo: h.id })), new Date().toISOString(), "la aplicación de compañía, desde la deuda");
  return { id: creada!.id, titulo, hallazgo: h.id };
}
