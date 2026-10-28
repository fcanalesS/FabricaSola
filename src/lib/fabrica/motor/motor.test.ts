import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { beforeEach, test } from "node:test";
import "../../../pruebas/entorno.ts";

// El motor de la fábrica con archivos de verdad, en carpetas recién hechas: sin la fábrica de mentira de las rutas.
const { atenderEnLaFabrica } = await import("./rutas.ts");
const { carpetaDeLaFabrica, crearTareaEn, elegirProyecto, instantanea, leerAjustes, lineasDeLaFabrica, raiz } = await import("./proyecto.ts");
const { corridaActual, entornoDeLaCorrida, lanzadorDeClaude } = await import("./corridas.ts");
const { partir, unir } = await import("./formato.ts");
const { archivosDelVault } = await import("../memoria/vault.ts");
const { leerFicha, leerVault, revisarVault } = await import("../memoria/formato.ts");
const { recibirOtlp } = await import("./telemetria.ts");

const proyectoNuevo = () => mkdtempSync(path.join(os.tmpdir(), "fabrica-proyecto-"));
const pedir = (ruta: string, cuerpo?: unknown, metodo: "GET" | "POST" | "PUT" = cuerpo === undefined ? "GET" : "POST") => atenderEnLaFabrica(ruta, cuerpo, metodo, { origen: "http://127.0.0.1:3211" });
const tareas = async () => (await instantanea())?.tareas ?? [];

let proyectoActual = "";
const tareasEnDisco = () => readdirSync(path.join(proyectoActual, "factory", "tareas")).filter((n) => n.endsWith(".md")).sort();

/** Pone una tarea en otro estado, como lo haría el plugin. */
function ponerEnEstado(id: string, estado: string, mas: Record<string, string> = {}) {
  const archivo = path.join(proyectoActual, "factory", "tareas", tareasEnDisco().find((x) => x.startsWith(id))!);
  const { datos, cuerpo } = partir(readFileSync(archivo, "utf8"));
  writeFileSync(archivo, unir({ ...datos, estado, ...mas }, cuerpo));
}

beforeEach(async () => {
  delete process.env.FACTORIA_CLAUDE_CODE_BIN;
  await elegirProyecto(null);
});

test("sin proyecto elegido no hay nada que leer, y se dice así", async () => {
  assert.equal(await raiz(), null);
  assert.equal(await instantanea(), null);
  assert.equal((await pedir("/api/fabrica")).estado, 409);
  const ajustes = (await pedir("/api/ajustes")).datos as { raiz: string; fuente: string };
  assert.deepEqual([ajustes.raiz, ajustes.fuente], ["", "ninguno"]);
  assert.match(String(((await pedir("/api/ajustes", { accion: "inicializar" })).datos as { error: string }).error), /no hay un proyecto elegido/);
});

test("se elige un proyecto, se le crea una factory/ básica y los requerimientos se vuelven tareas", async () => {
  proyectoActual = proyectoNuevo();
  assert.equal((await pedir("/api/ajustes", { raiz: path.join(proyectoActual, "no-existe") }, "PUT")).estado, 409);
  const elegido = await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  assert.equal((elegido.datos as { proyecto: { tieneFabrica: boolean } }).proyecto.tieneFabrica, false);
  // Las tareas solo se crean con factory/.
  assert.equal((await pedir("/api/requerimientos", { texto: "## Una\nAlgo" })).estado, 409);
  assert.equal((await pedir("/api/ajustes", { accion: "inicializar" })).estado, 200);
  const config = readFileSync(path.join(proyectoActual, "factory", "config.md"), "utf8");
  // La factory/ nueva no apunta a ningún orquestador de afuera.
  assert.doesNotMatch(config, /puente_url|3210/);

  const creado = await pedir("/api/requerimientos", { titulo: "Reportes", texto: "# Reportes\n\nContexto común.\n\n## Exportar ventas\nA CSV.\n\n## Filtro por tienda\nEn el reporte de stock.", porSeccion: true });
  assert.equal(creado.estado, 200);
  assert.deepEqual((creado.datos as { creadas: { id: string; titulo: string }[] }).creadas, [
    { id: "F-001", titulo: "Exportar ventas" },
    { id: "F-002", titulo: "Filtro por tienda" },
  ]);
  assert.deepEqual((await tareas()).map((t) => [t.id, t.estado]), [["F-001", "pendiente"], ["F-002", "pendiente"]]);
  assert.equal((await instantanea())?.eventos.length, 2);
});

test("una respuesta va a la tarea que espera a una persona; un veredicto, a la que está en aprobación, y nada más", async () => {
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/requerimientos", { texto: "## Una\nA.\n\n## Otra\nB.", porSeccion: true });

  // Responder a una que no espera: no.
  assert.equal((await pedir("/api/respuesta", { tarea: "F-001", texto: "Sí, también al importar." })).estado, 409);
  ponerEnEstado("F-001", "necesita-humano", { motivo: "¿También al importar?", actualizada: "2026-10-17T10:00:00.000Z" });
  assert.equal((await pedir("/api/respuesta", { tarea: "F-001", texto: "Sí, también al importar.", por: "persona" })).estado, 200);
  const respondida = (await tareas()).find((t) => t.id === "F-001");
  assert.equal(respondida?.respuesta?.texto, "Sí, también al importar.");
  // El estado no lo cambia la aplicación: lo mueve el plugin al retomarla.
  assert.equal(respondida?.estado, "necesita-humano");
  assert.match(readFileSync(path.join(proyectoActual, "factory", "tareas", tareasEnDisco()[0]), "utf8"), /## Respuesta del humano[^]*> Sí, también al importar\./);

  assert.equal((await pedir("/api/veredicto", { tarea: "F-002", veredicto: "aprobada" })).estado, 409);
  ponerEnEstado("F-002", "aprobacion", { en_aprobacion_desde: new Date(Date.now() - 60_000).toISOString() });
  // Un rechazo sin motivo no sirve a quien lo arregla.
  assert.equal((await pedir("/api/veredicto", { tarea: "F-002", veredicto: "rechazada" })).estado, 409);
  assert.equal((await pedir("/api/veredicto", { tarea: "F-002", veredicto: "aprobada", por: "persona" })).estado, 200);
  assert.equal((await tareas()).find((t) => t.id === "F-002")?.veredictoExterno?.veredicto, "aprobada");
  assert.match(String(((await pedir("/api/veredicto", { tarea: "../F-002", veredicto: "aprobada" })).datos as { error: string }).error), /Id de tarea inválido/);
});

test("los modelos de cada rol y los agentes externos quedan en factory/config.md; el de la corrida, en la aplicación", async () => {
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/ajustes", { modeloDeRol: { rol: "construccion", modelo: "opus" } }, "PUT");
  // Sin su ruta exacta en este equipo, Codex no se enciende: no se busca en el PATH.
  const sinRuta = await pedir("/api/ajustes", { agenteExterno: { cual: "revisorCodigo", valor: "codex" } }, "PUT");
  assert.equal(sinRuta.estado, 409);
  assert.match(String((sinRuta.datos as { error: string }).error), /FACTORIA_CODEX_BIN/);
  assert.match(String(((await pedir("/api/ajustes", { agenteExterno: { cual: "escritorSpec", valor: "antigravity" } }, "PUT")).datos as { error: string }).error), /FACTORIA_ANTIGRAVITY_BIN/);
  process.env.FACTORIA_CODEX_BIN = "/opt/bin/codex";
  await pedir("/api/ajustes", { agenteExterno: { cual: "revisorCodigo", valor: "codex" } }, "PUT");
  delete process.env.FACTORIA_CODEX_BIN;
  await pedir("/api/ajustes", { modelo: "sonnet" }, "PUT");
  assert.equal((await pedir("/api/ajustes", { modelo: "gpt-9" }, "PUT")).estado, 409);
  const datos = partir(readFileSync(path.join(proyectoActual, "factory", "config.md"), "utf8")).datos;
  assert.deepEqual([datos.modelo_construccion, datos.revisor_codigo], ["opus", "codex"]);
  const a = (await pedir("/api/ajustes")).datos as { modelo: { modelo: string; fuente: string }; modelosPorRol: Record<string, string>; externos: Record<string, string> };
  assert.deepEqual(a.modelo, { modelo: "sonnet", fuente: "configuracion" });
  // La spec va en Opus y la revisión en Sonnet si config.md no dice otra cosa, como en el plugin.
  assert.deepEqual(a.modelosPorRol, { spec: "opus", construccion: "opus", revision: "sonnet", aprobacion: "opus" });
  assert.deepEqual(a.externos, { revisorCodigo: "codex", escritorSpec: "claude" });
});

test("a la corrida no le llega nada de la aplicación: ni sus claves ni ANTHROPIC_; la de Jev y las rutas de los otros agentes, con su nombre del plugin", () => {
  const env = entornoDeLaCorrida({ PATH: "/bin", HOME: "/home/el", FACTORIA_CLAUDE_API_KEY: "x", FACTORIA_ELEVENLABS_API_KEY: "y", ANTHROPIC_API_KEY: "z", TYPESAFE_AI_KEY: "jev" });
  assert.deepEqual(env, { PATH: "/bin", HOME: "/home/el", FABRICA_JEV_KEY: "jev" });
  // Codex y Antigravity, por la ruta de .env.local; una FABRICA_ que viniera de antes no pasa.
  const conOtros = entornoDeLaCorrida({ PATH: "/bin", FACTORIA_CODEX_BIN: " C:\\npm\\codex.cmd ", FACTORIA_ANTIGRAVITY_BIN: "/opt/agy", FABRICA_CODEX_BIN: "/viejo/codex" });
  assert.deepEqual(conOtros, { PATH: "/bin", FABRICA_CODEX_BIN: "C:\\npm\\codex.cmd", FABRICA_ANTIGRAVITY_BIN: "/opt/agy" });
  assert.deepEqual(entornoDeLaCorrida({ PATH: "/bin", FACTORIA_CODEX_BIN: " ", FABRICA_ANTIGRAVITY_BIN: "/viejo/agy" }), { PATH: "/bin" });
  // Claude Code por su ruta exacta; un .cmd de Windows, por la consola.
  assert.deepEqual(lanzadorDeClaude("/usr/local/bin/claude", ["-p", "x"], "darwin"), { programa: "/usr/local/bin/claude", argumentos: ["-p", "x"] });
  assert.deepEqual(lanzadorDeClaude("C:\\npm\\claude.cmd", ["-p", "x"], "win32"), { programa: "cmd.exe", argumentos: ["/d", "/s", "/c", "C:\\npm\\claude.cmd", "-p", "x"] });
  assert.deepEqual(lanzadorDeClaude("C:\\Claude\\claude.exe", ["-p"], "win32"), { programa: "C:\\Claude\\claude.exe", argumentos: ["-p"] });
});

test("sin la ruta de Claude Code no se corre, y se dice cuál variable falta", async () => {
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  const r = await pedir("/api/corridas", { accion: "iniciar" });
  assert.equal(r.estado, 409);
  assert.match(String((r.datos as { error: string }).error), /FACTORIA_CLAUDE_CODE_BIN/);
});

test("una corrida lanza Claude Code con el plugin de la aplicación, sin otros mods, y su resultado y su telemetría quedan en el informe", { skip: process.platform === "win32" }, async () => {
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/ajustes", { comandos: { build: "true", test: "", lint: "", ramaBase: "main" } }, "PUT");
  // Un Claude Code de mentira: anota con qué lo lanzaron y contesta como el de verdad, en stream-json.
  const fuera = mkdtempSync(path.join(os.tmpdir(), "fabrica-claude-"));
  const falso = path.join(fuera, "claude");
  writeFileSync(
    falso,
    `#!/bin/sh
env > "${fuera}/entorno.txt"
printf '%s\\n' "$@" > "${fuera}/argumentos.txt"
echo '{"type":"system","subtype":"init","session_id":"sesion-1","cwd":"'"$PWD"'","model":"claude-sonnet-5-5","plugins":[{"name":"fabrica"}]}'
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"mcp__fabrica__mover","input":{"tarea":"F-001","a":"spec"}}]}}'
echo '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.42,"num_turns":3,"duration_ms":1200,"result":"Listo."}'
`,
  );
  chmodSync(falso, 0o755);
  process.env.FACTORIA_CLAUDE_CODE_BIN = falso;
  process.env.FACTORIA_CLAUDE_API_KEY = "clave-de-prueba";
  process.env.TYPESAFE_AI_KEY = "clave-de-jev";

  const lanzada = await pedir("/api/corridas", { accion: "iniciar", tareas: ["F-001", "nada"] });
  assert.equal(lanzada.estado, 200);
  const id = (lanzada.datos as { corrida: { id: string } }).corrida.id;
  let c = await corridaActual();
  for (let i = 0; i < 100 && c?.estado === "corriendo"; i++) {
    await new Promise((listo) => setTimeout(listo, 50));
    c = await corridaActual();
  }
  assert.equal(c?.estado, "terminada");
  assert.equal(c?.costoUsd, 0.42);
  assert.ok(c?.lineas.some((l) => l.texto === "mueve F-001 → spec"));

  const argumentos = readFileSync(path.join(fuera, "argumentos.txt"), "utf8").split("\n");
  assert.equal(argumentos[1], "/fabrica:correr F-001");
  assert.equal(argumentos[argumentos.indexOf("--plugin-dir") + 1], path.join(process.cwd(), "fabrica"));
  const ajustes = JSON.parse(argumentos[argumentos.indexOf("--settings") + 1]) as { env: Record<string, string>; enabledPlugins: Record<string, boolean> };
  assert.equal(ajustes.env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS, "1");
  // La copia instalada desde el marketplace del repositorio va apagada: corre la de la aplicación.
  assert.deepEqual(ajustes.enabledPlugins, { "fabrica@factoria": false });
  assert.equal(ajustes.env.OTEL_EXPORTER_OTLP_ENDPOINT, "http://127.0.0.1:3211/api/fabrica/telemetria");
  const entorno = readFileSync(path.join(fuera, "entorno.txt"), "utf8");
  assert.doesNotMatch(entorno, /^FACTORIA_|^TYPESAFE_AI_KEY=/m);
  assert.match(entorno, /^FABRICA_JEV_KEY=clave-de-jev$/m);
  // La carpeta de la memoria de la planta, para que el plugin lea su ficha.
  assert.match(entorno, new RegExp(`^FABRICA_MEMORIA_PLANTA=${path.join(carpetaDeLaFabrica(), "memoria").replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}$`, "m"));

  // La telemetría que manda la corrida llega por la ruta de la aplicación; de otra corrida no se guarda nada.
  const otlp = (corrida: string) =>
    new Request("http://127.0.0.1:3211/api/fabrica/telemetria/v1/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceLogs: [{ resource: { attributes: [{ key: "fabrica.corrida", value: { stringValue: corrida } }] }, scopeLogs: [{ logRecords: [{ attributes: [{ key: "event.name", value: { stringValue: "api_request" } }, { key: "cost_usd", value: { doubleValue: 0.4 } }, { key: "prompt", value: { stringValue: "texto que no se guarda" } }] }] }] }],
      }),
    });
  assert.equal((await recibirOtlp("logs", otlp(id))).status, 200);
  await recibirOtlp("logs", otlp("20200101T000000"));
  const informe = await pedir(`/api/informes?id=${id}`);
  const i = (informe.datos as { informe: { estado: string; telemetria: { llamadas: number } | null }; markdown: string });
  assert.equal(i.informe.estado, "terminada");
  assert.equal(i.informe.telemetria?.llamadas, 1);
  assert.doesNotMatch(i.markdown, /texto que no se guarda/);
  assert.ok(!existsSync(path.join(process.cwd(), "datos", "corridas", "20200101T000000.telemetria.jsonl")));
  // Lo que costó queda anotado, y suma en lo de hoy de este proyecto.
  assert.equal(((await pedir("/api/corridas/hoy")).datos as { usd: number }).usd, 0.42);
});

test("un resultado intermedio no termina la corrida: Claude Code sigue mientras espera a sus agentes, y vale el último", { skip: process.platform === "win32" }, async () => {
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/ajustes", { comandos: { build: "true", test: "", lint: "", ramaBase: "main" } }, "PUT");
  const fuera = mkdtempSync(path.join(os.tmpdir(), "fabrica-claude-"));
  const falso = path.join(fuera, "claude");
  // Como el de verdad con agentes en segundo plano: un resultado al quedarse esperando, y el final después.
  writeFileSync(
    falso,
    `#!/bin/sh
echo '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.1,"num_turns":2,"result":"Espero al agente de spec."}'
sleep 1
echo '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.3,"num_turns":9,"result":"F-001 quedó hecha."}'
`,
  );
  chmodSync(falso, 0o755);
  process.env.FACTORIA_CLAUDE_CODE_BIN = falso;
  await pedir("/api/corridas", { accion: "iniciar" });
  await new Promise((listo) => setTimeout(listo, 400));
  // Ya dio un resultado, pero su proceso sigue: la corrida sigue.
  assert.equal((await corridaActual())?.estado, "corriendo");
  let c = await corridaActual();
  for (let i = 0; i < 100 && c?.estado === "corriendo"; i++) {
    await new Promise((listo) => setTimeout(listo, 50));
    c = await corridaActual();
  }
  assert.equal(c?.estado, "terminada");
  assert.equal(c?.costoUsd, 0.3);
  assert.equal(c?.lineas.findLast((l) => l.tipo === "fin")?.texto, "F-001 quedó hecha.");
});

test("el explorador muestra las carpetas de adentro, sin las ocultas, y dice cuáles son repositorios y cuáles tienen fábrica", async () => {
  const { listarCarpetas } = await import("./carpetas.ts");
  const base = mkdtempSync(path.join(os.tmpdir(), "fabrica-carpetas-"));
  for (const d of ["repo/.git", "con-fabrica/factory", "suelta", ".oculta", "node_modules"]) mkdirSync(path.join(base, d), { recursive: true });
  writeFileSync(path.join(base, "con-fabrica", "factory", "config.md"), "---\n---\n");
  writeFileSync(path.join(base, "un-archivo.txt"), "no es carpeta");
  const l = await listarCarpetas(base, "darwin");
  assert.deepEqual(l.carpetas.map((c) => [c.nombre, c.git, c.fabrica]), [["con-fabrica", false, true], ["repo", true, false], ["suelta", false, false]]);
  assert.equal(l.padre, path.dirname(base));
  assert.deepEqual(l.unidades, []);
  // Entrar a una: ahí se ve qué sería elegirla.
  const repo = await listarCarpetas(path.join(base, "repo"), "darwin");
  assert.deepEqual([repo.git, repo.fabrica, repo.carpetas.length], [true, false, 0]);
  await assert.rejects(listarCarpetas(path.join(base, "no-existe")), /No existe la carpeta/);
  await assert.rejects(listarCarpetas(path.join(base, "un-archivo.txt")), /No existe la carpeta/);
  // Sin ruta, parte en la carpeta del usuario.
  assert.equal((await listarCarpetas(null)).ruta, os.homedir());
});

test("el ejemplo del prompt para la IA se corta en las tareas que promete, con su contexto y sus criterios", async () => {
  const { EJEMPLO_DE_REQUERIMIENTOS, PROMPT_DE_TAREAS } = await import("../prompt-de-tareas.ts");
  const { proponerTareas, tituloDelDocumento } = await import("./requerimientos.ts");
  const titulo = tituloDelDocumento(EJEMPLO_DE_REQUERIMIENTOS);
  const tareas = proponerTareas(EJEMPLO_DE_REQUERIMIENTOS, { porSeccion: true, titulo });
  assert.equal(titulo, "Reportes de ventas");
  assert.deepEqual(tareas.map((t) => t.titulo), ["Exportar las ventas del día a CSV", "Filtro por tienda en el reporte de stock"]);
  for (const t of tareas) {
    assert.ok(t.titulo.length <= 80);
    assert.match(t.pedido, /Criterios de aceptación/);
    assert.match(t.pedido, /Contexto del documento[^]*npm test/);
  }
  assert.ok(PROMPT_DE_TAREAS.includes(EJEMPLO_DE_REQUERIMIENTOS));
  assert.match(PROMPT_DE_TAREAS, /Mi idea:/);
});

// ---- Mejoras del 19 de octubre de 2026 ----------------------------------------------------------

/** Un repo git vacío en la rama `rama`, sin commits. */
function repoEn(dir: string, rama: string) {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["symbolic-ref", "HEAD", `refs/heads/${rama}`], { cwd: dir });
}

test("crear la factory/ deja los comandos detectados y la rama actual; si no reconoce nada, lo dice", async () => {
  proyectoActual = proyectoNuevo();
  writeFileSync(path.join(proyectoActual, "package.json"), JSON.stringify({ scripts: { build: "next build", test: "node --test", lint: "eslint" } }));
  repoEn(proyectoActual, "desarrollo");
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  const r = await pedir("/api/ajustes", { accion: "inicializar" });
  assert.equal(r.estado, 200);
  const datos = partir(readFileSync(path.join(proyectoActual, "factory", "config.md"), "utf8")).datos;
  assert.deepEqual([datos.build, datos.test, datos.lint, datos.rama_base, datos.integracion], ["npm run build", "npm test", "npm run lint", "desarrollo", "auto"]);
  assert.deepEqual((r.datos as { comandos: unknown }).comandos, { build: "npm run build", test: "npm test", lint: "npm run lint", ramaBase: "desarrollo" });

  // Sin nada reconocible: comandos vacíos, y el aviso lo dice en vez de un texto fijo.
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  const vacio = (await pedir("/api/ajustes", { accion: "inicializar" })).datos as { inicializada: { build: string; avisos: string[] } };
  assert.equal(vacio.inicializada.build, "");
  assert.ok(vacio.inicializada.avisos.some((a) => /No se reconoció el proyecto/.test(a)));
  assert.ok(vacio.inicializada.avisos.some((a) => /rama base quedó en main/.test(a)));
});

test("los comandos del proyecto se guardan sin tocar lo demás de config.md, y se prueban en su raíz", async () => {
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/ajustes", { modeloDeRol: { rol: "spec", modelo: "fable" } }, "PUT");
  const comandos = { build: 'node -e "process.exit(0)"', test: "node -e \"console.error('1 prueba fallo'); process.exit(3)\"", lint: "npx eslint {archivos}", ramaBase: "desarrollo" };
  assert.equal((await pedir("/api/ajustes", { comandos: { ...comandos, ramaBase: "--force" } }, "PUT")).estado, 409);
  assert.equal((await pedir("/api/ajustes", { comandos }, "PUT")).estado, 200);
  const texto = readFileSync(path.join(proyectoActual, "factory", "config.md"), "utf8");
  const { datos, cuerpo } = partir(texto);
  assert.deepEqual([datos.build, datos.test, datos.lint, datos.rama_base, datos.modelo_spec, datos.max_vueltas], [comandos.build, comandos.test, comandos.lint, "desarrollo", "fable", "3"]);
  assert.match(cuerpo, /Notas para los agentes/);

  const probados = (await pedir("/api/ajustes", { accion: "probar_comandos" })).datos as { pruebas: { nombre: string; resultado: string; codigo: number | null; salida: string }[] };
  assert.deepEqual(probados.pruebas.map((p) => [p.nombre, p.resultado]), [["build", "ok"], ["test", "fallo"], ["lint", "omitido"]]);
  // PowerShell 5 devuelve 1 por cualquier fallo; sh, el código del programa.
  assert.notEqual(probados.pruebas[1]!.codigo, 0);
  assert.match(probados.pruebas[1]!.salida, /1 prueba fallo/);
  // Al cambiar de proyecto se ven los del otro.
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  assert.equal(((await pedir("/api/ajustes")).datos as { comandos: unknown }).comandos, null);
});

test("sin comandos de verificación la corrida no se lanza, y se dice por qué", async () => {
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  process.env.FACTORIA_CLAUDE_CODE_BIN = path.join(proyectoActual, "no-se-lanza", "claude");
  const r = await pedir("/api/corridas", { accion: "iniciar" });
  assert.equal(r.estado, 409);
  assert.match(String((r.datos as { error: string }).error), /no tiene comandos de build, test ni lint/);
  assert.equal(existsSync(path.join(proyectoActual, "no-se-lanza")), false);
});

test("la rama de trabajo: una local que no sea main ni de la fábrica; sin ella y con la raíz en main, no se corre", async () => {
  proyectoActual = proyectoNuevo();
  const g = (args: string[]) => execFileSync("git", ["-c", "user.email=prueba@example.com", "-c", "user.name=prueba", ...args], { cwd: proyectoActual, encoding: "utf8" });
  repoEn(proyectoActual, "main");
  writeFileSync(path.join(proyectoActual, "app.js"), "uno\n");
  g(["add", "-A"]);
  g(["commit", "-qm", "inicio"]);
  g(["branch", "developer/fcanales"]);
  g(["branch", "fabrica/F-001"]);
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/ajustes", { comandos: { build: "true", test: "", lint: "", ramaBase: "main" } }, "PUT");
  const leer = async () => ((await pedir("/api/ajustes")).datos as { ramaTrabajo: { elegida: string; raizEn: string | null; opciones: string[] } }).ramaTrabajo;
  assert.deepEqual(await leer(), { elegida: "", raizEn: "main", opciones: ["developer/fcanales"] });

  // Con la raíz en main y sin rama de trabajo, la corrida no se lanza.
  process.env.FACTORIA_CLAUDE_CODE_BIN = path.join(proyectoActual, "no-se-lanza", "claude");
  const r = await pedir("/api/corridas", { accion: "iniciar" });
  assert.equal(r.estado, 409);
  assert.match(String((r.datos as { error: string }).error), /La raíz está en «main» y la fábrica no trabaja sobre esa rama/);

  // Ni main, ni una de la fábrica, ni una que no existe.
  for (const [valor, error] of [["main", /no trabaja sobre «main»/], ["fabrica/F-001", /rama de una tarea/], ["no-existe", /No hay una rama local «no-existe»/]] as const)
    assert.match(String(((await pedir("/api/ajustes", { ramaTrabajo: valor }, "PUT")).datos as { error: string }).error), error, valor);
  assert.equal((await pedir("/api/ajustes", { ramaTrabajo: "developer/fcanales" }, "PUT")).estado, 200);
  assert.equal((await leer()).elegida, "developer/fcanales");
  assert.match(readFileSync(path.join(proyectoActual, "factory", "config.md"), "utf8"), /^rama_trabajo: developer\/fcanales$/m);
  // Elegida, ya no la frena estar en main: falla después, por no poder lanzar Claude Code.
  assert.doesNotMatch(String(((await pedir("/api/corridas", { accion: "iniciar" })).datos as { error?: string }).error ?? ""), /no trabaja sobre esa rama/);
  await pedir("/api/ajustes", { ramaTrabajo: "" }, "PUT");
  assert.equal((await leer()).elegida, "");
});

test("las dependencias de un documento de requerimientos: por título o por id; lo desconocido y los ciclos no crean nada", async () => {
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/requerimientos", { texto: "## Base\nAlgo.", porSeccion: true });
  const doc = "# Ventas\n\n## Mensajes de error\nUna clase.\n\n## Exportar ventas\nA CSV.\n\n### Depende de\n- Mensajes de error\n- F-001\n";
  const creado = await pedir("/api/requerimientos", { texto: doc, porSeccion: true });
  assert.equal(creado.estado, 200);
  const porId = new Map((await tareas()).map((t) => [t.id, t.dependeDe]));
  assert.deepEqual(porId.get("F-003"), ["F-002", "F-001"]);
  assert.deepEqual(porId.get("F-002"), []);

  const antes = tareasEnDisco().length;
  const desconocida = await pedir("/api/requerimientos", { texto: "## Una\nA.\n\n### Depende de\n- Otra que no está\n", porSeccion: true });
  assert.equal(desconocida.estado, 409);
  assert.match(String((desconocida.datos as { error: string }).error), /Otra que no está/);
  const ciclo = await pedir("/api/requerimientos", { texto: "## Una\nA.\n\n### Depende de\n- Dos\n\n## Dos\nB.\n\n### Depende de\n- Una\n", porSeccion: true });
  assert.equal(ciclo.estado, 409);
  assert.match(String((ciclo.datos as { error: string }).error), /ciclo/);
  assert.equal(tareasEnDisco().length, antes);
});

test("la deuda junta los MENORES de las tareas hechas, y cada uno se vuelve una tarea una sola vez", async () => {
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/requerimientos", { texto: "## Hecha\nA.\n\n## En curso\nB.", porSeccion: true });
  const hallazgos = "### Código\n\n- **MENOR** · `src/Ventas.cs:42` — muestra ex.Message al usuario.\n- **BLOQUEANTE** · `src/x.cs:1` — ya resuelto.\n\n### UI\n\n- MENOR: contraste bajo en el botón\n  de exportar.\n";
  for (const [id, estado] of [["F-001", "hecho"], ["F-002", "construccion"]] as const) {
    const archivo = path.join(proyectoActual, "factory", "tareas", tareasEnDisco().find((x) => x.startsWith(id))!);
    const { datos, cuerpo } = partir(readFileSync(archivo, "utf8"));
    writeFileSync(archivo, unir({ ...datos, estado }, cuerpo.replace("_(ninguno todavía)_", hallazgos)));
  }
  const deuda = (await instantanea())!.deuda;
  // Solo de la hecha, y solo lo MENOR.
  assert.deepEqual(deuda.map((h) => [h.tarea, h.revisor, h.donde, h.convertidoEn]), [["F-001", "Código", "src/Ventas.cs:42", null], ["F-001", "UI", null, null]]);
  assert.match(deuda[1]!.texto, /contraste bajo en el botón de exportar/);

  const creada = await pedir("/api/deuda", { hallazgo: deuda[0]!.id });
  assert.equal(creada.estado, 200);
  const nueva = (creada.datos as { id: string }).id;
  assert.equal(nueva, "F-003");
  const archivo = readFileSync(path.join(proyectoActual, "factory", "tareas", tareasEnDisco().find((x) => x.startsWith(nueva))!), "utf8");
  assert.equal(partir(archivo).datos.estado, "pendiente");
  assert.match(archivo, /F-001[^]*> muestra ex\.Message al usuario\.[^]*`src\/Ventas\.cs:42`/);
  assert.equal((await instantanea())!.deuda[0]!.convertidoEn, "F-003");
  assert.equal((await pedir("/api/deuda", { hallazgo: deuda[0]!.id })).estado, 409);
  assert.equal((await pedir("/api/deuda", { hallazgo: "../../etc" })).estado, 409);
});

test("el informe dice que se corrieron las pruebas solo si hubo verificaciones; un MCP caído que nadie usó es una nota", async () => {
  const { informeEnMarkdown, servidoresCaidos } = await import("./informes.ts");
  const base = {
    id: "20261019T113100", proyecto: "/p/WolffWebNET10", pedidas: [], modelo: null, inicio: "2026-10-19T11:31:00.000Z", fin: "2026-10-19T11:40:00.000Z", estado: "terminada" as const,
    sesion: null, final: null, resultado: null, tareas: [], telemetria: null, sinPruebas: [], comandoDePruebas: null, saltos: [], integracion: { sencillas: [], grandes: [] }, externos: [], jev: null, problemas: [], notas: [], porTarea: null,
  };
  assert.match(informeEnMarkdown({ ...base, verificaciones: 0 }), /## Pruebas\n\nNo se verificó ninguna tarea en esta corrida\./);
  assert.doesNotMatch(informeEnMarkdown({ ...base, verificaciones: 0 }), /corrieron sus pruebas unitarias/);
  assert.match(informeEnMarkdown({ ...base, verificaciones: 2 }), /corrieron sus pruebas unitarias/);
  // Cuántas pueden entrar solas y cuántas esperan su prueba; sin ninguna clasificada, nada.
  assert.match(informeEnMarkdown({ ...base, verificaciones: 1, integracion: { sencillas: ["F-001"], grandes: ["F-002", "F-003"] } }), /## Sencillas y grandes\n\n- Pueden entrar solas: F-001\.\n- Conviene que las pruebes a mano: F-002, F-003\./);
  assert.doesNotMatch(informeEnMarkdown({ ...base, verificaciones: 1 }), /Sencillas y grandes/);

  assert.deepEqual(servidoresCaidos({ caidos: ["rea"], usados: [] }, 1), { problemas: [], notas: ["El servidor MCP rea no conectó; ningún agente de esta corrida lo usó."] });
  assert.deepEqual(servidoresCaidos({ caidos: ["rea"], usados: ["rea"] }, 1).problemas, ["El servidor MCP rea no conectó, y la corrida lo intentó usar."]);
  // Sin nombres, queda la cuenta de la telemetría.
  assert.deepEqual(servidoresCaidos(undefined, 2).problemas, ["2 servidores MCP no conectaron."]);
  assert.match(informeEnMarkdown({ ...base, verificaciones: 0, notas: ["El servidor MCP rea no conectó; ningún agente de esta corrida lo usó."] }), /Notas:\n\n- El servidor MCP rea/);
});

test("lo que él aprobó con otra corrida en marcha queda anotado, y se lanza después solo si sigue esperando", async () => {
  const { anotarPorRetomar, leerAjustes } = await import("./proyecto.ts");
  const { lanzarLoPorRetomar } = await import("./corridas.ts");
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/ajustes", { comandos: { build: "true", test: "", lint: "", ramaBase: "main" } }, "PUT");
  await pedir("/api/requerimientos", { texto: "## Una\nA.\n\n## Otra\nB.", porSeccion: true });
  await anotarPorRetomar(["F-001"], null);
  await anotarPorRetomar(["F-002", "F-001"], "http://127.0.0.1:3211");
  assert.deepEqual((await leerAjustes()).porRetomar, { raiz: proyectoActual, tareas: ["F-001", "F-002"], origen: "http://127.0.0.1:3211" });

  // Si la corrida que terminó ya las tomó, no se lanza nada, y lo anotado se borra.
  assert.deepEqual(await lanzarLoPorRetomar(), []);
  assert.equal((await leerAjustes()).porRetomar, undefined);

  // Si alguna sigue en aprobación, se lanza su corrida (aquí falla antes: no hay ruta de Claude Code).
  ponerEnEstado("F-002", "aprobacion");
  await anotarPorRetomar(["F-001", "F-002"], null);
  await assert.rejects(lanzarLoPorRetomar(), /FACTORIA_CLAUDE_CODE_BIN/);
  // Pedir que siga, sin corrida en marcha, intenta lanzarla ahora.
  assert.match(String(((await pedir("/api/corridas", { accion: "continuar", tareas: ["F-002"] })).datos as { error: string }).error), /FACTORIA_CLAUDE_CODE_BIN/);

  // Lo que espera a una persona se lanza solo si ya tiene una respuesta suya que nadie retomó.
  ponerEnEstado("F-002", "hecho");
  ponerEnEstado("F-001", "necesita-humano", { motivo: "¿Cuál?", actualizada: "2026-10-19T10:00:00.000Z" });
  await anotarPorRetomar(["F-001"], null);
  assert.deepEqual(await lanzarLoPorRetomar(), []);
  await pedir("/api/respuesta", { tarea: "F-001", texto: "La primera.", por: "persona" });
  await anotarPorRetomar(["F-001"], null);
  await assert.rejects(lanzarLoPorRetomar(), /FACTORIA_CLAUDE_CODE_BIN/);
});

test("de la salida de la corrida sale quién trabaja cada tarea y qué está haciendo", async () => {
  const { procesarLinea } = await import("./corridas.ts");
  const c = { id: "20261019T130000", proyecto: "/p", tareas: [], inicio: "2026-10-19T13:00:00.000Z", estado: "corriendo" as const, lineas: [] };
  const linea = (j: unknown) => procesarLinea(c, JSON.stringify(j));
  const usa = (id: string, name: string, input: unknown, padre: string | null = null) => linea({ type: "assistant", parent_tool_use_id: padre, message: { content: [{ type: "tool_use", id, name, input }] } });
  const vuelve = (id: string, content: string) => linea({ type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: id, content }] } });

  usa("t1", "Agent", { subagent_type: "fabrica:constructor", description: "Construir F-012 reactivación usuario", prompt: "Trabaja en el worktree…" });
  usa("s1", "Read", { file_path: "WolffWeb/Controllers/UsuariosController.cs" }, "t1");
  usa("s2", "Edit", { file_path: "WolffWeb/Controllers/UsuariosController.cs" }, "t1");
  usa("t2", "mcp__fabrica__verificar", { tarea: "F-010" });
  vuelve("t2", "F-010: verificación OK");
  usa("t3", "Agent", { subagent_type: "otro-mod:revision-de-codigo", description: "Revisión de código", prompt: "Revisa F-011 en su worktree" });
  vuelve("t3", "Async agent launched successfully. agentId: x");
  usa("t4", "Agent", { subagent_type: "general-purpose", description: "Algo sin tarea", prompt: "nada" });

  type A = { tarea: string | null; agente: string; ultimo?: string; hasta?: string; segundoPlano?: boolean };
  const actividad = (c as { actividad?: A[] }).actividad!;
  assert.deepEqual(
    Object.fromEntries(actividad.map((a) => [a.tarea ?? "sin", [a.agente, a.ultimo ?? null, !!a.hasta, !!a.segundoPlano]])),
    {
      // El constructor sigue: lo último que hizo es su Edit.
      "F-012": ["fabrica:constructor", "Edit WolffWeb/Controllers/UsuariosController.cs", false, false],
      // La verificación de la fábrica ya terminó.
      "F-010": ["la fábrica", null, true, false],
      // Lanzado en segundo plano: que contestó que arrancó no quiere decir que terminó.
      "F-011": ["otro-mod:revision-de-codigo", null, false, true],
      sin: ["general-purpose", null, false, false],
    },
  );
});

test("el agente de cada etapa se elige entre los de este equipo, y los de un mod viajan con la corrida sin sus guardas", async () => {
  const { agentesParaInyectar, agenteDesde } = await import("./agentes.ts");
  // Un mod de prueba en CLAUDE_CODE_PLUGIN_DIRS, con un agente.
  const plugin = mkdtempSync(path.join(os.tmpdir(), "fabrica-plugin-"));
  mkdirSync(path.join(plugin, ".claude-plugin"), { recursive: true });
  mkdirSync(path.join(plugin, "agents"));
  writeFileSync(path.join(plugin, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "otro-mod" }));
  writeFileSync(path.join(plugin, "agents", "constructor-prueba.md"), '---\nname: constructor-prueba\ndescription: "Construye lo pedido."\ntools: Read, Edit, Bash\nmodel: inherit\n---\n\n# Constructor de prueba\n\nConstruye.\n');
  const antes = process.env.CLAUDE_CODE_PLUGIN_DIRS;
  process.env.CLAUDE_CODE_PLUGIN_DIRS = plugin;
  try {
    proyectoActual = proyectoNuevo();
    await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
    await pedir("/api/ajustes", { accion: "inicializar" });
    type Agentes = { porRol: Record<string, string>; paraleloMax: number; disponibles: { nombre: string; enCorridas: string; origen: string }[] };
    const leer = async () => ((await pedir("/api/ajustes")).datos as { agentes: Agentes }).agentes;
    const a = await leer();
    assert.equal(a.porRol.construccion, "auto");
    assert.equal(a.paraleloMax, 2);
    // Los de la fábrica salen del plugin de la aplicación (en las pruebas, la carpeta de trabajo es otra).
    const { definicionesDisponibles } = await import("./agentes.ts");
    const conLaFabrica = await definicionesDisponibles(proyectoActual, path.resolve(import.meta.dirname, "..", "..", "..", "..", "fabrica"));
    assert.ok(conLaFabrica.some((x) => x.nombre === "fabrica:constructor" && x.enCorridas === "si"));
    assert.ok(a.disponibles.some((x) => x.nombre === "otro-mod:constructor-prueba" && x.enCorridas === "inyectado"));
    // Lo que se muestra no lleva el prompt ni la ruta del agente.
    assert.doesNotMatch(JSON.stringify(a.disponibles), /Construye\.\\n|agents[\\/]/);

    assert.equal((await pedir("/api/ajustes", { agenteDeRol: { rol: "construccion", valor: "otro-mod:constructor-prueba" } }, "PUT")).estado, 200);
    assert.equal((await pedir("/api/ajustes", { agenteDeRol: { rol: "construccion", valor: "otro-mod:no-existe" } }, "PUT")).estado, 409);
    assert.equal((await pedir("/api/ajustes", { agenteDeRol: { rol: "orquestador", valor: "auto" } }, "PUT")).estado, 409);
    assert.equal((await pedir("/api/ajustes", { paraleloMax: 4 }, "PUT")).estado, 200);
    assert.equal((await pedir("/api/ajustes", { paraleloMax: 9 }, "PUT")).estado, 409);
    const datos = partir(readFileSync(path.join(proyectoActual, "factory", "config.md"), "utf8")).datos;
    assert.deepEqual([datos.agente_construccion, datos.paralelo_max], ["otro-mod:constructor-prueba", "4"]);
    assert.deepEqual([(await leer()).porRol.construccion, (await leer()).paraleloMax], ["otro-mod:constructor-prueba", 4]);

    // Lo que viaja con la corrida: el agente elegido, con su nombre sin el del plugin.
    const def = { ...agenteDesde(readFileSync(path.join(plugin, "agents", "constructor-prueba.md"), "utf8"), "x.md")!, nombre: "otro-mod:constructor-prueba", enCorridas: "inyectado" as const };
    const fabrica = { ...def, nombre: "fabrica:constructor", enCorridas: "si" as const };
    assert.deepEqual(agentesParaInyectar({ construccion: "otro-mod:constructor-prueba", aprobacion: "otro-mod:constructor-prueba", spec: "fabrica:constructor" }, [def, fabrica]), {
      "constructor-prueba": { description: "Construye lo pedido.", prompt: "# Constructor de prueba\n\nConstruye.", tools: ["Read", "Edit", "Bash", "mcp__fabrica__aprobar"] },
    });
    assert.deepEqual(agentesParaInyectar({ construccion: "otro-mod:constructor-prueba" }, [def]), { "constructor-prueba": { description: "Construye lo pedido.", prompt: "# Constructor de prueba\n\nConstruye.", tools: ["Read", "Edit", "Bash"] } });
    assert.deepEqual(agentesParaInyectar({ construccion: "auto" }, [def]), {});
    // Un agente de un mod elegido para seguridad viaja con las del validador, sin tocar su archivo.
    assert.deepEqual(agentesParaInyectar({ revision_seguridad: "otro-mod:constructor-prueba" }, [def])["constructor-prueba"]?.tools, [
      "Read", "Edit", "Bash", "mcp__ley21719-validator__validate_csharp_backend", "mcp__ley21719-validator__validate_frontend", "mcp__ley21719-validator__validate_sql_ddl",
    ]);
    assert.match(readFileSync(path.join(plugin, "agents", "constructor-prueba.md"), "utf8"), /^tools: Read, Edit, Bash$/m);
    // El revisor de seguridad de la fábrica las trae en su archivo, sin la que se conecta a una base.
    const seguridad = conLaFabrica.find((x) => x.nombre === "fabrica:revisor-seguridad")!;
    assert.ok(["validate_csharp_backend", "validate_frontend", "validate_sql_ddl"].every((t) => seguridad.tools.includes(`mcp__ley21719-validator__${t}`)));
    assert.ok(!seguridad.tools.some((t) => t.includes("sql_server_instance")));
  } finally {
    if (antes === undefined) delete process.env.CLAUDE_CODE_PLUGIN_DIRS;
    else process.env.CLAUDE_CODE_PLUGIN_DIRS = antes;
  }
});

test("cada etapa con habilidades lleva su agente con ellas cargadas, copia del que usaría; las demás, nada", async () => {
  const { agenteDelRol, agentesConHabilidades, nombreConHabilidades } = await import("./agentes.ts");
  const def = (nombre: string, enCorridas: "si" | "inyectado", tools: string[] = ["Read", "Edit"]) => ({ nombre, descripcion: `Es ${nombre}.`, prompt: `# ${nombre}`, tools, model: null, archivo: "x.md", enCorridas });
  const defs = [
    def("fabrica:spec-escritor", "si"),
    def("fabrica:constructor", "si"),
    def("fabrica:revisor-codigo", "si"),
    def("fabrica:revisor-seguridad", "si"),
    def("fabrica:revisor-ui", "si"),
    def("fabrica:aprobador", "si", ["Read", "Grep"]),
    def("otro-mod:implementacion", "inyectado"),
    def("mi-constructor", "si"),
  ];
  const auto = { spec: "auto", construccion: "auto", revision_codigo: "auto", revision_seguridad: "auto", ui: "auto", aprobacion: "auto" };
  // En auto, un preferido que la corrida no carga no cuenta; uno elegido, sí (viaja con --agents).
  assert.equal(agenteDelRol("construccion", "auto", defs)?.nombre, "fabrica:constructor");
  assert.equal(agenteDelRol("construccion", "otro-mod:implementacion", defs)?.nombre, "otro-mod:implementacion");
  assert.equal(agenteDelRol("construccion", "mi-constructor", defs)?.nombre, "mi-constructor");
  assert.equal(agenteDelRol("construccion", "no-existe", defs)?.nombre, "fabrica:constructor");
  assert.equal(nombreConHabilidades("revision_codigo"), "fabrica-hab-revision-codigo");

  const porEtapa = { spec: [], construccion: [{ nombre: "wolff-db" }, { nombre: "wolff-db" }], revision: [{ nombre: "ditab-view" }], aprobacion: [{ nombre: "ditab-view" }] };
  const agentes = agentesConHabilidades({ ...auto, construccion: "mi-constructor" }, defs, porEtapa);
  assert.deepEqual(Object.keys(agentes).sort(), ["fabrica-hab-aprobacion", "fabrica-hab-construccion", "fabrica-hab-revision-codigo", "fabrica-hab-revision-seguridad", "fabrica-hab-ui"]);
  assert.deepEqual(agentes["fabrica-hab-construccion"], { description: "Es mi-constructor.", prompt: "# mi-constructor", tools: ["Read", "Edit"], skills: ["wolff-db"] });
  assert.deepEqual(agentes["fabrica-hab-ui"]?.skills, ["ditab-view"]);
  // El de aprobación lleva la herramienta con que registra su veredicto.
  assert.deepEqual(agentes["fabrica-hab-aprobacion"]?.tools, ["Read", "Grep", "mcp__fabrica__aprobar"]);
  // El de seguridad lleva las tres del validador que analizan código, y no la que se conecta a una base.
  const validador = ["mcp__ley21719-validator__validate_csharp_backend", "mcp__ley21719-validator__validate_frontend", "mcp__ley21719-validator__validate_sql_ddl"];
  assert.deepEqual(agentes["fabrica-hab-revision-seguridad"]?.tools, ["Read", "Edit", ...validador]);
  assert.deepEqual(agentes["fabrica-hab-revision-codigo"]?.tools, ["Read", "Edit"]);
  assert.deepEqual(agentes["fabrica-hab-ui"]?.tools, ["Read", "Edit"]);
  assert.doesNotMatch(JSON.stringify(agentes), /validate_sql_server_instance/);
  // Uno sin lista (todas las herramientas) queda sin lista: sumarle algo la acotaría.
  const sinLista = agentesConHabilidades({ ...auto, revision_seguridad: "abierto" }, [...defs, def("abierto", "si", [])], porEtapa);
  assert.equal(sinLista["fabrica-hab-revision-seguridad"]?.tools, undefined);
  assert.deepEqual(agentesConHabilidades(auto, defs, { spec: [], construccion: [], revision: [], aprobacion: [] }), {});
});

test("el rendimiento por habilidad cuenta las tareas cuyo agente la trajo, y cuántas volvieron a construcción después", async () => {
  const { rendimientoDeHabilidades } = await import("./informes.ts");
  const encargo = (id: string, tarea: string, agente: string, desde: string) => ({ id, tarea, agente, que: "x", desde });
  const corridas = [
    {
      habilidades: { construccion: [{ nombre: "wolff-db", huella: "8cb1200c" }], revision: [{ nombre: "ditab-view", huella: "0000aaaa" }] },
      actividad: [
        encargo("1", "F-001", "fabrica-hab-construccion", "2026-10-27T10:00:00Z"),
        encargo("2", "F-002", "fabrica-hab-construccion", "2026-10-27T10:00:00Z"),
        encargo("3", "F-001", "fabrica-hab-revision-codigo", "2026-10-27T11:00:00Z"),
        encargo("4", "F-003", "fabrica:constructor", "2026-10-27T10:00:00Z"),
      ],
    },
    // Una corrida de antes, sin habilidades: no cuenta.
    { actividad: [encargo("5", "F-004", "fabrica-hab-construccion", "2026-10-20T10:00:00Z")] },
  ];
  const eventos = [
    { ts: "2026-10-27T11:30:00Z", tarea: "F-001", de: "revision" as const, a: "construccion" as const, agente: "orquestador" },
    // Una vuelta de antes del encargo no cuenta.
    { ts: "2026-10-27T09:00:00Z", tarea: "F-002", de: "revision" as const, a: "construccion" as const, agente: "orquestador" },
  ];
  assert.deepEqual(rendimientoDeHabilidades(eventos, corridas), [
    { nombre: "wolff-db", tareas: 2, volvieron: 1, etapas: ["construccion"], huellas: ["8cb1200c"] },
    { nombre: "ditab-view", tareas: 1, volvieron: 1, etapas: ["revision"], huellas: ["0000aaaa"] },
  ]);
});

test("al terminar una corrida detenida o caída, se sueltan las tareas que tenía tomadas su sesión, y solo esas", async () => {
  const { liberarTomadasPor } = await import("./proyecto.ts");
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/requerimientos", { texto: "## Una\nA.\n\n## Otra\nB.", porSeccion: true });
  const hasta = new Date(Date.now() + 20 * 60_000).toISOString();
  ponerEnEstado("F-001", "construccion", { tomada_por: "sesion-detenida", tomada_hasta: hasta });
  ponerEnEstado("F-002", "revision", { tomada_por: "otra-sesion", tomada_hasta: hasta });
  assert.deepEqual(await liberarTomadasPor("sesion-detenida"), ["F-001"]);
  const leer = (id: string) => readFileSync(path.join(proyectoActual, "factory", "tareas", tareasEnDisco().find((x) => x.startsWith(id))!), "utf8");
  assert.deepEqual([partir(leer("F-001")).datos.tomada_por, partir(leer("F-001")).datos.estado], ["", "construccion"]);
  assert.match(leer("F-001"), /la corrida que la trabajaba terminó: queda libre/);
  assert.equal(partir(leer("F-002")).datos.tomada_por, "otra-sesion");
});

test("los topes de gasto: con el del día alcanzado no se lanza; y el costo de cada tarea sale de su actividad", async () => {
  const { topeAlcanzado, carpetaDeCorridas } = await import("./corridas.ts");
  const { costoPorTarea } = await import("./informes.ts");
  assert.equal(topeAlcanzado(undefined, { corrida: 99, hoy: 99 }), null);
  assert.match(topeAlcanzado({ corridaUsd: 2 }, { corrida: 2.5, hoy: 0 }) ?? "", /la corrida llegó a 2,50 USD, y el tope por corrida es 2,00 USD/);
  assert.match(topeAlcanzado({ diarioUsd: 10 }, { corrida: 0, hoy: 12 }) ?? "", /hoy van 12,00 USD/);
  assert.equal(topeAlcanzado({ diarioUsd: 10, corridaUsd: 5 }, { corrida: 1, hoy: 3 }), null);

  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/ajustes", { comandos: { build: "true", test: "", lint: "", ramaBase: "main" } }, "PUT");
  // Una corrida de hoy en este proyecto que costó 5 USD.
  mkdirSync(carpetaDeCorridas(), { recursive: true });
  const ahora = new Date();
  writeFileSync(path.join(carpetaDeCorridas(), "20261019T080000.json"), JSON.stringify({ id: "20261019T080000", proyecto: proyectoActual, tareas: [], inicio: ahora.toISOString(), comando: "x", estado: "terminada", fin: ahora.toISOString(), costoUsd: 5 }));
  assert.equal((await pedir("/api/ajustes", { topes: { diarioUsd: -1, corridaUsd: null } }, "PUT")).estado, 409);
  assert.equal((await pedir("/api/ajustes", { topes: { diarioUsd: 3, corridaUsd: 1.5 } }, "PUT")).estado, 200);
  const a = (await pedir("/api/ajustes")).datos as { topes: unknown; gastoHoyUsd: number };
  assert.deepEqual([a.topes, a.gastoHoyUsd], [{ diarioUsd: 3, corridaUsd: 1.5 }, 5]);
  // El gasto de cada día de las dos últimas semanas, hoy al final.
  const { gastoPorDia } = (await pedir("/api/ajustes")).datos as { gastoPorDia: { dia: string; usd: number }[] };
  assert.equal(gastoPorDia.length, 14);
  assert.deepEqual(gastoPorDia.at(-1), { dia: ahora.toLocaleDateString("sv"), usd: 5 });
  assert.equal(gastoPorDia.slice(0, -1).reduce((t, d) => t + d.usd, 0), 0);
  process.env.FACTORIA_CLAUDE_CODE_BIN = path.join(proyectoActual, "no-se-lanza", "claude");
  const r = await pedir("/api/corridas", { accion: "iniciar" });
  assert.equal(r.estado, 409);
  assert.match(String((r.datos as { error: string }).error), /hoy van 5,00 USD[^]*tope del día es 3,00 USD/);
  await pedir("/api/ajustes", { topes: { diarioUsd: null, corridaUsd: null } }, "PUT");
  assert.deepEqual(((await pedir("/api/ajustes")).datos as { topes: unknown }).topes, {});

  // El costo de cada llamada se reparte entre las tareas con un encargo abierto a esa hora.
  const ev = (ts: string, cost_usd: number) => ({ t: "evento" as const, nombre: "api_request", ts, cost_usd });
  const actividad = [
    { id: "a", tarea: "F-001", agente: "fabrica:constructor", que: "x", desde: "2026-10-19T10:00:00.000Z", hasta: "2026-10-19T10:10:00.000Z" },
    { id: "b", tarea: "F-002", agente: "fabrica:constructor", que: "y", desde: "2026-10-19T10:05:00.000Z" },
  ];
  const c = costoPorTarea([ev("2026-10-19T10:01:00.000Z", 1), ev("2026-10-19T10:06:00.000Z", 2), ev("2026-10-19T10:20:00.000Z", 3), ev("2026-10-19T09:00:00.000Z", 0.5)], actividad, "2026-10-19T10:30:00.000Z");
  assert.deepEqual(c, { tareas: [{ tarea: "F-002", usd: 4 }, { tarea: "F-001", usd: 2 }], sinTarea: 0.5 });

  // En el tablero, lo de cada tarea se suma en todas las corridas del proyecto que trajeron telemetría.
  const corrida = (id: string, proyecto: string, eventos: ReturnType<typeof ev>[]) => {
    writeFileSync(path.join(carpetaDeCorridas(), `${id}.json`), JSON.stringify({ id, proyecto, tareas: [], inicio: "2026-10-19T10:00:00.000Z", comando: "x", estado: "terminada", fin: "2026-10-19T10:30:00.000Z", conTelemetria: true, actividad }));
    writeFileSync(path.join(carpetaDeCorridas(), `${id}.telemetria.jsonl`), eventos.map((e) => `${JSON.stringify(e)}\n`).join(""));
  };
  corrida("20261019T100000", proyectoActual, [ev("2026-10-19T10:01:00.000Z", 1)]);
  corrida("20261019T110000", proyectoActual, [ev("2026-10-19T10:06:00.000Z", 2)]);
  corrida("20261019T120000", "/otro/proyecto", [ev("2026-10-19T10:01:00.000Z", 50)]);
  const { costos } = (await pedir("/api/fabrica")).datos as { costos: Record<string, number> };
  assert.deepEqual(costos, { "F-001": 2, "F-002": 1 });

  // Su historial: sus pasos de la bitácora, con quién y por qué, y lo que costó en cada corrida.
  const eventos = [
    { ts: "2026-10-19T10:00:00.000Z", tarea: "F-001", de: null, a: "pendiente", agente: "aplicacion", nota: "creada" },
    { ts: "2026-10-19T10:05:00.000Z", tarea: "F-002", de: null, a: "pendiente" },
    { ts: "2026-10-19T10:10:00.000Z", tarea: "F-001", de: "revision", a: "construccion", agente: "fabrica:revisor-codigo", nota: "falta validar el RUT" },
  ];
  writeFileSync(path.join(proyectoActual, "factory", "eventos.jsonl"), eventos.map((e) => `${JSON.stringify(e)}\n`).join(""));
  assert.deepEqual((await pedir("/api/historial?tarea=F-001")).datos, {
    tarea: "F-001",
    pasos: [
      { ts: "2026-10-19T10:00:00.000Z", de: null, a: "pendiente", agente: "aplicacion", nota: "creada" },
      { ts: "2026-10-19T10:10:00.000Z", de: "revision", a: "construccion", agente: "revisor-codigo", nota: "falta validar el RUT" },
    ],
    corridas: [
      { id: "20261019T110000", inicio: "2026-10-19T10:00:00.000Z", usd: 1 },
      { id: "20261019T100000", inicio: "2026-10-19T10:00:00.000Z", usd: 1 },
    ],
    // Este proyecto no tiene el archivo de F-001: sin secciones.
    secciones: null,
  });
  // Con su archivo, lo que dice: su pedido, su spec y los hallazgos (sin los marcadores de la plantilla).
  await pedir("/api/requerimientos", { texto: "## Filtro por tienda\nQue se pueda filtrar.", porSeccion: true });
  const { secciones } = (await pedir("/api/historial?tarea=F-001")).datos as { secciones: Record<string, string> };
  assert.deepEqual(secciones, { pedido: secciones.pedido, spec: "", hallazgos: "", respuesta: "", paraElPR: "", probarAMano: "" });
  assert.match(secciones.pedido, /Que se pueda filtrar\./);
  assert.equal((await pedir("/api/historial?tarea=..")).estado, 400);
});

test("los cambios de una tarea son los de su worktree desde donde salió, con y sin commit, sin los de la fábrica; de una integrada se dice", async () => {
  const { cambiosDeLaTarea, cifrasDelDiff } = await import("./proyecto.ts");
  proyectoActual = proyectoNuevo();
  const g = (args: string[], cwd = proyectoActual) => execFileSync("git", ["-c", "user.email=prueba@example.com", "-c", "user.name=prueba", ...args], { cwd, encoding: "utf8" });
  repoEn(proyectoActual, "main");
  writeFileSync(path.join(proyectoActual, ".gitignore"), "node_modules/\n");
  writeFileSync(path.join(proyectoActual, "app.js"), "uno\ndos\n");
  g(["add", "-A"]);
  g(["commit", "-qm", "inicio"]);
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/requerimientos", { texto: "## Una\nA.\n\n## Otra\nB.", porSeccion: true });
  // Lo que la rama de origen avanzó después de que la tarea salió no es de la tarea.
  const wt = path.join(mkdtempSync(path.join(os.tmpdir(), "fabrica-wt-")), "F-001");
  g(["worktree", "add", "-q", wt, "-b", "fabrica/F-001"]);
  writeFileSync(path.join(proyectoActual, "otro.js"), "de main\n");
  g(["add", "otro.js"]);
  g(["commit", "-qm", "main sigue"]);
  writeFileSync(path.join(wt, "app.js"), "uno\nDOS\ntres\n");
  g(["commit", "-qam", "F-001"], wt);
  writeFileSync(path.join(wt, "app.js"), "uno\nDOS\ntres\ncuatro\n");
  writeFileSync(path.join(wt, "nuevo.js"), "sin commit\n");
  mkdirSync(path.join(wt, "factory"), { recursive: true });
  writeFileSync(path.join(wt, "factory", "x.md"), "de la fábrica\n");
  ponerEnEstado("F-001", "aprobacion", { worktree: wt, rama_origen: "main" });

  const c = await cambiosDeLaTarea("F-001");
  assert.ok("diff" in c, JSON.stringify(c));
  assert.equal(c.base, "main");
  assert.deepEqual(c.archivos, [
    { ruta: "app.js", agregadas: 3, quitadas: 1, nuevo: false },
    { ruta: "nuevo.js", agregadas: null, quitadas: null, nuevo: true },
  ]);
  assert.match(c.diff, /^-dos$[^]*^\+DOS$[^]*^\+cuatro$/m);
  assert.doesNotMatch(c.diff, /otro\.js|factory/);

  ponerEnEstado("F-001", "hecho", { worktree: wt, rama_origen: "main", integrada: "abc1234def" });
  assert.match((await cambiosDeLaTarea("F-001") as { motivo: string }).motivo, /Ya está integrada en main, con el commit abc1234/);
  assert.match((await cambiosDeLaTarea("F-002") as { motivo: string }).motivo, /Todavía no tiene su worktree/);
  assert.match((await cambiosDeLaTarea("F-099") as { motivo: string }).motivo, /No hay una tarea con ese id/);
  assert.equal((await pedir("/api/cambios?tarea=../x")).estado, 400);
  assert.deepEqual(cifrasDelDiff("3\t1\tapp.js\n-\t-\tlogo.png\n"), [
    { ruta: "app.js", agregadas: 3, quitadas: 1, nuevo: false },
    { ruta: "logo.png", agregadas: null, quitadas: null, nuevo: false },
  ]);
});

test("el rendimiento de cada agente: sus encargos, su tiempo, su costo, lo que devolvió y lo que le devolvieron", async () => {
  const { rendimientoDe } = await import("./informes.ts");
  const ts = (min: number) => new Date(Date.UTC(2026, 9, 19, 10, min)).toISOString();
  const eventos = [
    { ts: ts(0), tarea: "F-001", de: "spec" as const, a: "construccion" as const, agente: "orquestador" },
    { ts: ts(10), tarea: "F-001", de: "construccion" as const, a: "revision" as const, agente: "orquestador" },
    // El revisor no la deja pasar: la mueve el orquestador, pero la devolvió el revisor.
    { ts: ts(20), tarea: "F-001", de: "revision" as const, a: "construccion" as const, agente: "orquestador", nota: "falta el RUT" },
    { ts: ts(30), tarea: "F-001", de: "construccion" as const, a: "revision" as const, agente: "orquestador" },
  ];
  const actividad = [
    { id: "a", tarea: "F-001", agente: "fabrica:constructor", que: "Construir", desde: ts(1), hasta: ts(9) },
    { id: "b", tarea: "F-001", agente: "otro-mod:revision-de-codigo", que: "Revisar", desde: ts(11), hasta: ts(19) },
    { id: "c", tarea: "F-001", agente: "fabrica:constructor", que: "Corregir", desde: ts(21), hasta: ts(29) },
  ];
  const ev = (min: number, cost_usd: number) => ({ t: "evento" as const, nombre: "api_request", ts: ts(min), cost_usd });
  const r = rendimientoDe(eventos, [{ actividad, fin: ts(40), registros: [ev(5, 1), ev(15, 2), ev(25, 0.5), ev(35, 9)] }]);
  assert.deepEqual(r, [
    { agente: "fabrica:constructor", encargos: 2, tareas: 1, minutos: 16, usd: 1.5, devolvio: 0, leDevolvieron: 1, etapas: { construccion: 2 } },
    { agente: "otro-mod:revision-de-codigo", encargos: 1, tareas: 1, minutos: 8, usd: 2, devolvio: 1, leDevolvieron: 0, etapas: { revision: 1 } },
  ]);
  // Sin telemetría, el costo no se sabe.
  assert.equal(rendimientoDe(eventos, [{ actividad, fin: ts(40), registros: null }])[0]!.usd, null);
});

test("él descarta una tarea pendiente, en spec o en construcción, que nadie tomó; desde revisión en adelante, no", async () => {
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/requerimientos", { texto: "## Una\nA.\n\n## Otra\nB.\n\n## Tercera\nC.", porSeccion: true });
  const r = await pedir("/api/descartar", { tarea: "F-001", motivo: "  ya no   hace falta ", por: "persona" });
  assert.equal(r.estado, 200);
  assert.equal((await tareas()).find((t) => t.id === "F-001")?.estado, "descartada");
  const archivo = readFileSync(path.join(proyectoActual, "factory", "tareas", tareasEnDisco().find((x) => x.startsWith("F-001"))!), "utf8");
  assert.match(archivo, /· descartada por persona: ya no hace falta/);
  const ultimo = JSON.parse(readFileSync(path.join(proyectoActual, "factory", "eventos.jsonl"), "utf8").trim().split("\n").at(-1)!) as Record<string, unknown>;
  assert.deepEqual([ultimo.tarea, ultimo.de, ultimo.a, ultimo.agente, ultimo.nota], ["F-001", "pendiente", "descartada", "persona", "ya no hace falta"]);

  ponerEnEstado("F-002", "revision");
  assert.match(String(((await pedir("/api/descartar", { tarea: "F-002" })).datos as { error: string }).error), /está en «revision»: desde ahí no se descarta/);
  ponerEnEstado("F-003", "construccion", { tomada_por: "otra-sesion", tomada_hasta: new Date(Date.now() + 60_000).toISOString() });
  assert.match(String(((await pedir("/api/descartar", { tarea: "F-003" })).datos as { error: string }).error), /la tiene tomada una sesión/);
  assert.match(String(((await pedir("/api/descartar", { tarea: "F-001" })).datos as { error: string }).error), /está en «descartada»/);
});

test("las ramas de la fábrica: las integradas se limpian con su worktree, las sin integrar solo si él las elige, y las en curso no se tocan", async () => {
  const { limpiarRamas, ramasDeLaFabrica } = await import("./proyecto.ts");
  proyectoActual = proyectoNuevo();
  const g = (args: string[], cwd = proyectoActual) => execFileSync("git", ["-c", "user.email=prueba@example.com", "-c", "user.name=prueba", ...args], { cwd, encoding: "utf8" });
  repoEn(proyectoActual, "main");
  writeFileSync(path.join(proyectoActual, ".gitignore"), "node_modules/\nfactory/\n");
  writeFileSync(path.join(proyectoActual, "app.js"), "uno\n");
  g(["add", "-A"]);
  g(["commit", "-qm", "inicio"]);
  mkdirSync(path.join(proyectoActual, "node_modules", "dummy"), { recursive: true });
  writeFileSync(path.join(proyectoActual, "node_modules", "dummy", "index.js"), "1\n");
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/requerimientos", { texto: "## Una\nA.\n\n## Dos\nB.\n\n## Tres\nC.\n\n## Cuatro\nD.", porSeccion: true });
  const fuera = mkdtempSync(path.join(os.tmpdir(), "fabrica-wt-"));
  const conCommit = (id: string, integrar: boolean) => {
    const wt = path.join(fuera, id);
    g(["worktree", "add", "-q", wt, "-b", `fabrica/${id}`]);
    writeFileSync(path.join(wt, `${id}.txt`), "hecho\n");
    g(["add", "-A"], wt);
    g(["commit", "-qm", id], wt);
    if (integrar) g(["merge", "-q", "--ff-only", `fabrica/${id}`]);
    return wt;
  };
  // F-001 y F-002, hechas e integradas: F-001 con su node_modules enlazado a la raíz, F-002 con un cambio sin commit.
  ponerEnEstado("F-001", "hecho", { integrada: "abc123", worktree: conCommit("F-001", true) });
  symlinkSync(path.join(proyectoActual, "node_modules"), path.join(fuera, "F-001", "node_modules"), "junction");
  ponerEnEstado("F-002", "hecho", { integrada: "abc123", worktree: conCommit("F-002", true) });
  writeFileSync(path.join(fuera, "F-002", "F-002.txt"), "cambiado\n");
  // F-003, descartada con un commit sin integrar, y su carpeta borrada a mano: git todavía cree que tiene worktree.
  ponerEnEstado("F-003", "descartada", { worktree: conCommit("F-003", false) });
  rmSync(path.join(fuera, "F-003"), { recursive: true, force: true });
  // F-004, en construcción: su rama no se toca.
  ponerEnEstado("F-004", "construccion", { worktree: conCommit("F-004", false) });
  // Una rama de una tarea que ya no existe, sin nada que main no tenga.
  g(["branch", "fabrica/F-099"]);

  const antes = await ramasDeLaFabrica();
  assert.deepEqual(antes.integradas.map((r) => r.rama), ["fabrica/F-001", "fabrica/F-002", "fabrica/F-099"]);
  assert.deepEqual(antes.sinIntegrar.map((r) => [r.rama, r.estado, r.commits, r.base]), [["fabrica/F-003", "descartada", 1, "main"]]);
  assert.deepEqual(antes.enCurso, ["fabrica/F-004"]);
  assert.equal(antes.integradas.find((r) => r.rama === "fabrica/F-099")?.tarea, "F-099");

  // Sin elegir ninguna: las integradas, salvo la del worktree con cambios. Lo sin integrar queda.
  const r = await limpiarRamas([]);
  assert.deepEqual(r.limpiadas, ["fabrica/F-001", "fabrica/F-099"]);
  assert.deepEqual(r.saltadas, [{ rama: "fabrica/F-002", motivo: "su worktree tiene cambios sin commit" }]);
  assert.equal(existsSync(path.join(fuera, "F-001")), false);
  assert.equal(existsSync(path.join(proyectoActual, "node_modules", "dummy", "index.js")), true);
  assert.match(g(["branch", "--list", "fabrica/F-003"]), /F-003/);
  assert.match(g(["branch", "--list", "fabrica/F-004"]), /F-004/);

  // Elegida, la descartada se borra aunque tenga su commit; una en curso, aunque se pida, no.
  const elegidas = await limpiarRamas(["fabrica/F-003", "fabrica/F-004"]);
  assert.deepEqual(elegidas.limpiadas, ["fabrica/F-003"]);
  assert.deepEqual(elegidas.saltadas, [
    { rama: "fabrica/F-004", motivo: "ya no está entre las que se pueden borrar" },
    { rama: "fabrica/F-002", motivo: "su worktree tiene cambios sin commit" },
  ]);
  assert.doesNotMatch(g(["branch", "--list", "fabrica/F-003"]), /F-003/);
  assert.match(g(["branch", "--list", "fabrica/F-004"]), /F-004/);
  // El worktree de la carpeta borrada a mano quedó olvidado.
  assert.doesNotMatch(g(["worktree", "list"]), /F-003/);
});

test("las reglas y las notas del proyecto se cambian desde la configuración, sin tocar lo demás de config.md", async () => {
  proyectoActual = proyectoNuevo();
  await pedir("/api/ajustes", { raiz: proyectoActual }, "PUT");
  await pedir("/api/ajustes", { accion: "inicializar" });
  await pedir("/api/ajustes", { comandos: { build: "dotnet build X.sln", test: "", lint: "", ramaBase: "main" } }, "PUT");
  type R = { reglas: Record<string, string>; notas: string };
  const leerReglas = async () => ((await pedir("/api/ajustes")).datos as { reglas: R }).reglas;
  // La factory/ nueva pide el veredicto de los dos.
  assert.equal((await leerReglas()).reglas.aprobacion, "ambas");
  assert.match((await leerReglas()).notas, /Notas para los agentes/);

  assert.equal((await pedir("/api/ajustes", { reglas: { aprobacion: "agente", max_vueltas: 5, lint_extensiones: ".js" } }, "PUT")).estado, 200);
  assert.equal((await pedir("/api/ajustes", { reglas: { aprobacion: "nadie" } }, "PUT")).estado, 409);
  assert.equal((await pedir("/api/ajustes", { reglas: { build: "exit 0" } }, "PUT")).estado, 409);
  const notas = "Las vistas van en Views/.\nNo tocar Legacy/.";
  assert.equal((await pedir("/api/ajustes", { notas }, "PUT")).estado, 200);

  const { datos, cuerpo } = partir(readFileSync(path.join(proyectoActual, "factory", "config.md"), "utf8"));
  assert.deepEqual([datos.aprobacion, datos.max_vueltas, datos.lint_extensiones, datos.build, datos.agente_spec], ["agente", "5", ".js", "dotnet build X.sln", "auto"]);
  assert.equal(cuerpo.trim(), notas);
  assert.deepEqual([(await leerReglas()).reglas.aprobacion, (await leerReglas()).notas], ["agente", notas]);
});

/** Un proyecto con lo mínimo de una fábrica: su factory/config.md. */
function proyectoConFabrica(nombre: string) {
  const r = path.join(proyectoNuevo(), nombre);
  mkdirSync(path.join(r, "factory"), { recursive: true });
  writeFileSync(path.join(r, "factory", "config.md"), "---\nbuild: npm run build\n---\n");
  return r;
}
const tareasDe = (r: string) => (existsSync(path.join(r, "factory", "tareas")) ? readdirSync(path.join(r, "factory", "tareas")).filter((n) => n.endsWith(".md")).sort() : []);

test("unos ajustes de antes, con un solo proyecto, se leen como una línea, y se guardan así desde el próximo cambio", async () => {
  const r = proyectoConFabrica("pos-tiendas");
  const archivo = path.join(carpetaDeLaFabrica(), "ajustes.json");
  mkdirSync(carpetaDeLaFabrica(), { recursive: true });
  writeFileSync(archivo, JSON.stringify({ raiz: r, llamarSola: true }));
  assert.equal(await raiz(), r);
  assert.deepEqual(await lineasDeLaFabrica(), [{ id: "pos-tiendas", nombre: "pos-tiendas", raiz: r }]);
  // Leer no reescribe el archivo.
  assert.deepEqual(JSON.parse(readFileSync(archivo, "utf8")), { raiz: r, llamarSola: true });
  // Al cambiar algo, queda la forma nueva, sin perder lo demás.
  const otra = proyectoConFabrica("saludos");
  await elegirProyecto(otra);
  const guardado = JSON.parse(readFileSync(archivo, "utf8"));
  assert.equal(guardado.raiz, undefined);
  assert.equal(guardado.llamarSola, true);
  assert.deepEqual(guardado.lineas.map((l: { id: string }) => l.id), ["pos-tiendas", "saludos"]);
  assert.equal(guardado.lineaActiva, "saludos");
  assert.equal(await raiz(), otra);
  // Volver a elegir un proyecto que ya es línea no la repite; dejar de mirarla no la borra.
  await elegirProyecto(r);
  assert.equal((await lineasDeLaFabrica()).length, 2);
  await elegirProyecto(null);
  assert.equal(await raiz(), null);
  assert.equal((await lineasDeLaFabrica()).length, 2);
  assert.equal((await leerAjustes()).lineaActiva, undefined);
});

test("una tarea se encola en la línea que se diga, con su id de esa línea, sin tocar las demás", async () => {
  // Las líneas quedan de una prueba a otra: cada una usa sus propias carpetas.
  const a = proyectoConFabrica("ventas");
  const b = proyectoConFabrica("bodega");
  await elegirProyecto(a);
  await elegirProyecto(b);
  await elegirProyecto(a);
  const enA = await crearTareaEn("ventas", { titulo: "Exportar ventas", pedido: "A CSV." });
  const enB = await crearTareaEn("bodega", { titulo: "Saludo de la mañana", pedido: "Que diga buenos días." });
  const otraEnB = await crearTareaEn("bodega", { titulo: "Saludo de la tarde", pedido: "Que diga buenas tardes.", dependeDe: ["F-001"] });
  assert.deepEqual([enA.id, enB.id, otraEnB.id], ["F-001", "F-001", "F-002"]);
  assert.deepEqual(tareasDe(a), ["F-001-exportar-ventas.md"]);
  assert.deepEqual(tareasDe(b), ["F-001-saludo-de-la-manana.md", "F-002-saludo-de-la-tarde.md"]);
  const { datos } = partir(readFileSync(path.join(b, "factory", "tareas", "F-002-saludo-de-la-tarde.md"), "utf8"));
  assert.deepEqual([datos.estado, datos.depende_de], ["pendiente", "F-001"]);
  // Cada evento va al eventos.jsonl de su línea.
  assert.equal(readFileSync(path.join(a, "factory", "eventos.jsonl"), "utf8").trim().split("\n").length, 1);
  assert.equal(readFileSync(path.join(b, "factory", "eventos.jsonl"), "utf8").trim().split("\n").length, 2);
  // La línea activa sigue siendo la misma.
  assert.equal(await raiz(), a);
});

test("una línea desconocida, un título vacío o largo, o una dependencia de otra línea, no crean nada", async () => {
  const a = proyectoConFabrica("caja");
  const b = proyectoConFabrica("turnos");
  await elegirProyecto(a);
  await elegirProyecto(b);
  await crearTareaEn("caja", { titulo: "Exportar ventas", pedido: "A CSV." });
  await crearTareaEn("caja", { titulo: "Filtro por tienda", pedido: "En el reporte." });
  await assert.rejects(crearTareaEn("caj", { titulo: "Algo", pedido: "Algo." }), /No hay ninguna línea «caj»/);
  await assert.rejects(crearTareaEn("turnos", { titulo: "  ", pedido: "Algo." }), /necesita un título/);
  await assert.rejects(crearTareaEn("turnos", { titulo: "x".repeat(81), pedido: "Algo." }), /hasta 80 caracteres/);
  await assert.rejects(crearTareaEn("turnos", { titulo: "Algo", pedido: " " }), /necesita un pedido/);
  // F-002 existe en caja, no en turnos.
  await assert.rejects(crearTareaEn("turnos", { titulo: "Algo", pedido: "Algo.", dependeDe: ["F-002"] }), /no es una tarea de la cola/);
  assert.deepEqual(tareasDe(b), []);
  assert.deepEqual(tareasDe(a), ["F-001-exportar-ventas.md", "F-002-filtro-por-tienda.md"]);
  // Sin factory/config.md, tampoco.
  const sinFabrica = path.join(proyectoNuevo(), "sin-fabrica");
  mkdirSync(sinFabrica);
  await elegirProyecto(sinFabrica);
  await assert.rejects(crearTareaEn("sin-fabrica", { titulo: "Algo", pedido: "Algo." }), /no tiene factory\/config\.md/);
});

test("los procesos de la línea se leen con sus problemas; la plantilla nace como borrador, en la rama de trabajo, y no pisa uno que exista", async () => {
  const r = proyectoConFabrica("publica");
  await elegirProyecto(r);
  type ConProcesos = { procesos: { existe: boolean; procesos: { archivo: string; rama: string; borrador: boolean; pasos: unknown[]; problemas: { linea: number | null; que: string }[] }[] } };
  assert.deepEqual(((await pedir("/api/ajustes")).datos as ConProcesos).procesos, { existe: false, procesos: [] });

  const creado = await pedir("/api/ajustes", { accion: "crear_proceso" });
  assert.equal(creado.estado, 200);
  const datos = creado.datos as ConProcesos & { procesoCreado: { creado: boolean; archivo: string } };
  assert.deepEqual(datos.procesoCreado, { creado: true, archivo: "publicar.md" });
  const p = datos.procesos.procesos[0]!;
  // Sin git no hay rama de trabajo: la plantilla pone una que no es protegida.
  assert.deepEqual([p.archivo, p.rama, p.borrador, p.pasos.length, p.problemas], ["publicar.md", "desarrollo", true, 7, []]);

  // Él lo cambia a mano; otra vez desde la plantilla no lo pisa.
  const archivo = path.join(r, "factory", "procesos", "publicar.md");
  writeFileSync(archivo, readFileSync(archivo, "utf8").replace("rama: desarrollo", "rama: main"));
  assert.equal(((await pedir("/api/ajustes", { accion: "crear_proceso" })).datos as { procesoCreado: { creado: boolean } }).procesoCreado.creado, false);
  writeFileSync(path.join(r, "factory", "procesos", "LEEME.md"), "No es un proceso.\n");
  writeFileSync(path.join(r, "factory", "procesos", "vigia.md"), "---\nid: vigia\nnombre: Vigía\ncuando: cada-dia\n---\n\n- [comando] npm audit | tee x\n");
  const despues = ((await pedir("/api/ajustes")).datos as ConProcesos).procesos.procesos;
  assert.deepEqual(despues.map((x) => x.archivo), ["publicar.md", "vigia.md"]);
  assert.match(despues[0]!.problemas.map((x) => x.que).join(), /no puede ser main/);
  assert.match(despues[1]!.problemas.map((x) => `${x.linea}: ${x.que}`).join(), /^7: .*shell/);

  // La evaluación, desde su plantilla: borrador, sin rama y sin problemas. Una segunda vez no la pisa.
  const evaluacion = await pedir("/api/ajustes", { accion: "crear_proceso", cual: "evaluacion" });
  const conEvaluacion = evaluacion.datos as ConProcesos & { procesoCreado: { creado: boolean; archivo: string } };
  assert.deepEqual(conEvaluacion.procesoCreado, { creado: true, archivo: "evaluacion.md" });
  const ev = conEvaluacion.procesos.procesos.find((x) => x.archivo === "evaluacion.md")!;
  assert.deepEqual([ev.rama, ev.borrador, ev.pasos.length, ev.problemas], ["", true, 1, []]);
  assert.equal(((await pedir("/api/ajustes", { accion: "crear_proceso", cual: "evaluacion" })).datos as { procesoCreado: { creado: boolean } }).procesoCreado.creado, false);
});

test("la memoria de una línea se crea con propuestas sembradas, sin reglas, sin pisar una que exista, y la de la planta aparte", async () => {
  const r = proyectoConFabrica("tienda");
  writeFileSync(path.join(r, "package.json"), JSON.stringify({ dependencies: { pg: "^8.11.3", "@prisma/client": "^5.22.0" } }));
  await elegirProyecto(r);
  const vault = path.join(r, "factory", "memoria");
  const creada = await pedir("/api/ajustes", { accion: "crear_memoria" });
  assert.equal(creada.estado, 200);
  // Los ajustes que vuelven ya la traen: la pantalla no sigue diciendo que no tiene.
  assert.equal((creada.datos as { memoria: { existe: boolean } }).memoria.existe, true);
  const archivos = await archivosDelVault(vault);
  assert.deepEqual(
    archivos.map((a) => a.ruta).filter((x) => !x.startsWith("propuestas/")),
    ["ficha.md", "LEEME.md"].sort((a, b) => a.localeCompare(b)),
  );
  // Lo sembrado son propuestas: la ficha queda sin reglas, y el vault cumple su propio formato.
  const v = leerVault(archivos);
  assert.deepEqual(leerFicha(archivos.find((a) => a.ruta === "ficha.md")!.texto).reglas, []);
  assert.deepEqual(v.propuestas.map((p) => [p.id, p.temas[0], p.regla, p.estado]), [
    ["P-0001", "base-de-datos", "PostgreSQL (pg 8.11.3).", "propuesta"],
    ["P-0002", "orm", "Prisma 5.22.0.", "propuesta"],
    ["P-0003", "nucleo", "`**/schema.prisma` — el esquema de Prisma, que cambia la base", "propuesta"],
  ]);
  assert.deepEqual(revisarVault(archivos), []);
  for (const c of ["decisiones", "propuestas", "bitacora"]) assert.ok(existsSync(path.join(vault, c, ".gitkeep")), c);
  const memoria = ((await pedir("/api/ajustes")).datos as { memoria: { existe: boolean; reglas: number; propuestas: number; problemas: unknown[] } }).memoria;
  assert.deepEqual([memoria.existe, memoria.reglas, memoria.propuestas, memoria.problemas.length], [true, 0, 3, 0]);

  // Crearla otra vez no pisa nada, ni siembra de nuevo.
  const ficha = path.join(vault, "ficha.md");
  writeFileSync(ficha, "# Ficha · tienda\n\n- [base-de-datos] PostgreSQL. (él, 2026-10-26)\n");
  const otra = (await pedir("/api/ajustes", { accion: "crear_memoria" })).datos as { memoriaCreada: { creado: boolean } };
  assert.equal(otra.memoriaCreada.creado, false);
  assert.match(readFileSync(ficha, "utf8"), /PostgreSQL\. \(él/);
  assert.equal(readdirSync(path.join(vault, "propuestas")).filter((n) => n.endsWith(".md")).length, 3);

  // La de la planta, aparte y sin siembra.
  assert.ok(existsSync(path.join(carpetaDeLaFabrica(), "memoria", "ficha.md")));
  assert.deepEqual(readdirSync(path.join(carpetaDeLaFabrica(), "memoria", "propuestas")), [".gitkeep"]);
});

test("con la memoria nace el catálogo de habilidades: las del proyecto sin asignar, sin pisar uno que exista, y su resumen en los ajustes", async () => {
  const r = proyectoConFabrica("con-habilidades");
  const habilidad = (dir: string, nombre: string, mas = "") => {
    mkdirSync(path.join(dir, nombre), { recursive: true });
    writeFileSync(path.join(dir, nombre, "SKILL.md"), `---\nname: ${nombre}\ndescription: Hace ${nombre}.\n${mas}---\n\nLo que no se lee.\n`);
  };
  habilidad(path.join(r, ".claude", "skills"), "ditab-view");
  habilidad(path.join(r, ".claude", "skills"), "desplegar", "disable-model-invocation: true\n");
  // Una suya, en su carpeta de Claude Code (la de la prueba).
  habilidad(path.join(process.env.CLAUDE_CONFIG_DIR!, "skills"), "wolff-db");
  await elegirProyecto(r);
  assert.equal((await pedir("/api/ajustes", { accion: "crear_memoria" })).estado, 200);
  const archivo = path.join(r, "factory", "habilidades.md");
  const texto = readFileSync(archivo, "utf8");
  assert.match(texto, /^# Habilidades · con-habilidades$/m);
  assert.match(texto, /## Sin asignar\n\n- desplegar: Hace desplegar\.\n- ditab-view: Hace ditab-view\./);
  assert.doesNotMatch(texto, /wolff-db/);
  type Resumen = { habilidades: { existe: boolean; usos: number; sinUsar: number; problemas: unknown[]; porEtapa: Record<string, string[]> } };
  const vacio = ((await pedir("/api/ajustes")).datos as Resumen).habilidades;
  // desplegar es solo a mano: no cuenta como sin usar.
  assert.deepEqual([vacio.existe, vacio.usos, vacio.sinUsar, vacio.problemas.length], [true, 0, 1, 0]);

  // Él asigna dos; una que no existe es un problema y no llega a ninguna etapa.
  writeFileSync(archivo, texto.replace("## Sin asignar", "- [construccion, revision] wolff-db: antes del SQL.\n- [spec] ditab-view: al pedir una vista.\n- [spec] no-existe: nunca.\n\n## Sin asignar"));
  const resumen = ((await pedir("/api/ajustes")).datos as Resumen).habilidades;
  assert.deepEqual([resumen.usos, resumen.sinUsar, resumen.problemas.length], [4, 0, 1]);
  assert.deepEqual(resumen.porEtapa, { spec: ["ditab-view"], construccion: ["wolff-db"], revision: ["wolff-db"], aprobacion: [] });
  // Lo que recibe cada etapa en una corrida: con su origen; la que no existe, no.
  const { habilidadesDeLaCorrida } = await import("../habilidades/disco.ts");
  const deLaCorrida = await habilidadesDeLaCorrida(r);
  assert.deepEqual(deLaCorrida?.construccion.map(({ nombre, cuando, origen }) => ({ nombre, cuando, origen })), [{ nombre: "wolff-db", cuando: "antes del SQL.", origen: "suya" }]);
  assert.deepEqual(deLaCorrida?.spec.map((h) => [h.nombre, h.origen]), [["ditab-view", "proyecto"]]);
  // Con su archivo y su huella, para la corrida; la huella es la de su contenido.
  const { habilidadesConHuella, huellaDe } = await import("../habilidades/formato.ts");
  const wolff = path.join(process.env.CLAUDE_CONFIG_DIR!, "skills", "wolff-db", "SKILL.md");
  assert.deepEqual(habilidadesConHuella(deLaCorrida!), {
    spec: [{ nombre: "ditab-view", huella: huellaDe(readFileSync(path.join(r, ".claude", "skills", "ditab-view", "SKILL.md"), "utf8")), origen: "proyecto", ruta: path.join(r, ".claude", "skills", "ditab-view", "SKILL.md") }],
    construccion: [{ nombre: "wolff-db", huella: huellaDe(readFileSync(wolff, "utf8")), origen: "suya", ruta: wolff }],
    revision: [{ nombre: "wolff-db", huella: huellaDe(readFileSync(wolff, "utf8")), origen: "suya", ruta: wolff }],
  });
  assert.equal(await habilidadesDeLaCorrida(proyectoNuevo()), null);

  // Crear la memoria otra vez no pisa el catálogo.
  rmSync(path.join(r, "factory", "memoria"), { recursive: true });
  await pedir("/api/ajustes", { accion: "crear_memoria" });
  assert.match(readFileSync(archivo, "utf8"), /\[construccion, revision\] wolff-db/);
});

test("quitar una línea la saca de la fábrica sin tocar su repositorio; si era la que se miraba, no queda ninguna", async () => {
  const a = proyectoConFabrica("quitable");
  const b = proyectoConFabrica("se-queda");
  await elegirProyecto(a);
  await crearTareaEn((await lineasDeLaFabrica()).find((l) => l.raiz === a)!.id, { titulo: "Algo", pedido: "Algo." });
  await elegirProyecto(b);
  const idA = (await lineasDeLaFabrica()).find((l) => l.raiz === a)!.id;
  const idB = (await lineasDeLaFabrica()).find((l) => l.raiz === b)!.id;

  // La que no se mira: sale, y la activa sigue.
  const r = await pedir("/api/ajustes", { accion: "quitar_linea", linea: idA });
  assert.equal(r.estado, 200);
  const d = r.datos as { quitada: { id: string; eraLaActiva: boolean }; lineas: { id: string; activa: boolean }[]; raiz: string };
  assert.deepEqual(d.quitada, { id: idA, nombre: "quitable", eraLaActiva: false });
  assert.ok(!d.lineas.some((l) => l.id === idA));
  assert.deepEqual(d.lineas.find((l) => l.id === idB)?.activa, true);
  assert.equal(d.raiz, b);
  // Su repositorio queda como estaba: su factory/ y su tarea.
  assert.deepEqual(tareasDe(a), ["F-001-algo.md"]);
  assert.ok(existsSync(path.join(a, "factory", "config.md")));

  // La que se mira: sale, y la fábrica queda sin proyecto elegido.
  const activa = (await pedir("/api/ajustes", { accion: "quitar_linea", linea: idB })).datos as { quitada: { eraLaActiva: boolean }; raiz: string };
  assert.equal(activa.quitada.eraLaActiva, true);
  assert.equal(activa.raiz, "");
  assert.equal((await leerAjustes()).lineaActiva, undefined);

  // Una que ya no está, o un id con otra forma, no.
  assert.equal((await pedir("/api/ajustes", { accion: "quitar_linea", linea: idA })).estado, 409);
  assert.equal((await pedir("/api/ajustes", { accion: "quitar_linea", linea: "../otra" })).estado, 400);
  // Elegir su carpeta otra vez la vuelve a agregar.
  await elegirProyecto(a);
  assert.ok((await lineasDeLaFabrica()).some((l) => l.raiz === a));
});

test("al crear la factory/ de un proyecto se crea su memoria; sin factory/, no", async () => {
  const sin = path.join(proyectoNuevo(), "sin-nada");
  mkdirSync(sin);
  writeFileSync(path.join(sin, "package.json"), JSON.stringify({ scripts: { build: "next build" }, dependencies: { next: "16.3.6" } }));
  await elegirProyecto(sin);
  assert.equal((await pedir("/api/ajustes", { accion: "crear_memoria" })).estado, 409);
  assert.equal(existsSync(path.join(sin, "factory", "memoria")), false);
  assert.equal((await pedir("/api/ajustes", { accion: "inicializar" })).estado, 200);
  const v = leerVault(await archivosDelVault(path.join(sin, "factory", "memoria")));
  assert.ok(v.ficha);
  assert.deepEqual(v.propuestas.map((p) => p.regla), ["Next.js 16.3.6."]);
});
