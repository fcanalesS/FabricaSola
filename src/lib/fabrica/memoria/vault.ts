import { promises as fs } from "node:fs";
import path from "node:path";
import { archivosParaDetectar, carpetaDeLaFabrica, lineasDeLaFabrica } from "../motor/proyecto.ts";
import { lineaPorId } from "../motor/lineas.ts";
import { crearCatalogo } from "../habilidades/disco.ts";
import { leerFicha, leerVault, revisarVault, type ArchivoDelVault, type Problema } from "./formato.ts";
import { documento, fichaVacia, leeme, nombreDeArchivo, SECCIONES } from "./plantillas.ts";
import { loQueSeVe, type Sembrado } from "./sembrar.ts";

/**
 * El vault de la memoria en el disco: el de cada línea, en su repositorio
 * (`factory/memoria/`), y el de la planta, en `datos/memoria/`. Crear
 * uno no pisa nada: si ya tiene ficha, se deja como está. La aplicación escribe
 * los archivos y no hace commit: los sube él. Solo para el servidor.
 */

export const vaultDeLaRaiz = (raiz: string) => path.join(raiz, "factory", "memoria");
export const vaultDeLaPlanta = () => path.join(carpetaDeLaFabrica(), "memoria");

const CARPETAS = ["decisiones", "propuestas", "bitacora"] as const;
const existe = (p: string) => fs.access(p).then(
  () => true,
  () => false,
);

export type VaultCreado = { creado: boolean; ruta: string; propuestas: string[] };

/**
 * Crea un vault: `LEEME.md`, una ficha vacía, sus carpetas y, si se le dan, una propuesta por cada
 * tema sembrado. Si ya tiene ficha, no toca nada (tampoco siembra otra vez).
 */
export async function crearVault(dir: string, nombre: string, sembrados: readonly Sembrado[] = [], ahora = new Date()): Promise<VaultCreado> {
  if (await existe(path.join(dir, "ficha.md"))) return { creado: false, ruta: dir, propuestas: [] };
  await fs.mkdir(dir, { recursive: true });
  for (const c of CARPETAS) {
    await fs.mkdir(path.join(dir, c), { recursive: true });
    // Para que git guarde la carpeta aunque esté vacía.
    await fs.writeFile(path.join(dir, c, ".gitkeep"), "");
  }
  if (!(await existe(path.join(dir, "LEEME.md")))) await fs.writeFile(path.join(dir, "LEEME.md"), leeme(nombre));
  const fecha = ahora.toISOString().slice(0, 10);
  const propuestas: string[] = [];
  for (const [i, s] of sembrados.entries()) {
    const id = `P-${String(i + 1).padStart(4, "0")}`;
    const archivo = nombreDeArchivo(id, s.titulo);
    await fs.writeFile(
      path.join(dir, "propuestas", archivo),
      documento({
        id,
        titulo: s.titulo,
        estado: "propuesta",
        fecha,
        temas: [s.tema],
        origen: `detectado en ${s.fuentes.join(", ")}`,
        propone: "la aplicación, al crear la memoria",
        regla: s.regla,
        secciones: {
          [SECCIONES[0]]: s.regla,
          [SECCIONES[1]]: `Es lo que dicen los manifiestos del proyecto (${s.fuentes.join(", ")}). Revísalo: si no es una decisión del proyecto, recházala.`,
          [SECCIONES[3]]: s.detalle.map((d) => `- ${d}`).join("\n"),
        },
      }),
    );
    propuestas.push(`propuestas/${archivo}`);
  }
  // La ficha va al final: es la que dice que el vault existe.
  await fs.writeFile(path.join(dir, "ficha.md"), fichaVacia(nombre));
  return { creado: true, ruta: dir, propuestas };
}

/** Crea el vault de una línea, sembrado con lo que se ve en sus manifiestos, y el de la planta si falta. */
export async function crearMemoriaDeLinea(id: string, ahora = new Date()): Promise<VaultCreado> {
  const linea = lineaPorId(await lineasDeLaFabrica(), id);
  if (!(await existe(path.join(linea.raiz, "factory", "config.md")))) throw new Error("Esta línea todavía no tiene factory/: créala primero.");
  await crearMemoriaDeLaPlanta(ahora);
  // Con la memoria, el catálogo de habilidades: las que ya tiene el proyecto, sin asignar. No pisa uno que exista.
  await crearCatalogo(linea.raiz, linea.nombre);
  return crearVault(vaultDeLaRaiz(linea.raiz), linea.nombre, loQueSeVe(await archivosParaDetectar(linea.raiz)), ahora);
}

/** El vault de la planta: lo que vale en todas las líneas. Sin siembra. */
export const crearMemoriaDeLaPlanta = (ahora = new Date()) => crearVault(vaultDeLaPlanta(), "la planta", [], ahora);

/** Los archivos `.md` de un vault, con su ruta relativa y separada por `/`. Lo que no es Markdown no se lee. */
export async function archivosDelVault(dir: string): Promise<ArchivoDelVault[]> {
  const archivos: ArchivoDelVault[] = [];
  const recorrer = async (rel: string) => {
    const entradas = await fs.readdir(path.join(dir, rel), { withFileTypes: true }).catch(() => []);
    for (const e of entradas) {
      const ruta = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await recorrer(ruta);
      else if (e.isFile() && e.name.endsWith(".md")) archivos.push({ ruta, texto: await fs.readFile(path.join(dir, ruta), "utf8") });
    }
  };
  await recorrer("");
  return archivos.sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** El id de la planta en la pantalla Memoria. Un id de línea no puede empezar con «_». */
export const PLANTA = "_planta";

/** `raiz`: el repositorio de la línea; la planta no tiene. */
export type DondeDeLaMemoria = { en: string; nombre: string; dir: string; esPlanta: boolean; raiz: string | null };

/** El vault de una línea o el de la planta. Un id que no existe es un error, nunca otro vault. */
export async function vaultDe(en: string): Promise<DondeDeLaMemoria> {
  if (en === PLANTA) return { en, nombre: "La planta", dir: vaultDeLaPlanta(), esPlanta: true, raiz: null };
  const linea = lineaPorId(await lineasDeLaFabrica(), en);
  return { en, nombre: linea.nombre, dir: vaultDeLaRaiz(linea.raiz), esPlanta: false, raiz: linea.raiz };
}

/** Las únicas rutas que la pantalla escribe: la ficha, una decisión o una propuesta. */
const RUTA_ESCRIBIBLE = /^(?:ficha\.md|(?:decisiones|propuestas)\/[a-z0-9][a-z0-9-]*\.md)$/i;

/** Escribe lo que cambió en un vault. Una ruta fuera de lo escribible es un error: no se escribe nada. */
export async function escribirEnElVault(dir: string, cambios: readonly { ruta: string; texto: string }[]): Promise<void> {
  const malas = cambios.filter((c) => !RUTA_ESCRIBIBLE.test(c.ruta));
  if (malas.length) throw new Error(`No se escribe fuera de la ficha, decisiones/ y propuestas/ (${malas[0]!.ruta.slice(0, 60)}).`);
  for (const c of cambios) {
    await fs.mkdir(path.dirname(path.join(dir, c.ruta)), { recursive: true });
    await fs.writeFile(path.join(dir, c.ruta), c.texto.replace(/\r\n?/g, "\n"));
  }
}

export type ResumenDeLaMemoria ={ existe: boolean; reglas: number; decisiones: number; propuestas: number; problemas: Problema[] };

/** Cómo está el vault de una raíz: si existe, cuántas reglas, decisiones vigentes y propuestas por revisar, y sus problemas. */
export async function resumenDeLaMemoria(dir: string): Promise<ResumenDeLaMemoria> {
  const archivos = await archivosDelVault(dir);
  const ficha = archivos.find((a) => a.ruta === "ficha.md");
  if (!ficha) return { existe: false, reglas: 0, decisiones: 0, propuestas: 0, problemas: [] };
  const v = leerVault(archivos);
  return {
    existe: true,
    reglas: leerFicha(ficha.texto).reglas.length,
    decisiones: v.decisiones.filter((d) => d.estado === "vigente").length,
    propuestas: v.propuestas.filter((p) => p.estado === "propuesta").length,
    problemas: revisarVault(archivos),
  };
}
