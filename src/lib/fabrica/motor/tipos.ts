// Los objetos de la fábrica tal como los escribe el plugin `fabrica` en factory/. El contrato está
// en fabrica/docs/, junto al plugin.
import type { ModeloDeRol } from "../modelos.ts";

export const ESTADOS = [
  "pendiente",
  "spec",
  "construccion",
  "revision",
  "verificacion",
  "aprobacion",
  "necesita-humano",
  "hecho",
  "descartada",
] as const;

export type Estado = (typeof ESTADOS)[number]

export const esEstado = (x: unknown): x is Estado =>
  typeof x === "string" && (ESTADOS as readonly string[]).includes(x);

export type Veredicto = "aprobada" | "rechazada"

export type Tarea = {
  id: string
  titulo: string
  estado: Estado
  vueltas: number
  verificacion: "pendiente" | "ok" | "fallo"
  aprobacionAgente: "pendiente" | "aprobada" | "rechazada"
  /** Si la última verificación corrió las pruebas unitarias o Jev decidió que no hacían falta. */
  pruebas?: "omitidas" | "corridas" | "innecesarias"
  rama?: string
  worktree?: string
  motivo?: string
  creada?: string
  actualizada?: string
  enAprobacionDesde?: string
  veredictoExterno?: { veredicto: Veredicto; motivo: string; por: string }
  /** La respuesta de un humano a una tarea en "necesita-humano", si es posterior al bloqueo. */
  respuesta?: { texto: string; por: string; fecha: string }
  /** La rama activa en la raíz cuando se creó su worktree: de ahí sale y ahí se integra. */
  ramaOrigen?: string
  /** El commit de su rama de origen después de integrarla, al pasar a hecho. */
  integrada?: string
  /** Las tareas que tienen que estar hechas e integradas antes de que esta arranque. */
  dependeDe: string[]
  /** La sesión de Claude Code que la está trabajando, y hasta cuándo. */
  tomadaPor?: string
  tomadaHasta?: string
  /** Los .sql de la tarea que nadie verificó: config no trae `sql`. */
  sqlSinVerificar?: number
  /** Si nació de un hallazgo MENOR de otra tarea: su id, para no ofrecerlo dos veces. */
  origenHallazgo?: string
  /** Por dónde entró, si entró por la Entrada: `formulario`, o el issue (`github:dueno/repo#132`). */
  origenEntrada?: string
  /**
   * El título lo escribió otra persona (el de un issue suyo, sin cambiar). Lo que habla en voz alta
   * de la tarea (el teléfono, ella) dice solo su id: hasta la Entrada, los títulos eran de él.
   */
  tituloAjeno?: boolean
  /** Si salió de un documento de requerimientos: su ruta en `factory/requerimientos/`. */
  documento?: string
  /** Con qué modelo se escribe su spec, si él lo eligió para esta tarea (`modelo_spec`). Manda sobre el de la línea. */
  modeloSpec?: ModeloDeRol
  /**
   * Con qué modelo se construye, si él lo eligió para esta tarea (`modelo_construccion`). Manda
   * sobre el de la línea y sobre Jev, también en cada vuelta de retrabajo.
   */
  modeloConstruccion?: ModeloDeRol
  /** Si el agente de salida pidió su clic para producción (`salida: tu-clic`): el motivo, o "" sin motivo. */
  pideSuClic?: string
  /**
   * Si la tarea aprobada es sencilla (se integra sola) o grande (espera su prueba), y por qué
   * (`integracion_clase`, `integracion_motivo`). La escribe el mod.
   */
  integracion?: { clase: "sencilla" | "grande"; motivo: string; por: "regla" | "jev" | "sin_jev" }
  archivo: string
}

/** Un hallazgo MENOR de una tarea terminada, para la vista de deuda. */
export type HallazgoDeDeuda = {
  /** Estable: sale de la tarea y del texto del hallazgo. */
  id: string
  tarea: string
  tituloDeLaTarea: string
  /** Bajo qué revisor estaba: Código, Seguridad, UI… */
  revisor: string | null
  /** `ruta:línea`, si el hallazgo la dice. */
  donde: string | null
  texto: string
  /** La tarea que se creó de él, si ya se creó. */
  convertidoEn: string | null
}

export type Evento = {
  ts: string
  tarea: string
  de: Estado | null
  a: Estado
  agente?: string
  nota?: string
  /** En una verificación: si se corrieron las pruebas unitarias. */
  pruebas?: "omitidas" | "corridas" | "innecesarias"
  /** Lo que la fábrica decidió no hacer (`test`, `revision_seguridad`…). */
  saltado?: string[]
  /** La probabilidad que dio Jev, si se le preguntó. */
  jev?: number
  /** Si lo hizo otro agente (Codex, Antigravity): quién, cuánto tardó, sus tokens y si salió bien. */
  externo?: { quien: "codex" | "antigravity"; segundos: number; tokens: number | null; ok: boolean }
}

export type Config = {
  build: string
  test: string
  lint: string
  ramaBase: string
  /** La rama donde trabaja él: de ahí salen las tareas y ahí se integran. Vacía: la activa en la raíz. */
  ramaTrabajo: string
  maxVueltas: number
  paraleloMax: number
  ui: string
  aprobacion: "agente" | "externa" | "ambas"
  puenteUrl: string
  /** `auto`: al terminar, la tarea se integra sola en su rama de origen. `manual`: la integra el usuario. */
  integracion: "auto" | "manual"
  /** Con qué modelo de Claude se escribe la spec (`modelo_spec`), o `inherit`: el de la corrida. */
  modeloSpec: ModeloDeRol
  /**
   * Con qué modelo de Claude se construye (`modelo_construccion`), o `inherit`: el de la corrida.
   * En las tareas simples, Jev puede abaratarlo a Sonnet (`decidir(T, "construccion")`).
   */
  modeloConstruccion: ModeloDeRol
  /** Con qué modelo de Claude se aprueba (`modelo_aprobacion`); Opus si no dice. */
  modeloAprobacion: ModeloDeRol
}

export type Instantanea = {
  raiz: string
  esDemo: boolean
  config: Config | null
  tareas: Tarea[]
  eventos: Evento[]
  /** Los hallazgos MENORES de las tareas terminadas. */
  deuda: HallazgoDeDeuda[]
  /** La rama activa del proyecto: de ahí salen las tareas nuevas y ahí se integran. `null` sin git o en detached HEAD. */
  ramaActual: string | null
  leidaEn: string
}
