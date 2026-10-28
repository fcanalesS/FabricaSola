// Lo que la fábrica aprende de las decisiones de Jev, leído de factory/jev.jsonl para el informe
// de cada corrida. La lógica de verdad está en el plugin (fabrica/hooks/aprendizaje.ts): aquí se
// repite lo justo para leer, porque el plugin corre dentro de Claude Code y la aplicación no lo
// importa. Si cambia allá, cambia aquí.

export type DecisionDeJev = "pruebas" | "seguridad" | "spec" | "modelo" | "integracion"
const SENTIDO: Record<DecisionDeJev, "bajo" | "alto"> = { pruebas: "bajo", seguridad: "bajo", spec: "alto", modelo: "alto", integracion: "alto" };
/** Los umbrales medidos, los mismos de fabrica/hooks/jev.ts (UMBRALES). */
export const UMBRALES_BASE: Record<DecisionDeJev, number> = { pruebas: 0.15, seguridad: 0.3, spec: 0.5, modelo: 0.6, integracion: 0.7 };

export type LineaDeJev =
  | { t: "decision"; ts: string; tarea: string; decision: DecisionDeJev; p: number; umbral: number; ahorra: boolean; control: boolean }
  | { t: "resultado"; ts: string; tarea: string; decision: DecisionDeJev; acierto: boolean; evidencia: string }
  /** Él retiró el último resultado de esa tarea y esa decisión: deja de contar. */
  | { t: "retira"; ts: string; tarea: string; decision: DecisionDeJev; evidencia: string };

export function lineasDeJev(texto: string): LineaDeJev[] {
  return texto.split(/\r?\n/).filter(Boolean).flatMap((l) => {
    try {
      const x = JSON.parse(l) as LineaDeJev;
      return x && (x.t === "decision" || x.t === "resultado" || x.t === "retira") && typeof x.tarea === "string" && x.decision in SENTIDO ? [x] : [];
    } catch {
      return [];
    }
  });
}

export type Umbral = { umbral: number; base: number; aciertos: number; errores: number }

/** Con cada error el umbral se aprieta lo justo; nunca se suelta solo. Igual que en el plugin. */
export function umbralesAjustados(todas: readonly LineaDeJev[]): Record<DecisionDeJev, Umbral> {
  const lineas = sinLoRetirado(todas);
  const decisiones = new Map<string, Extract<LineaDeJev, { t: "decision" }>>();
  const salida = Object.fromEntries(Object.entries(UMBRALES_BASE).map(([d, u]) => [d, { umbral: u, base: u, aciertos: 0, errores: 0 }])) as Record<DecisionDeJev, Umbral>;
  for (const l of lineas) {
    if (l.t === "retira") continue;
    if (l.t === "decision") {
      decisiones.set(`${l.tarea}:${l.decision}`, l);
      continue;
    }
    const d = decisiones.get(`${l.tarea}:${l.decision}`);
    if (!d) continue;
    const u = salida[l.decision];
    if (l.acierto) {
      u.aciertos++;
      continue;
    }
    u.errores++;
    u.umbral = SENTIDO[l.decision] === "bajo" ? Math.min(u.umbral, d.p) : Math.max(u.umbral, Math.min(0.99, d.p + 0.01));
  }
  return salida;
}

/** Las líneas sin los resultados que él retiró: cada `retira` quita el último resultado anterior de esa tarea y esa decisión. */
export function sinLoRetirado(lineas: readonly LineaDeJev[]): LineaDeJev[] {
  const out: LineaDeJev[] = [];
  for (const l of lineas) {
    if (l.t !== "retira") {
      out.push(l);
      continue;
    }
    for (let i = out.length - 1; i >= 0; i--) {
      const x = out[i]!;
      if (x.t === "resultado" && x.tarea === l.tarea && x.decision === l.decision) {
        out.splice(i, 1);
        break;
      }
    }
  }
  return out;
}

/** Las tareas que él marcó con «Debió esperarme» y no lo retiró: entraron solas y tenían que esperarlo. */
export function marcadasConDebioEsperar(lineas: readonly LineaDeJev[]): Set<string> {
  return new Set(sinLoRetirado(lineas).flatMap((l) => (l.t === "resultado" && l.decision === "integracion" && !l.acierto ? [l.tarea] : [])));
}

/** La línea que anota su marca, o la que la retira. */
export function lineaDeDebioEsperar(tarea: string, marcar: boolean, ts: string): LineaDeJev {
  return marcar
    ? { t: "resultado", ts, tarea, decision: "integracion", acierto: false, evidencia: "él la marcó con «Debió esperarme»: entró sola y tenía que esperarlo" }
    : { t: "retira", ts, tarea, decision: "integracion", evidencia: "él quitó «Debió esperarme»" };
}
