import { promises as fs } from "node:fs";
import path from "node:path";
import { carpetaDeLaFabrica, leerAjustes } from "./proyecto.ts";
import { claseEnNota } from "./formato.ts";

/**
 * Llamar por teléfono con Telnyx cuando la fábrica necesita a una persona: una tarea que pregunta
 * algo, o una que espera tu veredicto. Solo para el servidor.
 *
 * Al contestar suena el audio fijo de `FACTORIA_TELNYX_AUDIO_URL`, si lo hay, o nada: la llamada
 * es el aviso, y qué tarea te espera lo dice la planta. Contestar por voz o por SMS no: eso
 * necesita un webhook público.
 *
 * Las claves y los números van en .env.local y no salen del servidor: a la página llegan
 * enmascarados. Llamar sola viene apagado y se enciende en la configuración; aun encendido, hay
 * pausa entre llamadas, una por tarea cada media hora y un tope por día.
 */

const API = "https://api.telnyx.com/v2/calls";
/** Entre una llamada y la siguiente, cualquiera sea. */
export const PAUSA_MS = 2 * 60_000;
/** Por la misma tarea, cuando llama sola. */
export const PAUSA_POR_TAREA_MS = 30 * 60_000;
/** Las que hace sola en un día. */
export const TOPE_AUTO_DIARIO = 3;

const archivoRegistro = () => path.join(carpetaDeLaFabrica(), "llamadas.json");

export type Llamada = { ts: string; motivo: string; auto: boolean; tarea?: string; id?: string; error?: string };

export type EstadoTelefono = {
  listo: boolean;
  /** Los nombres de las variables que faltan o no tienen la forma de un número. */
  faltan: string[];
  destino: string;
  origen: string;
  /** Si llama sola cuando algo lo espera. */
  auto: boolean;
  conAudio: boolean;
  recientes: Llamada[];
  autoHoy: number;
  topeAutoDiario: number;
};

function entorno() {
  return {
    clave: process.env.FACTORIA_TELNYX_API_KEY?.trim() ?? "",
    conexion: process.env.FACTORIA_TELNYX_CONNECTION_ID?.trim() ?? "",
    origen: process.env.FACTORIA_TELNYX_NUMERO_ORIGEN?.trim() ?? "",
    destino: process.env.FACTORIA_TELEFONO?.trim() ?? "",
    audio: process.env.FACTORIA_TELNYX_AUDIO_URL?.trim() ?? "",
  };
}

/** +56912345678 → +56 ••••• 5678. El número completo no sale del servidor. Es lógica pura. */
export const enmascarar = (n: string) => (n.length > 6 ? `${n.slice(0, 3)} ••••• ${n.slice(-4)}` : n ? "•••" : "");
/** Un número en formato internacional: +, el código de país y el número, sin espacios. Es lógica pura. */
export const esE164 = (n: string) => /^\+[1-9]\d{6,14}$/.test(n);

async function leerRegistro(): Promise<Llamada[]> {
  try {
    return JSON.parse(await fs.readFile(archivoRegistro(), "utf8")) as Llamada[];
  } catch {
    return [];
  }
}

async function anotar(l: Llamada) {
  const todas = [...(await leerRegistro()), l].slice(-100);
  await fs.mkdir(carpetaDeLaFabrica(), { recursive: true });
  await fs.writeFile(archivoRegistro(), JSON.stringify(todas, null, 2) + "\n");
}

const detalleDeTelnyx = (j: { errors?: { title?: string; detail?: string; code?: string }[] }, status: number) =>
  j.errors?.map((x) => [x.code, x.title, x.detail].filter(Boolean).join(" · ")).join(" | ") || `HTTP ${status}`;

const deHoy = (ts: string) => new Date(ts).toLocaleDateString("sv") === new Date().toLocaleDateString("sv");

export async function estadoTelefono(): Promise<EstadoTelefono> {
  const e = entorno();
  const faltan = [
    !e.clave && "FACTORIA_TELNYX_API_KEY",
    !e.conexion && "FACTORIA_TELNYX_CONNECTION_ID",
    !esE164(e.origen) && "FACTORIA_TELNYX_NUMERO_ORIGEN",
    !esE164(e.destino) && "FACTORIA_TELEFONO",
  ].filter((x): x is string => !!x);
  const registro = await leerRegistro();
  return {
    listo: faltan.length === 0,
    faltan,
    destino: enmascarar(e.destino),
    origen: enmascarar(e.origen),
    auto: (await leerAjustes()).llamarSola === true,
    conAudio: /^https:\/\//.test(e.audio),
    recientes: registro.slice(-5).reverse(),
    autoHoy: registro.filter((l) => l.auto && !l.error && deHoy(l.ts)).length,
    topeAutoDiario: TOPE_AUTO_DIARIO,
  };
}

/** Una llamada en camino: Telnyx tarda en contestar, y un doble clic no son dos llamadas. */
let llamando = false;

/**
 * Hace sonar el teléfono. `auto`: la llamó la fábrica, y valen todos los frenos (encendido en la
 * configuración, una por tarea cada media hora, tope por día). La prueba que pides solo respeta la
 * pausa general, para no gastar intentos por un doble clic.
 */
export async function llamar(opciones: { motivo: string; auto: boolean; tarea?: string }): Promise<{ id: string }> {
  if (llamando) throw new Error("Ya hay una llamada en camino.");
  llamando = true;
  try {
    return await hacerLaLlamada(opciones);
  } finally {
    llamando = false;
  }
}

async function hacerLaLlamada(opciones: { motivo: string; auto: boolean; tarea?: string }): Promise<{ id: string }> {
  const e = entorno();
  const estado = await estadoTelefono();
  if (!estado.listo) throw new Error(`Falta configurar en .env.local: ${estado.faltan.join(", ")}.`);
  const registro = await leerRegistro();
  const ahora = Date.now();
  const ultima = registro.filter((l) => !l.error).at(-1);
  if (ultima && ahora - Date.parse(ultima.ts) < PAUSA_MS) throw new Error("Hubo una llamada hace menos de 2 minutos. Espera un poco: cada llamada cuesta.");
  if (opciones.auto) {
    if (!estado.auto) throw new Error("Llamar sola está apagado en la configuración.");
    if (estado.autoHoy >= TOPE_AUTO_DIARIO) throw new Error(`Ya van ${TOPE_AUTO_DIARIO} llamadas solas hoy.`);
    if (registro.some((l) => l.auto && !l.error && l.tarea === opciones.tarea && ahora - Date.parse(l.ts) < PAUSA_POR_TAREA_MS)) throw new Error(`Ya se llamó por ${opciones.tarea} hace menos de 30 minutos.`);
  }

  const cuerpo: Record<string, unknown> = { connection_id: e.conexion, to: e.destino, from: e.origen, timeout_secs: 30, time_limit_secs: 90 };
  if (/^https:\/\//.test(e.audio)) cuerpo.audio_url = e.audio;
  const base: Llamada = {
    ts: new Date().toISOString(),
    motivo: opciones.motivo.slice(0, 200),
    auto: opciones.auto,
    ...(opciones.tarea ? { tarea: opciones.tarea } : {}),
  };
  let r: Response;
  try {
    r = await fetch(API, {
      method: "POST",
      headers: { authorization: `Bearer ${e.clave}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = `No se pudo contactar a Telnyx: ${err instanceof Error ? err.message : String(err)}`;
    await anotar({ ...base, error: msg });
    throw new Error(msg);
  }
  const j = (await r.json().catch(() => ({}))) as { data?: { call_control_id?: string }; errors?: { title?: string; detail?: string; code?: string }[] };
  if (!r.ok) {
    const msg = `Telnyx rechazó la llamada: ${detalleDeTelnyx(j, r.status)}`;
    await anotar({ ...base, error: msg });
    throw new Error(msg);
  }
  const id = j.data?.call_control_id ?? "?";
  await anotar({ ...base, id });
  return { id };
}

/**
 * Si un evento de la fábrica es para llamarte: una tarea que pasa a esperar tu respuesta, o una
 * que llega a aprobación cuando el proyecto pide tu veredicto. El motivo es lo que se anota de la
 * llamada, en este equipo. Es lógica pura.
 */
export function motivoParaLlamar(ev: { a: string; de: string | null; tarea: string; nota?: string }, pideVeredicto: boolean): { motivo: string } | null {
  // Una grande, al clasificarse, espera que la pruebes a mano. Si el proyecto ya pedía tu
  // veredicto, el teléfono sonó al llegar a aprobación.
  if (ev.a === ev.de) {
    if (ev.a === "aprobacion" && !pideVeredicto && claseEnNota(ev.nota) === "grande") return { motivo: `${ev.tarea} es grande: espera tu prueba a mano` };
    return null;
  }
  if (ev.a === "necesita-humano") return { motivo: `${ev.tarea} te pregunta: ${ev.nota ?? "necesita a una persona"}` };
  if (ev.a === "aprobacion" && pideVeredicto) return { motivo: `${ev.tarea} espera tu veredicto` };
  return null;
}
