// Solo servidor: la telemetría de las corridas. Cada corrida lanza Claude Code con OpenTelemetry
// apuntando a esta misma aplicación (/api/fabrica/telemetria), y aquí se recibe en OTLP/HTTP JSON.
//
// De lo que llega se guarda una lista cerrada de campos por evento, en
// datos/corridas/<id>.telemetria.jsonl: costo, tokens, duración, errores, herramientas y
// decisiones de permisos. Lo demás se descarta sin escribirse: el correo y los ids de la cuenta, el
// texto de los prompts, los comandos y las rutas que use una herramienta.
import { promises as fs } from "node:fs";
import path from "node:path";
import { carpetaDeCorridas } from "./corridas.ts";

/** Un evento o una métrica ya recortados a lo que se guarda. */
export type Registro = { t: "evento" | "metrica"; nombre: string; ts: string } & Record<string, string | number | boolean>

/** Lo que se guarda de cada evento de Claude Code: el resto de sus atributos no se escribe. */
const CAMPOS_DE_EVENTO: Record<string, string[]> = {
  api_request: ["model", "cost_usd", "input_tokens", "output_tokens", "cache_read_tokens", "cache_creation_tokens", "duration_ms", "ttft_ms", "request_id", "query_source"],
  api_error: ["model", "status_code", "attempt", "duration_ms", "request_id", "error", "query_source"],
  api_refusal: ["model", "request_id", "query_source"],
  tool_result: ["tool_name", "success", "duration_ms", "error_type"],
  tool_decision: ["tool_name", "decision", "source"],
  mcp_server_connection: ["status", "duration_ms", "is_plugin"],
  hook_execution_complete: ["hook_event", "num_blocking", "num_non_blocking_error", "total_duration_ms"],
  internal_error: ["error_name", "error_code"],
};

/** Las métricas que no salen de los eventos: el código que tocó, los commits y el tiempo. */
const CAMPOS_DE_METRICA: Record<string, string[]> = {
  "claude_code.lines_of_code.count": ["type"],
  "claude_code.commit.count": [],
  "claude_code.pull_request.count": [],
  "claude_code.active_time.total": ["type"],
  "claude_code.code_edit_tool.decision": ["tool_name", "decision"],
};

/** El nombre de una herramienta de MCP de un servidor ajeno puede decir de más: se deja solo el de la fábrica. */
const herramienta = (n: string) => (n.startsWith("mcp__") && !n.startsWith("mcp__fabrica__") ? "mcp" : n);

const ID_CORRIDA = /^\d{8}T\d{6}$/;
export const archivoTelemetria = (id: string) => path.join(carpetaDeCorridas(), `${id}.telemetria.jsonl`);

type ValorOtlp = { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean }
type AtributoOtlp = { key?: string; value?: ValorOtlp }

/** Un valor de OTLP en JSON: los enteros llegan como texto. */
function valor(v: ValorOtlp | undefined): string | number | boolean | undefined {
  if (!v) return;
  if (typeof v.stringValue === "string") return v.stringValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (typeof v.doubleValue === "number") return v.doubleValue;
  if (typeof v.boolValue === "boolean") return v.boolValue;
}

function atributos(lista: unknown): Map<string, string | number | boolean> {
  const m = new Map<string, string | number | boolean>();
  for (const a of Array.isArray(lista) ? (lista as AtributoOtlp[]) : []) {
    const v = valor(a?.value);
    if (typeof a?.key === "string" && v !== undefined) m.set(a.key, v);
  }
  return m;
}

/** Los números que Claude Code a veces manda como texto («7»), de vuelta a número. */
function campo(m: Map<string, string | number | boolean>, k: string): string | number | boolean | undefined {
  const v = m.get(k);
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && k !== "request_id") return Number(v);
  if (typeof v === "string") return v.length > 200 ? v.slice(0, 200) + "…" : v;
  return v;
}

const instante = (nano: unknown) => {
  const n = Number(nano);
  return Number.isFinite(n) && n > 0 ? new Date(n / 1e6).toISOString() : new Date().toISOString();
};

/**
 * De un envío OTLP (logs o métricas) a los registros que se guardan, agrupados por corrida. Lo que
 * no trae `fabrica.corrida` no es de una corrida de la fábrica y se descarta. Es lógica pura.
 */
export function registrosDeOtlp(senal: "logs" | "metrics", cuerpo: unknown): Map<string, Registro[]> {
  const porCorrida = new Map<string, Registro[]>();
  const anotar = (corrida: unknown, r: Registro) => {
    if (typeof corrida !== "string" || !ID_CORRIDA.test(corrida)) return;
    porCorrida.set(corrida, [...(porCorrida.get(corrida) ?? []), r]);
  };
  const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown>;

  if (senal === "logs") {
    for (const rl of Array.isArray(c.resourceLogs) ? (c.resourceLogs as Record<string, unknown>[]) : []) {
      const recurso = atributos((rl?.resource as { attributes?: unknown } | undefined)?.attributes);
      for (const sl of Array.isArray(rl?.scopeLogs) ? (rl.scopeLogs as Record<string, unknown>[]) : []) {
        for (const lr of Array.isArray(sl?.logRecords) ? (sl.logRecords as Record<string, unknown>[]) : []) {
          const a = atributos(lr?.attributes);
          const nombre = String(a.get("event.name") ?? "");
          const campos = CAMPOS_DE_EVENTO[nombre];
          if (!campos) continue;
          const r: Registro = { t: "evento", nombre, ts: typeof a.get("event.timestamp") === "string" ? String(a.get("event.timestamp")) : instante(lr.timeUnixNano) };
          for (const k of campos) {
            const v = campo(a, k);
            if (v !== undefined) r[k] = k === "tool_name" ? herramienta(String(v)) : v;
          }
          anotar(a.get("fabrica.corrida") ?? recurso.get("fabrica.corrida"), r);
        }
      }
    }
    return porCorrida;
  }

  for (const rm of Array.isArray(c.resourceMetrics) ? (c.resourceMetrics as Record<string, unknown>[]) : []) {
    const recurso = atributos((rm?.resource as { attributes?: unknown } | undefined)?.attributes);
    for (const sm of Array.isArray(rm?.scopeMetrics) ? (rm.scopeMetrics as Record<string, unknown>[]) : []) {
      for (const m of Array.isArray(sm?.metrics) ? (sm.metrics as Record<string, unknown>[]) : []) {
        const nombre = String(m?.name ?? "");
        const campos = CAMPOS_DE_METRICA[nombre];
        const datos = (m?.sum ?? m?.gauge) as { dataPoints?: unknown } | undefined;
        if (!campos || !datos) continue;
        for (const dp of Array.isArray(datos.dataPoints) ? (datos.dataPoints as Record<string, unknown>[]) : []) {
          const a = atributos(dp?.attributes);
          const v = typeof dp?.asDouble === "number" ? dp.asDouble : Number(dp?.asInt);
          if (!Number.isFinite(v)) continue;
          const r: Registro = { t: "metrica", nombre: nombre.replace(/^claude_code\./, ""), ts: instante(dp.timeUnixNano), valor: v };
          for (const k of campos) {
            const x = campo(a, k);
            if (x !== undefined) r[k] = k === "tool_name" ? herramienta(String(x)) : x;
          }
          anotar(a.get("fabrica.corrida") ?? recurso.get("fabrica.corrida"), r);
        }
      }
    }
  }
  return porCorrida;
}

/**
 * Guarda lo recibido, solo para corridas que existen: una corrida que esta aplicación no lanzó no
 * tiene dónde escribir. Devuelve cuántos registros se guardaron.
 */
export async function guardarTelemetria(porCorrida: Map<string, Registro[]>): Promise<number> {
  let guardados = 0;
  for (const [id, registros] of porCorrida) {
    const existe = await fs.access(path.join(carpetaDeCorridas(), `${id}.json`)).then(() => true, () => false);
    if (!existe || !registros.length) continue;
    await fs.appendFile(archivoTelemetria(id), registros.map((r) => JSON.stringify(r)).join("\n") + "\n");
    guardados += registros.length;
  }
  return guardados;
}

export async function leerTelemetria(id: string): Promise<Registro[]> {
  const texto = await fs.readFile(archivoTelemetria(id), "utf8").catch(() => "");
  return texto
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as Registro];
      } catch {
        return [];
      }
    });
}

export type ResumenTelemetria = {
  llamadas: number
  costoUsd: number
  msEnLaApi: number
  porModelo: Record<string, { llamadas: number; costoUsd: number; entrada: number; salida: number; cacheLeido: number; cacheCreado: number }>
  errores: { cuando: string; modelo: string; estado: number | null; intentos: number; error: string }[]
  negativas: number
  herramientas: { nombre: string; usos: number; fallos: number; ms: number; tiposDeFallo: string[] }[]
  rechazos: { herramienta: string; fuente: string }[]
  lineas: { agregadas: number; quitadas: number }
  commits: number
  prs: number
  tiempoActivoS: number
  mcpFallidos: number
  hooksQueBloquearon: number
  erroresInternos: number
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Todo lo de una corrida en cifras. Es lógica pura. */
export function resumirTelemetria(registros: Registro[]): ResumenTelemetria {
  const r: ResumenTelemetria = {
    llamadas: 0, costoUsd: 0, msEnLaApi: 0, porModelo: {}, errores: [], negativas: 0, herramientas: [], rechazos: [],
    lineas: { agregadas: 0, quitadas: 0 }, commits: 0, prs: 0, tiempoActivoS: 0, mcpFallidos: 0, hooksQueBloquearon: 0, erroresInternos: 0,
  };
  const herramientas = new Map<string, ResumenTelemetria["herramientas"][number]>();
  for (const x of registros) {
    if (x.t === "evento") {
      switch (x.nombre) {
        case "api_request": {
          const modelo = String(x.model ?? "desconocido");
          const m = (r.porModelo[modelo] ??= { llamadas: 0, costoUsd: 0, entrada: 0, salida: 0, cacheLeido: 0, cacheCreado: 0 });
          m.llamadas++;
          m.costoUsd += n(x.cost_usd);
          m.entrada += n(x.input_tokens);
          m.salida += n(x.output_tokens);
          m.cacheLeido += n(x.cache_read_tokens);
          m.cacheCreado += n(x.cache_creation_tokens);
          r.llamadas++;
          r.costoUsd += n(x.cost_usd);
          r.msEnLaApi += n(x.duration_ms);
          break;
        }
        case "api_error":
          r.errores.push({ cuando: x.ts, modelo: String(x.model ?? ""), estado: typeof x.status_code === "number" ? x.status_code : null, intentos: n(x.attempt), error: String(x.error ?? "") });
          break;
        case "api_refusal":
          r.negativas++;
          break;
        case "tool_result": {
          const nombre = String(x.tool_name ?? "desconocida");
          const h = herramientas.get(nombre) ?? { nombre, usos: 0, fallos: 0, ms: 0, tiposDeFallo: [] };
          h.usos++;
          h.ms += n(x.duration_ms);
          if (x.success === false || x.success === "false") {
            h.fallos++;
            if (typeof x.error_type === "string" && !h.tiposDeFallo.includes(x.error_type)) h.tiposDeFallo.push(x.error_type);
          }
          herramientas.set(nombre, h);
          break;
        }
        case "tool_decision":
          if (x.decision === "reject") r.rechazos.push({ herramienta: String(x.tool_name ?? ""), fuente: String(x.source ?? "") });
          break;
        case "mcp_server_connection":
          if (x.status === "failed") r.mcpFallidos++;
          break;
        case "hook_execution_complete":
          r.hooksQueBloquearon += n(x.num_blocking);
          break;
        case "internal_error":
          r.erroresInternos++;
          break;
      }
      continue;
    }
    switch (x.nombre) {
      case "lines_of_code.count":
        if (x.type === "added") r.lineas.agregadas += n(x.valor);
        else if (x.type === "removed") r.lineas.quitadas += n(x.valor);
        break;
      case "commit.count":
        r.commits += n(x.valor);
        break;
      case "pull_request.count":
        r.prs += n(x.valor);
        break;
      case "active_time.total":
        r.tiempoActivoS += n(x.valor);
        break;
    }
  }
  r.herramientas = [...herramientas.values()].sort((a, b) => b.usos - a.usos);
  return r;
}

/**
 * Las variables que encenderían el contenido en la telemetría: prompts, respuestas, detalles de las
 * herramientas y cuerpos de la API. A la corrida no le llegan desde el entorno de la aplicación; si
 * el usuario las tiene en su settings.json, lo que manden igual se descarta al recibirlo.
 */
export const VARIABLES_CON_CONTENIDO = ["OTEL_LOG_USER_PROMPTS", "OTEL_LOG_ASSISTANT_RESPONSES", "OTEL_LOG_TOOL_DETAILS", "OTEL_LOG_TOOL_CONTENT", "OTEL_LOG_RAW_API_BODIES"];

/** Las variables con que se lanza una corrida para que mande su telemetría aquí: métricas y eventos. */
export function entornoDeTelemetria(corrida: string, destino: string): Record<string, string> {
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_METRICS_EXPORTER: "otlp",
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_TRACES_EXPORTER: "none",
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
    OTEL_EXPORTER_OTLP_ENDPOINT: destino,
    OTEL_METRIC_EXPORT_INTERVAL: "10000",
    OTEL_LOGS_EXPORT_INTERVAL: "5000",
    OTEL_RESOURCE_ATTRIBUTES: `fabrica.corrida=${corrida}`,
  };
}

/**
 * Adónde manda su telemetría una corrida: a esta misma aplicación, por la dirección desde la que se
 * pidió la corrida. Fuera de este equipo no se manda nada. `null`: la corrida va sin telemetría. Es
 * lógica pura.
 */
export function destinoDeTelemetria(origen: string | null | undefined): string | null {
  if (!origen) return null;
  try {
    const url = new URL(origen);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return null;
    return `${url.origin}/api/fabrica/telemetria`;
  } catch {
    return null;
  }
}

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Lo que hace la ruta al recibir un envío de OTLP. Solo JSON (las corridas se lanzan con
 * http/json): el protobuf se rechaza con 415. Responde como espera un exportador de OTLP.
 */
export async function recibirOtlp(senal: "logs" | "metrics", req: Request): Promise<Response> {
  if (!(req.headers.get("content-type") ?? "").includes("json")) return Response.json({ error: "Solo OTLP en JSON (OTEL_EXPORTER_OTLP_PROTOCOL=http/json)." }, { status: 415 });
  const texto = await req.text();
  if (texto.length > MAX_BYTES) return Response.json({ error: "Envío demasiado grande." }, { status: 413 });
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return Response.json({ error: "No es JSON." }, { status: 400 });
  }
  await guardarTelemetria(registrosDeOtlp(senal, cuerpo));
  return Response.json({ partialSuccess: {} });
}
