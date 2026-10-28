// Lo que la fábrica aprende de las decisiones de Jev. Jev no acepta retroalimentación (su API no
// tiene etiquetas ni entrenamiento): lo que se ajusta es nuestro lado, los umbrales con que se
// usan sus probabilidades, como recomienda TypeSafe («el control queda en el código»).
//
// Cada decisión en que Jev dijo «se puede ahorrar» queda en factory/jev.jsonl, y su resultado se
// anota cuando se sabe:
//
//  - pruebas: si una verificación posterior de la tarea las corre, pasan o no. Además, una de cada
//    `cada` veces que Jev diría que no hacen falta, se corren igual (muestra de control).
//  - seguridad: solo por muestra de control; la revisión se hace igual, y acierta si no deja
//    bloqueantes en la sección «### Seguridad» de los hallazgos.
//  - spec: acierta si la construcción llega a revisión sin preguntar a un humano.
//  - modelo: acierta si la tarea llega a aprobación sin volver a construcción.
//  - integracion: solo se sabe cuando él lo dice. Si una tarea que Jev dejó entrar sola tenía que
//    esperarlo, la marca con «Debió esperarme» en la aplicación, y eso es un error. Si quita la
//    marca, queda una línea `retira` y ese error deja de contar. Que apruebe una grande sin
//    cambios no es un acierto ni un error: grande también es por precaución.
//
// Con cada error, el umbral de esa decisión se aprieta lo justo para que ese caso ya no se
// ahorre. Nunca se suelta solo: eso lo decide una persona, con el informe en la mano. Es lógica
// pura.

export type DecisionDeJev = 'pruebas' | 'seguridad' | 'spec' | 'modelo' | 'integracion'

/** Si se ahorra cuando la probabilidad es baja (pruebas, seguridad) o alta (spec, modelo). */
export const SENTIDO: Record<DecisionDeJev, 'bajo' | 'alto'> = { pruebas: 'bajo', seguridad: 'bajo', spec: 'alto', modelo: 'alto', integracion: 'alto' }

export type LineaDeJev =
  | { t: 'decision'; ts: string; tarea: string; decision: DecisionDeJev; p: number; umbral: number; ahorra: boolean; control: boolean }
  | { t: 'resultado'; ts: string; tarea: string; decision: DecisionDeJev; acierto: boolean; evidencia: string }
  /** Él retiró el último resultado de esa tarea y esa decisión: deja de contar. */
  | { t: 'retira'; ts: string; tarea: string; decision: DecisionDeJev; evidencia: string }

export function lineasDeJev(texto: string): LineaDeJev[] {
  return texto.split(/\r?\n/).filter(Boolean).flatMap(l => {
    try {
      const x = JSON.parse(l) as LineaDeJev
      return x && (x.t === 'decision' || x.t === 'resultado' || x.t === 'retira') && typeof x.tarea === 'string' && x.decision in SENTIDO ? [x] : []
    } catch {
      return []
    }
  })
}

/** Una muestra de control cada `cada` veces, al azar. `azar` va de 0 a 1. Con `cada` en 0, nunca. */
export const esControl = (azar: number, cada: number) => cada > 0 && azar < 1 / cada

/** Las decisiones de una tarea que todavía esperan su resultado: las que ahorraron o fueron de control. */
export function pendientes(lineas: readonly LineaDeJev[], tarea: string): Extract<LineaDeJev, { t: 'decision' }>[] {
  const abiertas = new Map<DecisionDeJev, Extract<LineaDeJev, { t: 'decision' }>>()
  for (const l of lineas) {
    if (l.tarea !== tarea) continue
    if (l.t === 'decision' && (l.ahorra || l.control)) abiertas.set(l.decision, l)
    else if (l.t === 'resultado') abiertas.delete(l.decision)
  }
  return [...abiertas.values()]
}

/** Si los hallazgos de seguridad dejaron algún bloqueante: lo que va bajo «### Seguridad», hasta la próxima sección. */
export function seguridadConBloqueantes(cuerpo: string): boolean {
  const m = /^###\s*Seguridad[^\n]*\n([\s\S]*?)(?=^#{1,3}\s|(?![\s\S]))/im.exec(cuerpo)
  return !!m && /BLOQUEANTE/i.test(m[1])
}

/**
 * Lo que se sabe al mover una tarea: los resultados de sus decisiones pendientes. `de` y `a` son
 * los estados; `cuerpo`, el archivo de la tarea después de la revisión.
 */
export function resultadosAlMover(abiertas: readonly Extract<LineaDeJev, { t: 'decision' }>[], de: string, a: string, cuerpo: string, ts: string): LineaDeJev[] {
  const salida: LineaDeJev[] = []
  const anotar = (d: DecisionDeJev, tarea: string, acierto: boolean, evidencia: string) => salida.push({ t: 'resultado', ts, tarea, decision: d, acierto, evidencia })
  for (const d of abiertas) {
    if (d.decision === 'spec' && de === 'construccion') {
      if (a === 'revision') anotar('spec', d.tarea, true, 'la construcción llegó a revisión sin preguntar')
      else if (a === 'necesita-humano') anotar('spec', d.tarea, false, 'la construcción tuvo que preguntar a un humano')
    }
    if (d.decision === 'modelo') {
      if (a === 'aprobacion') anotar('modelo', d.tarea, true, 'llegó a aprobación sin volver a construcción')
      else if (a === 'construccion' && (de === 'revision' || de === 'verificacion' || de === 'aprobacion')) anotar('modelo', d.tarea, false, `volvió a construcción desde ${de}`)
    }
    if (d.decision === 'seguridad' && d.control && de === 'revision' && (a === 'construccion' || a === 'verificacion')) {
      const malo = seguridadConBloqueantes(cuerpo)
      anotar('seguridad', d.tarea, !malo, malo ? 'la revisión de control encontró bloqueantes de seguridad' : 'la revisión de control no encontró bloqueantes de seguridad')
    }
  }
  return salida
}

/** Al correr las pruebas de una tarea: el resultado de una decisión de pruebas pendiente (saltada o de control). */
export function resultadoDePruebas(abiertas: readonly Extract<LineaDeJev, { t: 'decision' }>[], pasaron: boolean, ts: string): LineaDeJev[] {
  const d = abiertas.find(x => x.decision === 'pruebas')
  if (!d) return []
  const como = d.control ? 'la muestra de control' : 'una verificación posterior'
  return [{ t: 'resultado', ts, tarea: d.tarea, decision: 'pruebas', acierto: pasaron, evidencia: `${como} corrió las pruebas y ${pasaron ? 'pasaron' : 'fallaron'}` }]
}

export type Umbral = { umbral: number; base: number; aciertos: number; errores: number }

/**
 * Los umbrales con lo aprendido: con cada error de Jev, el de esa decisión se aprieta lo justo
 * para que ese caso ya no se ahorre. Nunca se suelta solo.
 */
export function umbralesAjustados(todas: readonly LineaDeJev[], base: Record<DecisionDeJev, number>): Record<DecisionDeJev, Umbral> {
  const lineas = sinLoRetirado(todas)
  const decisiones = new Map<string, Extract<LineaDeJev, { t: 'decision' }>>()
  const salida = Object.fromEntries(Object.entries(base).map(([d, u]) => [d, { umbral: u, base: u, aciertos: 0, errores: 0 }])) as Record<DecisionDeJev, Umbral>
  for (const l of lineas) {
    if (l.t === 'retira') continue
    if (l.t === 'decision') {
      decisiones.set(`${l.tarea}:${l.decision}`, l)
      continue
    }
    const d = decisiones.get(`${l.tarea}:${l.decision}`)
    if (!d) continue
    const u = salida[l.decision]
    if (l.acierto) {
      u.aciertos++
      continue
    }
    u.errores++
    // Apretar: bajo, el umbral baja hasta el caso fallido; alto, sube por encima.
    u.umbral = SENTIDO[l.decision] === 'bajo' ? Math.min(u.umbral, d.p) : Math.max(u.umbral, Math.min(0.99, d.p + 0.01))
  }
  return salida
}

/** Las líneas sin los resultados que él retiró: cada `retira` quita el último resultado anterior de esa tarea y esa decisión. */
export function sinLoRetirado(lineas: readonly LineaDeJev[]): LineaDeJev[] {
  const out: LineaDeJev[] = []
  for (const l of lineas) {
    if (l.t !== 'retira') {
      out.push(l)
      continue
    }
    for (let i = out.length - 1; i >= 0; i--) {
      const x = out[i]!
      if (x.t === 'resultado' && x.tarea === l.tarea && x.decision === l.decision) {
        out.splice(i, 1)
        break
      }
    }
  }
  return out
}

/** Si él marcó una tarea con «Debió esperarme» y no lo retiró. */
export function debioEsperar(lineas: readonly LineaDeJev[], tarea: string): boolean {
  return sinLoRetirado(lineas).some(l => l.t === 'resultado' && l.tarea === tarea && l.decision === 'integracion' && !l.acierto)
}
