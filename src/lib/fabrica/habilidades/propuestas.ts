import { partir, unir } from "../motor/formato.ts";
import { leerVault, type ArchivoDelVault, type DocumentoDeMemoria } from "../memoria/formato.ts";
import { asignarEnElCatalogo, catalogoNuevo, ETAPAS, esScript, leerCatalogo, NOMBRE_DE_HABILIDAD_NUEVA, RUTA_DE_ARCHIVO_DE_HABILIDAD, TOPES_DE_HABILIDAD, type HabilidadDisponible } from "./formato.ts";

/**
 * Aprobar la propuesta de una habilidad nueva: la que un agente dejó en
 * `## Para la memoria` y el mod pasó al vault con sus archivos. Al aprobarla,
 * la habilidad queda en el repositorio de la línea
 * (`.claude/skills/<nombre>/`) y en el catálogo, en sus etapas; la propuesta,
 * aprobada. No pisa una habilidad que exista, del proyecto ni suya. Si trae
 * scripts, él tiene que decir que los leyó enteros: Claude Code puede
 * correrlos. Es lógica pura: devuelve qué escribir, y escribirlo es de
 * `disco.ts` y de `vault.ts`. El commit es de él.
 */

/** Un archivo del repositorio de la línea, con su ruta relativa a la raíz y separada por `/`. */
export type ArchivoDelRepositorio = { ruta: string; texto: string };

export type HabilidadAprobada = {
  /** Lo que cambia en el vault: la propuesta, aprobada. */
  vault: { ruta: string; texto: string }[];
  /** Lo que se escribe en el repositorio: los archivos de la habilidad y el catálogo. */
  repositorio: ArchivoDelRepositorio[];
  nota: string;
  avisos: string[];
};

export const CARPETA_DE_HABILIDADES = ".claude/skills";
export const CATALOGO = "factory/habilidades.md";

const bytes = (t: string) => new TextEncoder().encode(t).length;

/** Los scripts de una propuesta: lo que no es texto de la habilidad. */
export const scriptsDe = (d: Pick<DocumentoDeMemoria, "habilidad">) => (d.habilidad?.archivos ?? []).filter((a) => esScript(a.ruta)).map((a) => a.ruta);

/** Lo que no deja aprobarla tal como está. Lo mismo que revisa el mod, por si el archivo se tocó a mano. */
export function problemasDeLaHabilidad(d: DocumentoDeMemoria): string[] {
  const h = d.habilidad;
  if (!h) return ["no es la propuesta de una habilidad"];
  const skill = h.archivos.find((a) => a.ruta === "SKILL.md");
  const datos = skill ? partir(skill.texto).datos : {};
  const rutas = h.archivos.map((a) => a.ruta);
  return [
    NOMBRE_DE_HABILIDAD_NUEVA.test(h.nombre) ? "" : `«${h.nombre.slice(0, 40)}» no es un nombre de habilidad`,
    h.etapas.length ? "" : "no dice en qué etapa se usa",
    ...h.etapas.filter((e) => !(ETAPAS as readonly string[]).includes(e)).map((e) => `«${e.slice(0, 20)}» no es una etapa de la fábrica`),
    h.cuando.trim() ? "" : "no dice cuándo se usa",
    skill ? "" : "no trae su SKILL.md",
    skill && datos.name?.trim() && datos.name.trim() !== h.nombre ? `su SKILL.md se llama «${datos.name.trim().slice(0, 40)}»` : "",
    skill && !datos.description?.trim() ? "su SKILL.md no tiene description" : "",
    /^true$/i.test(datos["disable-model-invocation"]?.trim() ?? "") ? "su SKILL.md no se puede dar a un agente (disable-model-invocation)" : "",
    ...rutas.filter((r) => !RUTA_DE_ARCHIVO_DE_HABILIDAD.test(r)).map((r) => `la ruta «${r.slice(0, 40)}» no vale`),
    new Set(rutas).size === rutas.length ? "" : "repite un archivo",
    h.archivos.length > TOPES_DE_HABILIDAD.archivos ? `trae más de ${TOPES_DE_HABILIDAD.archivos} archivos` : "",
    h.archivos.some((a) => bytes(a.texto) > TOPES_DE_HABILIDAD.bytesPorArchivo) ? `un archivo pasa de ${TOPES_DE_HABILIDAD.bytesPorArchivo / 1024} KB` : "",
    bytes(h.archivos.map((a) => a.texto).join("")) > TOPES_DE_HABILIDAD.bytes ? `entre todos pasan de ${TOPES_DE_HABILIDAD.bytes / 1024} KB` : "",
  ].filter(Boolean);
}

export type HabilidadSuyaAprobada = {
  vault: { ruta: string; texto: string }[];
  /** El nombre de la habilidad y sus archivos, con la ruta dentro de su carpeta. */
  nombre: string;
  archivos: ArchivoDelRepositorio[];
  nota: string;
  avisos: string[];
};

/**
 * Aprobar, en el vault de la planta, la propuesta de una habilidad para toda la fábrica: queda como
 * habilidad suya (en su carpeta de Claude Code), no en un repositorio, y sin tocar ningún
 * catálogo: cada línea la usa solo si el suyo la nombra. Las mismas guardas que en una línea: no
 * pisa una habilidad suya que exista, y con scripts, él tiene que decir que los leyó. Es lógica
 * pura: escribirla es de `disco.ts`.
 */
export function aprobarHabilidadSuya(archivos: readonly ArchivoDelVault[], id: string, e: { suyas: readonly HabilidadDisponible[]; leyoLosScripts: boolean }): HabilidadSuyaAprobada {
  const p = leerVault(archivos).propuestas.find((x) => x.id === id);
  if (!p) throw new Error(`No hay ninguna propuesta ${id.slice(0, 20)}.`);
  if (p.estado !== "propuesta") throw new Error(`${p.id} ya está ${p.estado}.`);
  const h = p.habilidad;
  if (!h) throw new Error(`${p.id} no es la propuesta de una habilidad.`);
  const problemas = problemasDeLaHabilidad(p);
  if (problemas.length) throw new Error(`No se aprobó: ${problemas.join(", ")}. Recházala con su motivo.`);
  if (e.suyas.some((d) => d.nombre === h.nombre)) throw new Error(`Ya tienes una habilidad «${h.nombre}» en tu carpeta de Claude Code: la propuesta no la pisa. Recházala, o cámbiale el nombre a la que ya está.`);
  const scripts = scriptsDe(p);
  if (scripts.length && !e.leyoLosScripts) throw new Error(`Trae ${scripts.length === 1 ? "un script" : `${scripts.length} scripts`} (${scripts.join(", ")}): léelos enteros y marca que los leíste antes de aprobarla.`);
  const original = archivos.find((a) => a.ruta === p.ruta)!.texto;
  const { datos, cuerpo } = partir(original);
  return {
    vault: [{ ruta: p.ruta, texto: unir({ ...datos, estado: "aprobada", motivo: `Aprobada: quedó en tu carpeta de Claude Code, skills/${h.nombre}/.` }, cuerpo) }],
    nombre: h.nombre,
    archivos: h.archivos.map((a) => ({ ruta: a.ruta, texto: a.texto })),
    nota: `${p.id} aprobada: «${h.nombre}» quedó como habilidad tuya, para toda la fábrica.`,
    avisos: [`Ninguna línea la usa todavía: en la pestaña Habilidades de cada línea, «Usarla en esta línea» la pone en ${h.etapas.join(" y ")}.`],
  };
}

export function aprobarHabilidad(
  archivos: readonly ArchivoDelVault[],
  id: string,
  e: { catalogo: string | null; nombreDeLinea: string; disponibles: readonly HabilidadDisponible[]; leyoLosScripts: boolean },
): HabilidadAprobada {
  const p = leerVault(archivos).propuestas.find((x) => x.id === id);
  if (!p) throw new Error(`No hay ninguna propuesta ${id.slice(0, 20)}.`);
  if (p.estado !== "propuesta") throw new Error(`${p.id} ya está ${p.estado}.`);
  const h = p.habilidad;
  if (!h) throw new Error(`${p.id} no es la propuesta de una habilidad.`);
  const problemas = problemasDeLaHabilidad(p);
  if (problemas.length) throw new Error(`No se aprobó: ${problemas.join(", ")}. Recházala con su motivo.`);
  const ya = e.disponibles.find((d) => d.nombre === h.nombre);
  if (ya) throw new Error(`Ya hay una habilidad «${h.nombre}» ${ya.origen === "suya" ? "tuya, que vale en todos tus proyectos" : "en el proyecto"}: la propuesta no la pisa. Recházala, o cámbiale el nombre a la que ya está.`);
  const scripts = scriptsDe(p);
  if (scripts.length && !e.leyoLosScripts) throw new Error(`Trae ${scripts.length === 1 ? "un script" : `${scripts.length} scripts`} (${scripts.join(", ")}): léelos enteros y marca que los leíste antes de aprobarla.`);

  const avisos: string[] = [];
  const antes = e.catalogo ?? catalogoNuevo(e.nombreDeLinea, []);
  // Si el catálogo ya la nombraba (a mano, antes de que existiera), su línea queda como está.
  const nombrada = leerCatalogo(antes).usos.find((u) => u.nombre === h.nombre);
  const catalogo = nombrada ? antes : asignarEnElCatalogo(antes, h);
  if (nombrada) avisos.push(`El catálogo ya la nombraba en la línea ${nombrada.linea}: quedó como estaba.`);
  if (!e.catalogo) avisos.push("La línea no tenía catálogo: se creó con esta habilidad.");
  avisos.push(`Quedó sin commit: revisa ${CARPETA_DE_HABILIDADES}/${h.nombre}/ y ${CATALOGO} antes de subirlos.`);

  const original = archivos.find((a) => a.ruta === p.ruta)!.texto;
  const { datos, cuerpo } = partir(original);
  return {
    vault: [{ ruta: p.ruta, texto: unir({ ...datos, estado: "aprobada", motivo: `Aprobada: ${CARPETA_DE_HABILIDADES}/${h.nombre}/ y su línea en el catálogo.` }, cuerpo) }],
    repositorio: [...h.archivos.map((a) => ({ ruta: `${CARPETA_DE_HABILIDADES}/${h.nombre}/${a.ruta}`, texto: a.texto })), { ruta: CATALOGO, texto: catalogo }],
    nota: `${p.id} aprobada: la habilidad «${h.nombre}» quedó en ${CARPETA_DE_HABILIDADES}/${h.nombre}/ y en el catálogo (${h.etapas.join(", ")}).`,
    avisos,
  };
}
