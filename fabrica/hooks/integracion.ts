/**
 * Si una tarea aprobada es sencilla o grande. La sencilla se
 * integra sola; la grande espera a la persona, que la prueba a mano. Aquí está el piso: lo que es
 * grande sin preguntarle a nadie. Jev clasifica lo demás; sin Jev, ante la duda, grande. Es lógica
 * pura.
 *
 * El piso no nombra ningún lenguaje: trae solo lo que es delicado en cualquier proyecto (la base,
 * el pipeline, las dependencias). Lo propio de cada stack lo marca la persona en la ficha de la
 * línea, con reglas del tema `nucleo`. La misma lista vive en la aplicación
 * (src/lib/fabrica/procesos/salida.ts, `LO_DELICADO`), con los mismos casos de prueba.
 */

import { soloSinLogica, UMBRALES, type Cambio } from './jev'

/** Una regla de lo delicado: el patrón de las rutas y por qué. */
export type ReglaDelicada = { patron: string; porque: string }

/** Lo de la base de datos en cualquier proyecto. */
export const LO_DE_LA_BASE: readonly ReglaDelicada[] = [
  { patron: '**/migrations/**', porque: 'una migración' },
  { patron: '**/*.sql', porque: 'SQL' },
]

/** Lo delicado en cualquier proyecto: la base, el pipeline y las dependencias. */
export const LO_DELICADO: readonly ReglaDelicada[] = [
  ...LO_DE_LA_BASE,
  { patron: '.github/workflows/**', porque: 'el pipeline' },
  { patron: '**/.gitlab-ci.yml', porque: 'el pipeline' },
  { patron: '**/azure-pipelines.yml', porque: 'el pipeline' },
  { patron: '**/Jenkinsfile', porque: 'el pipeline' },
  { patron: '**/package.json', porque: 'las dependencias' },
  { patron: '**/package-lock.json', porque: 'las dependencias' },
  { patron: '**/*.csproj', porque: 'las dependencias' },
  { patron: '**/requirements.txt', porque: 'las dependencias' },
  { patron: '**/pyproject.toml', porque: 'las dependencias' },
  { patron: '**/go.mod', porque: 'las dependencias' },
  { patron: '**/Cargo.toml', porque: 'las dependencias' },
]

/** Desde cuántas líneas o archivos cambiados una tarea es grande. Se cambian en config.md. */
export const TOPES_POR_DEFECTO = { lineas: 400, archivos: 15 } as const

/** Desde cuántas vueltas de retrabajo una tarea es grande. */
export const VUELTAS_DE_GRANDE = 2

/** Cuántas rutas se nombran en el motivo; las demás se cuentan. */
const A_LA_VISTA = 3

/**
 * Si una ruta (con `/`) coincide con un patrón: `**` es cualquier parte del camino, `*` y `?`
 * dentro de una carpeta. Un patrón sin comodines es esa ruta o lo que hay debajo. Sin importar
 * mayúsculas, como en Windows. La misma cuenta que la aplicación.
 */
export function coincide(patron: string, ruta: string): boolean {
  const p = patron.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  const r = ruta.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!p) return false
  if (!/[*?]/.test(p)) return r.toLowerCase() === p.toLowerCase() || r.toLowerCase().startsWith(`${p.toLowerCase()}/`)
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!
    if (c === '*' && p[i + 1] === '*') {
      // `**/` es cero o más carpetas; `**` solo, cualquier cosa.
      if (p[i + 2] === '/') {
        re += '(?:.*/)?'
        i += 2
      } else {
        re += '.*'
        i += 1
      }
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'i').test(r)
}

const NUCLEO = /^- \[nucleo\]\s+(.+?)\s*$/

/**
 * Las reglas del núcleo de la ficha de una línea: `- [nucleo] db/servidor/** — el esquema`. El
 * patrón es lo primero (con o sin comillas invertidas); lo que va después de una raya es el porqué,
 * sin la fuente entre paréntesis del final. La misma lectura que la aplicación.
 */
export function nucleoDeLaFicha(ficha: string | null): ReglaDelicada[] {
  const out: ReglaDelicada[] = []
  for (const l of (ficha ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = NUCLEO.exec(l)
    if (!m) continue
    const [primero = '', ...resto] = m[1]!.replace(/\s*\([^()]+\)\s*$/, '').trim().split(/\s+/)
    const patron = primero.replace(/^`|`$/g, '')
    const porque = resto.join(' ').replace(/^[—–-]+\s*/, '').trim()
    if (patron) out.push({ patron, porque: porque ? `núcleo: ${porque}` : 'el núcleo' })
  }
  return out
}

/** Lo delicado de un cambio: cada ruta con la primera regla que la marca (el núcleo antes que el piso). */
export function loDelicado(rutas: readonly string[], nucleo: readonly ReglaDelicada[]): { ruta: string; porque: string }[] {
  const reglas = [...nucleo, ...LO_DELICADO]
  const out: { ruta: string; porque: string }[] = []
  for (const ruta of rutas) {
    const regla = reglas.find(r => coincide(r.patron, ruta))
    if (regla) out.push({ ruta, porque: regla.porque })
  }
  return out
}

export type TipoDeIntegracion = 'sencilla' | 'grande'
export type Clasificacion = { tipo: TipoDeIntegracion; por: 'regla' | 'jev' | 'sin_jev'; motivo: string }

export type DatosDeLaClasificacion = {
  /** Lo que cambió del proyecto; `null` si git no lo pudo decir. */
  cambios: readonly Cambio[] | null
  nucleo: readonly ReglaDelicada[]
  topes: { lineas: number; archivos: number }
  vueltas: number
  /** Si la tarea propone algo para la memoria: cambiaría las reglas del proyecto. */
  proponeMemoria: boolean
  /** Si se le puede preguntar a Jev (hay clave y config no lo apaga). */
  conJev?: boolean
  /** Lo que dijo Jev: la probabilidad de que el cambio sea superficial. */
  jev?: number
  /** Desde cuánto Jev la deja entrar sola, con lo aprendido. */
  umbral?: number
}

/** Por qué una tarea es grande sin preguntarle a nadie, o `null` si el piso no la marca. */
export function grandePorElPiso(d: DatosDeLaClasificacion): string | null {
  if (!d.cambios) return 'git no pudo decir qué cambió'
  const delicados = loDelicado(d.cambios.map(c => c.ruta), d.nucleo)
  if (delicados.length) {
    const nombrados = delicados.slice(0, A_LA_VISTA).map(x => `${x.ruta} (${x.porque})`)
    const mas = delicados.length > A_LA_VISTA ? ` y ${delicados.length - A_LA_VISTA} más` : ''
    return `toca lo delicado: ${nombrados.join(', ')}${mas}`
  }
  const lineas = d.cambios.reduce((s, c) => s + c.agregadas + c.quitadas, 0)
  if (lineas > d.topes.lineas) return `cambia ${lineas} líneas (más de ${d.topes.lineas})`
  if (d.cambios.length > d.topes.archivos) return `cambia ${d.cambios.length} archivos (más de ${d.topes.archivos})`
  if (d.vueltas >= VUELTAS_DE_GRANDE) return `necesitó ${d.vueltas} vueltas de retrabajo`
  if (d.proponeMemoria) return 'propone algo para la memoria del proyecto'
  return null
}

/**
 * Sencilla o grande. El piso manda; lo que solo cambia documentación, textos, imágenes o estilos es
 * sencillo por regla; lo demás lo decide Jev contra su umbral (sentido alto: entra sola si p llega).
 * Sin Jev, si no contesta o si no lo ve claro, grande: ante la duda, la tarea espera.
 */
export function clasificar(d: DatosDeLaClasificacion): Clasificacion {
  const piso = grandePorElPiso(d)
  if (piso) return { tipo: 'grande', por: 'regla', motivo: piso }
  if (!d.cambios!.length) return { tipo: 'sencilla', por: 'regla', motivo: 'no cambió nada del proyecto' }
  if (soloSinLogica(d.cambios!)) return { tipo: 'sencilla', por: 'regla', motivo: 'solo cambian documentación, textos, imágenes o estilos' }
  if (!d.conJev) return { tipo: 'grande', por: 'sin_jev', motivo: 'sin Jev: ante la duda, espera tu prueba' }
  const p = d.jev
  if (typeof p !== 'number' || !Number.isFinite(p)) return { tipo: 'grande', por: 'sin_jev', motivo: 'Jev no contestó: ante la duda, espera tu prueba' }
  const umbral = d.umbral ?? UMBRALES.integracion
  const dicho = `p=${p.toFixed(2)}, umbral ${umbral.toFixed(2)}`
  return p >= umbral
    ? { tipo: 'sencilla', por: 'jev', motivo: `Jev ve el cambio superficial (${dicho})` }
    : { tipo: 'grande', por: 'jev', motivo: `Jev no lo ve superficial (${dicho})` }
}

/** Los topes de config.md (`grande_lineas`, `grande_archivos`), con los de siempre si no dicen otro. */
export function topesDesde(datos: Record<string, string | undefined>): { lineas: number; archivos: number } {
  const n = (v: string | undefined, def: number) => {
    const x = Number.parseInt(v ?? '', 10)
    return Number.isFinite(x) && x > 0 ? Math.min(x, 100_000) : def
  }
  return { lineas: n(datos.grande_lineas, TOPES_POR_DEFECTO.lineas), archivos: n(datos.grande_archivos, TOPES_POR_DEFECTO.archivos) }
}
