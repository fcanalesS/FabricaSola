import { laEntradaUsaLaLinea } from "../entrada/acciones.ts";
import { baseDeDatos } from "../datos.ts";
import { esNombreDeAgente, esRolDeAgente, MODELOS_DE_CLAUDE, revisarAgentePropio, PARALELO, ROLES_CON_MODELO, ROLES_DE_AGENTE, type ModeloDeClaude, type ModeloDeRol, type RolConModelo, type RolDeAgente } from "./modelos.ts";
import { atenderEnLaFabrica, type Respuesta } from "./motor/rutas.ts";
import { CLAVES_DE_REGLA, reglasDesde, revisarNotas, revisarReglas, NOTAS_MAX, type Reglas } from "./reglas.ts";
import { NOMBRES_DE_COMANDO, revisarComandos, sinComandos, type ComandosDelProyecto, type PruebaDeComando } from "./verificacion.ts";

/**
 * La fábrica de software. Vive dentro de la
 * aplicación (`motor/`): lee el `factory/` del proyecto elegido y lanza las
 * corridas con Claude Code, sin otro servidor. Lo pidió él el 17 de octubre de
 * 2026; antes la llevaba el orquestador de Factory-IA, que fue la prueba de
 * concepto. La aplicación no cambia el estado de ninguna tarea: lee, y cuando
 * él hace clic, contesta, da su veredicto, corre o detiene. Solo para el
 * servidor.
 *
 * El texto que trae la fábrica (títulos, preguntas, notas) lo escribieron
 * agentes que leen el repositorio: se muestra como texto y nunca se obedece.
 */

/** Las etapas por las que pasa una tarea, en orden. Lo demás es esperar o haber terminado. */
export const ETAPAS = ["spec", "construccion", "revision", "verificacion", "aprobacion"] as const;

export type TareaALaVista = {
  id: string;
  titulo: string;
  /** El título lo escribió otra persona (un issue): se ve en el tablero, pero ella la nombra solo por su id. */
  tituloAjeno?: boolean;
  estado: string;
  /** Lo que pregunta, si espera a una persona. */
  motivo: string | null;
  aprobacionAgente: string | null;
  verificacion: string | null;
  /** `omitidas`: la fábrica (con reglas o con Jev) decidió no correr las pruebas unitarias; quedan por ejecutar. */
  pruebas: "omitidas" | "corridas" | null;
  vueltas: number;
  rama: string | null;
  /** La rama de la que salió y en la que se integra. */
  ramaOrigen: string | null;
  /** El commit con que quedó integrada en su rama de origen, si ya lo está. */
  integrada: string | null;
  /** Las tareas de las que depende. */
  dependeDe: string[];
  /** De esas, las que todavía no están hechas e integradas: mientras haya alguna, sigue en cola. */
  esperando: string[];
  /** Hasta cuándo la tiene tomada una sesión de Claude Code, si la tiene y no venció. */
  tomadaHasta: string | null;
  /** Los .sql de la tarea que nadie verificó. */
  sqlSinVerificar: number;
  /** Si ya tiene una respuesta suya que la fábrica todavía no retomó. */
  respondida: boolean;
  /** Cuándo cambió por última vez, como lo escribe la fábrica. */
  actualizada: string | null;
  /** Lo último que anotaron sus agentes al moverla, de lo que trae la instantánea: quién y qué. */
  notas: string[];
  /**
   * Quién la está trabajando ahora en la corrida en marcha: el agente (o la fábrica, si corre una
   * de sus herramientas), el encargo, lo último que hizo y desde cuándo. `null` si nadie.
   */
  trabajo: { agente: string; que: string; ultimo: string | null; desde: string | null; minutos: number | null } | null;
  /** Lo que lleva costado en todas sus corridas, aproximado y según Claude Code. `null` si no se sabe. */
  costoUsd: number | null;
};

/** `pasos`: lo último que fue haciendo, con su hora tal como la escribe la fábrica. */
export type CorridaALaVista = { id: string | null; estado: string; tareas: string[]; costoUsd: number | null; ultima: string | null; pasos: { cuando: string | null; texto: string }[] };

/**
 * El informe de una corrida que terminó, como lo arma el motor con su resultado y su
 * telemetría. Los costos son la estimación de Claude Code, no la factura.
 */
export type InformeALaVista = {
  id: string;
  estado: string;
  inicio: string;
  fin: string | null;
  duracionMs: number | null;
  costoUsd: number | null;
  turnos: number | null;
  llamadas: number | null;
  /** Lo que movió cada tarea mientras corría: de dónde partió y dónde quedó. */
  tareas: { id: string; de: string | null; a: string }[];
  lineas: { agregadas: number; quitadas: number } | null;
  commits: number | null;
  /** Lo que salió mal, en frases que escribió el motor. */
  problemas: string[];
  conTelemetria: boolean;
  /** Lo que costó cada tarea, aproximado (de la telemetría y la actividad), de la más cara a la más barata. */
  porTarea: { id: string; usd: number }[];
};

export type FabricaALaVista = {
  /** El nombre de la carpeta del proyecto. En la demo, «demo»: su carpeta es una copia oculta, «.demo». */
  proyecto: string;
  esDemo: boolean;
  /** Las que esperan una respuesta suya y todavía no la tienen. */
  esperan: TareaALaVista[];
  /** Las que esperan su veredicto, si el proyecto lo pide. */
  aprobar: TareaALaVista[];
  /** Las que están en alguna etapa o en la cola. */
  enCurso: TareaALaVista[];
  cola: TareaALaVista[];
  hechas: TareaALaVista[];
  corrida: CorridaALaVista | null;
  /** Si hay algo que mirar: una corrida en marcha, o algo que lo espera. */
  activa: boolean;
  /** El informe de la última corrida, si ya terminó. */
  informe: InformeALaVista | null;
  /** La última vez que corrió un proceso de la línea, si ya terminó. Sin lo que dijeron sus comandos. */
  proceso: ProcesoCorridoALaVista | null;
  /** La rama base de factory/config.md: solo el respaldo de las tareas que no tienen rama de origen. */
  ramaBase: string | null;
  /** La rama en que está el proyecto ahora. Sin rama de trabajo, de ahí salen las tareas nuevas y ahí se integran. */
  ramaActual: string | null;
  /** La rama de trabajo de config.md: de ahí salen las tareas y ahí se integran. `null`: la de la raíz. */
  ramaTrabajo: string | null;
  /** Lo que costaron hoy las corridas de este proyecto, según Claude Code. `null` si no se supo. */
  hoyUsd: number | null;
  /** Si config.md no trae build, test ni lint: entonces no se corre. */
  sinComandos: boolean;
  /** Los hallazgos MENORES de las tareas terminadas, para la vista «Deuda». */
  deuda: DeudaALaVista[];
};

/** Un hallazgo MENOR de una tarea terminada. Lo escribió un agente: va como texto. */
export type DeudaALaVista = { id: string; tarea: string; tituloDeLaTarea: string; revisor: string | null; donde: string | null; texto: string; convertidoEn: string | null };

const ID_DE_CORRIDA = /^\d{8}T\d{6}$/;
const texto = (v: unknown, largo: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, largo) : "");
const idValido = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z]{1,8}-\d{1,6}$/.test(v);

/** Las notas que dejaron los agentes en cada tarea, las últimas tres. «fabrica:revisor» queda en «revisor». */
function notasPorTarea(eventos: unknown): Map<string, string[]> {
  const porTarea = new Map<string, string[]>();
  for (const e of Array.isArray(eventos) ? (eventos as Record<string, unknown>[]) : []) {
    const nota = texto(e?.nota, 300);
    if (!idValido(e?.tarea) || !nota) continue;
    const quien = texto(e.agente, 60).split(":").at(-1) || "la fábrica";
    porTarea.set(e.tarea, [...(porTarea.get(e.tarea) ?? []), `${quien}: ${nota}`].slice(-3));
  }
  return porTarea;
}

function tarea(dato: unknown): Omit<TareaALaVista, "notas" | "esperando" | "trabajo" | "costoUsd"> | null {
  const t = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  if (!idValido(t.id)) return null;
  const respuesta = t.respuesta && typeof t.respuesta === "object" ? (t.respuesta as Record<string, unknown>) : null;
  return {
    id: t.id,
    titulo: texto(t.titulo, 160) || t.id,
    ...(t.tituloAjeno === true ? { tituloAjeno: true } : {}),
    estado: texto(t.estado, 30),
    motivo: texto(t.motivo, 1200) || null,
    aprobacionAgente: texto(t.aprobacionAgente, 20) || null,
    verificacion: texto(t.verificacion, 20) || null,
    pruebas: t.pruebas === "omitidas" || t.pruebas === "corridas" ? t.pruebas : null,
    vueltas: typeof t.vueltas === "number" && Number.isFinite(t.vueltas) ? t.vueltas : 0,
    rama: texto(t.rama, 120) || null,
    ramaOrigen: texto(t.ramaOrigen, 120) || null,
    integrada: texto(t.integrada, 64) || null,
    dependeDe: (Array.isArray(t.dependeDe) ? t.dependeDe : []).filter(idValido).slice(0, 20),
    tomadaHasta: typeof t.tomadaPor === "string" && t.tomadaPor && typeof t.tomadaHasta === "string" && Date.parse(t.tomadaHasta) > Date.now() ? t.tomadaHasta : null,
    sqlSinVerificar: typeof t.sqlSinVerificar === "number" && Number.isFinite(t.sqlSinVerificar) ? t.sqlSinVerificar : 0,
    respondida: Boolean(respuesta && typeof respuesta.texto === "string"),
    actualizada: texto(t.actualizada, 40) || null,
  };
}

/**
 * Lo que trabaja cada tarea en la corrida en marcha, de su actividad: el último encargo de cada
 * una, si no terminó. Uno lanzado en segundo plano cuenta mientras no haya otro más nuevo. Lo
 * escribieron los agentes: va como texto. Es lógica pura.
 */
function trabajosEnCurso(corrida: unknown): Map<string, NonNullable<TareaALaVista["trabajo"]>> {
  const c = ((corrida && typeof corrida === "object" ? (corrida as Record<string, unknown>).corrida : null) ?? null) as Record<string, unknown> | null;
  const out = new Map<string, NonNullable<TareaALaVista["trabajo"]>>();
  if (!c || c.estado !== "corriendo" || !Array.isArray(c.actividad)) return out;
  const ultima = new Map<string, Record<string, unknown>>();
  for (const a of c.actividad as Record<string, unknown>[]) if (idValido(a?.tarea)) ultima.set(a.tarea, a);
  for (const [id, a] of ultima) {
    if (typeof a.hasta === "string" && a.hasta) continue;
    const desde = texto(a.desde, 40) || null;
    const ms = desde ? Date.now() - Date.parse(desde) : NaN;
    out.set(id, { agente: texto(a.agente, 80) || "un agente", que: texto(a.que, 160), ultimo: texto(a.ultimo, 160) || null, desde, minutos: Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60_000)) : null });
  }
  return out;
}

/**
 * Lo que se le muestra de la fábrica, sacado de lo que devuelve el
 * motor. Lo que no tenga la forma esperada se deja fuera. Es lógica pura.
 */
export function resumirLaFabrica(instantanea: unknown, corrida: unknown): FabricaALaVista | null {
  const f = (instantanea && typeof instantanea === "object" ? instantanea : null) as Record<string, unknown> | null;
  if (!f || !Array.isArray(f.tareas)) return null;
  const notas = notasPorTarea(f.eventos);
  const config = (f.config && typeof f.config === "object" ? f.config : {}) as Record<string, unknown>;
  const leidas = f.tareas.map(tarea).filter((t) => t !== null);
  // Una dependencia está lista hecha e integrada; con integración manual, basta con hecha.
  const lista = (id: string) => leidas.some((x) => x.id === id && x.estado === "hecho" && (x.integrada || config.integracion === "manual"));
  const trabajos = trabajosEnCurso(corrida);
  const costos = (f.costos && typeof f.costos === "object" ? f.costos : {}) as Record<string, unknown>;
  const tareas = leidas.map(
    (t): TareaALaVista => ({ ...t, notas: notas.get(t.id) ?? [], esperando: t.estado === "pendiente" ? t.dependeDe.filter((d) => !lista(d)) : [], trabajo: trabajos.get(t.id) ?? null, costoUsd: cifra(costos[t.id]) }),
  );
  // Si el proyecto deja la aprobación solo al agente, un veredicto suyo no cuenta: no se le pide.
  const pideVeredicto = config.aprobacion === "externa" || config.aprobacion === "ambas";
  const c = ((corrida && typeof corrida === "object" ? (corrida as Record<string, unknown>).corrida : null) ?? null) as Record<string, unknown> | null;
  const lineas = c && Array.isArray(c.lineas) ? (c.lineas as Record<string, unknown>[]) : [];
  const resumenDeLaCorrida: CorridaALaVista | null = c
    ? {
        id: typeof c.id === "string" && ID_DE_CORRIDA.test(c.id) ? c.id : null,
        estado: texto(c.estado, 20),
        tareas: Array.isArray(c.tareas) ? c.tareas.filter(idValido) : [],
        costoUsd: typeof c.costoUsd === "number" && Number.isFinite(c.costoUsd) ? c.costoUsd : null,
        ultima: texto([...lineas].reverse().find((l) => l?.tipo === "agente" || l?.tipo === "info")?.texto, 200) || null,
        pasos: lineas
          .filter((l) => l?.tipo === "agente" || l?.tipo === "info" || l?.tipo === "error")
          .slice(-4)
          .map((l) => ({ cuando: texto(l.ts, 40) || null, texto: texto(l.texto, 200) }))
          .filter((l) => l.texto),
      }
    : null;
  const raiz = texto(f.raiz, 400);
  const esperan = tareas.filter((t) => t.estado === "necesita-humano" && !t.respondida);
  const aprobar = pideVeredicto ? tareas.filter((t) => t.estado === "aprobacion") : [];
  const corre = resumenDeLaCorrida?.estado === "corriendo";
  return {
    proyecto: f.esDemo === true ? "demo" : (raiz.split(/[\\/]/).filter(Boolean).at(-1) ?? ""),
    esDemo: f.esDemo === true,
    esperan,
    aprobar,
    enCurso: tareas.filter((t) => (ETAPAS as readonly string[]).includes(t.estado) && !aprobar.includes(t)),
    cola: tareas.filter((t) => t.estado === "pendiente" || (t.estado === "necesita-humano" && t.respondida)),
    hechas: tareas.filter((t) => t.estado === "hecho"),
    corrida: resumenDeLaCorrida,
    activa: corre || esperan.length > 0 || aprobar.length > 0,
    informe: null,
    proceso: null,
    ramaBase: texto(config.ramaBase, 80) || null,
    ramaTrabajo: texto(config.ramaTrabajo, 200) || null,
    ramaActual: texto(f.ramaActual, 200) || null,
    hoyUsd: null,
    sinComandos: f.config !== null && typeof f.config === "object" && sinComandos(config as Record<string, string>),
    deuda: (Array.isArray(f.deuda) ? (f.deuda as Record<string, unknown>[]) : []).flatMap((h) =>
      typeof h?.id === "string" && /^[0-9a-f]{16}$/.test(h.id) && idValido(h.tarea)
        ? [{ id: h.id, tarea: h.tarea, tituloDeLaTarea: texto(h.tituloDeLaTarea, 160), revisor: texto(h.revisor, 40) || null, donde: texto(h.donde, 200) || null, texto: texto(h.texto, 1200), convertidoEn: idValido(h.convertidoEn) ? h.convertidoEn : null }]
        : [],
    ).slice(0, 200),
  };
}

const cifra = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Lo que se muestra de un informe, sacado de lo que devuelve `GET /api/informes?id=`. Los
 * problemas los escribió el motor, con cifras y nombres de herramientas: van como texto. Es
 * lógica pura.
 */
export function resumirInforme(dato: unknown): InformeALaVista | null {
  const i = ((dato && typeof dato === "object" ? (dato as Record<string, unknown>).informe : null) ?? null) as Record<string, unknown> | null;
  if (!i || typeof i.id !== "string" || !ID_DE_CORRIDA.test(i.id)) return null;
  const r = (i.resultado && typeof i.resultado === "object" ? i.resultado : null) as Record<string, unknown> | null;
  const t = (i.telemetria && typeof i.telemetria === "object" ? i.telemetria : null) as Record<string, unknown> | null;
  const lineas = t?.lineas && typeof t.lineas === "object" ? (t.lineas as Record<string, unknown>) : null;
  const inicio = texto(i.inicio, 40);
  const fin = texto(i.fin, 40) || null;
  const tareas = (Array.isArray(i.tareas) ? (i.tareas as Record<string, unknown>[]) : []).flatMap((m) => {
    const pasos = Array.isArray(m?.pasos) ? (m.pasos as Record<string, unknown>[]) : [];
    return idValido(m?.tarea) && pasos.length ? [{ id: m.tarea, de: texto(pasos[0]?.de, 30) || null, a: texto(pasos.at(-1)?.a, 30) }] : [];
  });
  return {
    id: i.id,
    estado: texto(i.estado, 20),
    inicio,
    fin,
    // Del inicio al fin de la corrida: la duración del resultado de Claude Code es solo la de su último tramo.
    duracionMs: fin && inicio ? Date.parse(fin) - Date.parse(inicio) || null : r ? cifra(r.duracionMs) : null,
    costoUsd: cifra(r?.costoUsd) ?? cifra(t?.costoUsd),
    turnos: cifra(r?.turnos),
    llamadas: cifra(t?.llamadas),
    tareas,
    lineas: lineas ? { agregadas: cifra(lineas.agregadas) ?? 0, quitadas: cifra(lineas.quitadas) ?? 0 } : null,
    commits: cifra(t?.commits),
    problemas: (Array.isArray(i.problemas) ? i.problemas : []).map((p) => texto(p, 300)).filter(Boolean).slice(0, 12),
    conTelemetria: t !== null,
    porTarea: (() => {
      const p = (i.porTarea && typeof i.porTarea === "object" ? i.porTarea : {}) as Record<string, unknown>;
      return (Array.isArray(p.tareas) ? (p.tareas as Record<string, unknown>[]) : []).flatMap((x) => (idValido(x?.tarea) && cifra(x.usd) !== null ? [{ id: x.tarea, usd: cifra(x.usd)! }] : [])).slice(0, 10);
    })(),
  };
}

/**
 * Los informes ya leídos: el de una corrida terminada solo cambia si llega telemetría tarde, así
 * que se vuelve a pedir cada tanto, no en cada vistazo del panel.
 */
const informes = new Map<string, { informe: InformeALaVista; leido: number }>();
const RELEER_INFORME_MS = 30_000;

async function informeDeLaCorrida(id: string): Promise<InformeALaVista | null> {
  const guardado = informes.get(id);
  if (guardado && Date.now() - guardado.leido < RELEER_INFORME_MS) return guardado.informe;
  const r = await alOrquestador(`/api/informes?id=${id}`);
  const informe = r?.estado === 200 ? resumirInforme(r.datos) : null;
  if (informe) informes.set(id, { informe, leido: Date.now() });
  return informe ?? guardado?.informe ?? null;
}

/** Quien atiende a la fábrica: el motor, dentro de la aplicación. `null`: no contestó. */
export type Transporte = (ruta: string, cuerpo: unknown, metodo: "GET" | "POST" | "PUT", contexto: { origen?: string | null }) => Promise<Respuesta | null>;
let transporte: Transporte = atenderEnLaFabrica;

/** Solo para las pruebas de las rutas: una fábrica de mentira en vez del motor. `null` vuelve al motor. */
export function usarFabricaDePrueba(otro: Transporte | null): void {
  transporte = otro ?? atenderEnLaFabrica;
}

async function alOrquestador(ruta: string, cuerpo?: unknown, opciones: { metodo?: "POST" | "PUT"; origen?: string | null } = {}): Promise<Respuesta | null> {
  try {
    return await transporte(ruta, cuerpo, cuerpo === undefined ? "GET" : (opciones.metodo ?? "POST"), { origen: opciones.origen });
  } catch {
    return null;
  }
}

/** El agente propio de una etapa, para editarlo. `null` si todavía no lo hay; `motivo` si la fábrica no pudo leerlo. */
export async function leerAgentePropio(rol: RolDeAgente): Promise<{ agente: { nombre: string; descripcion: string; instrucciones: string } | null } | { motivo: string }> {
  const r = await alOrquestador(`/api/agentes/propio?rol=${encodeURIComponent(rol)}`);
  if (r?.estado !== 200) return { motivo: r === null ? "La fábrica no responde." : texto((r.datos as { error?: unknown } | null)?.error, 300) || `La fábrica contestó ${r.estado}.` };
  const a = (r.datos as { agente?: Record<string, unknown> | null } | null)?.agente;
  if (!a || typeof a !== "object") return { agente: null };
  return { agente: { nombre: esNombreDeAgente(a.nombre) ? a.nombre : "", descripcion: typeof a.descripcion === "string" ? a.descripcion : "", instrucciones: typeof a.instrucciones === "string" ? a.instrucciones : "" } };
}

/** Lo que hay en la fábrica ahora. `sin_proyecto` si todavía no se eligió uno; `no_responde` si no se pudo leer. */
export async function leerLaFabrica(): Promise<{ fabrica: FabricaALaVista } | { motivo: "no_responde" | "sin_proyecto" }> {
  const [instantanea, corrida, hoy] = await Promise.all([alOrquestador("/api/fabrica"), alOrquestador("/api/corridas"), alOrquestador("/api/corridas/hoy")]);
  if (instantanea?.estado === 409) return { motivo: "sin_proyecto" };
  const fabrica = instantanea && instantanea.estado === 200 ? resumirLaFabrica(instantanea.datos, corrida?.datos) : null;
  if (!fabrica) return { motivo: "no_responde" };
  fabrica.hoyUsd = hoy?.estado === 200 ? cifra((hoy.datos as { usd?: unknown } | null)?.usd) : null;
  // El informe es de una corrida que ya terminó: mientras corre, todavía no hay.
  if (fabrica.corrida?.id && fabrica.corrida.estado !== "corriendo") fabrica.informe = await informeDeLaCorrida(fabrica.corrida.id);
  const proceso = await alOrquestador("/api/procesos/ultima");
  fabrica.proceso = proceso?.estado === 200 ? resumirProceso((proceso.datos as { ejecucion?: unknown } | null)?.ejecucion) : null;
  return { fabrica };
}

/**
 * La última vez que corrió un proceso, ya terminada, como la ve ella: qué proceso, cómo terminó y
 * cada paso con lo que dijo el código de él. Lo que dijeron los comandos no entra: puede traer
 * cualquier cosa del entorno.
 */
export type ProcesoCorridoALaVista = {
  id: string;
  proceso: string;
  nombre: string;
  /** `esperando`: llegó a un paso aprobacion y espera su clic; `fin` es desde cuándo. */
  estado: "esperando" | "termino" | "llego" | "fallo" | "detenida";
  fin: string;
  duracionMs: number | null;
  pasos: { linea: number; tipo: string; texto: string; estado: string; nota: string }[];
  paradoEn: { linea: number; tipo: string } | null;
  motivo: string | null;
  /** Cómo arrancó: con su clic, solo al integrar una tarea, o solo cada día o cada semana. */
  arranque: "clic" | "al-integrar" | "periodico";
};

const ESTADOS_DE_PROCESO = new Set(["esperando", "termino", "llego", "fallo", "detenida"]);

export function resumirProceso(dato: unknown): ProcesoCorridoALaVista | null {
  const e = (dato && typeof dato === "object" ? dato : null) as Record<string, unknown> | null;
  if (!e || typeof e.id !== "string" || typeof e.estado !== "string" || !ESTADOS_DE_PROCESO.has(e.estado)) return null;
  // Mientras espera su clic no tiene fin: cuenta desde cuándo espera.
  const fin = e.estado === "esperando" ? (typeof e.esperaDesde === "string" ? e.esperaDesde : e.inicio) : e.fin;
  if (typeof fin !== "string") return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? Math.min(v, 100_000) : 0);
  const p = (e.paradoEn && typeof e.paradoEn === "object" ? e.paradoEn : null) as Record<string, unknown> | null;
  const inicio = typeof e.inicio === "string" ? Date.parse(e.inicio) : NaN;
  return {
    id: texto(e.id, 80),
    proceso: texto(e.proceso, 60),
    nombre: texto(e.nombre, 200),
    estado: e.estado as ProcesoCorridoALaVista["estado"],
    fin: texto(fin, 40),
    duracionMs: Number.isFinite(inicio) && Number.isFinite(Date.parse(fin)) ? Math.max(0, Date.parse(fin) - inicio) : null,
    pasos: (Array.isArray(e.pasos) ? (e.pasos as Record<string, unknown>[]) : [])
      .filter((x) => x && typeof x === "object")
      .slice(0, 100)
      .map((x) => ({ linea: n(x.linea), tipo: texto(x.tipo, 30), texto: texto(x.texto, 300), estado: texto(x.estado, 30), nota: texto(x.nota, 300) })),
    paradoEn: p ? { linea: n(p.linea), tipo: texto(p.tipo, 30) } : null,
    motivo: typeof e.motivo === "string" ? texto(e.motivo, 400) : null,
    arranque: e.origen === "al-integrar" ? "al-integrar" : e.origen === "periodico" ? "periodico" : "clic",
  };
}

/** Lo que cambió una tarea, para mirarlo antes del veredicto; o por qué no hay nada que mirar. */
export type CambiosALaVista =
  | { base: string; archivos: { ruta: string; agregadas: number | null; quitadas: number | null; nuevo: boolean }[]; diff: string; cortado: boolean }
  | { motivo: string };

/** Lo que devuelve `GET /api/cambios`, revisado. Lo que no tenga la forma esperada, `null`. Es lógica pura. */
export function resumirCambios(dato: unknown): CambiosALaVista | null {
  const d = (dato && typeof dato === "object" ? dato : null) as Record<string, unknown> | null;
  if (!d) return null;
  if (typeof d.motivo === "string") return { motivo: texto(d.motivo, 400) };
  if (typeof d.diff !== "string" || !Array.isArray(d.archivos)) return null;
  const cifraONada = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    base: texto(d.base, 200),
    archivos: (d.archivos as Record<string, unknown>[])
      .filter((a) => typeof a?.ruta === "string" && a.ruta)
      .slice(0, 500)
      .map((a) => ({ ruta: String(a.ruta).slice(0, 400), agregadas: cifraONada(a.agregadas), quitadas: cifraONada(a.quitadas), nuevo: a.nuevo === true })),
    diff: d.diff,
    cortado: d.cortado === true,
  };
}

/** Lo que cambió una tarea. `no_responde` si la fábrica no contestó. */
export async function leerCambiosDeLaTarea(tarea: string): Promise<CambiosALaVista | { motivo: "no_responde" }> {
  if (!idValido(tarea)) return { motivo: "No hay una tarea con ese id." };
  const r = await alOrquestador(`/api/cambios?tarea=${tarea}`);
  return (r?.estado === 200 ? resumirCambios(r.datos) : null) ?? { motivo: "no_responde" };
}

/** El camino de una tarea por la fábrica. Las notas las escribieron los agentes: van como texto. */
export type HistorialALaVista = {
  pasos: { ts: string; de: string | null; a: string; agente: string | null; nota: string | null }[];
  corridas: { id: string; inicio: string; usd: number }[];
  /** Lo que dice la tarea. Lo escribieron él y los agentes: va como texto. `null` si no se pudo leer. */
  secciones: { pedido: string; spec: string; hallazgos: string; respuesta: string } | null;
};

/** Lo que devuelve `GET /api/historial`, revisado. Es lógica pura. */
export function resumirHistorial(dato: unknown): HistorialALaVista | null {
  const d = (dato && typeof dato === "object" ? dato : null) as Record<string, unknown> | null;
  if (!d || !Array.isArray(d.pasos)) return null;
  return {
    pasos: (d.pasos as Record<string, unknown>[])
      .filter((x) => typeof x?.ts === "string" && typeof x.a === "string")
      .slice(-200)
      .map((x) => ({ ts: texto(x.ts, 40), de: texto(x.de, 30) || null, a: texto(x.a, 30), agente: texto(x.agente, 80) || null, nota: texto(x.nota, 600) || null })),
    corridas: (Array.isArray(d.corridas) ? (d.corridas as Record<string, unknown>[]) : [])
      .filter((c) => typeof c?.id === "string" && ID_DE_CORRIDA.test(c.id) && typeof c.usd === "number" && Number.isFinite(c.usd))
      .slice(0, 100)
      .map((c) => ({ id: String(c.id), inicio: texto(c.inicio, 40), usd: Number(c.usd) })),
    secciones: seccionesDe(d.secciones),
  };
}

/** Las secciones de una tarea, tal cual (con sus saltos de línea), con un tope. Es lógica pura. */
function seccionesDe(v: unknown): HistorialALaVista["secciones"] {
  const s = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (!s) return null;
  const cuerpo = (x: unknown) => (typeof x === "string" ? x.slice(0, 30_000) : "");
  return { pedido: cuerpo(s.pedido), spec: cuerpo(s.spec), hallazgos: cuerpo(s.hallazgos), respuesta: cuerpo(s.respuesta) };
}

/** El historial de una tarea. `no_responde` si la fábrica no contestó. */
export async function leerHistorialDeLaTarea(tarea: string): Promise<HistorialALaVista | { motivo: string }> {
  if (!idValido(tarea)) return { motivo: "No hay una tarea con ese id." };
  const r = await alOrquestador(`/api/historial?tarea=${tarea}`);
  return (r?.estado === 200 ? resumirHistorial(r.datos) : null) ?? { motivo: "no_responde" };
}

/** Cuánto rinde cada agente en el proyecto elegido, de sus corridas. */
export type RendimientoALaVista = {
  corridas: number;
  agentes: { agente: string; encargos: number; tareas: number; minutos: number; usd: number | null; devolvio: number; leDevolvieron: number; etapas: Record<string, number> }[];
  /** Por habilidad: en cuántas tareas la recibió un agente, y cuántas de esas volvieron a construcción. */
  habilidades: { nombre: string; tareas: number; volvieron: number; etapas: string[] }[];
};

/** Lo que devuelve `GET /api/rendimiento`, revisado. Es lógica pura. */
export function resumirRendimiento(dato: unknown): RendimientoALaVista | null {
  const d = (dato && typeof dato === "object" ? dato : null) as Record<string, unknown> | null;
  if (!d || !Array.isArray(d.agentes)) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    corridas: n(d.corridas),
    agentes: (d.agentes as Record<string, unknown>[])
      .filter((a) => typeof a?.agente === "string" && a.agente)
      .slice(0, 100)
      .map((a) => ({
        agente: texto(a.agente, 80),
        encargos: n(a.encargos),
        tareas: n(a.tareas),
        minutos: n(a.minutos),
        usd: typeof a.usd === "number" && Number.isFinite(a.usd) ? a.usd : null,
        devolvio: n(a.devolvio),
        leDevolvieron: n(a.leDevolvieron),
        etapas: Object.fromEntries(Object.entries(a.etapas && typeof a.etapas === "object" ? (a.etapas as Record<string, unknown>) : {}).filter(([k]) => (ETAPAS as readonly string[]).includes(k)).map(([k, v]) => [k, n(v)])),
      })),
    habilidades: (Array.isArray(d.habilidades) ? (d.habilidades as Record<string, unknown>[]) : [])
      .filter((h) => typeof h?.nombre === "string" && /^[a-z0-9][a-z0-9:-]{0,80}$/.test(h.nombre))
      .slice(0, 100)
      .map((h) => ({
        nombre: String(h.nombre),
        tareas: n(h.tareas),
        volvieron: n(h.volvieron),
        etapas: (Array.isArray(h.etapas) ? h.etapas : []).filter((e): e is string => typeof e === "string" && ["spec", "construccion", "revision", "aprobacion"].includes(e)),
      })),
  };
}

/** Cuánto rinde cada agente. `no_responde` si la fábrica no contestó. */
export async function leerRendimiento(): Promise<RendimientoALaVista | { motivo: "no_responde" }> {
  const r = await alOrquestador("/api/rendimiento");
  return (r?.estado === 200 ? resumirRendimiento(r.datos) : null) ?? { motivo: "no_responde" };
}

// ---- Las sesiones de Claude Code del proyecto ------------------------------------------------------

export type SesionALaVista = { id: string; titulo: string; ultima: string; activa: boolean; deLaFabrica: boolean; costoUsd: number | null };
export type PasoALaVista = { ts: string | null; quien: "el" | "claude" | "herramienta"; texto: string };
export type RetomaALaVista = { sesion: string; copia: string | null; estado: string; inicio: string; lineas: { tipo: string; texto: string }[]; resultado: string | null; costoUsd: number | null };

const ID_DE_SESION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const esIdDeSesion = (v: unknown): v is string => typeof v === "string" && ID_DE_SESION.test(v);

function sesionDe(v: unknown): SesionALaVista | null {
  const s = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (!s || !esIdDeSesion(s.id)) return null;
  return { id: s.id, titulo: texto(s.titulo, 160) || "Sin título", ultima: texto(s.ultima, 40), activa: s.activa === true, deLaFabrica: s.deLaFabrica === true, costoUsd: cifra(s.costoUsd) };
}

function retomaDe(v: unknown): RetomaALaVista | null {
  const r = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (!r || !esIdDeSesion(r.sesion)) return null;
  return {
    sesion: r.sesion,
    copia: esIdDeSesion(r.copia) ? r.copia : null,
    estado: texto(r.estado, 20),
    inicio: texto(r.inicio, 40),
    lineas: (Array.isArray(r.lineas) ? (r.lineas as Record<string, unknown>[]) : []).slice(-200).map((l) => ({ tipo: texto(l?.tipo, 20), texto: typeof l?.texto === "string" ? l.texto.slice(0, 2000) : "" })),
    resultado: typeof r.resultado === "string" ? r.resultado.slice(0, 8000) : null,
    costoUsd: cifra(r.costoUsd),
  };
}

/** Las sesiones del proyecto, a cuál está enganchada ella y la retoma de ahora. Es lógica pura. */
export function resumirSesiones(dato: unknown): { sesiones: SesionALaVista[]; enganchada: string | null; retoma: RetomaALaVista | null } | null {
  const d = (dato && typeof dato === "object" ? dato : null) as Record<string, unknown> | null;
  if (!d || !Array.isArray(d.sesiones)) return null;
  return { sesiones: d.sesiones.map(sesionDe).filter((s) => s !== null).slice(0, 50), enganchada: esIdDeSesion(d.enganchada) ? d.enganchada : null, retoma: retomaDe(d.retoma) };
}

/** Los pasos de una sesión, revisados. Lo escribieron él y Claude Code: va como texto. Es lógica pura. */
export function resumirLectura(dato: unknown): { sesion: SesionALaVista; pasos: PasoALaVista[] } | null {
  const d = (dato && typeof dato === "object" ? dato : null) as Record<string, unknown> | null;
  const sesion = sesionDe(d?.sesion);
  if (!d || !sesion || !Array.isArray(d.pasos)) return null;
  const quien = (v: unknown) => (v === "el" || v === "claude" || v === "herramienta" ? v : null);
  return {
    sesion,
    pasos: (d.pasos as Record<string, unknown>[]).flatMap((p) => {
      const q = quien(p?.quien);
      return q && typeof p.texto === "string" ? [{ ts: texto(p.ts, 40) || null, quien: q, texto: p.texto.slice(0, 2000) }] : [];
    }),
  };
}

export async function leerSesiones() {
  const r = await alOrquestador("/api/sesiones");
  return (r?.estado === 200 ? resumirSesiones(r.datos) : null) ?? { motivo: r?.estado === 409 ? ("sin_proyecto" as const) : ("no_responde" as const) };
}

/** Lo de una sesión: sin `id`, la enganchada; con `desde`, solo lo posterior. `null` si no hay. */
export async function leerUnaSesion(id: string | null, desde: string | null = null) {
  if (id !== null && !esIdDeSesion(id)) return null;
  const q = new URLSearchParams({ ...(id ? { id } : {}), ...(desde ? { desde } : {}) }).toString();
  const r = await alOrquestador(`/api/sesiones/leer${q ? `?${q}` : ""}`);
  return r?.estado === 200 ? resumirLectura(r.datos) : null;
}

export type AccionDeSesion = { accion: "retomar"; id: string; texto: string } | { accion: "enganchar"; id: string } | { accion: "soltar" } | { accion: "detener" };

/** Lo que él pidió con un clic sobre una sesión, revisado. Lo que no es eso, `null`. Es lógica pura. */
export function accionDeSesion(dato: unknown): AccionDeSesion | null {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  if (d.accion === "soltar" || d.accion === "detener") return { accion: d.accion };
  if (!esIdDeSesion(d.id)) return null;
  if (d.accion === "enganchar") return { accion: "enganchar", id: d.id };
  if (d.accion === "retomar" && typeof d.texto === "string" && d.texto.trim() && d.texto.length <= 8000) return { accion: "retomar", id: d.id, texto: d.texto.trim() };
  return null;
}

export async function hacerConSesion(a: AccionDeSesion): Promise<{ hecho: true } | { hecho: false; motivo: string }> {
  const r = await alOrquestador("/api/sesiones", a);
  if (r?.estado === 200) return { hecho: true };
  return { hecho: false, motivo: r === null ? "La fábrica no responde." : texto((r.datos as { error?: unknown } | null)?.error, 300) || `La fábrica contestó ${r.estado}.` };
}

/** Quién firma lo que sale de aquí: lo decidió una persona, desde esta aplicación. */
export const FIRMA = "persona, desde la aplicación";

export type Accion =
  /** `seguir`: después, la fábrica sigue con esa tarea como después de un veredicto. Solo lo pide la conversación. */
  | { accion: "responder"; tarea: string; texto: string; correr: boolean; seguir?: boolean }
  | { accion: "aprobar"; tarea: string }
  | { accion: "rechazar"; tarea: string; motivo: string }
  | { accion: "correr"; tareas: string[] }
  | { accion: "detener" }
  /** Una tarea nueva que él pidió conversando. No sale de un clic: `accionPedida` no la acepta. */
  | { accion: "crear"; titulo: string; pedido: string }
  /** Descartar una tarea pendiente, en spec o en construcción. El motivo puede ir vacío. */
  | { accion: "descartar"; tarea: string; motivo: string }
  /** Crear una tarea de un hallazgo MENOR de la deuda. */
  | { accion: "deuda"; hallazgo: string };

/**
 * Lo que él pidió con un clic, revisado: una tarea con nombre de tarea, un
 * texto corto. Lo que no sea eso, `null`. Es lógica pura.
 */
export function accionPedida(dato: unknown): Accion | null {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  const escrito = (v: unknown) => (typeof v === "string" && v.trim() && v.length <= 4000 ? v.trim() : null);
  switch (d.accion) {
    case "responder": {
      const t = escrito(d.texto);
      return idValido(d.tarea) && t ? { accion: "responder", tarea: d.tarea, texto: t, correr: d.correr === true } : null;
    }
    case "aprobar":
      return idValido(d.tarea) ? { accion: "aprobar", tarea: d.tarea } : null;
    case "rechazar": {
      const m = escrito(d.motivo);
      return idValido(d.tarea) && m ? { accion: "rechazar", tarea: d.tarea, motivo: m } : null;
    }
    case "correr":
      return d.tareas === undefined ? { accion: "correr", tareas: [] } : Array.isArray(d.tareas) && d.tareas.length <= 50 && d.tareas.every(idValido) ? { accion: "correr", tareas: d.tareas } : null;
    case "detener":
      return { accion: "detener" };
    case "descartar":
      return idValido(d.tarea) && (d.motivo === undefined || (typeof d.motivo === "string" && d.motivo.length <= 4000)) ? { accion: "descartar", tarea: d.tarea, motivo: typeof d.motivo === "string" ? d.motivo.trim() : "" } : null;
    case "deuda":
      return typeof d.hallazgo === "string" && /^[0-9a-f]{16}$/.test(d.hallazgo) ? { accion: "deuda", hallazgo: d.hallazgo } : null;
    default:
      return null;
  }
}

/**
 * Antes de cada corrida, el mod nikke se apaga si quedó
 * encendido: la fábrica es para que trabaje sola, y sus guardas la
 * detendrían esperando una firma. Lo decidió él el 17 de octubre de 2026. Si
 * no se puede comprobar ni apagar, la corrida no se lanza. Devuelve si lo
 * apagó, o el motivo por el que no se corre.
 */
async function sinNikke(): Promise<{ apagado: boolean } | { motivo: string }> {
  const ajustes = await alOrquestador("/api/ajustes");
  if (ajustes?.estado !== 200) return { motivo: "No se pudo comprobar que el mod nikke esté apagado: la corrida no se lanzó." };
  if ((ajustes.datos as { corridaConNikke?: unknown } | null)?.corridaConNikke !== true) return { apagado: false };
  const apagar = await alOrquestador("/api/ajustes", { corridaConNikke: false }, { metodo: "PUT" });
  return apagar?.estado === 200 ? { apagado: true } : { motivo: "El mod nikke está encendido y no se pudo apagar: la corrida no se lanzó." };
}

/**
 * Hace en la fábrica lo que él pidió; si dice que no, vuelve su motivo.
 * `origen`: la dirección de esta aplicación, adonde la corrida manda su
 * telemetría.
 */
export async function hacerEnLaFabrica(a: Accion, contexto: { origen?: string | null } = {}): Promise<{ hecho: true; nikkeApagado: boolean; nota?: string } | { hecho: false; motivo: string }> {
  const motivo = (r: { estado: number; datos: unknown } | null) => (r === null ? "La fábrica no responde." : texto((r.datos as { error?: unknown } | null)?.error, 300) || `La fábrica contestó ${r.estado}.`);
  let nikkeApagado = false;
  const correr = async (tareas: string[]): Promise<{ estado: number; datos: unknown } | null> => {
    const sin = await sinNikke();
    if ("motivo" in sin) return { estado: 409, datos: { error: sin.motivo } };
    nikkeApagado = sin.apagado;
    return alOrquestador("/api/corridas", { accion: "iniciar", ...(tareas.length ? { tareas } : {}) }, { origen: contexto.origen });
  };
  /**
   * Después de un veredicto suyo, la fábrica sigue sola con esa tarea: la corre ahora o, si hay otra
   * corrida en marcha, cuando esa termine. Si no puede, el veredicto queda igual, y se le dice.
   */
  const continuar = async (tarea: string, que = "tu veredicto"): Promise<string> => {
    const sin = await sinNikke();
    if ("motivo" in sin) return `Quedó ${que}, pero la fábrica no siguió: ${sin.motivo}`;
    nikkeApagado = sin.apagado;
    const c = await alOrquestador("/api/corridas", { accion: "continuar", tareas: [tarea] }, { origen: contexto.origen });
    if (c?.estado !== 200) return `Quedó ${que}, pero la fábrica no siguió: ${motivo(c)}`;
    return (c.datos as { encolada?: unknown } | null)?.encolada === true
      ? `Quedó ${que}: ${tarea} sigue cuando termine la corrida en marcha.`
      : `Quedó ${que}: la fábrica ya está siguiendo con ${tarea}.`;
  };
  let nota: string | undefined;
  let r: { estado: number; datos: unknown } | null;
  switch (a.accion) {
    case "responder":
      r = await alOrquestador("/api/respuesta", { tarea: a.tarea, texto: a.texto, por: FIRMA });
      // La respuesta no mueve la tarea: si pidió correrla, se lanza la corrida de esa tarea.
      if (r?.estado === 200 && a.correr) r = await correr([a.tarea]);
      else if (r?.estado === 200 && a.seguir) nota = await continuar(a.tarea, `tu respuesta a ${a.tarea}`);
      break;
    case "aprobar":
      r = await alOrquestador("/api/veredicto", { tarea: a.tarea, veredicto: "aprobada", motivo: "", por: FIRMA });
      if (r?.estado === 200) nota = await continuar(a.tarea);
      break;
    case "rechazar":
      r = await alOrquestador("/api/veredicto", { tarea: a.tarea, veredicto: "rechazada", motivo: a.motivo, por: FIRMA });
      if (r?.estado === 200) nota = await continuar(a.tarea);
      break;
    case "correr":
      r = await correr(a.tareas);
      break;
    case "detener":
      r = await alOrquestador("/api/corridas", { accion: "detener" });
      break;
    case "descartar":
      r = await alOrquestador("/api/descartar", { tarea: a.tarea, motivo: a.motivo, por: FIRMA });
      if (r?.estado === 200) nota = `${a.tarea} quedó descartada.`;
      break;
    case "crear": {
      // Como un documento de requerimientos de una sola tarea: el pedido es lo que él escribió.
      r = await alOrquestador("/api/requerimientos", { titulo: a.titulo, texto: a.pedido, porSeccion: false });
      const creadas = r?.estado === 200 ? ((r.datos as { creadas?: { id?: unknown }[] } | null)?.creadas ?? []).map((c) => c.id).filter(idValido) : [];
      if (r?.estado === 200) nota = creadas.length ? `Quedó en la cola: ${creadas.join(", ")} «${a.titulo}». Si no era eso, descártala desde su tarjeta.` : "La fábrica no creó ninguna tarea.";
      break;
    }
    case "deuda":
      r = await alOrquestador("/api/deuda", { hallazgo: a.hallazgo });
      break;
  }
  return r?.estado === 200 ? { hecho: true, nikkeApagado, ...(nota ? { nota } : {}) } : { hecho: false, motivo: motivo(r) };
}

// ---- La configuración de la fábrica -------------------------------------------------------------

/** Qué proyecto mira la fábrica, y si las corridas cargan el mod nikke. */
export type AjustesDeLaFabrica = {
  /** El proyecto elegido; vacía si todavía no hay uno. */
  raiz: string;
  fuente: "configuracion" | "ninguno";
  proyecto: { existe: boolean; esCarpeta: boolean; tieneFabrica: boolean; tieneGit: boolean };
  corridaConNikke: boolean;
  /** El modelo del orquestador de Claude en las corridas, y de dónde sale. `null`: el de Claude Code. */
  modelo: { modelo: ModeloDeClaude | null; fuente: "configuracion" | "claude" };
  /** El modelo de cada rol, de factory/config.md del proyecto. `null` si el proyecto no tiene fábrica. */
  modelosPorRol: Record<RolConModelo, ModeloDeRol> | null;
  /**
   * Quién revisa el código y quién escribe la spec, además de Claude. `null` si el proyecto no
   * tiene fábrica. Codex y Antigravity mandan código del proyecto a OpenAI o a Google.
   */
  externos: { revisorCodigo: "claude" | "codex" | "ambos"; escritorSpec: "claude" | "antigravity" } | null;
  /** Los comandos con que se verifica cada tarea y la rama base, de factory/config.md. `null` sin fábrica. */
  comandos: ComandosDelProyecto | null;
  /** Las demás reglas de config.md (quién aprueba, integración, vueltas…) y las notas para los agentes. `null` sin fábrica. */
  reglas: { reglas: Reglas; notas: string } | null;
  /**
   * El agente de cada etapa (`auto` o su nombre), cuántas tareas a la vez, y los agentes entre los
   * que se elige. `null` sin fábrica.
   */
  agentes: { porRol: Record<RolDeAgente, string>; paraleloMax: number; disponibles: AgenteALaVista[] } | null;
  /** Hasta cuánto se gasta, en USD: por día en el proyecto y por corrida. Sin uno, no hay límite. */
  topes: { diarioUsd: number | null; corridaUsd: number | null };
  /** Lo que costaron hoy las corridas del proyecto, según Claude Code. */
  gastoHoyUsd: number;
  /** Lo que costaron las corridas de este proyecto cada día, de los últimos catorce, hoy al final. */
  gastoPorDia: { dia: string; usd: number }[];
  /** La rama de trabajo: la elegida (vacía, la de la raíz), en cuál está la raíz y cuáles se pueden elegir. `null` sin fábrica. */
  ramaTrabajo: { elegida: string; raizEn: string | null; opciones: string[] } | null;
  /** Las ramas fabrica/* del proyecto: las integradas, las que tienen commits sin integrar y las de tareas en curso. */
  ramas: { integradas: RamaALaVista[]; sinIntegrar: RamaALaVista[]; enCurso: string[] };
  /** Su memoria (`factory/memoria/`): si existe, cuántas reglas, decisiones vigentes y propuestas por revisar, y cuántos problemas de formato. `null` sin proyecto. */
  memoria: { existe: boolean; reglas: number; decisiones: number; propuestas: number; problemas: number } | null;
  /** Las líneas que conoce la fábrica, y cuál se mira. */
  lineas: LineaDeLaFabrica[];
  /** Su catálogo de habilidades (`factory/habilidades.md`): si existe, cuántos usos, cuántas del proyecto sin usar y cuántos problemas. `null` sin proyecto. */
  habilidades: { existe: boolean; usos: number; sinUsar: number; problemas: number } | null;
  /** Sus procesos (`factory/procesos/`): cada uno con sus pasos y lo que no cumple. Nada de esto corre todavía. `null` sin proyecto. */
  procesos: { existe: boolean; procesos: ProcesoALaVista[] } | null;
};

/** Un proceso de la línea, como se muestra: sus pasos y sus problemas, con su línea. */
export type ProcesoALaVista = {
  id: string;
  archivo: string;
  nombre: string;
  cuando: string;
  rama: string;
  borrador: boolean;
  pasos: { linea: number; tipo: string; texto: string }[];
  sinDeshacer: number[];
  problemas: { linea: number | null; que: string }[];
};

export type LineaDeLaFabrica = { id: string; nombre: string; raiz: string; activa: boolean };

/** Una rama de la fábrica que ya no usa ninguna tarea. Sin la ruta de su worktree: eso no se muestra. */
export type RamaALaVista = { rama: string; tarea: string | null; estado: string | null; base: string; commits: number | null; conWorktree: boolean };

const RAMA_DE_LA_FABRICA = /^fabrica\/[A-Za-z0-9._-]+$/;

function ramaDe(v: unknown): RamaALaVista | null {
  const x = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (!x || typeof x.rama !== "string" || !RAMA_DE_LA_FABRICA.test(x.rama)) return null;
  return {
    rama: x.rama,
    tarea: idValido(x.tarea) ? x.tarea : null,
    estado: texto(x.estado, 30) || null,
    base: texto(x.base, 200),
    commits: typeof x.commits === "number" && Number.isInteger(x.commits) && x.commits >= 0 ? x.commits : null,
    conWorktree: typeof x.worktree === "string" && x.worktree.length > 0,
  };
}

/** Un agente que se puede poner en una etapa. `inyectado`: es de nikke, y viaja con la corrida sin sus guardas. */
export type AgenteALaVista = { nombre: string; origen: string; descripcion: string; enCorridas: "si" | "inyectado" };

export { MODELOS_DE_CLAUDE, ROLES_CON_MODELO, type ModeloDeClaude, type ModeloDeRol, type RolConModelo } from "./modelos.ts";
const esModelo = (v: unknown): v is ModeloDeClaude => typeof v === "string" && (MODELOS_DE_CLAUDE as readonly string[]).includes(v);

const FUENTES = ["configuracion", "ninguno"] as const;

/** El teléfono de la fábrica (Telnyx): qué variables faltan, los números enmascarados y las últimas llamadas. */
export type TelefonoDeLaFabrica = {
  listo: boolean;
  faltan: string[];
  destino: string;
  origen: string;
  /** Si llama sola cuando algo lo espera. */
  auto: boolean;
  conAudio: boolean;
  recientes: { cuando: string; motivo: string; auto: boolean; error: string | null }[];
  autoHoy: number;
  topeAutoDiario: number;
};

/** Las únicas variables del teléfono que se nombran: lo demás que venga no se muestra. */
export const VARIABLES_DEL_TELEFONO = ["COMPANIA_TELNYX_API_KEY", "COMPANIA_TELNYX_CONNECTION_ID", "COMPANIA_TELNYX_NUMERO_ORIGEN", "COMPANIA_TELEFONO"] as const;
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Lo que se muestra del teléfono. Los números ya vienen enmascarados, y aquí no se vuelven a armar. Es lógica pura. */
export function resumirTelefono(dato: unknown): TelefonoDeLaFabrica | null {
  const t = (dato && typeof dato === "object" ? dato : null) as Record<string, unknown> | null;
  if (!t || typeof t.listo !== "boolean") return null;
  return {
    listo: t.listo,
    faltan: Array.isArray(t.faltan) ? t.faltan.filter((v): v is string => VARIABLES_DEL_TELEFONO.some((n) => n === v)) : [],
    destino: texto(t.destino, 40),
    origen: texto(t.origen, 40),
    auto: t.auto === true,
    conAudio: t.conAudio === true,
    recientes: (Array.isArray(t.recientes) ? (t.recientes as Record<string, unknown>[]) : [])
      .slice(0, 5)
      .map((l) => ({ cuando: texto(l?.ts, 40), motivo: texto(l?.motivo, 200), auto: l?.auto === true, error: texto(l?.error, 300) || null }))
      .filter((l) => l.cuando),
    autoHoy: numero(t.autoHoy),
    topeAutoDiario: numero(t.topeAutoDiario),
  };
}

/** Lo que se muestra de los ajustes, sacado de lo que devuelve el motor. Es lógica pura. */
export function resumirAjustes(dato: unknown): AjustesDeLaFabrica | null {
  const a = (dato && typeof dato === "object" ? dato : null) as Record<string, unknown> | null;
  if (!a || typeof a.raiz !== "string") return null;
  const raiz = texto(a.raiz, 1000);
  const p = (a.proyecto && typeof a.proyecto === "object" ? a.proyecto : {}) as Record<string, unknown>;
  return {
    raiz,
    fuente: raiz ? (FUENTES.find((f) => f === a.fuente) ?? "configuracion") : "ninguno",
    proyecto: { existe: p.existe === true, esCarpeta: p.esCarpeta === true, tieneFabrica: p.tieneFabrica === true, tieneGit: p.tieneGit === true },
    corridaConNikke: a.corridaConNikke === true,
    modelo: (() => {
      const m = (a.modelo && typeof a.modelo === "object" ? a.modelo : {}) as Record<string, unknown>;
      const fuente = m.fuente === "configuracion" ? m.fuente : "claude";
      return { modelo: esModelo(m.modelo) ? m.modelo : null, fuente };
    })(),
    externos:
      a.externos && typeof a.externos === "object"
        ? (() => {
            const x = a.externos as Record<string, unknown>;
            return {
              revisorCodigo: x.revisorCodigo === "codex" || x.revisorCodigo === "ambos" ? x.revisorCodigo : "claude",
              escritorSpec: x.escritorSpec === "antigravity" ? "antigravity" : "claude",
            } as const;
          })()
        : null,
    topes: (() => {
      const t = (a.topes && typeof a.topes === "object" ? a.topes : {}) as Record<string, unknown>;
      const usd = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
      return { diarioUsd: usd(t.diarioUsd), corridaUsd: usd(t.corridaUsd) };
    })(),
    gastoHoyUsd: typeof a.gastoHoyUsd === "number" && Number.isFinite(a.gastoHoyUsd) ? a.gastoHoyUsd : 0,
    gastoPorDia: (Array.isArray(a.gastoPorDia) ? (a.gastoPorDia as Record<string, unknown>[]) : [])
      .filter((d) => typeof d?.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.dia) && typeof d.usd === "number" && Number.isFinite(d.usd) && d.usd >= 0)
      .slice(-90)
      .map((d) => ({ dia: String(d.dia), usd: Number(d.usd) })),
    ramaTrabajo: (() => {
      const t = (a.ramaTrabajo && typeof a.ramaTrabajo === "object" ? a.ramaTrabajo : null) as Record<string, unknown> | null;
      if (!t) return null;
      const esRama = (v: unknown): v is string => typeof v === "string" && /^[\w./-]{1,200}$/.test(v);
      return { elegida: esRama(t.elegida) ? t.elegida : "", raizEn: esRama(t.raizEn) ? t.raizEn : null, opciones: (Array.isArray(t.opciones) ? t.opciones : []).filter(esRama).slice(0, 200) };
    })(),
    lineas: (Array.isArray(a.lineas) ? (a.lineas as Record<string, unknown>[]) : [])
      .filter((l) => typeof l?.id === "string" && ID_DE_LINEA.test(l.id) && typeof l.nombre === "string" && typeof l.raiz === "string")
      .slice(0, 100)
      .map((l) => ({ id: String(l.id), nombre: texto(l.nombre, 120), raiz: texto(l.raiz, 1000), activa: l.activa === true })),
    habilidades: (() => {
      const h = (a.habilidades && typeof a.habilidades === "object" ? a.habilidades : null) as Record<string, unknown> | null;
      if (!h) return null;
      const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? Math.min(v, 100_000) : 0);
      return { existe: h.existe === true, usos: n(h.usos), sinUsar: n(h.sinUsar), problemas: Array.isArray(h.problemas) ? h.problemas.length : n(h.problemas) };
    })(),
    procesos: (() => {
      const p = (a.procesos && typeof a.procesos === "object" ? a.procesos : null) as Record<string, unknown> | null;
      if (!p) return null;
      const linea = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? Math.min(v, 100_000) : null);
      const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : []);
      return {
        existe: p.existe === true,
        procesos: lista(p.procesos)
          .slice(0, 50)
          .map((x) => ({
            id: texto(x.id, 60),
            archivo: texto(x.archivo, 120),
            nombre: texto(x.nombre, 200),
            cuando: texto(x.cuando, 40),
            rama: texto(x.rama, 200),
            borrador: x.borrador === true,
            pasos: lista(x.pasos)
              .slice(0, 100)
              .map((s) => ({ linea: linea(s.linea) ?? 0, tipo: texto(s.tipo, 30), texto: texto(s.texto, 400) })),
            sinDeshacer: (Array.isArray(x.sinDeshacer) ? x.sinDeshacer : []).map(linea).filter((n): n is number => n !== null).slice(0, 100),
            problemas: lista(x.problemas)
              .slice(0, 100)
              .map((q) => ({ linea: linea(q.linea), que: texto(q.que, 400) })),
          })),
      };
    })(),
    memoria: (() => {
      const m = (a.memoria && typeof a.memoria === "object" ? a.memoria : null) as Record<string, unknown> | null;
      if (!m) return null;
      const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? Math.min(v, 100_000) : 0);
      return { existe: m.existe === true, reglas: n(m.reglas), decisiones: n(m.decisiones), propuestas: n(m.propuestas), problemas: Array.isArray(m.problemas) ? m.problemas.length : n(m.problemas) };
    })(),
    ramas: (() => {
      const r = (a.ramas && typeof a.ramas === "object" ? a.ramas : {}) as Record<string, unknown>;
      const lista = (v: unknown) => (Array.isArray(v) ? v.map(ramaDe).filter((x) => x !== null).slice(0, 500) : []);
      return { integradas: lista(r.integradas), sinIntegrar: lista(r.sinIntegrar), enCurso: (Array.isArray(r.enCurso) ? r.enCurso : []).filter((x): x is string => typeof x === "string" && RAMA_DE_LA_FABRICA.test(x)).slice(0, 500) };
    })(),
    agentes:
      a.agentes && typeof a.agentes === "object"
        ? (() => {
            const g = a.agentes as Record<string, unknown>;
            const p = (g.porRol && typeof g.porRol === "object" ? g.porRol : {}) as Record<string, unknown>;
            const n = typeof g.paraleloMax === "number" && Number.isInteger(g.paraleloMax) ? Math.min(PARALELO.max, Math.max(PARALELO.min, g.paraleloMax)) : 2;
            return {
              porRol: Object.fromEntries((Object.keys(ROLES_DE_AGENTE) as RolDeAgente[]).map((rol) => [rol, esNombreDeAgente(p[rol]) ? p[rol] : "auto"])) as Record<RolDeAgente, string>,
              paraleloMax: n,
              disponibles: (Array.isArray(g.disponibles) ? (g.disponibles as Record<string, unknown>[]) : [])
                .filter((x) => esNombreDeAgente(x?.nombre))
                .slice(0, 300)
                .map((x) => ({ nombre: String(x.nombre), origen: texto(x.origen, 60), descripcion: texto(x.descripcion, 300), enCorridas: x.enCorridas === "inyectado" ? ("inyectado" as const) : ("si" as const) })),
            };
          })()
        : null,
    reglas:
      a.reglas && typeof a.reglas === "object"
        ? (() => {
            const g = a.reglas as Record<string, unknown>;
            const valores = (g.reglas && typeof g.reglas === "object" ? g.reglas : {}) as Record<string, unknown>;
            return {
              reglas: reglasDesde(Object.fromEntries(CLAVES_DE_REGLA.map((k) => [k, typeof valores[k] === "string" ? (valores[k] as string) : undefined]))),
              notas: typeof g.notas === "string" ? g.notas.slice(0, NOTAS_MAX) : "",
            };
          })()
        : null,
    comandos:
      a.comandos && typeof a.comandos === "object"
        ? (() => {
            const c = a.comandos as Record<string, unknown>;
            return { build: texto(c.build, 1000), test: texto(c.test, 1000), lint: texto(c.lint, 1000), ramaBase: texto(c.ramaBase, 200) };
          })()
        : null,
    modelosPorRol:
      a.modelosPorRol && typeof a.modelosPorRol === "object"
        ? (Object.fromEntries(ROLES_CON_MODELO.map((rol) => {
            const v = (a.modelosPorRol as Record<string, unknown>)[rol];
            return [rol, esModelo(v) || v === "inherit" ? v : "inherit"];
          })) as Record<RolConModelo, ModeloDeRol>)
        : null,
  };
}

/** Los ajustes y el teléfono, como están ahora. */
export async function leerAjustesDeLaFabrica(): Promise<{ ajustes: AjustesDeLaFabrica; telefono: TelefonoDeLaFabrica | null } | { motivo: "no_responde" }> {
  const [ajustes, telefono] = await Promise.all([alOrquestador("/api/ajustes"), alOrquestador("/api/telefono")]);
  const leidos = ajustes?.estado === 200 ? resumirAjustes(ajustes.datos) : null;
  return leidos ? { ajustes: leidos, telefono: telefono?.estado === 200 ? resumirTelefono(telefono.datos) : null } : { motivo: "no_responde" };
}

/** El id de una línea, como lo arma el motor (`motor/lineas.ts`). */
const ID_DE_LINEA = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** El tope de un documento de requerimientos, el mismo del motor. */
export const REQUERIMIENTOS_MAX_BYTES = 512 * 1024;

export type Ajuste =
  | { ajuste: "proyecto"; raiz: string | null }
  | { ajuste: "inicializar" }
  /** Crear la memoria (`factory/memoria/`) del proyecto elegido, sembrada con propuestas. No pisa una que exista. */
  | { ajuste: "crear_memoria" }
  /** Crear `factory/procesos/<cual>.md` desde su plantilla (publicar y evaluacion, como borrador). No pisa uno que exista. */
  | { ajuste: "crear_proceso"; cual: "publicar" | "vigia" | "evaluacion" }
  /** Sacar una línea de la fábrica. Su repositorio, sus tareas y su memoria quedan como están. */
  | { ajuste: "quitar_linea"; linea: string }
  /** Apagar el mod nikke en las corridas. Encenderlo no se pide desde aquí: sus guardas no dejarían a la fábrica trabajar sola. */
  | { ajuste: "sin_nikke" }
  | { ajuste: "requerimientos"; titulo: string; texto: string; porSeccion: boolean }
  /** Hacer sonar el teléfono ahora, para probar. */
  | { ajuste: "probar_telefono" }
  /** Que el teléfono suene solo cuando algo lo espera. */
  | { ajuste: "llamar_sola"; valor: boolean }
  /** El modelo del orquestador de Claude; `null`, el de Claude Code. */
  | { ajuste: "modelo"; modelo: ModeloDeClaude | null }
  | { ajuste: "modelo_de_rol"; rol: RolConModelo; modelo: ModeloDeRol }
  /** Encender o apagar Codex (revisar código) o Antigravity (escribir la spec) en el proyecto. */
  | { ajuste: "agente_externo"; cual: "revisorCodigo"; valor: "claude" | "codex" | "ambos" }
  | { ajuste: "agente_externo"; cual: "escritorSpec"; valor: "claude" | "antigravity" }
  /** Los comandos de build, test y lint y la rama base del proyecto elegido. */
  | { ajuste: "comandos"; comandos: ComandosDelProyecto }
  /** Correr los comandos en la raíz del proyecto, para ver si funcionan antes de una corrida. */
  | { ajuste: "probar_comandos" }
  /** El agente de una etapa: `auto` o uno de los que se pueden elegir. */
  | { ajuste: "agente_de_rol"; rol: RolDeAgente; valor: string }
  /** Crear el agente propio de una etapa, como copia del de la fábrica, y ponerlo en ella. No pisa uno que exista. */
  | { ajuste: "personalizar_agente"; rol: RolDeAgente }
  /** Guardar lo escrito en el agente propio de una etapa. */
  | { ajuste: "agente_propio"; rol: RolDeAgente; descripcion: string; instrucciones: string }
  /** Cuántas tareas trabaja la fábrica a la vez en este proyecto. */
  | { ajuste: "paralelo"; valor: number }
  /** Los topes de gasto, en USD; `null` quita uno. */
  | { ajuste: "topes"; diarioUsd: number | null; corridaUsd: number | null }
  /** Quitar el worktree y la rama de las tareas ya integradas. */
  /** La rama donde trabaja: de ahí salen las tareas y ahí se integran. "": la activa en la raíz. */
  | { ajuste: "rama_trabajo"; valor: string }
  /** Limpia las ramas integradas y, de las que tienen commits sin integrar, las elegidas. */
  | { ajuste: "limpiar_ramas"; sinIntegrar: string[] }
  /** Cambiar reglas de config.md: solo las que vienen. */
  | { ajuste: "reglas"; reglas: Partial<Reglas> }
  /** Las notas para los agentes, debajo del frontmatter de config.md. */
  | { ajuste: "notas"; notas: string };

/** Lo que él cambió en la configuración, revisado. Lo que no sea eso, `null`. Es lógica pura. */
export function ajustePedido(dato: unknown): Ajuste | null {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  switch (d.ajuste) {
    case "proyecto":
      if (d.raiz === null) return { ajuste: "proyecto", raiz: null };
      return typeof d.raiz === "string" && d.raiz.trim() && d.raiz.length <= 1000 && !/\p{Cc}/u.test(d.raiz) ? { ajuste: "proyecto", raiz: d.raiz.trim() } : null;
    case "inicializar":
      return { ajuste: "inicializar" };
    case "crear_memoria":
      return { ajuste: "crear_memoria" };
    case "crear_proceso":
      return { ajuste: "crear_proceso", cual: d.cual === "vigia" || d.cual === "evaluacion" ? d.cual : "publicar" };
    case "quitar_linea":
      return typeof d.linea === "string" && ID_DE_LINEA.test(d.linea) ? { ajuste: "quitar_linea", linea: d.linea } : null;
    case "sin_nikke":
      return { ajuste: "sin_nikke" };
    case "requerimientos": {
      const escrito = typeof d.texto === "string" ? d.texto : "";
      const titulo = typeof d.titulo === "string" ? d.titulo.trim() : "";
      if (!escrito.trim() || new TextEncoder().encode(escrito).length > REQUERIMIENTOS_MAX_BYTES || titulo.length > 200) return null;
      return { ajuste: "requerimientos", titulo, texto: escrito, porSeccion: d.porSeccion === true };
    }
    case "probar_telefono":
      return { ajuste: "probar_telefono" };
    case "llamar_sola":
      return typeof d.valor === "boolean" ? { ajuste: "llamar_sola", valor: d.valor } : null;
    case "modelo":
      return d.modelo === null ? { ajuste: "modelo", modelo: null } : esModelo(d.modelo) ? { ajuste: "modelo", modelo: d.modelo } : null;
    case "agente_externo":
      if (d.cual === "revisorCodigo" && (d.valor === "claude" || d.valor === "codex" || d.valor === "ambos")) return { ajuste: "agente_externo", cual: "revisorCodigo", valor: d.valor };
      if (d.cual === "escritorSpec" && (d.valor === "claude" || d.valor === "antigravity")) return { ajuste: "agente_externo", cual: "escritorSpec", valor: d.valor };
      return null;
    case "modelo_de_rol":
      return (ROLES_CON_MODELO as readonly unknown[]).includes(d.rol) && (esModelo(d.modelo) || d.modelo === "inherit")
        ? { ajuste: "modelo_de_rol", rol: d.rol as RolConModelo, modelo: d.modelo as ModeloDeRol }
        : null;
    case "comandos": {
      const r = revisarComandos(d.comandos);
      return "comandos" in r ? { ajuste: "comandos", comandos: r.comandos } : null;
    }
    case "probar_comandos":
      return { ajuste: "probar_comandos" };
    case "agente_de_rol":
      return esRolDeAgente(d.rol) && (d.valor === "auto" || esNombreDeAgente(d.valor)) ? { ajuste: "agente_de_rol", rol: d.rol, valor: d.valor as string } : null;
    case "personalizar_agente":
      return esRolDeAgente(d.rol) ? { ajuste: "personalizar_agente", rol: d.rol } : null;
    case "agente_propio": {
      if (!esRolDeAgente(d.rol)) return null;
      const r = revisarAgentePropio(d);
      return "error" in r ? null : { ajuste: "agente_propio", rol: d.rol, ...r };
    }
    case "rama_trabajo":
      return typeof d.valor === "string" && /^[\w./-]{0,200}$/.test(d.valor.trim()) && !d.valor.trim().startsWith("fabrica/") ? { ajuste: "rama_trabajo", valor: d.valor.trim() } : null;
    case "limpiar_ramas": {
      const elegidas = d.sinIntegrar === undefined ? [] : d.sinIntegrar;
      return Array.isArray(elegidas) && elegidas.length <= 500 && elegidas.every((x) => typeof x === "string" && RAMA_DE_LA_FABRICA.test(x)) ? { ajuste: "limpiar_ramas", sinIntegrar: elegidas as string[] } : null;
    }
    case "reglas": {
      const r = revisarReglas(d.reglas);
      return "reglas" in r && Object.keys(r.reglas).length ? { ajuste: "reglas", reglas: r.reglas } : null;
    }
    case "notas": {
      const r = revisarNotas(d.notas);
      return "notas" in r ? { ajuste: "notas", notas: r.notas } : null;
    }
    case "topes": {
      const usd = (v: unknown) => (v === null ? null : typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 10_000 ? v : undefined);
      const diario = usd(d.diarioUsd);
      const corrida = usd(d.corridaUsd);
      return diario === undefined || corrida === undefined ? null : { ajuste: "topes", diarioUsd: diario, corridaUsd: corrida };
    }
    case "paralelo":
      return typeof d.valor === "number" && Number.isInteger(d.valor) && d.valor >= PARALELO.min && d.valor <= PARALELO.max ? { ajuste: "paralelo", valor: d.valor } : null;
    default:
      return null;
  }
}

/** Lo que vuelve de probar los comandos, revisado: la salida la escribió el proyecto, va como texto. Es lógica pura. */
export function pruebasDe(dato: unknown): PruebaDeComando[] {
  return (Array.isArray(dato) ? (dato as Record<string, unknown>[]) : []).flatMap((p) => {
    const nombre = NOMBRES_DE_COMANDO.find((n) => n === p?.nombre);
    const resultado = (["ok", "fallo", "vacio", "omitido"] as const).find((x) => x === p?.resultado);
    if (!nombre || !resultado) return [];
    return [{ nombre, resultado, comando: texto(p.comando, 1000), codigo: typeof p.codigo === "number" ? p.codigo : null, salida: typeof p.salida === "string" ? p.salida.slice(-2000) : "", ms: cifra(p.ms) ?? 0 }];
  });
}

/**
 * Hace en la fábrica lo que él cambió. De los requerimientos vuelven las
 * tareas creadas; de crear la factory/, lo que no se pudo detectar; de probar
 * los comandos, cómo salió cada uno. Si la fábrica dice que no, vuelve su motivo.
 */
export async function ajustarLaFabrica(a: Ajuste): Promise<
  | { hecho: true; personalizado?: { creado: boolean; nombre: string }; creadas?: { id: string; titulo: string }[]; documento?: string; avisos?: string[]; pruebas?: PruebaDeComando[]; limpieza?: { limpiadas: string[]; saltadas: { rama: string; motivo: string }[] }; memoria?: { creada: boolean; propuestas: number }; proceso?: { creado: boolean; archivo: string }; quitada?: { nombre: string; eraLaActiva: boolean } }
  | { hecho: false; motivo: string }
> {
  let r: { estado: number; datos: unknown } | null;
  switch (a.ajuste) {
    case "comandos":
      r = await alOrquestador("/api/ajustes", { comandos: a.comandos }, { metodo: "PUT" });
      break;
    case "probar_comandos":
      r = await alOrquestador("/api/ajustes", { accion: "probar_comandos" });
      break;
    case "agente_de_rol":
      r = await alOrquestador("/api/ajustes", { agenteDeRol: { rol: a.rol, valor: a.valor } }, { metodo: "PUT" });
      break;
    case "personalizar_agente":
      r = await alOrquestador("/api/ajustes", { accion: "personalizar_agente", rol: a.rol });
      break;
    case "agente_propio":
      r = await alOrquestador("/api/ajustes", { agentePropio: { rol: a.rol, descripcion: a.descripcion, instrucciones: a.instrucciones } }, { metodo: "PUT" });
      break;
    case "paralelo":
      r = await alOrquestador("/api/ajustes", { paraleloMax: a.valor }, { metodo: "PUT" });
      break;
    case "topes":
      r = await alOrquestador("/api/ajustes", { topes: { diarioUsd: a.diarioUsd, corridaUsd: a.corridaUsd } }, { metodo: "PUT" });
      break;
    case "limpiar_ramas":
      r = await alOrquestador("/api/ajustes", { accion: "limpiar_ramas", sinIntegrar: a.sinIntegrar });
      break;
    case "rama_trabajo":
      r = await alOrquestador("/api/ajustes", { ramaTrabajo: a.valor }, { metodo: "PUT" });
      break;
    case "reglas":
      r = await alOrquestador("/api/ajustes", { reglas: a.reglas }, { metodo: "PUT" });
      break;
    case "notas":
      r = await alOrquestador("/api/ajustes", { notas: a.notas }, { metodo: "PUT" });
      break;
    case "proyecto":
      r = await alOrquestador("/api/ajustes", { raiz: a.raiz }, { metodo: "PUT" });
      break;
    case "crear_memoria":
      r = await alOrquestador("/api/ajustes", { accion: "crear_memoria" });
      break;
    case "crear_proceso":
      r = await alOrquestador("/api/ajustes", { accion: "crear_proceso", cual: a.cual });
      break;
    case "quitar_linea": {
      // La Entrada no se queda con conexiones ni pendientes que apunten a una línea que ya no existe.
      const motivo = laEntradaUsaLaLinea(baseDeDatos(), a.linea);
      if (motivo) return { hecho: false, motivo };
      r = await alOrquestador("/api/ajustes", { accion: "quitar_linea", linea: a.linea });
      break;
    }
    case "inicializar":
      r = await alOrquestador("/api/ajustes", { accion: "inicializar" });
      break;
    case "sin_nikke":
      r = await alOrquestador("/api/ajustes", { corridaConNikke: false }, { metodo: "PUT" });
      break;
    case "requerimientos":
      r = await alOrquestador("/api/requerimientos", { titulo: a.titulo, texto: a.texto, porSeccion: a.porSeccion });
      break;
    case "probar_telefono":
      r = await alOrquestador("/api/telefono", { accion: "probar" });
      break;
    case "llamar_sola":
      r = await alOrquestador("/api/ajustes", { llamarSola: a.valor }, { metodo: "PUT" });
      break;
    case "modelo":
      r = await alOrquestador("/api/ajustes", { modelo: a.modelo }, { metodo: "PUT" });
      break;
    case "modelo_de_rol":
      r = await alOrquestador("/api/ajustes", { modeloDeRol: { rol: a.rol, modelo: a.modelo } }, { metodo: "PUT" });
      break;
    case "agente_externo":
      r = await alOrquestador("/api/ajustes", { agenteExterno: { cual: a.cual, valor: a.valor } }, { metodo: "PUT" });
      break;
  }
  if (r?.estado !== 200) return { hecho: false, motivo: r === null ? "La fábrica no responde." : texto((r.datos as { error?: unknown } | null)?.error, 300) || `La fábrica contestó ${r.estado}.` };
  const d = (r.datos && typeof r.datos === "object" ? r.datos : {}) as Record<string, unknown>;
  if (a.ajuste === "inicializar") {
    const i = (d.inicializada && typeof d.inicializada === "object" ? d.inicializada : {}) as Record<string, unknown>;
    return { hecho: true, avisos: (Array.isArray(i.avisos) ? i.avisos : []).map((x) => texto(x, 400)).filter(Boolean).slice(0, 10) };
  }
  if (a.ajuste === "probar_comandos") return { hecho: true, pruebas: pruebasDe(d.pruebas) };
  if (a.ajuste === "personalizar_agente") {
    const p = (d.personalizado && typeof d.personalizado === "object" ? d.personalizado : {}) as Record<string, unknown>;
    return { hecho: true, personalizado: { creado: p.creado === true, nombre: esNombreDeAgente(p.nombre) ? p.nombre : "" } };
  }
  if (a.ajuste === "quitar_linea") {
    const q = (d.quitada && typeof d.quitada === "object" ? d.quitada : {}) as Record<string, unknown>;
    return { hecho: true, quitada: { nombre: texto(q.nombre, 120), eraLaActiva: q.eraLaActiva === true } };
  }
  if (a.ajuste === "crear_memoria") {
    const m = (d.memoriaCreada && typeof d.memoriaCreada === "object" ? d.memoriaCreada : {}) as Record<string, unknown>;
    return { hecho: true, memoria: { creada: m.creado === true, propuestas: Array.isArray(m.propuestas) ? m.propuestas.length : 0 } };
  }
  if (a.ajuste === "crear_proceso") {
    const p = (d.procesoCreado && typeof d.procesoCreado === "object" ? d.procesoCreado : {}) as Record<string, unknown>;
    return { hecho: true, proceso: { creado: p.creado === true, archivo: texto(p.archivo, 120) } };
  }
  if (a.ajuste === "limpiar_ramas") {
    const l = (d.limpieza && typeof d.limpieza === "object" ? d.limpieza : {}) as Record<string, unknown>;
    const esRama = (x: unknown): x is string => typeof x === "string" && RAMA_DE_LA_FABRICA.test(x);
    return {
      hecho: true,
      limpieza: {
        limpiadas: (Array.isArray(l.limpiadas) ? l.limpiadas : []).filter(esRama),
        saltadas: (Array.isArray(l.saltadas) ? (l.saltadas as Record<string, unknown>[]) : []).filter((x) => esRama(x?.rama)).map((x) => ({ rama: String(x.rama), motivo: texto(x.motivo, 300) })),
      },
    };
  }
  if (a.ajuste !== "requerimientos") return { hecho: true };
  const creadas = (Array.isArray(d.creadas) ? (d.creadas as Record<string, unknown>[]) : [])
    .filter((c) => idValido(c?.id))
    .map((c) => ({ id: String(c.id), titulo: texto(c.titulo, 160) }));
  return { hecho: true, creadas, documento: texto(d.documento, 400) };
}
