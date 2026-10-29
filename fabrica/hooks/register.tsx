// Fábrica de software. El estado vive en el proyecto, en factory/: una tarea por archivo
// Markdown, la configuración en config.md y cada cambio de estado como una línea de
// eventos.jsonl. Las transiciones las decide este módulo (tareas.ts), no el modelo: así el
// tablero, la bitácora y el puente con un orquestador externo dicen siempre lo mismo.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Estado, Evento, Tarea } from '../types'
import { AGENTE_DE_RETRABAJO, CATALOGO_DE_HABILIDADES, candidatosDeLaCorrida, ETAPA_DE_ROL, frenaHabilidad, frenaSinHabilidades, habilidadesDeLaCorridaDesde, habilidadesParaLosAgentes, huellaDe, lineaDeHabilidades, rolConHabilidades, rolDeAgente, specConHabilidades, tareaDelEncargo, ultimaDeLaBitacoraEs } from './habilidades'
import { CARPETA_DE_LA_MEMORIA, cierreEnLaMemoria, choquesConLaMemoria, memoriaParaLosAgentes, notaDeChoques, propuestasDe, type ArchivoNuevo } from './memoria'
import { clasificar, nucleoDeLaFicha } from './integracion'
import {
  anotar, candidatos, cola, contar, editaCamposDelMod, enShell, esArchivoDeTarea, esEstado, esRol,
  escribeCamposDelMod, fijarEnConfig, leerConfig, lineaDeEstado, mover, NOMBRES_DE_ROL, nombreDeCopia,
  partir, pideExterna, renombrarAgente, ROLES, SOLO_EL_MOD,
  siguienteId, slug, tareaDesde, tareaNueva, unir, veredictoDesde, vigente, type Config,
  seccion, ponerSeccion, masBarato, notaDelModeloDeSpec, specElegidaPorEl, construccionElegidaPorEl, yaAnotado, AGENTE_DE_SALIDA, salidaEnLaTarea, AGENTE_DE_ANUNCIO, anuncioEnLaTarea, sinLoDeLabel, anotarVeredicto,
  aCrlf, archivarHallazgos, archivosQueGitProtege, archivosQueToca, archivosSql, baseDeComparacion, bloqueantesEn, choquesDe, cicloDeDependencias, comandoDeLint,
  conArchivos, conHallazgoDeConflicto, decidirIntegracion, dependenciasDe, enComun, enlaceDeNodeModules, esDeTexto, esLockfile,
  esBloqueo, frenaConfig, frenaHabilidades, frenaMemoria, frenaProcesos, frenaReferencias, referenciasDesde, idsEn, liberadaPor, reintentoDeIntegracion, type Bloqueo, ramaDeOrigen, revisarDependencias, rutasDePorcelain, protegidaSinWorktree, ramaParaLaTarea, tieneMarcadores, tieneWorktreePropio, usaCrlf,
  type Datos, type EstadoDeDependencia, type Movimiento,
} from './tareas'
import {
  cambiosDeNumstat, claveDeJev, delProyecto, decidirCodigo, decidirModelo, decidirPruebas, decidirSeguridad, decidirSpec, decidirUi,
  estadoParaJev, pedidoParaJev, preguntarJev, PREGUNTA_DE_INTEGRACION, PREGUNTA_DE_PRUEBAS, PREGUNTA_DE_SEGURIDAD, PREGUNTA_DE_SPEC, PREGUNTA_DE_TAMANO, UMBRALES,
  SIN_CLAVES_DE_LA_FABRICA,
  type Cambio, type Decision,
} from './jev'
import {
  comandoDeAntigravity, comandoDeCodex, comandoDeEspera, comandoDelLanzador, ESPERA_POR_LLAMADA_MS, ESQUEMA_REVISION, estadoDelTrabajo, TOPE_EXTERNO_MS, type EstadoDelTrabajo, hallazgosEnMarkdown, leerRevisionDeCodex, leerSpecDeAntigravity,
  pedidoDeRevision, pedidoDeSpec, tokensDeCodex,
} from './externos'
import {
  esControl, lineasDeJev, pendientes, resultadoDePruebas, resultadosAlMover, umbralesAjustados, type DecisionDeJev, type LineaDeJev,
} from './aprendizaje'

const PANEL = 'fabrica'
const raizRef = atom({ plugin: 'fabrica', key: 'raiz' } as const, '')
const tareasRef = atom({ plugin: 'fabrica', key: 'tareas' } as const, [])
const eventosRef = atom({ plugin: 'fabrica', key: 'eventos' } as const, [])

const EVENTOS_EN_TABLERO = 8

// ---- Rutas y lectura ------------------------------------------------------------------------

const unirRuta = (...partes: string[]) => partes.join('/').replace(/\\/g, '/').replace(/\/{2,}/g, '/')

function rutas(raiz: string) {
  const f = unirRuta(raiz, 'factory')
  return {
    factory: f,
    config: unirRuta(f, 'config.md'),
    tareas: unirRuta(f, 'tareas'),
    veredictos: unirRuta(f, 'veredictos'),
    eventos: unirRuta(f, 'eventos.jsonl'),
    jev: unirRuta(f, 'jev.jsonl'),
  }
}

const leer = ($: EngineInterface, ruta: string) => $.fs.read(ruta).then(t => t as string).catch(() => undefined)

async function config($: EngineInterface, raiz: string): Promise<Config> {
  return leerConfig(await leer($, rutas(raiz).config))
}

// Lo leído se guarda por archivo y fecha de modificación: el reloj mira cada pocos
// segundos, y solo se vuelve a leer lo que cambió.
const cache = new Map<string, { mtime: number; tarea?: Tarea }>()
const veredictosVistos = new Map<string, number>()
let primeraPasada = true
let ultimaLinea: string | undefined
let mtimeEventos = -1

async function veredictos($: EngineInterface, raiz: string) {
  const dir = rutas(raiz).veredictos
  const out = new Map<string, { veredicto: 'aprobada' | 'rechazada'; motivo: string; por: string; mtime: number }>()
  const lista = await $.fs.list(dir).catch(() => [])
  for (const ent of lista) {
    if (ent.kind !== 'file' || !ent.name.endsWith('.json')) continue
    const v = veredictoDesde((await leer($, unirRuta(dir, ent.name))) ?? '')
    if (v) out.set(ent.name.replace(/\.json$/, ''), { ...v, mtime: ent.mtimeMs })
  }
  return out
}

async function refrescar($: EngineInterface) {
  const raiz = await $.session.root()
  const r = rutas(raiz)
  if (!(await $.fs.exists(r.tareas))) {
    if ((await read($, raizRef)) !== '') {
      await update($, raizRef, () => '')
      await update($, tareasRef, () => [])
      await update($, eventosRef, () => [])
    }
    if (ultimaLinea !== undefined) $.ui.status((ultimaLinea = undefined))
    return
  }

  const lista = (await $.fs.list(r.tareas)).filter(x => x.kind === 'file' && x.name.endsWith('.md'))
  const tareas: Tarea[] = []
  for (const ent of lista) {
    const ruta = unirRuta(r.tareas, ent.name)
    const prev = cache.get(ruta)
    if (prev && prev.mtime === ent.mtimeMs) {
      if (prev.tarea) tareas.push(prev.tarea)
      continue
    }
    const t = tareaDesde((await leer($, ruta)) ?? '', ruta)
    cache.set(ruta, { mtime: ent.mtimeMs, tarea: t })
    if (t) tareas.push(t)
  }

  // Lo que deja el orquestador externo: se pega a su tarea y, si es nuevo, se avisa.
  const ver = await veredictos($, raiz)
  for (const t of tareas) {
    const v = ver.get(t.id)
    if (!v || !vigente(v.mtime, t.enAprobacionDesde)) continue
    t.veredictoExterno = v.veredicto
    if (!primeraPasada && veredictosVistos.get(t.id) !== v.mtime) {
      $.ui.toast(`${t.id}: ${v.por} dejó "${v.veredicto}"${v.motivo ? ' — ' + v.motivo : ''}`)
      if (t.estado === 'aprobacion') void $.prompt.suggest({ text: `/fabrica:correr ${t.id}` }).catch(() => undefined)
    }
    veredictosVistos.set(t.id, v.mtime)
  }
  primeraPasada = false

  tareas.sort((a, b) => a.id.localeCompare(b.id))
  if ((await read($, raizRef)) !== raiz) await update($, raizRef, () => raiz)
  const antes = JSON.stringify(await read($, tareasRef))
  if (antes !== JSON.stringify(tareas)) await update($, tareasRef, () => tareas)

  const st = await $.fs.stat(r.eventos).catch(() => undefined)
  if (st && st.mtimeMs !== mtimeEventos) {
    mtimeEventos = st.mtimeMs
    const ultimos = ((await leer($, r.eventos)) ?? '').split('\n').filter(Boolean).slice(-EVENTOS_EN_TABLERO)
    const evs = ultimos.flatMap(l => { try { return [JSON.parse(l) as Evento] } catch { return [] } })
    await update($, eventosRef, () => evs)
  }

  const linea = lineaDeEstado(tareas)
  if (linea !== ultimaLinea) $.ui.status((ultimaLinea = linea))
}

const refrescarSinRuido = ($: EngineInterface) => refrescar($).catch(err => $.ui.log(`fabrica: ${String(err)}`, { to: 'debug' }))

// ---- Escritura --------------------------------------------------------------------------------

async function buscar($: EngineInterface, raiz: string, id: string): Promise<string | undefined> {
  const dir = rutas(raiz).tareas
  const lista = await $.fs.list(dir).catch(() => [])
  const nombre = lista.find(x => x.kind === 'file' && (x.name === `${id}.md` || x.name.startsWith(`${id}-`)))?.name
  return nombre ? unirRuta(dir, nombre) : undefined
}

async function registrarEvento($: EngineInterface, raiz: string, ev: Evento, cfg: Config) {
  const ruta = rutas(raiz).eventos
  const previo = (await leer($, ruta)) ?? ''
  await $.fs.write(ruta, previo + JSON.stringify(ev) + '\n')
  if (cfg.puenteUrl) {
    // El puente nunca frena la fábrica: si el orquestador externo no contesta, se sigue.
    void $.http.fetch(cfg.puenteUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'fabrica.evento', proyecto: raiz, ...ev }),
    }).catch(() => undefined)
  }
}

async function tipoDeAgente($: EngineInterface, agentId: string | undefined) {
  if (!agentId) return undefined
  const lista = await $.agent.list().catch(() => [])
  return lista.find(a => a.id === agentId)?.type
}

const ahora = () => new Date().toISOString()
const texto = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v))

// ---- Git ------------------------------------------------------------------------------------------

type Salida = { exitCode: number; stdout: string; stderr: string }

/** Corre git sin shell, con sus argumentos tal cual: una rama o una ruta no se interpretan. */
const git = ($: EngineInterface, cwd: string, args: string[], timeoutMs = 30_000): Promise<Salida> =>
  $.process.run(['git', ...args], { cwd, timeoutMs, env: SIN_CLAVES_DE_LA_FABRICA })
    .then(r => ({ exitCode: r.exitCode ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }))
    .catch(err => ({ exitCode: -1, stdout: '', stderr: String(err) }))

const lineas = (s: string) => s.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
const enWindows = async ($: EngineInterface) => (await $.env.get('OS')) === 'Windows_NT'

/** El commit donde la tarea se separó de su base, o `null` si git no lo sabe (la rama no existe, sin git). */
async function mergeBaseDe($: EngineInterface, cwd: string, base: string): Promise<string | null> {
  const [programa, ...args] = baseDeComparacion(base)
  if (programa !== 'git') return null
  const r = await git($, cwd, args)
  const hash = r.stdout.trim()
  return r.exitCode === 0 && /^[0-9a-f]{7,64}$/i.test(hash) ? hash : null
}

/**
 * Los archivos que la tarea cambió o creó y siguen existiendo, respecto del punto donde se separó de
 * su base. Sin los de la fábrica. `null` si git no pudo decirlo.
 */
async function archivosDeLaTarea($: EngineInterface, cwd: string, base: string): Promise<string[] | null> {
  const desde = (await mergeBaseDe($, cwd, base)) ?? base
  const [diff, nuevos] = await Promise.all([git($, cwd, ['diff', '--name-only', '--diff-filter=d', desde]), git($, cwd, ['ls-files', '--others', '--exclude-standard'])])
  if (diff.exitCode !== 0) return null
  const todos = [...lineas(diff.stdout), ...(nuevos.exitCode === 0 ? lineas(nuevos.stdout) : [])]
  return delProyecto([...new Set(todos)].map(ruta => ({ ruta, agregadas: 0, quitadas: 0 }))).map(c => c.ruta)
}

/** Todas las tareas con su frontmatter y su cuerpo, para lo que mira a las demás (dependencias, choques). */
async function todasLasTareas($: EngineInterface, raiz: string): Promise<{ archivo: string; datos: Datos; cuerpo: string }[]> {
  const dir = rutas(raiz).tareas
  const lista = (await $.fs.list(dir).catch(() => [])).filter(x => x.kind === 'file' && x.name.endsWith('.md'))
  const out: { archivo: string; datos: Datos; cuerpo: string }[] = []
  for (const ent of lista) {
    const archivo = unirRuta(dir, ent.name)
    const { datos, cuerpo } = partir((await leer($, archivo)) ?? '')
    if (datos.id) out.push({ archivo, datos, cuerpo })
  }
  return out
}

const estadoDe = (d: Datos): Estado => (esEstado(d.estado) ? d.estado : 'pendiente')

/** Cómo están las dependencias de una tarea, para `mover` y para el tablero. */
const dependenciasEn = (datos: Datos, todas: readonly { datos: Datos }[]): EstadoDeDependencia[] =>
  dependenciasDe(datos).map(dep => {
    const t = todas.find(x => x.datos.id === dep)
    return { id: dep, estado: t ? estadoDe(t.datos) : 'no-existe', integrada: !!t?.datos.integrada }
  })

/** Qué tareas pendientes esperan a otras porque dicen tocar los mismos archivos. */
const choquesEntre = (todas: readonly { datos: Datos; cuerpo: string }[], cfg: Config) =>
  choquesDe(todas.map(t => ({ id: t.datos.id!, estado: estadoDe(t.datos), integrada: t.datos.integrada, archivos: archivosQueToca(t.cuerpo) })), cfg)

/** El ciclo que formaría una tarea con esas dependencias, en palabras; `null` si no hay. */
async function cicloSiDepende($: EngineInterface, raiz: string, id: string, deps: readonly string[]): Promise<string | null> {
  if (!deps.length) return null
  if (deps.includes(id)) return `${id} no puede depender de sí misma.`
  const grafo = new Map((await todasLasTareas($, raiz)).filter(t => t.datos.id !== id).map(t => [t.datos.id!, dependenciasDe(t.datos)] as const))
  const ciclo = cicloDeDependencias(id, deps, grafo)
  return ciclo ? `Esas dependencias forman un ciclo (${ciclo.join(' → ')}): ninguna podría arrancar.` : null
}

// ---- Herramientas que llama el orquestador ----------------------------------------------------

const HERRAMIENTAS = [
  {
    name: 'estado',
    description:
      'Fábrica: lista las tareas del proyecto (id, título, estado, vueltas, verificación, veredicto externo, ' +
      'rama de origen, dependencias) y la configuración de factory/config.md. De cada pendiente dice a qué espera ' +
      '(`esperando`: dependencias sin integrar o tareas anteriores que tocan sus mismos archivos); de cada una ' +
      'en revisión, verificación o aprobación, los archivos que cambió. Úsala al empezar /fabrica:correr.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nueva',
    description: 'Fábrica: crea una tarea en factory/tareas con estado "pendiente". Devuelve su id y su archivo.',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Corto: lo que se verá en el tablero.' },
        pedido: { type: 'string', description: 'El pedido completo, con el contexto que dio el usuario.' },
        depende_de: { type: 'string', description: 'Opcional: los ids de las tareas que tienen que estar hechas e integradas antes de que esta arranque, separados por coma (F-009,F-007).' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'mover',
    description:
      'Fábrica: cambia el estado de una tarea. Es la ÚNICA forma de cambiar el estado: no edites el campo ' +
      '`estado` a mano. El mod valida la transición, cuenta las vueltas de retrabajo (al superar max_vueltas la ' +
      'manda a "necesita-humano"), escribe la bitácora y el evento. Estados: pendiente, spec, construccion, ' +
      'revision, verificacion, aprobacion, necesita-humano, hecho, descartada.',
    inputSchema: {
      type: 'object',
      properties: {
        tarea: { type: 'string', description: 'El id, p. ej. F-001.' },
        a: { type: 'string', enum: ['pendiente', 'spec', 'construccion', 'revision', 'verificacion', 'aprobacion', 'necesita-humano', 'hecho', 'descartada'] },
        nota: { type: 'string', description: 'Una línea: por qué. Obligatoria para "necesita-humano" y al devolver a construcción.' },
        worktree: { type: 'string', description: 'Opcional: la ruta del worktree donde se construye esta tarea.' },
        rama_origen: { type: 'string', description: 'Al pasar a "construccion" con worktree: la rama de la que salió (rama_trabajo de config, o la activa en la raíz). Se guarda la primera vez y no se pisa. Nunca main ni master.' },
      },
      required: ['tarea', 'a'],
    },
  },
  {
    name: 'sincronizar',
    description:
      'Fábrica: trae la rama de origen al worktree de una tarea en "verificacion" con la verificación en "ok", ' +
      'antes de pasarla a aprobación. Hace el commit de lo que hay en el worktree (con `mensaje`, o ' +
      '«feat(<id>): <título>») y después `git merge --no-edit <rama_origen>`. Si la rama de origen no tiene ' +
      'commits nuevos, sigue a aprobación. Si el merge entra limpio, la verificación vuelve a "pendiente": ' +
      'verifica otra vez. Si hay conflicto, deja los marcadores, lo anota como BLOQUEANTE y devuelve la tarea a ' +
      'construcción.',
    inputSchema: {
      type: 'object',
      properties: {
        tarea: { type: 'string' },
        mensaje: { type: 'string', description: 'Opcional: el mensaje del commit, con la convención del proyecto.' },
      },
      required: ['tarea'],
    },
  },
  {
    name: 'verificar',
    description:
      'Fábrica: corre los comandos build, test y lint de factory/config.md en el worktree de la tarea (o en ' +
      '`cwd`) y anota el resultado. Solo con la tarea en "verificacion". Devuelve el final de la salida si falla.',
    inputSchema: {
      type: 'object',
      properties: {
        tarea: { type: 'string' },
        cwd: { type: 'string', description: 'Opcional: carpeta donde correr; por defecto el worktree de la tarea o la raíz.' },
      },
      required: ['tarea'],
    },
  },
  {
    name: 'decidir',
    description:
      'Fábrica: lo que hace falta gastar en una etapa, decidido por el mod con reglas y con Jev. `spec`: si hace ' +
      'falta el agente de spec o el pedido ya es una (y entonces el mod lo deja como spec). `construccion`: si se ' +
      'construye con un modelo más barato (sonnet). `revision`: qué revisores lanzar (código, seguridad, UI). ' +
      '`integracion`: con la tarea aprobada, si es sencilla (se integra sola) o grande (espera la prueba de la persona). ' +
      'Lo que se salta queda anotado en la tarea, en los eventos y en el informe, y se aprende de su resultado.',
    inputSchema: {
      type: 'object',
      properties: {
        tarea: { type: 'string' },
        etapa: { type: 'string', enum: ['spec', 'construccion', 'revision', 'integracion'] },
      },
      required: ['tarea', 'etapa'],
    },
  },
  {
    name: 'revisar_con_codex',
    description:
      'Fábrica: la revisión de código de una tarea en "revision", hecha por Codex (OpenAI) en su sandbox de solo ' +
      'lectura, si config lo pide (`revisor_codigo: codex` o `ambos`). Devuelve los hallazgos con el formato de la ' +
      'fábrica, para ponerlos bajo «### Código». Si Codex falla, lo dice: entonces lanza el revisor de Claude.',
    inputSchema: { type: 'object', properties: { tarea: { type: 'string' } }, required: ['tarea'] },
  },
  {
    name: 'spec_con_antigravity',
    description:
      'Fábrica: la spec de una tarea, escrita por Antigravity (Google) en modo plan, sin editar nada, si config lo ' +
      'pide (`escritor_spec: antigravity`). La deja en la sección Spec, o devuelve las preguntas si el pedido es ' +
      'ambiguo. Si Antigravity falla, lo dice: entonces lanza el agente de spec de Claude.',
    inputSchema: { type: 'object', properties: { tarea: { type: 'string' } }, required: ['tarea'] },
  },
  {
    name: 'agentes',
    description:
      'Fábrica: qué agente hace cada rol (spec, construccion, revision_codigo, revision_seguridad, ui, ' +
      'aprobacion). `listar` da el valor de config y los candidatos en orden; `copiar` crea una copia ' +
      'editable del agente de fábrica de un rol en .claude/agents (proyecto) o ~/.claude/agents (usuario) ' +
      'y la deja configurada; `restaurar` vuelve el rol a `auto` (la copia no se borra).',
    inputSchema: {
      type: 'object',
      properties: {
        accion: { type: 'string', enum: ['listar', 'copiar', 'restaurar'] },
        rol: { type: 'string', enum: ['spec', 'construccion', 'revision_codigo', 'revision_seguridad', 'ui', 'aprobacion'] },
        destino: { type: 'string', enum: ['proyecto', 'usuario'], description: 'Solo para copiar. Por defecto, proyecto.' },
      },
      required: ['accion'],
    },
  },
  {
    name: 'aprobar',
    description:
      'Fábrica: veredicto del agente que tiene el rol de aprobación (por defecto fabrica:aprobador) sobre ' +
      'una tarea en "aprobacion". Cualquier otro agente que la llame será rechazado.',
    inputSchema: {
      type: 'object',
      properties: {
        tarea: { type: 'string' },
        veredicto: { type: 'string', enum: ['aprobada', 'rechazada'] },
        motivo: { type: 'string', description: 'Una o dos líneas: qué criterio se cumple o cuál falta.' },
      },
      required: ['tarea', 'veredicto', 'motivo'],
    },
  },
  {
    name: 'salida',
    description:
      'Fábrica: decisión del agente de salida (fabrica-salida) sobre una tarea aprobada. «tu-clic» hace que el paso de ' +
      'producción espere a la persona aunque ella lo haya quitado, con su motivo y su plan de vuelta. «sin-objecion» no ' +
      'cambia nada, y nunca desmarca una tarea que ya pedía su clic. Cualquier otro agente que la llame será rechazado.',
    inputSchema: {
      type: 'object',
      properties: {
        tarea: { type: 'string' },
        decision: { type: 'string', enum: ['tu-clic', 'sin-objecion'] },
        motivo: { type: 'string', description: 'Una línea: qué no se puede deshacer o qué se rompe, y para quién.' },
        plan: { type: 'string', description: 'Con «tu-clic»: el plan para volver atrás, en pasos numerados, y la señal de retirada.' },
      },
      required: ['tarea', 'decision', 'motivo'],
    },
  },
  {
    name: 'anuncio',
    description:
      'Fábrica: lo que escribe el agente de las notas (fabrica-anuncio) en una tarea aprobada y clasificada. En una sencilla va a ' +
      '«## Para el PR», lo que lee quien revisa el PR que se fusiona solo; en una grande, a «## Para probar a mano», ' +
      'lo que la persona prueba antes de dejarla entrar. La sección la decide la clase de la tarea. Reemplaza la que ' +
      'hubiera y no toca nada más. Cualquier otro agente que la llame será rechazado.',
    inputSchema: {
      type: 'object',
      properties: {
        tarea: { type: 'string' },
        texto: { type: 'string', description: 'En Markdown, sin títulos de nivel 1 o 2. Lo que rompe, primero; con ruta:línea.' },
      },
      required: ['tarea', 'texto'],
    },
  },
] as const

type Respuesta = { result: string } | { deny: string }

async function hEstado($: EngineInterface, _e: Record<string, unknown>): Promise<Respuesta> {
  await refrescar($)
  const raiz = await read($, raizRef)
  if (!raiz) return { deny: 'Este proyecto no tiene fábrica (falta factory/tareas). Corre /fabrica:init.' }
  const cfg = await config($, raiz)
  // Por rol, los agentes a probar en orden: el orquestador usa el primero que tenga disponible. El
  // primero es el que la aplicación arma con las habilidades de la etapa; a mano no existe.
  const roles = Object.fromEntries(NOMBRES_DE_ROL.map(rol => [rol, candidatosDeLaCorrida(rol, cfg.agentes[rol])]))
  const tareas = await conLoQueEsperan($, raiz, cfg, await conRespuestas($, raiz, await read($, tareasRef)))
  // La memoria, leída de la raíz: lo que él aprobó y todavía no tiene commit también cuenta.
  const m = await memoriaDe($, raiz)
  const memoria = { vault: m.vault, vaultDeLaPlanta: m.vaultDeLaPlanta, paraLosAgentes: memoriaParaLosAgentes(m) }
  // Las habilidades de cada etapa, del catálogo de la raíz.
  const catalogo = (await leer($, unirRuta(raiz, CATALOGO_DE_HABILIDADES))) ?? null
  const habilidades = { catalogo: catalogo === null ? null : CATALOGO_DE_HABILIDADES, paraLosAgentes: habilidadesParaLosAgentes(catalogo) }
  // Si la corrida trae el agente de salida: la aplicación lo arma solo cuando la línea tiene un proceso sin su clic.
  const salida = (await $.env.get('FABRICA_SALIDA').catch(() => undefined)) === '1' ? AGENTE_DE_SALIDA : null
  // Si la corrida trae al agente de las notas: la aplicación lo arma en cada corrida que lanza.
  const anuncio = (await $.env.get('FABRICA_ANUNCIO').catch(() => undefined)) === '1' ? AGENTE_DE_ANUNCIO : null
  // Si la corrida trae el agente de retrabajo (Arreglo de raíz y Pruebas): la aplicación lo arma en cada corrida.
  const retrabajo = (await $.env.get('FABRICA_RETRABAJO').catch(() => undefined)) === '1' ? AGENTE_DE_RETRABAJO : null
  // Las referencias de las tareas abiertas que tienen: su carpeta, fuera del proyecto, y su índice.
  const conReferencias = await Promise.all(tareas.filter(t => t.estado !== 'hecho' && t.estado !== 'descartada').map(async t => [t.id, await referenciasDeLaTarea($, t.id)] as const))
  const referencias = Object.fromEntries(conReferencias.flatMap(([id, r]) => (r ? [[id, { carpeta: r.carpeta, paraLosAgentes: r.indice }]] : [])))
  return { result: JSON.stringify({ raiz, config: cfg, roles, memoria, habilidades, referencias, salida, anuncio, retrabajo, resumen: contar(tareas), tareas }, null, 2) }
}

/**
 * Lo que escribe el agente de las notas en una tarea aprobada y clasificada. Solo él (`fabrica-anuncio`), y solo en su sección, que decide la clase de la tarea.
 */
async function hAnuncio($: EngineInterface, e: Record<string, unknown>): Promise<Respuesta> {
  const tipo = await tipoDeAgente($, texto(e.agentId) || undefined)
  if (tipo !== AGENTE_DE_ANUNCIO) return { deny: `Esto lo escribe el agente de las notas (${AGENTE_DE_ANUNCIO}). Delega en él.` }
  const raiz = await $.session.root()
  const id = texto(e.tarea).trim()
  const archivo = await buscar($, raiz, id)
  if (!archivo) return { deny: `No encuentro la tarea ${id}.` }
  return enCola(archivo, async () => {
    const { datos, cuerpo } = partir((await leer($, archivo)) ?? '')
    const ts = ahora()
    const r = anuncioEnLaTarea(datos, cuerpo, e.texto, ts)
    if ('error' in r) return { deny: r.error }
    await $.fs.write(archivo, unir({ ...datos, actualizada: ts }, r.cuerpo))
    const cfg = await config($, raiz)
    await registrarEvento($, raiz, { ts, tarea: id, de: datos.estado as Estado, a: datos.estado as Estado, agente: AGENTE_DE_ANUNCIO, nota: r.nota }, cfg)
    await refrescar($)
    return { result: `${id}: quedó en «## ${r.seccion}».` }
  })
}

/**
 * La decisión del agente de salida sobre una tarea aprobada. Solo la da él (`fabrica-salida`), y
 * solo endurece: lo que escribe lo usa el paso de producción para pedir su clic.
 */
async function hSalida($: EngineInterface, e: Record<string, unknown>): Promise<Respuesta> {
  const tipo = await tipoDeAgente($, texto(e.agentId) || undefined)
  if (tipo !== AGENTE_DE_SALIDA) return { deny: `La salida la decide el agente de salida (${AGENTE_DE_SALIDA}). Delega en él.` }
  const raiz = await $.session.root()
  const id = texto(e.tarea).trim()
  const archivo = await buscar($, raiz, id)
  if (!archivo) return { deny: `No encuentro la tarea ${id}.` }
  const { datos, cuerpo } = partir((await leer($, archivo)) ?? '')
  const ts = ahora()
  const r = salidaEnLaTarea(datos, cuerpo, { decision: e.decision, motivo: e.motivo, plan: e.plan }, ts)
  if ('error' in r) return { deny: r.error }
  if (r.datos !== datos) {
    await $.fs.write(archivo, unir(r.datos, r.cuerpo))
    const cfg = await config($, raiz)
    await registrarEvento($, raiz, { ts, tarea: id, de: datos.estado as Estado, a: datos.estado as Estado, agente: AGENTE_DE_SALIDA, nota: r.nota }, cfg)
    await refrescar($)
  }
  return { result: `${id}: ${r.nota}.` }
}

/**
 * La memoria del proyecto, leída de la raíz y no del worktree de la tarea: así cuenta también lo
 * aprobado sin commit. La de la planta, si la corrida trae su carpeta (FABRICA_MEMORIA_PLANTA).
 */
/** La carpeta del vault de la planta, si la corrida la trae. */
// Las escrituras del mod en un mismo archivo de tarea, una detrás de otra: los agentes de una ronda
// se lanzan juntos, y dos ganchos que leen y escriben la misma tarea a la vez perderían una línea.
const colas = new Map<string, Promise<unknown>>()
function enCola<T>(archivo: string, trabajo: () => Promise<T>): Promise<T> {
  const antes = colas.get(archivo) ?? Promise.resolve()
  const esta = antes.catch(() => undefined).then(trabajo)
  colas.set(archivo, esta.catch(() => undefined))
  return esta
}

/**
 * Cuando el orquestador lanza el agente de una etapa con habilidades (`fabrica-hab-<rol>`), la
 * bitácora de su tarea anota qué habilidades recibió y con qué huella (las de `FABRICA_HABILIDADES`,
 * que pone la aplicación al lanzar la corrida), y si alguna cambió desde entonces.
 */
async function anotarHabilidades($: EngineInterface, e: Record<string, unknown>): Promise<void> {
  const rol = rolConHabilidades(texto(e.subagent_type) || undefined)
  if (!rol) return
  const etapa = ETAPA_DE_ROL[rol]
  const lista = habilidadesDeLaCorridaDesde(await $.env.get('FABRICA_HABILIDADES').catch(() => undefined))[etapa] ?? []
  const id = tareaDelEncargo(e.description, e.prompt)
  if (!lista.length || !id) return
  const raiz = await $.session.root()
  const archivo = await buscar($, raiz, id)
  if (!archivo) return
  const actuales = Object.fromEntries(await Promise.all(lista.map(async h => {
    const t = await leer($, h.ruta)
    return [h.nombre, t === undefined ? null : huellaDe(t)] as const
  })))
  const linea = lineaDeHabilidades(etapa, lista, actuales)
  await enCola(archivo, async () => {
    const { datos, cuerpo } = partir((await leer($, archivo)) ?? '')
    if (!datos.id) return
    // El mismo lanzamiento puede avisar dos veces (Agent y Task): una sola línea.
    if (ultimaDeLaBitacoraEs(cuerpo, linea)) return
    await $.fs.write(archivo, unir(datos, anotar(cuerpo, `${ahora()} · ${linea}`)))
  })
}

/**
 * Cuando el orquestador lanza el agente de la spec de una tarea, su camino anota con qué modelo
 * (el `model` del lanzamiento, o el de la corrida). Así la pantalla de la línea y el informe de la
 * corrida dicen con qué se escribió cada spec. Los agentes de una ronda se lanzan juntos: la línea
 * va a eventos.jsonl en su cola, para no pisar la de otro.
 */
async function anotarModeloDeSpec($: EngineInterface, e: Record<string, unknown>): Promise<void> {
  const raiz = await $.session.root()
  const cfg = await config($, raiz)
  if (rolDeAgente(texto(e.subagent_type) || undefined, cfg.agentes) !== 'spec') return
  const id = tareaDelEncargo(e.description, e.prompt)
  if (!id) return
  const archivo = await buscar($, raiz, id)
  if (!archivo) return
  const estado = partir((await leer($, archivo)) ?? '').datos.estado
  if (!esEstado(estado)) return
  const ev: Evento = { ts: ahora(), tarea: id, de: estado, a: estado, agente: 'fabrica', nota: notaDelModeloDeSpec(e.model) }
  await enCola(rutas(raiz).eventos, async () => {
    if (yaAnotado((await leer($, rutas(raiz).eventos)) ?? '', id, ev.nota!)) return
    await registrarEvento($, raiz, ev, cfg)
  })
}

const carpetaDeLaPlanta = async ($: EngineInterface) => ((await $.env.get('FABRICA_MEMORIA_PLANTA').catch(() => undefined)) ?? '').trim() || null

/** La carpeta de las referencias de las tareas de la línea, que pasa la aplicación (`FABRICA_REFERENCIAS`); `null` en una corrida a mano. */
const carpetaDeReferencias = async ($: EngineInterface) => ((await $.env.get('FABRICA_REFERENCIAS').catch(() => undefined)) ?? '').trim() || null

/**
 * Las referencias de una tarea, si las tiene: su carpeta, su índice para los agentes (`INDICE.md`,
 * que escribe la aplicación), sus imágenes con su ruta y si trae un PDF. Solo lee.
 */
async function referenciasDeLaTarea($: EngineInterface, id: string): Promise<{ carpeta: string; indice: string; imagenes: string[]; pdf: boolean } | null> {
  const base = await carpetaDeReferencias($)
  if (!base || !/^F-\d+$/.test(id)) return null
  const carpeta = unirRuta(base, id)
  const indice = (await leer($, unirRuta(carpeta, 'INDICE.md')))?.trim()
  if (!indice) return null
  const r = referenciasDesde(await leer($, unirRuta(carpeta, 'indice.json')))
  if (!r.cuantas) return null
  return { carpeta, indice, imagenes: r.imagenes.map(a => unirRuta(carpeta, a)), pdf: r.pdf }
}

async function memoriaDe($: EngineInterface, raiz: string) {
  const vault = unirRuta(raiz, CARPETA_DE_LA_MEMORIA)
  const proyecto = (await leer($, unirRuta(vault, 'ficha.md'))) ?? null
  const dePlanta = await carpetaDeLaPlanta($)
  const planta = dePlanta ? ((await leer($, unirRuta(dePlanta, 'ficha.md'))) ?? null) : null
  return { vault: proyecto !== null ? vault : null, vaultDeLaPlanta: planta !== null ? dePlanta : null, planta, proyecto }
}

/** Los `.md` de una carpeta del vault, con su texto. */
async function archivosDe($: EngineInterface, dir: string): Promise<ArchivoNuevo[]> {
  const lista = (await $.fs.list(dir).catch(() => [])).filter(x => x.kind === 'file' && x.name.endsWith('.md'))
  return Promise.all(lista.map(async x => ({ nombre: x.name, texto: (await leer($, unirRuta(dir, x.name))) ?? '' })))
}

/**
 * Al pasar una tarea a `hecho`: sus propuestas a `propuestas/` y su línea a la bitácora del mes, en
 * el vault de la raíz (no en la rama de la tarea). Lo escribe el mod, no un agente. Devuelve la nota
 * para la bitácora de la tarea; si algo falla, la tarea termina igual y la nota lo dice.
 */
async function cerrarEnLaMemoria($: EngineInterface, vault: string, t: { datos: Datos; cuerpo: string; ahora: string; toca: readonly string[]; raiz: string }): Promise<string> {
  try {
    const mes = t.ahora.slice(0, 7)
    const [propuestas, decisiones, bitacora, skills] = await Promise.all([
      archivosDe($, unirRuta(vault, 'propuestas')),
      archivosDe($, unirRuta(vault, 'decisiones')),
      leer($, unirRuta(vault, 'bitacora', `${mes}.md`)),
      $.fs.list(unirRuta(t.raiz, '.claude', 'skills')).catch(() => []),
    ])
    const r = cierreEnLaMemoria({
      tarea: { id: t.datos.id ?? '', titulo: t.datos.titulo ?? '', tituloAjeno: t.datos.titulo_ajeno === 'si', origenEntrada: t.datos.origen_entrada, cuerpo: t.cuerpo },
      ahora: t.ahora,
      existentes: { propuestas, decisiones },
      bitacora: bitacora ?? null,
      toca: t.toca,
      habilidadesDelProyecto: skills.filter(x => x.kind === 'dir').map(x => x.name),
    })
    for (const p of r.propuestas) await $.fs.write(unirRuta(vault, 'propuestas', p.nombre), p.texto)
    await $.fs.write(unirRuta(vault, 'bitacora', r.bitacora.nombre), r.bitacora.texto)
    return r.nota
  } catch (err) {
    return `memoria: no se pudo anotar en ${vault} (${err instanceof Error ? err.message : String(err)}).`
  }
}

const YA_CONSTRUIDAS: readonly Estado[] = ['revision', 'verificacion', 'aprobacion']

/**
 * A cada pendiente le pega a qué espera (sus dependencias sin integrar y las tareas anteriores que
 * tocan sus mismos archivos), y a cada una ya construida, los archivos que cambió en su worktree.
 */
async function conLoQueEsperan($: EngineInterface, raiz: string, cfg: Config, tareas: readonly Tarea[]) {
  const todas = await todasLasTareas($, raiz)
  const choques = choquesEntre(todas, cfg)
  return Promise.all(tareas.map(async t => {
    const d = todas.find(x => x.datos.id === t.id)
    if (!d) return t
    if (t.estado === 'pendiente') {
      const deps = revisarDependencias(dependenciasEn(d.datos, todas), cfg)
      const esperando = [
        ...deps.descartadas.map(x => `${x.id} ${x.estado === 'no-existe' ? 'no existe' : 'está descartada'}: irá a un humano`),
        ...deps.esperando.map(x => `${x.id} (${x.estado === 'hecho' ? 'hecha, sin integrar' : x.estado})`),
        ...(choques.get(t.id) ?? []).map(c => `${c.con} (comparten ${c.archivos.join(', ')})`),
      ]
      return esperando.length ? { ...t, esperando } : t
    }
    if (t.estado === 'necesita-humano' && esBloqueo(d.datos.bloqueo)) {
      const reintentar = await reintentoPosible($, raiz, cfg, d.datos, d.datos.bloqueo)
      return reintentar ? { ...t, reintentar } : t
    }
    if (YA_CONSTRUIDAS.includes(t.estado) && tieneWorktreePropio(d.datos.worktree, raiz)) {
      const archivosCambiados = await archivosDeLaTarea($, d.datos.worktree!, ramaDeOrigen(d.datos, cfg))
      return archivosCambiados ? { ...t, archivosCambiados } : t
    }
    return t
  }))
}

/**
 * A las tareas que esperan a un humano les pega su respuesta, si llegó después del bloqueo
 * (factory/respuestas/<id>.json, la escribe el orquestador web), y la etapa en que se bloquearon,
 * sacada del último evento que las mandó ahí.
 */
async function conRespuestas($: EngineInterface, raiz: string, tareas: readonly Tarea[]) {
  const bloqueadas = tareas.filter(t => t.estado === 'necesita-humano')
  if (!bloqueadas.length) return tareas
  const eventos = ((await leer($, rutas(raiz).eventos)) ?? '').split('\n').flatMap(l => {
    try { return l ? [JSON.parse(l) as Evento] : [] } catch { return [] }
  })
  const extra = new Map<string, { respuestaHumana?: { texto: string; fecha: string; por: string }; etapaAnterior?: Estado }>()
  for (const t of bloqueadas) {
    const bloqueo = eventos.filter(e => e.tarea === t.id && e.a === 'necesita-humano' && e.de !== 'necesita-humano').at(-1)
    const info: { respuestaHumana?: { texto: string; fecha: string; por: string }; etapaAnterior?: Estado } = {}
    if (bloqueo?.de) info.etapaAnterior = bloqueo.de
    try {
      const j = JSON.parse((await leer($, unirRuta(rutas(raiz).factory, 'respuestas', `${t.id}.json`))) ?? '') as Record<string, unknown>
      const fecha = texto(j.fecha)
      if (texto(j.texto).trim() && (!t.actualizada || fecha > t.actualizada)) {
        info.respuestaHumana = { texto: texto(j.texto), fecha, por: texto(j.por) || 'humano' }
      }
    } catch {
      // Sin respuesta: sigue esperando.
    }
    extra.set(t.id, info)
  }
  return tareas.map(t => (extra.has(t.id) ? { ...t, ...extra.get(t.id) } : t))
}

async function hAgentes($: EngineInterface, e: Record<string, unknown>): Promise<Respuesta> {
  const raiz = await $.session.root()
  const r = rutas(raiz)
  if (!(await $.fs.exists(r.config))) return { deny: 'Falta factory/config.md. Corre /fabrica:init primero.' }
  const cfg = await config($, raiz)
  const accion = texto(e.accion)

  if (accion === 'listar') {
    const filas = NOMBRES_DE_ROL.map(rol => ({
      rol,
      nombre: ROLES[rol].nombre,
      clave: ROLES[rol].clave,
      valor: cfg.agentes[rol],
      candidatos: candidatos(rol, cfg.agentes[rol]),
    }))
    return { result: JSON.stringify(filas, null, 2) }
  }

  const rol = e.rol
  if (!esRol(rol)) return { deny: `Falta un rol válido: ${NOMBRES_DE_ROL.join(', ')}.` }
  const textoConfig = (await leer($, r.config)) ?? ''

  if (accion === 'restaurar') {
    await $.fs.write(r.config, fijarEnConfig(textoConfig, ROLES[rol].clave, 'auto'))
    await refrescar($)
    return { result: `${ROLES[rol].nombre} vuelve a "auto" (${candidatos(rol, 'auto').join(' → ')}). La copia editable, si había, no se borró.` }
  }

  if (accion === 'copiar') {
    const base = texto(e.destino) === 'usuario'
      ? (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
      : raiz
    if (!base) return { deny: 'No encuentro la carpeta de usuario (USERPROFILE / HOME).' }
    const nombre = nombreDeCopia(rol)
    const destino = unirRuta(base, '.claude', 'agents', `${nombre}.md`)
    if (await $.fs.exists(destino)) {
      await $.fs.write(r.config, fijarEnConfig(textoConfig, ROLES[rol].clave, nombre))
      await refrescar($)
      return { result: `Ya existía ${destino}: no la pisé. ${ROLES[rol].nombre} queda configurado para usarla ("${nombre}").` }
    }
    const original = await leer($, unirRuta($.plugin.root, 'agents', `${ROLES[rol].archivo}.md`))
    if (!original) return { deny: `No encuentro el agente de fábrica ${ROLES[rol].archivo}.md en el plugin.` }
    await $.fs.write(destino, renombrarAgente(original, nombre))
    await $.fs.write(r.config, fijarEnConfig(textoConfig, ROLES[rol].clave, nombre))
    await refrescar($)
    return {
      result:
        `Copia editable creada: ${destino}. ${ROLES[rol].nombre} queda configurado para usar "${nombre}". ` +
        'Claude Code lee los agentes al empezar la sesión: los cambios valen desde la próxima.',
    }
  }

  return { deny: 'accion es "listar", "copiar" o "restaurar".' }
}

async function hNueva($: EngineInterface, e: Record<string, unknown>): Promise<Respuesta> {
  const raiz = await $.session.root()
  const r = rutas(raiz)
  if (!(await $.fs.exists(r.tareas))) return { deny: 'Falta factory/tareas. Corre /fabrica:init primero.' }
  const titulo = texto(e.titulo).trim()
  if (!titulo) return { deny: 'Falta el título.' }
  const ids = (await $.fs.list(r.tareas)).map(x => /^(F-\d+)/.exec(x.name)?.[1]).filter((x): x is string => !!x)
  const id = siguienteId(ids)
  const deps = idsEn(Array.isArray(e.depende_de) ? e.depende_de.map(texto).join(',') : texto(e.depende_de))
  const faltan = deps.filter(d => !ids.includes(d))
  if (faltan.length) return { deny: `No existe${faltan.length === 1 ? '' : 'n'} ${faltan.join(', ')}: una tarea solo depende de tareas que ya están en la cola.` }
  const ciclo = await cicloSiDepende($, raiz, id, deps)
  if (ciclo) return { deny: ciclo }
  const archivo = unirRuta(r.tareas, `${id}-${slug(titulo)}.md`)
  const ts = ahora()
  await $.fs.write(archivo, tareaNueva(id, titulo, texto(e.pedido), ts, deps))
  await registrarEvento($, raiz, { ts, tarea: id, de: null, a: 'pendiente', nota: titulo }, await config($, raiz))
  await refrescar($)
  return { result: `Creada ${id}: ${archivo}${deps.length ? `. Depende de ${deps.join(', ')}: no arranca hasta que estén hechas e integradas.` : ''}` }
}

async function hMover($: EngineInterface, e: Record<string, unknown>): Promise<Respuesta> {
  const raiz = await $.session.root()
  const id = texto(e.tarea).trim()
  const a = e.a
  if (!esEstado(a)) return { deny: `Estado desconocido: "${texto(a)}".` }
  const archivo = await buscar($, raiz, id)
  if (!archivo) return { deny: `No encuentro la tarea ${id} en factory/tareas.` }
  const cfg = await config($, raiz)
  let { datos, cuerpo } = partir((await leer($, archivo)) ?? '')
  // A hecho, siempre clasificada: si el orquestador no lo pidió, lo hace el mod ahora. Así una
  // grande no se integra sin la prueba de la persona porque alguien se saltó un paso.
  if (a === 'hecho' && datos.estado === 'aprobacion' && !datos.integracion_clase) {
    const r = await clasificarLaTarea($, raiz, archivo, id, datos, cuerpo, cfg)
    if ('deny' in r) return r
    ;({ datos, cuerpo } = partir((await leer($, archivo)) ?? ''))
    if (datos.verificacion !== 'ok') return { deny: r.result }
  }
  const todos = (await veredictos($, raiz)).get(id)
  const ver = todos && vigente(todos.mtime, datos.en_aprobacion_desde) ? todos : undefined
  const agente = (await tipoDeAgente($, texto(e.agentId) || undefined)) ?? 'orquestador'
  const sesion = (await $.session.id().catch(() => '')) || undefined
  const ts = ahora()
  const wt = texto(e.worktree).trim()
  const worktree = wt || datos.worktree || ''
  const base: Movimiento = { a, nota: texto(e.nota), agente, ahora: ts, veredictoExterno: ver?.veredicto, sesion }
  const notas: string[] = []

  // Al salir de la cola: sus dependencias, y las tareas anteriores que tocan sus mismos archivos.
  let todas: Awaited<ReturnType<typeof todasLasTareas>> | null = null
  if (datos.estado === 'pendiente' && a === 'spec') {
    todas = await todasLasTareas($, raiz)
    base.dependencias = dependenciasEn(datos, todas)
    base.esperaPorArchivos = choquesEntre(todas, cfg).get(id) ?? []
    // Si el pedido nombra algo que la memoria prohíbe, queda la sospecha para el agente de spec. No decide.
    const choques = choquesConLaMemoria(await memoriaDe($, raiz), seccion(cuerpo, 'Pedido'))
    if (choques.length) notas.push(notaDeChoques(choques))
  }
  // Al entrar a construcción por primera vez: la rama de la que sale. La de trabajo de config manda;
  // nunca una protegida. Sin worktree propio trabaja directo en la raíz, y entonces la que no puede
  // ser protegida es la de la raíz.
  if (a === 'construccion' && !datos.rama_origen) {
    const actual = (await git($, raiz, ['branch', '--show-current'])).stdout
    const ro = ramaParaLaTarea({ deConfig: cfg.ramaTrabajo, pedida: texto(e.rama_origen), actual })
    if (tieneWorktreePropio(worktree, raiz)) {
      if ('nota' in ro) {
        base.a = 'necesita-humano'
        base.nota = ro.nota
      } else base.ramaOrigen = ro.rama
    } else {
      const nota = protegidaSinWorktree({ deConfig: cfg.ramaTrabajo, actual })
      if (nota) {
        base.a = 'necesita-humano'
        base.nota = nota
      }
    }
  }
  // De revisión a verificación, solo sin BLOQUEANTES en los hallazgos.
  if (datos.estado === 'revision' && a === 'verificacion') base.bloqueantes = bloqueantesEn(cuerpo)
  // A aprobación, solo sincronizada y sin conflictos pendientes.
  if (a === 'aprobacion' && tieneWorktreePropio(worktree, raiz)) {
    base.requiereSincronizar = true
    base.conflicto = (await conflictoEn($, worktree, datos)) ?? undefined
  }

  let res = mover(datos, base, cfg)
  if (!res.ok) return { deny: res.error }
  let nuevo = res.datos
  if (wt) nuevo.worktree = wt

  // Lo que tocó, para la bitácora de la memoria: antes de integrar, porque después el diff queda vacío.
  const memoria = res.evento.a === 'hecho' ? await memoriaDe($, raiz) : null
  const toca = memoria?.vault && tieneWorktreePropio(nuevo.worktree, raiz)
    ? ((await archivosDeLaTarea($, nuevo.worktree!, ramaDeOrigen(nuevo, cfg))) ?? [])
    : []

  // A hecho: se integra en su rama de origen con un fast-forward, o va a un humano diciendo por qué.
  let integradaEn: string | null = null
  if (res.evento.a === 'hecho' && cfg.integracion === 'auto' && tieneWorktreePropio(nuevo.worktree, raiz)) {
    const r = await integrar($, raiz, nuevo, cfg)
    if ('deny' in r) return r
    if (r.hacer === 'humano') {
      res = mover(datos, { ...base, a: 'necesita-humano', nota: r.nota, ...(r.bloqueo ? { bloqueo: r.bloqueo } : {}) }, cfg)
      if (!res.ok) return { deny: res.error }
      nuevo = { ...res.datos, ...(wt ? { worktree: wt } : {}) }
    } else {
      nuevo.integrada = r.hash
      integradaEn = r.rama
      if (res.evento.nota === undefined) res.evento.nota = `integrada en ${r.rama} (${r.hash.slice(0, 10)})`
    }
  }

  // Al entrar a construcción, el node_modules de la raíz: así no hay que instalar en cada verificación.
  if (res.evento.a === 'construccion' && tieneWorktreePropio(nuevo.worktree, raiz) && !nuevo.node_modules) {
    const n = await enlazarNodeModules($, raiz, nuevo.worktree!, false, false)
    if (n) { nuevo.node_modules = n.estado; notas.push(n.nota) }
  }

  // Terminada de verdad (no desviada a un humano): lo que propone y su línea, a la memoria.
  if (res.evento.a === 'hecho' && memoria?.vault) {
    const nota = await cerrarEnLaMemoria($, memoria.vault, { datos: nuevo, cuerpo, ahora: ts, toca, raiz })
    if (nota) notas.push(nota)
  }

  const linea = `${ts} · ${res.evento.de} → ${res.evento.a} (${agente})${res.evento.nota ? ' — ' + res.evento.nota : ''}`
  // Al volver a revisión, lo de la vuelta anterior se guarda aparte: los revisores escriben de cero.
  // Al volver a construcción, lo que escribió el agente de las notas es de la vuelta anterior: se escribe otra vez al aprobarse.
  const cuerpoMovido = res.evento.de === 'construccion' && res.evento.a === 'revision' ? archivarHallazgos(cuerpo, ts) : res.evento.a === 'construccion' ? sinLoDeLabel(cuerpo) : cuerpo
  // Al salir de aprobación con el veredicto de la persona (o de un orquestador externo), queda en `## Veredicto`.
  const cuerpoNuevo = datos.estado === 'aprobacion' && ver && (res.evento.a === 'hecho' || res.evento.a === 'construccion')
    ? anotarVeredicto(cuerpoMovido, `- ${ts} · ${ver.por || 'externo'}: **${ver.veredicto}**${ver.motivo ? ` — ${ver.motivo.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`)
    : cuerpoMovido
  await $.fs.write(archivo, unir(nuevo, notas.reduce((c, n) => anotar(c, `${ts} · ${n}`), anotar(cuerpoNuevo, linea))))
  await registrarEvento($, raiz, res.evento, cfg)
  // Al terminar de construir: si otra tarea activa cambió los mismos archivos, que lo sepan las dos.
  const choques = res.evento.de === 'construccion' && res.evento.a === 'revision' ? await avisarChoques($, raiz, cfg, id, archivo, nuevo, ts) : []
  // Lo que este paso dice de las decisiones de Jev de la tarea: si ahorrar estuvo bien.
  await anotarJev($, raiz, resultadosAlMover(pendientes((await aprendido($, raiz)).lineas, id), res.evento.de ?? '', res.evento.a, cuerpo, ts))
  const fin = res.evento.a as Estado
  if (fin === 'necesita-humano') {
    $.ui.toast(`${id} necesita a un humano: ${nuevo.motivo}`, { timeoutMs: 8000 })
    void $.ui.notify(`${id}: ${nuevo.motivo}`, { title: 'Fábrica' }).catch(() => undefined)
  } else if (fin === 'hecho') {
    $.ui.toast(integradaEn ? `${id} integrada en ${integradaEn}` : `${id} terminada. Rama: ${nuevo.rama ?? '?'}`)
  }
  await refrescar($)
  const extra = [
    fin === 'aprobacion' && pideExterna(cfg) && !ver ? `Espera también el veredicto externo en factory/veredictos/${id}.json.` : '',
    integradaEn ? `Integrada en ${integradaEn} con fast-forward (${nuevo.integrada}).` : '',
    fin === 'hecho' && !integradaEn ? `No se integró (integracion: ${cfg.integracion}${tieneWorktreePropio(nuevo.worktree, raiz) ? '' : ', sin worktree propio'}): la rama ${nuevo.rama ?? '?'} queda para el usuario.` : '',
    ...choques,
    ...notas,
  ].filter(Boolean)
  // Si la fábrica la mandó a un humano en vez de adonde se pidió, el motivo va en la respuesta.
  const desviada = fin === 'necesita-humano' && a !== 'necesita-humano' && !res.forzado
  return { result: `${id}: ${res.evento.de} → ${fin}.${res.forzado ? ' ' + res.forzado : ''}${desviada ? ' ' + nuevo.motivo : ''}${extra.length ? ' ' + extra.join(' ') : ''}` }
}

/** Si lo que frenó la integración de una tarea ya se resolvió, cómo retomarla; si no, `null`. */
async function reintentoPosible($: EngineInterface, raiz: string, cfg: Config, datos: Datos, bloqueo: Bloqueo): Promise<'integrar' | 'sincronizar' | null> {
  const origen = ramaDeOrigen(datos, cfg)
  const ramaTarea = datos.rama?.trim() || `fabrica/${datos.id}`
  const [actual, sucios, tocados] = await Promise.all([
    git($, raiz, ['branch', '--show-current']),
    git($, raiz, ['status', '--porcelain']),
    git($, raiz, ['diff', '--name-only', `${origen}...${ramaTarea}`]),
  ])
  const soloDelProyecto = (rs: string[]) => delProyecto(rs.map(ruta => ({ ruta, agregadas: 0, quitadas: 0 }))).map(c => c.ruta)
  return reintentoDeIntegracion(bloqueo, {
    ramaActual: actual.stdout.trim(),
    ramaOrigen: origen,
    suciosQueToca: enComun(soloDelProyecto(rutasDePorcelain(sucios.stdout)), soloDelProyecto(lineas(tocados.stdout))),
  })
}

/**
 * El conflicto que sigue sin resolver en el worktree: marcadores en los archivos del último
 * conflicto, o un merge sin cerrar. `null` si no hay.
 */
async function conflictoEn($: EngineInterface, wt: string, datos: Datos): Promise<string | null> {
  const archivos = (datos.conflicto ?? '').split(',').map(x => x.trim()).filter(Boolean)
  const conMarcas: string[] = []
  for (const a of archivos) if (tieneMarcadores((await leer($, unirRuta(wt, a))) ?? '')) conMarcas.push(a)
  if (conMarcas.length) return `quedan marcadores de conflicto en ${conMarcas.join(', ')}: devuélvela a construcción`
  if ((await git($, wt, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).exitCode === 0) return 'hay un merge sin cerrar (MERGE_HEAD): llama a sincronizar, que lo cierra con un commit'
  return null
}

/**
 * Integra la rama de la tarea en su rama de origen, en la raíz, con `merge --ff-only`. Nunca usa
 * --force, reset, stash ni checkout sobre la copia del usuario, y nunca hace push: si algo no
 * cuadra, lo dice para que lo decida él.
 */
async function integrar($: EngineInterface, raiz: string, datos: Datos, cfg: Config): Promise<{ deny: string } | { hacer: 'humano'; nota: string; bloqueo?: Bloqueo } | { hacer: 'integrar'; hash: string; rama: string }> {
  const id = datos.id ?? '?'
  const wt = datos.worktree!
  const origen = ramaDeOrigen(datos, cfg)
  const ramaTarea = datos.rama?.trim() || `fabrica/${id}`
  const enWt = await git($, wt, ['status', '--porcelain'])
  if (enWt.exitCode === 0 && enWt.stdout.trim()) return { deny: `${id}: el worktree tiene cambios sin commit (${rutasDePorcelain(enWt.stdout).slice(0, 5).join(', ')}). Haz el commit en el worktree y vuelve a moverla a hecho.` }
  const [actual, ff, sucios, tocados] = await Promise.all([
    git($, raiz, ['branch', '--show-current']),
    git($, raiz, ['merge-base', '--is-ancestor', origen, ramaTarea]),
    git($, raiz, ['status', '--porcelain']),
    git($, raiz, ['diff', '--name-only', `${origen}...${ramaTarea}`]),
  ])
  if (tocados.exitCode !== 0) return { hacer: 'humano', nota: `git no pudo comparar ${ramaTarea} con ${origen}: ${cola(tocados.stderr, 3)}` }
  const delProyectoSolo = (rs: string[]) => delProyecto(rs.map(ruta => ({ ruta, agregadas: 0, quitadas: 0 }))).map(c => c.ruta)
  const d = decidirIntegracion({
    id, ramaActual: actual.stdout.trim(), ramaOrigen: origen, ramaTarea, ffPosible: ff.exitCode === 0,
    suciosQueToca: enComun(delProyectoSolo(rutasDePorcelain(sucios.stdout)), delProyectoSolo(lineas(tocados.stdout))),
  })
  if (d.hacer === 'humano') return d
  const m = await git($, raiz, ['merge', '--ff-only', ramaTarea], 120_000)
  if (m.exitCode !== 0) {
    const protegidos = archivosQueGitProtege(`${m.stdout}\n${m.stderr}`)
    return {
      hacer: 'humano',
      ...(protegidos.length ? { bloqueo: 'sucios' as const } : {}),
      nota: protegidos.length
        ? `git no integró ${ramaTarea}: tus cambios sin commit tocan ${protegidos.join(', ')}. Haz commit de los tuyos o apártalos; la fábrica no toca tu copia de trabajo. La próxima corrida lo reintenta sola si ya se resolvió.`
        : `git no integró ${ramaTarea} en ${origen} con fast-forward: ${cola(`${m.stderr}\n${m.stdout}`, 3)}`,
    }
  }
  return { hacer: 'integrar', hash: (await git($, raiz, ['rev-parse', 'HEAD'])).stdout.trim(), rama: origen }
}

/**
 * Enlaza el node_modules de la raíz en el worktree (junction en Windows), o quita el enlace si la
 * tarea cambió el lockfile. Devuelve cómo quedó y qué anotar; `null` si no hizo nada.
 */
async function enlazarNodeModules($: EngineInterface, raiz: string, wt: string, enlazado: boolean, lockCambio: boolean): Promise<{ estado: string; nota: string } | null> {
  const windows = await enWindows($)
  const deRaiz = unirRuta(raiz, 'node_modules')
  const delWt = unirRuta(wt, 'node_modules')
  const nativa = (r: string) => (windows ? r.replace(/\//g, '\\') : r)
  const accion = enlaceDeNodeModules({
    raizTiene: await $.fs.exists(deRaiz).catch(() => false),
    worktreeTiene: await $.fs.exists(delWt).catch(() => false),
    enlazado,
    // Con barra: un `node_modules/` del .gitignore solo vale para carpetas, y en el worktree todavía no está.
    ignorado: (await git($, wt, ['check-ignore', '-q', 'node_modules/'])).exitCode === 0,
    lockCambio,
  })
  if (accion === 'nada') return null
  const argv = accion === 'enlazar'
    ? (windows ? ['cmd.exe', '/d', '/c', 'mklink', '/J', nativa(delWt), nativa(deRaiz)] : ['ln', '-s', deRaiz, delWt])
    // rmdir sobre una junction (y rm sobre un enlace) quitan el enlace, nunca lo que hay dentro.
    : (windows ? ['cmd.exe', '/d', '/c', 'rmdir', nativa(delWt)] : ['rm', delWt])
  const r = await $.process.run(argv, { cwd: wt, timeoutMs: 30_000 }).catch(err => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  if (r.exitCode !== 0) return { estado: enlazado ? 'enlazado' : '', nota: `no se pudo ${accion === 'enlazar' ? 'enlazar' : 'quitar el enlace de'} node_modules: ${cola(r.stderr ?? '', 2)}` }
  return accion === 'enlazar'
    ? { estado: 'enlazado', nota: 'node_modules enlazado al de la raíz: no hace falta instalar en el worktree' }
    : { estado: 'propio', nota: 'la tarea cambió el lockfile: se quitó el enlace a node_modules de la raíz; el worktree tiene que instalar sus dependencias' }
}

/**
 * Si otra tarea activa con worktree cambió alguno de los archivos de esta, lo anota en la bitácora
 * de las dos: al sincronizar puede haber conflicto. Devuelve los avisos.
 */
async function avisarChoques($: EngineInterface, raiz: string, cfg: Config, id: string, archivo: string, datos: Datos, ts: string): Promise<string[]> {
  if (!tieneWorktreePropio(datos.worktree, raiz)) return []
  const mios = await archivosDeLaTarea($, datos.worktree!, ramaDeOrigen(datos, cfg))
  if (!mios?.length) return []
  const avisos: string[] = []
  for (const t of await todasLasTareas($, raiz)) {
    if (t.datos.id === id || !['construccion', ...YA_CONSTRUIDAS].includes(estadoDe(t.datos)) || !tieneWorktreePropio(t.datos.worktree, raiz)) continue
    const suyos = await archivosDeLaTarea($, t.datos.worktree!, ramaDeOrigen(t.datos, cfg))
    const comunes = enComun(mios, suyos ?? [])
    if (!comunes.length) continue
    const lista = comunes.slice(0, 6).join(', ') + (comunes.length > 6 ? '…' : '')
    avisos.push(`⚠ ${t.datos.id} también cambió ${lista}.`)
    await $.fs.write(t.archivo, unir(t.datos, anotar(t.cuerpo, `${ts} · ⚠ ${id} también cambió ${lista}: al sincronizar puede haber conflicto`)))
  }
  if (avisos.length) {
    const actual = partir((await leer($, archivo)) ?? '')
    await $.fs.write(archivo, unir(actual.datos, anotar(actual.cuerpo, `${ts} · ${avisos.join(' ')} Al sincronizar puede haber conflicto`)))
  }
  return avisos
}

/**
 * Trae la rama de origen al worktree antes de aprobar. El conflicto se resuelve aquí, en la fábrica,
 * y no en la copia de trabajo del usuario: los marcadores quedan y la tarea vuelve a construcción.
 */
async function hSincronizar($: EngineInterface, e: Record<string, unknown>): Promise<Respuesta> {
  const raiz = await $.session.root()
  const id = texto(e.tarea).trim()
  const archivo = await buscar($, raiz, id)
  if (!archivo) return { deny: `No encuentro la tarea ${id}.` }
  const { datos, cuerpo } = partir((await leer($, archivo)) ?? '')
  if (datos.estado !== 'verificacion' || datos.verificacion !== 'ok') return { deny: `${id} está en "${datos.estado}" con la verificación en "${datos.verificacion}": se sincroniza en "verificacion" con la verificación en "ok".` }
  const cfg = await config($, raiz)
  const ts = ahora()
  const guardar = async (d: Datos, c: string, nota: string) => {
    await $.fs.write(archivo, unir({ ...d, actualizada: ts }, anotar(c, `${ts} · ${nota}`)))
    await registrarEvento($, raiz, { ts, tarea: id, de: 'verificacion', a: 'verificacion', agente: 'fabrica', nota }, cfg)
    await refrescar($)
  }
  const wt = datos.worktree ?? ''
  if (!tieneWorktreePropio(wt, raiz)) {
    await guardar({ ...datos, sincronizada: ts }, cuerpo, 'sin worktree propio: no hay rama que sincronizar')
    return { result: `${id}: SIN WORKTREE PROPIO — trabaja en la raíz: no hay nada que sincronizar. Pasa a aprobación.` }
  }
  const base = ramaDeOrigen(datos, cfg)

  // Un conflicto anterior que quedó con marcadores vuelve a construcción, igual que uno nuevo.
  const pendiente = await conflictoEn($, wt, datos)
  if (pendiente?.startsWith('quedan marcadores')) return devolverPorConflicto($, raiz, archivo, datos, cuerpo, cfg, base, (datos.conflicto ?? '').split(',').map(x => x.trim()).filter(Boolean), ts)

  // El trabajo de la tarea va en un commit (y cierra el merge de un conflicto ya resuelto).
  const sucio = await git($, wt, ['status', '--porcelain'])
  const enMerge = pendiente !== null
  if (sucio.stdout.trim() || enMerge) {
    await normalizarFinesDeLinea($, wt)
    const mensaje = texto(e.mensaje).trim() || (enMerge ? `merge(${id}): trae ${base}` : `feat(${id}): ${datos.titulo ?? id}`)
    const add = await git($, wt, ['add', '-A'])
    const commit = add.exitCode === 0 ? await git($, wt, ['commit', '-m', mensaje], 120_000) : add
    if (commit.exitCode !== 0) return { result: `${id}: NO SE PUDO HACER EL COMMIT en el worktree (código ${commit.exitCode}): ${cola(`${commit.stdout}\n${commit.stderr}`, 8).slice(-1200)}\nSi lo frenó un hook del proyecto, mueve la tarea a necesita-humano con lo que dice.` }
  }

  const nuevos = await git($, wt, ['rev-list', '--count', `HEAD..${base}`])
  if (nuevos.exitCode !== 0) return { deny: `${id}: git no encuentra la rama de origen «${base}» desde el worktree: ${cola(nuevos.stderr, 2)}` }
  const n = Number(nuevos.stdout.trim()) || 0
  const sinConflicto = { ...datos, conflicto: '' }
  if (n === 0) {
    await guardar({ ...sinConflicto, sincronizada: ts }, cuerpo, `sincronizada: ${base} no tiene commits nuevos`)
    return { result: `${id}: SIN CAMBIOS — ${base} no tiene commits nuevos. Pasa a aprobación.` }
  }

  const m = await git($, wt, ['merge', '--no-edit', base], 120_000)
  if (m.exitCode === 0) {
    await guardar({ ...sinConflicto, sincronizada: ts, verificacion: 'pendiente' }, cuerpo, `sincronizada: trajo ${n} ${n === 1 ? 'commit' : 'commits'} de ${base} sin conflicto; falta verificar de nuevo`)
    return { result: `${id}: MERGE LIMPIO — trajo ${n} ${n === 1 ? 'commit' : 'commits'} de ${base}. La verificación volvió a "pendiente": llama a mcp__fabrica__verificar y, si queda en ok, pasa a aprobación.` }
  }
  const enConflicto = lineas((await git($, wt, ['diff', '--name-only', '--diff-filter=U'])).stdout)
  if (!enConflicto.length) return { deny: `${id}: git no pudo traer ${base} (código ${m.exitCode}): ${cola(`${m.stdout}\n${m.stderr}`, 6)}` }
  return devolverPorConflicto($, raiz, archivo, datos, cuerpo, cfg, base, enConflicto, ts)
}

/** El conflicto vuelve a construcción como BLOQUEANTE, con sus archivos. La vuelta cuenta. */
async function devolverPorConflicto($: EngineInterface, raiz: string, archivo: string, datos: Datos, cuerpo: string, cfg: Config, base: string, archivos: string[], ts: string): Promise<Respuesta> {
  const id = datos.id ?? '?'
  const nota = `conflicto al traer ${base}: ${archivos.join(', ')}`
  const sesion = (await $.session.id().catch(() => '')) || undefined
  const res = mover({ ...datos, conflicto: archivos.join(',') }, { a: 'construccion', nota, agente: 'fabrica', ahora: ts, sesion }, cfg)
  if (!res.ok) return { deny: res.error }
  const c = conHallazgoDeConflicto(cuerpo, base, archivos)
  await $.fs.write(archivo, unir(res.datos, anotar(c, `${ts} · ${res.evento.de} → ${res.evento.a} (fabrica) — ${res.evento.nota ?? nota}`)))
  await registrarEvento($, raiz, res.evento, cfg)
  await refrescar($)
  return res.evento.a === 'necesita-humano'
    ? { result: `${id}: CONFLICTO con ${base} en ${archivos.join(', ')}, y ${res.forzado ?? 'pasó a un humano'}` }
    : { result: `${id}: CONFLICTO con ${base} en ${archivos.join(', ')}. Los marcadores quedaron en el worktree y la tarea volvió a construcción (vuelta ${res.datos.vueltas}). Lanza el constructor con «## Hallazgos de revisión»: que resuelva el conflicto conservando la intención de las dos ramas, sin hacer commit.` }
}

/**
 * Si el repo trabaja con CRLF, pasa a CRLF los archivos nuevos de texto antes del commit: así git no
 * avisa LF→CRLF en cada uno. La configuración de git del usuario no se toca.
 */
async function normalizarFinesDeLinea($: EngineInterface, wt: string) {
  const [autocrlf, atributos] = await Promise.all([git($, wt, ['config', '--get', 'core.autocrlf']), leer($, unirRuta(wt, '.gitattributes'))])
  if (!usaCrlf(autocrlf.stdout, atributos ?? '')) return
  const nuevos = lineas((await git($, wt, ['ls-files', '--others', '--exclude-standard'])).stdout).filter(esDeTexto)
  for (const r of nuevos) {
    const ruta = unirRuta(wt, r)
    const t = await leer($, ruta)
    const crlf = t && !t.includes('\u0000') ? aCrlf(t) : null
    if (crlf) await $.fs.write(ruta, crlf)
  }
}

async function hVerificar($: EngineInterface, e: Record<string, unknown>): Promise<Respuesta> {
  const raiz = await $.session.root()
  const id = texto(e.tarea).trim()
  const archivo = await buscar($, raiz, id)
  if (!archivo) return { deny: `No encuentro la tarea ${id}.` }
  const { datos, cuerpo } = partir((await leer($, archivo)) ?? '')
  if (datos.estado !== 'verificacion') return { deny: `${id} está en "${datos.estado}". Muévela a "verificacion" antes.` }
  const cfg = await config($, raiz)
  const pasos = ([['build', cfg.build], ['test', cfg.test], ['lint', cfg.lint]] as const).filter(([, c]) => c.trim())
  if (!pasos.length) return { deny: 'factory/config.md no tiene build, test ni lint: no hay nada que verificar. Complétalo (o corre /fabrica:init).' }
  const cwd = texto(e.cwd).trim() || datos.worktree || raiz
  const windows = await enWindows($)
  // Lo que cambió la tarea, para el lint con {archivos}, los .sql y el lockfile.
  const archivos = (await archivosDeLaTarea($, cwd, ramaDeOrigen(datos, cfg))) ?? []
  const sqls = archivosSql(archivos)
  const sqlSinVerificar = cfg.sql.trim() ? 0 : sqls.length
  const informe: string[] = []
  const extra: Datos = {}

  // Si la tarea cambió el lockfile, el node_modules de la raíz ya no le sirve.
  if (datos.node_modules === 'enlazado' && tieneWorktreePropio(cwd, raiz) && archivos.some(esLockfile)) {
    const n = await enlazarNodeModules($, raiz, cwd, true, true)
    if (n) { extra.node_modules = n.estado; informe.push(n.nota) }
  }

  // Las pruebas unitarias son lo que más tarda y lo que más vueltas da: si no hacen falta, no se
  // corren. Build y lint, siempre.
  const pruebas = cfg.test.trim() ? await decidirLasPruebas($, raiz, id, cfg, cwd, ramaDeOrigen(datos, cfg), datos.titulo ?? id, datos.verificacion === 'fallo') : null
  let ok = true
  /** Si se corrieron las pruebas, si pasaron: es el resultado de una decisión de Jev pendiente. */
  let pasaronLasPruebas: boolean | null = null
  const todos: (readonly [string, string])[] = [...pasos, ...(cfg.sql.trim() && sqls.length ? [['sql', conArchivos(cfg.sql, sqls, windows)] as const] : [])]
  for (const [nombre, original] of todos) {
    if (nombre === 'test' && pruebas && !pruebas.si) {
      // Lo que saltó una regla (solo cambió documentación) no hace falta correrlo nunca; lo que saltó Jev queda pendiente.
      informe.push(pruebas.por === 'regla' ? `test: no hace falta (${pruebas.motivo})` : `test: omitido (${pruebas.motivo}). Falta correrlas: ${original}`)
      continue
    }
    let comando = original
    if (nombre === 'lint') {
      // Con {archivos}, solo lo que cambió la tarea: los errores de antes del proyecto no son suyos.
      const l = comandoDeLint(original, archivos, cfg.lintExtensiones, windows)
      if ('sinArchivos' in l) {
        informe.push(`lint: ok (sin archivos que lintear${cfg.lintExtensiones.length ? ` con ${cfg.lintExtensiones.join(', ')}` : ''})`)
        continue
      }
      comando = l.comando
    }
    const r = await $.process.run(enShell(comando, windows), { cwd, timeoutMs: 600_000, env: SIN_CLAVES_DE_LA_FABRICA })
      .catch(err => ({ exitCode: -1, stdout: '', stderr: String(err) }))
    const bien = r.exitCode === 0
    if (nombre === 'test') pasaronLasPruebas = bien
    // De las pruebas se dice también por qué se corrieron: la regla o lo que dijo Jev.
    informe.push(`${nombre}: ${bien ? 'ok' : `falló (código ${r.exitCode})`}${nombre === 'test' && pruebas ? ` (${pruebas.motivo})` : ''}${nombre === 'sql' ? ` (${sqls.length} ${sqls.length === 1 ? 'archivo' : 'archivos'})` : ''}`)
    if (!bien) {
      ok = false
      informe.push('```', cola(`${r.stdout}\n${r.stderr}`, 40).slice(-4000), '```')
      break
    }
  }
  if (sqlSinVerificar) informe.push(`SQL sin verificar: ${sqlSinVerificar} ${sqlSinVerificar === 1 ? 'archivo' : 'archivos'} (config no trae \`sql\`)`)
  const ts = ahora()
  const sinPruebas = pruebas !== null && !pruebas.si
  // `innecesarias`: las saltó una regla y no quedan pendientes. `omitidas`: las saltó Jev y falta correrlas.
  const comoQuedaron = !pruebas ? null : !sinPruebas ? 'corridas' as const : pruebas.por === 'regla' ? 'innecesarias' as const : 'omitidas' as const
  const estadoDePruebas: Datos = comoQuedaron ? { pruebas: comoQuedaron } : {}
  const nuevo: Datos = { ...datos, ...estadoDePruebas, ...extra, verificacion: ok ? 'ok' : 'fallo', verificada: ts, actualizada: ts }
  if (sqlSinVerificar || datos.sql_sin_verificar) nuevo.sql_sin_verificar = sqlSinVerificar ? String(sqlSinVerificar) : ''
  const nota = `verificación ${ok ? 'ok' : 'fallida'}${sinPruebas ? `, sin pruebas unitarias: ${pruebas.motivo}` : ''}${sqlSinVerificar ? `, SQL sin verificar: ${sqlSinVerificar}` : ''}`
  await $.fs.write(archivo, unir(nuevo, anotar(cuerpo, `${ts} · ${nota} en ${cwd}`)))
  await registrarEvento($, raiz, {
    ts, tarea: id, de: 'verificacion', a: 'verificacion', agente: 'fabrica', nota,
    ...(comoQuedaron ? { pruebas: comoQuedaron } : {}),
    ...(sinPruebas ? { saltado: ['test'] } : {}),
    ...(pruebas?.p !== null && pruebas?.p !== undefined ? { jev: pruebas.p } : {}),
  }, cfg)
  await refrescar($)
  // Si se corrieron, es la respuesta a una decisión de Jev pendiente: una muestra de control o un salto anterior.
  if (pasaronLasPruebas !== null) await anotarJev($, raiz, resultadoDePruebas(pendientes((await aprendido($, raiz)).lineas, id), pasaronLasPruebas, ts))
  const titulo = ok && comoQuedaron === 'omitidas' ? 'OK SIN PRUEBAS' : ok ? 'OK' : 'FALLIDA'
  return { result: `${id}: verificación ${titulo} (${cwd})\n${informe.join('\n')}` }
}

// ---- Lo que se aprende de Jev -------------------------------------------------------------------

/** Lo anotado de las decisiones de Jev en este proyecto, y los umbrales con lo aprendido. */
async function aprendido($: EngineInterface, raiz: string) {
  const lineas = lineasDeJev((await leer($, rutas(raiz).jev)) ?? '')
  return { lineas, umbrales: umbralesAjustados(lineas, UMBRALES) }
}

async function anotarJev($: EngineInterface, raiz: string, nuevas: LineaDeJev[]) {
  if (!nuevas.length) return
  const ruta = rutas(raiz).jev
  await $.fs.write(ruta, ((await leer($, ruta)) ?? '') + nuevas.map(l => JSON.stringify(l)).join('\n') + '\n')
}

/**
 * Lo que decidió Jev, listo para anotar, con la muestra de control aplicada: si Jev dijo que se
 * podía ahorrar y le toca control (pruebas y seguridad), se hace igual y se anota como control.
 * Las decisiones que tomaron las reglas no se anotan: de ellas no hay nada que aprender.
 */
function conControl(cfg: Config, tarea: string, decision: DecisionDeJev, d: Decision, umbral: number): { d: Decision; linea: LineaDeJev | null } {
  if (d.por !== 'jev' || d.p === null) return { d, linea: null }
  const control = !d.si && (decision === 'pruebas' || decision === 'seguridad') && esControl(Math.random(), cfg.jevControl)
  const final = control ? { ...d, si: true, motivo: `muestra de control: ${d.motivo}; se hace igual para saber si Jev acierta` } : d
  return { d: final, linea: { t: 'decision', ts: ahora(), tarea, decision, p: d.p, umbral, ahorra: !final.si, control } }
}

/**
 * Lo que cambió en el worktree desde que la tarea se separó de su base (el merge-base, no la rama
 * como está ahora), archivos nuevos incluidos. `null` si git no dijo nada.
 */
async function cambiosEn($: EngineInterface, cwd: string, base: string): Promise<Cambio[] | null> {
  const desde = (await mergeBaseDe($, cwd, base)) ?? base
  const [diff, nuevos] = await Promise.all([git($, cwd, ['diff', '--numstat', desde]), git($, cwd, ['ls-files', '--others', '--exclude-standard'])])
  if (diff.exitCode !== 0) return null
  const sinSeguir = nuevos.exitCode === 0 ? lineas(nuevos.stdout).map(ruta => ({ ruta, agregadas: 0, quitadas: 0 })) : []
  return delProyecto([...cambiosDeNumstat(diff.stdout), ...sinSeguir])
}

/**
 * Si una tarea aprobada es sencilla o grande. Queda en la tarea
 * (`integracion_clase`, `integracion_por`, `integracion_motivo`) y en su bitácora, una vez por
 * resultado: si el orquestador vuelve a preguntar y nada cambió, no se anota otra vez.
 */
async function clasificarLaTarea($: EngineInterface, raiz: string, archivo: string, id: string, datos: Datos, cuerpo: string, cfg: Config): Promise<Respuesta> {
  const memoria = await memoriaDe($, raiz)
  const cambios = await cambiosEn($, datos.worktree || raiz, ramaDeOrigen(datos, cfg))
  const clave = await claveDeJev($, cfg.jev)
  const { umbrales } = await aprendido($, raiz)
  const umbral = umbrales.integracion.umbral
  const base = {
    cambios,
    nucleo: nucleoDeLaFicha(memoria.proyecto),
    topes: cfg.grande,
    vueltas: Number(datos.vueltas) || 0,
    proponeMemoria: propuestasDe(cuerpo).propuestas.length > 0,
    umbral,
  }
  let c = clasificar(base)
  // Solo se le pregunta a Jev lo que el piso y las reglas no decidieron. Le llegan el título y los archivos, nunca el código.
  let p: number | undefined
  if (c.por === 'sin_jev' && clave) {
    p = (await preguntarJev($, clave, estadoParaJev(datos.titulo_ajeno === 'si' ? id : (datos.titulo ?? id), cambios ?? []), { integracion: PREGUNTA_DE_INTEGRACION }))?.integracion?.noul
    c = clasificar({ ...base, conJev: true, jev: p })
  }
  const dicho = c.tipo === 'sencilla' ? 'SENCILLA' : 'GRANDE'
  // Sin pruebas no hay sencilla: si Jev las saltó al verificar, se corren ahora, sin preguntarle a
  // nadie. Si fallan, la tarea no está lista: vuelve a construcción.
  let conPruebas: Datos = {}
  let anotacion = ''
  if (c.tipo === 'sencilla' && datos.pruebas === 'omitidas' && cfg.test.trim()) {
    const cwd = datos.worktree || raiz
    const r = await $.process.run(enShell(cfg.test, await enWindows($)), { cwd, timeoutMs: 600_000, env: SIN_CLAVES_DE_LA_FABRICA })
      .catch(err => ({ exitCode: -1, stdout: '', stderr: String(err) }))
    const bien = r.exitCode === 0
    const ts = ahora()
    await anotarJev($, raiz, resultadoDePruebas(pendientes((await aprendido($, raiz)).lineas, id), bien, ts))
    if (!bien) {
      const nota = `las pruebas que se habían omitido fallaron antes de integrarse sola (código ${r.exitCode})`
      await $.fs.write(archivo, unir({ ...datos, pruebas: 'corridas', verificacion: 'fallo', verificada: ts, actualizada: ts }, anotar(cuerpo, `${ts} · ${nota}`)))
      await registrarEvento($, raiz, { ts, tarea: id, de: datos.estado as Estado, a: datos.estado as Estado, agente: 'fabrica', nota, pruebas: 'corridas' }, cfg)
      await refrescar($)
      return { result: `${id}: PRUEBAS FALLIDAS — era sencilla, pero sus pruebas no se habían corrido y ahora fallan. Devuélvela: mover(T, "construccion", nota: "${nota}").\n\`\`\`\n${cola(`${r.stdout}\n${r.stderr}`, 30).slice(-3000)}\n\`\`\`` }
    }
    conPruebas = { pruebas: 'corridas' }
    anotacion = '; sus pruebas, que se habían omitido, se corrieron y pasan'
  }
  if (datos.integracion_clase !== c.tipo || datos.integracion_motivo !== c.motivo || datos.integracion_por !== c.por || conPruebas.pruebas) {
    const ts = ahora()
    const nota = `integración: ${c.tipo} (${c.motivo})${anotacion}`
    await $.fs.write(archivo, unir({ ...datos, ...conPruebas, integracion_clase: c.tipo, integracion_por: c.por, integracion_motivo: c.motivo, actualizada: ts }, anotar(cuerpo, `${ts} · ${nota}`)))
    await registrarEvento($, raiz, { ts, tarea: id, de: datos.estado as Estado, a: datos.estado as Estado, agente: 'fabrica', nota, ...(typeof p === 'number' ? { jev: p } : {}) }, cfg)
    // Lo que decidió Jev queda para aprender: si él marca «Debió esperarme», su umbral se aprieta.
    if (c.por === 'jev' && typeof p === 'number')
      await anotarJev($, raiz, [{ t: 'decision', ts, tarea: id, decision: 'integracion', p, umbral, ahorra: c.tipo === 'sencilla', control: false }])
    await refrescar($)
  }
  if (c.tipo === 'sencilla') return { result: `${id}: ${dicho} — ${c.motivo}${anotacion}. Puede integrarse sola: sigue con la aprobación como siempre.` }
  return { result: `${id}: ${dicho} — ${c.motivo}. Espera que la persona la pruebe a mano: déjala en aprobación, sin pasarla a hecho, y sigue con las demás. Cuando llegue su veredicto («aprobada» o «rechazada»), sigue como con un veredicto externo.` }
}

async function decidirLasPruebas($: EngineInterface, raiz: string, id: string, cfg: Config, cwd: string, base: string, titulo: string, fallóAntes: boolean): Promise<Decision> {
  const cambios = await cambiosEn($, cwd, base)
  const clave = await claveDeJev($, cfg.jev)
  const { umbrales } = await aprendido($, raiz)
  const umbral = umbrales.pruebas.umbral
  const previa = decidirPruebas({ conJev: !!clave, fallóAntes, cambios, umbral })
  // Solo se le pregunta a Jev lo que las reglas no resolvieron.
  if (previa.por !== 'sin_jev') return previa
  const r = await preguntarJev($, clave, estadoParaJev(titulo, cambios ?? []), { pruebas: PREGUNTA_DE_PRUEBAS })
  const { d, linea } = conControl(cfg, id, 'pruebas', decidirPruebas({ conJev: true, fallóAntes, cambios, jev: r?.pruebas?.noul, umbral }), umbral)
  if (linea) await anotarJev($, raiz, [linea])
  return d
}

async function hDecidir($: EngineInterface, e: Record<string, unknown>): Promise<Respuesta> {
  const raiz = await $.session.root()
  const id = texto(e.tarea).trim()
  const etapa = e.etapa
  if (etapa !== 'spec' && etapa !== 'construccion' && etapa !== 'revision' && etapa !== 'integracion') return { deny: 'etapa es "spec", "construccion", "revision" o "integracion".' }
  const archivo = await buscar($, raiz, id)
  if (!archivo) return { deny: `No encuentro la tarea ${id}.` }
  const { datos, cuerpo } = partir((await leer($, archivo)) ?? '')
  const validos: Record<string, string[]> = { spec: ['pendiente', 'spec'], construccion: ['spec', 'construccion'], revision: ['revision'], integracion: ['aprobacion'] }
  if (!validos[etapa].includes(datos.estado ?? '')) return { deny: `${id} está en "${datos.estado}": decidir "${etapa}" vale con la tarea en ${validos[etapa].join(' o ')}.` }
  const cfg = await config($, raiz)
  if (etapa === 'integracion') return clasificarLaTarea($, raiz, archivo, id, datos, cuerpo, cfg)
  const clave = await claveDeJev($, cfg.jev)
  const { umbrales } = await aprendido($, raiz)
  const titulo = datos.titulo ?? id
  const ts = ahora()

  if (etapa === 'spec') {
    // Si él eligió el modelo para esta tarea, la quiere escrita: no se le pregunta a Jev.
    const elegida = specElegidaPorEl(id, datos)
    if (elegida) return { result: elegida }
    // Con especialidades de spec en la línea, tampoco: Jev no sabe si la tarea toca IA o datos.
    const conHabilidades = specConHabilidades(id, (await leer($, unirRuta(raiz, CATALOGO_DE_HABILIDADES))) ?? null)
    if (conHabilidades) return { result: conHabilidades }
    const pedido = seccion(cuerpo, 'Pedido')
    const prohibidos = choquesConLaMemoria(await memoriaDe($, raiz), pedido).map(c => c.termino)
    const base = { conJev: !!clave, pedido, yaTieneSpec: !!seccion(cuerpo, 'Spec'), dependeDe: dependenciasDe(datos), umbral: umbrales.spec.umbral, prohibidos }
    let d = decidirSpec(base)
    if (d.por === 'sin_jev') d = decidirSpec({ ...base, conJev: true, jev: (await preguntarJev($, clave, pedidoParaJev(titulo, pedido), { spec: PREGUNTA_DE_SPEC }))?.spec?.noul })
    const { linea } = conControl(cfg, id, 'spec', d, umbrales.spec.umbral)
    if (linea) await anotarJev($, raiz, [linea])
    if (d.si)
      return {
        result: cfg.escritorSpec === 'antigravity'
          ? `${id}: SÍ hace falta una spec — ${d.motivo}. Escríbela con mcp__fabrica__spec_con_antigravity; si falla, con el agente de spec.`
          : `${id}: SÍ hace falta el agente de spec — ${d.motivo}.`,
      }
    // El pedido ya es una spec: queda como tal, y el agente de spec no se lanza.
    const nota = `sin agente de spec: ${d.motivo}`
    const spec = `${pedido}\n\n_(El pedido ya era una spec: lo decidió Jev, y quedó tal cual.)_`
    await $.fs.write(archivo, unir({ ...datos, actualizada: ts }, anotar(ponerSeccion(cuerpo, 'Spec', spec), `${ts} · ${nota}`)))
    await registrarEvento($, raiz, { ts, tarea: id, de: datos.estado as Estado, a: datos.estado as Estado, agente: 'fabrica', nota, saltado: ['spec'], ...(d.p !== null ? { jev: d.p } : {}) }, cfg)
    await refrescar($)
    return { result: `${id}: NO hace falta el agente de spec — ${d.motivo}. El pedido quedó como spec en el archivo: sigue a construcción.` }
  }

  if (etapa === 'construccion') {
    // Si él eligió el modelo para esta tarea, manda: no se le pregunta a Jev ni se abarata, en ninguna vuelta.
    const elegida = construccionElegidaPorEl(id, datos)
    if (elegida) {
      // En el camino de la tarea queda una vez por vuelta, no cada vez que el orquestador pregunta.
      if (!yaAnotado((await leer($, rutas(raiz).eventos)) ?? '', id, elegida.nota)) {
        await registrarEvento($, raiz, { ts, tarea: id, de: datos.estado as Estado, a: datos.estado as Estado, agente: 'fabrica', nota: elegida.nota }, cfg)
        await refrescar($)
      }
      return { result: elegida.result }
    }
    const leido = `${seccion(cuerpo, 'Pedido')}\n\n${seccion(cuerpo, 'Spec')}`.trim()
    const base = { conJev: !!clave, vueltas: Number(datos.vueltas) || 0, umbral: umbrales.modelo.umbral }
    let d = decidirModelo(base)
    if (d.por === 'sin_jev') d = decidirModelo({ ...base, conJev: true, jev: (await preguntarJev($, clave, pedidoParaJev(titulo, leido), { tamano: PREGUNTA_DE_TAMANO }))?.tamano?.noul })
    const { linea } = conControl(cfg, id, 'modelo', d, umbrales.modelo.umbral)
    if (linea) await anotarJev($, raiz, [linea])
    const configurado = cfg.modelos.construccion
    const deConfig = configurado === 'inherit' ? 'el de la corrida' : configurado
    if (d.si) return { result: `${id}: construye con ${configurado === 'inherit' ? 'el modelo de la corrida (sin `model`)' : `model: "${configurado}" (de config)`} — ${d.motivo}.` }
    // Jev pide abaratar: Sonnet, salvo que config ya pida uno más barato.
    const barato = masBarato('sonnet', configurado)
    if (barato === configurado && configurado !== 'inherit') return { result: `${id}: construye con model: "${configurado}" (de config, ya es barato) — ${d.motivo}.` }
    const nota = `construcción con un modelo más barato (${barato}, en vez de ${deConfig}): ${d.motivo}`
    await $.fs.write(archivo, unir({ ...datos, actualizada: ts }, anotar(cuerpo, `${ts} · ${nota}`)))
    await registrarEvento($, raiz, { ts, tarea: id, de: datos.estado as Estado, a: datos.estado as Estado, agente: 'fabrica', nota, saltado: ['modelo'], ...(d.p !== null ? { jev: d.p } : {}) }, cfg)
    await refrescar($)
    return { result: `${id}: construye con model: "${barato}" — ${d.motivo}. Si vuelve a construcción, va con ${deConfig}.` }
  }

  const cambios = await cambiosEn($, datos.worktree || raiz, ramaDeOrigen(datos, cfg))
  const baseSeguridad = { conJev: !!clave, cambios, umbral: umbrales.seguridad.umbral }
  let seguridad = decidirSeguridad(baseSeguridad)
  if (seguridad.por === 'sin_jev') {
    const r = await preguntarJev($, clave, estadoParaJev(titulo, cambios ?? []), { seguridad: PREGUNTA_DE_SEGURIDAD })
    const controlada = conControl(cfg, id, 'seguridad', decidirSeguridad({ ...baseSeguridad, conJev: true, jev: r?.seguridad?.noul }), umbrales.seguridad.umbral)
    seguridad = controlada.d
    if (controlada.linea) await anotarJev($, raiz, [controlada.linea])
  }
  const revisores: [string, string, Decision][] = [
    ['revision_codigo', 'código', decidirCodigo(cambios)],
    ['revision_seguridad', 'seguridad', seguridad],
    ['ui', 'UI/UX', decidirUi(cfg.ui, cambios)],
  ]
  const saltados = revisores.filter(([, , d]) => !d.si)
  if (saltados.length) {
    const nota = `sin revisión de ${saltados.map(([, n, d]) => `${n} (${d.motivo})`).join('; ')}`
    await $.fs.write(archivo, unir({ ...datos, actualizada: ts }, anotar(cuerpo, `${ts} · ${nota}`)))
    await registrarEvento($, raiz, {
      ts, tarea: id, de: 'revision', a: 'revision', agente: 'fabrica', nota, saltado: saltados.map(([rol]) => rol),
      ...(seguridad.p !== null ? { jev: seguridad.p } : {}),
    }, cfg)
    await refrescar($)
  }
  const conCodex: Record<string, string> = {
    codex: ' — con Codex: llama a mcp__fabrica__revisar_con_codex en vez de lanzar el agente (si falla, el agente)',
    ambos: ' — con el agente y además con Codex (mcp__fabrica__revisar_con_codex): los dos bajo «### Código»',
  }
  const lineas = revisores.map(([rol, n, d]) => `${rol} (${n}): ${d.si ? 'SÍ' : 'NO'} — ${d.motivo}${d.si && rol === 'revision_codigo' ? (conCodex[cfg.revisorCodigo] ?? '') : ''}`)
  const ninguno = revisores.every(([, , d]) => !d.si)
  return { result: [`${id}: revisores que hacen falta`, ...lineas, ...(ninguno ? ['Ninguno: pasa la tarea a verificación sin lanzar revisores.'] : ['Lanza solo los que dicen SÍ. Agrupa los hallazgos por revisor con «### Código», «### Seguridad» y «### UI».'])].join('\n') }
}

// ---- Otros agentes: Codex y Antigravity -----------------------------------------------------------

/** Dónde dejar los archivos de paso de Codex: dentro de .git, que nunca se versiona; sin git, en factory/. */
async function carpetaDePaso($: EngineInterface, raiz: string): Promise<string> {
  const git = unirRuta(raiz, '.git')
  const hayGit = await $.fs.list(git).then(() => true, () => false)
  return hayGit ? unirRuta(git, 'fabrica') : unirRuta(raiz, 'factory', '.paso')
}

/** Cómo va el trabajo de un agente de otros, por los archivos que deja el lanzador en su carpeta. */
async function leerTrabajo($: EngineInterface, dir: string): Promise<EstadoDelTrabajo> {
  const [inicio, codigo, salida, error, leido] = await Promise.all(['inicio', 'codigo', 'salida', 'error', 'leido'].map(f => leer($, unirRuta(dir, `${f}.txt`))))
  return estadoDelTrabajo({ inicio, codigo, salida, error, leido }, Date.now(), TOPE_EXTERNO_MS)
}

/** Arranca el agente desligado del mod (ver externos.ts, «El lanzador»). `false` si no pudo: sin node, por ejemplo. */
async function iniciarTrabajo($: EngineInterface, dir: string, argv: readonly string[], cwd: string, entrada: string): Promise<{ ok: boolean; error: string }> {
  await $.fs.write(unirRuta(dir, 'pedido.txt'), entrada)
  const r = await $.process.run(comandoDelLanzador({ dir, argv, cwd, topeMs: TOPE_EXTERNO_MS, env: SIN_CLAVES_DE_LA_FABRICA }), { cwd, timeoutMs: 30_000, env: SIN_CLAVES_DE_LA_FABRICA })
    .catch(err => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  return { ok: r.exitCode === 0, error: r.stderr }
}

/** Espera a que termine, a lo más `ms`. Espera un `node` aparte: dentro de un `$` el tiempo no cuenta para el mod. */
async function esperarTrabajo($: EngineInterface, dir: string, ms: number): Promise<EstadoDelTrabajo> {
  const t = await leerTrabajo($, dir)
  if (t.estado !== 'corriendo') return t
  await $.process.run(comandoDeEspera(dir, ms), { timeoutMs: ms + 30_000, env: SIN_CLAVES_DE_LA_FABRICA }).catch(() => null)
  return leerTrabajo($, dir)
}

const enCurso = (id: string, quien: string, inicio: number, otra: string) =>
  ({ result: `${id}: EN CURSO — ${quien} lleva ${Math.round((Date.now() - inicio) / 60_000)} min. ${otra} Sigue con las demás tareas y vuelve a llamar a esta herramienta con la misma tarea; si no queda nada más, llámala de nuevo: espera unos minutos cada vez.` })

/**
 * La ruta exacta de Codex o de Antigravity en este equipo, o vacío si no está. La aplicación la pasa
 * a la corrida con estos nombres, de FACTORIA_CODEX_BIN y FACTORIA_ANTIGRAVITY_BIN. No se buscan en
 * el PATH: lo decidió Felipe el 17 de octubre de 2026. Sin ella, ese agente no corre y entra el de
 * Claude.
 */
const rutaDeCodex = async ($: EngineInterface) => ((await $.env.get('FABRICA_CODEX_BIN').catch(() => undefined)) ?? '').trim()
const rutaDeAntigravity = async ($: EngineInterface) => ((await $.env.get('FABRICA_ANTIGRAVITY_BIN').catch(() => undefined)) ?? '').trim()

async function hRevisarConCodex($: EngineInterface, e: Record<string, unknown>): Promise<Respuesta> {
  const raiz = await $.session.root()
  const id = texto(e.tarea).trim()
  const archivo = await buscar($, raiz, id)
  if (!archivo) return { deny: `No encuentro la tarea ${id}.` }
  const { datos, cuerpo } = partir((await leer($, archivo)) ?? '')
  if (datos.estado !== 'revision') return { deny: `${id} está en "${datos.estado}", no en "revision".` }
  const cfg = await config($, raiz)
  if (cfg.revisorCodigo === 'claude') return { deny: 'Codex está apagado para este proyecto (revisor_codigo: claude): lanza el revisor de código de Claude.' }
  const dir = unirRuta(await carpetaDePaso($, raiz), 'trabajos', `codex-${id}`)
  const salida = unirRuta(dir, 'revision.json')
  if ((await leerTrabajo($, dir)).estado === 'ninguno') {
    const esquema = unirRuta(dir, 'esquema-revision.json')
    await $.fs.write(esquema, JSON.stringify(ESQUEMA_REVISION))
    await $.fs.write(salida, '')
    const bin = await rutaDeCodex($)
    if (!bin) return { result: `${id}: Codex no está configurado en este equipo (falta FACTORIA_CODEX_BIN, su ruta exacta). Lanza el revisor de código de Claude en su lugar.` }
    const donde = datos.worktree || raiz
    const base = ramaDeOrigen(datos, cfg)
    // Contra el commit donde se separó, no contra la rama: así ve solo lo de la tarea.
    const desde = (await mergeBaseDe($, donde, base)) ?? base
    const lanzado = await iniciarTrabajo($, dir, comandoDeCodex(bin, esquema, salida), donde, pedidoDeRevision(desde, seccion(cuerpo, 'Spec')))
    if (!lanzado.ok) return { result: `${id}: no se pudo lanzar Codex (${lanzado.error.slice(-300) || 'sin detalle'}; hace falta node en el PATH). Lanza el revisor de código de Claude en su lugar.` }
  }
  const t = await esperarTrabajo($, dir, ESPERA_POR_LLAMADA_MS)
  if (t.estado === 'corriendo') return enCurso(id, 'Codex', t.inicio, 'La revisión de Codex sigue.')
  if (t.estado !== 'terminado') return { result: `${id}: el trabajo de Codex se perdió. Lanza el revisor de código de Claude en su lugar.` }
  await $.fs.write(unirRuta(dir, 'leido.txt'), ahora())
  const segundos = Math.round((Date.now() - t.inicio) / 1000)
  const revision = t.codigo === 0 ? leerRevisionDeCodex(await leer($, salida)) : null
  const tokens = tokensDeCodex(`${t.salida}\n${t.error}`)
  const bloqueantes = revision?.hallazgos.filter(h => h.gravedad === 'BLOQUEANTE').length ?? 0
  const nota = revision ? `revisión de Codex: ${bloqueantes} ${bloqueantes === 1 ? 'bloqueante' : 'bloqueantes'}, ${revision.hallazgos.length - bloqueantes} ${revision.hallazgos.length - bloqueantes === 1 ? 'menor' : 'menores'}` : `Codex no pudo revisar (código ${t.codigo ?? 'sin código'})`
  await registrarEvento($, raiz, { ts: ahora(), tarea: id, de: 'revision', a: 'revision', agente: 'codex', nota, externo: { quien: 'codex', segundos, tokens, ok: !!revision } }, cfg)
  if (!revision) return { result: `${id}: Codex no pudo revisar (código ${t.codigo ?? 'sin código'}, ${segundos} s): ${cola(`${t.salida}\n${t.error}`, 8).slice(-800)}\nLanza el revisor de código de Claude en su lugar.` }
  return { result: `${id}: ${nota} (${segundos} s). Ponlo bajo «### Código» tal cual:\n\n${hallazgosEnMarkdown(revision)}` }
}

async function hSpecConAntigravity($: EngineInterface, e: Record<string, unknown>): Promise<Respuesta> {
  const raiz = await $.session.root()
  const id = texto(e.tarea).trim()
  const archivo = await buscar($, raiz, id)
  if (!archivo) return { deny: `No encuentro la tarea ${id}.` }
  const { datos, cuerpo } = partir((await leer($, archivo)) ?? '')
  if (datos.estado !== 'pendiente' && datos.estado !== 'spec') return { deny: `${id} está en "${datos.estado}": la spec se escribe en "pendiente" o "spec".` }
  const cfg = await config($, raiz)
  if (cfg.escritorSpec !== 'antigravity') return { deny: 'Antigravity está apagado para este proyecto (escritor_spec: claude): lanza el agente de spec.' }
  const dir = unirRuta(await carpetaDePaso($, raiz), 'trabajos', `antigravity-${id}`)
  if ((await leerTrabajo($, dir)).estado === 'ninguno') {
    // Las referencias las recibe el agente de spec de Claude; a Antigravity no se le pasan.
    if (await referenciasDeLaTarea($, id)) return { result: `${id}: trae referencias, que Antigravity no recibe. Lanza el agente de spec de Claude en su lugar.` }
    const notas = partir((await leer($, rutas(raiz).config)) ?? '').cuerpo
    const bin = await rutaDeAntigravity($)
    if (!bin) return { result: `${id}: Antigravity no está configurado en este equipo (falta FACTORIA_ANTIGRAVITY_BIN, su ruta exacta). Lanza el agente de spec de Claude en su lugar.` }
    const comando = comandoDeAntigravity(bin, pedidoDeSpec(id, datos.titulo ?? id, seccion(cuerpo, 'Pedido'), notas))
    if (!comando) return { result: `${id}: la ruta de Antigravity es un .cmd o un .bat, y el pedido no puede pasar por cmd.exe: FACTORIA_ANTIGRAVITY_BIN tiene que ser su ejecutable. Lanza el agente de spec de Claude en su lugar.` }
    const lanzado = await iniciarTrabajo($, dir, comando, raiz, '')
    if (!lanzado.ok) return { result: `${id}: no se pudo lanzar Antigravity (${lanzado.error.slice(-300) || 'sin detalle'}; hace falta node en el PATH). Lanza el agente de spec de Claude en su lugar.` }
  }
  const t = await esperarTrabajo($, dir, ESPERA_POR_LLAMADA_MS)
  if (t.estado === 'corriendo') return enCurso(id, 'Antigravity', t.inicio, 'Está leyendo el proyecto para escribir la spec.')
  if (t.estado !== 'terminado') return { result: `${id}: el trabajo de Antigravity se perdió. Lanza el agente de spec de Claude en su lugar.` }
  await $.fs.write(unirRuta(dir, 'leido.txt'), ahora())
  const segundos = Math.round((Date.now() - t.inicio) / 1000)
  const leida = t.codigo === 0 ? leerSpecDeAntigravity(t.salida) : null
  const ts = ahora()
  const externo = { quien: 'antigravity' as const, segundos, tokens: leida?.tokens ?? null, ok: !!leida }
  if (!leida) {
    await registrarEvento($, raiz, { ts, tarea: id, de: datos.estado as Estado, a: datos.estado as Estado, agente: 'antigravity', nota: `Antigravity no pudo escribir la spec (código ${t.codigo ?? 'sin código'})`, externo }, cfg)
    return { result: `${id}: Antigravity no pudo escribir la spec (código ${t.codigo ?? 'sin código'}, ${segundos} s): ${cola(t.error, 6).slice(-600)}\nLanza el agente de spec de Claude en su lugar.` }
  }
  const { spec } = leida
  if (spec.ambiguo) {
    await registrarEvento($, raiz, { ts, tarea: id, de: datos.estado as Estado, a: datos.estado as Estado, agente: 'antigravity', nota: 'pedido ambiguo: devolvió preguntas', externo }, cfg)
    return { result: `${id}: PEDIDO AMBIGUO según Antigravity (${segundos} s). Mueve la tarea a necesita-humano con estas preguntas:\n${spec.preguntas.join('\n')}` }
  }
  const nota = 'spec escrita por Antigravity'
  await $.fs.write(archivo, unir({ ...datos, actualizada: ts }, anotar(ponerSeccion(cuerpo, 'Spec', `${spec.spec}\n\n_(La escribió Antigravity.)_`), `${ts} · ${nota} (${segundos} s)`)))
  await registrarEvento($, raiz, { ts, tarea: id, de: datos.estado as Estado, a: datos.estado as Estado, agente: 'antigravity', nota, externo }, cfg)
  await refrescar($)
  return { result: `${id}: Antigravity escribió la spec (${segundos} s); quedó en el archivo. Sigue a construcción.` }
}

async function hAprobar($: EngineInterface, e: Record<string, unknown>): Promise<Respuesta> {
  const raiz = await $.session.root()
  const cfg = await config($, raiz)
  // Vale el veredicto de cualquiera de los agentes que pueden tener el rol de aprobación.
  const validos = candidatosDeLaCorrida('aprobacion', cfg.agentes.aprobacion)
  const tipo = await tipoDeAgente($, texto(e.agentId) || undefined)
  if (!tipo || !validos.includes(tipo)) return { deny: `El veredicto lo da el agente de aprobación (${validos.join(' o ')}). Delega en él.` }
  const v = e.veredicto
  if (v !== 'aprobada' && v !== 'rechazada') return { deny: 'veredicto es "aprobada" o "rechazada".' }
  const id = texto(e.tarea).trim()
  const archivo = await buscar($, raiz, id)
  if (!archivo) return { deny: `No encuentro la tarea ${id}.` }
  const { datos, cuerpo } = partir((await leer($, archivo)) ?? '')
  if (datos.estado !== 'aprobacion') return { deny: `${id} está en "${datos.estado}", no en "aprobacion".` }
  // Con un BLOQUEANTE abierto en los hallazgos, no se aprueba: es lo que pasó con F-011.
  const abiertos = bloqueantesEn(cuerpo)
  if (v === 'aprobada' && abiertos) return { deny: `${id} tiene ${abiertos} ${abiertos === 1 ? 'BLOQUEANTE' : 'BLOQUEANTES'} en «## Hallazgos de revisión»: no se aprueba así. Recházala con cuál falta, o, si ya se resolvió, dilo en el motivo y que el orquestador corrija la sección.` }
  const ts = ahora()
  const motivo = texto(e.motivo).trim()
  const conVeredicto = anotarVeredicto(cuerpo, `- ${ts} · ${tipo}: **${v}**${motivo ? ` — ${motivo}` : ''}`)
  await $.fs.write(archivo, unir({ ...datos, aprobacion_agente: v, actualizada: ts }, anotar(conVeredicto, `${ts} · aprobador: ${v} — ${motivo}`)))
  await registrarEvento($, raiz, { ts, tarea: id, de: 'aprobacion', a: 'aprobacion', agente: tipo, nota: `${v}: ${motivo}` }, cfg)
  await refrescar($)
  return { result: `Veredicto registrado para ${id}: ${v}.` }
}

/** Suelta las tareas que tomó esta sesión, con una línea en su bitácora. */
async function liberarLasDeEstaSesion($: EngineInterface) {
  const sesion = await $.session.id().catch(() => '')
  if (!sesion) return
  const raiz = await $.session.root()
  const ts = ahora()
  for (const t of await todasLasTareas($, raiz)) {
    const libre = liberadaPor(t.datos, sesion)
    if (libre) await $.fs.write(t.archivo, unir(libre, anotar(t.cuerpo, `${ts} · la sesión que la trabajaba terminó: queda libre`)))
  }
}

/** Si un cambio en `depende_de` forma un ciclo: el motivo para frenarlo, o `null`. */
async function cicloAlEditar($: EngineInterface, antes: string, despues: string): Promise<string | null> {
  const v = partir(antes).datos
  const n = partir(despues).datos
  if ((v.depende_de ?? '') === (n.depende_de ?? '') || !n.id) return null
  return cicloSiDepende($, await $.session.root(), n.id, dependenciasDe(n))
}

// Un fallo dentro de una herramienta vuelve al modelo como respuesta, con el motivo, en vez de
// dejar la llamada sin contestar.
const falla = (err: unknown): Respuesta => ({ deny: `La fábrica no pudo completar la llamada: ${String(err)}` })
const datosDe = (e: unknown) => e as Record<string, unknown>

// ---- Tablero ------------------------------------------------------------------------------------

const ORDEN: readonly Estado[] = ['necesita-humano', 'aprobacion', 'verificacion', 'revision', 'construccion', 'spec', 'pendiente', 'hecho', 'descartada']
const COLOR: Partial<Record<Estado, string>> = {
  'necesita-humano': 'error', aprobacion: 'warning', verificacion: 'suggestion', revision: 'suggestion',
  construccion: 'claude', spec: 'claude', hecho: 'success',
}
const NOMBRE: Record<Estado, string> = {
  pendiente: 'En cola', spec: 'Especificación', construccion: 'Construcción', revision: 'Revisión',
  verificacion: 'Verificación', aprobacion: 'Aprobación', 'necesita-humano': 'Espera a un humano',
  hecho: 'Hechas', descartada: 'Descartadas',
}

const hora = (iso?: string) => (iso ? iso.slice(11, 16) : '')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    for (const h of HERRAMIENTAS) await $.tool.register(h)
    await $.command.register({ name: 'tablero', description: 'Fábrica: abre el tablero de tareas del proyecto' })
    await refrescarSinRuido($)
    $.clock.every(4000, () => void refrescarSinRuido($))
    return next(e)
  })

  // Lo que esta sesión tenía tomado queda libre al cerrarse: la corrida siguiente es otra sesión.
  on('session.end', async ($, e, next) => {
    await liberarLasDeEstaSesion($).catch(err => $.ui.log(`fabrica: ${String(err)}`, { to: 'debug' }))
    return next(e)
  })

  on('command.run', { command: 'tablero' }, async $ => {
    await refrescarSinRuido($)
    const raiz = await read($, raizRef)
    if (!raiz) return { text: 'Este proyecto no tiene fábrica todavía. Corre /fabrica:init.' }
    await $.ui.open({ id: PANEL, title: 'Fábrica' })
    return { text: 'Tablero de la fábrica abierto.' }
  })

  // El .catch cubre lo que `seguro` no alcanza (tiempo agotado, reentrada).
  const SIN_RESPUESTA = { deny: 'La fábrica no respondió a tiempo. Reintenta la llamada.' }
  on('tool.call', { tool: 'mcp__fabrica__estado' }, async ($, e) => {
    try { return await hEstado($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)
  on('tool.call', { tool: 'mcp__fabrica__nueva' }, async ($, e) => {
    try { return await hNueva($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)
  on('tool.call', { tool: 'mcp__fabrica__mover' }, async ($, e) => {
    try { return await hMover($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)
  on('tool.call', { tool: 'mcp__fabrica__verificar' }, async ($, e) => {
    try { return await hVerificar($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)
  on('tool.call', { tool: 'mcp__fabrica__sincronizar' }, async ($, e) => {
    try { return await hSincronizar($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)
  on('tool.call', { tool: 'mcp__fabrica__decidir' }, async ($, e) => {
    try { return await hDecidir($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)
  on('tool.call', { tool: 'mcp__fabrica__revisar_con_codex' }, async ($, e) => {
    try { return await hRevisarConCodex($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)
  on('tool.call', { tool: 'mcp__fabrica__spec_con_antigravity' }, async ($, e) => {
    try { return await hSpecConAntigravity($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)
  on('tool.call', { tool: 'mcp__fabrica__aprobar' }, async ($, e) => {
    try { return await hAprobar($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)
  on('tool.call', { tool: 'mcp__fabrica__salida' }, async ($, e) => {
    try { return await hSalida($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)
  on('tool.call', { tool: 'mcp__fabrica__anuncio' }, async ($, e) => {
    try { return await hAnuncio($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)
  on('tool.call', { tool: 'mcp__fabrica__agentes' }, async ($, e) => {
    try { return await hAgentes($, datosDe(e)) } catch (err) { return falla(err) }
  }).catch(() => SIN_RESPUESTA)

  // Nadie cambia a mano lo que decide la cadena. Si la guarda falla, la edición pasa: es una
  // red, no la única defensa (mover sigue validando cada transición).
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    // Un subagente no toca config.md; el hilo principal sí (/fabrica:init, o el usuario en su sesión).
    const config = frenaConfig(e.file_path, e.agentId)
    if (config) return { deny: config }
    // Ni la memoria: lo que el proyecto decidió lo escribe una persona.
    const memoria = frenaMemoria(e.file_path, e.agentId, await carpetaDeLaPlanta($))
    if (memoria) return { deny: memoria }
    // Ni las habilidades: qué instrucciones siguen los agentes lo decide una persona.
    const habilidades = frenaHabilidades(e.file_path, e.agentId)
    if (habilidades) return { deny: habilidades }
    // Ni los procesos: lo que corre al publicar lo decide una persona.
    const procesos = frenaProcesos(e.file_path, e.agentId)
    if (procesos) return { deny: procesos }
    // Ni las referencias de una tarea: las agregó una persona, y se leen.
    const referencias = frenaReferencias(e.file_path, await carpetaDeReferencias($))
    if (referencias) return { deny: referencias }
    if (!esArchivoDeTarea(e.file_path)) return next(e)
    if (editaCamposDelMod(e.old_string, e.new_string)) return { deny: SOLO_EL_MOD }
    if (!/depende_de:/.test(`${e.old_string}\n${e.new_string}`)) return next(e)
    const antes = (await leer($, e.file_path)) ?? ''
    const despues = e.replace_all ? antes.split(e.old_string).join(e.new_string) : antes.replace(e.old_string, () => e.new_string)
    const ciclo = await cicloAlEditar($, antes, despues).catch(() => null)
    return ciclo ? { deny: ciclo } : next(e)
  })
  // Un agente de una etapa no invoca una habilidad que su etapa no tiene en el catálogo. Si la guarda
  // falla, pasa: los agentes de la fábrica no traen la herramienta Skill.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    try {
      const raiz = await $.session.root()
      const no = frenaHabilidad({
        habilidad: texto(e.skill),
        agentId: texto(e.agentId) || undefined,
        tipo: await tipoDeAgente($, texto(e.agentId) || undefined),
        catalogo: (await leer($, unirRuta(raiz, CATALOGO_DE_HABILIDADES))) ?? null,
        agentes: (await config($, raiz)).agentes,
      })
      if (no) return { deny: no }
    } catch {
      // La red no tapa la herramienta.
    }
    return next(e)
  })

  // Al lanzar el agente de una etapa con habilidades, queda en la bitácora de su tarea qué recibió y
  // en qué versión; al lanzar el de la spec, su camino dice con qué modelo. Son registros: si
  // fallan, el agente se lanza igual.
  for (const herramienta of ['Agent', 'Task']) {
    on('tool.call', { tool: herramienta }, async ($, e, next) => {
      // Con el agente de la etapa con sus habilidades en la corrida, no se lanza el de siempre.
      // Si la guarda falla, pasa: es una red, no la única defensa.
      try {
        const no = frenaSinHabilidades({
          tipo: texto(e.subagent_type) || undefined,
          agentes: (await config($, await $.session.root())).agentes,
          habilidades: habilidadesDeLaCorridaDesde(await $.env.get('FABRICA_HABILIDADES').catch(() => undefined)),
        })
        if (no) return { deny: no }
      } catch {
        // La red no tapa la herramienta.
      }
      await anotarHabilidades($, e).catch(() => undefined)
      await anotarModeloDeSpec($, e).catch(() => undefined)
      return next(e)
    })
  }

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const config = frenaConfig(e.file_path, e.agentId)
    if (config) return { deny: config }
    const memoria = frenaMemoria(e.file_path, e.agentId, await carpetaDeLaPlanta($))
    if (memoria) return { deny: memoria }
    const habilidades = frenaHabilidades(e.file_path, e.agentId)
    if (habilidades) return { deny: habilidades }
    // Ni los procesos: lo que corre al publicar lo decide una persona.
    const procesos = frenaProcesos(e.file_path, e.agentId)
    if (procesos) return { deny: procesos }
    const referencias = frenaReferencias(e.file_path, await carpetaDeReferencias($))
    if (referencias) return { deny: referencias }
    if (!esArchivoDeTarea(e.file_path)) return next(e)
    const antes = await leer($, e.file_path)
    if (escribeCamposDelMod(antes, e.content)) return { deny: SOLO_EL_MOD }
    const ciclo = await cicloAlEditar($, antes ?? '', e.content).catch(() => null)
    return ciclo ? { deny: ciclo } : next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const raiz = await read($, raizRef)
    const tareas = await read($, tareasRef)
    const eventos = await read($, eventosRef)
    if (!raiz) return <Text dimColor>Este proyecto no tiene fábrica. Corre /fabrica:init.</Text>

    const c = contar(tareas)
    const proyecto = raiz.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? raiz
    const grupos = ORDEN.map(est => ({ est, lista: tareas.filter(t => t.estado === est) })).filter(g => g.lista.length)

    return (
      <Box flexDirection="column">
        <Text bold>{proyecto}</Text>
        <Text dimColor>
          {c.enCurso} en curso · {c.pendientes} en cola · {c.humano} esperan humano · {c.hechas} hechas
        </Text>
        {grupos.length === 0 && <Text dimColor>Sin tareas. Crea una con /fabrica:nueva.</Text>}
        {grupos.map(g => (
          <Box key={`g-${g.est}`} flexDirection="column" marginTop={1}>
            <Text bold color={COLOR[g.est]}>{NOMBRE[g.est]} ({g.lista.length})</Text>
            {g.lista.map(t => (
              <Box key={`t-${t.id}`} flexDirection="column">
                <Text wrap="truncate-end">
                  {t.id} {t.titulo}
                  <Text dimColor>
                    {t.vueltas ? ` · vuelta ${t.vueltas}` : ''}
                    {t.verificacion !== 'pendiente' ? ` · verif ${t.verificacion}` : ''}
                    {t.veredictoExterno ? ` · externo: ${t.veredictoExterno}` : ''}
                    {t.integrada ? ' · integrada' : ''}
                    {t.dependeDe.length && t.estado === 'pendiente' ? ` · depende de ${t.dependeDe.join(', ')}` : ''}
                    {t.tomadaPor && t.tomadaHasta && Date.parse(t.tomadaHasta) > Date.now() ? ' · tomada' : ''}
                    {t.sqlSinVerificar ? ` · SQL sin verificar: ${t.sqlSinVerificar}` : ''}
                  </Text>
                </Text>
                {t.motivo && <Text color="error" wrap="truncate-end">  {t.motivo}</Text>}
              </Box>
            ))}
          </Box>
        ))}
        {eventos.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Últimos movimientos</Text>
            {[...eventos].reverse().map((ev, i) => (
              <Text key={`e-${i}`} dimColor wrap="truncate-end">
                {hora(ev.ts)} {ev.tarea} {ev.de && ev.de !== ev.a ? `${ev.de} → ${ev.a}` : ev.a}
                {ev.nota ? ` · ${ev.nota}` : ''}
              </Text>
            ))}
          </Box>
        )}
        <Box marginTop={1}>
          <Button
            key="correr"
            label="Correr la cola"
            variant="primary"
            onPress={() => void $.prompt.fill({ text: '/fabrica:correr' })}
          />
        </Box>
      </Box>
    )
  })
}
