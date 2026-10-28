import { lineasDeLaFabrica, sinCommitEn } from "../motor/proyecto.ts";
import { costoDeEspecialidades, crearCatalogo, escribirHabilidad, type CostoDeEspecialidad, escribirHabilidadSuya, guardarCatalogo, habilidadesDisponibles, habilidadesSuyas, leerCatalogoDe, plantillaDelCerebro, plantillasDeEspecialidades } from "../habilidades/disco.ts";
import { LEY, propuestaDelCerebro, propuestasDeEspecialidades } from "../habilidades/especialidades.ts";
import { asignarEnElCatalogo, catalogoParaGuardar, delCerebro, ETAPAS, ETAPAS_CON_ESPECIALIDADES, leerCatalogo, type EtapaConEspecialidades, revisarCatalogo, type OrigenDeHabilidad, type ProblemaDelCatalogo } from "../habilidades/formato.ts";
import { aprobarHabilidad, aprobarHabilidadSuya, CATALOGO } from "../habilidades/propuestas.ts";
import { aprobar, editarPropuesta, guardarFicha, ID_DE_DECISION, ID_DE_PROPUESTA, rechazar, reemplazar, type DatosEditables, type HechoEnElVault } from "./cambiar.ts";
import { buscar, leerFicha, leerVault, revisarVault, type DocumentoDeMemoria, type EntradaDeBitacora, type Hallazgo, type Problema, type Vault } from "./formato.ts";
import { SECCIONES, TOPES } from "./plantillas.ts";
import { archivosDelVault, crearMemoriaDeLaPlanta, crearMemoriaDeLinea, escribirEnElVault, PLANTA, resumenDeLaMemoria, vaultDe } from "./vault.ts";

/**
 * La pantalla Memoria, para su página y su ruta: qué se ve de un vault y qué
 * puede hacer él. Cada cambio sale de un clic suyo; lo que llega del
 * navegador se revisa aquí antes de tocar nada, y las rutas de los archivos
 * nunca vienen de él: salen del vault leído. Nada de esto llega a un modelo.
 * La aplicación escribe los archivos y no hace commit. Solo para el servidor.
 */

export type LugarDeLaMemoria = { en: string; nombre: string; esPlanta: boolean; existe: boolean; porRevisar: number; problemas: number };

export type MemoriaALaVista = {
  lugares: LugarDeLaMemoria[];
  en: string;
  nombre: string;
  esPlanta: boolean;
  /** Dónde está, para que él lo encuentre (y lo suba). */
  carpeta: string;
  existe: boolean;
  ficha: { texto: string; reglas: number; lineas: number; bytes: number; topes: { lineas: number; bytes: number } } | null;
  decisiones: DocumentoDeMemoria[];
  propuestas: DocumentoDeMemoria[];
  /** Lo último de la bitácora, lo más nuevo primero. */
  bitacora: (EntradaDeBitacora & { ruta: string })[];
  problemas: Problema[];
  /** Archivos del vault sin commit; `null` si no está en un repositorio (la planta vive fuera de uno). */
  sinCommit: number | null;
  /** Las habilidades de la línea; `null` en la planta, que no tiene catálogo. */
  habilidades: HabilidadesALaVista | null;
};

/** Cuántas tareas de la bitácora trajeron una habilidad, y la última vez. */
export type UsoEnLaBitacora = { tareas: number; ultima: string | null };

export type HabilidadesALaVista = {
  /** Dónde está el catálogo, relativo al repositorio. */
  archivo: string;
  existe: boolean;
  texto: string;
  problemas: ProblemaDelCatalogo[];
  /** Lo que dice el catálogo, uso por uso, con si la habilidad existe y cuánto se usó. */
  usos: ({ nombre: string; etapas: string[]; cuando: string; existe: boolean; linea: number } & UsoEnLaBitacora)[];
  /** Las que existen y el catálogo no usa. De un `SKILL.md` se ve solo su nombre y su descripción. */
  sinUsar: ({ nombre: string; descripcion: string; origen: OrigenDeHabilidad; soloAMano: boolean } & UsoEnLaBitacora)[];
  etapas: readonly string[];
  /** Lo que pesa cada especialidad en el prompt de su agente: sus oficios y sus bytes. */
  costos: CostoDeEspecialidad[];
};

/** Por habilidad, en cuántas tareas de la bitácora estuvo y la última fecha. */
function usosEnLaBitacora(bitacora: Vault["bitacora"]): Map<string, UsoEnLaBitacora> {
  const usos = new Map<string, UsoEnLaBitacora>();
  for (const e of bitacora)
    for (const h of e.habilidades) {
      const u = usos.get(h) ?? { tareas: 0, ultima: null };
      usos.set(h, { tareas: u.tareas + 1, ultima: !u.ultima || e.fecha > u.ultima ? e.fecha : u.ultima });
    }
  return usos;
}

/** Las habilidades de una línea, para su pestaña: el catálogo, las que no usa y cuánto se usó cada una. */
async function habilidadesALaVista(raiz: string, bitacora: Vault["bitacora"]): Promise<HabilidadesALaVista> {
  const [texto, disponibles, costos] = await Promise.all([leerCatalogoDe(raiz), habilidadesDisponibles(raiz), costoDeEspecialidades().catch(() => [])]);
  const enLaBitacora = usosEnLaBitacora(bitacora);
  const uso = (nombre: string) => enLaBitacora.get(nombre) ?? { tareas: 0, ultima: null };
  const c = leerCatalogo(texto ?? "");
  const usadas = new Set(c.usos.map((u) => u.nombre));
  const existen = new Set(disponibles.map((d) => d.nombre));
  return {
    archivo: CATALOGO,
    existe: texto !== null,
    texto: texto ?? "",
    problemas: texto === null ? [] : revisarCatalogo(texto, disponibles),
    usos: c.usos.map((u) => ({ nombre: u.nombre, etapas: u.etapas, cuando: u.cuando, existe: existen.has(u.nombre), linea: u.linea, ...uso(u.nombre) })),
    sinUsar: disponibles.filter((d) => !usadas.has(d.nombre)).map((d) => ({ nombre: d.nombre, descripcion: d.descripcion, origen: d.origen, soloAMano: d.soloAMano, ...uso(d.nombre) })),
    etapas: ETAPAS,
    costos,
  };
}

const BITACORA_A_LA_VISTA = 40;

/** Los vaults que hay: el de la planta primero y después uno por línea. */
export async function lugaresDeLaMemoria(): Promise<LugarDeLaMemoria[]> {
  const lugares: LugarDeLaMemoria[] = [];
  for (const en of [PLANTA, ...(await lineasDeLaFabrica()).map((l) => l.id)]) {
    const donde = await vaultDe(en);
    const r = await resumenDeLaMemoria(donde.dir);
    lugares.push({ en, nombre: donde.nombre, esPlanta: donde.esPlanta, existe: r.existe, porRevisar: r.propuestas, problemas: r.problemas.length });
  }
  return lugares;
}

/** El vault que se pidió, o el primero que tenga algo por revisar, o el de la primera línea. */
export function lugarElegido(lugares: readonly LugarDeLaMemoria[], pedido: unknown): string {
  if (typeof pedido === "string" && lugares.some((l) => l.en === pedido)) return pedido;
  return (lugares.find((l) => l.porRevisar > 0) ?? lugares.find((l) => !l.esPlanta) ?? lugares[0])?.en ?? PLANTA;
}

export async function vistaDeLaMemoria(pedido?: unknown): Promise<MemoriaALaVista> {
  const lugares = await lugaresDeLaMemoria();
  const en = lugarElegido(lugares, pedido);
  const donde = await vaultDe(en);
  const archivos = await archivosDelVault(donde.dir);
  const fichaTexto = archivos.find((a) => a.ruta === "ficha.md")?.texto ?? null;
  const vault = leerVault(archivos);
  return {
    lugares,
    en,
    nombre: donde.nombre,
    esPlanta: donde.esPlanta,
    carpeta: donde.dir,
    existe: fichaTexto !== null,
    ficha:
      fichaTexto === null
        ? null
        : {
            texto: fichaTexto,
            reglas: leerFicha(fichaTexto).reglas.length,
            lineas: fichaTexto.split(/\r?\n/).filter((l) => l.trim()).length,
            bytes: new TextEncoder().encode(fichaTexto).length,
            topes: { lineas: TOPES.fichaLineas, bytes: TOPES.fichaBytes },
          },
    decisiones: vault.decisiones.sort((a, b) => b.id.localeCompare(a.id)),
    propuestas: vault.propuestas.sort((a, b) => b.id.localeCompare(a.id)),
    bitacora: [...vault.bitacora].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.ruta.localeCompare(a.ruta) || b.linea - a.linea).slice(0, BITACORA_A_LA_VISTA),
    problemas: fichaTexto === null ? [] : revisarVault(archivos),
    sinCommit: donde.esPlanta || fichaTexto === null ? null : await sinCommitEn(donde.dir),
    habilidades: donde.raiz ? await habilidadesALaVista(donde.raiz, vault.bitacora) : null,
  };
}

/** Buscar en todo un vault, como grep pero sin tildes ni mayúsculas. */
export async function buscarEnLaMemoria(en: string, texto: string): Promise<Hallazgo[]> {
  const t = texto.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!t) return [];
  return buscar(await archivosDelVault((await vaultDe(en)).dir), t, { max: 60 });
}

export type AccionDeMemoria =
  | { accion: "crear"; en: string }
  | { accion: "aprobar"; en: string; id: string; leyoLosScripts: boolean }
  | { accion: "rechazar"; en: string; id: string; motivo: string }
  | { accion: "editar"; en: string; id: string; datos: DatosEditables }
  | { accion: "reemplazar"; en: string; id: string; datos: DatosEditables }
  | { accion: "ficha"; en: string; texto: string }
  | { accion: "catalogo"; en: string; texto: string }
  | { accion: "asignar"; en: string; nombre: string; etapas: string[]; cuando: string }
  | { accion: "crear-catalogo"; en: string }
  /** Deja como propuestas las especialidades de esa etapa que la línea no tiene. */
  | { accion: "proponer-especialidades"; en: string; etapa: EtapaConEspecialidades }
  /** Deja en el vault de la planta la propuesta de una habilidad del cerebro (la de la ley, la de IA), para toda la fábrica. */
  | { accion: "proponer-cerebro"; en: string; nombre: string };

const TOPE_DE_SECCION = 6000;
const TOPE_DE_FICHA = 64 * 1024;
const TOPE_DE_CATALOGO = 64 * 1024;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Lo que él escribió de una decisión o una propuesta, en su forma. Lo que no sea texto queda vacío. */
function datosEditables(v: unknown): DatosEditables | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  const temas = Array.isArray(d.temas) ? d.temas.filter((t): t is string => typeof t === "string") : typeof d.temas === "string" ? d.temas.split(",") : [];
  const s = (d.secciones && typeof d.secciones === "object" ? d.secciones : {}) as Record<string, unknown>;
  return {
    titulo: texto(d.titulo, 300),
    temas: temas.slice(0, 12).map((t) => t.slice(0, 60)),
    regla: texto(d.regla, 400),
    secciones: Object.fromEntries(SECCIONES.map((n) => [n, texto(s[n], TOPE_DE_SECCION)])),
  };
}

/** Lo que pidió el navegador, revisado en su forma. Lo que no sea eso, `null`. Es lógica pura. */
export function accionDeMemoria(dato: unknown): AccionDeMemoria | null {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  if (typeof d.en !== "string" || !(d.en === PLANTA || /^[a-z0-9][a-z0-9-]{0,39}$/.test(d.en))) return null;
  const en = d.en;
  const propuesta = typeof d.id === "string" && ID_DE_PROPUESTA.test(d.id) ? d.id : null;
  const decision = typeof d.id === "string" && ID_DE_DECISION.test(d.id) ? d.id : null;
  switch (d.accion) {
    case "crear":
      return { accion: "crear", en };
    case "aprobar":
      return propuesta ? { accion: "aprobar", en, id: propuesta, leyoLosScripts: d.leyoLosScripts === true } : null;
    case "rechazar":
      return propuesta ? { accion: "rechazar", en, id: propuesta, motivo: texto(d.motivo, 400) } : null;
    case "editar": {
      const datos = datosEditables(d.datos);
      return propuesta && datos ? { accion: "editar", en, id: propuesta, datos } : null;
    }
    case "reemplazar": {
      const datos = datosEditables(d.datos);
      return decision && datos ? { accion: "reemplazar", en, id: decision, datos } : null;
    }
    case "ficha":
      return typeof d.texto === "string" && d.texto.length <= TOPE_DE_FICHA ? { accion: "ficha", en, texto: d.texto } : null;
    case "catalogo":
      return typeof d.texto === "string" && d.texto.length <= TOPE_DE_CATALOGO ? { accion: "catalogo", en, texto: d.texto } : null;
    case "asignar":
      return typeof d.nombre === "string" && d.nombre.length <= 120 && Array.isArray(d.etapas) && d.etapas.length <= 8 && d.etapas.every((e) => typeof e === "string")
        ? { accion: "asignar", en, nombre: d.nombre, etapas: (d.etapas as string[]).map((e) => e.slice(0, 30)), cuando: texto(d.cuando, 300) }
        : null;
    case "crear-catalogo":
      return { accion: "crear-catalogo", en };
    case "proponer-especialidades":
      // Sin etapa, las de la spec: así seguía la pantalla antes de que hubiera las del constructor.
      if (en === PLANTA) return null;
      if (d.etapa === undefined) return { accion: "proponer-especialidades", en, etapa: "spec" };
      return (ETAPAS_CON_ESPECIALIDADES as readonly unknown[]).includes(d.etapa) ? { accion: "proponer-especialidades", en, etapa: d.etapa as EtapaConEspecialidades } : null;
    // «proponer-ley» es como se pedía la de la ley antes de que el cerebro tuviera más de una.
    case "proponer-ley":
      return { accion: "proponer-cerebro", en, nombre: LEY.nombre };
    case "proponer-cerebro":
      return delCerebro(d.nombre) ? { accion: "proponer-cerebro", en, nombre: String(d.nombre) } : null;
    default:
      return null;
  }
}

export type HechoEnLaMemoria = { hecho: true; nota: string; avisos: string[] } | { hecho: false; motivo: string };

/** Quien aprueba desde la pantalla: él. Los agentes no llegan aquí. */
const EL = "él, desde la pantalla Memoria";

/** El catálogo de habilidades de una línea: crearlo, guardarlo como él lo escribió o asignar una habilidad. */
async function enElCatalogo(a: Extract<AccionDeMemoria, { accion: "catalogo" | "asignar" | "crear-catalogo" }>, donde: Awaited<ReturnType<typeof vaultDe>>): Promise<HechoEnLaMemoria> {
  const raiz = donde.raiz;
  if (!raiz) throw new Error("Las habilidades son de cada línea: la planta no tiene catálogo.");
  if (a.accion === "crear-catalogo") {
    const r = await crearCatalogo(raiz, donde.nombre);
    return { hecho: true, nota: r.creado ? `Catálogo creado${r.sinAsignar ? `, con ${r.sinAsignar} ${r.sinAsignar === 1 ? "habilidad" : "habilidades"} sin asignar` : ""}.` : "Ya tenía catálogo: no se tocó.", avisos: [] };
  }
  const disponibles = await habilidadesDisponibles(raiz);
  if (a.accion === "catalogo") {
    const r = catalogoParaGuardar(a.texto, disponibles);
    await guardarCatalogo(raiz, r.texto);
    const usos = leerCatalogo(r.texto).usos.reduce((n, u) => n + u.etapas.length, 0);
    return { hecho: true, nota: `Catálogo guardado: ${usos} ${usos === 1 ? "uso" : "usos"}.`, avisos: r.avisos };
  }
  const texto = await leerCatalogoDe(raiz);
  if (texto === null) throw new Error("Esta línea no tiene catálogo: créalo primero.");
  const h = disponibles.find((d) => d.nombre === a.nombre);
  if (!h) throw new Error(`No hay ninguna habilidad «${a.nombre.slice(0, 60)}» en el proyecto ni entre las tuyas.`);
  if (h.soloAMano) throw new Error(`${h.nombre} solo se usa a mano (disable-model-invocation): no se le puede dar a un agente.`);
  await guardarCatalogo(raiz, asignarEnElCatalogo(texto, a));
  return { hecho: true, nota: `${h.nombre} quedó en ${a.etapas.join(", ")}.`, avisos: [] };
}

/**
 * Las especialidades de esa etapa que la línea todavía no tiene, como propuestas en su vault. Él las
 * aprueba de a una, viendo su texto entero; hasta entonces no hay nada en el repositorio.
 */
async function proponerEspecialidades(donde: Awaited<ReturnType<typeof vaultDe>>, archivos: Awaited<ReturnType<typeof archivosDelVault>>, etapa: EtapaConEspecialidades, ahora: Date): Promise<HechoEnLaMemoria> {
  if (!donde.raiz) throw new Error("Las habilidades son de cada línea: la planta no tiene catálogo.");
  if (!archivos.some((x) => x.ruta === "ficha.md")) throw new Error("Esta línea todavía no tiene memoria: créala primero.");
  const r = propuestasDeEspecialidades(archivos, await plantillasDeEspecialidades(undefined, etapa), {
    disponibles: await habilidadesDisponibles(donde.raiz),
    catalogo: await leerCatalogoDe(donde.raiz),
    fecha: ahora.toISOString().slice(0, 10),
  });
  if (r.nuevas.length) await escribirEnElVault(donde.dir, r.nuevas.map(({ ruta, texto }) => ({ ruta, texto })));
  const avisos = r.omitidas.map((o) => `${o.nombre}: ${o.por}.`);
  if (!r.nuevas.length) return { hecho: true, nota: "No quedó ninguna por proponer.", avisos };
  return { hecho: true, nota: `Quedaron ${r.nuevas.length === 1 ? "una propuesta" : `${r.nuevas.length} propuestas`} para revisar: ${r.nuevas.map((n) => `${n.id} (${n.nombre})`).join(", ")}.`, avisos };
}

/**
 * La propuesta de una habilidad del cerebro, en el vault de la planta: es una para toda la
 * fábrica. Se pida desde donde se pida, va ahí; él la aprueba en La planta.
 */
async function proponerDelCerebro(nombre: string, ahora: Date): Promise<HechoEnLaMemoria> {
  const h = delCerebro(nombre);
  if (!h) throw new Error(`${nombre.slice(0, 60)} no es una habilidad del cerebro.`);
  const planta = await vaultDe(PLANTA);
  const archivos = await archivosDelVault(planta.dir);
  if (!archivos.some((x) => x.ruta === "ficha.md")) throw new Error("La planta todavía no tiene memoria: créala primero.");
  const r = propuestaDelCerebro(archivos, h, await plantillaDelCerebro(h.nombre), { suyas: await habilidadesSuyas(), fecha: ahora.toISOString().slice(0, 10) });
  if ("omitida" in r) return { hecho: true, nota: `No hizo falta: ${r.omitida}.`, avisos: [] };
  await escribirEnElVault(planta.dir, [{ ruta: r.nueva.ruta, texto: r.nueva.texto }]);
  return { hecho: true, nota: `Quedó propuesta en La planta como ${r.nueva.id}: revísala en sus Propuestas.`, avisos: [] };
}

/** Hace lo que él pidió. Nunca lanza: un error vuelve como motivo que se puede mostrar. */
export async function hacerEnLaMemoria(a: AccionDeMemoria, ahora = new Date()): Promise<HechoEnLaMemoria> {
  try {
    const donde = await vaultDe(a.en);
    if (a.accion === "crear") {
      const r = donde.esPlanta ? await crearMemoriaDeLaPlanta(ahora) : await crearMemoriaDeLinea(a.en, ahora);
      if (!r.creado) return { hecho: true, nota: "Ya tenía memoria: no se tocó.", avisos: [] };
      return { hecho: true, nota: `Memoria creada${r.propuestas.length ? `, con ${r.propuestas.length} ${r.propuestas.length === 1 ? "propuesta" : "propuestas"} para revisar` : ""}.`, avisos: [] };
    }
    if (a.accion === "catalogo" || a.accion === "asignar" || a.accion === "crear-catalogo") return await enElCatalogo(a, donde);
    if (a.accion === "proponer-cerebro") return await proponerDelCerebro(a.nombre, ahora);
    const archivos = await archivosDelVault(donde.dir);
    if (a.accion === "proponer-especialidades") return await proponerEspecialidades(donde, archivos, a.etapa, ahora);
    const quien = { ahora, aprobo: EL };
    let r: HechoEnElVault;
    switch (a.accion) {
      case "aprobar": {
        // En la planta, una habilidad es para toda la fábrica: queda como habilidad suya, sin catálogo.
        if (donde.esPlanta && leerVault(archivos).propuestas.find((p) => p.id === a.id)?.habilidad) {
          const h = aprobarHabilidadSuya(archivos, a.id, { suyas: await habilidadesSuyas(), leyoLosScripts: a.leyoLosScripts });
          await escribirHabilidadSuya(h.nombre, h.archivos);
          await escribirEnElVault(donde.dir, h.vault);
          return { hecho: true, nota: h.nota, avisos: h.avisos };
        }
        // Una habilidad no es una decisión: deja sus archivos en el repositorio y su línea en el catálogo.
        if (leerVault(archivos).propuestas.find((p) => p.id === a.id)?.habilidad) {
          if (!donde.raiz) throw new Error("Una habilidad se aprueba en la memoria de su línea: la planta no tiene repositorio.");
          const h = aprobarHabilidad(archivos, a.id, { catalogo: await leerCatalogoDe(donde.raiz), nombreDeLinea: donde.nombre, disponibles: await habilidadesDisponibles(donde.raiz), leyoLosScripts: a.leyoLosScripts });
          await escribirHabilidad(donde.raiz, h.repositorio);
          await escribirEnElVault(donde.dir, h.vault);
          return { hecho: true, nota: h.nota, avisos: h.avisos };
        }
        r = aprobar(archivos, a.id, quien);
        break;
      }
      case "rechazar":
        r = rechazar(archivos, a.id, a.motivo);
        break;
      case "editar":
        r = editarPropuesta(archivos, a.id, a.datos);
        break;
      case "reemplazar":
        r = reemplazar(archivos, a.id, a.datos, quien);
        break;
      case "ficha":
        r = guardarFicha(archivos, a.texto);
        break;
    }
    await escribirEnElVault(donde.dir, r.cambios);
    return { hecho: true, nota: r.nota, avisos: r.avisos };
  } catch (e) {
    return { hecho: false, motivo: e instanceof Error ? e.message : "No se pudo." };
  }
}
