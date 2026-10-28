import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { catalogoNuevo, CEREBRO, habilidadDesde, habilidadesPorEtapa, huellaDe, leerCatalogo, revisarCatalogo, RUTA_DE_ARCHIVO_DE_HABILIDAD, type Etapa, type EtapaConEspecialidades, type HabilidadDeEtapa, type HabilidadDisponible, type OrigenDeHabilidad, type ProblemaDelCatalogo } from "./formato.ts";
import { ESPECIALIDADES, type PlantillaDeEspecialidad } from "./especialidades.ts";
import { CARPETA_DE_HABILIDADES, CATALOGO, type ArchivoDelRepositorio } from "./propuestas.ts";
import { carpetaDeNikke } from "../motor/agentes.ts";

/**
 * Las habilidades en el disco: el catálogo de cada línea
 * (`factory/habilidades.md`, en su repositorio) y las habilidades que
 * existen: las del proyecto (`.claude/skills/`) y las suyas
 * (`.claude/skills/` de su carpeta de Claude Code). De un `SKILL.md` se lee
 * solo el frontmatter; su contenido no se copia ni sale de aquí. Crear un
 * catálogo no pisa uno que exista. La aplicación escribe y no hace commit.
 * Solo para el servidor.
 */

export const catalogoDeLaRaiz = (raiz: string) => path.join(raiz, "factory", "habilidades.md");

/** Su carpeta de Claude Code: la de `CLAUDE_CONFIG_DIR`, o `~/.claude`. La misma que usa Claude Code. */
const carpetaDeClaude = (entorno: NodeJS.ProcessEnv = process.env) => entorno.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), ".claude");

const MAX_HABILIDADES = 200;

/** Las habilidades de una carpeta `skills/`: una subcarpeta con su `SKILL.md`. */
async function habilidadesEn(dir: string, origen: OrigenDeHabilidad): Promise<HabilidadDisponible[]> {
  const entradas = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const halladas: HabilidadDisponible[] = [];
  for (const e of entradas.filter((x) => x.isDirectory()).slice(0, MAX_HABILIDADES)) {
    const ruta = path.join(dir, e.name, "SKILL.md");
    const texto = await fs.readFile(ruta, "utf8").catch(() => null);
    const h = texto === null ? null : habilidadDesde(e.name, texto, origen);
    if (h) halladas.push({ ...h, ruta, huella: huellaDe(texto!) });
  }
  return halladas.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Las habilidades que la fábrica puede nombrar en una línea: las del proyecto y las suyas. Si una
 * suya se llama igual que una del proyecto, vale la suya, como en Claude Code (las personales van
 * antes que las del proyecto).
 */
export async function habilidadesDisponibles(raiz: string, entorno: NodeJS.ProcessEnv = process.env): Promise<HabilidadDisponible[]> {
  const [delProyecto, suyas] = await Promise.all([habilidadesEn(path.join(raiz, ".claude", "skills"), "proyecto"), habilidadesEn(path.join(carpetaDeClaude(entorno), "skills"), "suya")]);
  const nombres = new Set(suyas.map((s) => s.nombre));
  return [...suyas, ...delProyecto.filter((p) => !nombres.has(p.nombre))].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

const existe = (p: string) => fs.access(p).then(
  () => true,
  () => false,
);

/** Crea el catálogo de una línea con sus habilidades sin asignar. Si ya tiene uno, no lo toca. */
export async function crearCatalogo(raiz: string, nombre: string): Promise<{ creado: boolean; sinAsignar: number }> {
  const archivo = catalogoDeLaRaiz(raiz);
  if (await existe(archivo)) return { creado: false, sinAsignar: 0 };
  if (!(await existe(path.join(raiz, "factory")))) throw new Error("Esta línea todavía no tiene factory/: créala primero.");
  const delProyecto = await habilidadesEn(path.join(raiz, ".claude", "skills"), "proyecto");
  await fs.writeFile(archivo, catalogoNuevo(nombre, delProyecto));
  return { creado: true, sinAsignar: delProyecto.length };
}

/**
 * Lo que recibe cada etapa en una corrida, según el catálogo de la raíz: solo las habilidades que
 * existen y se pueden dar a un agente. `null` si la línea no tiene catálogo.
 */
export async function habilidadesDeLaCorrida(raiz: string, entorno: NodeJS.ProcessEnv = process.env): Promise<Record<Etapa, HabilidadDeEtapa[]> | null> {
  const texto = await fs.readFile(catalogoDeLaRaiz(raiz), "utf8").catch(() => null);
  if (texto === null) return null;
  return habilidadesPorEtapa(texto, await habilidadesDisponibles(raiz, entorno));
}

/** El catálogo de una línea, o `null` si no tiene. */
export const leerCatalogoDe = (raiz: string) => fs.readFile(catalogoDeLaRaiz(raiz), "utf8").catch(() => null);

/** Guarda el catálogo que él escribió (ya revisado). Sin `factory/`, no: la línea no es de la fábrica. */
export async function guardarCatalogo(raiz: string, texto: string): Promise<void> {
  if (!(await existe(path.join(raiz, "factory")))) throw new Error("Esta línea todavía no tiene factory/: créala primero.");
  await fs.writeFile(catalogoDeLaRaiz(raiz), texto.replace(/\r\n?/g, "\n"));
}

const SKILL_ESCRIBIBLE = /^\.claude\/skills\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(.+)$/;

/**
 * Escribe una habilidad aprobada: sus archivos en `.claude/skills/<nombre>/` y el catálogo. Solo
 * esas rutas, de una sola habilidad, y nunca encima de una que exista: si algo no cumple, no se
 * escribe nada. Primero la habilidad y al final el catálogo, que es el que la pone a trabajar.
 */
export async function escribirHabilidad(raiz: string, archivos: readonly ArchivoDelRepositorio[]): Promise<void> {
  const base = path.resolve(raiz);
  const nombres = new Set<string>();
  for (const a of archivos) {
    if (a.ruta === CATALOGO) continue;
    const m = SKILL_ESCRIBIBLE.exec(a.ruta);
    const dentro = path.resolve(base, a.ruta);
    if (!m || !RUTA_DE_ARCHIVO_DE_HABILIDAD.test(m[2]!) || !dentro.startsWith(base + path.sep)) throw new Error(`No se escribe fuera de ${CARPETA_DE_HABILIDADES}/ y ${CATALOGO} (${a.ruta.slice(0, 60)}).`);
    nombres.add(m[1]!);
  }
  if (nombres.size !== 1) throw new Error("Se escribe una habilidad a la vez.");
  const [nombre] = nombres;
  if (await existe(path.join(raiz, ".claude", "skills", nombre!))) throw new Error(`Ya hay una carpeta ${CARPETA_DE_HABILIDADES}/${nombre}/: no se pisa.`);
  if (!(await existe(path.join(raiz, "factory")))) throw new Error("Esta línea todavía no tiene factory/: créala primero.");
  const ordenados = [...archivos.filter((a) => a.ruta !== CATALOGO), ...archivos.filter((a) => a.ruta === CATALOGO)];
  for (const a of ordenados) {
    const destino = path.join(raiz, ...a.ruta.split("/"));
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, a.texto.replace(/\r\n?/g, "\n"));
  }
}

export type ResumenDeHabilidades = {
  existe: boolean;
  /** Cuántos usos (etapa y habilidad) tiene el catálogo. */
  usos: number;
  /** Cuántas habilidades del proyecto existen y no usa ninguna etapa. Las suyas no cuentan: son de todos sus proyectos. */
  sinUsar: number;
  problemas: ProblemaDelCatalogo[];
  /** Por etapa, las que recibiría un agente: solo nombres. */
  porEtapa: Record<string, string[]>;
};

/** Cómo está el catálogo de una línea: si existe, cuántos usos, cuántas sin usar y sus problemas. */
export async function resumenDeHabilidades(raiz: string, entorno: NodeJS.ProcessEnv = process.env): Promise<ResumenDeHabilidades> {
  const texto = await fs.readFile(catalogoDeLaRaiz(raiz), "utf8").catch(() => null);
  if (texto === null) return { existe: false, usos: 0, sinUsar: 0, problemas: [], porEtapa: {} };
  const disponibles = await habilidadesDisponibles(raiz, entorno);
  const c = leerCatalogo(texto);
  const usadas = new Set(c.usos.map((u) => u.nombre));
  const porEtapa = Object.fromEntries(Object.entries(habilidadesPorEtapa(texto, disponibles)).map(([e, l]) => [e, l.map((x) => x.nombre)]));
  return {
    existe: true,
    usos: c.usos.reduce((n, u) => n + u.etapas.length, 0),
    sinUsar: disponibles.filter((d) => d.origen === "proyecto" && !usadas.has(d.nombre) && !d.soloAMano).length,
    problemas: revisarCatalogo(texto, disponibles),
    porEtapa,
  };
}

/** Dónde están las plantillas de las especialidades: junto al plugin de la fábrica. */
export const carpetaDeEspecialidades = () => path.join(/*turbopackIgnore: true*/ process.cwd(), "fabrica", "plantillas", "especialidades");

/**
 * Las plantillas de las especialidades, leídas de su carpeta: las de una etapa, o todas. Una que
 * falta es un error: viene con la aplicación.
 */
export async function plantillasDeEspecialidades(dir = carpetaDeEspecialidades(), etapa?: EtapaConEspecialidades): Promise<PlantillaDeEspecialidad[]> {
  return Promise.all(
    ESPECIALIDADES.filter((e) => !etapa || e.etapa === etapa).map(async (e) => {
      const skill = await fs.readFile(path.join(dir, e.nombre, "SKILL.md"), "utf8").catch(() => null);
      if (skill === null) throw new Error(`Falta la plantilla de ${e.nombre} en fabrica/plantillas/especialidades/.`);
      return { ...e, skill: skill.replace(/\r\n?/g, "\n") };
    }),
  );
}

/** Lo que pesa una especialidad en el prompt de su agente: sus Nikkes y cuánto suman sus archivos. */
export type CostoDeEspecialidad = { nombre: string; nikkes: string[]; bytes: number | null };

/**
 * Lo que pesa cada especialidad y cada habilidad del cerebro, para mostrarlo antes de proponerla:
 * sus Nikkes (del `nikkes:` de su plantilla) y lo que suman sus archivos en la carpeta de nikke.
 * `bytes` es `null` si esa carpeta no está en este equipo. Solo se mira el tamaño: los archivos no
 * se leen.
 */
export async function costoDeEspecialidades(dirDePlantillas = carpetaDeEspecialidades(), dirDeNikke?: string | null, dirDelCerebro = carpetaDelCerebro()): Promise<CostoDeEspecialidad[]> {
  const nikke = dirDeNikke === undefined ? await carpetaDeNikke() : dirDeNikke;
  const plantillas = [
    ...(await plantillasDeEspecialidades(dirDePlantillas)),
    // Una del cerebro cuya plantilla falta no se muestra: no hay qué proponer.
    ...(await Promise.all(CEREBRO.map(async (h) => ({ nombre: h.nombre, skill: await plantillaDelCerebro(h.nombre, dirDelCerebro).catch(() => null) })))).filter((p): p is { nombre: string; skill: string } => p.skill !== null),
  ];
  const out: CostoDeEspecialidad[] = [];
  for (const p of plantillas) {
    const nikkes = habilidadDesde(p.nombre, p.skill, "proyecto")?.nikkes ?? [];
    let bytes: number | null = null;
    if (nikke) {
      const tamanos = await Promise.all(nikkes.map((n) => fs.stat(path.join(nikke, `${n}.md`)).then((s) => s.size, () => 0)));
      bytes = tamanos.reduce((a, b) => a + b, 0);
    }
    out.push({ nombre: p.nombre, nikkes, bytes });
  }
  return out;
}

/** Las habilidades suyas: las de su carpeta de Claude Code, que valen en todos sus proyectos. */
export const habilidadesSuyas = (entorno: NodeJS.ProcessEnv = process.env) => habilidadesEn(path.join(carpetaDeClaude(entorno), "skills"), "suya");

/** Dónde están las plantillas de las habilidades del cerebro: junto al plugin de la fábrica. */
export const carpetaDelCerebro = () => path.join(/*turbopackIgnore: true*/ process.cwd(), "fabrica", "plantillas", "cerebro");

/** La plantilla de una habilidad del cerebro de la fábrica (`CEREBRO`: la de la ley, la de IA). Viene con la aplicación. */
export async function plantillaDelCerebro(nombre: string, dir = carpetaDelCerebro()): Promise<string> {
  const skill = await fs.readFile(path.join(dir, nombre, "SKILL.md"), "utf8").catch(() => null);
  if (skill === null) throw new Error(`Falta la plantilla de ${nombre} en fabrica/plantillas/cerebro/.`);
  return skill.replace(/\r\n?/g, "\n");
}

/**
 * Escribe una habilidad suya aprobada en su carpeta de Claude Code (`skills/<nombre>/`). Solo
 * rutas de habilidad, dentro de esa carpeta, y nunca encima de una que exista: si algo no cumple,
 * no se escribe nada. No toca ningún catálogo.
 */
export async function escribirHabilidadSuya(nombre: string, archivos: readonly ArchivoDelRepositorio[], entorno: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nombre)) throw new Error(`«${nombre.slice(0, 40)}» no es un nombre de habilidad.`);
  const base = path.resolve(carpetaDeClaude(entorno), "skills", nombre);
  for (const a of archivos) {
    const destino = path.resolve(base, a.ruta);
    if (!RUTA_DE_ARCHIVO_DE_HABILIDAD.test(a.ruta) || !destino.startsWith(base + path.sep)) throw new Error(`No se escribe fuera de skills/${nombre}/ (${a.ruta.slice(0, 60)}).`);
  }
  if (await existe(base)) throw new Error(`Ya hay una carpeta skills/${nombre}/ en tu carpeta de Claude Code: no se pisa.`);
  for (const a of archivos) {
    const destino = path.join(base, ...a.ruta.split("/"));
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, a.texto.replace(/\r\n?/g, "\n"));
  }
}
