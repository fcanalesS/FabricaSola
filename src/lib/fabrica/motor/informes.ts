// Solo servidor: el informe de cada corrida. Lo arma el código, no un modelo, con lo que ya está en
// los archivos: la salida de Claude Code (su resultado final), la telemetría que mandó y los
// movimientos de las tareas en factory/eventos.jsonl mientras corría. Se guarda en
// datos/corridas/<id>.informe.md al terminar, y se rehace si llega telemetría después.
import { promises as fs } from "node:fs";
import path from "node:path";
import { carpetaDeCorridas, corridaActual, leerCorrida, listarCorridas, nombreMcp, type Actividad, type Corrida, type ResultadoCorrida } from "./corridas.ts";
import { ROLES_DE_AGENTE, type RolDeAgente } from "../modelos.ts";
import { ETAPA_DEL_ROL, nombreConHabilidades } from "./agentes.ts";
import { claseEnNota, configDesde, eventosDesde } from "./formato.ts";
import type { Evento } from "./tipos.ts";
import { lineasDeJev, sinLoRetirado, umbralesAjustados, type DecisionDeJev, type LineaDeJev, type Umbral } from "./jev.ts";
import { archivoTelemetria, leerTelemetria, resumirTelemetria, type Registro, type ResumenTelemetria } from "./telemetria.ts";

export type MovimientoDeTarea = { tarea: string; pasos: { de: string | null; a: string; agente?: string; nota?: string; ts: string }[] }

/** Lo que la fábrica decidió no hacer en una tarea, con sus reglas o con Jev. */
export type Salto = { tarea: string; que: string[]; nota: string; jev: number | null }

export type Informe = {
  id: string
  proyecto: string
  /** Las tareas que se pidieron; vacío si se corrió toda la cola. */
  pedidas: string[]
  modelo: string | null
  inicio: string
  fin: string | null
  estado: Corrida["estado"]
  sesion: string | null
  /** Lo que dijo Claude Code al terminar, recortado. */
  final: string | null
  resultado: ResultadoCorrida | null
  /** Lo que movieron los agentes mientras la corrida estaba en marcha. */
  tareas: MovimientoDeTarea[]
  telemetria: ResumenTelemetria | null
  /** Las tareas cuya última verificación de la corrida no corrió las pruebas unitarias: falta ejecutarlas. */
  sinPruebas: { tarea: string; motivo: string }[]
  /** El comando de pruebas del proyecto, para correr las que faltan. */
  comandoDePruebas: string | null
  /**
   * Cómo se clasificaron las tareas aprobadas en esta corrida (fabrica/docs/Plan-Integracion.md):
   * las sencillas pueden integrarse solas; las grandes esperan su prueba. De cada tarea, la última.
   */
  integracion: { sencillas: string[]; grandes: string[] }
  /** Las revisiones y pruebas que se saltaron, con lo que dijo Jev. */
  saltos: Salto[]
  /** Lo que hicieron otros agentes (Codex, Antigravity): con sus suscripciones, no con Claude. */
  externos: { tarea: string; quien: "codex" | "antigravity"; segundos: number; tokens: number | null; ok: boolean; nota: string }[]
  /**
   * Para Jev: lo que decidió en esta corrida, los resultados que se supieron en ella y los
   * umbrales con todo lo aprendido. `null` si el proyecto no tiene factory/jev.jsonl.
   */
  jev: { decisiones: Extract<LineaDeJev, { t: "decision" }>[]; resultados: Extract<LineaDeJev, { t: "resultado" }>[]; umbrales: Record<DecisionDeJev, Umbral> } | null
  /** Cuántas verificaciones corrió la fábrica en esta corrida. */
  verificaciones: number
  /**
   * Lo que costó cada tarea, aproximado: cada llamada a la API se reparte entre las tareas que
   * tenían un encargo abierto a esa hora. Lo que no cae en ninguna (el orquestador entre una y
   * otra) va aparte. `null` sin telemetría.
   */
  porTarea: { tareas: { tarea: string; usd: number }[]; sinTarea: number } | null
  /** Lo que salió mal, ya en frases. */
  problemas: string[]
  /** Lo que conviene saber pero no salió mal: un servidor MCP caído que nadie usó, por ejemplo. */
  notas: string[]
}

const QUE: Record<string, string> = { test: "pruebas unitarias", revision_codigo: "revisión de código", revision_seguridad: "revisión de seguridad", ui: "revisión de UI", spec: "agente de spec", modelo: "el modelo de siempre (construyó con Sonnet)" };

/** De factory/jev.jsonl: lo de esta corrida, y los umbrales con todo lo aprendido hasta ahora. */
async function paraJev(c: Corrida): Promise<Informe["jev"]> {
  const texto = await fs.readFile(path.join(c.proyecto, "factory", "jev.jsonl"), "utf8").catch(() => null);
  if (texto === null) return null;
  const todas = lineasDeJev(texto);
  const desde = Date.parse(c.inicio);
  const hasta = c.fin ? Date.parse(c.fin) : Date.now();
  const enLaCorrida = todas.filter((l) => {
    const t = Date.parse(l.ts);
    return t >= desde && t <= hasta;
  });
  return {
    decisiones: enLaCorrida.filter((l): l is Extract<LineaDeJev, { t: "decision" }> => l.t === "decision"),
    // Un resultado que él retiró no cuenta, aunque se haya anotado en esta corrida.
    resultados: sinLoRetirado(todas).filter((l): l is Extract<LineaDeJev, { t: "resultado" }> => l.t === "resultado" && enLaCorrida.includes(l)),
    umbrales: umbralesAjustados(todas),
  };
}

/** De los eventos de la corrida: lo que se saltó, y qué tareas quedaron sin pruebas al final. */
async function decisiones(c: Corrida): Promise<{ saltos: Salto[]; sinPruebas: Informe["sinPruebas"]; comandoDePruebas: string | null; externos: Informe["externos"]; verificaciones: number; integracion: Informe["integracion"] }> {
  const [texto, config] = await Promise.all([
    fs.readFile(path.join(c.proyecto, "factory", "eventos.jsonl"), "utf8").catch(() => ""),
    fs.readFile(path.join(c.proyecto, "factory", "config.md"), "utf8").catch(() => ""),
  ]);
  const desde = Date.parse(c.inicio);
  const hasta = c.fin ? Date.parse(c.fin) : Date.now();
  const saltos: Salto[] = [];
  const externos: Informe["externos"] = [];
  const ultimaVerificacion = new Map<string, { pruebas: "omitidas" | "corridas" | "innecesarias"; nota: string }>();
  const clase = new Map<string, "sencilla" | "grande">();
  let verificaciones = 0;
  for (const e of eventosDesde(texto)) {
    const t = Date.parse(e.ts);
    if (!(t >= desde && t <= hasta)) continue;
    // El resultado de una verificación: lo anota la fábrica en la misma etapa.
    if (e.de === "verificacion" && e.a === "verificacion" && /^verificación (ok|fallida)/.test(e.nota ?? "")) verificaciones++;
    // La nota que deja el mod al clasificar: «integración: sencilla (…)».
    const cual = claseEnNota(e.nota);
    if (cual) clase.set(e.tarea, cual);
    if (e.saltado?.length) saltos.push({ tarea: e.tarea, que: e.saltado.map((s) => QUE[s] ?? s), nota: e.nota ?? "", jev: typeof e.jev === "number" ? e.jev : null });
    if (e.pruebas) ultimaVerificacion.set(e.tarea, { pruebas: e.pruebas, nota: e.nota ?? "" });
    if (e.externo) externos.push({ tarea: e.tarea, ...e.externo, nota: e.nota ?? "" });
  }
  const sinPruebas = [...ultimaVerificacion].filter(([, v]) => v.pruebas === "omitidas").map(([tarea, v]) => ({ tarea, motivo: v.nota.replace(/^verificación \w+, sin pruebas unitarias: /, "") }));
  // Un salto de pruebas solo cuenta si la tarea terminó la corrida sin correrlas; y de cada salto en una tarea, el último.
  const ultimos = new Map<string, Salto>();
  for (const s of saltos) {
    const que = s.que.filter((q) => q !== QUE.test || ultimaVerificacion.get(s.tarea)?.pruebas !== "corridas");
    if (que.length) ultimos.set(`${s.tarea}:${que.join(",")}`, { ...s, que });
  }
  saltos.splice(0, saltos.length, ...ultimos.values());
  const comando = config ? configDesde(config).test.trim() : "";
  const integracion = { sencillas: [...clase].filter(([, c]) => c === "sencilla").map(([id]) => id), grandes: [...clase].filter(([, c]) => c === "grande").map(([id]) => id) };
  return { saltos, sinPruebas, comandoDePruebas: comando || null, externos, verificaciones, integracion };
}

const archivoInforme = (id: string) => path.join(carpetaDeCorridas(), `${id}.informe.md`);

const ETAPA: Record<string, string> = {
  pendiente: "pendiente", spec: "spec", construccion: "construcción", revision: "revisión", verificacion: "verificación",
  aprobacion: "aprobación", "necesita-humano": "necesita a una persona", hecho: "hecha", descartada: "descartada",
};
const etapa = (e: string | null) => (e ? (ETAPA[e] ?? e) : "nueva");
const coma = (t: string) => t.replace(".", ",");
const usd = (v: number) => `${coma(v.toFixed(v < 1 ? 3 : 2))} USD`;
const miles = (v: number) => (v >= 1000 ? `${coma((v / 1000).toFixed(v >= 100_000 ? 0 : 1))} mil` : String(v));
const duracion = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * El costo de cada tarea, de la telemetría y la actividad de la corrida: cada llamada se reparte
 * por partes iguales entre las tareas con un encargo abierto a su hora (de `desde` a `hasta`, o al
 * fin de la corrida si no se vio terminar). Es una aproximación, y se dice así. Es lógica pura.
 */
export function costoPorTarea(registros: readonly Registro[], actividad: readonly Actividad[], fin: string | null): NonNullable<Informe["porTarea"]> {
  const hasta = (a: Actividad) => Date.parse(a.hasta ?? fin ?? new Date().toISOString());
  const encargos = actividad.filter((a) => a.tarea);
  const usd = new Map<string, number>();
  let sinTarea = 0;
  for (const r of registros) {
    if (r.t !== "evento" || r.nombre !== "api_request") continue;
    const costo = Number(r.cost_usd);
    if (!Number.isFinite(costo) || costo <= 0) continue;
    const t = Date.parse(r.ts);
    const abiertas = [...new Set(encargos.filter((a) => Date.parse(a.desde) <= t && t <= hasta(a)).map((a) => a.tarea!))];
    if (!abiertas.length) {
      sinTarea += costo;
      continue;
    }
    for (const tarea of abiertas) usd.set(tarea, (usd.get(tarea) ?? 0) + costo / abiertas.length);
  }
  return { tareas: [...usd].map(([tarea, v]) => ({ tarea, usd: v })).sort((a, b) => b.usd - a.usd), sinTarea };
}

// Lo que costó cada tarea en cada corrida: se rehace solo si su telemetría cambió. En `globalThis` para que
// sobreviva a la recarga de módulos de desarrollo.
type CostoDeUnaCorrida = { mtime: number; porTarea: Record<string, number> };
const COSTOS_POR_CORRIDA: Map<string, CostoDeUnaCorrida> = ((globalThis as { __costosPorCorrida?: Map<string, CostoDeUnaCorrida> }).__costosPorCorrida ??= new Map());
/** De cuántas corridas hacia atrás se suma. */
const CORRIDAS_QUE_SUMAN = 500;

/**
 * Lo que lleva costado cada tarea de un proyecto, sumando todas sus corridas con telemetría,
 * también la que corre. Es la misma aproximación del informe (`costoPorTarea`), y la estimación de
 * Claude Code, no la factura.
 */
export async function costoDeLasTareas(proyecto: string): Promise<Record<string, number>> {
  const total: Record<string, number> = {};
  for (const c of await costosPorCorrida(proyecto)) for (const [tarea, usd] of Object.entries(c.porTarea)) total[tarea] = (total[tarea] ?? 0) + usd;
  return total;
}

/** Lo que costó cada tarea en cada corrida del proyecto con telemetría, de la más nueva a la más vieja. */
async function costosPorCorrida(proyecto: string): Promise<{ id: string; inicio: string; porTarea: Record<string, number> }[]> {
  const out: { id: string; inicio: string; porTarea: Record<string, number> }[] = [];
  for (const m of await listarCorridas(CORRIDAS_QUE_SUMAN)) {
    if (m.proyecto !== proyecto || !m.conTelemetria) continue;
    const st = await fs.stat(archivoTelemetria(m.id)).catch(() => null);
    if (!st) continue;
    let c = COSTOS_POR_CORRIDA.get(m.id);
    if (!c || c.mtime !== st.mtimeMs) {
      const [registros, corrida] = await Promise.all([leerTelemetria(m.id).catch(() => []), leerCorrida(m.id)]);
      c = { mtime: st.mtimeMs, porTarea: Object.fromEntries(costoPorTarea(registros, corrida?.actividad ?? [], corrida?.fin ?? null).tareas.map((t) => [t.tarea, t.usd])) };
      COSTOS_POR_CORRIDA.set(m.id, c);
    }
    out.push({ id: m.id, inicio: m.inicio, porTarea: c.porTarea });
  }
  return out;
}

// ---- Cuánto rinde cada agente --------------------------------------------------------------------

/** Las etapas desde donde volver a construcción quiere decir que alguien no la dejó pasar. */
const QUIEN_DEVUELVE = ["revision", "verificacion", "aprobacion"];

export type RendimientoDeAgente = {
  agente: string;
  /** Los encargos que tuvo, en cuántas tareas, y cuánto tiempo estuvo con ellos. */
  encargos: number;
  tareas: number;
  minutos: number;
  /** Lo que costó, repartido como en el informe. `null` si ninguna de sus corridas trajo telemetría. */
  usd: number | null;
  /** Cuántas veces devolvió una tarea a construcción, y cuántas de las que construyó le devolvieron. */
  devolvio: number;
  leDevolvieron: number;
  /** En qué etapas trabajó, y cuántos encargos en cada una. */
  etapas: Record<string, number>;
};

type Encargo = Actividad & { etapa: string | null; fin: string | null };

/**
 * Cuánto rinde cada agente, de la actividad de las corridas y la bitácora de la fábrica: cada
 * encargo es de la etapa en que estaba su tarea cuando empezó. Cuando una tarea vuelve a
 * construcción, la devolvió el último que la trabajó en la etapa de la que vuelve, y a quien la
 * construyó le devolvieron una. El costo se reparte entre los encargos abiertos a la hora de cada
 * llamada. Es lógica pura.
 */
export function rendimientoDe(eventos: readonly Evento[], corridas: readonly { actividad: readonly Actividad[]; fin: string | null; registros: readonly Registro[] | null }[]): RendimientoDeAgente[] {
  const porTarea = new Map<string, Evento[]>();
  for (const e of eventos) porTarea.set(e.tarea, [...(porTarea.get(e.tarea) ?? []), e]);
  const etapaEn = (tarea: string, t: number) => [...(porTarea.get(tarea) ?? [])].reverse().find((e) => Date.parse(e.ts) <= t)?.a ?? null;
  const encargos: Encargo[] = corridas.flatMap((c) => c.actividad.filter((a) => a.tarea).map((a) => ({ ...a, etapa: etapaEn(a.tarea!, Date.parse(a.desde)), fin: c.fin })));
  const de = new Map<string, RendimientoDeAgente & { _tareas: Set<string> }>();
  const fila = (agente: string) => {
    let f = de.get(agente);
    if (!f) de.set(agente, (f = { agente, encargos: 0, tareas: 0, minutos: 0, usd: null, devolvio: 0, leDevolvieron: 0, etapas: {}, _tareas: new Set() }));
    return f;
  };
  for (const e of encargos) {
    const f = fila(e.agente);
    f.encargos++;
    f._tareas.add(e.tarea!);
    const hasta = Date.parse(e.hasta ?? e.fin ?? new Date().toISOString());
    f.minutos += Math.max(0, hasta - Date.parse(e.desde)) / 60_000;
    if (e.etapa) f.etapas[e.etapa] = (f.etapas[e.etapa] ?? 0) + 1;
  }
  // Las vueltas: quién no la dejó pasar, y a quién se la devolvieron.
  for (const ev of eventos) {
    if (ev.a !== "construccion" || !ev.de || !QUIEN_DEVUELVE.includes(ev.de)) continue;
    const t = Date.parse(ev.ts);
    const antes = encargos.filter((x) => x.tarea === ev.tarea && Date.parse(x.desde) <= t).sort((a, b) => Date.parse(b.desde) - Date.parse(a.desde));
    const quien = antes.find((x) => x.etapa === ev.de);
    const constructor = antes.find((x) => x.etapa === "construccion");
    if (quien) fila(quien.agente).devolvio++;
    if (constructor) fila(constructor.agente).leDevolvieron++;
  }
  // El costo, de las corridas que trajeron telemetría.
  for (const c of corridas) {
    if (!c.registros) continue;
    const abiertos = c.actividad.filter((a) => a.tarea);
    const hasta = (a: Actividad) => Date.parse(a.hasta ?? c.fin ?? new Date().toISOString());
    for (const r of c.registros) {
      if (r.t !== "evento" || r.nombre !== "api_request") continue;
      const costo = Number(r.cost_usd);
      if (!Number.isFinite(costo) || costo <= 0) continue;
      const t = Date.parse(r.ts);
      const agentes = [...new Set(abiertos.filter((a) => Date.parse(a.desde) <= t && t <= hasta(a)).map((a) => a.agente))];
      for (const a of agentes) {
        const f = fila(a);
        f.usd = (f.usd ?? 0) + costo / agentes.length;
      }
    }
  }
  return [...de.values()]
    .map(({ _tareas, ...f }) => ({ ...f, tareas: _tareas.size, minutos: Math.round(f.minutos) }))
    .sort((a, b) => b.encargos - a.encargos || a.agente.localeCompare(b.agente));
}

/** Cuánto rinde cada agente en un proyecto, con todas sus corridas. Solo lee. */
/** Cómo le fue a una habilidad: en cuántas tareas la recibió un agente, y cuántas de esas volvieron a construcción después. */
export type RendimientoDeHabilidad = { nombre: string; tareas: number; volvieron: number; etapas: string[]; huellas: string[] };

/**
 * Por habilidad, según las corridas que la dieron: cada encargo a un agente `fabrica-hab-<rol>`
 * cuenta para las habilidades que esa corrida le dio a su etapa. Una tarea «volvió» si después
 * de ese encargo la devolvieron a construcción (revisión, verificación o aprobación). Es lógica pura.
 */
export function rendimientoDeHabilidades(
  eventos: readonly Evento[],
  corridas: readonly { actividad: readonly Actividad[]; habilidades?: Record<string, readonly { nombre: string; huella: string }[]> }[],
): RendimientoDeHabilidad[] {
  const etapaDeAgente = new Map((Object.keys(ROLES_DE_AGENTE) as RolDeAgente[]).map((rol) => [nombreConHabilidades(rol), ETAPA_DEL_ROL[rol]]));
  const de = new Map<string, { tareas: Set<string>; volvieron: Set<string>; etapas: Set<string>; huellas: Set<string> }>();
  for (const c of corridas) {
    for (const a of c.actividad) {
      const etapa = etapaDeAgente.get(a.agente);
      if (!a.tarea || !etapa) continue;
      const volvio = eventos.some((ev) => ev.tarea === a.tarea && ev.a === "construccion" && !!ev.de && QUIEN_DEVUELVE.includes(ev.de) && Date.parse(ev.ts) >= Date.parse(a.desde));
      for (const h of c.habilidades?.[etapa] ?? []) {
        let f = de.get(h.nombre);
        if (!f) de.set(h.nombre, (f = { tareas: new Set(), volvieron: new Set(), etapas: new Set(), huellas: new Set() }));
        f.tareas.add(a.tarea);
        if (volvio) f.volvieron.add(a.tarea);
        f.etapas.add(etapa);
        f.huellas.add(h.huella);
      }
    }
  }
  return [...de]
    .map(([nombre, f]) => ({ nombre, tareas: f.tareas.size, volvieron: f.volvieron.size, etapas: [...f.etapas], huellas: [...f.huellas] }))
    .sort((a, b) => b.tareas - a.tareas || a.nombre.localeCompare(b.nombre));
}

export async function rendimientoDeLosAgentes(proyecto: string): Promise<{ agentes: RendimientoDeAgente[]; habilidades: RendimientoDeHabilidad[]; corridas: number }> {
  const eventos = eventosDesde(await fs.readFile(path.join(proyecto, "factory", "eventos.jsonl"), "utf8").catch(() => ""));
  const actual = await corridaActual();
  const corridas: { actividad: Actividad[]; fin: string | null; registros: Registro[] | null; habilidades?: Record<string, { nombre: string; huella: string }[]> }[] = [];
  for (const m of await listarCorridas(CORRIDAS_QUE_SUMAN)) {
    if (m.proyecto !== proyecto) continue;
    // La que corre, con lo que lleva; las demás, con la actividad que guardaron al terminar.
    const actividad =
      actual?.id === m.id
        ? (actual.actividad ?? [])
        : ((JSON.parse(await fs.readFile(path.join(carpetaDeCorridas(), `${m.id}.json`), "utf8").catch(() => "{}")) as { actividad?: Actividad[] }).actividad ?? []);
    if (!actividad.length) continue;
    corridas.push({ actividad, fin: m.fin ?? null, registros: m.conTelemetria ? await leerTelemetria(m.id).catch(() => null) : null, ...(m.habilidades ? { habilidades: m.habilidades } : {}) });
  }
  return { agentes: rendimientoDe(eventos, corridas), habilidades: rendimientoDeHabilidades(eventos, corridas), corridas: corridas.length };
}

/** De cuántos pasos hacia atrás se arma el historial de una tarea. */
const HISTORIAL_MAX = 200;

export type HistorialDeTarea = {
  tarea: string;
  /** Cada vez que cambió de etapa, o que alguien anotó algo en ella, con su hora y quién. */
  pasos: { ts: string; de: string | null; a: string; agente: string | null; nota: string | null }[];
  /** Las corridas que la trabajaron, con lo que costó en cada una (aproximado). */
  corridas: { id: string; inicio: string; usd: number }[];
};

/** El camino de una tarea por la fábrica: sus pasos, de la bitácora, y las corridas que la trabajaron. Solo lee. */
export async function historialDeLaTarea(proyecto: string, id: string): Promise<HistorialDeTarea> {
  const eventos = eventosDesde(await fs.readFile(path.join(proyecto, "factory", "eventos.jsonl"), "utf8").catch(() => ""));
  const pasos = eventos
    .filter((e) => e.tarea === id)
    .slice(-HISTORIAL_MAX)
    .map((e) => ({ ts: e.ts, de: e.de, a: e.a, agente: e.agente?.split(":").at(-1) ?? null, nota: e.nota?.slice(0, 600) ?? null }));
  const corridas = (await costosPorCorrida(proyecto)).filter((c) => c.porTarea[id] !== undefined).map((c) => ({ id: c.id, inicio: c.inicio, usd: c.porTarea[id]! }));
  return { tarea: id, pasos, corridas };
}

/** Lo que se movió en la fábrica entre el inicio y el fin de la corrida, tarea por tarea. */
async function movimientos(c: Corrida): Promise<MovimientoDeTarea[]> {
  const texto = await fs.readFile(path.join(c.proyecto, "factory", "eventos.jsonl"), "utf8").catch(() => "");
  const desde = Date.parse(c.inicio);
  const hasta = c.fin ? Date.parse(c.fin) : Date.now();
  const porTarea = new Map<string, MovimientoDeTarea>();
  for (const e of eventosDesde(texto)) {
    const t = Date.parse(e.ts);
    if (!(t >= desde && t <= hasta)) continue;
    const m = porTarea.get(e.tarea) ?? { tarea: e.tarea, pasos: [] };
    m.pasos.push({ de: e.de, a: e.a, ...(e.agente ? { agente: e.agente.split(":").at(-1) } : {}), ...(e.nota ? { nota: e.nota.slice(0, 300) } : {}), ts: e.ts });
    porTarea.set(e.tarea, m);
  }
  return [...porTarea.values()].sort((a, b) => a.tarea.localeCompare(b.tarea));
}

/**
 * Los servidores MCP que no conectaron, por su nombre: si algún agente intentó usarlo, es un
 * problema; si nadie lo usó, solo una nota. Sin nombres (la corrida no los dijo), queda la cuenta
 * de la telemetría como problema, como antes.
 */
export function servidoresCaidos(mcp: Corrida["mcp"], fallidosEnTelemetria: number): { problemas: string[]; notas: string[] } {
  const caidos = mcp?.caidos ?? [];
  if (!caidos.length) return { problemas: fallidosEnTelemetria ? [`${plural(fallidosEnTelemetria, "servidor MCP no conectó", "servidores MCP no conectaron")}.`] : [], notas: [] };
  const usados = new Set((mcp?.usados ?? []).map(nombreMcp));
  const conUso = caidos.filter((n) => usados.has(nombreMcp(n)));
  const sinUso = caidos.filter((n) => !usados.has(nombreMcp(n)));
  return {
    problemas: conUso.length ? [`${conUso.length === 1 ? "El servidor MCP" : "Los servidores MCP"} ${conUso.join(", ")} no ${conUso.length === 1 ? "conectó" : "conectaron"}, y la corrida ${conUso.length === 1 ? "lo" : "los"} intentó usar.`] : [],
    notas: sinUso.length ? [`${sinUso.length === 1 ? "El servidor MCP" : "Los servidores MCP"} ${sinUso.join(", ")} no ${sinUso.length === 1 ? "conectó" : "conectaron"}; ningún agente de esta corrida ${sinUso.length === 1 ? "lo" : "los"} usó.`] : [],
  };
}

function problemasDe(c: Corrida, t: ResumenTelemetria | null, sinPruebas: Informe["sinPruebas"]): string[] {
  const p: string[] = [];
  if (sinPruebas.length) p.push(`${sinPruebas.map((s) => s.tarea).join(", ")} ${sinPruebas.length === 1 ? "pasó" : "pasaron"} la verificación sin pruebas unitarias: falta ejecutarlas.`);
  const r = c.resultado;
  if (c.estado === "fallida") p.push("La corrida falló.");
  if (c.estado === "detenida") p.push(c.detenidaPor ?? "La corrida se detuvo a mano.");
  if (r?.errorDeApi) p.push(`Terminó con un error de la API (${r.errorDeApi}).`);
  if (r?.detencionesDeSeguridad) p.push(`${plural(r.detencionesDeSeguridad, "detención", "detenciones")} de seguridad.`);
  if (r?.permisosNegados.length) p.push(`El modo de permisos negó ${plural(r.permisosNegados.length, "uso", "usos")} de herramientas: ${[...new Set(r.permisosNegados)].join(", ")}.`);
  if (r?.subagentes?.fallidos) p.push(`${plural(r.subagentes.fallidos, "subagente falló", "subagentes fallaron")}.`);
  if (t) {
    if (t.errores.length) {
      const estados = [...new Set(t.errores.map((e) => (e.estado === null ? "sin respuesta" : String(e.estado))))];
      p.push(`${plural(t.errores.length, "error", "errores")} de la API (${estados.join(", ")}).`);
    }
    if (t.negativas) p.push(`El modelo se negó ${plural(t.negativas, "vez", "veces")}.`);
    const rechazos = t.rechazos.filter((x) => !r?.permisosNegados.includes(x.herramienta));
    if (rechazos.length) p.push(`Se rechazaron ${plural(rechazos.length, "herramienta", "herramientas")}: ${[...new Set(rechazos.map((x) => `${x.herramienta} (${x.fuente})`))].join(", ")}.`);
    const fallidas = t.herramientas.filter((h) => h.fallos);
    if (fallidas.length) p.push(`Herramientas que fallaron: ${fallidas.map((h) => `${h.nombre} ${h.fallos} de ${h.usos}${h.tiposDeFallo.length ? ` (${h.tiposDeFallo.join(", ")})` : ""}`).join("; ")}.`);
    p.push(...servidoresCaidos(c.mcp, t.mcpFallidos).problemas);
    if (t.hooksQueBloquearon) p.push(`Los hooks bloquearon ${plural(t.hooksQueBloquearon, "vez", "veces")}.`);
  }
  const errores = c.lineas.filter((l) => l.tipo === "error").length;
  if (errores) p.push(`${plural(errores, "línea", "líneas")} de error en la salida de la corrida.`);
  return p;
}

/** El informe de una corrida, armado de sus archivos. `null` si la corrida no existe. */
export async function armarInforme(id: string): Promise<Informe | null> {
  const c = await leerCorrida(id);
  if (!c) return null;
  const registros = c.conTelemetria ? await leerTelemetria(id) : [];
  const telemetria = registros.length ? resumirTelemetria(registros) : null;
  const { saltos, sinPruebas, comandoDePruebas, externos, verificaciones, integracion } = await decisiones(c);
  return {
    id: c.id,
    proyecto: c.proyecto,
    pedidas: c.tareas,
    modelo: c.modelo ?? null,
    inicio: c.inicio,
    fin: c.fin ?? null,
    estado: c.estado,
    sesion: c.sesion ?? null,
    final: c.lineas.findLast((l) => l.tipo === "fin")?.texto.slice(0, 1200) ?? null,
    resultado: c.resultado ?? null,
    tareas: await movimientos(c),
    telemetria,
    sinPruebas,
    comandoDePruebas,
    saltos,
    integracion,
    externos,
    jev: await paraJev(c),
    verificaciones,
    porTarea: registros.length ? costoPorTarea(registros, c.actividad ?? [], c.fin ?? null) : null,
    problemas: [...problemasDe(c, telemetria, sinPruebas), ...(telemetria ? [] : servidoresCaidos(c.mcp, 0).problemas)],
    notas: servidoresCaidos(c.mcp, 0).notas,
  };
}

/** El informe en Markdown, para leerlo. Es lógica pura. */
export function informeEnMarkdown(i: Informe): string {
  const r = i.resultado;
  const t = i.telemetria;
  const ms = i.fin ? Date.parse(i.fin) - Date.parse(i.inicio) : null;
  const costo = r?.costoUsd ?? t?.costoUsd ?? null;
  const fecha = (iso: string) => new Date(iso).toLocaleString("es", { hour12: false, dateStyle: "medium", timeStyle: "short" });
  const l: string[] = [
    `# Informe de la corrida ${i.id}`,
    "",
    `- **Proyecto:** ${path.basename(i.proyecto)}`,
    `- **Tareas pedidas:** ${i.pedidas.length ? i.pedidas.join(", ") : "toda la cola"}`,
    `- **Estado:** ${i.estado}${r?.razonDeFin && r.razonDeFin !== "completed" ? ` (${r.razonDeFin})` : ""}`,
    `- **Inicio:** ${fecha(i.inicio)}${i.fin ? ` · **fin:** ${fecha(i.fin)}${ms !== null ? ` · ${duracion(ms)}` : ""}` : " · todavía corre"}`,
    ...(i.modelo ? [`- **Modelo pedido:** ${i.modelo}`] : []),
    ...(i.sesion ? [`- **Sesión de Claude Code:** ${i.sesion}`] : []),
    "",
    "## Lo que movió",
    "",
  ];
  if (!i.tareas.length) l.push("Ninguna tarea cambió de estado mientras corría.");
  for (const m of i.tareas) {
    // Los registros dentro de una misma etapa (una verificación, una decisión) no son pasos del camino.
    const camino = m.pasos.filter((p) => p.de !== p.a);
    l.push(`- **${m.tarea}:** ${camino.length ? [etapa(camino[0].de), ...camino.map((p) => etapa(p.a))].join(" → ") : `sigue en ${etapa(m.pasos[0].a)}`}`);
    for (const p of m.pasos.filter((p) => p.nota)) l.push(`  - ${p.agente ?? "la fábrica"}: ${p.nota}`);
  }
  if (i.final) l.push("", "Lo último que dijo:", "", ...i.final.split("\n").map((x) => `> ${x}`));

  l.push("", "## Costo", "");
  if (costo !== null) l.push(`- **Total:** ${usd(costo)}${r?.turnos ? ` en ${plural(r.turnos, "turno", "turnos")}` : ""}${t ? ` y ${plural(t.llamadas, "llamada", "llamadas")} a la API` : ""}`);
  else l.push("Sin datos de costo: la corrida no llegó a dar su resultado.");
  if (r?.duracionApiMs || t?.msEnLaApi) l.push(`- **Esperando a la API:** ${duracion(r?.duracionApiMs ?? t?.msEnLaApi ?? 0)}`);
  const modelos = Object.entries(r?.porModelo ?? {}).length ? Object.entries(r!.porModelo) : Object.entries(t?.porModelo ?? {});
  if (modelos.length) {
    l.push("", "| Modelo | Entrada | Salida | Caché leído | Caché escrito | Costo |", "|---|---:|---:|---:|---:|---:|");
    for (const [modelo, u] of modelos) l.push(`| ${modelo} | ${miles(u.entrada)} | ${miles(u.salida)} | ${miles(u.cacheLeido)} | ${miles(u.cacheCreado)} | ${usd(u.costoUsd)} |`);
  }
  if (i.porTarea?.tareas.length) {
    l.push("", "Por tarea (aproximado: cada llamada se reparte entre las tareas que se estaban trabajando a esa hora):", "");
    for (const x of i.porTarea.tareas) l.push(`- **${x.tarea}:** ${usd(x.usd)}`);
    if (i.porTarea.sinTarea > 0) l.push(`- **El orquestador, entre tareas:** ${usd(i.porTarea.sinTarea)}`);
  }
  if (r?.subagentes?.lanzados) l.push("", `- **Subagentes:** ${r.subagentes.lanzados} lanzados, ${r.subagentes.completados} completados, ${r.subagentes.fallidos} fallidos`);

  l.push("", "## Código", "");
  if (t) {
    l.push(`- **Líneas:** +${t.lineas.agregadas} / −${t.lineas.quitadas}`, `- **Commits:** ${t.commits}${t.prs ? ` · **PR:** ${t.prs}` : ""}`, `- **Tiempo trabajando:** ${duracion(t.tiempoActivoS * 1000)}`);
    if (t.herramientas.length) {
      l.push("", "| Herramienta | Usos | Fallos | Tiempo |", "|---|---:|---:|---:|");
      for (const h of t.herramientas.slice(0, 10)) l.push(`| ${h.nombre} | ${h.usos} | ${h.fallos} | ${duracion(h.ms)} |`);
    }
  } else l.push("Sin telemetría: la corrida se lanzó sin ella, o no llegó.");

  l.push("", "## Pruebas", "");
  if (i.sinPruebas.length) {
    for (const s of i.sinPruebas) l.push(`- **${s.tarea}:** no se corrieron las pruebas unitarias (${s.motivo}). **Falta ejecutarlas.**`);
    if (i.comandoDePruebas) l.push("", `Para correrlas en el worktree de cada una: \`${i.comandoDePruebas}\``);
  } else if (i.verificaciones > 0) l.push("Las tareas que se verificaron en esta corrida corrieron sus pruebas unitarias.");
  else l.push("No se verificó ninguna tarea en esta corrida.");

  if (i.externos.length) {
    const QUIEN = { codex: "Codex", antigravity: "Antigravity" } as const;
    l.push("", "## Otros agentes", "", "Con su suscripción, no con Claude: su costo no entra en el de arriba.", "");
    for (const x of i.externos)
      l.push(`- **${x.tarea}** · ${QUIEN[x.quien]}: ${x.ok ? x.nota : `**falló** (${x.nota}); lo hizo Claude`} · ${duracion(x.segundos * 1000)}${x.tokens ? ` · ${miles(x.tokens)} tokens` : ""}`);
  }

  if (i.integracion.sencillas.length || i.integracion.grandes.length) {
    l.push("", "## Sencillas y grandes", "");
    if (i.integracion.sencillas.length) l.push(`- Pueden entrar solas: ${i.integracion.sencillas.join(", ")}.`);
    if (i.integracion.grandes.length) l.push(`- Conviene que las pruebes a mano: ${i.integracion.grandes.join(", ")}.`);
  }

  if (i.saltos.length) {
    l.push("", "## Lo que se ahorró", "");
    // Con Jev basta su probabilidad; con una regla, el motivo es lo que la explica.
    for (const s of i.saltos) l.push(`- **${s.tarea}:** sin ${s.que.join(", ")} (${s.jev !== null ? `Jev: ${coma(s.jev.toFixed(2))}` : "por regla"})`);
  }

  if (i.jev && (i.jev.decisiones.length || i.jev.resultados.length)) {
    const NOMBRE: Record<DecisionDeJev, string> = { pruebas: "pruebas", seguridad: "seguridad", spec: "spec", modelo: "modelo barato", integracion: "integración sola" };
    const n = (v: number) => coma(v.toFixed(2));
    l.push("", "## Para Jev", "", "Jev no aprende de esto: lo que se ajusta son los umbrales de la fábrica, con cada error.", "");
    for (const d of i.jev.decisiones)
      l.push(`- **${d.tarea}** · ${NOMBRE[d.decision]}: p ${n(d.p)} contra ${n(d.umbral)} → ${d.control ? "muestra de control (se hizo igual)" : d.decision === "integracion" ? (d.ahorra ? "entró sola" : "espera tu prueba") : d.ahorra ? "se ahorró" : "se hizo"}`);
    for (const r of i.jev.resultados) l.push(`- **${r.tarea}** · ${NOMBRE[r.decision]}: ${r.acierto ? "acierto" : "**error**"} — ${r.evidencia}`);
    l.push("", "Umbrales con lo aprendido:", "");
    for (const [d, u] of Object.entries(i.jev.umbrales) as [DecisionDeJev, Umbral][])
      l.push(`- ${NOMBRE[d]}: ${n(u.umbral)}${u.umbral !== u.base ? ` (era ${n(u.base)}: se apretó por un error)` : ""} · ${u.aciertos} aciertos, ${u.errores} errores`);
  }

  l.push("", "## Problemas", "");
  l.push(...(i.problemas.length ? i.problemas.map((p) => `- ${p}`) : ["Ninguno."]));
  if (i.notas.length) l.push("", "Notas:", "", ...i.notas.map((n) => `- ${n}`));
  l.push("", "---", "", "Los costos son la estimación de Claude Code, no la factura de Anthropic.", "");
  return l.join("\n");
}

/** Escribe el informe en datos/corridas/<id>.informe.md. */
export async function guardarInforme(id: string): Promise<Informe | null> {
  const i = await armarInforme(id);
  if (i && i.estado !== "corriendo") await fs.writeFile(archivoInforme(id), informeEnMarkdown(i));
  return i;
}

/**
 * El informe de una corrida, para la API: se arma de nuevo cada vez, y si la telemetría llegó
 * después de que se escribiera el archivo, el archivo se rehace.
 */
export async function informeDe(id: string): Promise<{ informe: Informe; markdown: string } | null> {
  const i = await armarInforme(id);
  if (!i) return null;
  const markdown = informeEnMarkdown(i);
  if (i.estado !== "corriendo") {
    const [md, tel] = await Promise.all([fs.stat(archivoInforme(id)).catch(() => null), fs.stat(archivoTelemetria(id)).catch(() => null)]);
    if (!md || (tel && tel.mtimeMs > md.mtimeMs)) await fs.writeFile(archivoInforme(id), markdown).catch(() => undefined);
  }
  return { informe: i, markdown };
}
