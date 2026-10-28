/**
 * Cliente de Jev, el modelo de TypeSafe AI. Solo para el servidor.
 *
 * Jev no genera texto: responde preguntas tipadas sobre un estado, eligiendo
 * una opción (`choice`) o dando un sí o no con probabilidad (`noul`). Aquí
 * toma las decisiones rápidas que no le tocan a un agente.
 *
 * Todo lo que usa
 * a Jev tiene un plan si no contesta: que Jev falle no puede romper nada.
 */

const URL_DE_JEV = "https://api.typesafe.ai/v1/systemone";
const MODELO = "jev-latest";

/** Jev tarda unos 0,3 s. Más de esto ya retrasa lo que acompaña. */
const ESPERA_MS = 1_500;

export type PreguntaJev =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } };

export type RespuestaJev = {
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  noul?: number;
};

/**
 * Los fallos no son todos iguales:
 *
 *  - Sin conexión con su API (401, 402, 403): no se arregla solo. Se aparta
 *    a Jev media hora. Puede ser el saldo o la clave; su API no dice cuál.
 *  - Sobrecarga (429, 529): se aparta un minuto; insistir empeora el atasco.
 *  - Fallos sueltos (red, tiempo agotado, 5xx): uno no dice nada; tres
 *    seguidos, cinco minutos.
 *
 * Mientras está apartado no se le llama: cada pregunta iría a pegarse contra
 * la misma pared, y cada intento cuesta su espera.
 */
export function clasificarFallo(estado: number | null): { ms: number; motivo: string } | null {
  if (estado === 401 || estado === 402 || estado === 403) return { ms: 30 * 60_000, motivo: `sin conexión con su API (HTTP ${estado})` };
  if (estado === 429 || estado === 529) return { ms: 60_000, motivo: `sobrecarga (HTTP ${estado})` };
  return null;
}

const FALLOS_SUELTOS_MAX = 3;
const CORTE_POR_FALLOS_SUELTOS_MS = 5 * 60_000;

type Guarda = { apartadoHasta: number; motivo: string | null; fallosSeguidos: number };

// En `globalThis` porque la recarga de módulos de desarrollo se llevaría la guarda.
const GUARDA: Guarda = ((globalThis as { __guardaDeJev?: Guarda }).__guardaDeJev ??= { apartadoHasta: 0, motivo: null, fallosSeguidos: 0 });

const clave = () => process.env.TYPESAFE_AI_KEY?.trim() ?? "";

/** ¿Se le puede preguntar ahora mismo? Sin clave, nunca. */
export function jevDisponible(ahora = Date.now()): boolean {
  return Boolean(clave()) && ahora >= GUARDA.apartadoHasta;
}

export function estadoDeJev(ahora = Date.now()) {
  return {
    configurado: Boolean(clave()),
    disponible: jevDisponible(ahora),
    motivo: ahora < GUARDA.apartadoHasta ? GUARDA.motivo : null,
  };
}

/** Anota el resultado de una llamada en la guarda. Separado para poder probarlo. */
export function registrarResultado(estado: number | null, ok: boolean, ahora = Date.now()): void {
  if (ok) {
    GUARDA.fallosSeguidos = 0;
    return;
  }
  const corte = clasificarFallo(estado);
  if (corte) {
    Object.assign(GUARDA, { apartadoHasta: ahora + corte.ms, motivo: corte.motivo, fallosSeguidos: 0 });
    return;
  }
  GUARDA.fallosSeguidos++;
  if (GUARDA.fallosSeguidos >= FALLOS_SUELTOS_MAX) {
    Object.assign(GUARDA, { apartadoHasta: ahora + CORTE_POR_FALLOS_SUELTOS_MS, motivo: `${GUARDA.fallosSeguidos} fallos seguidos`, fallosSeguidos: 0 });
  }
}

/** Para las pruebas. */
export function reiniciarGuarda(): void {
  Object.assign(GUARDA, { apartadoHasta: 0, motivo: null, fallosSeguidos: 0 });
}

/**
 * Le hace preguntas a Jev sobre un estado. Devuelve las respuestas, o `null`
 * si no se pudo. Nunca lanza: un `null` es la señal para usar el plan B.
 */
export async function preguntarJev(
  estado: unknown,
  preguntas: Record<string, PreguntaJev>,
  esperaMs = ESPERA_MS,
): Promise<Record<string, RespuestaJev> | null> {
  if (!jevDisponible()) return null;
  let codigo: number | null = null;
  try {
    const r = await fetch(URL_DE_JEV, {
      method: "POST",
      headers: { authorization: `Bearer ${clave()}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODELO, state: estado, questions: preguntas }),
      signal: AbortSignal.timeout(esperaMs),
    });
    codigo = r.status;
    if (!r.ok) {
      registrarResultado(codigo, false);
      return null;
    }
    const datos = (await r.json()) as { answers?: Record<string, RespuestaJev> };
    registrarResultado(codigo, true);
    return datos.answers ?? null;
  } catch {
    registrarResultado(codigo, false);
    return null;
  }
}
