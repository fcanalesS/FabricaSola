import type { DatabaseSync } from "node:sqlite";
import type { ModeloDeRol } from "../fabrica/modelos.ts";
import { configDeLinea, crearTareaEn, lineasDeLaFabrica, tareasAbiertasDe } from "../fabrica/motor/proyecto.ts";
import { baseDeDatos } from "../datos.ts";
import { cuentas, descartar, elemento, elementos, guardarBorrador, ignorarCambio, loAgregado, marcarPasado, type ElementoDeBandeja, type EstadoEnBandeja } from "./bandeja.ts";
import { agregarFuente, cambiarFuente, datosDeFuente, encenderFuente, fuentes, quitarFuente, reintentarFuente, variablesDeFuente, vistaDeFuentes, type FuenteALaVista } from "./fuentes.ts";
import { vueltaDelLector } from "./lector.ts";
import { crearTareaDelCambio, origenDe, pasarALinea } from "./pasar.ts";
import { pedidoDeLaPeticion, peticionDesde, type CampoDePeticion } from "./peticion.ts";

/**
 * La Entrada, para las páginas y su ruta: qué se ve y qué se puede hacer.
 * Cada acción sale de un clic suyo, y lo que llega del navegador se revisa
 * aquí antes de tocar nada. Lo que se devuelve nunca trae un token: la vista
 * de las fuentes lo deja fuera por tipo. Solo para el servidor.
 */

/** `modeloSpec` y `modeloConstruccion`: con qué modelo escribe sus specs y con cuál construye, para ofrecer «el de la línea»; `null` sin config. */
export type LineaALaVista = { id: string; nombre: string; abiertas: { id: string; titulo: string }[]; modeloSpec: ModeloDeRol | null; modeloConstruccion: ModeloDeRol | null };
/** Un elemento de la Bandeja como se ve, con lo agregado si cambió en el origen. */
export type ElementoALaVista = ElementoDeBandeja & { agregado: string | null };
export type EntradaALaVista = {
  lineas: LineaALaVista[];
  bandeja: { cuentas: Record<EstadoEnBandeja, number>; elementos: ElementoALaVista[] };
  fuentes: FuenteALaVista[];
  /** Las variables `COMPANIA_FUENTE_*_TOKEN` que existen, y qué conexión usa cada una: solo nombres. */
  variables: { nombre: string; usadaPor: string | null }[];
};

const RECIENTES = 30;

export async function vistaDeLaEntrada(db: DatabaseSync = baseDeDatos(), entorno: Record<string, string | undefined> = process.env): Promise<EntradaALaVista> {
  const lineas: LineaALaVista[] = [];
  for (const l of await lineasDeLaFabrica()) {
    const config = await configDeLinea(l.id).catch(() => null);
    lineas.push({ id: l.id, nombre: l.nombre, abiertas: await tareasAbiertasDe(l.id).catch(() => []), modeloSpec: config?.modeloSpec ?? null, modeloConstruccion: config?.modeloConstruccion ?? null });
  }
  const lista = [...elementos(db, "abiertos"), ...elementos(db, "pasado").slice(0, RECIENTES), ...elementos(db, "descartado").slice(0, RECIENTES)];
  const conFuente = fuentes(db);
  return {
    lineas,
    bandeja: { cuentas: cuentas(db), elementos: lista.map((e) => ({ ...e, agregado: e.estado === "cambio" ? loAgregado(e.textoPasado ?? "", e.texto) || null : null })) },
    fuentes: vistaDeFuentes(db, entorno),
    variables: variablesDeFuente(entorno).map((nombre) => ({ nombre, usadaPor: conFuente.find((f) => f.variable === nombre)?.nombre ?? null })),
  };
}

/**
 * Por qué la Entrada no deja quitar una línea, o `null` si puede: una conexión que le lleva issues
 * los dejaría sin destino, y lo que espera en la Bandeja para ella, sin línea a la que pasar.
 */
export function laEntradaUsaLaLinea(db: DatabaseSync, id: string): string | null {
  const conexiones = fuentes(db).filter((f) => f.repos.some((r) => r.linea === id));
  if (conexiones.length) {
    const nombres = conexiones.slice(0, 3).map((f) => `«${f.nombre}»`).join(", ");
    return `${conexiones.length === 1 ? `La conexión ${nombres} le lleva` : `Las conexiones ${nombres} le llevan`} issues: cambia a qué línea van, o quítala, en Fuentes.`;
  }
  const esperan = elementos(db, "abiertos").filter((e) => e.linea === id).length;
  if (esperan) return `${esperan === 1 ? "Hay 1 cosa" : `Hay ${esperan} cosas`} en la Bandeja para esta línea: pásala${esperan === 1 ? "" : "s"} a otra o descártala${esperan === 1 ? "" : "s"} primero.`;
  return null;
}

export type AccionDeEntrada =
  | { accion: "peticion"; dato: unknown }
  | { accion: "pasar"; id: number; linea: string; titulo: string; dependeDe: string[] }
  | { accion: "descartar"; id: number }
  | { accion: "cambio_a_tarea"; id: number }
  | { accion: "ignorar_cambio"; id: number }
  | { accion: "fuente_agregar"; dato: unknown }
  | { accion: "fuente_cambiar"; id: number; dato: unknown }
  | { accion: "fuente_quitar"; id: number }
  | { accion: "fuente_encender"; id: number; encendida: boolean }
  | { accion: "fuente_reintentar"; id: number }
  | { accion: "traer"; id: number | null };

const idValido = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/** Lo que pidió el navegador, revisado en su forma. Lo que no sea eso, `null`. Es lógica pura. */
export function accionDeEntrada(dato: unknown): AccionDeEntrada | null {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  switch (d.accion) {
    case "peticion":
      return { accion: "peticion", dato: d };
    case "pasar": {
      if (!idValido(d.id) || typeof d.linea !== "string" || typeof d.titulo !== "string") return null;
      const deps = Array.isArray(d.dependeDe) ? d.dependeDe.filter((x): x is string => typeof x === "string" && /^F-\d{1,6}$/i.test(x)).slice(0, 10) : [];
      return { accion: "pasar", id: d.id, linea: d.linea, titulo: d.titulo.slice(0, 200), dependeDe: deps };
    }
    case "descartar":
    case "cambio_a_tarea":
    case "ignorar_cambio":
    case "fuente_quitar":
    case "fuente_reintentar":
      return idValido(d.id) ? { accion: d.accion, id: d.id } : null;
    case "fuente_agregar":
      return { accion: "fuente_agregar", dato: d.fuente };
    case "fuente_cambiar":
      return idValido(d.id) ? { accion: "fuente_cambiar", id: d.id, dato: d.fuente } : null;
    case "fuente_encender":
      return idValido(d.id) && typeof d.encendida === "boolean" ? { accion: "fuente_encender", id: d.id, encendida: d.encendida } : null;
    case "traer":
      return d.id === undefined || d.id === null ? { accion: "traer", id: null } : idValido(d.id) ? { accion: "traer", id: d.id } : null;
    default:
      return null;
  }
}

export type HechoEnLaEntrada =
  | { hecho: true; nota: string; tarea?: { linea: string; id: string; titulo: string } }
  | { hecho: false; motivo: string; errores?: Partial<Record<CampoDePeticion, string>> };

const motivoDe = (e: unknown) => (e instanceof Error ? e.message : "No se pudo.");

/** Hace lo que él pidió. Nunca lanza: un error vuelve como motivo que se puede mostrar. */
export async function hacerEnLaEntrada(a: AccionDeEntrada, db: DatabaseSync = baseDeDatos()): Promise<HechoEnLaEntrada> {
  try {
    switch (a.accion) {
      case "peticion": {
        const r = peticionDesde(a.dato);
        if ("errores" in r) return { hecho: false, motivo: "Revisa lo marcado.", errores: r.errores };
        const p = r.peticion;
        const pedido = pedidoDeLaPeticion(p);
        if (p.destino === "bandeja") {
          if (!(await lineasDeLaFabrica()).some((l) => l.id === p.linea)) return { hecho: false, motivo: "Revisa lo marcado.", errores: { linea: "Esa línea no existe." } };
          guardarBorrador(db, { linea: p.linea, titulo: p.titulo, pedido, ahora: Date.now() });
          return { hecho: true, nota: "Quedó en la Bandeja como borrador tuyo." };
        }
        // «Reescribirlo con mis palabras»: el pedido es suyo, pero la tarea recuerda de qué issue salió, y el issue
        // sale de la Bandeja. Solo uno que todavía espera ahí.
        const desde = Number.isInteger(p.desde) ? elemento(db, p.desde!) : null;
        const deUnIssue = desde && desde.fuente !== null && desde.estado === "nuevo" ? desde : null;
        const origenEntrada = deUnIssue ? origenDe(db, deUnIssue).origen : "formulario";
        const tarea = await crearTareaEn(p.linea, { titulo: p.titulo, pedido, dependeDe: p.dependeDe, origenEntrada, modeloSpec: p.modeloSpec, modeloConstruccion: p.modeloConstruccion }, "la aplicación de compañía, desde el formulario");
        if (deUnIssue) marcarPasado(db, deUnIssue.id, { tarea: tarea.id, linea: tarea.linea });
        return { hecho: true, nota: `Quedó en la cola de ${tarea.linea} como ${tarea.id}.`, tarea };
      }
      case "pasar": {
        const tarea = await pasarALinea(db, a.id, { linea: a.linea, titulo: a.titulo, dependeDe: a.dependeDe });
        return { hecho: true, nota: `Pasó a ${tarea.linea} como ${tarea.id}.`, tarea };
      }
      case "descartar":
        descartar(db, a.id);
        return { hecho: true, nota: "Descartado. En el origen sigue como estaba." };
      case "cambio_a_tarea": {
        const tarea = await crearTareaDelCambio(db, a.id);
        return { hecho: true, nota: `El cambio quedó como ${tarea.id} en ${tarea.linea}.`, tarea };
      }
      case "ignorar_cambio":
        ignorarCambio(db, a.id);
        return { hecho: true, nota: "Cambio dado por visto." };
      case "fuente_agregar": {
        const f = agregarFuente(db, datosDeFuente(a.dato, (await lineasDeLaFabrica()).map((l) => l.id)));
        return { hecho: true, nota: `Conexión «${f.nombre}» guardada.` };
      }
      case "fuente_cambiar": {
        const f = cambiarFuente(db, a.id, datosDeFuente(a.dato, (await lineasDeLaFabrica()).map((l) => l.id)));
        return { hecho: true, nota: `Conexión «${f.nombre}» guardada.` };
      }
      case "fuente_quitar":
        quitarFuente(db, a.id);
        return { hecho: true, nota: "Conexión quitada. Lo que ya trajo sigue en la Bandeja." };
      case "fuente_encender":
        encenderFuente(db, a.id, a.encendida);
        return { hecho: true, nota: a.encendida ? "Encendida." : "Apagada: no lee hasta que la enciendas." };
      case "fuente_reintentar":
        reintentarFuente(db, a.id);
        return { hecho: true, nota: "Vuelve a intentar en la próxima vuelta." };
      case "traer": {
        const hechos = await vueltaDelLector(db, a.id === null ? { forzar: true } : { soloId: a.id });
        const nuevos = hechos.reduce((n, h) => n + h.nuevos, 0);
        const fallan = hechos.filter((h) => h.estado !== "listo").length;
        return { hecho: true, nota: `${nuevos === 1 ? "Llegó 1 nuevo" : `Llegaron ${nuevos} nuevos`}${fallan ? `; ${fallan === 1 ? "una fuente no pudo leer" : `${fallan} fuentes no pudieron leer`}` : ""}.` };
      }
    }
  } catch (e) {
    return { hecho: false, motivo: motivoDe(e) };
  }
}
