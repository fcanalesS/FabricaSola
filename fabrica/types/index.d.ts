// Contrato de los valores que el plugin fabrica guarda en la sesión ($.state).

export type Estado =
  | 'pendiente' | 'spec' | 'construccion' | 'revision' | 'verificacion' | 'aprobacion'
  | 'necesita-humano' | 'hecho' | 'descartada'

/** Una tarea tal como el tablero la dibuja: el frontmatter de factory/tareas/<id>.md. */
export type Tarea = {
  id: string
  titulo: string
  estado: Estado
  vueltas: number
  verificacion: 'pendiente' | 'ok' | 'fallo'
  /** Si la última verificación corrió las pruebas unitarias, si Jev las saltó (`omitidas`: falta correrlas) o si no hacían falta (solo documentación). */
  pruebas?: 'omitidas' | 'corridas' | 'innecesarias'
  rama?: string
  motivo?: string
  actualizada?: string
  enAprobacionDesde?: string
  /** La rama que estaba activa en la raíz cuando se creó su worktree: de ahí sale, contra ella se compara y en ella se integra. */
  ramaOrigen?: string
  /** El commit de la rama de origen después de integrarla. */
  integrada?: string
  /** Las tareas que tienen que estar hechas e integradas antes de que esta arranque. */
  dependeDe: string[]
  /** La sesión de Claude Code que la está trabajando, y hasta cuándo. */
  tomadaPor?: string
  tomadaHasta?: string
  /** Los .sql de la tarea que nadie verificó porque config no trae `sql`. */
  sqlSinVerificar?: number
  /** Con qué modelo se escribe su spec, si él lo eligió para esta tarea (`modelo_spec`). Manda sobre el de config. */
  modeloSpec?: 'inherit' | 'haiku' | 'sonnet' | 'opus' | 'fable'
  /** Con qué modelo se construye, si él lo eligió para esta tarea (`modelo_construccion`). Manda sobre el de config y sobre Jev. */
  modeloConstruccion?: 'inherit' | 'haiku' | 'sonnet' | 'opus' | 'fable'
  /** Si el agente aprobador ya la aprobó en esta vuelta: no se lo lanza otra vez. */
  aprobadaPorElAgente?: true
  /** Si es sencilla (se integra sola) o grande (espera la prueba de la persona), una vez aprobada. */
  integracion?: 'sencilla' | 'grande'
  archivo: string
  // Solo cuando la aprobación es externa: lo que dejó el orquestador de fuera.
  veredictoExterno?: 'aprobada' | 'rechazada'
}

/** Una línea de factory/eventos.jsonl. */
export type Evento = {
  ts: string
  tarea: string
  de: Estado | null
  a: Estado
  agente?: string
  nota?: string
  /** En una verificación: si se corrieron las pruebas unitarias. */
  pruebas?: 'omitidas' | 'corridas' | 'innecesarias'
  /** Lo que la fábrica decidió no hacer (`test`, `revision_seguridad`…), para el informe. */
  saltado?: string[]
  /** La probabilidad que dio Jev, si se le preguntó, para medir su umbral. */
  jev?: number
  /** Si lo hizo otro agente (Codex, Antigravity): quién, cuánto tardó, sus tokens y si salió bien. */
  externo?: { quien: 'codex' | 'antigravity'; segundos: number; tokens: number | null; ok: boolean }
}

declare module 'claude-code' {
  interface PluginState {
    // `raiz`: la carpeta del proyecto cuyo factory/ se está mirando; vacía si no hay.
    fabrica: {
      raiz: string
      tareas: Tarea[]
      eventos: Evento[]
    }
  }
}
