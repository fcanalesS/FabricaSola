import type { Config, Estado, Evento, Tarea } from "../motor/tipos.ts";
import type { ReglaDeFicha } from "../memoria/formato.ts";
import type { ModeloDeRol } from "../modelos.ts";

/**
 * Lo que las pantallas de la planta (La planta, Una línea, Tareas de todas) sacan de lo que cada
 * línea ya guarda: en qué columna va cada tarea, qué lo espera a él y los números de cada línea.
 * Es lógica pura: el disco lo lee `disco.ts`. El plan está en `fabrica/docs/Plan-Planta.md`.
 */

/** Las columnas del lienzo, en orden. */
export const ETAPAS_DE_LA_PLANTA = ["pendiente", "spec", "construccion", "revision", "verificacion", "aprobacion", "hechas"] as const;
export type EtapaDeLaPlanta = (typeof ETAPAS_DE_LA_PLANTA)[number];

export const NOMBRE_DE_ETAPA: Record<EtapaDeLaPlanta, string> = {
  pendiente: "Pendiente",
  spec: "Spec",
  construccion: "Construcción",
  revision: "Revisión",
  verificacion: "Verificación",
  aprobacion: "Aprobación",
  hechas: "Hechas hoy",
};

/** Los estados en que una tarea se está trabajando: una que vuelve de `necesita-humano` vuelve a uno de estos. */
const DE_TRABAJO: readonly Estado[] = ["spec", "construccion", "revision", "verificacion", "aprobacion"];

/** Cuántos días mira «a la primera». */
export const DIAS_DE_LA_PRIMERA = 7;

/** El día de un instante en la hora de este equipo (`2026-10-26`), como cuenta el gasto. */
export const diaDe = (ms: number) => new Date(ms).toLocaleDateString("sv");

/** Cuándo pasó a `hecho` cada tarea: el último evento que la llevó ahí. */
export function hechasEn(eventos: readonly Evento[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of eventos) if (e.a === "hecho") out.set(e.tarea, e.ts);
  return out;
}

/** De qué etapa vino cada tarea que está en `necesita-humano`: el `de` del último evento que la detuvo. */
export function detenidasDesde(eventos: readonly Evento[]): Map<string, { de: Estado | null; ts: string }> {
  const out = new Map<string, { de: Estado | null; ts: string }>();
  for (const e of eventos) if (e.a === "necesita-humano") out.set(e.tarea, { de: e.de, ts: e.ts });
  return out;
}

/**
 * Si él puede elegir con qué modelo se escribe la spec de una tarea: antes de que se escriba
 * (`pendiente`), o cuando se detuvo a preguntarle antes de construir. Lo usan la pantalla y el
 * guardia que lo escribe.
 */
export const eligeModeloDeSpec = (estado: Estado, detenidaDesde: Estado | null): boolean =>
  estado === "pendiente" || (estado === "necesita-humano" && (detenidaDesde === "pendiente" || detenidaDesde === "spec"));

/**
 * Si él puede elegir con qué modelo se construye una tarea: mientras pueda volver a construirse,
 * es decir, si no está hecha ni descartada. Una en revisión o en aprobación puede volver a
 * construcción, y el retrabajo usa ese modelo. Es lógica pura.
 */
export const eligeModeloDeConstruccion = (estado: Estado): boolean => estado !== "hecho" && estado !== "descartada";

/**
 * La columna de una tarea, o `null` si no se muestra: una descartada, o una hecha otro día. Una
 * que espera a una persona va en la etapa de la que vino (si no se sabe, en Pendiente).
 */
export function etapaDe(t: Tarea, contexto: { hechaEn?: string; detenidaDesde?: Estado | null; ahora: number }): EtapaDeLaPlanta | null {
  switch (t.estado) {
    case "descartada":
      return null;
    case "hecho":
      return contexto.hechaEn && diaDe(Date.parse(contexto.hechaEn)) === diaDe(contexto.ahora) ? "hechas" : null;
    case "necesita-humano":
      return contexto.detenidaDesde && DE_TRABAJO.includes(contexto.detenidaDesde) ? (contexto.detenidaDesde as EtapaDeLaPlanta) : "pendiente";
    default:
      return t.estado;
  }
}

/** Si la línea pide el veredicto de él: con `aprobacion: agente`, decide el agente y no se le pide. */
export const pideSuVeredicto = (config: Pick<Config, "aprobacion"> | null) => config?.aprobacion === "externa" || config?.aprobacion === "ambas";

/**
 * Qué espera de él una tarea: una pregunta sin respuesta, o un veredicto que la línea le pide y
 * no está. `null` si no lo espera.
 */
/** Una grande que el agente ya aprobó y que él todavía no probó: su veredicto la deja integrarse. */
export const esperaSuPrueba = (t: Pick<Tarea, "integracion" | "aprobacionAgente" | "veredictoExterno">) =>
  t.integracion?.clase === "grande" && t.aprobacionAgente === "aprobada" && !t.veredictoExterno;

export function teEspera(t: Tarea, config: Pick<Config, "aprobacion"> | null): "pregunta" | "veredicto" | null {
  if (t.estado === "necesita-humano" && !t.respuesta) return "pregunta";
  if (t.estado === "aprobacion" && pideSuVeredicto(config) && !t.veredictoExterno) return "veredicto";
  // Una grande, ya aprobada por el agente, espera que él la pruebe a mano (fabrica/docs/Plan-Integracion.md).
  if (t.estado === "aprobacion" && esperaSuPrueba(t)) return "veredicto";
  return null;
}

export type OrigenDeTarea = "github" | "gitlab" | "formulario" | "documento" | "deuda" | "otro";

export const NOMBRE_DE_ORIGEN: Record<OrigenDeTarea, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  formulario: "Formulario",
  documento: "Documento",
  deuda: "Deuda",
  otro: "A mano",
};

/** Por dónde entró una tarea, y lo que se dice de eso en su tarjeta («GitHub #131»). */
export function origenDe(t: Pick<Tarea, "origenEntrada" | "origenHallazgo" | "documento">): { origen: OrigenDeTarea; texto: string } {
  if (t.origenHallazgo) return { origen: "deuda", texto: NOMBRE_DE_ORIGEN.deuda };
  const e = t.origenEntrada ?? "";
  const issue = /^(github|gitlab):[^#\s]+#(\d{1,9})$/.exec(e);
  if (issue) return { origen: issue[1] as "github" | "gitlab", texto: `${NOMBRE_DE_ORIGEN[issue[1] as "github" | "gitlab"]} #${issue[2]}` };
  if (e.startsWith("github:") || e.startsWith("gitlab:")) {
    const origen = e.startsWith("github:") ? "github" : "gitlab";
    return { origen, texto: NOMBRE_DE_ORIGEN[origen] };
  }
  if (e === "formulario") return { origen: "formulario", texto: NOMBRE_DE_ORIGEN.formulario };
  if (t.documento) return { origen: "documento", texto: NOMBRE_DE_ORIGEN.documento };
  return { origen: "otro", texto: NOMBRE_DE_ORIGEN.otro };
}

/** Una tarea como la muestran las pantallas de la planta. */
export type TarjetaDeLaPlanta = {
  id: string
  titulo: string
  /** El título lo escribió otra persona: se muestra, pero lo que habla en voz alta dice solo el id. */
  tituloAjeno: boolean
  estado: Estado
  etapa: EtapaDeLaPlanta
  espera: "pregunta" | "veredicto" | null
  /** Desde cuándo lo espera, si lo espera; si no, la última vez que cambió. */
  desde: string | null
  origen: OrigenDeTarea
  origenTexto: string
  vueltas: number
  rama: string | null
  hechaEn: string | null
  dependeDe: string[]
  /** Lo que la detuvo, si lo espera: la pregunta del agente, recortada. */
  motivo: string | null
  /** El modelo que él eligió para su spec, si eligió uno. */
  modeloSpec: ModeloDeRol | null
  /** Si todavía puede elegirlo: su spec no se escribió, o se detuvo a preguntarle. */
  eligeModeloDeSpec: boolean
  /** El modelo que él eligió para construirla, si eligió uno. */
  modeloConstruccion: ModeloDeRol | null
  /** Si todavía puede elegirlo: mientras la tarea pueda volver a construirse. */
  eligeModeloDeConstruccion: boolean
  /** Si el agente de salida pidió su clic para producción: el motivo ("" sin motivo); `null` si no. */
  pideSuClic: string | null
  /** Si la tarea aprobada es sencilla o grande, y por qué; `null` si todavía no se clasificó. */
  integracion: { clase: "sencilla" | "grande"; motivo: string; por: "regla" | "jev" | "sin_jev" } | null
  /** Si él la marcó con «Debió esperarme»: entró sola por Jev y tenía que esperarlo. */
  debioEsperar: boolean
}

const recortar = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

/** Las tarjetas de una línea, en el orden de sus ids. */
export function tarjetasDe(tareas: readonly Tarea[], eventos: readonly Evento[], config: Pick<Config, "aprobacion"> | null, ahora: number, marcadas: ReadonlySet<string> = new Set()): TarjetaDeLaPlanta[] {
  const hechas = hechasEn(eventos);
  const detenidas = detenidasDesde(eventos);
  const out: TarjetaDeLaPlanta[] = [];
  for (const t of tareas) {
    const det = detenidas.get(t.id);
    const etapa = etapaDe(t, { hechaEn: hechas.get(t.id), detenidaDesde: det?.de ?? null, ahora });
    if (!etapa) continue;
    const espera = teEspera(t, config);
    const desde = espera === "pregunta" ? (det?.ts ?? t.actualizada ?? null) : espera === "veredicto" ? (t.enAprobacionDesde ?? t.actualizada ?? null) : (t.actualizada ?? null);
    const { origen, texto } = origenDe(t);
    out.push({
      id: t.id,
      titulo: t.titulo,
      tituloAjeno: !!t.tituloAjeno,
      estado: t.estado,
      etapa,
      espera,
      desde,
      origen,
      origenTexto: texto,
      vueltas: t.vueltas,
      rama: t.rama ?? null,
      hechaEn: hechas.get(t.id) ?? null,
      dependeDe: [...t.dependeDe],
      motivo: espera && t.motivo ? recortar(t.motivo, 400) : null,
      modeloSpec: t.modeloSpec ?? null,
      eligeModeloDeSpec: eligeModeloDeSpec(t.estado, det?.de ?? null),
      modeloConstruccion: t.modeloConstruccion ?? null,
      eligeModeloDeConstruccion: eligeModeloDeConstruccion(t.estado),
      pideSuClic: t.pideSuClic ?? null,
      integracion: t.integracion ?? null,
      debioEsperar: marcadas.has(t.id),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id, "es", { numeric: true }));
}

export type NumerosDeLinea = {
  /** Las que no están hechas ni descartadas. */
  abiertas: number
  teEsperan: number
  hechasHoy: number
  /** Hechas en los últimos 7 días sin volver a construcción, sobre las hechas; `null` si no hay hechas. */
  aLaPrimera: { sinVolver: number; hechas: number } | null
  porEtapa: Record<EtapaDeLaPlanta, number>
  /** Lo que lo espera desde hace más tiempo. */
  esperaMasVieja: string | null
}

export function numerosDeLinea(tareas: readonly Tarea[], tarjetas: readonly TarjetaDeLaPlanta[], eventos: readonly Evento[], ahora: number): NumerosDeLinea {
  const hechas = hechasEn(eventos);
  const desde = ahora - DIAS_DE_LA_PRIMERA * 86_400_000;
  let sinVolver = 0;
  let enLaSemana = 0;
  for (const t of tareas) {
    if (t.estado !== "hecho") continue;
    const cuando = Date.parse(hechas.get(t.id) ?? "");
    if (!Number.isFinite(cuando) || cuando < desde || cuando > ahora) continue;
    enLaSemana++;
    if (t.vueltas === 0) sinVolver++;
  }
  const porEtapa = Object.fromEntries(ETAPAS_DE_LA_PLANTA.map((e) => [e, 0])) as Record<EtapaDeLaPlanta, number>;
  for (const t of tarjetas) porEtapa[t.etapa]++;
  const esperas = tarjetas.filter((t) => t.espera).map((t) => t.desde).filter((d): d is string => !!d && Number.isFinite(Date.parse(d)));
  return {
    abiertas: tareas.filter((t) => t.estado !== "hecho" && t.estado !== "descartada").length,
    teEsperan: tarjetas.filter((t) => t.espera).length,
    hechasHoy: porEtapa.hechas,
    aLaPrimera: enLaSemana ? { sinVolver, hechas: enLaSemana } : null,
    porEtapa,
    esperaMasVieja: esperas.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null,
  };
}

/** El porcentaje de «a la primera», redondeado, o `null`. */
export const porcentajeALaPrimera = (n: NumerosDeLinea["aLaPrimera"]) => (n ? Math.round((100 * n.sinVolver) / n.hechas) : null);

/** Lo que la memoria de la línea dice de su stack: framework, lenguaje, runtime y base de datos, en ese orden. */
export function stackDe(reglas: readonly Pick<ReglaDeFicha, "tema" | "texto" | "prohibe">[]): string | null {
  const orden = ["framework", "lenguaje", "runtime", "base-de-datos"];
  const vistos: string[] = [];
  for (const tema of orden) {
    for (const r of reglas) {
      if (r.tema !== tema || r.prohibe) continue;
      const t = r.texto.replace(/\s+/g, " ").trim().replace(/\.$/, "");
      if (t && !vistos.includes(t)) vistos.push(t.length > 40 ? t.slice(0, 39) + "…" : t);
    }
  }
  return vistos.length ? vistos.slice(0, 3).join(" · ") : null;
}

/** El estado de una línea en la planta. Pausada y detenida llegan con las etapas del motor. */
export type EstadoDeLinea = "corriendo" | "quieta" | "sin-fabrica" | "error";

/** Los números de toda la planta, de los de cada línea que se pudo leer. */
export function numerosDeLaPlanta(lineas: readonly { estado: EstadoDeLinea; numeros: NumerosDeLinea | null; gastoHoyUsd: number }[]) {
  const leidas = lineas.flatMap((l) => (l.numeros ? [l.numeros] : []));
  const sinVolver = leidas.reduce((s, n) => s + (n.aLaPrimera?.sinVolver ?? 0), 0);
  const hechas = leidas.reduce((s, n) => s + (n.aLaPrimera?.hechas ?? 0), 0);
  const esperas = leidas.map((n) => n.esperaMasVieja).filter((d): d is string => !!d);
  return {
    lineas: lineas.length,
    corriendo: lineas.filter((l) => l.estado === "corriendo").length,
    abiertas: leidas.reduce((s, n) => s + n.abiertas, 0),
    teEsperan: leidas.reduce((s, n) => s + n.teEsperan, 0),
    hechasHoy: leidas.reduce((s, n) => s + n.hechasHoy, 0),
    aLaPrimera: hechas ? { sinVolver, hechas } : null,
    esperaMasVieja: esperas.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null,
    gastoHoyUsd: lineas.reduce((s, l) => s + l.gastoHoyUsd, 0),
  };
}

/** Cómo se filtran las tareas de toda la planta. Lo vacío no filtra. */
export type FiltroDeTareas = { texto?: string; linea?: string; origen?: OrigenDeTarea | ""; soloEsperan?: boolean };

const comparable = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Las tarjetas que pasan el filtro. El texto se busca en el id, el título, de dónde entró y la
 * rama, sin importar tildes ni mayúsculas.
 */
export function filtrarTarjetas<T extends TarjetaDeLaPlanta & { linea: string }>(tarjetas: readonly T[], f: FiltroDeTareas): T[] {
  const texto = comparable(f.texto?.trim() ?? "");
  return tarjetas.filter((t) => {
    if (f.linea && t.linea !== f.linea) return false;
    if (f.origen && t.origen !== f.origen) return false;
    if (f.soloEsperan && !t.espera) return false;
    if (texto && !comparable([t.id, t.titulo, t.origenTexto, t.rama ?? ""].join(" ")).includes(texto)) return false;
    return true;
  });
}
