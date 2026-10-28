import { FIRMA, hacerEnLaFabrica, type Accion } from "../cliente.ts";
import { corridaActual } from "../motor/corridas.ts";
import { historialDeLaTarea, type HistorialDeTarea } from "../motor/informes.ts";
import { lineaPorId, mismaRaiz, type Linea } from "../motor/lineas.ts";
import { esModeloDeRol, type ModeloDeRol } from "../modelos.ts";
import { cambiosDeLaTarea, descartarTarea, elegirProyecto, escribirRespuesta, escribirVeredicto, fijarModeloDeConstruccionDeTarea, fijarModeloDeRol, fijarModeloDeSpecDeTarea, leerAjustes, marcarDebioEsperar, lineasDeLaFabrica, seccionesDeLaTarea, type CambiosDeTarea, type SeccionesDeTarea } from "../motor/proyecto.ts";

/**
 * Lo que se hace desde la pantalla de una línea: correr su cola o detener su corrida, y con una
 * tarea, contestarle, aprobarla, rechazarla o descartarla. Cada acción lleva su línea, y una línea
 * que no existe es un error, nunca otra. Correr una línea la deja como la activa: corre una a la vez.
 *
 * En la línea activa, la acción va por el mismo camino que la columna de ella (`hacerEnLaFabrica`):
 * después del veredicto, la fábrica sigue sola con esa tarea. En otra línea, la acción queda
 * escrita en su `factory/` y la tarea sigue cuando corra esa línea: hoy corre una a la vez, y
 * lanzar una corrida en otra línea llega con el cambio a la fábrica (etapa 6 del plan de la planta).
 * Solo para el servidor.
 */

export type AccionDeLinea =
  | { accion: "responder"; linea: string; tarea: string; texto: string }
  | { accion: "aprobar"; linea: string; tarea: string }
  | { accion: "rechazar"; linea: string; tarea: string; motivo: string }
  | { accion: "descartar"; linea: string; tarea: string; motivo: string }
  /** Con qué modelo se escribe la spec de esa tarea; `null`, el de la línea. */
  | { accion: "modelo_spec"; linea: string; tarea: string; modelo: ModeloDeRol | null }
  /** Con qué modelo se construye esa tarea; `null`, el de la línea. */
  | { accion: "modelo_construccion"; linea: string; tarea: string; modelo: ModeloDeRol | null }
  /** «Debió esperarme»: Jev la dejó entrar sola y tenía que esperarlo. `false` lo quita. */
  | { accion: "debio_esperar"; linea: string; tarea: string; marcar: boolean }
  /** Correr la cola de la línea; con `tareas`, solo esas. */
  | { accion: "correr"; linea: string; tareas: string[] }
  /** Detener la corrida que trabaja en la línea. */
  | { accion: "detener"; linea: string };

const ID_DE_TAREA = /^F-\d{1,6}$/;
const ID_DE_LINEA = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Lo que llegó del navegador, revisado. Lo que no tenga la forma, `null`. Es lógica pura. */
export function accionDeLinea(dato: unknown): AccionDeLinea | null {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  if (typeof d.linea === "string" && ID_DE_LINEA.test(d.linea)) {
    if (d.accion === "detener") return { accion: "detener", linea: d.linea };
    if (d.accion === "correr") {
      if (d.tareas === undefined) return { accion: "correr", linea: d.linea, tareas: [] };
      return Array.isArray(d.tareas) && d.tareas.length <= 50 && d.tareas.every((t) => typeof t === "string" && ID_DE_TAREA.test(t)) ? { accion: "correr", linea: d.linea, tareas: d.tareas as string[] } : null;
    }
  }
  if (typeof d.linea !== "string" || !ID_DE_LINEA.test(d.linea) || typeof d.tarea !== "string" || !ID_DE_TAREA.test(d.tarea)) return null;
  const escrito = (v: unknown) => (typeof v === "string" && v.trim() && v.length <= 4000 ? v.trim() : null);
  const base = { linea: d.linea, tarea: d.tarea };
  switch (d.accion) {
    case "responder": {
      const texto = escrito(d.texto);
      return texto ? { accion: "responder", ...base, texto } : null;
    }
    case "aprobar":
      return { accion: "aprobar", ...base };
    case "rechazar": {
      const motivo = escrito(d.motivo);
      return motivo ? { accion: "rechazar", ...base, motivo } : null;
    }
    case "modelo_spec":
    case "modelo_construccion":
      return d.modelo === null || esModeloDeRol(d.modelo) ? { accion: d.accion, ...base, modelo: d.modelo } : null;
    case "debio_esperar":
      return typeof d.marcar === "boolean" ? { accion: "debio_esperar", ...base, marcar: d.marcar } : null;
    case "descartar":
      return d.motivo === undefined || (typeof d.motivo === "string" && d.motivo.length <= 4000) ? { accion: "descartar", ...base, motivo: typeof d.motivo === "string" ? d.motivo.trim() : "" } : null;
    default:
      return null;
  }
}

export type HechoEnLaLinea = { hecho: true; nota: string } | { hecho: false; motivo: string; desconocida?: boolean };

/** La línea con ese id, o el error que se muestra. */
async function laLinea(id: string): Promise<Linea | { motivo: string }> {
  try {
    return lineaPorId(await lineasDeLaFabrica(), id);
  } catch (e) {
    return { motivo: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Correr la cola de una línea o detener su corrida. Corre una corrida a la vez en toda la planta:
 * con otra en marcha, se dice en cuál. Correr una línea que no es la activa la deja como activa.
 */
async function correrODetener(a: Extract<AccionDeLinea, { accion: "correr" | "detener" }>, linea: Linea, contexto: { origen?: string | null }): Promise<HechoEnLaLinea> {
  const c = await corridaActual();
  const enMarcha = c?.estado === "corriendo";
  const aqui = enMarcha && mismaRaiz(c.proyecto, linea.raiz);
  if (a.accion === "detener") {
    if (!aqui) return { hecho: false, motivo: `No hay ninguna corrida trabajando en ${linea.nombre}.` };
    const r = await hacerEnLaFabrica({ accion: "detener" }, contexto);
    return r.hecho ? { hecho: true, nota: "La corrida se detuvo. Lo que estaba a medias queda para retomarse." } : r;
  }
  if (enMarcha) {
    const otra = (await lineasDeLaFabrica()).find((l) => mismaRaiz(l.raiz, c.proyecto));
    return { hecho: false, motivo: aqui ? `Ya hay una corrida en ${linea.nombre}.` : `Hay una corrida en ${otra?.nombre ?? "otra línea"}: espera a que termine o detenla.` };
  }
  if ((await leerAjustes()).lineaActiva !== linea.id) {
    try {
      await elegirProyecto(linea.raiz);
    } catch (e) {
      return { hecho: false, motivo: e instanceof Error ? e.message : String(e) };
    }
  }
  const r = await hacerEnLaFabrica({ accion: "correr", tareas: a.tareas }, contexto);
  if (!r.hecho) return r;
  return { hecho: true, nota: r.nota ?? (a.tareas.length ? `La fábrica empezó con ${a.tareas.join(", ")}.` : `La fábrica empezó a correr la cola de ${linea.nombre}.`) };
}

export async function hacerEnLaLinea(a: AccionDeLinea, contexto: { origen?: string | null } = {}): Promise<HechoEnLaLinea> {
  const linea = await laLinea(a.linea);
  if ("motivo" in linea) return { hecho: false, motivo: linea.motivo, desconocida: true };

  if (a.accion === "correr" || a.accion === "detener") return correrODetener(a, linea, contexto);

  // Elegir el modelo de la spec o de la construcción no sigue con nada: queda escrito en la tarea, sea o no la activa.
  if (a.accion === "modelo_spec" || a.accion === "modelo_construccion") return elegirModeloDeTarea(a.accion, linea, a.tarea, a.modelo);

  // Su marca va a lo que aprende Jev, no a la tarea: no se cruza con una corrida, en ninguna línea.
  if (a.accion === "debio_esperar") {
    try {
      const r = await marcarDebioEsperar(a.tarea, a.marcar, linea.id);
      if (!r.cambio) return { hecho: true, nota: a.marcar ? `${a.tarea} ya estaba marcada.` : `${a.tarea} no estaba marcada.` };
      return { hecho: true, nota: a.marcar ? `Anotado: ${a.tarea} tenía que esperarte. Jev será más estricto para dejar entrar solas las que se le parecen.` : `Quitado: ${a.tarea} ya no cuenta como un error de Jev.` };
    } catch (e) {
      return { hecho: false, motivo: e instanceof Error ? e.message : String(e) };
    }
  }

  // En la activa, como desde la columna: con lo que sigue después.
  if ((await leerAjustes()).lineaActiva === linea.id) {
    const accion: Accion =
      a.accion === "responder" ? { accion: "responder", tarea: a.tarea, texto: a.texto, correr: false } : a.accion === "rechazar" ? { accion: "rechazar", tarea: a.tarea, motivo: a.motivo } : a.accion === "descartar" ? { accion: "descartar", tarea: a.tarea, motivo: a.motivo } : { accion: "aprobar", tarea: a.tarea };
    const r = await hacerEnLaFabrica(accion, contexto);
    if (!r.hecho) return r;
    return { hecho: true, nota: r.nota ?? (a.accion === "responder" ? `Quedó tu respuesta a ${a.tarea}.` : "Hecho.") };
  }

  // En otra línea, queda escrito en la suya.
  const sigue = `${a.tarea} sigue cuando corra ${linea.nombre}.`;
  try {
    switch (a.accion) {
      case "responder":
        await escribirRespuesta(a.tarea, a.texto, FIRMA, linea.id);
        return { hecho: true, nota: `Quedó tu respuesta. ${sigue}` };
      case "aprobar":
        await escribirVeredicto(a.tarea, "aprobada", "", FIRMA, linea.id);
        return { hecho: true, nota: `Quedó tu veredicto. ${sigue}` };
      case "rechazar":
        await escribirVeredicto(a.tarea, "rechazada", a.motivo, FIRMA, linea.id);
        return { hecho: true, nota: `Quedó tu rechazo. ${sigue}` };
      case "descartar": {
        // Una corrida en esa línea escribe en sus tareas: mientras corre, no se descarta.
        const c = await corridaActual();
        if (c?.estado === "corriendo" && mismaRaiz(c.proyecto, linea.raiz)) return { hecho: false, motivo: `Hay una corrida trabajando en ${linea.nombre}: detenla o espera a que termine para descartar.` };
        await descartarTarea(a.tarea, a.motivo, FIRMA, linea.id);
        return { hecho: true, nota: `${a.tarea} quedó descartada.` };
      }
    }
  } catch (e) {
    return { hecho: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Con qué modelo se escribe la spec de una tarea. Mientras una corrida trabaja en esa línea, no se
 * cambia: la corrida escribe en sus tareas, y una escritura pisaría la otra.
 */
async function elegirModeloDeTarea(cual: "modelo_spec" | "modelo_construccion", linea: Linea, tarea: string, modelo: ModeloDeRol | null): Promise<HechoEnLaLinea> {
  try {
    const c = await corridaActual();
    if (c?.estado === "corriendo" && mismaRaiz(c.proyecto, linea.raiz)) return { hecho: false, motivo: `Hay una corrida trabajando en ${linea.nombre}: espera a que termine para cambiar el modelo de ${tarea}.` };
    if (cual === "modelo_spec") {
      await fijarModeloDeSpecDeTarea(tarea, modelo, FIRMA, linea.id);
      return { hecho: true, nota: modelo === null ? `La spec de ${tarea} se escribe con el modelo de la línea.` : `La spec de ${tarea} se escribe con ${DICHO_DEL_MODELO[modelo]}.` };
    }
    await fijarModeloDeConstruccionDeTarea(tarea, modelo, FIRMA, linea.id);
    // Con su elección, Jev no lo abarata; sin ella, vuelve a poder hacerlo.
    return { hecho: true, nota: modelo === null ? `${tarea} se construye con el modelo de la línea.` : `${tarea} se construye con ${DICHO_DEL_MODELO[modelo]}, también si vuelve a construcción. Jev no lo cambia.` };
  } catch (e) {
    return { hecho: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

export type DetalleDeTarea = { linea: string; tarea: string; secciones: SeccionesDeTarea | null; historial: HistorialDeTarea };

/** Lo que dice una tarea de una línea y su camino por la fábrica. Solo lee. `null` si la línea no existe. */
export async function detalleDeTarea(lineaId: string, tarea: string): Promise<DetalleDeTarea | null> {
  if (!ID_DE_TAREA.test(tarea)) return null;
  const linea = await laLinea(lineaId);
  if ("motivo" in linea) return null;
  const [secciones, historial] = await Promise.all([seccionesDeLaTarea(tarea, linea.id), historialDeLaTarea(linea.raiz, tarea)]);
  return { linea: linea.id, tarea, secciones, historial };
}

/** Lo que cambió una tarea de una línea, para mirarlo antes del veredicto. `null` si la línea no existe. */
export async function cambiosEnLaLinea(lineaId: string, tarea: string): Promise<CambiosDeTarea | null> {
  if (!ID_DE_TAREA.test(tarea)) return null;
  const linea = await laLinea(lineaId);
  if ("motivo" in linea) return null;
  return cambiosDeLaTarea(tarea, linea.id);
}

// ---- Los ajustes de una línea -------------------------------------------------------------------

/** Los modelos que él elige por línea: el campo que llega del navegador y el rol que escribe. */
const MODELOS_DE_LINEA = { modeloSpec: "spec", modeloConstruccion: "construccion", modeloAprobacion: "aprobacion" } as const;
type CampoDeModelo = keyof typeof MODELOS_DE_LINEA;

/**
 * Lo que él cambia de una línea desde su pantalla: con qué modelo se escribe su spec, con cuál se
 * construye o con cuál se aprueba. Uno por vez.
 */
export type AjusteDeLinea = { linea: string; campo: CampoDeModelo; modelo: ModeloDeRol };

/** Lo que llegó del navegador, revisado. Lo que no tenga la forma, `null`. Es lógica pura. */
export function ajusteDeLinea(dato: unknown): AjusteDeLinea | null {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  if (typeof d.linea !== "string" || !ID_DE_LINEA.test(d.linea)) return null;
  const campos = (Object.keys(MODELOS_DE_LINEA) as CampoDeModelo[]).filter((c) => Object.hasOwn(d, c));
  // Uno por vez: así cada cambio dice qué cambió.
  if (campos.length !== 1) return null;
  const campo = campos[0]!;
  const modelo = d[campo];
  return esModeloDeRol(modelo) ? { linea: d.linea, campo, modelo } : null;
}

const DICHO_DEL_MODELO: Record<ModeloDeRol, string> = { inherit: "el modelo de la corrida", haiku: "Haiku", sonnet: "Sonnet", opus: "Opus", fable: "Fable" };

/**
 * Cambia el ajuste en el factory/config.md de esa línea, sea o no la activa. Una corrida que ya
 * corre lo toma cuando vuelve a leer el estado (`mcp__fabrica__estado`), antes de lanzar otra spec
 * o, en la construcción, cuando decide con qué modelo construir (`decidir(T, "construccion")`).
 */
export async function ajustarLinea(a: AjusteDeLinea): Promise<HechoEnLaLinea> {
  const linea = await laLinea(a.linea);
  if ("motivo" in linea) return { hecho: false, motivo: linea.motivo, desconocida: true };
  try {
    await fijarModeloDeRol(MODELOS_DE_LINEA[a.campo], a.modelo, linea.id);
    const dicho = DICHO_DEL_MODELO[a.modelo];
    if (a.campo === "modeloSpec") return { hecho: true, nota: `La spec de ${linea.nombre} se escribe con ${dicho} desde la próxima tarea.` };
    if (a.campo === "modeloAprobacion") return { hecho: true, nota: `${linea.nombre} aprueba con ${dicho} desde la próxima tarea.` };
    // Jev puede abaratar las tareas simples a Sonnet: se dice, para que no sorprenda.
    const abarata = a.modelo === "haiku" || a.modelo === "sonnet" ? "" : " En las tareas simples, Jev puede usar Sonnet.";
    return { hecho: true, nota: `${linea.nombre} construye con ${dicho} desde la próxima tarea.${abarata}` };
  } catch (e) {
    return { hecho: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
