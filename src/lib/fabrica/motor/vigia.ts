import { promises as fs } from "node:fs";
import { lanzarLoPorRetomar, vigilarLaCorrida } from "./corridas.ts";
import { configDesde, eventosDesde } from "./formato.ts";
import { leerAjustes, raiz, rutas } from "./proyecto.ts";
import { llamar, motivoParaLlamar } from "./telefono.ts";
import { arrancarAlIntegrar, arrancarLosPeriodicos } from "../procesos/correr.ts";

/**
 * El vigía de la fábrica: cada tanto lee los eventos nuevos del proyecto y, si
 * algo pasó a esperarlo y llamar sola está encendido, hace sonar el teléfono.
 * Corre en el servidor aunque nadie tenga la página abierta: la fábrica
 * trabaja sola, y lo que la frena es él. Lo arranca `instrumentation.ts` en el
 * modo trabajo. Solo para el servidor.
 *
 * Los eventos que ya estaban cuando arranca, o cuando se cambia de proyecto,
 * no llaman a nadie: solo lo que llega después.
 */

const CADA_MS = 15_000;

type Estado = { timer?: ReturnType<typeof setInterval>; raiz?: string; bytes: number };
// En `globalThis`: la recarga de desarrollo no arranca un segundo vigía.
const v = ((globalThis as { __vigiaDeLaFabrica?: Estado }).__vigiaDeLaFabrica ??= { bytes: -1 });

/** Lee lo nuevo y llama si toca. Nunca lanza: lo que falla de una llamada queda en su registro. */
export async function revisarLaFabrica(llamarCon: typeof llamar = llamar): Promise<string[]> {
  const r = await raiz();
  if (!r) return [];
  const rt = rutas(r);
  if (v.raiz !== r) {
    v.raiz = r;
    v.bytes = -1;
  }
  const tam = (await fs.stat(rt.eventos).catch(() => null))?.size ?? 0;
  if (v.bytes < 0 || tam < v.bytes) {
    v.bytes = tam;
    return [];
  }
  if (tam === v.bytes) return [];
  const fh = await fs.open(rt.eventos, "r");
  let nuevo = "";
  try {
    const buf = Buffer.alloc(tam - v.bytes);
    await fh.read(buf, 0, buf.length, v.bytes);
    nuevo = buf.toString("utf8");
  } finally {
    await fh.close();
  }
  // Solo hasta la última línea entera: la que se está escribiendo se lee la próxima vez.
  const corte = nuevo.lastIndexOf("\n") + 1;
  v.bytes += Buffer.byteLength(nuevo.slice(0, corte));
  if (!(await leerAjustes()).llamarSola) return [];
  const config = await fs.readFile(rt.config, "utf8").then(configDesde, () => null);
  const pideVeredicto = config?.aprobacion === "externa" || config?.aprobacion === "ambas";
  const llamadas: string[] = [];
  for (const ev of eventosDesde(nuevo.slice(0, corte))) {
    const para = motivoParaLlamar(ev, pideVeredicto);
    if (!para) continue;
    llamadas.push(para.motivo);
    await llamarCon({ motivo: para.motivo, auto: true, tarea: ev.tarea }).catch(() => undefined);
  }
  return llamadas;
}

/**
 * Arranca el vigía, si no corre. No retiene el proceso: se apaga con él. Además de llamar, tiene
 * al día la corrida en marcha y la detiene si llega a un tope de gasto, lanza las tareas que él
 * aprobó o rechazó mientras corría otra, en cuanto esa termina, y arranca los procesos que él
 * encendió para correr solos: cuando una tarea se integra, o cada día o cada semana.
 */
export function asegurarVigia(): void {
  if (v.timer) return;
  v.timer = setInterval(() => {
    void revisarLaFabrica().catch(() => undefined);
    // La corrida en marcha, al día y dentro de sus topes; lo anotado, cuando ya no corre nada.
    void vigilarLaCorrida()
      .catch(() => null)
      .then(() => lanzarLoPorRetomar())
      .catch(() => undefined)
      // Los procesos que él encendió para arrancar solos al integrar una tarea.
      .then(() => arrancarAlIntegrar())
      .catch(() => null)
      // Y los que él encendió para correr solos cada día o cada semana.
      .then(() => arrancarLosPeriodicos())
      .catch(() => undefined);
  }, CADA_MS);
  v.timer.unref?.();
}

/** Solo para las pruebas: vuelve a empezar, como recién arrancado. */
export function olvidarLoLeido(): void {
  v.raiz = undefined;
  v.bytes = -1;
}
