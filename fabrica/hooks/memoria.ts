/**
 * La memoria del proyecto, para el plugin: el vault de archivos Markdown en factory/memoria/ (lo
 * crea la aplicación de compañía; ver su LEEME.md) y, si la corrida lo trae, el de la planta
 * (FABRICA_MEMORIA_PLANTA). Las dos fichas entran enteras a cada tarea, y si un pedido nombra algo
 * que una ficha prohíbe (una regla `NO:`), se anota la sospecha para el agente de spec. Decide él,
 * no el plugin.
 *
 * Lo único que el mod escribe en el vault, al pasar una tarea a `hecho`: lo que los agentes anotaron
 * en `## Para la memoria`, como propuestas (que aprueba o rechaza una persona), y la línea de la
 * bitácora del mes. Nunca la ficha ni una decisión. Es lógica pura.
 *
 * Es la misma lectura que hace la aplicación (src/lib/fabrica/memoria/formato.ts y plantillas.ts),
 * reducida: el plugin sirve para cualquier proyecto y no depende de ella.
 */

import { habilidadesDeLaTarea } from './habilidades'
import { partir, seccion, unir } from './tareas'

/** La carpeta del vault, relativa a la raíz del proyecto. */
export const CARPETA_DE_LA_MEMORIA = 'factory/memoria'

export type ReglaProhibida = { tema: string; texto: string; linea: number }

const REGLA = /^- \[([a-z0-9]+(?:-[a-z0-9]+)*)\]\s+NO:\s*(.+?)\s*$/

/** Las reglas `NO:` de una ficha: `- [tema] NO: SQL Server, MySQL ni MongoDB. (D-0001)`. */
export function prohibicionesDe(ficha: string): ReglaProhibida[] {
  const reglas: ReglaProhibida[] = []
  ficha.replace(/\r\n?/g, '\n').split('\n').forEach((l, i) => {
    const m = REGLA.exec(l)
    if (!m) return
    // Lo que va entre paréntesis al final es de dónde sale, no lo prohibido.
    reglas.push({ tema: m[1]!, texto: m[2]!.replace(/\s*\([^()]*\)\s*$/, ''), linea: i + 1 })
  })
  return reglas
}

/** Lo que una regla prohíbe, uno por uno: «SQL Server, MySQL ni MongoDB» → tres. */
export function terminosDe(texto: string): string[] {
  return texto
    .replace(/[.;:]+$/, '')
    .split(/,|\s+ni\s+|\s+y\s+|\s+o\s+|\s+nor\s+/i)
    .map(t => t.replace(/^(nada de|ningun[ao]?|ni)\s+/i, '').trim())
    .filter(t => t.length >= 2)
}

const comparable = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export type Choque = { donde: 'planta' | 'proyecto'; tema: string; regla: string; termino: string }

/**
 * Si un texto (el pedido de una tarea) nombra algo que alguna ficha prohíbe. Una palabra dentro de
 * otra no cuenta («MySQLConnector» no es «MySQL»). Es una sospecha, no un juicio.
 */
export function choquesConLaMemoria(fichas: { planta?: string | null; proyecto?: string | null }, texto: string): Choque[] {
  const t = comparable(texto)
  const choques: Choque[] = []
  for (const donde of ['planta', 'proyecto'] as const) {
    for (const r of prohibicionesDe(fichas[donde] ?? '')) {
      for (const termino of terminosDe(r.texto)) {
        const patron = new RegExp(`(^|[^\\p{L}\\p{N}])${escapar(comparable(termino))}($|[^\\p{L}\\p{N}])`, 'u')
        if (patron.test(t)) choques.push({ donde, tema: r.tema, regla: `NO: ${r.texto}`, termino })
      }
    }
  }
  return choques
}

/** La nota para la bitácora de la tarea: qué nombra y qué regla lo prohíbe. */
export function notaDeChoques(choques: readonly Choque[]): string {
  const lista = choques.map(c => `«${c.termino}» (${c.donde === 'planta' ? 'la ficha de la planta' : 'la ficha del proyecto'}, [${c.tema}] ${c.regla})`)
  return `memoria: el pedido nombra ${lista.join('; ')}. El agente de spec lo revisa contra las decisiones y, si de verdad choca, lo pregunta.`
}

/** Lo que va a cada agente: las dos fichas, enteras, y dónde buscar las decisiones. */
export function memoriaParaLosAgentes(m: { vault: string | null; planta: string | null; proyecto: string | null; vaultDeLaPlanta: string | null }): string {
  if (!m.planta && !m.proyecto) return ''
  return [
    '## Memoria de la fábrica',
    '',
    'Lo que este proyecto ya decidió. Una tarea no lo contradice: si el pedido choca con una regla o una decisión vigente, se pregunta a una persona.',
    m.planta ? `\n### Ficha de la planta (vale en todos los proyectos)\n\n${m.planta.trim()}` : '',
    m.proyecto ? `\n### Ficha de este proyecto (manda sobre la de la planta)\n\n${m.proyecto.trim()}` : '',
    m.vault ? `\nDecisiones, con su porqué: ${m.vault}/decisiones/. Busca las de los temas que toca la tarea: grep -rl "^temas:.*<tema>" ${m.vault}/decisiones/` : '',
    m.vaultDeLaPlanta ? `Las de la planta: ${m.vaultDeLaPlanta}/decisiones/.` : '',
  ].filter(Boolean).join('\n')
}

// ---- Propuestas y bitácora, al terminar una tarea ------------------------------------------

/** La sección de la tarea donde los agentes anotan lo que debería recordarse. */
export const SECCION_PARA_LA_MEMORIA = 'Para la memoria'

/** Las secciones fijas de una decisión o una propuesta, con el nombre que les da la aplicación. */
export const SECCIONES_DE_DOCUMENTO = ['Decisión', 'Por qué', 'Qué se descartó', 'Qué implica'] as const
type SeccionDeDocumento = (typeof SECCIONES_DE_DOCUMENTO)[number]

const TEMA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const TOPE_DE_LINEA = 200
const TOPE_DE_TITULO = 120
const TOPE_DE_REGLA = 160
const ANCHO = 100

/** Un archivo de una habilidad propuesta, con su ruta dentro de la carpeta de la habilidad. */
export type ArchivoDeHabilidad = { ruta: string; texto: string }

/** Una habilidad nueva que propone un agente: su `SKILL.md` y lo que traiga, y dónde se usaría. */
export type HabilidadPropuesta = { nombre: string; etapas: string[]; cuando: string; archivos: ArchivoDeHabilidad[] }

export type PropuestaDeTarea = {
  titulo: string
  temas: string[]
  regla: string
  propone: string
  secciones: Record<SeccionDeDocumento, string>
  /** Solo en la propuesta de una habilidad nueva. */
  habilidad?: HabilidadPropuesta
}

type Clave = 'temas' | 'regla' | 'propone' | 'habilidad' | 'etapas' | 'cuando' | SeccionDeDocumento

// Las claves de una propuesta en la tarea, sin tildes ni mayúsculas: los agentes las escriben a mano.
const CLAVES: Record<string, Clave> = {
  temas: 'temas', tema: 'temas', regla: 'regla', propone: 'propone',
  decision: 'Decisión', 'por que': 'Por qué', porque: 'Por qué',
  descartado: 'Qué se descartó', descartada: 'Qué se descartó', 'que se descarto': 'Qué se descartó',
  implica: 'Qué implica', 'que implica': 'Qué implica',
  habilidad: 'habilidad', etapas: 'etapas', etapa: 'etapas', cuando: 'cuando',
}
/** Las claves que abren un archivo de la habilidad: lo que sigue, con sangría, es su texto. */
const CLAVES_DE_ARCHIVO: Record<string, string | null> = { archivo: null, skill: 'SKILL.md', 'skill.md': 'SKILL.md' }
const CLAVE = /^- ([^:]{1,30}):[ \t]*(.*)$/
const normalClave = (k: string) => comparable(k).replace(/[_\s]+/g, ' ').trim()
const unaLinea = (t: string) => t.replace(/\s+/g, ' ').trim()

/** Un tema como los de la ficha: en minúsculas, sin tildes y con guiones. */
export const temaNormal = (t: string) => comparable(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Las etapas de la fábrica que pueden recibir una habilidad (las mismas del catálogo). */
const ETAPAS_DE_HABILIDAD = ['spec', 'construccion', 'revision', 'aprobacion']
const NOMBRE_DE_HABILIDAD = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** La ruta de un archivo dentro de la habilidad: hasta tres niveles, sin `..` ni archivos ocultos. */
export const RUTA_DE_ARCHIVO_DE_HABILIDAD = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*){0,2}$/
export const TOPES_DE_HABILIDAD = { archivos: 10, bytesPorArchivo: 32 * 1024, bytes: 96 * 1024, cuando: 150 } as const

/** Quita la sangría común, y las líneas en blanco del principio y del final. */
function sinSangria(lineas: readonly string[]): string {
  const con = lineas.map(l => l.replace(/\s+$/, ''))
  while (con.length && !con[0]) con.shift()
  while (con.length && !con.at(-1)) con.pop()
  const sangria = Math.min(...con.filter(Boolean).map(l => /^ */.exec(l)![0].length))
  return con.length ? `${con.map(l => l.slice(Number.isFinite(sangria) ? sangria : 0)).join('\n')}\n` : ''
}

/** Lo que no deja proponer una habilidad: su nombre, sus etapas, sus archivos y su `SKILL.md`. */
function problemasDeHabilidad(h: HabilidadPropuesta): string[] {
  const skill = h.archivos.find(a => a.ruta === 'SKILL.md')
  const datos = skill ? partir(skill.texto).datos : {}
  const bytes = (t: string) => new TextEncoder().encode(t).length
  const rutas = h.archivos.map(a => a.ruta)
  return [
    NOMBRE_DE_HABILIDAD.test(h.nombre) ? '' : `«${h.nombre.slice(0, 40)}» no es un nombre de habilidad (minúsculas, números y guiones)`,
    h.etapas.length ? '' : 'no dice en qué etapa se usa',
    ...h.etapas.filter(e => !ETAPAS_DE_HABILIDAD.includes(e)).map(e => `«${e}» no es una etapa de la fábrica`),
    h.cuando ? '' : 'no dice cuándo se usa',
    h.cuando.length > TOPES_DE_HABILIDAD.cuando ? `el «cuando» pasa de ${TOPES_DE_HABILIDAD.cuando} caracteres` : '',
    skill ? '' : 'no trae su SKILL.md',
    skill && !partir(skill.texto).cuerpo.trim() ? 'su SKILL.md está vacío' : '',
    skill && datos.name?.trim() && datos.name.trim() !== h.nombre ? `su SKILL.md se llama «${datos.name.trim().slice(0, 40)}»` : '',
    skill && !datos.description?.trim() ? 'su SKILL.md no tiene description' : '',
    /^true$/i.test(datos['disable-model-invocation']?.trim() ?? '') ? 'su SKILL.md no se puede dar a un agente (disable-model-invocation)' : '',
    ...rutas.filter(r => !RUTA_DE_ARCHIVO_DE_HABILIDAD.test(r) || r.split('/').includes('..')).map(r => `la ruta «${r.slice(0, 40)}» no vale`),
    new Set(rutas).size === rutas.length ? '' : 'repite un archivo',
    h.archivos.length > TOPES_DE_HABILIDAD.archivos ? `trae más de ${TOPES_DE_HABILIDAD.archivos} archivos` : '',
    h.archivos.some(a => bytes(a.texto) > TOPES_DE_HABILIDAD.bytesPorArchivo) ? `un archivo pasa de ${TOPES_DE_HABILIDAD.bytesPorArchivo / 1024} KB` : '',
    bytes(h.archivos.map(a => a.texto).join('')) > TOPES_DE_HABILIDAD.bytes ? `entre todos pasan de ${TOPES_DE_HABILIDAD.bytes / 1024} KB` : '',
  ].filter(Boolean)
}

/**
 * Las propuestas de `## Para la memoria`. Cada una es un `### Título` seguido de `- clave: valor`
 * (temas, regla, decision, por que, descartado, implica, propone); una línea con sangría sigue al
 * valor de arriba. Lo que no se puede proponer va a `problemas`, con su título.
 *
 * Una habilidad nueva lleva `- habilidad: nombre`, `- etapas:` y `- cuando:`, y cada archivo como
 * `- archivo: ruta` (`- skill:` es el `SKILL.md`) con su texto debajo, con sangría: ahí las líneas
 * en blanco y la sangría de adentro se conservan.
 */
export function propuestasDe(cuerpoDeLaTarea: string): { propuestas: PropuestaDeTarea[]; problemas: string[] } {
  const texto = seccion(cuerpoDeLaTarea, SECCION_PARA_LA_MEMORIA).replace(/\r\n?/g, '\n')
  type Borrador = { titulo: string; campos: Map<string, string[]>; archivos: { ruta: string; lineas: string[] }[] }
  const borradores: Borrador[] = []
  let actual: Borrador | null = null
  let campo: string | null = null
  let archivo: { ruta: string; lineas: string[] } | null = null
  for (const l of texto.split('\n')) {
    const h = /^###\s+(.+?)\s*#*\s*$/.exec(l)
    if (h) {
      actual = { titulo: unaLinea(h[1]!), campos: new Map(), archivos: [] }
      borradores.push(actual)
      campo = null
      archivo = null
      continue
    }
    if (!actual) continue
    const kv = CLAVE.exec(l)
    const nombre = kv ? normalClave(kv[1]!) : ''
    const clave = kv ? CLAVES[nombre] : undefined
    if (kv && nombre in CLAVES_DE_ARCHIVO) {
      archivo = { ruta: CLAVES_DE_ARCHIVO[nombre] ?? kv[2]!.trim(), lineas: [] }
      actual.archivos.push(archivo)
      campo = null
    } else if (kv && clave) {
      archivo = null
      campo = clave
      actual.campos.set(clave, [...(actual.campos.get(clave) ?? []), kv[2]!.trim()].filter(Boolean))
    } else if (archivo) {
      // El texto de un archivo va con sangría; una línea sin ella lo termina.
      if (!l.trim() || /^\s/.test(l)) archivo.lineas.push(l)
      else archivo = null
    } else if (campo && l.trim()) {
      actual.campos.get(campo)!.push(l.replace(/^\s{1,4}/, '').trimEnd())
    }
  }

  const propuestas: PropuestaDeTarea[] = []
  const problemas: string[] = []
  for (const b of borradores) {
    const v = (k: string) => (b.campos.get(k) ?? []).join('\n').trim()
    const habilidad: HabilidadPropuesta | undefined = v('habilidad')
      ? {
          nombre: v('habilidad').split('\n')[0]!.trim(),
          etapas: [...new Set(v('etapas').split(/[,\n]/).map(temaNormal).filter(Boolean))],
          cuando: unaLinea(v('cuando')),
          archivos: b.archivos.map(a => ({ ruta: a.ruta, texto: sinSangria(a.lineas) })),
        }
      : undefined
    if (habilidad) {
      const falta = [...(b.titulo.length > TOPE_DE_TITULO ? [`el título pasa de ${TOPE_DE_TITULO} caracteres`] : []), ...problemasDeHabilidad(habilidad)]
      if (falta.length) {
        problemas.push(`«${b.titulo.slice(0, 60)}» ${falta.join(' y ')}`)
        continue
      }
      const temas = [...new Set(v('temas').split(/[,\n]/).map(temaNormal).filter(t => TEMA.test(t)))]
      const secciones = Object.fromEntries(SECCIONES_DE_DOCUMENTO.map(s => [s, v(s)])) as Record<SeccionDeDocumento, string>
      if (!secciones['Decisión']) secciones['Decisión'] = `Usar la habilidad «${habilidad.nombre}» en ${habilidad.etapas.join(', ')}: ${habilidad.cuando}`
      const quien = temaNormal(v('propone').split('\n')[0] ?? '').replace(/^fabrica-/, '')
      propuestas.push({ titulo: b.titulo, temas: temas.length ? temas : ['habilidades'], regla: '', propone: quien ? `fabrica:${quien}` : 'fabrica', secciones, habilidad })
      continue
    }
    const temas = [...new Set(v('temas').split(/[,\n]/).map(temaNormal).filter(t => TEMA.test(t)))]
    const regla = unaLinea(v('regla'))
    const secciones = Object.fromEntries(SECCIONES_DE_DOCUMENTO.map(s => [s, v(s)])) as Record<SeccionDeDocumento, string>
    const falta = [
      b.titulo.length > TOPE_DE_TITULO ? `el título pasa de ${TOPE_DE_TITULO} caracteres` : '',
      temas.length ? '' : 'no tiene temas',
      secciones['Decisión'] ? '' : 'no dice la decisión',
      regla.length > TOPE_DE_REGLA ? `la regla pasa de ${TOPE_DE_REGLA} caracteres` : '',
    ].filter(Boolean)
    if (falta.length) {
      problemas.push(`«${b.titulo.slice(0, 60)}» ${falta.join(' y ')}`)
      continue
    }
    const quien = temaNormal(v('propone').split('\n')[0] ?? '').replace(/^fabrica-/, '')
    propuestas.push({ titulo: b.titulo, temas, regla, propone: quien ? `fabrica:${quien}` : 'fabrica', secciones })
  }
  return { propuestas, problemas }
}

/** Corta las líneas largas en palabras, con la sangría de la lista: una línea del vault no pasa de 200. */
export function envolver(texto: string, ancho = ANCHO): string {
  return texto.split('\n').flatMap(l => {
    if (l.length <= ancho) return [l]
    const sangria = /^(\s*(?:[-*]|\d+\.)?\s*)/.exec(l)![1]!
    const resto = ' '.repeat(sangria.length)
    const salida: string[] = []
    let linea = sangria
    for (const palabra of l.slice(sangria.length).split(/\s+/).filter(Boolean)) {
      if (linea.trim() && (linea + ' ' + palabra).length > ancho) {
        salida.push(linea)
        linea = resto + palabra
      } else linea = linea.trim() ? `${linea} ${palabra}` : linea + palabra
    }
    salida.push(linea)
    return salida
  }).join('\n')
}

/** El nombre del archivo: su id y su título en minúsculas, sin tildes y con guiones (como la aplicación). */
export function nombreDeDocumento(id: string, titulo: string): string {
  const nombre = comparable(titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '')
  return `${id}${nombre ? `-${nombre}` : ''}.md`
}

/** El siguiente `P-NNNN` libre. Los ids no se reusan: cuenta también los de las rechazadas. */
export function siguientePropuesta(ids: readonly string[]): string {
  const max = ids.reduce((m, id) => Math.max(m, Number(/^P-(\d+)/.exec(id)?.[1] ?? 0)), 0)
  return `P-${String(max + 1).padStart(4, '0')}`
}

/** La sección de una propuesta de habilidad con sus archivos: un `### ruta` por archivo y su texto con sangría. */
export const SECCION_DE_ARCHIVOS = 'Archivos'

/**
 * El archivo de una propuesta, con el mismo frontmatter y las mismas secciones que escribe la aplicación.
 * La de una habilidad suma `habilidad`, `etapas` y `cuando`, y sus archivos en `## Archivos`, cada uno
 * con cuatro espacios de sangría: así un `## ` de adentro no corta la sección.
 */
export function documentoDePropuesta(p: PropuestaDeTarea, d: { id: string; fecha: string; origen: string }): string {
  const datos: Record<string, string> = {
    id: d.id, titulo: p.titulo, estado: 'propuesta', fecha: d.fecha, temas: p.temas.join(', '),
    origen: d.origen, propone: p.propone, regla: p.regla, reemplaza: '',
    ...(p.habilidad ? { habilidad: p.habilidad.nombre, etapas: p.habilidad.etapas.join(', '), cuando: p.habilidad.cuando } : {}),
  }
  const cuerpo = SECCIONES_DE_DOCUMENTO.map(s => `## ${s}\n\n${envolver(p.secciones[s]) || '_(sin escribir)_'}\n`).join('\n')
  const archivos = p.habilidad
    ? `\n## ${SECCION_DE_ARCHIVOS}\n\n${p.habilidad.archivos.map(a => `### ${a.ruta}\n\n${a.texto.replace(/\n$/, '').split('\n').map(l => (l ? `    ${l}` : '')).join('\n')}\n`).join('\n')}`
    : ''
  return unir(datos, `\n${cuerpo}${archivos}`)
}

export type DocumentoExistente = { id: string; titulo: string; estado: string; temas: string[]; regla: string; habilidad: string }

/** Lo que importa de una decisión o una propuesta que ya está en el vault, para no repetirla. */
export function documentoExistente(texto: string): DocumentoExistente {
  const { datos } = partir(texto)
  const v = (k: string) => (datos[k] ?? '').trim()
  return { id: v('id'), titulo: v('titulo'), estado: v('estado'), temas: v('temas').split(',').map(temaNormal).filter(Boolean), regla: v('regla'), habilidad: v('habilidad') }
}

const igualTexto = (a: string, b: string) => {
  const n = (t: string) => unaLinea(comparable(t)).replace(/[.;:!¡?¿«»"']+/g, '').trim()
  return n(a) !== '' && n(a) === n(b)
}
const mismosTemas = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(t => b.includes(t))

/** La que ya dice lo mismo: el mismo título, los mismos temas y la misma regla, o la misma habilidad. */
export function igualA(p: PropuestaDeTarea, existentes: readonly DocumentoExistente[]): DocumentoExistente | null {
  return existentes.find(d =>
    igualTexto(p.titulo, d.titulo)
    || (p.regla && mismosTemas(p.temas, d.temas) && igualTexto(p.regla, d.regla))
    || (p.habilidad && d.habilidad === p.habilidad.nombre)) ?? null
}

const palabrasDe = (t: string) => comparable(t).split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** Si un texto copia un tramo de otro: ocho palabras seguidas iguales. */
export function copiaDe(texto: string, fuente: string, palabras = 8): boolean {
  const f = palabrasDe(fuente)
  if (f.length < palabras) return false
  const tramos = new Set<string>()
  for (let i = 0; i + palabras <= f.length; i++) tramos.add(f.slice(i, i + palabras).join(' '))
  const t = palabrasDe(texto)
  for (let i = 0; i + palabras <= t.length; i++) if (tramos.has(t.slice(i, i + palabras).join(' '))) return true
  return false
}

/** Si el pedido de la tarea es texto de un issue: entró por la Entrada y no desde el formulario. */
export const pedidoDeUnIssue = (origenEntrada: string | undefined) => !!origenEntrada?.trim() && origenEntrada.trim() !== 'formulario'

/** Las decisiones que cita la tarea (su spec las nombra en «Riesgos y notas»). */
export const decisionesCitadas = (cuerpo: string) => [...new Set(cuerpo.match(/\bD-\d{4,}\b/g) ?? [])].sort()

export type EntradaDeBitacora = { fecha: string; tarea: string; titulo: string; estado: string; toca: readonly string[]; decisiones: readonly string[]; habilidades?: readonly string[] }

/**
 * Una línea de la bitácora: `- AAAA-MM-DD · F-014 · título · hecha · toca: a, b · decisiones: D-0001 ·
 * habilidades: wolff-db`. Cabe en 200 caracteres: de lo que toca entran los archivos que quepan, y el
 * resto se cuenta.
 */
export function lineaDeBitacora(e: EntradaDeBitacora): string {
  const limpio = (t: string) => unaLinea(t).replaceAll('·', '-')
  const armar = (titulo: string, toca: string) => `- ${[
    e.fecha, e.tarea, titulo, limpio(e.estado),
    ...(toca ? [`toca: ${toca}`] : []),
    ...(e.decisiones.length ? [`decisiones: ${e.decisiones.join(', ')}`] : []),
    ...(e.habilidades?.length ? [`habilidades: ${e.habilidades.join(', ')}`] : []),
  ].join(' · ')}`
  let titulo = limpio(e.titulo) || '(sin título)'
  const sinToca = armar(titulo, '')
  if (sinToca.length > TOPE_DE_LINEA) titulo = `${titulo.slice(0, Math.max(10, titulo.length - (sinToca.length - TOPE_DE_LINEA) - 1))}…`
  const archivos = e.toca.map(limpio).filter(Boolean)
  let entran = archivos.length
  const toca = (n: number) => [...archivos.slice(0, n), ...(n < archivos.length ? [`y ${archivos.length - n} más`] : [])].join(', ')
  while (entran > 0 && armar(titulo, toca(entran)).length > TOPE_DE_LINEA) entran--
  const linea = armar(titulo, archivos.length ? toca(entran) : '')
  return linea.length > TOPE_DE_LINEA ? armar(titulo, '') : linea
}

export type ArchivoNuevo = { nombre: string; texto: string }

/**
 * Lo que queda en el vault cuando una tarea pasa a `hecho`: un archivo en `propuestas/` por cada
 * propuesta de su `## Para la memoria`, y su línea en la bitácora del mes. No se crea la que ya está
 * (rechazada o no), ni la que copia el texto de un issue: lo que propone la fábrica sale de los
 * agentes, y lo que dice un issue no llega a la memoria. `nota` va a la bitácora de la tarea.
 */
export function cierreEnLaMemoria(e: {
  tarea: { id: string; titulo: string; tituloAjeno: boolean; origenEntrada?: string; cuerpo: string }
  ahora: string
  existentes: { propuestas: readonly ArchivoNuevo[]; decisiones: readonly ArchivoNuevo[] }
  bitacora: string | null
  toca: readonly string[]
  /** Las habilidades que el proyecto ya tiene (las carpetas de `.claude/skills/`): no se proponen otra vez. */
  habilidadesDelProyecto?: readonly string[]
}): { propuestas: ArchivoNuevo[]; bitacora: ArchivoNuevo; nota: string } {
  const fecha = e.ahora.slice(0, 10)
  const { propuestas, problemas } = propuestasDe(e.tarea.cuerpo)
  const existentes = [...e.existentes.propuestas, ...e.existentes.decisiones].map(a => documentoExistente(a.texto))
  const ids = [...e.existentes.propuestas.map(a => /^(P-\d+)/.exec(a.nombre)?.[1] ?? ''), ...existentes.map(d => d.id)]
  const pedido = e.tarea.origenEntrada && pedidoDeUnIssue(e.tarea.origenEntrada) ? seccion(e.tarea.cuerpo, 'Pedido') : ''

  const nuevas: ArchivoNuevo[] = []
  const creadas: string[] = []
  const fuera: string[] = [...problemas]
  for (const p of propuestas) {
    const todo = [p.titulo, p.regla, ...Object.values(p.secciones), p.habilidad?.cuando ?? '', ...(p.habilidad?.archivos.map(a => a.texto) ?? [])].join('\n')
    if (pedido && copiaDe(todo, pedido)) {
      fuera.push('una repite el texto del issue')
      continue
    }
    if (p.habilidad && e.habilidadesDelProyecto?.includes(p.habilidad.nombre)) {
      fuera.push(`«${p.habilidad.nombre}» ya es una habilidad del proyecto`)
      continue
    }
    const igual = igualA(p, existentes)
    if (igual) {
      fuera.push(`«${p.titulo.slice(0, 60)}» ya está en ${igual.id || 'el vault'}${igual.estado === 'rechazada' ? ', rechazada' : ''}`)
      continue
    }
    const id = siguientePropuesta(ids)
    ids.push(id)
    nuevas.push({ nombre: nombreDeDocumento(id, p.titulo), texto: documentoDePropuesta(p, { id, fecha, origen: e.tarea.id }) })
    existentes.push({ id, titulo: p.titulo, estado: 'propuesta', temas: p.temas, regla: p.regla, habilidad: p.habilidad?.nombre ?? '' })
    creadas.push(id)
  }

  const linea = lineaDeBitacora({
    fecha, tarea: e.tarea.id, titulo: e.tarea.tituloAjeno ? '(título de un issue)' : e.tarea.titulo,
    estado: 'hecha', toca: e.toca, decisiones: decisionesCitadas(e.tarea.cuerpo), habilidades: habilidadesDeLaTarea(e.tarea.cuerpo),
  })
  const previa = (e.bitacora ?? `# Bitácora de ${fecha.slice(0, 7)}\n`).replace(/\r\n?/g, '\n').replace(/\s*$/, '\n')
  const bitacora = { nombre: `${fecha.slice(0, 7)}.md`, texto: `${previa}${/^- /m.test(previa) ? '' : '\n'}${linea}\n` }

  const nota = [
    creadas.length ? `memoria: ${creadas.length === 1 ? 'propuesta' : 'propuestas'} ${creadas.join(', ')} para que las apruebe una persona.` : '',
    fuera.length ? `memoria: no se ${fuera.length === 1 ? 'propuso' : 'propusieron'}: ${fuera.join('; ')}.` : '',
  ].filter(Boolean).join(' ')
  return { propuestas: nuevas, bitacora, nota }
}
