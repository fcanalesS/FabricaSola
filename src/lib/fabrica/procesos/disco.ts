import { promises as fs } from "node:fs";
import path from "node:path";
import { esRamaProtegida } from "../motor/proyecto.ts";
import { leerProceso, pasosSinDeshacer, plantillaDeEvaluacion, plantillaDeProceso, plantillaDelVigia, revisarProceso, type ProblemaDelProceso } from "./formato.ts";

/** Los procesos que se crean desde una plantilla. */
export type ProcesoDePlantilla = "publicar" | "vigia" | "evaluacion";
export const deQuePlantilla = (v: unknown): ProcesoDePlantilla => (v === "vigia" || v === "evaluacion" ? v : "publicar");

/**
 * Los procesos de una línea en el disco: `factory/procesos/*.md`, en su
 * repositorio. Se leen y se revisan; crear uno desde la plantilla no pisa uno
 * que exista. Nada de aquí corre un paso. La aplicación escribe y no hace
 * commit. Solo para el servidor.
 */

export const carpetaDeProcesos = (raiz: string) => path.join(raiz, "factory", "procesos");

const MAX_PROCESOS = 50;
const MAX_BYTES = 64 * 1024;

export type ProcesoALaVista = {
  id: string;
  archivo: string;
  nombre: string;
  cuando: string;
  rama: string;
  borrador: boolean;
  /** `claves`: los nombres de las que recibe; `prContra`, si su push abre un PR. Para avisar antes de correr. */
  pasos: { linea: number; tipo: string; texto: string; claves: string[]; prContra: string | null }[];
  /** Las líneas de los comandos que dicen que no se deshacen. */
  sinDeshacer: number[];
  problemas: ProblemaDelProceso[];
};

export type ProcesosDeLaLinea = { existe: boolean; procesos: ProcesoALaVista[] };

/** Los procesos de la línea, leídos y revisados. Sin carpeta, ninguno. */
export async function procesosDe(raiz: string): Promise<ProcesosDeLaLinea> {
  const dir = carpetaDeProcesos(raiz);
  const entradas = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entradas) return { existe: false, procesos: [] };
  const archivos = entradas
    .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "LEEME.md")
    .map((e) => e.name)
    .sort()
    .slice(0, MAX_PROCESOS);
  const procesos: ProcesoALaVista[] = [];
  for (const archivo of archivos) {
    const ruta = path.join(dir, archivo);
    const tamano = (await fs.stat(ruta)).size;
    if (tamano > MAX_BYTES) {
      procesos.push({ id: "", archivo, nombre: "", cuando: "", rama: "", borrador: false, pasos: [], sinDeshacer: [], problemas: [{ linea: null, que: `Pesa ${tamano} bytes: un proceso no pasa de ${MAX_BYTES}.` }] });
      continue;
    }
    const texto = await fs.readFile(ruta, "utf8");
    const p = leerProceso(texto);
    procesos.push({
      id: p.id,
      archivo,
      nombre: p.nombre,
      cuando: p.cuando,
      rama: p.rama,
      borrador: p.borrador,
      pasos: p.pasos.map((x) => ({ linea: x.linea, tipo: x.tipo, texto: x.texto, claves: x.claves, prContra: x.prContra })),
      sinDeshacer: pasosSinDeshacer(p),
      problemas: revisarProceso(texto, archivo),
    });
  }
  return { existe: true, procesos };
}

const existe = (p: string) => fs.access(p).then(
  () => true,
  () => false,
);

/**
 * Crea `factory/procesos/publicar.md` (o `vigia.md`, el vigía de vulnerabilidades, o
 * `evaluacion.md`) desde su plantilla. La de publicar y la de la evaluación nacen como borrador: no
 * corren hasta que él cambie los comandos y les quite `borrador`; la rama de publicar es la de
 * trabajo, si no es una protegida. Si ya hay uno con ese nombre, no lo toca.
 */
export async function crearProcesoDesdePlantilla(raiz: string, o: { nombreDeLinea: string; rama: string | null; cual?: ProcesoDePlantilla }): Promise<{ creado: boolean; archivo: string }> {
  if (!(await existe(path.join(raiz, "factory", "config.md")))) throw new Error("Esta línea todavía no tiene factory/: créala primero.");
  const dir = carpetaDeProcesos(raiz);
  const cual = deQuePlantilla(o.cual);
  const archivo = `${cual}.md`;
  if (await existe(path.join(dir, archivo))) return { creado: false, archivo };
  const rama = o.rama && !esRamaProtegida(o.rama) && /^[A-Za-z0-9._/-]{1,200}$/.test(o.rama) ? o.rama : "desarrollo";
  await fs.mkdir(dir, { recursive: true });
  const texto =
    cual === "vigia" ? plantillaDelVigia({ nombreDeLinea: o.nombreDeLinea }) : cual === "evaluacion" ? plantillaDeEvaluacion({ nombreDeLinea: o.nombreDeLinea }) : plantillaDeProceso({ nombreDeLinea: o.nombreDeLinea, rama });
  await fs.writeFile(path.join(dir, archivo), texto);
  return { creado: true, archivo };
}
