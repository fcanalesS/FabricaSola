// Lógica pura de la fábrica: leer y escribir las tareas en Markdown, la configuración del
// proyecto y las reglas de transición. Sin `$`: todo lo que toca disco vive en register.tsx,
// para que esto se pruebe con texto.
import type { Estado, Evento, Tarea } from '../types'
import { topesDesde } from './integracion'

export const ESTADOS: readonly Estado[] = [
  'pendiente', 'spec', 'construccion', 'revision', 'verificacion', 'aprobacion',
  'necesita-humano', 'hecho', 'descartada',
]

// Hacia dónde puede ir cada estado. Volver a `construccion` desde revisión, verificación o
// aprobación es una vuelta de retrabajo; `necesita-humano` es la salida de emergencia de
// cualquier etapa activa, y desde ahí el humano la devuelve a donde quiera.
const SALIDAS: Record<Estado, readonly Estado[]> = {
  pendiente: ['spec', 'necesita-humano', 'descartada'],
  spec: ['construccion', 'necesita-humano', 'descartada'],
  construccion: ['revision', 'necesita-humano', 'descartada'],
  revision: ['verificacion', 'construccion', 'necesita-humano'],
  verificacion: ['aprobacion', 'construccion', 'necesita-humano'],
  aprobacion: ['hecho', 'construccion', 'necesita-humano'],
  // A sí misma: volver a preguntar cuando la respuesta no alcanzó. Cambia el motivo y la fecha, así
  // la respuesta anterior deja de contar como nueva.
  'necesita-humano': ['pendiente', 'spec', 'construccion', 'revision', 'verificacion', 'aprobacion', 'necesita-humano', 'descartada'],
  hecho: [],
  descartada: ['pendiente'],
}

const RETRABAJO: readonly Estado[] = ['revision', 'verificacion', 'aprobacion']

export const esEstado = (x: unknown): x is Estado => typeof x === 'string' && (ESTADOS as readonly string[]).includes(x)

// ---- Frontmatter -------------------------------------------------------------------------

export type Datos = Record<string, string>

/** Separa el frontmatter plano (`clave: valor`) del cuerpo. Sin frontmatter, datos vacíos. */
export function partir(texto: string): { datos: Datos; cuerpo: string } {
  const t = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(t)
  if (!m) return { datos: {}, cuerpo: t }
  const datos: Datos = {}
  for (const linea of (m[1] ?? '').split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(linea)
    if (!kv) continue
    let v = (kv[2] ?? '').trim()
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
      // Comillas dobles: como las escribe `unir` (JSON), con sus escapes.
      try { v = JSON.parse(v) as string } catch { v = v.slice(1, -1) }
    } else if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) {
      v = v.slice(1, -1)
    }
    datos[kv[1]!] = v
  }
  return { datos, cuerpo: m[2] ?? '' }
}

const necesitaComillas = (v: string) => v === '' || /[:#"'\n]|^\s|\s$/.test(v)

/** Vuelve a unir frontmatter y cuerpo, en el orden en que vienen las claves. */
export function unir(datos: Datos, cuerpo: string): string {
  const lineas = Object.entries(datos).map(([k, v]) =>
    `${k}: ${necesitaComillas(v) ? JSON.stringify(v.replace(/\n/g, ' ')) : v}`)
  return `---\n${lineas.join('\n')}\n---\n${cuerpo.startsWith('\n') ? cuerpo : '\n' + cuerpo}`
}

/** Añade una línea a la sección `## Bitácora`, creándola al final si no existe. */
/** Dónde empieza y termina el contenido de una sección `## nombre`, o `null` si no está. */
function limitesDeSeccion(cuerpo: string, nombre: string): { desde: number; hasta: number } | null {
  const m = new RegExp(`^## ${nombre}[ \\t]*$`, 'm').exec(cuerpo)
  if (!m) return null
  const desde = m.index + m[0].length
  const sig = cuerpo.slice(desde).search(/^## /m)
  return { desde, hasta: sig < 0 ? cuerpo.length : desde + sig }
}

/** El texto de una sección, sin los marcadores `_(…)_` que dejan las plantillas. Vacío si no está. */
export function seccion(cuerpo: string, nombre: string): string {
  const l = limitesDeSeccion(cuerpo, nombre)
  return l ? cuerpo.slice(l.desde, l.hasta).replace(/^_\(.*\)_$/gm, '').trim() : ''
}

/** Reemplaza el contenido de una sección `## nombre`; si no está, la agrega al final. */
export function ponerSeccion(cuerpo: string, nombre: string, texto: string): string {
  const l = limitesDeSeccion(cuerpo, nombre)
  if (!l) return `${cuerpo.replace(/\s*$/, '')}\n\n## ${nombre}\n\n${texto.trim()}\n`
  return `${cuerpo.slice(0, l.desde)}\n\n${texto.trim()}\n\n${cuerpo.slice(l.hasta).replace(/^\s*/, '')}`
}

/**
 * Como `ponerSeccion`, pero una sección nueva va antes de `## Bitácora`, que queda al final: así se
 * lee primero lo que hay que leer. Si ya existe, se reemplaza donde está.
 */
export function ponerSeccionAntesDeLaBitacora(cuerpo: string, nombre: string, texto: string): string {
  if (limitesDeSeccion(cuerpo, nombre)) return ponerSeccion(cuerpo, nombre, texto)
  const m = /^## Bitácora[ \t]*$/m.exec(cuerpo)
  if (!m) return ponerSeccion(cuerpo, nombre, texto)
  return `${cuerpo.slice(0, m.index).replace(/\s*$/, '')}\n\n## ${nombre}\n\n${texto.trim()}\n\n${cuerpo.slice(m.index)}`
}

/**
 * Una línea más en `## Veredicto`: quién, cuándo, qué y por qué. La primera reemplaza el
 * «_(pendiente)_» de la plantilla; las de otras vueltas se suman debajo.
 */
export function anotarVeredicto(cuerpo: string, linea: string): string {
  const previo = seccion(cuerpo, 'Veredicto')
  return ponerSeccionAntesDeLaBitacora(cuerpo, 'Veredicto', [previo, linea].filter(Boolean).join('\n'))
}

export function anotar(cuerpo: string, linea: string): string {
  const marca = /^## Bitácora[ \t]*$/m
  if (!marca.test(cuerpo)) return `${cuerpo.replace(/\s*$/, '')}\n\n## Bitácora\n\n- ${linea}\n`
  // Va al final de la sección: justo antes del siguiente `## ` o al final del archivo.
  const inicio = cuerpo.search(marca)
  const resto = cuerpo.slice(inicio + 1)
  const sig = resto.search(/^## /m)
  const fin = sig < 0 ? cuerpo.length : inicio + 1 + sig
  const antes = cuerpo.slice(0, fin).replace(/\s*$/, '')
  const despues = cuerpo.slice(fin)
  return `${antes}\n- ${linea}\n${despues ? '\n' + despues : ''}`
}

// ---- Configuración del proyecto -----------------------------------------------------------

export type Aprobacion = 'agente' | 'externa' | 'ambas'

// ---- Roles: qué agente hace cada etapa ------------------------------------------------------

// Con `auto`, un rol usa el agente de la fábrica, que ya trae su oficio (fabrica/oficios/).
export const ROLES = {
  spec: { clave: 'agente_spec', nombre: 'Especificación', preferidos: [], defecto: 'fabrica:spec-escritor', archivo: 'spec-escritor' },
  construccion: { clave: 'agente_construccion', nombre: 'Construcción', preferidos: [], defecto: 'fabrica:constructor', archivo: 'constructor' },
  revision_codigo: { clave: 'agente_revision_codigo', nombre: 'Revisión de código', preferidos: [], defecto: 'fabrica:revisor-codigo', archivo: 'revisor-codigo' },
  revision_seguridad: { clave: 'agente_revision_seguridad', nombre: 'Revisión de seguridad', preferidos: [], defecto: 'fabrica:revisor-seguridad', archivo: 'revisor-seguridad' },
  ui: { clave: 'agente_ui', nombre: 'Revisión de UI/UX', preferidos: [], defecto: 'fabrica:revisor-ui', archivo: 'revisor-ui' },
  aprobacion: { clave: 'agente_aprobacion', nombre: 'Aprobación', preferidos: [], defecto: 'fabrica:aprobador', archivo: 'aprobador' },
} as const satisfies Record<string, { clave: string; nombre: string; preferidos: readonly string[]; defecto: string; archivo: string }>

export type Rol = keyof typeof ROLES
export const NOMBRES_DE_ROL = Object.keys(ROLES) as Rol[]
export const esRol = (x: unknown): x is Rol => typeof x === 'string' && x in ROLES

/** Un nombre de agente válido: `nombre` o `plugin:nombre`, en minúsculas, dígitos y guiones. */
export const esNombreDeAgente = (x: string) => /^[a-z0-9][a-z0-9-]*(:[a-z0-9][a-z0-9-]*)?$/.test(x)

/** El nombre que lleva la copia editable del agente de fábrica de un rol. */
export const nombreDeCopia = (rol: Rol) => `fabrica-${ROLES[rol].archivo}`

/**
 * Los agentes a probar para un rol, en orden: el orquestador usa el primero que exista entre
 * sus tipos de agente. El de fábrica va siempre al final, como red.
 */
export function candidatos(rol: Rol, valor: string): string[] {
  const r = ROLES[rol]
  // Un agente de un mod que la corrida no carga (en las de la aplicación, los de CLAUDE_CODE_PLUGIN_DIRS) le llega con
  // `--agents`, con su nombre sin el del plugin: se prueba también así.
  const sinPlugin = (n: string) => (n.includes(':') ? [n, n.split(':')[1]!] : [n])
  const lista = valor === 'auto' ? [...r.preferidos, r.defecto] : [...sinPlugin(valor), r.defecto]
  return [...new Set(lista)]
}

/** Los modelos que se le pueden pedir a un agente; `inherit`, el de la sesión que corre la fábrica. */
export const MODELOS = ['inherit', 'haiku', 'sonnet', 'opus', 'fable'] as const
export type Modelo = (typeof MODELOS)[number]
/** Los roles a los que se les puede fijar un modelo, con su clave en config.md. La construcción la ajusta además Jev. */
export const ROLES_CON_MODELO = { spec: 'modelo_spec', construccion: 'modelo_construccion', revision: 'modelo_revision', aprobacion: 'modelo_aprobacion' } as const
export type RolConModelo = keyof typeof ROLES_CON_MODELO
/**
 * La nota del camino de una tarea cuando se lanza su agente de spec: con qué modelo. Sin `model`, o
 * con `inherit`, es el de la corrida. Un nombre que no es de Claude se dice tal cual si tiene forma
 * de nombre de modelo; si no, no se copia.
 */
export function notaDelModeloDeSpec(modelo: unknown): string {
  const m = typeof modelo === 'string' ? modelo.trim() : ''
  if (!m || m === 'inherit') return 'spec con el modelo de la corrida'
  return /^[a-z0-9][a-z0-9.-]{0,40}$/i.test(m) ? `spec con ${m}` : 'spec con un modelo de nombre desconocido'
}
/**
 * Lo que contesta `decidir(T, "spec")` cuando él eligió con qué modelo escribir la spec de esa
 * tarea: la spec se escribe siempre (Jev no la salta), con Claude y con ese modelo. `null` si no
 * eligió ninguno. Solo Claude: un modelo suyo manda también en una línea que escribe con Antigravity.
 */
export function specElegidaPorEl(id: string, datos: Datos): string | null {
  const m = datos.modelo_spec
  if (!esModelo(m)) return null
  const conQue = m === 'inherit' ? 'sin `model` (el de la corrida)' : `con model: "${m}"`
  return `${id}: SÍ hace falta el agente de spec — él eligió con qué modelo escribirla. Lanza el agente de spec ${conQue}, no con el de config.`
}

/**
 * Lo que contesta `decidir(T, "construccion")` cuando él eligió con qué modelo construir esa tarea:
 * ese modelo, sin preguntarle a Jev y sin abaratarlo, en cada vuelta. `null` si no eligió ninguno:
 * entonces decide como siempre (el de config, y Jev abarata las tareas simples).
 */
export function construccionElegidaPorEl(id: string, datos: Datos): { result: string; nota: string } | null {
  const m = datos.modelo_construccion
  if (!esModelo(m)) return null
  const conQue = m === 'inherit' ? 'el modelo de la corrida (sin `model`)' : `model: "${m}"`
  return {
    result: `${id}: construye con ${conQue} — él lo eligió para esta tarea. No lo cambies por el de config ni por uno más barato.`,
    nota: `construcción con ${m === 'inherit' ? 'el modelo de la corrida' : m}: lo eligió él para esta tarea`,
  }
}

/**
 * Si el último evento de esa tarea en eventos.jsonl ya dice esa nota. Un lanzamiento que se
 * reintenta (el agente con habilidades no estaba, va el de siempre) no la anota dos veces; otra
 * vuelta de spec sí, porque antes hubo otro paso.
 */
export function yaAnotado(eventos: string, tarea: string, nota: string): boolean {
  const lineas = eventos.split('\n')
  for (let i = lineas.length - 1; i >= 0; i--) {
    const l = lineas[i]!.trim()
    if (!l) continue
    try {
      const e = JSON.parse(l) as { tarea?: unknown; nota?: unknown }
      if (e.tarea === tarea) return e.nota === nota
    } catch {
      // Una línea rota no es de nadie.
    }
  }
  return false
}
/** De más barato a más caro: cuando Jev pide abaratar, se queda el más barato de los dos. `inherit` no se sabe. */
const PRECIO: Record<Modelo, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3, inherit: 2 }
export const masBarato = (a: Modelo, b: Modelo): Modelo => (PRECIO[a] <= PRECIO[b] ? a : b)
/** El modelo de un rol si config no lo dice. La aprobación en Opus: lo decidió él el 27 de octubre de 2026. */
const POR_DEFECTO: Partial<Record<RolConModelo, Modelo>> = { spec: 'opus', revision: 'sonnet', aprobacion: 'opus' }
const esModelo = (v: string | undefined): v is Modelo => !!v && (MODELOS as readonly string[]).includes(v)

export type Config = {
  build: string
  test: string
  lint: string
  ramaBase: string
  /**
   * La rama donde trabaja el usuario: de ahí salen las tareas y ahí se integran. Vacía: la que tenga
   * activa la raíz al crear cada worktree. Nunca una protegida (`RAMAS_PROTEGIDAS`).
   */
  ramaTrabajo: string
  maxVueltas: number
  paraleloMax: number
  ui: 'auto' | 'si' | 'no'
  aprobacion: Aprobacion
  puenteUrl: string
  worktrees: string
  /** Por rol: `auto` o el nombre del agente que lo hace. */
  agentes: Record<Rol, string>
  /** `auto`: Jev decide qué pruebas y revisiones hacen falta, si hay clave. `no`: se corre todo siempre. */
  jev: 'auto' | 'no'
  /** Una muestra de control cada tantas veces que Jev diría «sáltalo» en pruebas o seguridad. 0: nunca. */
  jevControl: number
  /**
   * El modelo de cada rol. `inherit`: el de la corrida. Si config no dice otra cosa, la spec va en
   * Opus (solo se escribe para pedidos vagos, y probado contra Fable dio lo mismo por mucho menos),
   * los revisores en Sonnet y el resto con el de la corrida.
   */
  modelos: Record<RolConModelo, Modelo>
  /**
   * Quién revisa el código y quién escribe la spec, además de Claude. `codex` y `antigravity` mandan
   * código del proyecto a OpenAI o a Google: vienen apagados y se encienden proyecto por proyecto.
   */
  revisorCodigo: 'claude' | 'codex' | 'ambos'
  escritorSpec: 'claude' | 'antigravity'
  /** Las extensiones que lintea `{archivos}` (`.js`, `.ts`…). Vacía: todos los archivos de la tarea. */
  lintExtensiones: string[]
  /** El comando que revisa los .sql de la tarea, con `{archivos}`. Vacío: quedan sin verificar, y se dice. */
  sql: string
  /** `auto`: al pasar a hecho, la tarea se integra con fast-forward en su rama de origen. `manual`: la integra el usuario. */
  integracion: 'auto' | 'manual'
  /** Desde cuántas líneas o archivos cambiados una tarea aprobada es grande (`grande_lineas`, `grande_archivos`). */
  grande: { lineas: number; archivos: number }
}

/** `.js, ts .CSS` → `['.js', '.ts', '.css']`. */
export function extensiones(v: string | undefined): string[] {
  return [...new Set((v ?? '').split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean).map(x => (x.startsWith('.') ? x : `.${x}`)))]
}

const entero = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

export function leerConfig(texto: string | undefined): Config {
  const d = texto ? partir(texto).datos : {}
  const ui = d.ui === 'si' || d.ui === 'no' ? d.ui : 'auto'
  const aprobacion: Aprobacion = d.aprobacion === 'externa' || d.aprobacion === 'ambas' ? d.aprobacion : 'agente'
  return {
    build: d.build ?? '',
    test: d.test ?? '',
    lint: d.lint ?? '',
    ramaBase: d.rama_base || 'main',
    ramaTrabajo: (d.rama_trabajo ?? '').trim(),
    maxVueltas: entero(d.max_vueltas, 3, 1, 10),
    paraleloMax: entero(d.paralelo_max, 2, 1, 6),
    ui,
    aprobacion,
    puenteUrl: /^https?:\/\//.test(d.puente_url ?? '') ? d.puente_url! : '',
    worktrees: d.worktrees ?? '',
    jev: d.jev === 'no' ? 'no' : 'auto',
    jevControl: entero(d.jev_control, 4, 0, 50),
    revisorCodigo: d.revisor_codigo === 'codex' || d.revisor_codigo === 'ambos' ? d.revisor_codigo : 'claude',
    escritorSpec: d.escritor_spec === 'antigravity' ? 'antigravity' : 'claude',
    lintExtensiones: extensiones(d.lint_extensiones),
    sql: d.sql ?? '',
    integracion: d.integracion === 'manual' ? 'manual' : 'auto',
    grande: topesDesde(d),
    modelos: Object.fromEntries(
      (Object.entries(ROLES_CON_MODELO) as [RolConModelo, string][]).map(([rol, clave]) => {
        const v = d[clave]?.trim()
        return [rol, esModelo(v) ? v : (POR_DEFECTO[rol] ?? 'inherit')]
      }),
    ) as Record<RolConModelo, Modelo>,
    agentes: Object.fromEntries(NOMBRES_DE_ROL.map(rol => {
      const v = (d[ROLES[rol].clave] ?? '').trim()
      return [rol, v && v !== 'auto' && esNombreDeAgente(v) ? v : 'auto']
    })) as Record<Rol, string>,
  }
}

/** Pone `clave: valor` en el frontmatter de config.md, conservando el resto del archivo. */
export function fijarEnConfig(texto: string, clave: string, valor: string): string {
  const { datos, cuerpo } = partir(texto)
  return unir({ ...datos, [clave]: valor }, cuerpo)
}

/** Cambia el `name:` del frontmatter de un agente (para su copia editable). */
export function renombrarAgente(texto: string, nombre: string): string {
  const { datos, cuerpo } = partir(texto)
  return unir({ ...datos, name: nombre }, cuerpo)
}

export const pideAgente = (c: Config) => c.aprobacion === 'agente' || c.aprobacion === 'ambas'
export const pideExterna = (c: Config) => c.aprobacion === 'externa' || c.aprobacion === 'ambas'

// ---- Tareas -------------------------------------------------------------------------------

const verif = (v: string | undefined): Tarea['verificacion'] => (v === 'ok' || v === 'fallo' ? v : 'pendiente')

export function tareaDesde(texto: string, archivo: string): Tarea | undefined {
  const { datos } = partir(texto)
  if (!datos.id) return undefined
  return {
    id: datos.id,
    titulo: datos.titulo ?? datos.id,
    estado: esEstado(datos.estado) ? datos.estado : 'pendiente',
    vueltas: entero(datos.vueltas, 0, 0, 99),
    verificacion: verif(datos.verificacion),
    ...(datos.pruebas === 'omitidas' || datos.pruebas === 'corridas' || datos.pruebas === 'innecesarias' ? { pruebas: datos.pruebas } : {}),
    rama: datos.rama || undefined,
    motivo: datos.motivo || undefined,
    actualizada: datos.actualizada || undefined,
    enAprobacionDesde: datos.en_aprobacion_desde || undefined,
    ramaOrigen: datos.rama_origen || undefined,
    integrada: datos.integrada || undefined,
    dependeDe: dependenciasDe(datos),
    tomadaPor: datos.tomada_por || undefined,
    tomadaHasta: datos.tomada_hasta || undefined,
    ...(Number(datos.sql_sin_verificar) > 0 ? { sqlSinVerificar: Number(datos.sql_sin_verificar) } : {}),
    ...(esModelo(datos.modelo_spec) ? { modeloSpec: datos.modelo_spec } : {}),
    ...(esModelo(datos.modelo_construccion) ? { modeloConstruccion: datos.modelo_construccion } : {}),
    ...(datos.estado === 'aprobacion' && datos.aprobacion_agente === 'aprobada' ? { aprobadaPorElAgente: true as const } : {}),
    ...(datos.integracion_clase === 'sencilla' || datos.integracion_clase === 'grande' ? { integracion: datos.integracion_clase } : {}),
    archivo,
  }
}

/** `depende_de: F-009, F-007` → `['F-009', 'F-007']`. Lo que no tiene forma de id se ignora. */
export function dependenciasDe(datos: Datos): string[] {
  return idsEn(datos.depende_de ?? '')
}

/** Los ids de tarea que aparecen en un texto, sin repetir y en orden. */
export const idsEn = (texto: string): string[] => [...new Set(texto.match(/\bF-\d+\b/g) ?? [])]

/** Si un veredicto escrito en `mtimeMs` vale para una tarea que entró en aprobación en `desde`. */
export function vigente(mtimeMs: number, desde: string | undefined): boolean {
  if (!desde) return true
  const t = Date.parse(desde)
  return !Number.isFinite(t) || mtimeMs >= t
}

/** `F-001`, `F-002`…: el siguiente número libre entre los ids que ya hay. */
export function siguienteId(ids: readonly string[]): string {
  const max = ids.reduce((m, id) => {
    const n = /^F-(\d+)$/.exec(id)?.[1]
    return n ? Math.max(m, Number(n)) : m
  }, 0)
  return `F-${String(max + 1).padStart(3, '0')}`
}

export function slug(titulo: string): string {
  return titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tarea'
}

// ---- Transiciones -------------------------------------------------------------------------

export type Movimiento = {
  a: Estado
  nota?: string
  agente?: string
  ahora: string
  // Lo que dejó el orquestador externo para esta tarea, si dejó algo.
  veredictoExterno?: 'aprobada' | 'rechazada'
  /** La sesión que la mueve. Sin ella no se toma ni se comprueba quién la tiene. */
  sesion?: string
  /** La rama activa en la raíz al crear el worktree. Se guarda la primera vez y no se pisa en el retrabajo. */
  ramaOrigen?: string
  /** Al sacarla de `pendiente`: cómo están las tareas de las que depende. */
  dependencias?: readonly EstadoDeDependencia[]
  /** Al sacarla de `pendiente`: las tareas anteriores con las que comparte archivos y que no están integradas. */
  esperaPorArchivos?: readonly Choque[]
  /** Al pasar a aprobación: si su worktree tiene que haberse sincronizado con la rama de origen. */
  requiereSincronizar?: boolean
  /** Al pasar a aprobación: el conflicto que sigue sin resolver en el worktree, si hay uno. */
  conflicto?: string
  /** Al salir de revisión: cuántos BLOQUEANTES dejaron los revisores en sus hallazgos. */
  bloqueantes?: number
  /** Al mandarla a un humano porque no se pudo integrar: por qué, si es mecánico. */
  bloqueo?: Bloqueo
}

/**
 * Cómo se retoma sola una tarea que no se integró, si lo que la frenaba ya no pasa: `integrar`
 * (a aprobación y a hecho, con los veredictos que tenía) o `sincronizar` (a verificación, para
 * traer lo nuevo de su rama). `null` si sigue igual. Es lógica pura.
 */
export function reintentoDeIntegracion(bloqueo: Bloqueo, ahora: { ramaActual: string; ramaOrigen: string; suciosQueToca: readonly string[] }): 'integrar' | 'sincronizar' | null {
  if (bloqueo === 'avanzo') return 'sincronizar'
  if (bloqueo === 'rama') return ahora.ramaActual && ahora.ramaActual === ahora.ramaOrigen ? 'integrar' : null
  return ahora.suciosQueToca.length ? null : 'integrar'
}

export type EstadoDeDependencia = { id: string; estado: Estado | 'no-existe'; integrada: boolean }
export type Choque = { con: string; archivos: string[] }

/** Cuánto dura la toma de una tarea por una sesión: se renueva con cada movimiento. */
export const TOMA_MS = 30 * 60_000
const LIBERAN: readonly Estado[] = ['hecho', 'descartada', 'necesita-humano', 'pendiente']

/** Quién tiene la tarea, si es otra sesión y la toma no venció. */
export function tomadaPorOtra(datos: Datos, sesion: string | undefined, ahora: string): { por: string; hasta: string } | null {
  const por = datos.tomada_por?.trim()
  const hasta = datos.tomada_hasta?.trim() ?? ''
  if (!sesion || !por || por === sesion) return null
  const vence = Date.parse(hasta)
  return Number.isFinite(vence) && vence > Date.parse(ahora) ? { por, hasta } : null
}

/**
 * Los datos de una tarea sin la toma de esta sesión, o `null` si no es suya. Al cerrarse una
 * sesión, lo que tenía queda libre: si no, la corrida siguiente esperaría media hora.
 */
export function liberadaPor(datos: Datos, sesion: string): Datos | null {
  if (!sesion || datos.tomada_por?.trim() !== sesion) return null
  return { ...datos, tomada_por: '', tomada_hasta: '' }
}

/**
 * Lo que falta para que una tarea salga de `pendiente` por sus dependencias. `listas`: puede
 * arrancar. `descartadas`: alguna no se va a hacer nunca, y la tarea va a un humano.
 */
export function revisarDependencias(deps: readonly EstadoDeDependencia[], cfg: Pick<Config, 'integracion'>) {
  const descartadas = deps.filter(d => d.estado === 'descartada' || d.estado === 'no-existe')
  // Con integración manual nunca queda `integrada`: basta con que esté hecha.
  const esperando = deps.filter(d => !descartadas.includes(d) && !(d.estado === 'hecho' && (d.integrada || cfg.integracion === 'manual')))
  return { listas: !descartadas.length && !esperando.length, descartadas, esperando }
}

export type Resultado =
  | { ok: true; datos: Datos; evento: Evento; forzado?: string }
  | { ok: false; error: string }

/**
 * Aplica un cambio de estado a los datos de una tarea. Decide aquí, no el modelo: qué
 * transición vale, cuándo una vuelta de más manda la tarea a un humano y qué hace falta
 * para darla por hecha.
 */
export function mover(datos: Datos, mov: Movimiento, cfg: Config): Resultado {
  const de: Estado = esEstado(datos.estado) ? datos.estado : 'pendiente'
  let a = mov.a
  if (!SALIDAS[de].includes(a)) {
    const validas = SALIDAS[de].join(', ') || '(ninguna: es un estado final)'
    return { ok: false, error: `De "${de}" no se puede pasar a "${a}". Desde ahí: ${validas}.` }
  }
  const nuevo: Datos = { ...datos }
  let forzado: string | undefined
  let nota = mov.nota?.trim() || undefined

  const otra = tomadaPorOtra(datos, mov.sesion, mov.ahora)
  if (otra) return { ok: false, error: `${datos.id ?? 'La tarea'} la está trabajando otra sesión (${otra.por}) hasta ${otra.hasta}. No la muevas: espera a que termine o a que venza.` }

  if (a === 'necesita-humano' && !nota) {
    return { ok: false, error: 'Para mandar una tarea a un humano hace falta `nota` con el motivo.' }
  }
  if (de === 'pendiente' && a === 'spec') {
    const deps = revisarDependencias(mov.dependencias ?? [], cfg)
    if (deps.descartadas.length) {
      // Como al pasarse de vueltas: lo decide la fábrica, y lo lee un humano.
      a = 'necesita-humano'
      forzado = `Depende de ${deps.descartadas.map(d => `${d.id} (${d.estado === 'no-existe' ? 'no existe' : 'descartada'})`).join(', ')}: no puede hacerse así. Decide si se quita la dependencia o se descarta.`
      nota = forzado
    } else if (deps.esperando.length) {
      return { ok: false, error: `Esperando a ${deps.esperando.map(d => `${d.id} (${d.estado === 'hecho' ? 'hecha, sin integrar' : d.estado})`).join(', ')}: depende de ${deps.esperando.length === 1 ? 'ella' : 'ellas'}. Sigue en pendiente.` }
    } else if (mov.esperaPorArchivos?.length) {
      const c = mov.esperaPorArchivos
      return { ok: false, error: `Esperando a ${c.map(x => `${x.con} (comparten ${x.archivos.slice(0, 3).join(', ')}${x.archivos.length > 3 ? '…' : ''})`).join('; ')}: tocan los mismos archivos, y va primero la de id menor. Sigue en pendiente.` }
    }
  }
  // Con un BLOQUEANTE de los revisores, la tarea vuelve a construcción: no sigue a verificar. El
  // 19 de octubre de 2026, F-011 llegó a aprobación con uno de Codex sin resolver.
  if (de === 'revision' && a === 'verificacion' && mov.bloqueantes) {
    return { ok: false, error: `Hay ${mov.bloqueantes} ${mov.bloqueantes === 1 ? 'hallazgo BLOQUEANTE' : 'hallazgos BLOQUEANTES'} en «## Hallazgos de revisión»: devuélvela a construcción con esa nota. Si un revisor se equivocó, corrige la sección antes.` }
  }
  if (a === 'aprobacion' && verif(datos.verificacion) !== 'ok') {
    return { ok: false, error: 'No pasa a aprobación sin verificación en "ok". Corre `verificar` primero.' }
  }
  if (a === 'aprobacion' && mov.conflicto) {
    return { ok: false, error: `No pasa a aprobación con un conflicto sin resolver en el worktree: ${mov.conflicto}.` }
  }
  if (a === 'aprobacion' && mov.requiereSincronizar && !datos.sincronizada) {
    return { ok: false, error: 'No pasa a aprobación sin traer antes la rama de origen: llama a mcp__fabrica__sincronizar.' }
  }
  if (a === 'hecho') {
    const faltan: string[] = []
    if (verif(datos.verificacion) !== 'ok') faltan.push('verificación en "ok"')
    if (pideAgente(cfg) && datos.aprobacion_agente !== 'aprobada') faltan.push('el veredicto "aprobada" del agente aprobador')
    if (pideExterna(cfg) && mov.veredictoExterno !== 'aprobada') faltan.push('el veredicto "aprobada" del orquestador externo (factory/veredictos/<id>.json)')
    // Una grande espera que la persona la pruebe a mano (fabrica/docs/Plan-Integracion.md): su
    // veredicto llega por el mismo camino, y tiene que ser de esta vuelta.
    else if (datos.integracion_clase === 'grande' && mov.veredictoExterno !== 'aprobada')
      faltan.push(`tu prueba a mano: es grande (${datos.integracion_motivo || 'sin motivo'}), y espera tu veredicto "aprobada" desde la aplicación. Déjala en aprobación y sigue con las demás`)
    if (faltan.length) return { ok: false, error: `Falta ${faltan.join(' y ')} para darla por hecha.` }
  }

  if (a === 'construccion') {
    if (RETRABAJO.includes(de)) {
      const vueltas = entero(datos.vueltas, 0, 0, 99) + 1
      nuevo.vueltas = String(vueltas)
      if (vueltas > cfg.maxVueltas) {
        a = 'necesita-humano'
        forzado = `Superó ${cfg.maxVueltas} vueltas de retrabajo.${nota ? ' Último motivo: ' + nota : ''}`
        nota = forzado
      }
    }
    nuevo.verificacion = 'pendiente'
    nuevo.aprobacion_agente = 'pendiente'
    // Sencilla o grande se decide otra vez con lo que cambie en esta vuelta.
    delete nuevo.integracion_clase
    delete nuevo.integracion_por
    delete nuevo.integracion_motivo
    // Lo que cambie en el retrabajo hay que volver a sincronizarlo.
    if (nuevo.sincronizada) nuevo.sincronizada = ''
    if (mov.ramaOrigen?.trim() && !datos.rama_origen) nuevo.rama_origen = mov.ramaOrigen.trim()
  }

  // Un veredicto externo solo vale si llegó después de esto: uno de una vuelta anterior no aprueba.
  // Salvo al reintentar una integración frenada por la raíz o por cambios del usuario: el código de
  // la tarea es el mismo que se aprobó, y sus veredictos siguen valiendo.
  const reintentaIntegrar = de === 'necesita-humano' && (datos.bloqueo === 'rama' || datos.bloqueo === 'sucios')
  if (a === 'aprobacion' && !reintentaIntegrar) nuevo.en_aprobacion_desde = mov.ahora

  if (a === 'necesita-humano') nuevo.motivo = nota ?? ''
  else if (de === 'necesita-humano') nuevo.motivo = ''
  // El motivo mecánico de no integrar se anota al frenarla y se borra al retomarla.
  if (a === 'necesita-humano' && mov.bloqueo) nuevo.bloqueo = mov.bloqueo
  else if (nuevo.bloqueo) nuevo.bloqueo = ''

  // La toma: la sesión que la saca de la cola la tiene media hora, y se renueva con cada paso. Al
  // terminar, al descartarla o al esperar a un humano, queda libre.
  if (LIBERAN.includes(a)) {
    if (nuevo.tomada_por) nuevo.tomada_por = ''
    if (nuevo.tomada_hasta) nuevo.tomada_hasta = ''
  } else if (mov.sesion) {
    nuevo.tomada_por = mov.sesion
    nuevo.tomada_hasta = new Date(Date.parse(mov.ahora) + TOMA_MS).toISOString()
  }

  nuevo.estado = a
  nuevo.actualizada = mov.ahora
  const evento: Evento = { ts: mov.ahora, tarea: datos.id ?? '?', de, a }
  if (mov.agente) evento.agente = mov.agente
  if (nota) evento.nota = nota
  return { ok: true, datos: nuevo, evento, ...(forzado ? { forzado } : {}) }
}

/** Una tarea nueva, lista para escribirse en factory/tareas/<id>-<slug>.md. */
/** Lo que dice `## Para la memoria` mientras ningún agente anotó nada. */
export const PARA_LA_MEMORIA_VACIA = '_(lo que se decidió y conviene recordar en otras tareas; lo anotan los agentes)_'

export function tareaNueva(id: string, titulo: string, pedido: string, ahora: string, dependeDe: readonly string[] = []): string {
  const datos: Datos = {
    id,
    titulo,
    estado: 'pendiente',
    vueltas: '0',
    verificacion: 'pendiente',
    aprobacion_agente: 'pendiente',
    rama: `fabrica/${id}`,
    worktree: '',
    motivo: '',
    ...(dependeDe.length ? { depende_de: dependeDe.join(',') } : {}),
    creada: ahora,
    actualizada: ahora,
  }
  const cuerpo = [
    '', '## Pedido', '', pedido.trim() || titulo, '',
    '## Spec', '', '_(la escribe el agente de especificación)_', '',
    '## Hallazgos de revisión', '', '_(ninguno todavía)_', '',
    '## Veredicto', '', '_(pendiente)_', '',
    '## Para la memoria', '', PARA_LA_MEMORIA_VACIA, '',
    '## Bitácora', '', `- ${ahora} · creada`, '',
  ].join('\n')
  return unir(datos, cuerpo)
}

// ---- Guarda de los campos del mod ---------------------------------------------------------

// Los campos que solo cambia el mod. El resto del archivo (spec, hallazgos, notas) es de los
// agentes y del humano.
const DEL_MOD = [
  'estado', 'vueltas', 'verificacion', 'verificada', 'pruebas', 'aprobacion_agente', 'en_aprobacion_desde',
  'rama_origen', 'sincronizada', 'conflicto', 'integrada', 'tomada_por', 'tomada_hasta', 'sql_sin_verificar', 'node_modules', 'bloqueo',
  'salida', 'salida_motivo', 'integracion_clase', 'integracion_por', 'integracion_motivo',
] as const

// ---- La salida a producción --------------------------------------------------------------------

/** El agente que decide si una tarea pide su clic para producción. Lo arma la aplicación, solo cuando hace falta. */
export const AGENTE_DE_SALIDA = 'fabrica-salida'
export const PLAN_DE_VUELTA = 'Plan de vuelta'
const MOTIVO_DE_SALIDA_MAX = 200
const PLAN_DE_VUELTA_MAX = 4000

/**
 * Lo que deja en la tarea la decisión del agente de salida (fabrica/docs/Plan-Aprobador.md, etapa 4).
 * Solo endurece: `tu-clic` hace que el paso de producción espere a la persona aunque ella lo haya
 * quitado, con su motivo y su plan de vuelta; `sin-objecion` no cambia nada, y nunca desmarca una
 * tarea que ya pedía su clic. Solo sobre una tarea aprobada. Es lógica pura.
 */
export function salidaEnLaTarea(
  datos: Datos,
  cuerpo: string,
  a: { decision: unknown; motivo: unknown; plan: unknown },
  ts: string,
): { datos: Datos; cuerpo: string; nota: string } | { error: string } {
  const aprobada = datos.estado === 'hecho' || (datos.estado === 'aprobacion' && datos.aprobacion_agente === 'aprobada')
  if (!aprobada) return { error: `${datos.id ?? 'La tarea'} no está aprobada: la salida se decide después del veredicto.` }
  const motivo = (typeof a.motivo === 'string' ? a.motivo : '').replace(/\s+/g, ' ').trim().slice(0, MOTIVO_DE_SALIDA_MAX)
  if (a.decision === 'tu-clic') {
    const plan = (typeof a.plan === 'string' ? a.plan : '').replace(/\r\n?/g, '\n').trim().slice(0, PLAN_DE_VUELTA_MAX)
    if (!motivo) return { error: 'Con «tu-clic», di por qué en una línea (motivo).' }
    if (!plan) return { error: 'Con «tu-clic», deja el plan para volver atrás (plan).' }
    const nota = `pide su clic para producción: ${motivo}`
    return { datos: { ...datos, salida: 'tu-clic', salida_motivo: motivo, actualizada: ts }, cuerpo: anotar(ponerSeccion(cuerpo, PLAN_DE_VUELTA, plan), `${ts} · ${nota}`), nota }
  }
  if (a.decision === 'sin-objecion') {
    // Solo endurece: lo que ya pedía su clic sigue pidiéndolo.
    if (datos.salida === 'tu-clic') return { datos, cuerpo, nota: 'ya pedía su clic para producción: no se cambia' }
    const nota = `sin objeción para producción${motivo ? `: ${motivo}` : ''}`
    return { datos: { ...datos, salida: 'sin-objecion', salida_motivo: motivo, actualizada: ts }, cuerpo: anotar(cuerpo, `${ts} · ${nota}`), nota }
  }
  return { error: 'decision es «tu-clic» o «sin-objecion».' }
}
// ---- Lo que escribe el agente de las notas --------------------------------------------------------------------

/** El agente que escribe lo que se lee sin mirar el código (fabrica/docs/Plan-Integracion.md, etapa 4). Lo arma la aplicación. */
export const AGENTE_DE_ANUNCIO = 'fabrica-anuncio'
/** Su sección en una sencilla: lo que va al PR que se fusiona solo. */
export const PARA_EL_PR = 'Para el PR'
/** Su sección en una grande: lo que él prueba a mano antes de dejarla entrar. */
export const PARA_PROBAR_A_MANO = 'Para probar a mano'
const ANUNCIO_MAX = 4000

/** El cuerpo sin lo que escribió el agente de las notas: al volver a construcción, es de la vuelta anterior. */
export function sinLoDeLabel(cuerpo: string): string {
  let out = cuerpo
  for (const nombre of [PARA_EL_PR, PARA_PROBAR_A_MANO]) {
    const m = new RegExp(`^## ${nombre}[ \\t]*$`, 'm').exec(out)
    if (!m) continue
    const desde = m.index
    const resto = out.slice(desde + m[0].length)
    const sig = resto.search(/^## /m)
    out = sig < 0 ? out.slice(0, desde).replace(/\s*$/, '\n') : out.slice(0, desde) + resto.slice(sig)
  }
  return out
}

/**
 * Lo que deja el agente de las notas en una tarea ya clasificada. La sección la decide la clase, no el agente: en una
 * sencilla, «Para el PR»; en una grande, «Para probar a mano». Reemplaza la que hubiera, con tope,
 * y no toca nada más. Es lógica pura.
 */
export function anuncioEnLaTarea(datos: Datos, cuerpo: string, texto: unknown, ts: string): { cuerpo: string; nota: string; seccion: string } | { error: string } {
  const id = datos.id ?? 'La tarea'
  if (datos.estado !== 'aprobacion' && datos.estado !== 'hecho') return { error: `${id} está en "${datos.estado}": lo del agente de las notas se escribe con la tarea aprobada.` }
  const clase = datos.integracion_clase
  if (clase !== 'sencilla' && clase !== 'grande') return { error: `${id} todavía no se clasificó: primero mcp__fabrica__decidir(T, "integracion").` }
  const limpio = (typeof texto === 'string' ? texto : '').replace(/\r\n?/g, '\n').replace(/^#{1,2} .*$/gm, '').trim()
  if (!limpio) return { error: 'texto vacío: escribe lo que se lee, en Markdown, sin títulos de nivel 1 o 2.' }
  const recortado = limpio.length > ANUNCIO_MAX ? `${limpio.slice(0, ANUNCIO_MAX - 1)}…` : limpio
  const seccion = clase === 'sencilla' ? PARA_EL_PR : PARA_PROBAR_A_MANO
  const nota = `El agente de las notas escribió «${seccion}»`
  return { cuerpo: anotar(ponerSeccionAntesDeLaBitacora(cuerpo, seccion, recortado), `${ts} · ${nota}`), nota, seccion }
}

/**
 * Los que elige él desde la aplicación, que los escribe directo en el archivo: ni un agente ni el
 * orquestador los cambian con una edición, y una tarea nueva no nace con ellos.
 */
const DEL_USUARIO = ['modelo_spec', 'modelo_construccion'] as const
const LINEA_DEL_MOD = new RegExp(`^(?:${[...DEL_MOD, ...DEL_USUARIO].join('|')}):`, 'm')

export const esArchivoDeTarea = (ruta: string) => /(^|\/)factory\/tareas\/[^/]+\.md$/i.test(ruta.replace(/\\/g, '/'))

/**
 * Una ruta con `/`, sin `.` ni `..` de por medio: `factory/./memoria/ficha.md` y
 * `factory/x/../memoria/ficha.md` son `factory/memoria/ficha.md`. Así una guardia no se salta
 * escribiendo la misma ruta de otra forma. Un `..` que sale de la raíz se queda.
 */
export function rutaNormal(ruta: string): string {
  const partes = ruta.replace(/\\/g, '/').split('/')
  const out: string[] = []
  partes.forEach((p, i) => {
    if (p === '' && i > 0) return
    if (p === '.') return
    if (p === '..' && out.length && out[out.length - 1] !== '..' && out[out.length - 1] !== '' && !/^[a-z]:$/i.test(out[out.length - 1]!)) {
      out.pop()
      return
    }
    out.push(p)
  })
  return out.join('/') || '/'
}

/** El config.md de la fábrica: sus comandos son en lo que confía la verificación. */
export const esConfigDeLaFabrica = (ruta: string) => /(^|\/)factory\/config\.md$/i.test(rutaNormal(ruta))

export const CONFIG_SOLO_EL_USUARIO =
  'factory/config.md no lo cambia un agente: sus comandos son lo que verifica cada tarea, y un agente ' +
  'que los cambie podría darse por verificado. Si hace falta cambiarlo, dilo en tu resumen: lo decide el usuario.'

/**
 * Si un Edit o un Write sobre esa ruta se frena: config.md, desde un subagente (`agentId`). El hilo
 * principal sí puede (/fabrica:init, o el usuario en su sesión).
 */
export const frenaConfig = (ruta: string, agentId: string | undefined) => (esConfigDeLaFabrica(ruta) && agentId ? CONFIG_SOLO_EL_USUARIO : null)

/**
 * El vault de la memoria: `factory/memoria/` del proyecto y, si la corrida la trae, la carpeta de
 * la de la planta. En Windows no importan las mayúsculas.
 */
export function esDeLaMemoria(ruta: string, carpetaDeLaPlanta?: string | null): boolean {
  const r = rutaNormal(ruta).toLowerCase()
  if (/(^|\/)factory\/memoria(\/|$)/.test(r)) return true
  if (!carpetaDeLaPlanta?.trim()) return false
  const planta = rutaNormal(carpetaDeLaPlanta.trim()).replace(/\/+$/, '').toLowerCase()
  return r === planta || r.startsWith(`${planta}/`)
}

export const MEMORIA_SOLO_EL_USUARIO =
  'La memoria (factory/memoria/) no la escribe un agente: ahí está lo que el proyecto ya decidió, y eso lo decide ' +
  'una persona. Si algo debería recordarse, anótalo en «## Para la memoria» (o en tu entrega): se propone y lo aprueba el usuario.'

/** Si un Edit o un Write sobre esa ruta se frena: la memoria, desde un subagente. El hilo principal sí puede. */
export const frenaMemoria = (ruta: string, agentId: string | undefined, carpetaDeLaPlanta?: string | null) =>
  esDeLaMemoria(ruta, carpetaDeLaPlanta) && agentId ? MEMORIA_SOLO_EL_USUARIO : null

/** El catálogo de habilidades de la línea, o una habilidad del proyecto (`.claude/skills/`), con cualquier barra o forma de la ruta. */
export function esDeLasHabilidades(ruta: string): boolean {
  const r = rutaNormal(ruta).toLowerCase()
  return /(^|\/)factory\/habilidades\.md$/.test(r) || /(^|\/)\.claude\/skills(\/|$)/.test(r)
}

export const HABILIDADES_SOLO_EL_USUARIO =
  'Las habilidades (factory/habilidades.md y .claude/skills/) no las escribe un agente: son instrucciones que siguen ' +
  'todos los agentes, y eso lo decide una persona. Si hace falta una, dilo en tu entrega.'

/** Si un Edit o un Write sobre esa ruta se frena: el catálogo o una habilidad, desde un subagente. El hilo principal sí puede. */
export const frenaHabilidades = (ruta: string, agentId: string | undefined) => (esDeLasHabilidades(ruta) && agentId ? HABILIDADES_SOLO_EL_USUARIO : null)

/** Los procesos de la línea (`factory/procesos/`): lo que corre cuando se publica. */
export const esDeLosProcesos = (ruta: string) => /(^|\/)factory\/procesos(\/|$)/.test(rutaNormal(ruta).toLowerCase())

export const PROCESOS_SOLO_EL_USUARIO =
  'Los procesos (factory/procesos/) no los escribe un agente: dicen qué se corre al publicar, hasta producción, y eso ' +
  'lo decide una persona. Si hace falta cambiar uno, dilo en tu entrega.'

/** Si un Edit o un Write sobre esa ruta se frena: un proceso, desde un subagente. El hilo principal sí puede. */
export const frenaProcesos = (ruta: string, agentId: string | undefined) => (esDeLosProcesos(ruta) && agentId ? PROCESOS_SOLO_EL_USUARIO : null)

/** Un Edit que toca una línea de esos campos. */
export const editaCamposDelMod = (viejo: string, nuevo: string) => LINEA_DEL_MOD.test(viejo) || LINEA_DEL_MOD.test(nuevo)

/**
 * Un Write que cambia alguno de esos campos. Un archivo nuevo vale solo si nace en
 * `pendiente` (así un orquestador de fuera también puede encolar tareas).
 */
export function escribeCamposDelMod(antes: string | undefined, despues: string): boolean {
  const n = partir(despues).datos
  if (antes === undefined) return (n.estado ?? 'pendiente') !== 'pendiente' || DEL_USUARIO.some(k => n[k] !== undefined)
  const v = partir(antes).datos
  return [...DEL_MOD, ...DEL_USUARIO].some(k => (v[k] ?? '') !== (n[k] ?? ''))
}

export const SOLO_EL_MOD =
  'Ese campo lo cambia la fábrica, no una edición: usa mcp__fabrica__mover para el estado, ' +
  'mcp__fabrica__verificar para la verificación y fabrica:aprobador para el veredicto. ' +
  'modelo_spec y modelo_construccion los elige la persona desde la aplicación. ' +
  'El resto del archivo (spec, hallazgos, notas) sí se edita normalmente.'

// ---- Resúmenes ----------------------------------------------------------------------------

const ACTIVOS: readonly Estado[] = ['spec', 'construccion', 'revision', 'verificacion', 'aprobacion']

export function contar(tareas: readonly Tarea[]) {
  const n = (f: (t: Tarea) => boolean) => tareas.filter(f).length
  return {
    pendientes: n(t => t.estado === 'pendiente'),
    enCurso: n(t => ACTIVOS.includes(t.estado)),
    humano: n(t => t.estado === 'necesita-humano'),
    hechas: n(t => t.estado === 'hecho'),
  }
}

/** La línea de estado bajo el prompt; nada cuando no hay fábrica o está vacía. */
export function lineaDeEstado(tareas: readonly Tarea[]): string | undefined {
  if (!tareas.length) return undefined
  const c = contar(tareas)
  const partes = [
    c.enCurso && `${c.enCurso} en curso`,
    c.pendientes && `${c.pendientes} en cola`,
    c.humano && `⚠ ${c.humano} esperan humano`,
    c.hechas && `${c.hechas} hechas`,
  ].filter(Boolean)
  return partes.length ? `fábrica · ${partes.join(' · ')}` : undefined
}

/** El argv para correr un comando de config.md en la shell del sistema. */
export function enShell(comando: string, windows: boolean): string[] {
  return windows
    ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', comando]
    : ['sh', '-c', comando]
}

/** Las últimas `n` líneas no vacías de una salida, para devolverle al modelo lo que importa. */
export function cola(texto: string, n: number): string {
  return texto.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim()).slice(-n).join('\n')
}

export function veredictoDesde(texto: string): { veredicto: 'aprobada' | 'rechazada'; motivo: string; por: string } | undefined {
  try {
    const j = JSON.parse(texto) as Record<string, unknown>
    const v = j.veredicto
    if (v !== 'aprobada' && v !== 'rechazada') return undefined
    return { veredicto: v, motivo: String(j.motivo ?? ''), por: String(j.por ?? 'externo') }
  } catch {
    return undefined
  }
}

// ---- Dependencias entre tareas ------------------------------------------------------------

/**
 * El ciclo que se formaría si `id` dependiera de `deps`, con el resto del grafo como está, o
 * `null` si no hay. El ciclo va como camino: `['F-001', 'F-002', 'F-001']`.
 */
export function cicloDeDependencias(id: string, deps: readonly string[], grafo: ReadonlyMap<string, readonly string[]>): string[] | null {
  const g = new Map(grafo)
  g.set(id, deps)
  const camino: string[] = []
  const visto = new Set<string>()
  const buscar = (actual: string): string[] | null => {
    if (actual === id && camino.length) return [...camino, id]
    if (visto.has(actual)) return null
    visto.add(actual)
    camino.push(actual)
    for (const sig of g.get(actual) ?? []) {
      const c = buscar(sig)
      if (c) return c
    }
    camino.pop()
    return null
  }
  return buscar(id)
}

// ---- Archivos que toca una tarea ----------------------------------------------------------

/** Una ruta de archivo, comparable: barras normales, sin `./` y en minúsculas. */
export const rutaComparable = (r: string) => r.trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()

/**
 * Los archivos que una tarea dice que toca: la sección «Archivos o zonas que toca» del pedido o
 * «Archivos probables» de la spec. Cuentan las rutas entre comillas invertidas, o la primera ruta
 * de cada viñeta.
 */
export function archivosQueToca(cuerpo: string): string[] {
  const lineas = cuerpo.replace(/\r\n/g, '\n').split('\n')
  const out = new Set<string>()
  let dentro = false
  for (const l of lineas) {
    const t = l.trim()
    if (/^(#{2,6}\s+|\*\*)archivos (o zonas que toca|probables)\b/i.test(t)) { dentro = true; continue }
    if (!dentro) continue
    if (/^#{1,6}\s/.test(t) || /^\*\*[^*]+\*\*\s*$/.test(t) || /^_\(/.test(t)) { dentro = false; continue }
    const citadas = [...t.matchAll(/`([^`]+)`/g)].map(m => m[1]!.split(':')[0]!.trim())
    const rutas = citadas.length ? citadas : /^[-*]\s/.test(t) ? [(/[\w.\-/\\]+\.\w+/.exec(t)?.[0] ?? '')] : []
    for (const r of rutas) if (/[/\\]|\.\w+$/.test(r) && !/\s/.test(r)) out.add(rutaComparable(r))
  }
  return [...out]
}

/**
 * Qué tareas tienen que esperar a otras porque tocan los mismos archivos. Entre dos que comparten
 * algo, la de id mayor espera a que la otra quede integrada (o hecha, con integración manual).
 * Solo esperan las que siguen en `pendiente`: a una que ya arrancó no se la para.
 */
export function choquesDe(tareas: readonly { id: string; estado: Estado; integrada?: string; archivos: readonly string[] }[], cfg: Pick<Config, 'integracion'>): Map<string, Choque[]> {
  const terminada = (t: { estado: Estado; integrada?: string }) =>
    t.estado === 'descartada' || (t.estado === 'hecho' && (!!t.integrada || cfg.integracion === 'manual'))
  const orden = [...tareas].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  const out = new Map<string, Choque[]>()
  for (const [i, b] of orden.entries()) {
    if (b.estado !== 'pendiente' || !b.archivos.length) continue
    for (const a of orden.slice(0, i)) {
      if (terminada(a)) continue
      const comunes = b.archivos.filter(x => a.archivos.includes(x))
      if (comunes.length) out.set(b.id, [...(out.get(b.id) ?? []), { con: a.id, archivos: comunes }])
    }
  }
  return out
}

/** Los archivos que dos listas tienen en común, comparando rutas. */
export const enComun = (a: readonly string[], b: readonly string[]) => {
  const bs = new Set(b.map(rutaComparable))
  return a.filter(x => bs.has(rutaComparable(x)))
}

// ---- Comandos con los archivos de la tarea ------------------------------------------------

/** Una ruta entre comillas simples, que valen igual en PowerShell 5 y en sh. */
export const citarRuta = (ruta: string, windows: boolean) =>
  windows ? `'${ruta.replace(/'/g, "''")}'` : `'${ruta.replace(/'/g, `'\\''`)}'`

/** Reemplaza `{archivos}` por las rutas, cada una entre comillas. */
export const conArchivos = (comando: string, archivos: readonly string[], windows: boolean) =>
  comando.split('{archivos}').join(archivos.map(a => citarRuta(a, windows)).join(' '))

const deExtension = (ruta: string, exts: readonly string[]) => !exts.length || exts.some(e => ruta.toLowerCase().endsWith(e))

/**
 * El lint de la verificación. Con `{archivos}`, sobre lo que cambió la tarea, filtrado por
 * `lint_extensiones`; si no queda ninguno, no hay nada que lintear. Sin el marcador, el comando
 * tal cual.
 */
export function comandoDeLint(lint: string, archivos: readonly string[], exts: readonly string[], windows: boolean): { comando: string } | { sinArchivos: true } {
  if (!lint.includes('{archivos}')) return { comando: lint }
  const elegidos = archivos.filter(a => deExtension(a, exts))
  return elegidos.length ? { comando: conArchivos(lint, elegidos, windows) } : { sinArchivos: true }
}

export const archivosSql = (archivos: readonly string[]) => archivos.filter(a => /\.sql$/i.test(a))

// ---- Ramas: de dónde sale, contra qué se compara y dónde se integra ------------------------

/**
 * Las ramas en que la fábrica no trabaja nunca: de ellas no sale una tarea y en ellas no se integra.
 * Lo decidió el usuario el 20 de octubre de 2026: la fábrica trabaja sobre su rama de trabajo, y lo
 * que llega a `main` lo lleva él.
 */
export const RAMAS_PROTEGIDAS = ['main', 'master'] as const
export const esRamaProtegida = (rama: string) => (RAMAS_PROTEGIDAS as readonly string[]).includes(rama.trim().toLowerCase())

/**
 * De qué rama sale una tarea al entrar a construcción: la rama de trabajo de config, o la que pidió
 * el orquestador, o la activa en la raíz. Sin rama (detached HEAD), o si es una protegida, no sale:
 * vuelve la nota para el humano. Es lógica pura.
 */
export function ramaParaLaTarea(o: { deConfig: string; pedida: string; actual: string }): { rama: string } | { nota: string } {
  const rama = o.deConfig.trim() || o.pedida.trim() || o.actual.trim()
  if (!rama) return { nota: 'La raíz del proyecto no está en ninguna rama (detached HEAD): no se sabe de qué rama sale la tarea ni dónde integrarla. Vuelve a una rama y retómala.' }
  if (esRamaProtegida(rama)) return { nota: `La fábrica no trabaja sobre «${rama}»: elige tu rama de trabajo en la configuración (rama_trabajo en factory/config.md), o cámbiate a una rama tuya, y retómala.` }
  return { rama }
}

/**
 * Sin worktree propio la tarea trabaja directo en la raíz: no puede si la raíz está en una protegida,
 * ni si la rama de trabajo de config lo es (escrita a mano: la aplicación no la deja elegir). Devuelve
 * la nota para el humano, o `null` si puede. Es lógica pura.
 */
export function protegidaSinWorktree(o: { deConfig: string; actual: string }): string | null {
  const deConfig = o.deConfig.trim()
  const actual = o.actual.trim()
  if (deConfig && esRamaProtegida(deConfig)) return `La rama de trabajo de config es «${deConfig}», y la fábrica no trabaja sobre esa rama: elige una tuya en la configuración (rama_trabajo en factory/config.md) y retómala.`
  if (actual && esRamaProtegida(actual)) return `La raíz está en «${actual}», y sin worktree esta tarea trabajaría directo ahí: la fábrica no trabaja sobre esa rama. Cámbiate a tu rama de trabajo y retómala.`
  return null
}

/** La rama de la tarea: su rama de origen, o `rama_base` de config en las tareas de antes. */
export const ramaDeOrigen = (datos: Datos, cfg: Pick<Config, 'ramaBase'>) => datos.rama_origen?.trim() || cfg.ramaBase

/**
 * Contra qué se compara una tarea: el punto donde su rama se separó de la base, no la base como
 * está ahora. Así se ve solo lo que cambió la tarea, aunque la base local esté atrasada o haya
 * avanzado. El mod lo corre en el worktree y compara contra el commit que devuelve.
 */
export const baseDeComparacion = (base: string): string[] => ['git', 'merge-base', 'HEAD', base]

/** Si el worktree es una carpeta aparte de la raíz (con raíz y worktree iguales no hay rama propia). */
export const tieneWorktreePropio = (worktree: string | undefined, raiz: string) => {
  const n = (r: string) => r.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return !!worktree?.trim() && n(worktree) !== n(raiz)
}

/**
 * Por qué no se integró, cuando es algo mecánico que se resuelve sin cambiar la tarea: la raíz en
 * otra rama (`rama`), cambios sin commit del usuario en los mismos archivos (`sucios`) o la rama de
 * origen que avanzó (`avanzo`). Con eso, la tarea se reintenta sola cuando deja de pasar.
 */
export type Bloqueo = 'rama' | 'sucios' | 'avanzo'
export const esBloqueo = (x: unknown): x is Bloqueo => x === 'rama' || x === 'sucios' || x === 'avanzo'

export type Integracion = { hacer: 'integrar' } | { hacer: 'humano'; nota: string; bloqueo?: Bloqueo }

/**
 * Si una tarea aprobada se puede integrar en su rama de origen con un fast-forward. Nunca se toca
 * la copia de trabajo del usuario: sin `--force`, sin `reset`, sin `stash` y sin cambiar de rama.
 */
export function decidirIntegracion(d: { id: string; ramaActual: string; ramaOrigen: string; ramaTarea: string; ffPosible: boolean; suciosQueToca: readonly string[] }): Integracion {
  const volver = `Después, mueve ${d.id} a aprobación y otra vez a hecho.`
  const solo = 'La próxima corrida lo reintenta sola si ya se resolvió.'
  // En una protegida no se integra nunca, aunque la tarea saliera de ella antes de esta regla: lo decide él.
  if (esRamaProtegida(d.ramaOrigen)) return { hacer: 'humano', nota: `${d.id} tendría que integrarse en «${d.ramaOrigen}», y la fábrica no integra en esa rama: intégrala tú, o pásala a tu rama de trabajo.` }
  if (!d.ramaActual) return { hacer: 'humano', bloqueo: 'rama', nota: `La raíz del proyecto no está en ninguna rama (detached HEAD): no se integró ${d.ramaTarea}. Vuelve a ${d.ramaOrigen}. ${solo}` }
  if (d.ramaActual !== d.ramaOrigen) return { hacer: 'humano', bloqueo: 'rama', nota: `La raíz está en «${d.ramaActual}» y ${d.id} salió de «${d.ramaOrigen}»: no se integró. Vuelve a ${d.ramaOrigen} cuando puedas. ${solo}` }
  if (!d.ffPosible) return { hacer: 'humano', bloqueo: 'avanzo', nota: `${d.ramaOrigen} avanzó desde que ${d.id} se sincronizó: no entra con fast-forward. La próxima corrida la vuelve a sincronizar y a verificar sola.` }
  if (d.suciosQueToca.length) return { hacer: 'humano', bloqueo: 'sucios', nota: `Tienes cambios sin commit en archivos que ${d.id} también cambia: ${d.suciosQueToca.join(', ')}. Haz commit de los tuyos o apártalos; la fábrica no toca tu copia de trabajo. ${solo}` }
  return { hacer: 'integrar' }
}

/** Los archivos por los que git se negó a mezclar («would be overwritten by merge»), si los dice. */
export function archivosQueGitProtege(salida: string): string[] {
  const out: string[] = []
  let dentro = false
  for (const l of salida.replace(/\r\n/g, '\n').split('\n')) {
    if (/would be (overwritten|removed) by merge/i.test(l)) { dentro = true; continue }
    if (dentro && /^\t|^ {2,}/.test(l) && l.trim()) out.push(l.trim())
    else if (dentro) dentro = false
  }
  return [...new Set(out)]
}

/** Si un texto tiene marcadores de conflicto de git. */
export const tieneMarcadores = (texto: string) => /^(<{7}|>{7})( |$)|^={7}$/m.test(texto.replace(/\r\n/g, '\n'))

/**
 * Cuántos hallazgos BLOQUEANTES hay en `## Hallazgos de revisión`: las viñetas (o líneas) que
 * empiezan con BLOQUEANTE, con o sin negrita. «Sin BLOQUEANTES» no cuenta.
 */
export function bloqueantesEn(cuerpo: string): number {
  return (seccion(cuerpo, 'Hallazgos de revisión').match(/^\s*(?:(?:[-*]|\d+\.)\s+)?(?:\*\*|\[|`)?BLOQUEANTE\b/gm) ?? []).length
}

/**
 * Al volver de construcción a revisión, los hallazgos de la vuelta anterior pasan a
 * `## Hallazgos anteriores` y la sección queda limpia para los revisores de esta vuelta. Así un
 * BLOQUEANTE ya corregido no frena la tarea si esta vez no hace falta revisar.
 */
export function archivarHallazgos(cuerpo: string, ahora: string): string {
  const actuales = seccion(cuerpo, 'Hallazgos de revisión')
  if (!actuales) return cuerpo
  const previos = seccion(cuerpo, 'Hallazgos anteriores')
  const limpio = ponerSeccion(cuerpo, 'Hallazgos de revisión', '_(ninguno todavía)_')
  return ponerSeccionAntesDeLaBitacora(limpio, 'Hallazgos anteriores', [previos, `### Hasta ${ahora}`, '', actuales].filter(Boolean).join('\n\n'))
}

/** El hallazgo BLOQUEANTE que deja un conflicto al traer la rama de origen, en `## Hallazgos de revisión`. */
export function conHallazgoDeConflicto(cuerpo: string, base: string, archivos: readonly string[]): string {
  const previo = seccion(cuerpo, 'Hallazgos de revisión').replace(/\n*### Sincronización[\s\S]*?(?=\n### |$)/, '').trim()
  const lineas = archivos.map(a => `- **BLOQUEANTE** · \`${a}\` — conflicto al traer ${base}: resuélvelo conservando la intención de las dos ramas, sin marcadores.`)
  return ponerSeccion(cuerpo, 'Hallazgos de revisión', [...(previo ? [previo, ''] : []), '### Sincronización', '', ...lineas].join('\n'))
}

// ---- Ruido en los worktrees ---------------------------------------------------------------

/** Si el repo trabaja con CRLF: por `core.autocrlf` o por `.gitattributes`. */
export const usaCrlf = (autocrlf: string, gitattributes: string) =>
  autocrlf.trim().toLowerCase() === 'true' || /\beol\s*=\s*crlf\b/i.test(gitattributes)

/** Solo los de texto se normalizan: un binario no se lee como texto. */
export const esDeTexto = (ruta: string) =>
  /\.(cs|cshtml|razor|vb|fs|js|mjs|cjs|ts|tsx|jsx|css|scss|less|html?|json|xml|config|csproj|sln|slnx|props|targets|md|txt|sql|ps1|psm1|bat|cmd|ya?ml|py|java|go|rs|resx|editorconfig)$/i.test(ruta)

/** El texto con CRLF; `null` si ya lo tenía. */
export function aCrlf(texto: string): string | null {
  const nuevo = texto.replace(/\r?\n/g, '\r\n')
  return nuevo === texto ? null : nuevo
}

/** Los lockfiles: si la tarea cambió uno, el `node_modules` de la raíz no le sirve. */
export const esLockfile = (ruta: string) => /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/i.test(ruta.replace(/\\/g, '/'))

/**
 * Qué hacer con `node_modules` en el worktree: enlazar el de la raíz (sin `npm install` en cada
 * verificación), quitar el enlace si la tarea cambió el lockfile, o nada. Solo se enlaza si git
 * lo ignora: un enlace que git siguiera se llevaría node_modules entero en el commit.
 */
export function enlaceDeNodeModules(d: { raizTiene: boolean; worktreeTiene: boolean; enlazado: boolean; ignorado: boolean; lockCambio: boolean }): 'enlazar' | 'quitar' | 'nada' {
  if (d.enlazado) return d.lockCambio ? 'quitar' : 'nada'
  if (!d.raizTiene || d.worktreeTiene || !d.ignorado || d.lockCambio) return 'nada'
  return 'enlazar'
}

/** Las rutas de `git status --porcelain`: la nueva en un renombre, sin comillas. */
export function rutasDePorcelain(salida: string): string[] {
  return salida.replace(/\r\n/g, '\n').split('\n').filter(l => l.length > 3).map(l => {
    const ruta = l.slice(3).split(' -> ').at(-1)!.trim()
    return ruta.startsWith('"') && ruta.endsWith('"') ? ruta.slice(1, -1) : ruta
  })
}
