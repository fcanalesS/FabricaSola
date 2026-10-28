import type { DatabaseSync } from "node:sqlite";
import { baseDeDatos } from "../datos.ts";
import { recibirIssue } from "./bandeja.ts";
import { anotarAviso, anotarLectura, fuente as fuentePorId, fuentes, tokenDe, type Fuente } from "./fuentes.ts";
import { leerDelServicio } from "./proveedores.ts";

/**
 * El lector de la Entrada: cada tanto lee los issues abiertos de las fuentes
 * encendidas y los deja en la Bandeja. Corre en el servidor aunque nadie
 * tenga la página abierta, como el vigía de la fábrica, y lo arranca
 * `instrumentation.ts`. Solo lee (ver `proveedores.ts`).
 * Solo para el servidor.
 *
 * Una fuente rechazada no se vuelve a intentar sola: espera a que él diga que
 * ya cambió el token, o a que la aplicación se reinicie.
 */

const CADA_MS = 60_000;

export type ResultadoDeLaVuelta = { fuente: number; estado: string; nuevos: number; cambios: number };

/** Si a una fuente le toca leer ahora. `forzar`: «Traer ahora». */
export function leTocaLeer(f: Pick<Fuente, "encendida" | "estado" | "leida" | "cadaMin">, ahora: number, forzar = false): boolean {
  if (!f.encendida || f.estado === "rechazado") return false;
  if (forzar || f.leida === null) return true;
  return f.cadaMin > 0 && ahora - f.leida >= f.cadaMin * 60_000;
}

/** Lee una fuente y deja lo que trajo en la Bandeja. Nunca lanza. */
export async function leerUnaFuente(db: DatabaseSync, f: Fuente, ahora: number, entorno: Record<string, string | undefined> = process.env): Promise<ResultadoDeLaVuelta> {
  const token = tokenDe(f, entorno);
  // Sin token no hay pedido: la vista ya dice que falta.
  if (!token) return { fuente: f.id, estado: "falta_token", nuevos: 0, cambios: 0 };
  const r = await leerDelServicio(f, token);
  if (r.estado !== "listo") {
    anotarLectura(db, f.id, { estado: r.estado, motivo: r.motivo, ahora });
    return { fuente: f.id, estado: r.estado, nuevos: 0, cambios: 0 };
  }
  const lineaDe = new Map(f.repos.map((x) => [x.repo.toLowerCase(), x.linea]));
  let nuevos = 0;
  let cambios = 0;
  for (const issue of r.issues) {
    const linea = lineaDe.get(issue.repo.toLowerCase());
    if (!linea) continue;
    const esSuyo = issue.autor.toLowerCase() === r.usuario.toLowerCase();
    // La regla se vuelve a mirar aquí: no depende de que el servicio haya filtrado bien.
    if (f.regla === "suyos" && !esSuyo) continue;
    if (f.regla !== "todos" && !issue.etiquetas.some((e) => e.toLowerCase() === f.etiqueta.toLowerCase())) continue;
    const que = recibirIssue(db, f.id, issue, { linea, esSuyo, ahora });
    if (que === "nuevo") nuevos++;
    if (que === "cambio") cambios++;
  }
  anotarLectura(db, f.id, { estado: "listo", motivo: null, usuario: r.usuario, ahora });
  // Volvió a leer: si deja de hacerlo otra vez, se puede avisar de nuevo.
  if (f.avisada) anotarAviso(db, f.id, null);
  return { fuente: f.id, estado: "listo", nuevos, cambios };
}

/** Una vuelta: lee las fuentes a las que les toca, una tras otra. Con `soloId`, solo esa (y aunque no le toque). */
export async function vueltaDelLector(db: DatabaseSync, opciones: { ahora?: number; forzar?: boolean; soloId?: number; entorno?: Record<string, string | undefined> } = {}): Promise<ResultadoDeLaVuelta[]> {
  const ahora = opciones.ahora ?? Date.now();
  const lista = opciones.soloId !== undefined ? [fuentePorId(db, opciones.soloId)].filter((f): f is Fuente => f !== null) : fuentes(db);
  const hechos: ResultadoDeLaVuelta[] = [];
  for (const f of lista) {
    if (!leTocaLeer(f, ahora, opciones.forzar || opciones.soloId !== undefined)) continue;
    hechos.push(await leerUnaFuente(db, f, ahora, opciones.entorno));
  }
  return hechos;
}

type Estado = { timer?: ReturnType<typeof setInterval>; leyendo: boolean };
// En `globalThis`: la recarga de desarrollo no arranca un segundo lector.
const e = ((globalThis as { __lectorDeLaEntrada?: Estado }).__lectorDeLaEntrada ??= { leyendo: false });

/** Arranca el lector, si no está. Cada minuto mira a qué fuentes les toca; una vuelta no empieza si la anterior sigue. */
export function asegurarLector(): void {
  if (e.timer) return;
  e.timer = setInterval(() => {
    if (e.leyendo) return;
    e.leyendo = true;
    vueltaDelLector(baseDeDatos())
      .catch(() => {})
      .finally(() => {
        e.leyendo = false;
      });
  }, CADA_MS);
  e.timer.unref?.();
}
