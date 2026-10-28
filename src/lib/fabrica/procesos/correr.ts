import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dejarPedidoDeUnProceso } from "../../entrada/bandeja.ts";
import { baseDeDatos } from "../../datos.ts";
import { cerrarProceso } from "../../servicios/procesos.ts";
import { entornoDelProyecto } from "../motor/comandos.ts";
import { corridaActual } from "../motor/corridas.ts";
import { lineaPorId, mismaRaiz } from "../motor/lineas.ts";
import { partir, veredictoDesde } from "../motor/formato.ts";
import { seccionDe } from "../motor/deuda.ts";
import { carpetaDeLaFabrica, esRamaProtegida, leerAjustes, lineasDeLaFabrica, procesosSinClicDe, procesosSolosDe } from "../motor/proyecto.ts";
import { llamar } from "../motor/telefono.ts";
import {
  anteriorEnElRegistro,
  CADA_CUANTO_MS,
  type Origen,
  ESPERA_DE_SU_CLIC_MS,
  fechaLocal,
  porQueNoSinClic,
  argumentosDeLaCI,
  argumentosDelPR,
  estadoDeLaCI,
  direccionEn,
  herramientaDePR,
  rechazoPorAvance,
  REMOTO,
  variableDeHerramienta,
  yaHabiaPR,
  COLA_DE_SALIDA,
  conMarcas,
  idDeEjecucion,
  juzgarEvaluacion,
  leerResultadoDeEvaluacion,
  lineaDeRegistro,
  loQueNoVaAPoder,
  puntajesDe,
  RESULTADO_MAXIMO_BYTES,
  ultimaEvaluacion,
  type EvaluacionHecha,
  type PuntajeALaVista,
  partirComando,
  pedidoDeLaFalla,
  refDelPedido,
  SALUD_CADA_MS,
  secretosDelEntorno,
  tapar,
  TIPOS_QUE_CORREN,
  TOPE_POR_DEFECTO,
  variableDeClave,
  type Ejecucion,
  type EstadoDeLaCI,
  type Marcas,
  type PasoEjecutado,
} from "./ejecucion.ts";
import { procesosDe } from "./disco.ts";
import { argumentosDeEditarPR, argumentosDeFusion, argumentosDelCommitFusionado, argumentosDeVerPR, commitFusionadoDe, cuerpoDelPR, leerPR, porQueNoFusionar, type TareaDelRango } from "./fusion.ts";
import { loCritico, notaDeLoCritico, notaDeTareasMarcadas, nucleoDeLaFicha } from "./salida.ts";
import { leerProceso, MARCA_DEL_RESULTADO, revisarProceso, type Paso } from "./formato.ts";
import { consultaParaOSV, DIRECCION_DE_OSV, esArchivoDePaquetes, lineasDeVulnerables, paquetesDe, vulnerablesSegunOSV, type ArchivoLeido } from "./vulnerabilidades.ts";

/**
 * Correr un proceso de una línea: sus pasos `comando`, `salud` y `push`, en
 * orden, sin shell y con tope. El push empuja solo la rama del proceso, sin
 * `--force` y nunca a una protegida, y abre el PR con `gh` o `glab` por su
 * ruta exacta. Si un paso falla, se corren los `deshacer` de lo ya hecho, del
 * último al primero (un push no se deshace). Al llegar a un paso que todavía
 * no corre (ci, aprobacion, tarea) se detiene ahí.
 *
 * Lo corre el código, con su clic: nunca un modelo. Antes de empezar se
 * revisa todo: que no haya otra ejecución ni una corrida en esa línea, que la
 * raíz no tenga cambios sin commit (fuera de `factory/`), que el proceso
 * tenga commit y esté igual que en él, que no sea un borrador ni tenga
 * problemas, que la raíz esté en su rama y que estén sus claves. Lo que corre
 * es lo que tiene commit.
 *
 * Queda una línea en el registro del repositorio
 * (`factory/procesos/registro/AAAA-MM.md`) y la salida entera en
 * `datos/procesos/<linea>/`, fuera del repositorio. Las claves
 * (`FACTORIA_PROCESO_*`) llegan solo al paso que las nombra y van tapadas en
 * todo lo que se guarda. Solo para el servidor.
 */

const carpetaDeEjecuciones = (linea: string) => path.join(carpetaDeLaFabrica(), "procesos", linea);
const registroDeLaRaiz = (raiz: string) => path.join(raiz, "factory", "procesos", "registro");

type Decision = "aprobar" | "rechazar" | "detener" | "tiempo";
/** `responder`: mientras espera su clic, cómo se le contesta. */
/**
 * `fusionado`: lo que dejó el paso `fusion` en esta ejecución, la base y el commit que quedó en
 * ella (`null` si no se supo). Un `[ci]` después de la fusión espera el pipeline de ese commit.
 */
type EnMarcha = { e: Ejecucion; hijo: ChildProcess | null; detener: boolean; termina: Promise<void>; responder?: (d: Decision) => void; fusionado?: { base: string; commit: string | null } };
let enMarcha: EnMarcha | null = null;

/**
 * Cada cuánto se vuelve a mirar: la salud, la integración continua, y cuánto se espera a que
 * aparezca alguna antes de decir que el proyecto no la tiene.
 */
const ritmo = { saludMs: SALUD_CADA_MS, ciMs: 15_000, ciSinMs: 2 * 60_000, aprobacionMs: ESPERA_DE_SU_CLIC_MS };
/** Solo para las pruebas: mirar más seguido, para no esperar minutos. */
export function cambiarRitmo(r: Partial<typeof ritmo>): void {
  Object.assign(ritmo, r);
}

function git(args: string[], cwd: string): Promise<{ codigo: number; stdout: string }> {
  return new Promise((listo) => {
    execFile("git", args, { cwd, timeout: 60_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => listo({ codigo: err ? 1 : 0, stdout: String(stdout) }));
  });
}

// ---- Cómo se lanza un programa sin shell ---------------------------------------------------------

const ARG_PELIGROSO_EN_CMD = /["%^&|<>!]/;

/** Busca un programa como lo haría Windows: en la raíz si es una ruta, si no en el PATH, con las extensiones de PATHEXT. */
async function encontrarEnWindows(programa: string, raiz: string, env: Record<string, string>): Promise<string | null> {
  const exts = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  const conExt = path.extname(programa) ? [""] : ["", ...exts];
  const dirs = /[\\/]/.test(programa) ? [raiz] : [raiz, ...(env.PATH ?? env.Path ?? "").split(";").filter(Boolean)];
  for (const d of dirs)
    for (const e of conExt) {
      const ruta = path.resolve(d, programa + e);
      const es = await fs.stat(ruta).then((s) => s.isFile(), () => false);
      if (es) return ruta;
    }
  return null;
}

/**
 * Con qué programa y qué argumentos se lanza un comando, sin shell. En Windows, un `.cmd` o un
 * `.bat` va con `cmd /d /c` (y no acepta argumentos que cmd interpretaría), un `.ps1` con PowerShell
 * y un `.sh` con el `sh` del PATH. Lanza si no se puede.
 */
export async function lanzamiento(args: readonly string[], raiz: string, env: Record<string, string>, plataforma: NodeJS.Platform = process.platform): Promise<{ programa: string; args: string[]; tal_cual?: boolean }> {
  const [programa, ...resto] = args;
  if (!programa) throw new Error("El comando está vacío.");
  if (plataforma !== "win32") return { programa: /[\\/]/.test(programa) ? path.resolve(raiz, programa) : programa, args: [...resto] };
  const ruta = (await encontrarEnWindows(programa, raiz, env)) ?? programa;
  const ext = path.extname(ruta).toLowerCase();
  if (ext === ".cmd" || ext === ".bat") {
    const malo = [ruta, ...resto].find((a) => ARG_PELIGROSO_EN_CMD.test(a));
    if (malo !== undefined) throw new Error(`Un ${ext} corre con cmd, que interpretaría «${malo.slice(0, 30)}»: ponlo en un script.`);
    // Toda la línea entre comillas y con /s: cmd quita solo esas dos, y cada argumento queda como va.
    const citar = (a: string) => (a === "" || /\s/.test(a) ? `"${a}"` : a);
    return { programa: "cmd.exe", args: ["/d", "/s", "/c", `"${[ruta, ...resto].map(citar).join(" ")}"`], tal_cual: true };
  }
  if (ext === ".ps1") return { programa: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-File", ruta, ...resto] };
  if (ext === ".sh") return { programa: "sh", args: [ruta, ...resto] };
  return { programa: ruta, args: [...resto] };
}

// ---- Antes de empezar ------------------------------------------------------------------------------

type Preparada = { raiz: string; linea: string; proceso: ReturnType<typeof leerProceso>; huella: string; commit: string; marcas: Marcas; claves: Record<string, Record<string, string>> };

/** La huella del texto de un proceso: si cambia, es otra versión, que tiene que pasar entera otra vez. */
const huellaDelProceso = (texto: string) => createHash("sha256").update(texto.replace(/\r\n?/g, "\n")).digest("hex").slice(0, 16);

/** Todo lo que tiene que estar bien antes de correr un solo paso. Lanza con lo que falta, dicho para él. */
async function preparar(lineaId: string, procesoId: string, env: Record<string, string | undefined>, origen: Origen = "a-mano"): Promise<Preparada> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(procesoId)) throw new Error("Ese no es el nombre de un proceso.");
  if (enMarcha) throw new Error(`Ya está corriendo ${enMarcha.e.nombre || enMarcha.e.proceso}: espera a que termine o detenlo.`);
  const linea = lineaPorId(await lineasDeLaFabrica(), lineaId);
  const raiz = linea.raiz;
  const c = await corridaActual();
  if (c?.estado === "corriendo" && mismaRaiz(c.proyecto, raiz)) throw new Error(`Hay una corrida de la fábrica trabajando en ${linea.nombre}: espera a que termine.`);
  if ((await git(["rev-parse", "--is-inside-work-tree"], raiz)).codigo !== 0) throw new Error(`${linea.nombre} no es un repositorio git: un proceso corre lo que tiene commit.`);

  const archivo = `factory/procesos/${procesoId}.md`;
  const sucio = (await git(["status", "--porcelain", "--untracked-files=all", "--", ".", ":(exclude)factory"], raiz)).stdout.trim();
  if (sucio) throw new Error(`La raíz de ${linea.nombre} tiene cambios sin commit (${sucio.split("\n").length}): un proceso corre lo que tiene commit. Haz commit o guárdalos antes.`);
  const delArchivo = (await git(["status", "--porcelain", "--", archivo], raiz)).stdout.trim();
  if (delArchivo) throw new Error(`${archivo} tiene cambios sin commit: haz commit para que corra lo que ves.`);
  const enCommit = await git(["show", `HEAD:${archivo}`], raiz);
  if (enCommit.codigo !== 0) throw new Error(`${archivo} no tiene commit: haz commit para poder correrlo.`);

  const texto = enCommit.stdout;
  const problemas = revisarProceso(texto, `${procesoId}.md`);
  if (problemas.length) throw new Error(`El proceso no cumple el formato (${problemas.length} ${problemas.length === 1 ? "problema" : "problemas"}): corrígelo antes de correrlo.`);
  const proceso = leerProceso(texto);
  if (origen === "al-integrar" && proceso.cuando !== "al-integrar") throw new Error(`Ya no dice «cuando: al-integrar» (dice «${proceso.cuando}»): no arranca solo.`);
  if (origen === "periodico" && !CADA_CUANTO_MS[proceso.cuando]) throw new Error(`Ya no dice «cuando: cada-dia» ni «cada-semana» (dice «${proceso.cuando}»): no corre solo.`);
  if (proceso.borrador) throw new Error("Es un borrador: cambia sus comandos por los de este proyecto y quítale «borrador: si».");
  if (proceso.rama) {
    const actual = (await git(["branch", "--show-current"], raiz)).stdout.trim();
    if (actual !== proceso.rama) throw new Error(`La raíz está en ${actual || "ninguna rama"} y el proceso publica ${proceso.rama}: cámbiala de rama antes de correrlo.`);
  }
  const commit = (await git(["rev-parse", "HEAD"], raiz)).stdout.trim();

  // Las claves: solo se dice cuáles faltan, por su nombre. Su valor no sale de aquí.
  const claves: Record<string, Record<string, string>> = {};
  const faltan: string[] = [];
  for (const p of proceso.pasos.filter((x) => x.tipo === "comando" || x.tipo === "evaluacion")) {
    for (const nombre of p.claves) {
      const variable = variableDeClave(lineaId, nombre);
      const valor = env[variable];
      if (!valor) faltan.push(variable);
      else (claves[String(p.linea)] ??= {})[nombre] = valor;
    }
  }
  if (faltan.length) throw new Error(`Falta en .env.local ${[...new Set(faltan)].join(", ")}. Agrégala a mano y reinicia la aplicación.`);
  // Solo, no arranca lo que no va a poder: queda registrado con su motivo. A mano corre igual, porque
  // la pantalla ya lo avisó (un push sin `gh` empuja igual, aunque el PR no se abra).
  if (origen !== "a-mano") {
    const no = loQueNoVaAPoder(proceso.pasos, { linea: lineaId, remoto: await remotoDe(raiz), entorno: env });
    if (no.length) throw new Error(`no va a poder correr en este equipo. ${no.join(" ")}`);
  }

  const registro = await fs.readdir(registroDeLaRaiz(raiz)).catch(() => [] as string[]);
  const textos = await Promise.all(registro.filter((n) => n.endsWith(".md")).map((n) => fs.readFile(path.join(registroDeLaRaiz(raiz), n), "utf8")));
  return { raiz, linea: lineaId, proceso, huella: huellaDelProceso(texto), commit, marcas: { commit, anterior: anteriorEnElRegistro(textos, procesoId), rama: proceso.rama }, claves };
}

/** La dirección del remoto de la línea, o `null` si no tiene. */
async function remotoDe(raiz: string): Promise<string | null> {
  const r = await git(["remote", "get-url", REMOTO], raiz);
  return r.codigo === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

/** De cada proceso de la línea, lo que no va a poder correr en este equipo: para avisarlo antes. */
export async function avisosDeLosProcesos(lineaId: string, env: Record<string, string | undefined> = process.env): Promise<Record<string, string[]>> {
  const raiz = lineaPorId(await lineasDeLaFabrica(), lineaId).raiz;
  const procesos = (await procesosDe(raiz)).procesos.filter((p) => p.id);
  if (!procesos.length) return {};
  const remoto = await remotoDe(raiz);
  const out: Record<string, string[]> = {};
  for (const p of procesos) {
    const no = loQueNoVaAPoder(p.pasos, { linea: lineaId, remoto, entorno: env });
    if (no.length) out[p.id] = no;
  }
  return out;
}

// ---- Correr --------------------------------------------------------------------------------------

/**
 * El id de una ejecución nueva que no pisa otra: si en ese segundo ya corrió el mismo proceso, el
 * segundo siguiente. Sigue ordenando por fecha, y la historia (los puntajes, `{anterior}`) no se pierde.
 */
async function idLibre(linea: string, ahora: Date, proceso: string): Promise<string> {
  for (let s = 0; ; s++) {
    const id = idDeEjecucion(new Date(ahora.getTime() + s * 1000), proceso);
    const ocupado = await fs.access(path.join(carpetaDeEjecuciones(linea), `${id}.json`)).then(() => true, () => false);
    if (!ocupado) return id;
  }
}

async function guardar(e: Ejecucion): Promise<void> {
  await fs.mkdir(carpetaDeEjecuciones(e.linea), { recursive: true });
  await fs.writeFile(path.join(carpetaDeEjecuciones(e.linea), `${e.id}.json`), JSON.stringify(e, null, 2));
}

async function alLog(e: Ejecucion, texto: string): Promise<void> {
  await fs.mkdir(carpetaDeEjecuciones(e.linea), { recursive: true });
  await fs.appendFile(path.join(carpetaDeEjecuciones(e.linea), `${e.id}.log`), texto);
}

/** Corre un comando ya armado. Devuelve su código (`null` si pasó el tope o se detuvo) y su salida, tapada. */
async function correrComando(m: EnMarcha, args: string[], o: { raiz: string; env: Record<string, string>; topeS: number; secretos: string[] }): Promise<{ codigo: number | null; salida: string; nota: string }> {
  const l = await lanzamiento(args, o.raiz, o.env);
  const r = await new Promise<{ codigo: number | null; todo: string; nota: string }>((listo) => {
    // Se tapa al final, con todo junto: una clave podría llegar partida en dos trozos.
    let todo = "";
    let nota = "";
    // En Mac y Linux, como cabeza de su grupo: así cerrarlo cierra también lo que él lance.
    const hijo = spawn(l.programa, l.args, { cwd: o.raiz, env: o.env as NodeJS.ProcessEnv, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32", windowsVerbatimArguments: l.tal_cual === true });
    m.hijo = hijo;
    // Si se pidió detenerlo mientras se lanzaba, se corta ya.
    if (m.detener && hijo.pid) cerrarProceso(hijo.pid);
    const tope = setTimeout(() => {
      nota = `Pasó su tope de ${o.topeS} segundos: se cortó.`;
      if (hijo.pid) cerrarProceso(hijo.pid);
      else hijo.kill();
    }, o.topeS * 1000);
    const juntar = (b: Buffer) => {
      if (todo.length < SALIDA_MAXIMA) todo += b.toString("utf8");
    };
    hijo.stdout.on("data", juntar);
    hijo.stderr.on("data", juntar);
    hijo.on("error", (err) => {
      clearTimeout(tope);
      m.hijo = null;
      listo({ codigo: -1, todo, nota: `No se pudo lanzar: ${err.message}` });
    });
    hijo.on("close", (codigo) => {
      clearTimeout(tope);
      m.hijo = null;
      listo({ codigo: m.detener || nota ? null : codigo, todo, nota: m.detener ? "Se detuvo a mano." : nota });
    });
  });
  const todo = tapar(r.todo, o.secretos);
  await alLog(m.e, `${todo}${r.todo.length >= SALIDA_MAXIMA ? "\n[…la salida siguió: se guardó hasta aquí]\n" : ""}`);
  return { codigo: r.codigo, salida: todo.slice(-COLA_DE_SALIDA), nota: tapar(r.nota, o.secretos) };
}

/** Lo más que se guarda de la salida de un paso. */
const SALIDA_MAXIMA = 2 * 1024 * 1024;

/** Mira la salud hasta que conteste lo esperado o pase el tope. No manda nada: solo pide la dirección. */
async function mirarSalud(m: EnMarcha, p: Paso, topeS: number): Promise<{ ok: boolean; salida: string; nota: string }> {
  const s = p.salud!;
  const hasta = Date.now() + topeS * 1000;
  let ultimo = "";
  for (;;) {
    if (m.detener) return { ok: false, salida: ultimo, nota: "Se detuvo a mano." };
    try {
      const r = await fetch(s.url, { method: s.metodo, redirect: "manual", signal: AbortSignal.timeout(Math.max(1000, Math.min(10_000, hasta - Date.now()))) });
      ultimo = `${s.metodo} ${s.url} → ${r.status}`;
      if (r.status === s.codigo) return { ok: true, salida: ultimo, nota: "" };
    } catch (err) {
      ultimo = `${s.metodo} ${s.url} → no contestó (${err instanceof Error ? err.message.slice(0, 120) : "error"})`;
    }
    if (Date.now() + ritmo.saludMs > hasta) return { ok: false, salida: ultimo, nota: `No contestó ${s.codigo} antes de su tope de ${topeS} segundos.` };
    await new Promise((r) => setTimeout(r, ritmo.saludMs));
  }
}

const encabezado = (p: { linea: number; tipo: string; texto: string }, que = "") => `\n== línea ${p.linea} · ${p.tipo}${que} · ${p.texto} ==\n`;

/** Las carpetas que el vigía no mira: dependencias instaladas, compilados, la fábrica. */
const SIN_PAQUETES_DEL_PROYECTO = new Set(["node_modules", ".git", "bin", "obj", "dist", "build", "out", ".next", "target", ".venv", "venv", "__pycache__", "packages", "factory"]);
const ARCHIVO_DE_PAQUETES_MAX = 20 * 1024 * 1024;

/** Los archivos de paquetes de la raíz y de sus carpetas de primer nivel. La raíz está igual que en su commit. */
async function archivosDePaquetes(raiz: string): Promise<ArchivoLeido[]> {
  const out: ArchivoLeido[] = [];
  const leerDe = async (rel: string) => {
    for (const ent of await fs.readdir(path.join(raiz, rel), { withFileTypes: true }).catch(() => [])) {
      const ruta = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isFile() && esArchivoDePaquetes(ent.name)) {
        const tam = (await fs.stat(path.join(raiz, ruta))).size;
        if (tam <= ARCHIVO_DE_PAQUETES_MAX) out.push({ ruta, contenido: await fs.readFile(path.join(raiz, ruta), "utf8") });
      } else if (ent.isDirectory() && !rel && !SIN_PAQUETES_DEL_PROYECTO.has(ent.name.toLowerCase())) await leerDe(ent.name);
    }
  };
  await leerDe("");
  return out;
}

/**
 * El paso vulnerabilidades: las versiones exactas de los paquetes del proyecto, preguntadas a
 * OSV.dev. Solo salen nombres, versiones y su ecosistema, de paquetes públicos (`consultaParaOSV`):
 * lo decidió él el 26 de octubre de 2026. Si alguno tiene una vulnerabilidad conocida, el paso falla
 * y dice cuáles; con `si falla: tarea`, queda el pedido de actualizarlos en la Bandeja.
 */
async function revisarVulnerabilidades(prep: Preparada, topeS: number): Promise<{ ok: boolean; salida: string; nota: string }> {
  const { paquetes, fuera } = paquetesDe(await archivosDePaquetes(prep.raiz));
  const dejados = fuera.length ? ` No se preguntaron los paquetes ${fuera.join(", ")}.` : "";
  if (!paquetes.length) return { ok: true, salida: "", nota: `No encontró paquetes con versión exacta que revisar (package-lock.json, un .csproj o un requirements.txt con ==).${dejados}` };
  let respuesta: unknown;
  try {
    const r = await fetch(DIRECCION_DE_OSV, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(consultaParaOSV(paquetes)), signal: AbortSignal.timeout(topeS * 1000) });
    if (!r.ok) return { ok: false, salida: "", nota: `OSV.dev contestó ${r.status}: no se pudo revisar.` };
    respuesta = await r.json();
  } catch (err) {
    return { ok: false, salida: "", nota: `OSV.dev no contestó (${err instanceof Error ? err.message.slice(0, 120) : "error"}): no se pudo revisar.` };
  }
  const vulnerables = vulnerablesSegunOSV(paquetes, respuesta);
  if (!vulnerables) return { ok: false, salida: "", nota: "OSV.dev contestó algo que no se entiende: no se pudo revisar." };
  if (!vulnerables.length) return { ok: true, salida: "", nota: `Revisó ${paquetes.length} ${paquetes.length === 1 ? "paquete" : "paquetes"} en OSV.dev: ninguno tiene vulnerabilidades conocidas.${dejados}` };
  return {
    ok: false,
    salida: lineasDeVulnerables(vulnerables).join("\n"),
    nota: `${vulnerables.length} de ${paquetes.length} paquetes tienen vulnerabilidades conocidas: ${vulnerables.slice(0, 8).map((v) => `${v.paquete.nombre} ${v.paquete.version}`).join(", ")}${vulnerables.length > 8 ? " y otros" : ""}.${dejados}`,
  };
}

/**
 * El paso evaluacion: corre el comando como un paso comando (sin shell, con tope, sin las claves de
 * la aplicación y con las suyas) y lee su resultado del archivo que le da la aplicación, fuera del
 * repositorio (`{resultado}` y `FABRICA_RESULTADO`). Del archivo se toman solo tres números, y el
 * archivo se borra al leerlo. Pasa si el puntaje no queda bajo el umbral ni baja más que la
 * tolerancia respecto de la última vez que este proceso midió uno. Lo que dijo el comando queda
 * solo en el log: puede traer lo que contestó un modelo.
 */
async function correrEvaluacion(m: EnMarcha, p: Paso, prep: Preparada, o: { env: Record<string, string>; topeS: number; secretos: string[] }): Promise<{ ok: boolean; salida: string; nota: string; evaluacion?: EvaluacionHecha }> {
  const archivo = path.join(carpetaDeEjecuciones(prep.linea), `${m.e.id}.resultado.json`);
  await fs.mkdir(path.dirname(archivo), { recursive: true });
  await fs.rm(archivo, { force: true });
  let args: string[];
  try {
    args = conMarcas(partirComando(p.texto).map((a) => a.replaceAll(MARCA_DEL_RESULTADO, archivo)), prep.marcas);
  } catch (err) {
    return { ok: false, salida: "", nota: `No corrió: ${err instanceof Error ? err.message : String(err)}` };
  }
  const r = await correrComando(m, args, { raiz: prep.raiz, env: { ...o.env, FABRICA_RESULTADO: archivo }, topeS: o.topeS, secretos: o.secretos }).catch((err: unknown) => ({ codigo: -1, salida: "", nota: err instanceof Error ? err.message : String(err) }));
  try {
    // Si el comando falló, lo último que dijo ayuda a ver por qué; si no, no se muestra.
    if (r.codigo !== 0) return { ok: false, salida: r.salida, nota: r.nota || `El comando terminó con el código ${r.codigo}: no midió.` };
    const tam = await fs.stat(archivo).then((s) => s.size, () => null);
    if (tam === null) return { ok: false, salida: "", nota: "El comando terminó, pero no dejó su resultado: escríbelo en {resultado} (o en FABRICA_RESULTADO)." };
    if (tam > RESULTADO_MAXIMO_BYTES) return { ok: false, salida: "", nota: `El resultado pesa ${tam} bytes: lleva solo puntaje, casos y fallidos.` };
    const leido = leerResultadoDeEvaluacion(await fs.readFile(archivo, "utf8"));
    if ("problema" in leido) return { ok: false, salida: "", nota: `${leido.problema} Va así: { "puntaje": 0..1, "casos": n, "fallidos": n }.` };
    const anterior = ultimaEvaluacion(await ejecucionesDe(prep.linea, prep.proceso.id));
    const juicio = juzgarEvaluacion(leido, { umbral: p.umbral, tolerancia: p.tolerancia }, anterior);
    return { ok: juicio.ok, salida: "", nota: juicio.nota, evaluacion: { ...leido, anterior: anterior?.puntaje ?? null } };
  } finally {
    await fs.rm(archivo, { force: true }).catch(() => undefined);
  }
}

/** `gh` o `glab`, según el remoto, y su ruta exacta si está en `.env.local`. */
function herramienta(urlDelRemoto: string, rutas: Record<string, string | undefined>) {
  const h = herramientaDePR(urlDelRemoto.trim());
  const variable = variableDeHerramienta(h);
  return { h, variable, bin: rutas[variable]?.trim() || null };
}

/**
 * Espera la integración continua del commit con que empezó el proceso: la lee con `gh` o `glab`
 * (solo lee) cada tanto, hasta que pasa, falla o se acaba el tope. Si en un rato no aparece
 * ninguna, el proyecto no la tiene para ese commit, y se dice. Sin la ruta de la herramienta no
 * se puede leer: el paso falla, porque lo que sigue no puede darla por buena.
 */
async function esperarCI(m: EnMarcha, prep: Preparada, o: { env: Record<string, string>; topeS: number; secretos: string[]; rutas: Record<string, string | undefined> }): Promise<{ ok: boolean; salida: string; nota: string }> {
  // Después de una fusión en esta misma ejecución, la que importa es la del commit que quedó en la
  // base: en GitLab, la que despliega donde `main` despliega.
  if (m.fusionado && !m.fusionado.commit) return { ok: false, salida: "", nota: `No se supo qué commit quedó en ${m.fusionado.base} al fusionar: mira su pipeline en el servicio.` };
  const commit = m.fusionado?.commit ?? prep.commit;
  const cual = m.fusionado ? ` de ${m.fusionado.base}` : "";
  const remoto = await git(["remote", "get-url", REMOTO], prep.raiz);
  if (remoto.codigo !== 0) return { ok: false, salida: "", nota: `La línea no tiene un remoto «${REMOTO}»: no hay integración continua que leer.` };
  const { h, variable, bin } = herramienta(remoto.stdout, o.rutas);
  if (!bin) return { ok: false, salida: "", nota: `No se puede leer la integración continua: falta ${variable} en .env.local, con la ruta exacta de ${h}.` };
  const desde = Date.now();
  const hasta = desde + o.topeS * 1000;
  let ultimo: EstadoDeLaCI | null = null;
  let errores = 0;
  for (;;) {
    if (m.detener) return { ok: false, salida: ultimo?.detalle ?? "", nota: "Se detuvo a mano." };
    const r = await correrComando(m, [bin, ...argumentosDeLaCI(h, commit)], { raiz: prep.raiz, env: o.env, topeS: 60, secretos: o.secretos }).catch((err: unknown) => ({ codigo: -1, salida: "", nota: err instanceof Error ? err.message : String(err) }));
    const leido = r.codigo === 0 ? estadoDeLaCI(h, r.salida) : null;
    if (!leido) {
      // Tres seguidas sin poder leerla: algo está mal con la herramienta o su sesión, no con la CI.
      if (++errores >= 3) return { ok: false, salida: r.salida.slice(-COLA_DE_SALIDA), nota: `${h} no pudo leer la integración continua${r.nota ? `: ${r.nota}` : r.codigo !== null && r.codigo !== 0 ? ` (código ${r.codigo})` : ""}.` };
    } else {
      errores = 0;
      ultimo = leido;
      const enlace = leido.url ? ` ${leido.url}` : "";
      if (leido.estado === "bien") return { ok: true, salida: leido.detalle, nota: `La integración continua${cual} pasó.${enlace}` };
      if (leido.estado === "mal") return { ok: false, salida: leido.detalle, nota: `La integración continua${cual} no pasó: ${leido.detalle}${enlace}` };
      if (leido.estado === "sin" && Date.now() - desde >= Math.min(ritmo.ciSinMs, o.topeS * 1000)) return { ok: false, salida: leido.detalle, nota: `No apareció ninguna integración continua${cual} para el commit ${commit.slice(0, 10)} en ${Math.round(Math.min(ritmo.ciSinMs, o.topeS * 1000) / 1000)} segundos: ¿el proyecto la tiene, y el commit llegó al remoto?` };
    }
    if (Date.now() + ritmo.ciMs > hasta) return { ok: false, salida: ultimo?.detalle ?? "", nota: `La integración continua${cual} no terminó antes de su tope de ${o.topeS} segundos.${ultimo ? ` ${ultimo.detalle}` : ""}` };
    await new Promise((res) => setTimeout(res, ritmo.ciMs));
  }
}

/**
 * El push de un proceso: empuja a `origin` el commit con que empezó, a su rama, sin `--force` y
 * nunca a una protegida (la guardia va aquí también, aunque el revisor ya la mire). Si el remoto
 * avanzó, no se fuerza: el paso falla y lo dice. Si el paso pide PR, lo abre con `gh` o `glab` por
 * su ruta exacta; sin esa ruta, empuja igual y dice que el PR no se abrió.
 */
async function empujar(m: EnMarcha, p: Paso, prep: Preparada, o: { env: Record<string, string>; topeS: number; secretos: string[]; rutas: Record<string, string | undefined> }): Promise<{ ok: boolean; salida: string; nota: string }> {
  const rama = prep.proceso.rama;
  if (!rama || esRamaProtegida(rama)) return { ok: false, salida: "", nota: `La fábrica nunca empuja a ${rama || "una rama sin nombre"}.` };
  const remoto = await git(["remote", "get-url", REMOTO], prep.raiz);
  if (remoto.codigo !== 0) return { ok: false, salida: "", nota: `La línea no tiene un remoto «${REMOTO}»: no hay adónde empujar.` };
  // Sin pedir usuario ni contraseña en una terminal que nadie mira: usa las credenciales que ya tiene git.
  const env = { ...o.env, GIT_TERMINAL_PROMPT: "0" };
  const push = await correrComando(m, ["git", "push", "--porcelain", REMOTO, `${prep.commit}:refs/heads/${rama}`], { raiz: prep.raiz, env, topeS: o.topeS, secretos: o.secretos });
  if (push.codigo !== 0) {
    const nota = push.nota && push.codigo === null ? push.nota : rechazoPorAvance(push.salida) ? `${REMOTO}/${rama} tiene commits que esta rama no tiene: no se fuerza. Trae esos cambios a la raíz y vuelve a correrlo.` : `El push falló${push.codigo !== null ? ` con el código ${push.codigo}` : ""}.`;
    return { ok: false, salida: push.salida, nota };
  }
  if (!p.prContra) return { ok: true, salida: push.salida, nota: `Empujó ${rama} a ${REMOTO}.` };

  const { h, variable, bin } = herramienta(remoto.stdout, o.rutas);
  if (!bin) return { ok: true, salida: push.salida, nota: `Empujó ${rama} a ${REMOTO}. El PR no se abrió: falta ${variable} en .env.local, con la ruta exacta de ${h}.` };
  // El cuerpo lo arma el código: si se fusiona solo, y lo que escribió el agente de las notas de cada tarea que entra.
  const seFusionaSolo = prep.proceso.pasos.some((x) => x.tipo === "fusion");
  const tareas = await tareasParaLaFusion(prep, o.secretos);
  const cuerpo = cuerpoDelPR({ proceso: prep.proceso.id, commit: prep.commit, seFusionaSolo, tareas });
  // De varias líneas, va en un archivo junto al log, fuera del repositorio: un .cmd lo cortaría.
  let cuerpoEn: string | undefined;
  if (cuerpo.includes("\n")) {
    cuerpoEn = path.join(carpetaDeEjecuciones(prep.linea), `${m.e.id}.cuerpo-del-pr.md`);
    await fs.mkdir(path.dirname(cuerpoEn), { recursive: true });
    await fs.writeFile(cuerpoEn, cuerpo);
  }
  const args = argumentosDelPR(h, { rama, base: p.prContra, titulo: `${prep.proceso.nombre || prep.proceso.id}: ${rama} a ${p.prContra}`, cuerpo, cuerpoEn });
  const pr = await correrComando(m, [bin, ...args], { raiz: prep.raiz, env, topeS: 60, secretos: o.secretos }).catch((err: unknown) => ({ codigo: -1, salida: "", nota: err instanceof Error ? err.message : String(err) }));
  const url = direccionEn(pr.salida);
  if (pr.codigo === 0) return { ok: true, salida: `${push.salida}\n${pr.salida}`.trim(), nota: `Empujó ${rama} y abrió el PR contra ${p.prContra}${url ? `: ${url}` : "."}` };
  if (yaHabiaPR(pr.salida)) {
    const ya = `Empujó ${rama}; ya había un PR abierto de ${rama} contra ${p.prContra}${url ? `: ${url}` : "."}`;
    // Ya abierto: si entra algo de una tarea o se fusiona solo, su cuerpo se pone al día. Si no se puede, el push sigue valiendo.
    if (!tareas.length && !seFusionaSolo) return { ok: true, salida: `${push.salida}\n${pr.salida}`.trim(), nota: ya };
    const ed = await correrComando(m, [bin, ...argumentosDeEditarPR(h, rama, cuerpo, cuerpoEn)], { raiz: prep.raiz, env, topeS: 60, secretos: o.secretos }).catch(() => ({ codigo: -1, salida: "", nota: "" }));
    return { ok: true, salida: `${push.salida}\n${pr.salida}`.trim(), nota: `${ya}${ed.codigo === 0 ? " Su descripción quedó al día." : " Su descripción no se pudo poner al día."}` };
  }
  return { ok: false, salida: `${push.salida}\n${pr.salida}`.trim(), nota: `Empujó ${rama}, pero ${h} no pudo abrir el PR${pr.nota ? `: ${pr.nota}` : pr.codigo !== null ? ` (código ${pr.codigo})` : ""}.` };
}

async function correrLosPasos(m: EnMarcha, prep: Preparada, env: Record<string, string | undefined>): Promise<void> {
  const e = m.e;
  const secretos = secretosDelEntorno(env);
  const base = entornoDelProyecto(env);
  const hechos: { paso: Paso; i: number }[] = [];
  let noAprobado = false;
  const pasos = prep.proceso.pasos;
  for (const [i, p] of pasos.entries()) {
    const visto = e.pasos[i]!;
    if (m.detener) break;
    if (!(TIPOS_QUE_CORREN as readonly string[]).includes(p.tipo)) {
      e.estado = "llego";
      e.paradoEn = { linea: p.linea, tipo: p.tipo };
      for (const resto of e.pasos.slice(i)) resto.estado = "sin-correr";
      break;
    }
    visto.estado = "corriendo";
    await guardar(e);
    await alLog(e, encabezado(p));
    const desde = Date.now();
    const topeS = p.tope ?? TOPE_POR_DEFECTO[p.tipo]!;
    let ok: boolean;
    if (p.tipo === "comando") {
      let args: string[];
      try {
        args = conMarcas(partirComando(p.texto), prep.marcas);
      } catch (err) {
        visto.nota = err instanceof Error ? err.message : String(err);
        visto.estado = "fallo";
        visto.ms = 0;
        ok = false;
        e.motivo = `La línea ${p.linea} no corrió: ${visto.nota}`;
        break;
      }
      const r = await correrComando(m, args, { raiz: prep.raiz, env: { ...base, ...(prep.claves[String(p.linea)] ?? {}) }, topeS, secretos }).catch((err: unknown) => ({ codigo: -1, salida: "", nota: err instanceof Error ? err.message : String(err) }));
      ok = r.codigo === 0;
      visto.salida = r.salida;
      visto.nota = r.nota || (ok ? "" : `Terminó con el código ${r.codigo}.`);
    } else if (p.tipo === "push") {
      const r = await empujar(m, p, prep, { env: base, topeS, secretos, rutas: env });
      ok = r.ok;
      visto.salida = r.salida;
      visto.nota = r.nota;
    } else if (p.tipo === "aprobacion") {
      const r = await esperarSuClic(m, prep, visto);
      if (m.detener) {
        visto.estado = "sin-correr";
        visto.nota = r.nota;
        break;
      }
      if (r.noAprobado) {
        visto.estado = "no-aprobado";
        visto.nota = r.nota;
        visto.ms = Date.now() - desde;
        noAprobado = true;
        e.motivo = r.nota;
        break;
      }
      ok = r.ok;
      visto.nota = r.nota;
    } else if (p.tipo === "vulnerabilidades") {
      const r = await revisarVulnerabilidades(prep, topeS);
      ok = r.ok;
      visto.salida = r.salida;
      visto.nota = r.nota;
      await alLog(e, `${r.salida}\n`);
    } else if (p.tipo === "evaluacion") {
      const r = await correrEvaluacion(m, p, prep, { env: { ...base, ...(prep.claves[String(p.linea)] ?? {}) }, topeS, secretos });
      ok = r.ok;
      visto.salida = r.salida;
      visto.nota = r.nota;
      if (r.evaluacion) visto.evaluacion = r.evaluacion;
    } else if (p.tipo === "ci") {
      const r = await esperarCI(m, prep, { env: base, topeS, secretos, rutas: env });
      ok = r.ok;
      visto.salida = r.salida;
      visto.nota = r.nota;
    } else if (p.tipo === "fusion") {
      const r = await fusionar(m, p, prep, { env: base, topeS, secretos, rutas: env });
      ok = r.ok;
      visto.salida = r.salida;
      visto.nota = r.nota;
    } else {
      const r = await mirarSalud(m, p, topeS);
      ok = r.ok;
      visto.salida = r.salida;
      visto.nota = r.nota;
      await alLog(e, `${r.salida}\n`);
    }
    visto.ms = Date.now() - desde;
    if (!ok) {
      visto.estado = "fallo";
      if (!m.detener) e.motivo = `Falló la línea ${p.linea} (${p.tipo}): ${visto.nota}`;
      break;
    }
    visto.estado = "ok";
    if (p.tipo === "comando" || p.tipo === "push" || p.tipo === "fusion") hechos.push({ paso: p, i });
    await guardar(e);
  }

  if (noAprobado) {
    // Sin su clic, producción no corre; lo hecho hasta ahí (el entorno de prueba) queda como está.
    e.estado = "detenida";
    for (const v of e.pasos) if (v.estado === "pendiente") v.estado = "sin-correr";
    return;
  }
  if (m.detener) {
    // Detenido a mano: lo hecho queda como está. Él decide si lo deshace.
    e.estado = "detenida";
    e.motivo = `Se detuvo a mano. Lo hecho quedó como está${hechos.length ? `: ${hechos.length} ${hechos.length === 1 ? "paso" : "pasos"} sin deshacer` : ""}.`;
    for (const v of e.pasos) if (v.estado === "pendiente" || v.estado === "corriendo") v.estado = "sin-correr";
    return;
  }
  if (e.pasos.some((v) => v.estado === "fallo")) {
    e.estado = "fallo";
    for (const v of e.pasos) if (v.estado === "pendiente") v.estado = "sin-correr";
    // Se deshace lo hecho, del último al primero.
    for (const { paso, i } of hechos.reverse()) {
      const visto = e.pasos[i]!;
      if (paso.tipo === "push") {
        visto.estado = "no-se-deshace";
        visto.nota = `${visto.nota} Un push no se deshace: la rama queda en el remoto como estaba.`.trim();
        continue;
      }
      if (paso.tipo === "fusion") {
        visto.estado = "no-se-deshace";
        visto.nota = `${visto.nota} Una fusión no se deshace sola: si hace falta, revierte el PR en el servicio.`.trim();
        continue;
      }
      if (paso.deshacer === "") {
        visto.estado = "no-se-deshace";
        visto.nota = "Dice que no cambia nada de afuera (deshacer: —).";
        continue;
      }
      await alLog(e, encabezado(paso, " · deshacer"));
      try {
        const args = conMarcas(partirComando(paso.deshacer ?? ""), prep.marcas);
        const r = await correrComando(m, args, { raiz: prep.raiz, env: { ...base, ...(prep.claves[String(paso.linea)] ?? {}) }, topeS: paso.tope ?? TOPE_POR_DEFECTO.comando!, secretos });
        visto.estado = r.codigo === 0 ? "deshecho" : "no-se-deshizo";
        visto.nota = r.codigo === 0 ? "Deshecho." : `Su deshacer falló: ${r.nota || `terminó con el código ${r.codigo}`}.`;
      } catch (err) {
        visto.estado = "no-se-deshizo";
        visto.nota = `Su deshacer no corrió: ${err instanceof Error ? err.message : String(err)}`;
      }
      await guardar(e);
    }
    return;
  }
  if (e.estado === "corriendo") e.estado = "termino";
}

/**
 * Empieza a correr un proceso de una línea, con su clic. Revisa todo antes y lanza si algo no está;
 * si está, devuelve la ejecución recién empezada y la deja corriendo.
 */
export async function correrProceso(lineaId: string, procesoId: string, env: Record<string, string | undefined> = process.env, origen: Origen = "a-mano"): Promise<Ejecucion> {
  const prep = await preparar(lineaId, procesoId, env, origen);
  const ahora = new Date();
  const e: Ejecucion = {
    id: await idLibre(lineaId, ahora, procesoId),
    linea: lineaId,
    proceso: procesoId,
    nombre: prep.proceso.nombre,
    commit: prep.commit,
    inicio: ahora.toISOString(),
    fin: null,
    estado: "corriendo",
    pasos: prep.proceso.pasos.map((p): PasoEjecutado => ({ linea: p.linea, tipo: p.tipo, texto: p.texto, estado: "pendiente", ms: null, salida: "", nota: "" })),
    paradoEn: null,
    motivo: null,
    origen,
    huella: prep.huella,
  };
  await guardar(e);
  await alLog(e, `Proceso ${procesoId} · commit ${prep.commit} · ${ahora.toISOString()}\n`);
  const m: EnMarcha = { e, hijo: null, detener: false, termina: Promise.resolve() };
  enMarcha = m;
  m.termina = (async () => {
    try {
      await correrLosPasos(m, prep, env);
    } catch (err) {
      e.estado = "fallo";
      e.motivo = `La aplicación no pudo seguir: ${tapar(err instanceof Error ? err.message : String(err), secretosDelEntorno(env))}`;
    }
    // Si falló un paso que pide un pedido, queda en la Bandeja: lo pasa él a una línea, revisado.
    const fallo = e.pasos.find((v) => v.estado === "fallo");
    const pide = fallo && e.estado === "fallo" && prep.proceso.pasos.find((p) => p.linea === fallo.linea)?.siFalla === "tarea";
    if (fallo && pide) {
      try {
        const pedido = pedidoDeLaFalla(e, fallo);
        const id = dejarPedidoDeUnProceso(baseDeDatos(), { ref: refDelPedido(e), linea: e.linea, proceso: e.proceso, titulo: pedido.titulo, texto: tapar(pedido.texto, secretosDelEntorno(env)), ahora: Date.now() });
        e.motivo = `${e.motivo ?? ""} ${id === null ? "Ya había en la Bandeja un pedido abierto de este proceso: no se dejó otro." : "Quedó en la Bandeja el pedido de arreglarlo."}`.trim();
      } catch (err) {
        e.motivo = `${e.motivo ?? ""} No se pudo dejar el pedido en la Bandeja: ${err instanceof Error ? err.message : String(err)}`.trim();
      }
    }
    e.fin = new Date().toISOString();
    await guardar(e).catch(() => {});
    await anotarEnElRegistro(prep.raiz, e);
    enMarcha = null;
  })();
  return structuredClone(e);
}

/** El registro, en el repositorio de la línea: una línea por vez que corrió (o que no pudo empezar). */
async function anotarEnElRegistro(raiz: string, e: Ejecucion): Promise<void> {
  const fin = new Date();
  const mes = `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, "0")}`;
  const archivo = path.join(registroDeLaRaiz(raiz), `${mes}.md`);
  await fs.mkdir(registroDeLaRaiz(raiz), { recursive: true }).catch(() => {});
  const previo = await fs.readFile(archivo, "utf8").catch(() => `# Registro de ${mes}\n\n`);
  await fs.writeFile(archivo, `${previo.replace(/\s*$/, "\n")}${/^- /m.test(previo) ? "" : "\n"}${lineaDeRegistro(e, fin)}\n`).catch(() => {});
}

/** Detiene la ejecución en marcha: corta el paso que corre y no sigue. Lo hecho queda como está. */
export async function detenerProceso(): Promise<Ejecucion | null> {
  const m = enMarcha;
  if (!m) return null;
  m.detener = true;
  m.responder?.("detener");
  if (m.hijo?.pid) cerrarProceso(m.hijo.pid);
  await m.termina;
  return structuredClone(m.e);
}

/** Para las pruebas: espera a que termine la ejecución en marcha. */
export const esperarLaEjecucion = async () => {
  await enMarcha?.termina;
};

/**
 * La ejecución en marcha de esa línea o, si no hay, la última que corrió. Una que quedó
 * «corriendo» sin estar en marcha es de antes de reiniciar la aplicación: se da por detenida.
 */
export async function ultimaEjecucion(lineaId: string): Promise<Ejecucion | null> {
  if (enMarcha?.e.linea === lineaId) return structuredClone(enMarcha.e);
  const dir = carpetaDeEjecuciones(lineaId);
  // Solo las ejecuciones (`AAAAMMDD-HHMMSS-proceso.json`): en la carpeta vive también el estado de «al integrar».
  const nombres = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => /^\d{8}-\d{6}-[a-z0-9-]+\.json$/.test(n)).sort();
  const ultimo = nombres.at(-1);
  if (!ultimo) return null;
  const e = JSON.parse(await fs.readFile(path.join(dir, ultimo), "utf8")) as Ejecucion;
  if (e.estado === "corriendo" || e.estado === "esperando") {
    e.motivo = e.estado === "esperando" ? "La aplicación se cerró mientras esperaba tu clic: lo hecho quedó como está." : "La aplicación se cerró mientras corría: lo hecho quedó como está.";
    e.estado = "detenida";
    e.fin ??= e.inicio;
    await guardar(e).catch(() => {});
  }
  return e;
}

/** Si hay una ejecución en marcha, en cualquier línea. */
export const hayUnaEjecucion = () => enMarcha !== null;

// ---- Su clic para producción --------------------------------------------------------------------

/** Las veces que corrió un proceso de una línea, de la más vieja a la más nueva. */
async function ejecucionesDe(linea: string, proceso: string): Promise<Ejecucion[]> {
  const dir = carpetaDeEjecuciones(linea);
  const nombres = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(`-${proceso}.json`) && /^\d{8}-\d{6}-/.test(n)).sort();
  const out: Ejecucion[] = [];
  for (const n of nombres) {
    const e = await fs
      .readFile(path.join(dir, n), "utf8")
      .then((x) => JSON.parse(x) as Ejecucion)
      .catch(() => null);
    if (e?.proceso === proceso) out.push(e);
  }
  return out;
}

/** Los últimos puntajes de la evaluación de un proceso, del más viejo al más nuevo. Solo números. */
export async function puntajesDelProceso(lineaId: string, procesoId: string): Promise<PuntajeALaVista[]> {
  return puntajesDe(await ejecucionesDe(lineaId, procesoId));
}

/**
 * Por qué ese proceso de esa línea no puede pasar a producción sin su clic, con su versión con
 * commit. Vacío: puede. Lo que no se puede leer también es un motivo.
 */
export async function porQueNoSinClicEn(lineaId: string, procesoId: string): Promise<string[]> {
  const linea = lineaPorId(await lineasDeLaFabrica(), lineaId);
  const enCommit = await git(["show", `HEAD:factory/procesos/${procesoId}.md`], linea.raiz);
  if (enCommit.codigo !== 0) return ["El proceso no tiene commit."];
  return porQueNoSinClic(leerProceso(enCommit.stdout), huellaDelProceso(enCommit.stdout), await ejecucionesDe(lineaId, procesoId));
}

/**
 * Un paso aprobacion: espera su clic. Si él quitó el clic en esta línea y el proceso cumple las
 * condiciones, pasa solo, y lo dice. Si no, la ejecución queda «esperando» (la planta lo
 * muestra; el teléfono suena si él lo pidió) hasta que él apruebe, no apruebe o la detenga, o hasta 12 horas.
 * Al aprobar se mira otra vez la raíz: producción recibe el mismo commit que pasó por prueba.
 */
async function esperarSuClic(m: EnMarcha, prep: Preparada, visto: PasoEjecutado): Promise<{ ok: boolean; nota: string; noAprobado?: boolean }> {
  const e = m.e;
  let antes = "";
  // Lo que toca la base de datos o el núcleo siempre pide su clic, aunque él lo haya quitado; y lo
  // que el agente de salida marcó en una tarea que entra en este commit, también.
  const critico = await loCriticoDelCommit(prep);
  const marcadas = notaDeTareasMarcadas(await tareasQuePidenSuClic(prep));
  if ((await procesosSinClicDe(prep.linea)).includes(prep.proceso.id)) {
    const porQue = [...porQueNoSinClic(prep.proceso, prep.huella, await ejecucionesDe(prep.linea, prep.proceso.id)), ...(critico ? [critico] : []), ...(marcadas ? [marcadas] : [])];
    if (!porQue.length) return { ok: true, nota: "Pasó sin tu clic: lo quitaste en esta línea, y el proceso cumple las condiciones." };
    antes = `Quitaste tu clic, pero ya no cumple: ${porQue.join(" ")} `;
  } else {
    const avisos = [...(critico && prep.marcas.anterior !== null ? [critico] : []), ...(marcadas ? [marcadas] : [])];
    if (avisos.length) antes = `${avisos.join(" ")} `;
  }
  visto.estado = "esperando";
  visto.nota = `${antes}Espera tu clic.`;
  e.estado = "esperando";
  e.esperaDesde = new Date().toISOString();
  await guardar(e);
  if ((await leerAjustes()).llamarSola) void llamar({ motivo: `${e.nombre || e.proceso} espera tu clic para producción`, auto: true, tarea: `proceso:${e.proceso}` }).catch(() => undefined);
  const d = await new Promise<Decision>((listo) => {
    const tope = setTimeout(() => listo("tiempo"), ritmo.aprobacionMs);
    m.responder = (x) => {
      clearTimeout(tope);
      listo(x);
    };
    if (m.detener) m.responder("detener");
  });
  m.responder = undefined;
  e.estado = "corriendo";
  if (d === "detener") return { ok: false, nota: "Se detuvo a mano mientras esperaba tu clic." };
  if (d === "rechazar") return { ok: false, noAprobado: true, nota: "No lo aprobaste: lo hecho hasta aquí quedó como está." };
  if (d === "tiempo") return { ok: false, noAprobado: true, nota: `Nadie lo aprobó en ${Math.round(ritmo.aprobacionMs / 3_600_000) || 1} horas: lo hecho hasta aquí quedó como está.` };
  const head = (await git(["rev-parse", "HEAD"], prep.raiz)).stdout.trim();
  if (head !== prep.commit) return { ok: false, nota: `Lo aprobaste, pero la raíz ya no está en el commit con que empezó (${prep.commit.slice(0, 10)}): producción no recibe otra cosa que la que pasó por prueba. Córrelo de nuevo.` };
  const sucio = (await git(["status", "--porcelain", "--untracked-files=all", "--", ".", ":(exclude)factory"], prep.raiz)).stdout.trim();
  if (sucio) return { ok: false, nota: "Lo aprobaste, pero la raíz tiene cambios sin commit: producción no sigue." };
  return { ok: true, nota: `${antes ? "Lo aprobaste igual" : "Lo aprobaste"} el ${fechaLocal(new Date())}.` };
}

/**
 * Por qué este commit pide su clic para producción por lo que toca, o `null` si no pide: los
 * archivos que cambiaron desde la última salida del proceso (`{anterior}`) que son de la base de
 * datos o del núcleo que él marcó en la ficha de la línea (`salida.ts`). Sin una salida anterior,
 * o si git no puede comparar, no se sabe qué cambió: también pide su clic.
 */
async function loCriticoDelCommit(prep: Preparada): Promise<string | null> {
  if (prep.marcas.anterior === null) return "No hay una salida anterior con qué comparar este commit: no se sabe qué cambió.";
  const diff = await git(["diff", "--name-only", `${prep.marcas.anterior}..${prep.commit}`], prep.raiz);
  if (diff.codigo !== 0) return `No se pudo comparar con la salida anterior (${prep.marcas.anterior.slice(0, 10)}): no se sabe qué cambió.`;
  const rutas = diff.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const ficha = await fs.readFile(path.join(prep.raiz, "factory", "memoria", "ficha.md"), "utf8").catch(() => "");
  return notaDeLoCritico(loCritico(rutas, nucleoDeLaFicha(ficha))) || null;
}

/**
 * Las tareas que el agente de salida marcó con `tu-clic` y que entran en este commit: integradas
 * en él (`integrada` es su antepasado) y no en la salida anterior. Sin el commit de su
 * integración, una tarea no se sabe dónde está y no cuenta.
 */
async function tareasQuePidenSuClic(prep: Preparada): Promise<{ id: string; motivo: string }[]> {
  return (await tareasDelRango(prep)).filter(({ datos }) => datos.salida === "tu-clic").map(({ datos }) => ({ id: datos.id!, motivo: (datos.salida_motivo ?? "").trim() }));
}

/**
 * Las tareas que entran con este commit: integradas en él (`integrada` es su antepasado) y no en la
 * salida anterior. Sin el commit de su integración, una tarea no se sabe dónde está y no cuenta.
 */
async function tareasDelRango(prep: Preparada): Promise<{ datos: Record<string, string>; cuerpo: string }[]> {
  const dir = path.join(prep.raiz, "factory", "tareas");
  const out: { datos: Record<string, string>; cuerpo: string }[] = [];
  for (const n of (await fs.readdir(dir).catch(() => [] as string[])).filter((x) => x.endsWith(".md")).sort()) {
    const { datos, cuerpo } = partir(await fs.readFile(path.join(dir, n), "utf8").catch(() => ""));
    if (!datos.id || !/^[0-9a-f]{7,40}$/i.test(datos.integrada ?? "")) continue;
    const enEste = (await git(["merge-base", "--is-ancestor", datos.integrada!, prep.commit], prep.raiz)).codigo === 0;
    const yaSalio = prep.marcas.anterior !== null && (await git(["merge-base", "--is-ancestor", datos.integrada!, prep.marcas.anterior], prep.raiz)).codigo === 0;
    if (enEste && !yaSalio) out.push({ datos, cuerpo });
  }
  return out;
}

/**
 * Las tareas del rango como las ve la fusión: su clase, si él la probó (su veredicto «aprobada» en
 * `factory/veredictos/`) y lo que escribió el agente de las notas para el PR, con las claves de este equipo tapadas.
 */
async function tareasParaLaFusion(prep: Preparada, secretos: string[]): Promise<TareaDelRango[]> {
  const out: TareaDelRango[] = [];
  for (const { datos, cuerpo } of await tareasDelRango(prep)) {
    const ver = veredictoDesde(await fs.readFile(path.join(prep.raiz, "factory", "veredictos", `${datos.id}.json`), "utf8").catch(() => ""));
    out.push({
      id: datos.id!,
      titulo: datos.titulo ?? datos.id!,
      tituloAjeno: datos.titulo_ajeno === "si",
      clase: datos.integracion_clase === "sencilla" || datos.integracion_clase === "grande" ? datos.integracion_clase : null,
      probada: ver?.veredicto === "aprobada",
      paraElPR: tapar(seccionDe(cuerpo, "Para el PR"), secretos),
    });
  }
  return out;
}

/**
 * La fusión del PR que abrió este proceso (procesos/fusion.ts). Lee el PR con `gh` o `glab`, mira
 * las condiciones y, si se cumplen, se lo pide al servicio con el commit atado. Nada más.
 */
async function fusionar(m: EnMarcha, p: Paso, prep: Preparada, o: { env: Record<string, string>; topeS: number; secretos: string[]; rutas: Record<string, string | undefined> }): Promise<{ ok: boolean; salida: string; nota: string }> {
  const push = prep.proceso.pasos.slice(0, prep.proceso.pasos.indexOf(p)).findLast((x) => x.tipo === "push" && x.prContra);
  const rama = prep.proceso.rama;
  if (!push?.prContra || !rama) return { ok: false, salida: "", nota: "Una fusión va después del push que abre su PR." };
  const remoto = await git(["remote", "get-url", REMOTO], prep.raiz);
  if (remoto.codigo !== 0) return { ok: false, salida: "", nota: `La línea no tiene un remoto «${REMOTO}»: no hay PR que fusionar.` };
  const { h, variable, bin } = herramienta(remoto.stdout, o.rutas);
  if (!bin) return { ok: false, salida: "", nota: `No se puede fusionar: falta ${variable} en .env.local, con la ruta exacta de ${h}.` };
  const visto = await correrComando(m, [bin, ...argumentosDeVerPR(h, rama)], { raiz: prep.raiz, env: o.env, topeS: 60, secretos: o.secretos }).catch((err: unknown) => ({ codigo: -1, salida: "", nota: err instanceof Error ? err.message : String(err) }));
  const pr = visto.codigo === 0 ? leerPR(h, visto.salida) : null;
  const no = porQueNoFusionar({ pr, rama, base: push.prContra, commit: prep.commit, tareas: await tareasParaLaFusion(prep, o.secretos) });
  if (no.length) return { ok: false, salida: visto.salida.slice(-COLA_DE_SALIDA), nota: `No se fusionó: ${no.join(" ")}` };
  const r = await correrComando(m, [bin, ...argumentosDeFusion(h, pr!.numero, p.estilo ?? "merge", prep.commit)], { raiz: prep.raiz, env: o.env, topeS: o.topeS, secretos: o.secretos }).catch((err: unknown) => ({ codigo: -1, salida: "", nota: err instanceof Error ? err.message : String(err) }));
  if (r.codigo !== 0) return { ok: false, salida: r.salida, nota: `${h} no fusionó el PR #${pr!.numero}${r.nota ? `: ${r.nota}` : r.codigo !== null ? ` (código ${r.codigo})` : ""}. Si la rama ${push.prContra} pide una revisión o un check más, eso manda.` };
  // Qué commit quedó en la base: el que dispara su pipeline. Si no se sabe, un `[ci]` después lo dice.
  const leido = await correrComando(m, [bin, ...argumentosDelCommitFusionado(h, pr!.numero)], { raiz: prep.raiz, env: o.env, topeS: 60, secretos: o.secretos }).catch(() => ({ codigo: -1, salida: "", nota: "" }));
  const commit = leido.codigo === 0 ? commitFusionadoDe(h, leido.salida) : null;
  m.fusionado = { base: push.prContra, commit };
  return { ok: true, salida: r.salida, nota: `Fusionó el PR #${pr!.numero} en ${push.prContra}${commit ? ` (commit ${commit.slice(0, 10)})` : ""}${pr!.url ? `: ${pr!.url}` : "."}` };
}

/** Su respuesta al proceso que espera su clic en esa línea. Lo que sigue corre solo. */
export async function responderAprobacion(lineaId: string, d: "aprobar" | "rechazar"): Promise<Ejecucion> {
  const m = enMarcha;
  if (!m || m.e.linea !== lineaId || m.e.estado !== "esperando" || !m.responder) throw new Error("No hay ningún proceso esperando tu clic en esta línea.");
  m.responder(d);
  await new Promise((listo) => setTimeout(listo, 0));
  return structuredClone(m.e);
}

// ---- Arrancar solo al integrar ---------------------------------------------------------------------

type AlIntegrar = { vistas: string[]; cola: string[] };
const archivoAlIntegrar = (linea: string) => path.join(carpetaDeEjecuciones(linea), "al-integrar.json");

/** Al encenderlo: lo integrado hasta ahora no cuenta. La próxima vuelta del vigía parte de cero. */
export const olvidarAlIntegrar = (linea: string) => fs.rm(archivoAlIntegrar(linea), { force: true });

/** Las tareas hechas e integradas de la raíz, como `F-014:<commit>`: una nueva es una tarea que acaba de integrar. */
async function integradasDe(raiz: string): Promise<string[]> {
  const dir = path.join(raiz, "factory", "tareas");
  const nombres = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".md"));
  const out: string[] = [];
  for (const n of nombres) {
    const { datos } = partir(await fs.readFile(path.join(dir, n), "utf8").catch(() => ""));
    if (datos.estado === "hecho" && datos.integrada && datos.id) out.push(`${datos.id}:${datos.integrada}`);
  }
  return out.sort();
}

/**
 * Lo que no llegó a arrancar solo (la raíz con cambios, un borrador, una clave que falta): queda
 * como una ejecución que falló antes de empezar, con su motivo y su línea en el registro, para que
 * él lo vea.
 */
async function registrarQueNoCorrio(linea: { id: string; raiz: string }, proceso: string, motivo: string, origen: Origen = "al-integrar"): Promise<Ejecucion> {
  const ahora = new Date();
  const commit = (await git(["rev-parse", "HEAD"], linea.raiz)).stdout.trim();
  const e: Ejecucion = {
    id: await idLibre(linea.id, ahora, proceso),
    linea: linea.id,
    proceso,
    nombre: proceso,
    commit,
    inicio: ahora.toISOString(),
    fin: ahora.toISOString(),
    estado: "fallo",
    pasos: [],
    paradoEn: null,
    motivo: `${origen === "periodico" ? "No corrió solo, como le tocaba" : "No arrancó solo al integrar"}: ${motivo}`,
    origen,
  };
  await guardar(e);
  await anotarEnElRegistro(linea.raiz, e);
  return e;
}

/**
 * Lo llama el vigía de la fábrica cada tanto. En cada línea con procesos que él encendió para
 * arrancar solos: si una tarea se integró desde la última vez, esos procesos quedan en fila, y se
 * corren de a uno, cuando no corre nada más ni hay una corrida en esa línea. Lo que ya estaba
 * integrado cuando se encendió no cuenta. Devuelve el id de lo que arrancó, si arrancó algo.
 */
export async function arrancarAlIntegrar(env: Record<string, string | undefined> = process.env): Promise<string | null> {
  if (enMarcha) return null;
  const c = await corridaActual();
  for (const linea of await lineasDeLaFabrica()) {
    const solos = await procesosSolosDe(linea.id);
    if (!solos.length) continue;
    if (c?.estado === "corriendo" && mismaRaiz(c.proyecto, linea.raiz)) continue;
    const archivo = archivoAlIntegrar(linea.id);
    const guardado = await fs
      .readFile(archivo, "utf8")
      .then((t) => JSON.parse(t) as AlIntegrar)
      .catch(() => null);
    const integradas = await integradasDe(linea.raiz);
    const escribir = async (a: AlIntegrar) => {
      await fs.mkdir(path.dirname(archivo), { recursive: true });
      await fs.writeFile(archivo, JSON.stringify(a, null, 2));
    };
    if (!guardado || !Array.isArray(guardado.vistas) || !Array.isArray(guardado.cola)) {
      await escribir({ vistas: integradas, cola: [] });
      continue;
    }
    const nuevas = integradas.filter((x) => !guardado.vistas.includes(x));
    const cola = nuevas.length ? [...new Set([...guardado.cola, ...solos])] : guardado.cola;
    // Lo que él apagó mientras esperaba en la fila, ya no corre.
    const [siguiente, ...resto] = cola.filter((p) => solos.includes(p));
    await escribir({ vistas: integradas, cola: resto });
    if (!siguiente) continue;
    try {
      return (await correrProceso(linea.id, siguiente, env, "al-integrar")).id;
    } catch (err) {
      return (await registrarQueNoCorrio(linea, siguiente, err instanceof Error ? err.message : String(err))).id;
    }
  }
  return null;
}

/**
 * Lo llama el vigía de la fábrica cada tanto. Los procesos `cuando: cada-dia` o `cada-semana`
 * que él encendió para correr solos, en cada línea: si la última vez que corrieron (o intentaron)
 * fue hace más que eso, se corren, de a uno, cuando no corre nada más ni hay una corrida en esa
 * línea. Lo que no puede arrancar queda como una ejecución que falló antes de empezar. Devuelve el
 * id de lo que arrancó, si arrancó algo.
 */
export async function arrancarLosPeriodicos(env: Record<string, string | undefined> = process.env, ahora = Date.now()): Promise<string | null> {
  if (enMarcha) return null;
  const c = await corridaActual();
  for (const linea of await lineasDeLaFabrica()) {
    const solos = await procesosSolosDe(linea.id);
    if (!solos.length) continue;
    if (c?.estado === "corriendo" && mismaRaiz(c.proyecto, linea.raiz)) continue;
    for (const p of (await procesosDe(linea.raiz)).procesos) {
      const cada = CADA_CUANTO_MS[p.cuando];
      if (!cada || !solos.includes(p.id)) continue;
      const ultima = (await ejecucionesDe(linea.id, p.id)).at(-1);
      if (ultima && ahora - Date.parse(ultima.inicio) < cada) continue;
      try {
        return (await correrProceso(linea.id, p.id, env, "periodico")).id;
      } catch (err) {
        return (await registrarQueNoCorrio(linea, p.id, err instanceof Error ? err.message : String(err), "periodico")).id;
      }
    }
  }
  return null;
}
