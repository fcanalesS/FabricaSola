// La fábrica de punta a punta, con sesiones de verdad de Claude Code sobre un repo de prueba
// desechable. Lo que las pruebas del mod no alcanzan: ellas no tienen git ni procesos, y aquí se
// corre todo lo que toca git (rama de origen, sincronizar, integrar, limpiar) como en una corrida.
//
//   npm run fabrica:e2e
//   npm run fabrica:e2e -- --dejar      (no borra el repo de prueba al terminar, para mirarlo)
//   npm run fabrica:e2e -- --par        (solo las dos primeras tareas, F-001 y F-002: unas siete sesiones)
//
// Gasta: cada paso es una sesión de Claude Code en Haiku, con la suscripción de este equipo (no
// con la clave de la API de la aplicación). Son unas diez. Pregunta antes de correrla.
//
// Claude Code se lanza por COMPANIA_CLAUDE_CODE_BIN de .env.local o, sin ella, el del PATH, con solo el mod
// de la aplicación (sin otros mods ni otra copia). Al final dice qué pasó y qué no, y sale con 1 si
// algo falló. El repo vive en la carpeta temporal del sistema: nunca en un proyecto real.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeCodeDeEsteEquipo, SIN_CLAUDE_CODE } from "../../src/lib/fabrica/motor/claude-code.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PLUGIN = path.join(APP, "fabrica");
const dejar = process.argv.includes("--dejar");
// Solo F-001 y F-002: la integración y el conflicto, sin las dependencias ni la memoria.
const par = process.argv.includes("--par");

const bin = claudeCodeDeEsteEquipo()?.ruta;
if (!bin) {
  console.error(SIN_CLAUDE_CODE);
  process.exit(1);
}

// ---- El repo de prueba -------------------------------------------------------------------------

const BASE = mkdtempSync(path.join(os.tmpdir(), "fabrica-e2e-"));
const REPO = path.join(BASE, "repo");
const WTS = path.join(BASE, "repo-fabrica");
const REGISTRO = path.join(BASE, "registro.txt");
// El vault de la planta, como lo deja la aplicación en datos/memoria/: aquí, fuera del repo.
const PLANTA = path.join(BASE, "planta");
const barras = (p) => p.replace(/\\/g, "/");

const git = (args, cwd = REPO) => execFileSync("git", ["-c", "user.email=prueba@example.com", "-c", "user.name=prueba", ...args], { cwd, encoding: "utf8" });
const escribir = (ruta, texto) => {
  mkdirSync(path.dirname(ruta), { recursive: true });
  writeFileSync(ruta, texto);
};

function prepararRepo() {
  mkdirSync(REPO, { recursive: true });
  git(["init", "-q"]);
  git(["symbolic-ref", "HEAD", "refs/heads/desarrollo"]);
  git(["config", "core.autocrlf", "true"]);
  escribir(path.join(REPO, ".gitignore"), "node_modules/\nfactory/\n");
  escribir(path.join(REPO, "app.js"), "module.exports = { saludo: () => 'hola' };\n");
  escribir(path.join(REPO, "notas.txt"), "linea uno\nlinea dos\n");
  // Anota con qué archivos lo llamaron el lint y el paso sql, fuera del repo.
  escribir(path.join(REPO, "registro.js"), "require('fs').appendFileSync(process.env.E2E_REGISTRO, process.argv[2] + ': ' + process.argv.slice(3).join(' | ') + '\\n');\n");
  git(["add", "-A"]);
  git(["commit", "-qm", "inicio"]);
  escribir(path.join(REPO, "node_modules", "dummy", "index.js"), "module.exports = 1;\n");
  escribir(
    path.join(REPO, "factory", "config.md"),
    [
      "---",
      `build: node -e "require('./app.js')"`,
      `test: node -e "process.exit(require('./app.js').saludo() === 'hola' ? 0 : 1)"`,
      "lint: node registro.js lint {archivos}",
      "lint_extensiones: .js",
      "rama_base: main",
      "max_vueltas: 3",
      "paralelo_max: 2",
      "ui: no",
      "aprobacion: externa",
      "integracion: auto",
      `worktrees: ${barras(WTS)}`,
      "jev: no",
      "---",
      "",
      "# Fábrica de prueba",
      "",
    ].join("\n"),
  );
  mkdirSync(path.join(REPO, "factory", "tareas"), { recursive: true });
  mkdirSync(path.join(REPO, "factory", "veredictos"), { recursive: true });
}

/** El frontmatter de una tarea, como clave → valor. */
function tarea(id) {
  const dir = path.join(REPO, "factory", "tareas");
  const nombre = readdirSync(dir).find((n) => n.startsWith(`${id}-`));
  if (!nombre) return {};
  const texto = readFileSync(path.join(dir, nombre), "utf8").replace(/\r\n/g, "\n");
  const datos = { _texto: texto };
  for (const l of (/^---\n([\s\S]*?)\n---/.exec(texto)?.[1] ?? "").split("\n")) {
    const m = /^([\w-]+):\s*(.*)$/.exec(l);
    if (m) datos[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return datos;
}

/** El veredicto externo de una tarea, como lo deja la aplicación; vigente por una hora. */
function aprobar(id) {
  const archivo = path.join(REPO, "factory", "veredictos", `${id}.json`);
  writeFileSync(archivo, JSON.stringify({ tarea: id, veredicto: "aprobada", motivo: "prueba", por: "prueba", fecha: new Date().toISOString() }) + "\n");
  const enUnaHora = new Date(Date.now() + 3_600_000);
  utimesSync(archivo, enUnaHora, enUnaHora);
}

const worktree = (id) => {
  const wt = path.join(WTS, id);
  git(["worktree", "add", "-q", barras(wt), "-b", `fabrica/${id}`, "desarrollo"]);
  return barras(wt);
};

// ---- Una sesión de Claude Code -----------------------------------------------------------------

const HERRAMIENTAS = ["mcp__fabrica__estado", "mcp__fabrica__mover", "mcp__fabrica__verificar", "mcp__fabrica__sincronizar", "mcp__fabrica__nueva", "mcp__fabrica__decidir"];

/** Le pide a una sesión de Claude Code (Haiku) que haga exactamente esas llamadas. Devuelve lo que contestó. */
function sesion(nombre, llamadas) {
  const prompt = [
    "Eres un probador de la fábrica de software. No investigues el repo ni hagas nada por tu cuenta.",
    `Primero carga las herramientas con ToolSearch, en una sola llamada: select:${HERRAMIENTAS.join(",")}`,
    "Después haz exactamente estas llamadas, una por una y en este orden, aunque alguna sea rechazada:",
    "",
    ...llamadas.map((l, i) => `${i + 1}. ${l}`),
    "",
    'Al final, por cada llamada escribe una línea que empiece con ">> " y su número, seguida del texto completo de la respuesta o del rechazo, tal cual.',
  ].join("\n");
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC_|COMPANIA_|FABRICA_)/.test(k)));
  Object.assign(env, { CLAUDE_CODE_PLUGIN_DIRS: "", E2E_REGISTRO: REGISTRO, FABRICA_MEMORIA_PLANTA: barras(PLANTA) });
  // Sin otra copia del plugin: ni la de CLAUDE_CODE_PLUGIN_DIRS ni la instalada desde el marketplace.
  const settings = JSON.stringify({ env: { CLAUDE_CODE_PLUGIN_DIRS: "", CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1" }, enabledPlugins: { "fabrica@factoria": false } });
  const args = ["-p", prompt, "--model", "haiku", "--output-format", "text", "--plugin-dir", PLUGIN, "--settings", settings, "--allowedTools", "ToolSearch", ...HERRAMIENTAS, "Edit", "Read"];
  const [programa, argumentos] = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin) ? ["cmd.exe", ["/d", "/s", "/c", bin, ...args]] : [bin, args];
  process.stdout.write(`\n· ${nombre}… `);
  const r = spawnSync(programa, argumentos, { cwd: REPO, env, encoding: "utf8", timeout: 600_000, maxBuffer: 20 * 1024 * 1024 });
  const salida = `${r.stdout ?? ""}`;
  process.stdout.write(r.status === 0 ? "listo\n" : `terminó con ${r.status}\n`);
  return salida;
}

// ---- Las comprobaciones --------------------------------------------------------------------------

const resultados = [];
function comprobar(que, ok, detalle = "") {
  resultados.push({ que, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${que}${!ok && detalle ? ` — ${String(detalle).slice(0, 300)}` : ""}`);
}
const leerRegistro = () => (existsSync(REGISTRO) ? readFileSync(REGISTRO, "utf8") : "");

function principal() {
  console.log(`Repo de prueba: ${REPO}`);
  prepararRepo();

  // 1. Crear, sacar de la cola y entrar a construcción: la rama de origen y node_modules.
  const wt1 = worktree("F-001");
  sesion("crear F-001 y entrar a construcción", [
    'mcp__fabrica__nueva con titulo "Saludo con nombre" y pedido "Que saludo reciba un nombre. Archivos o zonas que toca: app.js"',
    'mcp__fabrica__mover con tarea "F-001" y a "spec"',
    `mcp__fabrica__mover con tarea "F-001" y a "construccion" y worktree "${wt1}"`,
  ]);
  let t = tarea("F-001");
  comprobar("la rama de origen se dedujo de la raíz", t.rama_origen === "desarrollo", t.rama_origen);
  comprobar("node_modules quedó enlazado en el worktree", t.node_modules === "enlazado" && existsSync(path.join(wt1, "node_modules", "dummy", "index.js")), t.node_modules);
  comprobar("al cerrarse la sesión, la tarea quedó libre", !t.tomada_por, t.tomada_por);

  // 2. El constructor trabaja; verificación, sincronización y aprobación.
  escribir(path.join(wt1, "app.js"), "module.exports = { saludo: (n) => n ? 'hola ' + n : 'hola' };\n");
  escribir(path.join(wt1, "nuevo.js"), "module.exports = 'nuevo';\n");
  escribir(path.join(wt1, "consulta.sql"), "SELECT 1;\n");
  const s2 = sesion("verificar y sincronizar F-001", [
    'mcp__fabrica__mover con tarea "F-001" y a "revision"',
    'mcp__fabrica__mover con tarea "F-001" y a "verificacion"',
    'mcp__fabrica__verificar con tarea "F-001"',
    'mcp__fabrica__mover con tarea "F-001" y a "aprobacion"',
    'mcp__fabrica__sincronizar con tarea "F-001" y mensaje "feat(F-001): saludo con nombre"',
    'mcp__fabrica__mover con tarea "F-001" y a "aprobacion"',
  ]);
  t = tarea("F-001");
  comprobar("el lint recibió solo los .js de la tarea", /^lint: app\.js \| nuevo\.js$/m.test(leerRegistro()), leerRegistro());
  comprobar("el .sql quedó como «SQL sin verificar»", t.sql_sin_verificar === "1", t.sql_sin_verificar);
  comprobar("sin sincronizar no pasó a aprobación", /traer antes la rama de origen/.test(s2), s2);
  comprobar("sincronizar hizo el commit del worktree", /feat\(F-001\)/.test(git(["log", "--oneline", "-1"], wt1)));
  comprobar("el archivo nuevo quedó en CRLF", readFileSync(path.join(wt1, "nuevo.js"), "utf8").includes("\r\n"));
  comprobar("quedó en aprobación", t.estado === "aprobacion", t.estado);

  // 3. Integrar: con la raíz en otra rama no se integra; al volver, se reintenta solo.
  aprobar("F-001");
  git(["switch", "-q", "-c", "otra"]);
  sesion("integrar F-001 con la raíz en otra rama", ['mcp__fabrica__mover con tarea "F-001" y a "hecho"']);
  t = tarea("F-001");
  comprobar("con la raíz en otra rama, va a un humano con bloqueo «rama»", t.estado === "necesita-humano" && t.bloqueo === "rama", `${t.estado} ${t.bloqueo}`);
  git(["switch", "-q", "desarrollo"]);
  const s3 = sesion("reintentar la integración de F-001", [
    "mcp__fabrica__estado",
    'mcp__fabrica__mover con tarea "F-001" y a "aprobacion" y nota "se reintenta la integración"',
    'mcp__fabrica__mover con tarea "F-001" y a "hecho"',
  ]);
  t = tarea("F-001");
  comprobar("estado la marcó para reintentar integrar", /"reintentar":\s*"integrar"/.test(s3), s3.slice(0, 400));
  comprobar("se integró con fast-forward, con el veredicto que tenía", t.estado === "hecho" && /^[0-9a-f]{40}$/.test(t.integrada ?? ""), `${t.estado} ${t.integrada}`);
  comprobar("desarrollo quedó en el commit de la tarea", git(["log", "--oneline", "-1"]).includes("F-001"));

  // 4. Un conflicto con lo que llegó a la rama de origen vuelve a construcción.
  const wt2 = worktree("F-002");
  sesion("crear F-002 y entrar a construcción", [
    'mcp__fabrica__nueva con titulo "Notas nuevas" y pedido "Cambiar la línea dos de notas.txt."',
    'mcp__fabrica__mover con tarea "F-002" y a "spec"',
    `mcp__fabrica__mover con tarea "F-002" y a "construccion" y worktree "${wt2}"`,
  ]);
  escribir(path.join(wt2, "notas.txt"), "linea uno\nlinea dos de la tarea\n");
  escribir(path.join(REPO, "notas.txt"), "linea uno\nlinea dos de otra tarea\n");
  git(["commit", "-qam", "otra tarea integrada"]);
  sesion("verificar y sincronizar F-002 con conflicto", [
    'mcp__fabrica__mover con tarea "F-002" y a "revision"',
    'mcp__fabrica__mover con tarea "F-002" y a "verificacion"',
    'mcp__fabrica__verificar con tarea "F-002"',
    'mcp__fabrica__sincronizar con tarea "F-002"',
  ]);
  t = tarea("F-002");
  comprobar("el conflicto la devolvió a construcción, con la vuelta contada", t.estado === "construccion" && t.vueltas === "1" && t.conflicto === "notas.txt", `${t.estado} ${t.vueltas} ${t.conflicto}`);
  comprobar("los marcadores quedaron en el worktree", readFileSync(path.join(wt2, "notas.txt"), "utf8").includes("<<<<<<<"));
  comprobar("el conflicto quedó como BLOQUEANTE", /### Sincronización[\s\S]*\*\*BLOQUEANTE\*\* · `notas\.txt`/.test(t._texto ?? ""));
  escribir(path.join(wt2, "notas.txt"), "linea uno\nlinea dos de la tarea y de otra tarea\n");
  aprobar("F-002");
  const s4 = sesion("resolver y cerrar F-002", [
    'mcp__fabrica__mover con tarea "F-002" y a "revision"',
    'mcp__fabrica__mover con tarea "F-002" y a "verificacion"',
    'mcp__fabrica__verificar con tarea "F-002"',
    'mcp__fabrica__mover con tarea "F-002" y a "aprobacion"',
    'mcp__fabrica__sincronizar con tarea "F-002"',
    'mcp__fabrica__mover con tarea "F-002" y a "aprobacion"',
    'mcp__fabrica__mover con tarea "F-002" y a "hecho"',
  ]);
  t = tarea("F-002");
  comprobar("al volver a revisión, el BLOQUEANTE pasó a «Hallazgos anteriores»", /## Hallazgos anteriores[\s\S]*notas\.txt/.test(t._texto ?? ""));
  comprobar("con el merge abierto no pasó a aprobación", /merge sin cerrar/.test(s4), s4.slice(0, 400));
  comprobar("cerró el merge y se integró", t.estado === "hecho" && !!t.integrada, `${t.estado} ${t.integrada}`);

  if (!par) partesTresYMas();

  // 7. Limpiar lo integrado no toca el node_modules de la raíz.
  const raizNm = path.join(REPO, "node_modules", "dummy", "index.js");
  const listado = git(["worktree", "list"]);
  comprobar("los worktrees de lo integrado siguen ahí antes de limpiar", listado.includes("F-001") && listado.includes("F-002"));
  comprobar("el node_modules de la raíz sigue intacto", existsSync(raizNm));

  const fallas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallas.length} de ${resultados.length} comprobaciones pasaron.`);
  if (fallas.length) console.log(`Fallaron: ${fallas.map((f) => f.que).join("; ")}.`);
  return fallas.length ? 1 : 0;
}

/** Las partes 5 y 6: dependencias y ciclos, y la memoria. Con `--par` no corren. */
function partesTresYMas() {
  let t;
  // 5. Dependencias y ciclos.
  const s5 = sesion("dependencias y ciclos", [
    'mcp__fabrica__nueva con titulo "Base de notas" y pedido "Ordenar las líneas de notas.txt."',
    'mcp__fabrica__nueva con titulo "Usa las notas" y depende_de "F-003" y pedido "Mostrar las notas ordenadas al cargar app.js."',
    'mcp__fabrica__nueva con titulo "Rota" y depende_de "F-099" y pedido "No debería crearse."',
    'mcp__fabrica__mover con tarea "F-004" y a "spec"',
    "Lee con Read el archivo de la tarea F-003 en factory/tareas/ y después usa Edit sobre ese archivo para reemplazar la línea `motivo: \"\"` por dos líneas: `motivo: \"\"` y `depende_de: F-004`.",
  ]);
  comprobar("una dependencia que no existe se rechaza", /No existe F-099/.test(s5), s5.slice(0, 400));
  comprobar("no sale de la cola mientras su dependencia no esté integrada", /Esperando a F-003/.test(s5) && tarea("F-004").estado === "pendiente", s5.slice(0, 400));
  comprobar("un ciclo se frena en el Edit", /ciclo/.test(s5) && !tarea("F-003").depende_de, s5.slice(0, 400));

  // 6. La memoria: las fichas se leen de la raíz (sin commit: factory/ está ignorada en este repo) y
  // de la planta; un pedido que nombra algo prohibido no se salta la spec y deja la sospecha.
  escribir(path.join(REPO, "factory", "memoria", "ficha.md"), "# Ficha · repo\n\n- [base-de-datos] PostgreSQL. (él, 2026-10-26)\n- [base-de-datos] NO: SQL Server, MySQL ni MongoDB.\n");
  escribir(path.join(PLANTA, "ficha.md"), "# Ficha · la planta\n\n- [estilo] NO: jQuery.\n");
  const s6 = sesion("la memoria entra a la tarea", [
    "mcp__fabrica__estado",
    'mcp__fabrica__nueva con titulo "Guardar en Mongo" y pedido "Guardar las notas en MongoDB, en su propia colección, con un índice por fecha para leerlas rápido al cargar app.js."',
    'mcp__fabrica__decidir con tarea "F-005" y etapa "spec"',
    'mcp__fabrica__mover con tarea "F-005" y a "spec"',
  ]);
  comprobar("estado trae la ficha del proyecto, leída de la raíz", /NO: SQL Server, MySQL ni MongoDB/.test(s6), s6.slice(0, 400));
  comprobar("estado trae la ficha de la planta", /NO: jQuery/.test(s6), s6.slice(0, 400));
  comprobar("con un pedido que nombra algo prohibido, la spec no se salta", /SÍ hace falta[^\n]*la memoria prohíbe/.test(s6), s6.slice(0, 600));
  t = tarea("F-005");
  comprobar("la sospecha quedó en la bitácora de la tarea", t.estado === "spec" && /memoria: el pedido nombra «MongoDB»/.test(t._texto ?? ""), `${t.estado} ${(t._texto ?? "").slice(-300)}`);
}

let codigo = 1;
try {
  codigo = principal();
} catch (err) {
  console.error(`\nLa prueba se cortó: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  if (dejar) console.log(`El repo de prueba quedó en ${BASE}.`);
  else {
    // Primero los worktrees, como lo haría git; después la carpeta entera, que es desechable.
    try {
      for (const id of ["F-001", "F-002"]) if (existsSync(path.join(WTS, id, "node_modules"))) rmSync(path.join(WTS, id, "node_modules"), { force: true });
    } catch {}
    rmSync(BASE, { recursive: true, force: true, maxRetries: 5 });
  }
}
process.exit(codigo);
