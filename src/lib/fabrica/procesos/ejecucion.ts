import type { Proceso } from "./formato.ts";

/**
 * Lo puro de correr un proceso: partir un comando en sus argumentos sin una
 * shell, poner las marcas que pone el código, tapar las claves en lo que se
 * guarda, y la línea del registro. Lo corre el código, no un modelo (lo
 * decidió él el 26 de octubre de 2026); esto no corre nada.
 */

/** Los tipos de paso que corren. Un paso tarea suelto todavía no: el proceso se detiene antes de él. */
export const TIPOS_QUE_CORREN = ["comando", "salud", "push", "ci", "aprobacion", "vulnerabilidades", "evaluacion", "fusion"] as const;
/** Cómo arrancó una ejecución: con su clic, sola al integrar una tarea, o sola cada día o cada semana. */
export type Origen = "a-mano" | "al-integrar" | "periodico";
/** Cada cuánto corre solo un proceso `cada-dia` o `cada-semana`. */
export const CADA_CUANTO_MS: Record<string, number> = { "cada-dia": 24 * 3600_000, "cada-semana": 7 * 24 * 3600_000 };
/** El tope de un paso que no dice el suyo, en segundos. */
export const TOPE_POR_DEFECTO: Record<string, number> = { comando: 10 * 60, salud: 60, push: 3 * 60, ci: 30 * 60, vulnerabilidades: 2 * 60, evaluacion: 30 * 60, fusion: 2 * 60 };

// ---- La evaluación --------------------------------------------------------------------------------

/** Lo único que se toma del archivo de una evaluación. */
export type ResultadoDeEvaluacion = { puntaje: number; casos: number; fallidos: number };
/** Lo que queda de una evaluación en su paso: sus números y el puntaje con que se comparó. */
export type EvaluacionHecha = ResultadoDeEvaluacion & { anterior: number | null };

/** Cuánto puede bajar el puntaje respecto de la vez anterior si el paso no lo dice. */
export const TOLERANCIA_POR_DEFECTO = 0.02;
/** Lo más que se lee del archivo del resultado. */
export const RESULTADO_MAXIMO_BYTES = 1024 * 1024;

/**
 * Los tres números del archivo de una evaluación (`{ "puntaje": 0..1, "casos": n, "fallidos": n }`),
 * o por qué no se pueden tomar, dicho por el código. Lo demás que traiga no se lee: puede ser lo
 * que contestó un modelo. Es lógica pura.
 */
export function leerResultadoDeEvaluacion(texto: string): ResultadoDeEvaluacion | { problema: string } {
  let dato: unknown;
  try {
    dato = JSON.parse(texto.replace(/^﻿/, ""));
  } catch {
    return { problema: "El resultado no es JSON." };
  }
  if (!dato || typeof dato !== "object" || Array.isArray(dato)) return { problema: "El resultado no es un objeto con puntaje, casos y fallidos." };
  const { puntaje, casos, fallidos } = dato as Record<string, unknown>;
  if (typeof puntaje !== "number" || !Number.isFinite(puntaje) || puntaje < 0 || puntaje > 1) return { problema: "El puntaje del resultado no es un número de 0 a 1." };
  if (typeof casos !== "number" || !Number.isInteger(casos) || casos < 1 || casos > 10_000_000) return { problema: "Los casos del resultado no son un entero mayor que 0." };
  if (typeof fallidos !== "number" || !Number.isInteger(fallidos) || fallidos < 0 || fallidos > casos) return { problema: "Los fallidos del resultado no son un entero entre 0 y los casos." };
  return { puntaje, casos, fallidos };
}

const tres = (n: number) => n.toFixed(3);

/**
 * Si una evaluación pasa: el puntaje no queda bajo el umbral, ni baja más que la tolerancia
 * respecto de la última vez que este proceso midió uno. La nota la escribe el código, con números
 * nada más. Es lógica pura.
 */
export function juzgarEvaluacion(r: ResultadoDeEvaluacion, o: { umbral: number | null; tolerancia: number | null }, anterior: ResultadoDeEvaluacion | null): { ok: boolean; nota: string } {
  const tolerancia = o.tolerancia ?? TOLERANCIA_POR_DEFECTO;
  const partes = [`Puntaje ${tres(r.puntaje)}: ${r.casos - r.fallidos} de ${r.casos} casos bien.`];
  const bajoUmbral = o.umbral !== null && r.puntaje < o.umbral;
  if (o.umbral !== null) partes.push(bajoUmbral ? `Quedó bajo el umbral de ${tres(o.umbral)}.` : `El umbral es ${tres(o.umbral)}.`);
  let bajo = false;
  if (!anterior) partes.push("Es la primera vez que mide: no hay con qué comparar.");
  else {
    const dif = r.puntaje - anterior.puntaje;
    // Un margen mínimo, para que 0.85 − 0.83 no falle por cómo se guardan los decimales.
    bajo = dif < -tolerancia - 1e-9;
    partes.push(
      dif === 0
        ? `La vez anterior también ${tres(anterior.puntaje)}.`
        : `La vez anterior ${tres(anterior.puntaje)}: ${dif > 0 ? "subió" : "bajó"} ${tres(Math.abs(dif))}${bajo ? `, más que la tolerancia de ${tres(tolerancia)}` : ""}.`,
    );
    if (anterior.casos !== r.casos) partes.push(`El conjunto cambió: antes eran ${anterior.casos} casos.`);
  }
  return { ok: !bajoUmbral && !bajo, nota: partes.join(" ") };
}

/** El puntaje de la última vez que este proceso midió uno, de la más vieja a la más nueva. */
export function ultimaEvaluacion(ejecuciones: readonly Pick<Ejecucion, "pasos">[]): ResultadoDeEvaluacion | null {
  for (const e of [...ejecuciones].reverse()) {
    const p = e.pasos.find((x) => x.tipo === "evaluacion" && x.evaluacion);
    if (p?.evaluacion) return { puntaje: p.evaluacion.puntaje, casos: p.evaluacion.casos, fallidos: p.evaluacion.fallidos };
  }
  return null;
}

/** Lo que la pantalla muestra de los últimos puntajes de un proceso. */
export type PuntajeALaVista = { id: string; fecha: string; puntaje: number; casos: number; fallidos: number; paso: boolean };

/** Los últimos puntajes de un proceso, del más viejo al más nuevo. Es lógica pura. */
export function puntajesDe(ejecuciones: readonly Pick<Ejecucion, "id" | "inicio" | "pasos">[], cuantos = 10): PuntajeALaVista[] {
  const out: PuntajeALaVista[] = [];
  for (const e of ejecuciones) {
    const p = e.pasos.find((x) => x.tipo === "evaluacion" && x.evaluacion);
    if (p?.evaluacion) out.push({ id: e.id, fecha: e.inicio, puntaje: p.evaluacion.puntaje, casos: p.evaluacion.casos, fallidos: p.evaluacion.fallidos, paso: p.estado === "ok" });
  }
  return out.slice(-cuantos);
}

// ---- La integración continua del commit ----------------------------------------------------------

/** Lo que se le pide a `gh` o a `glab` para leer la integración continua de un commit. Solo lee. */
export function argumentosDeLaCI(h: "gh" | "glab", commit: string): string[] {
  return h === "gh" ? ["api", `repos/{owner}/{repo}/commits/${commit}/check-runs?per_page=100`] : ["api", `projects/:id/pipelines?sha=${commit}`];
}

export type EstadoDeLaCI = { estado: "sin" | "esperando" | "bien" | "mal"; detalle: string; url: string | null };

const MALAS_DE_GITHUB = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure", "stale"]);
const ESPERANDO_EN_GITLAB = new Set(["created", "waiting_for_resource", "preparing", "pending", "running", "scheduled"]);

/**
 * Cómo va la integración continua de un commit, según lo que contestó `gh` (los check runs de
 * GitHub) o `glab` (los pipelines de GitLab). `sin`: todavía no hay nada para ese commit. Lo que no
 * se entiende es `null`.
 */
export function estadoDeLaCI(h: "gh" | "glab", texto: string): EstadoDeLaCI | null {
  let dato: unknown;
  try {
    dato = JSON.parse(texto);
  } catch {
    return null;
  }
  const corto = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").slice(0, 80);
  if (h === "gh") {
    const runs = (dato as { check_runs?: unknown } | null)?.check_runs;
    if (!Array.isArray(runs)) return null;
    const lista = runs as { name?: unknown; status?: unknown; conclusion?: unknown; html_url?: unknown }[];
    if (!lista.length) return { estado: "sin", detalle: "Todavía no hay nada para este commit.", url: null };
    const malos = lista.filter((r) => r.status === "completed" && MALAS_DE_GITHUB.has(String(r.conclusion)));
    const url = (malos[0] ?? lista[0])?.html_url;
    const enlace = typeof url === "string" && /^https:\/\//.test(url) ? url : null;
    if (malos.length) return { estado: "mal", detalle: `No pasó: ${malos.map((r) => `${corto(r.name)} (${corto(r.conclusion)})`).join(", ")}.`, url: enlace };
    const faltan = lista.filter((r) => r.status !== "completed");
    if (faltan.length) return { estado: "esperando", detalle: `Faltan ${faltan.length} de ${lista.length}: ${faltan.map((r) => corto(r.name)).join(", ")}.`, url: enlace };
    return { estado: "bien", detalle: `Pasó: ${lista.map((r) => corto(r.name)).join(", ")}.`, url: enlace };
  }
  if (!Array.isArray(dato)) return null;
  const pipelines = (dato as { id?: unknown; status?: unknown; web_url?: unknown }[]).filter((p) => p && typeof p === "object").sort((a, b) => Number(b.id) - Number(a.id));
  const p = pipelines[0];
  if (!p) return { estado: "sin", detalle: "Todavía no hay ningún pipeline para este commit.", url: null };
  const url = typeof p.web_url === "string" && /^https:\/\//.test(p.web_url) ? p.web_url : null;
  const s = String(p.status);
  if (s === "success" || s === "skipped") return { estado: "bien", detalle: `El pipeline ${corto(p.id)} pasó.`, url };
  if (ESPERANDO_EN_GITLAB.has(s)) return { estado: "esperando", detalle: `El pipeline ${corto(p.id)} está ${corto(s)}.`, url };
  if (s === "manual") return { estado: "mal", detalle: `El pipeline ${corto(p.id)} espera una acción a mano en GitLab.`, url };
  return { estado: "mal", detalle: `El pipeline ${corto(p.id)} terminó ${corto(s)}.`, url };
}

// ---- El pedido a la Bandeja cuando algo falla ----------------------------------------------------

/** La referencia de un pedido que dejó un proceso en la Bandeja: de qué línea, qué proceso y qué ejecución. */
export const refDelPedido = (e: Pick<Ejecucion, "linea" | "proceso" | "id">) => `proceso:${e.linea}/${e.proceso}/${e.id}`;
export const esPedidoDeUnProceso = (ref: string) => ref.startsWith("proceso:");

/**
 * El pedido que deja un proceso que falló, para la Bandeja: qué falló y lo último que dijo. Es
 * texto de una máquina (lo que dijo un comando puede traer cualquier cosa), así que entra como de
 * otra persona: antes de pasar a una línea se revisa, como el issue de otra persona.
 */
export function pedidoDeLaFalla(e: Ejecucion, f: PasoEjecutado): { titulo: string; texto: string } {
  const deshechos = e.pasos.filter((p) => ["deshecho", "no-se-deshace", "no-se-deshizo"].includes(p.estado));
  const cola = f.salida.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim()).slice(-30);
  // La evaluación tampoco publica nada: pide ver por qué bajó, con sus números. Lo que dijo el
  // comando no entra: puede traer lo que contestó un modelo.
  if (f.tipo === "evaluacion")
    return {
      titulo: `Revisar por qué bajó la evaluación ${e.proceso}`,
      texto: [
        `La evaluación ${e.nombre || e.proceso} (factory/procesos/${e.proceso}.md) no pasó en el commit ${e.commit}, en la línea ${f.linea}.`,
        "",
        `Lo que dijo la aplicación: ${f.nota || "nada"}`,
        "",
        "Busca qué cambió desde la vez anterior (el modelo, el prompt, los datos o la infraestructura) y por qué bajó. Si el cambio era a propósito, dilo antes de tocar el umbral.",
      ].join("\n"),
    };
  // El vigía no publica nada: lo que pide es actualizar los paquetes que encontró.
  if (f.tipo === "vulnerabilidades")
    return {
      titulo: "Actualizar los paquetes con vulnerabilidades conocidas",
      texto: [
        `El vigía de vulnerabilidades (factory/procesos/${e.proceso}.md) revisó el commit ${e.commit} en OSV.dev. ${f.nota}`,
        "",
        "Los paquetes, con la versión que usa el proyecto y las vulnerabilidades:",
        "",
        ...cola.map((l) => `    ${l.slice(0, 300)}`),
        "",
        "Actualiza cada uno a una versión que ya no las tenga, sin cambiar lo que hace el proyecto, y corre las pruebas.",
      ].join("\n"),
    };
  return {
    titulo: `Arreglar el proceso ${e.proceso}: falló la línea ${f.linea} (${f.tipo})`,
    texto: [
      `El proceso ${e.nombre || e.proceso} (factory/procesos/${e.proceso}.md) falló al publicar el commit ${e.commit}, en la línea ${f.linea} (${f.tipo}): ${f.texto}`,
      "",
      `Lo que dijo la aplicación: ${f.nota || "nada"}`,
      ...(cola.length ? ["", "Lo último que dijo ese paso:", "", ...cola.map((l) => `    ${l.slice(0, 300)}`)] : []),
      ...(deshechos.length ? ["", `Se deshizo lo hecho: ${deshechos.map((p) => `línea ${p.linea} ${p.estado === "deshecho" ? "deshecha" : p.estado === "no-se-deshace" ? "no se deshace" : "no se pudo deshacer"}`).join(", ")}.`] : []),
    ].join("\n"),
  };
}
/** El remoto al que empuja un proceso. */
export const REMOTO = "origin";

/** Qué programa abre el PR: GitLab (`glab`) si el remoto es de un GitLab; si no, GitHub (`gh`). */
export const herramientaDePR = (urlDelRemoto: string): "gh" | "glab" => (/gitlab/i.test(urlDelRemoto) ? "glab" : "gh");
/** La variable de `.env.local` con la ruta exacta de esa herramienta. Sin ella, el PR no se abre. */
export const variableDeHerramienta = (h: "gh" | "glab") => (h === "gh" ? "COMPANIA_GH_BIN" : "COMPANIA_GLAB_BIN");

/**
 * Lo que no va a poder correr en este equipo, antes de correrlo: una clave que falta, un remoto
 * que no está, o `gh`/`glab` sin su ruta para el PR, la integración continua o la fusión. Con
 * esto la pantalla avisa, el proceso no se enciende para arrancar solo, y el vigía no lo lanza:
 * lo registra con este motivo. Solo nombres de variables, nunca valores. Es lógica pura.
 * `remoto`: la dirección de `origin`, o `null` si la línea no lo tiene.
 */
export function loQueNoVaAPoder(
  pasos: readonly { linea: number; tipo: string; claves: readonly string[]; prContra: string | null }[],
  o: { linea: string; remoto: string | null; entorno: Record<string, string | undefined> },
): string[] {
  const out: string[] = [];
  const h = o.remoto === null ? null : herramientaDePR(o.remoto.trim());
  const sinHerramienta = h && !o.entorno[variableDeHerramienta(h)]?.trim() ? variableDeHerramienta(h) : null;
  for (const p of pasos) {
    const en = `Línea ${p.linea} (${p.tipo})`;
    if (p.tipo === "comando" || p.tipo === "evaluacion") {
      const faltan = p.claves.map((c) => variableDeClave(o.linea, c)).filter((v) => !o.entorno[v]);
      if (faltan.length) out.push(`${en}: falta ${faltan.join(", ")} en .env.local.`);
      continue;
    }
    if (p.tipo !== "push" && p.tipo !== "ci" && p.tipo !== "fusion") continue;
    if (o.remoto === null) {
      out.push(`${en}: la línea no tiene un remoto «${REMOTO}».`);
      continue;
    }
    if (!sinHerramienta) continue;
    if (p.tipo === "push" && p.prContra) out.push(`${en}: empuja, pero el PR no se abre: falta ${sinHerramienta} en .env.local, con la ruta de ${h}.`);
    if (p.tipo === "ci") out.push(`${en}: no puede leer la integración continua: falta ${sinHerramienta} en .env.local, con la ruta de ${h}.`);
    if (p.tipo === "fusion") out.push(`${en}: no puede fusionar: falta ${sinHerramienta} en .env.local, con la ruta de ${h}.`);
  }
  return out;
}

/** Lo que se le pide a `gh` o a `glab` para abrir el PR. El título y el cuerpo los arma el código, sin nada de un issue. */
export function argumentosDelPR(h: "gh" | "glab", o: { rama: string; base: string; titulo: string; cuerpo: string; cuerpoEn?: string }): string[] {
  // Un cuerpo de varias líneas va en un archivo: lanzado con `cmd /c` (un .cmd), un argumento se corta en el primer salto de línea.
  // En GitLab, la rama del proceso no se borra al fusionar aunque el proyecto lo haga por defecto: es la de trabajo de la línea.
  return h === "gh"
    ? ["pr", "create", "--base", o.base, "--head", o.rama, "--title", o.titulo, ...(o.cuerpoEn ? ["--body-file", o.cuerpoEn] : ["--body", o.cuerpo])]
    : ["mr", "create", "--source-branch", o.rama, "--target-branch", o.base, "--title", o.titulo, ...(o.cuerpoEn ? ["--description-file", o.cuerpoEn] : ["--description", o.cuerpo]), "--remove-source-branch=false", "--yes"];
}

/** La primera dirección web de una salida: la del PR que se abrió. */
export const direccionEn = (texto: string) => /https?:\/\/[^\s"'<>]+/.exec(texto)?.[0] ?? null;
/** Si el push se rechazó porque el remoto avanzó: entonces no se fuerza. */
export const rechazoPorAvance = (texto: string) => /non-fast-forward|fetch first|\[rejected\][^\n]*\((?:non-fast-forward|fetch first)\)/i.test(texto);
/** Si el servicio dice que ya hay un PR abierto para esa rama. */
export const yaHabiaPR = (texto: string) => /already exists|ya existe/i.test(texto);
/** Cada cuánto se vuelve a mirar la salud mientras no conteste lo esperado. */
export const SALUD_CADA_MS = 5_000;
/** Lo que se guarda de la salida de un paso para mostrarlo; la entera va al archivo de la ejecución. */
export const COLA_DE_SALIDA = 4_000;

export type EstadoDePaso = "pendiente" | "corriendo" | "esperando" | "ok" | "fallo" | "no-aprobado" | "deshecho" | "no-se-deshace" | "no-se-deshizo" | "sin-correr";
/** `esperando`: llegó a un paso aprobacion y espera su clic. */
export type EstadoDeEjecucion = "corriendo" | "esperando" | "termino" | "llego" | "fallo" | "detenida";

export type PasoEjecutado = {
  linea: number;
  tipo: string;
  texto: string;
  estado: EstadoDePaso;
  ms: number | null;
  /** El final de lo que dijo, con las claves tapadas. */
  salida: string;
  /** Lo que el código dice de este paso: por qué falló, por qué no se deshizo. */
  nota: string;
  /** En una evaluación que leyó su resultado: los tres números, y el puntaje de la vez anterior. */
  evaluacion?: EvaluacionHecha;
};

export type Ejecucion = {
  id: string;
  /** El id de la línea. */
  linea: string;
  proceso: string;
  nombre: string;
  /** El commit de la raíz cuando empezó: lo que se publica. */
  commit: string;
  inicio: string;
  fin: string | null;
  estado: EstadoDeEjecucion;
  pasos: PasoEjecutado[];
  /** Si llegó a un paso que todavía no corre: cuál. */
  paradoEn: { linea: number; tipo: string } | null;
  /** Por qué falló o se detuvo, dicho por el código. */
  motivo: string | null;
  /** Cómo arrancó: con su clic, o solo al integrar una tarea porque él lo dejó encendido. */
  origen?: Origen;
  /** La huella del texto del proceso con que corrió: para saber si ya pasó entero con esta versión. */
  huella?: string;
  /** Desde cuándo espera su clic, si llegó a un paso aprobacion. */
  esperaDesde?: string;
};

/**
 * Los argumentos de un comando, como los separaría una persona: por espacios, con comillas dobles o
 * simples para uno que los tenga. No hay shell: nada se expande ni se encadena. Lanza si queda una
 * comilla abierta.
 */
export function partirComando(texto: string): string[] {
  const args: string[] = [];
  let actual = "";
  let hay = false;
  let comilla: '"' | "'" | null = null;
  for (const c of texto.trim()) {
    if (comilla) {
      if (c === comilla) comilla = null;
      else actual += c;
    } else if (c === '"' || c === "'") {
      comilla = c;
      hay = true;
    } else if (/\s/.test(c)) {
      if (hay) args.push(actual);
      actual = "";
      hay = false;
    } else {
      actual += c;
      hay = true;
    }
  }
  if (comilla) throw new Error("Queda una comilla abierta en el comando.");
  if (hay) args.push(actual);
  return args;
}

export type Marcas = { commit: string; anterior: string | null; rama: string };

/**
 * Pone `{commit}`, `{anterior}` y `{rama}` en cada argumento, ya separado: lo que vale una marca no
 * puede partir un argumento en dos ni agregar otro. Sin una ejecución anterior que haya terminado,
 * `{anterior}` no tiene valor, y el paso que lo usa no corre.
 */
export function conMarcas(args: readonly string[], m: Marcas): string[] {
  return args.map((a) => {
    if (a.includes("{anterior}") && m.anterior === null) throw new Error("Usa {anterior}, y este proceso todavía no terminó ninguna vez: no hay a qué volver.");
    return a.replaceAll("{commit}", m.commit).replaceAll("{anterior}", m.anterior ?? "").replaceAll("{rama}", m.rama);
  });
}

/** La variable de `.env.local` de donde sale una clave de un paso: `COMPANIA_PROCESO_<LINEA>_<NOMBRE>`. */
export const variableDeClave = (linea: string, nombre: string) => `COMPANIA_PROCESO_${linea.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${nombre}`;

/** Los valores de las claves de los procesos: lo que nunca se guarda ni se muestra. */
export const secretosDelEntorno = (env: Record<string, string | undefined>) =>
  Object.entries(env)
    .filter(([k, v]) => k.startsWith("COMPANIA_PROCESO_") && typeof v === "string" && v.length >= 4)
    .map(([, v]) => v as string)
    .sort((a, b) => b.length - a.length);

export const TAPADA = "«clave tapada»";

/** Un texto con cada clave tapada. Las más largas primero, por si una contiene a otra. */
export function tapar(texto: string, secretos: readonly string[]): string {
  let t = texto;
  for (const s of secretos) t = t.split(s).join(TAPADA);
  return t;
}

const dos = (n: number) => String(n).padStart(2, "0");
/** `AAAA-MM-DD HH:MM`, en la hora de este equipo. */
export const fechaLocal = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
/** El id de una ejecución: cuándo empezó y qué proceso. Ordena por fecha. */
export const idDeEjecucion = (d: Date, proceso: string) =>
  `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}-${proceso}`;

const RESULTADO: Record<EstadoDeEjecucion, string> = { corriendo: "corriendo", esperando: "espera su clic", termino: "terminó", llego: "llegó", fallo: "falló", detenida: "detenida" };

/**
 * La línea del registro del mes, como la bitácora: `- 2026-10-26 16:40 · publicar · <commit> ·
 * falló · en la línea 14 (comando) · deshecho 2 de 2`. Nada de lo que dijeron los comandos: solo
 * qué pasó.
 */
export function lineaDeRegistro(e: Ejecucion, cuando: Date): string {
  const hechos = e.pasos.filter((p) => ["ok", "deshecho", "no-se-deshace", "no-se-deshizo"].includes(p.estado));
  const fallo = e.pasos.find((p) => p.estado === "fallo");
  const aDeshacer = e.pasos.filter((p) => ["deshecho", "no-se-deshace", "no-se-deshizo"].includes(p.estado));
  const detalle =
    e.estado === "termino"
      ? [`${hechos.length} ${hechos.length === 1 ? "paso" : "pasos"}`]
      : e.estado === "llego"
        ? [`hasta la línea ${e.paradoEn?.linea} (${e.paradoEn?.tipo}), que todavía no corre`]
        : e.estado === "fallo"
          ? [fallo ? `en la línea ${fallo.linea} (${fallo.tipo})` : "antes de empezar", ...(aDeshacer.length ? [`deshecho ${aDeshacer.filter((p) => p.estado === "deshecho").length} de ${aDeshacer.length}`] : [])]
          : e.pasos.some((p) => p.estado === "no-aprobado")
            ? [`sin su clic, después de ${hechos.length} ${hechos.length === 1 ? "paso" : "pasos"}`]
            : [`a mano, después de ${hechos.length} ${hechos.length === 1 ? "paso" : "pasos"}`];
  // El puntaje de una evaluación, si midió uno: solo números.
  const ev = e.pasos.find((p) => p.evaluacion)?.evaluacion;
  const puntaje = ev ? [`puntaje ${ev.puntaje.toFixed(3)} (${ev.casos - ev.fallidos} de ${ev.casos})`] : [];
  // El commit entero: es lo que vuelve como {anterior}, y tiene que ser igual al {commit} de entonces.
  return `- ${[fechaLocal(cuando), e.proceso, e.commit, RESULTADO[e.estado], ...detalle, ...puntaje].join(" · ")}`;
}

/**
 * El commit de la última vez que el proceso terminó bien (o llegó hasta donde corre), según el
 * registro: es `{anterior}`, adonde vuelve un `deshacer`. `null` si nunca terminó.
 */
export function anteriorEnElRegistro(textos: readonly string[], proceso: string): string | null {
  let ultimo: { fecha: string; commit: string } | null = null;
  for (const t of textos)
    for (const l of t.replace(/\r\n?/g, "\n").split("\n")) {
      const m = /^- (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · ([a-z0-9-]+) · ([0-9a-f]{7,40}) · (terminó|llegó)(?: ·|$)/.exec(l);
      if (m && m[2] === proceso && (!ultimo || m[1]! >= ultimo.fecha)) ultimo = { fecha: m[1]!, commit: m[3]! };
    }
  return ultimo?.commit ?? null;
}

// ---- Producción sin su clic -------------------------------------------------------------------------

/** Cuánto espera su clic un proceso antes de darse por no aprobado. */
export const ESPERA_DE_SU_CLIC_MS = 12 * 3600_000;

/**
 * Por qué un proceso no puede pasar a producción sin su clic, aunque él lo haya quitado en esa línea.
 * Vacío: puede. Se mira al quitarlo y otra vez cada vez que corre: tiene un paso aprobacion; cada
 * comando que cambia algo se puede deshacer; después de producción hay una comprobación de salud
 * (si falla, se deshace solo); y esta misma versión del proceso ya pasó entera hasta producción
 * al menos una vez. Es lógica pura.
 */
export function porQueNoSinClic(p: Proceso, huella: string, anteriores: readonly Pick<Ejecucion, "huella" | "pasos">[]): string[] {
  const aprobacion = p.pasos.findIndex((x) => x.tipo === "aprobacion");
  if (aprobacion < 0) return ["No tiene un paso aprobacion: no hay clic que quitar."];
  const sinDeshacer = p.pasos.filter((x) => x.tipo === "comando" && !x.deshacer);
  const saludDespues = p.pasos.slice(aprobacion + 1).some((x) => x.tipo === "salud");
  const llego = anteriores.some((e) => e.huella === huella && e.pasos.some((x) => x.tipo === "aprobacion" && ["esperando", "ok", "no-aprobado"].includes(x.estado)));
  return [
    ...sinDeshacer.map((x) => `La línea ${x.linea} no se puede deshacer (deshacer: —).`),
    ...(saludDespues ? [] : ["Después de producción no hay una comprobación de salud: sin ella no se sabe si salió bien, ni hay cuándo deshacer."]),
    ...(llego ? [] : ["Esta versión del proceso todavía no pasó entera por el entorno de prueba: córrela una vez con tu clic."]),
  ];
}
