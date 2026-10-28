// Otros agentes de programación que la fábrica puede usar en vez de Claude, o además de él:
// Codex (OpenAI) para revisar código y Antigravity (Google) para escribir la spec. Los corre el mod
// directo, sin interfaz, con la suscripción de cada uno, como corre la verificación.
//
// Vienen apagados: usarlos manda código del proyecto a OpenAI o a Google, y eso se decide proyecto
// por proyecto en factory/config.md (`revisor_codigo`, `escritor_spec`). Lo decidió Felipe el 17 de
// octubre de 2026; en Atalaya ya había dejado el código del trabajo fuera de Codex.
//
// Los dos trabajan sin poder editar: Codex en su sandbox de solo lectura, Antigravity en modo plan
// con su sandbox de terminal. Si no tienen su ruta, fallan o pasan del tiempo, entra el agente de
// Claude de siempre. Aquí va la lógica pura: cómo se los llama y cómo se lee lo que devuelven.

export type RevisorCodigo = 'claude' | 'codex' | 'ambos'
export type EscritorSpec = 'claude' | 'antigravity'

/** Lo que devuelve la revisión de Codex, con la forma que le pide su esquema. */
export type Hallazgo = { gravedad: 'BLOQUEANTE' | 'MENOR'; archivo: string; linea: number; texto: string }
export type RevisionDeCodex = { resumen: string; hallazgos: Hallazgo[] }
/** Lo que devuelve la spec de Antigravity. */
export type SpecDeAntigravity = { ambiguo: boolean; preguntas: string[]; spec: string }

/**
 * Corren en segundo plano: la fábrica trabaja desatendida y el tiempo no apura. El tope es solo
 * para que nada quede colgado para siempre. Cada llamada a la herramienta espera a lo más
 * `ESPERA_POR_LLAMADA_MS`; si no terminó, responde «EN CURSO» y el orquestador vuelve a llamar.
 */
export const TOPE_EXTERNO_MS = 60 * 60_000
export const ESPERA_POR_LLAMADA_MS = 4 * 60_000

export const ESQUEMA_REVISION = {
  type: 'object',
  additionalProperties: false,
  required: ['hallazgos', 'resumen'],
  properties: {
    resumen: { type: 'string' },
    hallazgos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['gravedad', 'archivo', 'linea', 'texto'],
        properties: {
          gravedad: { type: 'string', enum: ['BLOQUEANTE', 'MENOR'] },
          archivo: { type: 'string' },
          linea: { type: 'integer' },
          texto: { type: 'string' },
        },
      },
    },
  },
}

export const ESQUEMA_SPEC = {
  type: 'object',
  additionalProperties: false,
  required: ['ambiguo', 'preguntas', 'spec'],
  properties: { ambiguo: { type: 'boolean' }, preguntas: { type: 'array', items: { type: 'string' } }, spec: { type: 'string' } },
}

/**
 * Lo que se le pide a Codex. Va por la entrada estándar, que así queda cerrada: abierta, se cuelga.
 * `mergeBase` es el commit donde la tarea se separó de su rama de origen, no el nombre de la rama:
 * contra un `main` local atrasado, Codex revisó unos 2585 archivos y marcó bloqueantes que no eran
 * de la tarea (19 de octubre de 2026).
 */
export function pedidoDeRevision(mergeBase: string, spec: string): string {
  return [
    'Eres revisor de código de una fábrica de software. Revisa solo lo que cambió en esta tarea desde el commit',
    `${mergeBase}: mira git diff ${mergeBase} y git status (los archivos nuevos también cuentan). No edites nada.`,
    'Marca cada hallazgo como BLOQUEANTE (bug, hueco de seguridad real, incumple la spec o rompe algo que ya',
    'existía) o MENOR, con archivo y línea. Escribe en español neutro. Si no hay hallazgos, la lista va vacía.',
    ...(spec.trim() ? ['', 'La spec de la tarea:', '', spec.slice(0, 8000)] : []),
  ].join('\n')
}

/** Lo que se le pide a Antigravity. */
export function pedidoDeSpec(id: string, titulo: string, pedido: string, notas: string): string {
  return [
    `Eres el escritor de especificaciones de una fábrica de software. Tarea ${id}: ${titulo}.`,
    '',
    'El pedido:',
    pedido.slice(0, 6000),
    ...(notas.trim() ? ['', 'Notas del proyecto:', notas.slice(0, 3000)] : []),
    '',
    'Lee el código del proyecto que haga falta, sin editar nada, y escribe la spec en Markdown, en español',
    'neutro: objetivo, criterios de aceptación comprobables, qué archivos toca y qué queda fuera. Si el pedido',
    'no alcanza para escribirla sin inventar requisitos, marca ambiguo y deja las preguntas numeradas para el',
    'humano: cada una tiene que poder leerse sola.',
  ].join('\n')
}

const esDeConsola = (bin: string) => /\.(cmd|bat)$/i.test(bin)

/**
 * Cómo se llama a Codex. En Windows viene de npm como un .cmd, que solo corre dentro de cmd.exe; el
 * pedido le llega por la entrada estándar, así que a cmd solo le llegan rutas y opciones.
 */
export function comandoDeCodex(bin: string, esquema: string, salida: string): string[] {
  const args = ['exec', '-s', 'read-only', '--output-schema', esquema, '-o', salida, '-']
  return esDeConsola(bin) ? ['cmd.exe', '/d', '/s', '/c', bin, ...args] : [bin, ...args]
}

/**
 * Cómo se llama a Antigravity, o `null` si su ruta es un .cmd o un .bat: a él el pedido le llega
 * como argumento, con el texto de la tarea, y cmd.exe interpretaría lo que traiga (`&`, `|`…).
 */
export function comandoDeAntigravity(bin: string, prompt: string): string[] | null {
  if (esDeConsola(bin)) return null
  return [
    bin, '-p', prompt, '--mode', 'plan', '--sandbox', '--dangerously-skip-permissions',
    '--output-format', 'json', '--json-schema', JSON.stringify(ESQUEMA_SPEC), '--print-timeout', `${TOPE_EXTERNO_MS / 1000}s`,
  ]
}

/** La revisión que dejó Codex en su archivo de salida. `null` si no tiene la forma pedida. */
export function leerRevisionDeCodex(texto: string | undefined): RevisionDeCodex | null {
  try {
    const d = JSON.parse(texto ?? '') as Partial<RevisionDeCodex>
    if (!Array.isArray(d.hallazgos)) return null
    const hallazgos = d.hallazgos.filter((h): h is Hallazgo => !!h && (h.gravedad === 'BLOQUEANTE' || h.gravedad === 'MENOR') && typeof h.texto === 'string')
    return { resumen: typeof d.resumen === 'string' ? d.resumen : '', hallazgos }
  } catch {
    return null
  }
}

/** Los tokens que dice Codex al final de su salida («tokens used» y el número), si los dice. */
export function tokensDeCodex(salida: string): number | null {
  const m = /tokens used\s*\n?\s*([\d.,]+)/i.exec(salida)
  return m ? Number(m[1].replace(/[.,]/g, '')) || null : null
}

/** La spec que devolvió Antigravity, con sus tokens. `null` si no terminó bien o no tiene la forma pedida. */
export function leerSpecDeAntigravity(salida: string): { spec: SpecDeAntigravity; tokens: number | null } | null {
  try {
    const d = JSON.parse(salida) as { status?: string; response?: unknown; usage?: { total_tokens?: number } }
    if (d.status !== 'SUCCESS') return null
    const r = (typeof d.response === 'string' ? JSON.parse(d.response) : d.response) as Partial<SpecDeAntigravity>
    if (typeof r?.ambiguo !== 'boolean' || typeof r.spec !== 'string') return null
    return {
      spec: { ambiguo: r.ambiguo, preguntas: Array.isArray(r.preguntas) ? r.preguntas.filter((p): p is string => typeof p === 'string') : [], spec: r.spec },
      tokens: typeof d.usage?.total_tokens === 'number' ? d.usage.total_tokens : null,
    }
  } catch {
    return null
  }
}

/** Los hallazgos de Codex como los escribe la fábrica: para la sección «### Código» de la tarea. */
export function hallazgosEnMarkdown(r: RevisionDeCodex): string {
  const lineas = r.hallazgos.map(h => `- **${h.gravedad}** · \`${h.archivo}${h.linea ? `:${h.linea}` : ''}\` — ${h.texto}`)
  return [`_Revisión de Codex._ ${r.resumen}`.trim(), '', ...(lineas.length ? lineas : ['Sin hallazgos.'])].join('\n')
}

// ---- El lanzador: el agente corre desligado del mod --------------------------------------------

/**
 * Un agente de otros no puede vivir dentro del mod: entre una llamada y otra el mod no conserva el
 * proceso (probado: cada «EN CURSO» volvía a empezar). Por eso lo arranca un `node` aparte, que se desliga y
 * deja todo en una carpeta: `pedido.txt` (su entrada), `salida.txt`, `error.txt`, `inicio.txt` y,
 * al terminar, `codigo.txt`. El mod solo mira esa carpeta. Si la corrida se corta, el agente sigue,
 * y la siguiente recoge lo que dejó.
 */
export type ConfigDelLanzador = { dir: string; argv: readonly string[]; cwd: string; topeMs: number; env: Record<string, string> }

/** El vigilante: corre el agente, con su entrada desde el archivo, y anota cómo terminó. */
export const VIGILANTE = `
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const cfg = JSON.parse(process.argv[2]); const en = (f) => path.join(cfg.dir, f);
const salida = fs.openSync(en('salida.txt'), 'w'), error = fs.openSync(en('error.txt'), 'w'), entrada = fs.openSync(en('pedido.txt'), 'r');
let fin = false; const terminar = (c) => { if (fin) return; fin = true; fs.writeFileSync(en('codigo.txt'), String(c)); };
const h = spawn(cfg.argv[0], cfg.argv.slice(1), { cwd: cfg.cwd, stdio: [entrada, salida, error], windowsHide: true, env: { ...process.env, ...cfg.env } });
const tope = setTimeout(() => { try { h.kill(); } catch {} }, cfg.topeMs);
h.on('error', (e) => { clearTimeout(tope); fs.appendFileSync(en('error.txt'), String(e)); terminar(-1); });
h.on('exit', (c) => { clearTimeout(tope); terminar(c === null ? -1 : c); });
`

/** El lanzador: prepara la carpeta, arranca al vigilante desligado y termina enseguida. */
export const LANZADOR = `
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const cfg = JSON.parse(process.argv[1]);
for (const f of ['codigo.txt', 'salida.txt', 'error.txt', 'leido.txt']) fs.rmSync(path.join(cfg.dir, f), { force: true });
fs.writeFileSync(path.join(cfg.dir, 'inicio.txt'), String(Date.now()));
spawn(process.execPath, ['-e', cfg.vigilante, 'vigilar', JSON.stringify(cfg)], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
`

export function comandoDelLanzador(cfg: ConfigDelLanzador): string[] {
  return ['node', '-e', LANZADOR, JSON.stringify({ ...cfg, vigilante: VIGILANTE })]
}

/**
 * La espera: un `node` que mira la carpeta hasta que el agente termina o pasan `ms`. Va aparte
 * porque el mod tiene 10 s de tiempo propio por llamada, y lo que espera dentro de un `$` no cuenta
 * (probado: esperar con un temporizador del mod daba «no respondió a tiempo» a los 10 s).
 */
export const ESPERADOR = `
const fs = require('fs'); const path = require('path');
const [dir, ms] = [process.argv[1], Number(process.argv[2])]; const hasta = Date.now() + ms;
const mirar = () => { if (fs.existsSync(path.join(dir, 'codigo.txt')) || Date.now() >= hasta) process.exit(0); };
mirar(); setInterval(mirar, 2000);
`

export function comandoDeEspera(dir: string, ms: number): string[] {
  return ['node', '-e', ESPERADOR, dir, String(ms)]
}

export type EstadoDelTrabajo =
  | { estado: 'ninguno' }
  | { estado: 'corriendo'; inicio: number }
  | { estado: 'terminado'; inicio: number; codigo: number; salida: string; error: string }

/** Cómo va un trabajo, por lo que hay en su carpeta. Es lógica pura. */
export function estadoDelTrabajo(f: { inicio?: string; codigo?: string; salida?: string; error?: string; leido?: string }, ahora: number, topeMs: number): EstadoDelTrabajo {
  const inicio = Number(f.inicio)
  if (!Number.isFinite(inicio) || inicio <= 0 || f.leido !== undefined) return { estado: 'ninguno' }
  if (f.codigo !== undefined && f.codigo.trim() !== '') return { estado: 'terminado', inicio, codigo: Number(f.codigo) || 0, salida: f.salida ?? '', error: f.error ?? '' }
  // Sin código pasado el tope (con margen): el vigilante murió sin anotar nada. Se lanza de nuevo.
  if (ahora - inicio > topeMs + 5 * 60_000) return { estado: 'ninguno' }
  return { estado: 'corriendo', inicio }
}
