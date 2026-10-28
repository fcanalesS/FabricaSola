/**
 * Las habilidades de la línea, para el plugin: el catálogo `factory/habilidades.md` (lo crea la
 * aplicación y lo escribe una persona) dice qué habilidad de Claude Code usa cada etapa
 * y cuándo. Las corridas que lanza la aplicación le dan a cada etapa un agente con esas habilidades
 * ya cargadas (`skills:`), con un nombre fijo (`fabrica-hab-<rol>`), que el orquestador prueba
 * primero. En una corrida lanzada a mano ese agente no existe y la etapa usa el de siempre. Un
 * agente de una etapa no invoca una habilidad que su etapa no tiene. Es lógica pura.
 *
 * Es la misma lectura que hace la aplicación (src/lib/fabrica/habilidades/formato.ts), reducida.
 */

import { candidatos, NOMBRES_DE_ROL, type Rol } from './tareas'

/** El catálogo, relativo a la raíz del proyecto. */
export const CATALOGO_DE_HABILIDADES = 'factory/habilidades.md'

export const ETAPAS = ['spec', 'construccion', 'revision', 'aprobacion'] as const
export type Etapa = (typeof ETAPAS)[number]

/** La etapa del catálogo de cada rol: los tres revisores comparten `revision`. */
export const ETAPA_DE_ROL: Record<Rol, Etapa> = {
  spec: 'spec',
  construccion: 'construccion',
  revision_codigo: 'revision',
  revision_seguridad: 'revision',
  ui: 'revision',
  aprobacion: 'aprobacion',
}

/** El agente que la aplicación arma para un rol, con las habilidades de su etapa. El mismo nombre en `motor/agentes.ts`. */
export const nombreConHabilidades = (rol: Rol) => `fabrica-hab-${rol.replace(/_/g, '-')}`

/** Los agentes a probar para un rol en una corrida: primero el que trae sus habilidades, si la corrida lo trae. */
export const candidatosDeLaCorrida = (rol: Rol, valor: string) => [nombreConHabilidades(rol), ...candidatos(rol, valor)]

export type UsoDeHabilidad = { etapas: string[]; nombre: string; cuando: string }

const USO = /^- \[([^\]]*)\]\s+([^:\s]+(?::[^:\s]+)?):\s*(.+?)\s*$/

/** Los usos del catálogo: las líneas `- [etapa, etapa] nombre: cuándo.` antes de `## Sin asignar`. */
export function usosDelCatalogo(texto: string): UsoDeHabilidad[] {
  const usos: UsoDeHabilidad[] = []
  for (const l of texto.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^##\s+sin asignar\s*$/i.test(l)) break
    const m = USO.exec(l)
    if (m) usos.push({ etapas: m[1]!.split(',').map(e => e.trim()).filter(Boolean), nombre: m[2]!, cuando: m[3]! })
  }
  return usos
}

/** Las habilidades de una etapa, por nombre, sin repetir. */
export function habilidadesDeEtapa(usos: readonly UsoDeHabilidad[], etapa: Etapa): UsoDeHabilidad[] {
  const vistas = new Set<string>()
  return usos.filter(u => u.etapas.includes(etapa) && !vistas.has(u.nombre) && vistas.add(u.nombre))
}

/**
 * Lo que contesta `decidir(T, "spec")` en una línea que le da habilidades a la spec: la spec se
 * escribe siempre, con el agente de Claude que las trae. Jev no puede saber si la tarea toca IA o
 * datos personales, y las especialidades existen para esas tareas. Antigravity no recibe
 * habilidades: con ellas, la escribe Claude. `null` si la etapa spec no tiene ninguna.
 */
export function specConHabilidades(id: string, catalogo: string | null): string | null {
  if (!catalogo) return null
  const nombres = habilidadesDeEtapa(usosDelCatalogo(catalogo), 'spec').map(u => u.nombre)
  if (!nombres.length) return null
  return `${id}: SÍ hace falta el agente de spec — la línea le da habilidades a la spec (${nombres.join(', ')}), y cada una decide si aplica. Lánzalo con su modelo de siempre.`
}

/** Lo que va a cada agente con la memoria: qué habilidades tiene cada etapa y cuándo usarlas. Sin catálogo, nada. */
export function habilidadesParaLosAgentes(texto: string | null): string {
  const usos = usosDelCatalogo(texto ?? '')
  const lineas = ETAPAS.flatMap(e => habilidadesDeEtapa(usos, e).map(u => `- ${e}: ${u.nombre} — ${u.cuando}`))
  if (!lineas.length) return ''
  return [
    '## Habilidades de esta línea',
    '',
    `Lo que dice ${CATALOGO_DE_HABILIDADES}: qué habilidad usa cada etapa, y cuándo. El agente de cada etapa ya las trae cargadas; síguelas cuando apliquen. No uses otras.`,
    '',
    ...lineas,
  ].join('\n')
}

/**
 * El agente de retrabajo que arma la aplicación (Arreglo de raíz y Pruebas, fabrica/docs/Plan-Integracion.md,
 * etapa 6). Es de la etapa de construcción: recibe sus habilidades y lo frenan las mismas guardias.
 * No es un candidato del rol: el orquestador lo lanza solo en una vuelta de retrabajo.
 */
export const AGENTE_DE_RETRABAJO = 'fabrica-retrabajo'

/** El rol de un tipo de agente en esta corrida, o `null` si no es el de ninguna etapa. */
export function rolDeAgente(tipo: string | undefined, agentes: Record<Rol, string>): Rol | null {
  if (!tipo) return null
  if (tipo === AGENTE_DE_RETRABAJO) return 'construccion'
  return NOMBRES_DE_ROL.find(rol => candidatosDeLaCorrida(rol, agentes[rol] ?? 'auto').includes(tipo)) ?? null
}

// ---- Registro: qué habilidades recibió cada tarea, y en qué versión ---------------------------------

/**
 * La huella del contenido de un `SKILL.md`: FNV-1a de 32 bits, en hex. La misma cuenta en la
 * aplicación (src/lib/fabrica/habilidades/formato.ts): así se puede comparar la versión con que
 * empezó la corrida con la que hay ahora, también en las habilidades que no están en un repositorio.
 */
export function huellaDe(texto: string): string {
  let h = 0x811c9dc5
  for (const b of new TextEncoder().encode(texto.replace(/\r\n?/g, '\n'))) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export type HabilidadEnCorrida = { nombre: string; huella: string; origen: string; ruta: string }

/** Lo que la aplicación pasa a la corrida en `FABRICA_HABILIDADES`: por etapa, cada habilidad con su huella. Lo que no tiene esa forma no cuenta. */
export function habilidadesDeLaCorridaDesde(texto: string | undefined): Partial<Record<Etapa, HabilidadEnCorrida[]>> {
  let dato: unknown
  try {
    dato = JSON.parse(texto ?? '')
  } catch {
    return {}
  }
  const out: Partial<Record<Etapa, HabilidadEnCorrida[]>> = {}
  if (!dato || typeof dato !== 'object') return out
  for (const etapa of ETAPAS) {
    const lista = (dato as Record<string, unknown>)[etapa]
    if (!Array.isArray(lista)) continue
    out[etapa] = lista
      .filter((h): h is HabilidadEnCorrida => !!h && typeof h.nombre === 'string' && typeof h.huella === 'string' && typeof h.origen === 'string' && typeof h.ruta === 'string')
      .map(h => ({ nombre: h.nombre, huella: h.huella, origen: h.origen, ruta: h.ruta }))
  }
  return out
}

/** El rol de un agente con habilidades por su nombre (`fabrica-hab-revision-codigo` → `revision_codigo`). */
export const rolConHabilidades = (tipo: string | undefined): Rol | null =>
  tipo === AGENTE_DE_RETRABAJO ? 'construccion' : NOMBRES_DE_ROL.find(rol => nombreConHabilidades(rol) === tipo) ?? null

/**
 * La tarea de un encargo. Primero, la descripción del encargo (lo primero que se pasa): si nombra un
 * solo id `F-NNN`, es ese, aunque el pedido nombre otras (el de F-002 puede contar lo que se hizo en
 * F-001). Si la descripción no alcanza, el único id que nombran todos los textos juntos. Con ninguno
 * o con varios, `null`.
 */
export function tareaDelEncargo(...textos: readonly unknown[]): string | null {
  const idsDe = (t: unknown) => new Set(typeof t === 'string' ? t.match(/\bF-\d{3,}\b/g) ?? [] : [])
  const deLaDescripcion = idsDe(textos[0])
  if (deLaDescripcion.size === 1) return [...deLaDescripcion][0]!
  const ids = new Set(textos.flatMap(t => [...idsDe(t)]))
  return ids.size === 1 ? [...ids][0]! : null
}

/**
 * Si la última línea de la bitácora ya dice eso (sin contar su hora). El aviso del lanzamiento de un
 * agente puede llegar dos veces por una sola llamada: la segunda no se anota. Otra vuelta de la
 * misma etapa sí, porque antes hubo otra línea.
 */
export function ultimaDeLaBitacoraEs(cuerpo: string, linea: string): boolean {
  const desde = cuerpo.search(/^## Bitácora\s*$/m)
  if (desde < 0) return false
  const resto = cuerpo.slice(desde).split('\n').slice(1)
  const fin = resto.findIndex(l => /^## /.test(l))
  const entradas = (fin < 0 ? resto : resto.slice(0, fin)).filter(l => l.startsWith('- '))
  const ultima = entradas.at(-1)
  return !!ultima && ultima.replace(/^- \S+ · /, '') === linea
}

const MARCA_DE_HABILIDADES = 'habilidades ('

/**
 * La línea de la bitácora de la tarea: qué recibió el agente de una etapa, con su huella y de
 * dónde salió. Si una cambió desde que empezó la corrida, se dice: el agente pudo leer otra versión.
 */
export function lineaDeHabilidades(etapa: Etapa, lista: readonly HabilidadEnCorrida[], ahora: Record<string, string | null>): string {
  const partes = lista.map(h => `${h.nombre}@${h.huella} (${h.origen === 'suya' ? 'suya' : 'del proyecto'})`)
  const cambiaron = lista.filter(h => ahora[h.nombre] !== undefined && ahora[h.nombre] !== h.huella).map(h => (ahora[h.nombre] === null ? `${h.nombre} ya no está` : `${h.nombre} cambió (ahora ${ahora[h.nombre]})`))
  return `${MARCA_DE_HABILIDADES}${etapa}): ${partes.join(', ')}${cambiaron.length ? ` — desde que empezó la corrida: ${cambiaron.join('; ')}` : ''}`
}

/** Las habilidades que anotó la bitácora de una tarea, sin repetir y en orden. */
export function habilidadesDeLaTarea(cuerpo: string): string[] {
  const nombres: string[] = []
  for (const l of cuerpo.replace(/\r\n?/g, '\n').split('\n')) {
    const i = l.indexOf(MARCA_DE_HABILIDADES)
    if (!l.startsWith('- ') || i < 0) continue
    const lista = l.slice(l.indexOf('): ', i) + 3).split(' — ')[0] ?? ''
    for (const m of lista.matchAll(/([a-z0-9][a-z0-9:-]*)@[0-9a-f]{8}/g)) if (!nombres.includes(m[1]!)) nombres.push(m[1]!)
  }
  return nombres
}

/**
 * Si el orquestador lanza el agente de siempre para una etapa que en esta corrida trae el suyo con
 * habilidades (`fabrica-hab-<rol>`), por qué no: ese agente tiene cargadas las habilidades de la
 * etapa y los oficios de sus especialidades, y el de siempre no. Lo encontró la corrida real del 27 de
 * octubre de 2026: el orquestador lanzó `fabrica:constructor` con `fabrica-hab-construccion` en la
 * lista. `habilidades` es lo que la aplicación pasó en `FABRICA_HABILIDADES`: sin habilidades para
 * esa etapa, no hay agente con habilidades, y pasa. El de retrabajo trae las suyas, y pasa.
 */
export function frenaSinHabilidades(e: { tipo: string | undefined; agentes: Record<Rol, string>; habilidades: Partial<Record<Etapa, readonly HabilidadEnCorrida[]>> }): string | null {
  const rol = rolDeAgente(e.tipo, e.agentes)
  if (!rol || e.tipo === nombreConHabilidades(rol) || e.tipo === AGENTE_DE_RETRABAJO) return null
  const lista = e.habilidades[ETAPA_DE_ROL[rol]] ?? []
  if (!lista.length) return null
  const nombre = nombreConHabilidades(rol)
  return `Esta corrida trae ${nombre}, el agente de ${rol} con las habilidades de su etapa (${lista.map(h => h.nombre).join(', ')}). Lánzalo a él en vez de ${String(e.tipo).slice(0, 60)}, con el mismo encargo y el mismo model.`
}

/**
 * Si un agente de una etapa intenta una habilidad que su etapa no tiene en el catálogo, por qué no.
 * El hilo principal, un agente que no es de ninguna etapa y una línea sin catálogo pasan, como hoy.
 */
export function frenaHabilidad(e: { habilidad: string; agentId: string | undefined; tipo: string | undefined; catalogo: string | null; agentes: Record<Rol, string> }): string | null {
  if (!e.agentId || e.catalogo === null) return null
  const rol = rolDeAgente(e.tipo, e.agentes)
  if (!rol) return null
  const etapa = ETAPA_DE_ROL[rol]
  const nombre = e.habilidad.trim().replace(/^\//, '')
  const suyas = habilidadesDeEtapa(usosDelCatalogo(e.catalogo), etapa).map(u => u.nombre)
  if (suyas.includes(nombre)) return null
  return suyas.length
    ? `La etapa ${etapa} usa solo ${suyas.join(', ')} (${CATALOGO_DE_HABILIDADES}). «${nombre.slice(0, 60)}» no está para esta etapa: si hace falta, dilo en tu informe y lo decide una persona.`
    : `La etapa ${etapa} no tiene habilidades en ${CATALOGO_DE_HABILIDADES}: trabaja sin ellas. Si «${nombre.slice(0, 60)}» hace falta, dilo en tu informe y lo decide una persona.`
}
