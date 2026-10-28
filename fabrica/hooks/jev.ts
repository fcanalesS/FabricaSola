// Jev, de TypeSafe AI, decide en la fábrica dónde no hace falta gastar: si una tarea necesita
// correr sus pruebas unitarias y qué revisores de Claude vale la pena lanzar. Jev no genera texto:
// contesta preguntas de sí o no con una probabilidad, en unos cientos de milisegundos y por muy
// poco.
//
// Lo que decide aquí siempre se puede deshacer y siempre se anota: lo que no se corrió queda en el
// archivo de la tarea, en los eventos y en el informe de la corrida. Y ante la duda se gasta: sin
// clave, si Jev no contesta, o si no está claro, se corren las pruebas y se lanzan los revisores.
//
// A Jev le llega el título de la tarea y la lista de archivos que cambiaron, con sus líneas. Nunca
// el código, el diff ni la spec.
import type { EngineInterface } from 'claude-code'

export const URL_DE_JEV = 'https://api.typesafe.ai/v1/systemone'
const MODELO = 'jev-latest'
/** Jev tarda unos 0,3 s. Si pasa de esto, se sigue como si no hubiera contestado. */
const ESPERA_MS = 4000

export type PreguntaJev = { type: 'noul'; instructions: string; criteria: { true: string; false: string } }
export type RespuestaJev = { noul?: number }

/**
 * Los umbrales, medidos el 17 de octubre de 2026 con 22 pedidos y 18 cambios escritos a mano
 * (orquestador/scripts/jev/: casos.json, medir.mjs y lo medido). Pruebas y seguridad se ahorran
 * con p por debajo; spec y modelo, con p por encima. Cada uno quedó donde ahorra sin errores en
 * esos casos, con margen. Con lo que se aprende en las corridas (aprendizaje.ts) se aprietan solos.
 *
 *  - pruebas: con 0,2 se saltaba un cambio de vista con lógica (0,17); con 0,15, ahorra 6 de 10.
 *  - seguridad: lo inofensivo quedó hasta 0,40 y lo delicado desde 0,55; 0,3 ahorra 12 de 13.
 *  - spec: los pedidos vagos, hasta 0,19; los que ya eran spec, desde 0,65. 0,5 ahorra los 11.
 *  - modelo: lo complejo, hasta 0,35; lo simple, desde 0,38: muy justo. 0,6 ahorra 11 de 12.
 *  - integracion (medido el 27 de octubre con 27 cambios, scripts/fabrica/jev-integracion.mjs): lo
 *    que tiene lógica, hasta 0,48 (un «cambia el color» que tocaba precios); lo superficial, desde
 *    0,85. 0,7 queda en medio, más cerca de lo seguro, y acierta los 27.
 */
export const UMBRALES = { pruebas: 0.15, seguridad: 0.3, spec: 0.5, modelo: 0.6, integracion: 0.7 } as const

// ---- Lo que cambió ----------------------------------------------------------------------------

export type Cambio = { ruta: string; agregadas: number; quitadas: number }

/** De `git diff --numstat` a la lista de cambios. Los binarios traen «-»: cuentan como cero líneas. */
export function cambiosDeNumstat(salida: string): Cambio[] {
  return salida
    .split(/\r?\n/)
    .map(l => l.split('\t'))
    .filter(p => p.length >= 3 && p[2].trim())
    .map(([a, q, ruta]) => ({ ruta: ruta.trim(), agregadas: Number(a) || 0, quitadas: Number(q) || 0 }))
}

/** Lo que no se ejecuta ni lo cubre una prueba unitaria: documentación, textos, imágenes, licencias y estilos. */
const SIN_LOGICA = /\.(md|mdx|markdown|txt|rst|adoc|png|jpe?g|gif|svg|webp|ico|pdf|css|scss|sass|less)$|(^|\/)(LICENSE|LICENCIA|CHANGELOG|AUTHORS|\.gitignore|\.gitattributes|\.editorconfig)$/i
/**
 * Código con lógica: si cambió uno de estos, las pruebas se corren sin preguntar. Lo que queda en
 * medio (vistas, plantillas, configuración, traducciones) es lo que se le pregunta a Jev: una
 * prueba con un título engañoso le hizo saltar las pruebas de un cálculo.
 */
const CON_LOGICA = /\.(ts|mts|cts|js|mjs|cjs|cs|py|java|kt|kts|go|rb|php|rs|swift|c|cc|cpp|h|hpp|m|sql|sh|bash|ps1|psm1|fs|vb|scala|dart|lua|ex|exs|clj)$/i
/** Lo que toca seguridad por su nombre: con uno de estos, se revisa sin preguntar. */
const SENSIBLE = /(auth|login|logout|password|contrase|token|secret|session|sesion|permis|role|crypto|cifr|sql|query|consulta|upload|middleware|cors|csrf|\.env|docker|package(-lock)?\.json|requirements|\.csproj|pom\.xml|gradle|appsettings|web\.config|settings)/i
/** Los archivos de la propia fábrica (sus tareas, sus eventos) no son un cambio del proyecto. */
const DE_LA_FABRICA = /(^|\/)(factory\/|\.fabrica)/

export const delProyecto = (cambios: readonly Cambio[]) => cambios.filter(c => !DE_LA_FABRICA.test(c.ruta))
export const soloSinLogica = (cambios: readonly Cambio[]) => cambios.length > 0 && cambios.every(c => SIN_LOGICA.test(c.ruta))
const conLogica = (cambios: readonly Cambio[]) => cambios.find(c => CON_LOGICA.test(c.ruta))
const sensible = (cambios: readonly Cambio[]) => cambios.find(c => SENSIBLE.test(c.ruta))

/** Lo que va hacia Jev: el título y los archivos con sus líneas. Nada del contenido. */
export function estadoParaJev(titulo: string, cambios: readonly Cambio[]) {
  return {
    tarea: titulo.slice(0, 160),
    archivos_cambiados: cambios.slice(0, 60).map(c => `${c.ruta} (+${c.agregadas} −${c.quitadas})`),
    total_de_archivos: cambios.length,
    lineas_cambiadas: cambios.reduce((s, c) => s + c.agregadas + c.quitadas, 0),
  }
}

// ---- Las preguntas ------------------------------------------------------------------------------

export const PREGUNTA_DE_PRUEBAS: PreguntaJev = {
  type: 'noul',
  instructions: 'Por la tarea y los archivos que cambiaron, ¿hace falta correr las pruebas unitarias del proyecto para confiar en este cambio?',
  criteria: {
    true: 'cambia código que se ejecuta: lógica, cálculos, validaciones, datos, consultas, APIs, dependencias o configuración que el programa lee',
    false: 'solo cambia lo que las pruebas unitarias no cubren: textos visibles, documentación, comentarios, estilos visuales, traducciones o recursos',
  },
}

export const PREGUNTA_DE_SEGURIDAD: PreguntaJev = {
  type: 'noul',
  instructions: 'Por la tarea y los archivos que cambiaron, ¿puede este cambio abrir un problema de seguridad?',
  criteria: {
    true: 'toca entradas del usuario, autenticación, permisos, sesiones, datos personales, consultas a la base, archivos, red, comandos, secretos, dependencias o configuración',
    false: 'solo toca presentación, textos, estilos, documentación o lógica interna que no recibe datos de afuera',
  },
}

/**
 * Para saltar el agente de spec: si el pedido ya dice qué hacer, con criterios que se puedan
 * comprobar. Esta y la del tamaño son las únicas que leen el pedido: el código, nunca.
 */
export const PREGUNTA_DE_SPEC: PreguntaJev = {
  type: 'noul',
  instructions: '¿Este pedido ya sirve como especificación para programarlo: dice qué hay que hacer, dónde, y con criterios de aceptación que se pueden comprobar?',
  criteria: {
    true: 'trae el comportamiento esperado, los casos o criterios verificables y el alcance; un programador podría construirlo sin preguntar nada',
    false: 'es una idea, un deseo o un título; falta decir cómo debe comportarse, qué casos cubrir o cómo saber que está listo',
  },
}

/** Para construir con un modelo más barato: si la tarea es chica y acotada. */
export const PREGUNTA_DE_TAMANO: PreguntaJev = {
  type: 'noul',
  instructions: '¿Es una tarea de programación pequeña y acotada, que un modelo más simple puede construir bien a la primera?',
  criteria: {
    true: 'un cambio chico y local: un texto, un campo, una validación simple, un filtro o un orden, en uno o dos archivos, sin decisiones de diseño',
    false: 'toca varias partes, datos, permisos o integraciones, cambia comportamiento existente, exige diseñar, o puede romper otras cosas',
  },
}

/**
 * Para que una tarea aprobada se integre sola: si el cambio es
 * superficial. Le llegan el título y los archivos con sus líneas, nunca el código. Antes, el piso del
 * código ya marcó grande lo delicado (hooks/integracion.ts): Jev no lo puede bajar.
 */
export const PREGUNTA_DE_INTEGRACION: PreguntaJev = {
  type: 'noul',
  instructions: 'Por la tarea y los archivos que cambiaron, ¿es un cambio superficial, que se puede integrar sin que una persona lo pruebe a mano?',
  criteria: {
    true: 'solo cambia lo que se ve: textos, etiquetas, colores, estilos, íconos, el orden o el tamaño de elementos, o traducciones; no cambia qué hace el programa',
    false: 'cambia comportamiento: lógica, cálculos, validaciones, datos, permisos, navegación, llamadas a servicios, el estado de una pantalla o la configuración; o toca varias partes a la vez',
  },
}

/** Lo que va hacia Jev para las preguntas del pedido: el título y el pedido, recortado. */
export function pedidoParaJev(titulo: string, pedido: string) {
  return { tarea: titulo.slice(0, 160), pedido: pedido.slice(0, 3000) }
}

// ---- Las decisiones (lógica pura) ---------------------------------------------------------------

/** `por`: quién decidió. `p`: lo que dijo Jev, si se le preguntó. */
export type Decision = { si: boolean; por: 'regla' | 'jev' | 'sin_jev'; p: number | null; motivo: string }

/**
 * Lo que dijo Jev, contra el umbral. `si`: hay que hacerlo (correr, revisar, escribir la spec,
 * usar el modelo de siempre). `sentido`: bajo, se ahorra si p < umbral; alto, si p ≥ umbral.
 */
const deJev = (p: number | undefined, umbral: number, sentido: 'bajo' | 'alto', que: string, ahorro: string): Decision => {
  if (typeof p !== 'number' || !Number.isFinite(p)) return { si: true, por: 'sin_jev', p: null, motivo: `Jev no contestó: ${que} por si acaso` }
  const ahorra = sentido === 'bajo' ? p < umbral : p >= umbral
  return ahorra
    ? { si: false, por: 'jev', p, motivo: `Jev ve claro que ${ahorro} (p=${p.toFixed(2)}, umbral ${umbral.toFixed(2)})` }
    : { si: true, por: 'jev', p, motivo: `Jev no lo ve claro (p=${p.toFixed(2)}, umbral ${umbral.toFixed(2)}): ${que}` }
}

/**
 * Si se corren las pruebas unitarias. Las reglas van antes que Jev: con Jev apagado, después de
 * una verificación fallida o sin saber qué cambió, se corren; si solo cambió lo que no se ejecuta,
 * no. `jev`: la probabilidad que dio, o `undefined` si no se le preguntó o no contestó.
 */
export function decidirPruebas(d: { conJev: boolean; fallóAntes: boolean; cambios: readonly Cambio[] | null; jev?: number; umbral?: number }): Decision {
  if (d.fallóAntes) return { si: true, por: 'regla', p: null, motivo: 'la verificación anterior falló' }
  if (!d.cambios || !d.cambios.length) return { si: true, por: 'regla', p: null, motivo: 'no se pudo saber qué cambió' }
  if (soloSinLogica(d.cambios)) return { si: false, por: 'regla', p: null, motivo: 'solo cambiaron documentación, textos, imágenes o estilos' }
  const logica = conLogica(d.cambios)
  if (logica) return { si: true, por: 'regla', p: null, motivo: `cambió código con lógica (${logica.ruta})` }
  if (!d.conJev) return { si: true, por: 'regla', p: null, motivo: 'Jev está apagado' }
  return deJev(d.jev, d.umbral ?? UMBRALES.pruebas, 'bajo', 'se corren', 'no hacen falta')
}

/** Si hace falta la revisión de seguridad. Igual que las pruebas: ante la duda, se revisa. */
export function decidirSeguridad(d: { conJev: boolean; cambios: readonly Cambio[] | null; jev?: number; umbral?: number }): Decision {
  if (!d.cambios || !d.cambios.length) return { si: true, por: 'regla', p: null, motivo: 'no se pudo saber qué cambió' }
  if (soloSinLogica(d.cambios)) return { si: false, por: 'regla', p: null, motivo: 'solo cambiaron documentación, textos, imágenes o estilos' }
  const delicado = sensible(d.cambios)
  if (delicado) return { si: true, por: 'regla', p: null, motivo: `toca algo sensible (${delicado.ruta})` }
  if (!d.conJev) return { si: true, por: 'regla', p: null, motivo: 'Jev está apagado' }
  return deJev(d.jev, d.umbral ?? UMBRALES.seguridad, 'bajo', 'se revisa', 'no hace falta')
}

/**
 * Si hace falta el agente de spec. Si el pedido ya es una spec, el mod lo deja como tal. Solo la
 * primera vez: con una spec escrita, o de vuelta de un humano, sigue el camino de siempre.
 */
export function decidirSpec(d: { conJev: boolean; pedido: string; yaTieneSpec: boolean; dependeDe?: readonly string[]; jev?: number; umbral?: number; prohibidos?: readonly string[] }): Decision {
  if (d.yaTieneSpec) return { si: true, por: 'regla', p: null, motivo: 'la tarea ya tiene una spec' }
  // El pedido nombra algo que la memoria del proyecto prohíbe: la spec lo revisa contra sus decisiones.
  if (d.prohibidos?.length) return { si: true, por: 'regla', p: null, motivo: `el pedido nombra ${d.prohibidos.map(t => `«${t}»`).join(', ')}, que la memoria prohíbe: la spec lo revisa` }
  if (d.pedido.trim().length < 40) return { si: true, por: 'regla', p: null, motivo: 'el pedido es demasiado corto para ser una spec' }
  // Lo que cita el pedido puede no estar en la base todavía (en F-010, una clase que solo existía
  // sin commit en la copia del usuario): la spec lo comprueba contra la rama de origen.
  if (d.dependeDe?.length) return { si: true, por: 'regla', p: null, motivo: `depende de ${d.dependeDe.join(', ')}: la spec comprueba lo que cita contra la base` }
  if (reutilizaCodigo(d.pedido)) return { si: true, por: 'regla', p: null, motivo: 'reutiliza código existente: la spec comprueba que exista en la base' }
  if (!d.conJev) return { si: true, por: 'regla', p: null, motivo: 'Jev está apagado' }
  return deJev(d.jev, d.umbral ?? UMBRALES.spec, 'alto', 'se escribe la spec', 'el pedido ya es una spec')
}

/**
 * Si el pedido dice, en «Archivos o zonas que toca», que reutiliza algo existente (un método, una
 * clase, un archivo): con «reutiliza» o «existente» en esa sección.
 */
export function reutilizaCodigo(pedido: string): boolean {
  const m = /^(#{2,6}\s+|\*\*)archivos o zonas que toca\b.*$/im.exec(pedido.replace(/\r\n/g, '\n'))
  if (!m) return false
  const resto = pedido.replace(/\r\n/g, '\n').slice(m.index + m[0].length)
  const fin = resto.search(/^#{1,6}\s/m)
  return /\breutiliz|\bexistentes?\b/i.test(fin < 0 ? resto : resto.slice(0, fin))
}

/**
 * Si se construye con un modelo más barato. Nunca en retrabajo: si ya volvió una vez, va con el
 * modelo de siempre.
 */
export function decidirModelo(d: { conJev: boolean; vueltas: number; jev?: number; umbral?: number }): Decision {
  if (d.vueltas > 0) return { si: true, por: 'regla', p: null, motivo: 'es una vuelta de retrabajo' }
  if (!d.conJev) return { si: true, por: 'regla', p: null, motivo: 'Jev está apagado' }
  return deJev(d.jev, d.umbral ?? UMBRALES.modelo, 'alto', 'va con el modelo de siempre', 'es simple')
}

/** Si hace falta la revisión de código: siempre, salvo que solo cambie lo que no se ejecuta. */
export function decidirCodigo(cambios: readonly Cambio[] | null): Decision {
  return cambios && soloSinLogica(cambios)
    ? { si: false, por: 'regla', p: null, motivo: 'solo cambiaron documentación, textos, imágenes o estilos' }
    : { si: true, por: 'regla', p: null, motivo: 'cambió código' }
}

/**
 * La revisión de UI, con la regla de `ui` en config: aquí no pregunta a Jev. Las vistas y los
 * estilos cuentan siempre; un .ts o .js, solo si vive donde viven las vistas (en una corrida sobre
 * Atalaya se lanzó el revisor de UI por una función de src/lib).
 */
const VISTAS = /\.(cshtml|razor|html|css|scss|sass|less|tsx|jsx|vue|svelte|xaml)$/i
const JS_DE_CLIENTE = /\.(ts|js|mjs)$/i
const DONDE_VAN_LAS_VISTAS = /(^|\/)(components?|componentes|pages|views|vistas|app|public|wwwroot|ui|hud|client|cliente)\//i
const esVista = (ruta: string) => VISTAS.test(ruta) || (JS_DE_CLIENTE.test(ruta) && DONDE_VAN_LAS_VISTAS.test(ruta))
export function decidirUi(ui: 'auto' | 'si' | 'no', cambios: readonly Cambio[] | null): Decision {
  if (ui === 'si') return { si: true, por: 'regla', p: null, motivo: 'config pide ui: si' }
  if (ui === 'no') return { si: false, por: 'regla', p: null, motivo: 'config pide ui: no' }
  if (!cambios || !cambios.length) return { si: true, por: 'regla', p: null, motivo: 'no se pudo saber qué cambió' }
  return cambios.some(c => esVista(c.ruta))
    ? { si: true, por: 'regla', p: null, motivo: 'el diff toca vistas, estilos o JS de cliente' }
    : { si: false, por: 'regla', p: null, motivo: 'el diff no toca vistas ni estilos' }
}

// ---- El cliente ---------------------------------------------------------------------------------

/**
 * Si se puede preguntar a Jev: hay clave y no está apagado en config (`jev: no`). En una corrida
 * del orquestador llega como FABRICA_JEV_KEY, con otro nombre a propósito: con el de siempre, las
 * pruebas del proyecto la verían (a Atalaya le cambiaba una prueba). Fuera de él, TYPESAFE_AI_KEY.
 */
export async function claveDeJev($: EngineInterface, jevEnConfig: string): Promise<string> {
  if (jevEnConfig === 'no') return ''
  const propia = (await $.env.get('FABRICA_JEV_KEY').catch(() => undefined))?.trim()
  return propia || ((await $.env.get('TYPESAFE_AI_KEY').catch(() => undefined)) ?? '').trim()
}

/** Lo que los comandos del proyecto (build, test, lint) no deben ver: la clave de Jev, con cualquiera de sus nombres. */
export const SIN_CLAVES_DE_LA_FABRICA: Record<string, string> = { FABRICA_JEV_KEY: '', TYPESAFE_AI_KEY: '' }

/**
 * Le hace preguntas a Jev. Nunca lanza: `null` es la señal de seguir como si Jev no existiera, que
 * es gastar.
 */
export async function preguntarJev($: EngineInterface, clave: string, estado: unknown, preguntas: Record<string, PreguntaJev>): Promise<Record<string, RespuestaJev> | null> {
  if (!clave) return null
  try {
    const pedido = $.http.fetch(URL_DE_JEV, {
      method: 'POST',
      headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, state: estado, questions: preguntas }),
    }) as Promise<{ status?: number; ok?: boolean; text?: string | (() => Promise<string>); json?: () => Promise<unknown> }>
    const espera = new Promise<null>(listo => setTimeout(() => listo(null), ESPERA_MS))
    const r = await Promise.race([pedido, espera])
    if (!r || (typeof r.status === 'number' && (r.status < 200 || r.status >= 300))) return null
    // En un mod, $.http.fetch devuelve el cuerpo ya leído, como texto, en `text`; se acepta también la forma de fetch.
    const cuerpo = typeof r.text === 'string' ? r.text : typeof r.text === 'function' ? await r.text() : typeof r.json === 'function' ? JSON.stringify(await r.json()) : ''
    const datos = JSON.parse(cuerpo || 'null') as { answers?: Record<string, RespuestaJev> } | null
    return datos?.answers ?? null
  } catch {
    return null
  }
}
