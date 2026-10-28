import { promises as fs } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fuentes, NOMBRE_DEL_PROVEEDOR } from "../../entrada/fuentes.ts";
import { baseDeDatos } from "../../datos.ts";
import { leerFicha } from "../memoria/formato.ts";
import { vaultDeLaRaiz } from "../memoria/vault.ts";
import { corridasDelDia, type CorridaDelDia } from "../motor/corridas.ts";
import { mismaRaiz } from "../motor/lineas.ts";
import { instantaneaDe, leerAjustes, lineasDeLaFabrica, marcadasDe, revisarProyecto } from "../motor/proyecto.ts";
import type { Config } from "../motor/tipos.ts";
import { numerosDeLaPlanta, numerosDeLinea, stackDe, tarjetasDe, type EstadoDeLinea, type NumerosDeLinea, type TarjetaDeLaPlanta } from "./lectura.ts";

/**
 * La planta leída del disco: cada línea con sus tareas, lo que lo espera y lo que gastó hoy, y las
 * corridas de hoy. Solo lee: no corre nada ni escribe nada. Cada línea se lee por separado, y una
 * que no se puede leer va con su error sin tapar a las demás. Solo para el servidor.
 */

export type LineaDeLaPlanta = {
  id: string
  nombre: string
  raiz: string
  /** La que miran la columna de ella y la Configuración. Las pantallas de la planta no la usan para actuar. */
  activa: boolean
  estado: EstadoDeLinea
  /** Por qué no se pudo leer, o por qué no tiene fábrica. */
  error: string | null
  /** Lo que su memoria dice de su stack, si lo dice. */
  stack: string | null
  /** Donde trabaja: la rama de trabajo de su config, o la activa en su raíz. */
  rama: string | null
  config: Pick<Config, "build" | "test" | "lint" | "aprobacion" | "integracion" | "paraleloMax" | "maxVueltas" | "ramaTrabajo" | "modeloSpec" | "modeloConstruccion" | "modeloAprobacion"> | null
  /** De dónde le entra trabajo: las conexiones encendidas que le llevan issues, y el formulario. */
  entradas: string[]
  tarjetas: TarjetaDeLaPlanta[]
  numeros: NumerosDeLinea | null
  gastoHoyUsd: number
}

export type CorridaDeLaPlanta = CorridaDelDia & { linea: string | null; nombreDeLinea: string | null; duracionMs: number | null }

export type PuestoOcupado = { linea: string; nombreDeLinea: string; tarea: string | null; agente: string; que: string; desde: string }

export type Planta = {
  leidaEn: string
  lineas: LineaDeLaPlanta[]
  numeros: ReturnType<typeof numerosDeLaPlanta>
  /** Lo que lo espera en todas las líneas, de lo más viejo a lo más nuevo. */
  teEsperan: (TarjetaDeLaPlanta & { linea: string; nombreDeLinea: string })[]
  corridas: CorridaDeLaPlanta[]
  /**
   * Los puestos: los encargos sin terminar de la corrida que corre, y cuántos puede usar a la vez
   * su línea (`paralelo_max`). Hasta que corran varias líneas, no hay un total de la planta.
   */
  puestos: { ocupados: PuestoOcupado[]; maximo: number | null }
}

/** Qué dice la memoria de una línea de su stack: la ficha, si existe. Sin ficha, nada. */
async function stackDeLaRaiz(raiz: string): Promise<string | null> {
  const texto = await fs.readFile(path.join(vaultDeLaRaiz(raiz), "ficha.md"), "utf8").catch(() => null);
  return texto === null ? null : stackDe(leerFicha(texto).reglas);
}

/** Las conexiones encendidas que le llevan issues a cada línea, por su proveedor. */
function entradasPorLinea(db: DatabaseSync): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of fuentes(db)) {
    if (!f.encendida) continue;
    for (const r of f.repos) {
      const lista = out.get(r.linea) ?? [];
      const nombre = NOMBRE_DEL_PROVEEDOR[f.proveedor];
      if (!lista.includes(nombre)) lista.push(nombre);
      out.set(r.linea, lista);
    }
  }
  return out;
}

const vacia = (l: { id: string; nombre: string; raiz: string }, activa: boolean, estado: EstadoDeLinea, error: string): LineaDeLaPlanta => ({
  ...l,
  activa,
  estado,
  error,
  stack: null,
  rama: null,
  config: null,
  entradas: [],
  tarjetas: [],
  numeros: null,
  gastoHoyUsd: 0,
});

export async function leerLaPlanta(opciones: { ahora?: number; db?: DatabaseSync } = {}): Promise<Planta> {
  const ahora = opciones.ahora ?? Date.now();
  const [lineas, ajustes, corridasDeHoy] = await Promise.all([lineasDeLaFabrica(), leerAjustes(), corridasDelDia(ahora)]);
  // Sin la base común, las líneas se leen igual: solo no se sabe de dónde les entra trabajo.
  let entradas = new Map<string, string[]>();
  try {
    entradas = entradasPorLinea(opciones.db ?? baseDeDatos());
  } catch {
    // Se sigue sin las conexiones.
  }

  const corridas: CorridaDeLaPlanta[] = corridasDeHoy.map((c) => {
    const l = lineas.find((x) => mismaRaiz(x.raiz, c.proyecto));
    const fin = c.fin ? Date.parse(c.fin) : c.estado === "corriendo" ? ahora : NaN;
    const ms = fin - Date.parse(c.inicio);
    return { ...c, linea: l?.id ?? null, nombreDeLinea: l?.nombre ?? null, duracionMs: Number.isFinite(ms) && ms >= 0 ? ms : null };
  });

  const leidas = await Promise.all(
    lineas.map(async (l): Promise<LineaDeLaPlanta> => {
      const activa = ajustes.lineaActiva === l.id;
      try {
        const p = await revisarProyecto(l.raiz);
        if (!p.existe || !p.esCarpeta) return vacia(l, activa, "error", "Su carpeta ya no existe.");
        if (!p.tieneFabrica) return vacia(l, activa, "sin-fabrica", "No tiene factory/config.md todavía.");
        const [i, stack] = await Promise.all([instantaneaDe(l.raiz, Number.POSITIVE_INFINITY), stackDeLaRaiz(l.raiz)]);
        const tarjetas = tarjetasDe(i.tareas, i.eventos, i.config, ahora, await marcadasDe(l.raiz));
        const suyas = corridas.filter((c) => c.linea === l.id);
        const c = i.config;
        return {
          ...l,
          activa,
          estado: suyas.some((x) => x.estado === "corriendo") ? "corriendo" : "quieta",
          error: null,
          stack,
          rama: c?.ramaTrabajo || i.ramaActual,
          config: c ? { build: c.build, test: c.test, lint: c.lint, aprobacion: c.aprobacion, integracion: c.integracion, paraleloMax: c.paraleloMax, maxVueltas: c.maxVueltas, ramaTrabajo: c.ramaTrabajo, modeloSpec: c.modeloSpec, modeloConstruccion: c.modeloConstruccion, modeloAprobacion: c.modeloAprobacion } : null,
          entradas: [...(entradas.get(l.id) ?? []), "Formulario"],
          tarjetas,
          numeros: numerosDeLinea(i.tareas, tarjetas, i.eventos, ahora),
          gastoHoyUsd: suyas.reduce((s, x) => s + (x.costoUsd ?? 0), 0),
        };
      } catch (e) {
        return vacia(l, activa, "error", e instanceof Error ? e.message.slice(0, 300) : "No se pudo leer.");
      }
    }),
  );

  const teEsperan = leidas
    .flatMap((l) => l.tarjetas.filter((t) => t.espera).map((t) => ({ ...t, linea: l.id, nombreDeLinea: l.nombre })))
    .sort((a, b) => (Date.parse(a.desde ?? "") || Infinity) - (Date.parse(b.desde ?? "") || Infinity));

  const enCurso = corridas.find((c) => c.estado === "corriendo" && c.linea);
  const lineaQueCorre = enCurso ? leidas.find((l) => l.id === enCurso.linea) : undefined;
  const ocupados: PuestoOcupado[] = enCurso && lineaQueCorre ? enCurso.trabajando.map((t) => ({ ...t, linea: lineaQueCorre.id, nombreDeLinea: lineaQueCorre.nombre })) : [];

  return {
    leidaEn: new Date(ahora).toISOString(),
    lineas: leidas,
    numeros: numerosDeLaPlanta(leidas),
    teEsperan,
    corridas: corridas.reverse(),
    puestos: { ocupados, maximo: lineaQueCorre?.config?.paraleloMax ?? null },
  };
}
