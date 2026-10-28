// Una corrida de verdad de la fábrica, con sus agentes, sobre un repo de prueba desechable: para
// probar lo que las pruebas y fabrica:e2e no alcanzan, que es cómo trabajan los agentes con lo
// que les da la aplicación. Las especialidades de la spec y del constructor con sus Nikkes, lo de
// IA del cerebro, Privaty en el aprobador, el modelo elegido en una tarea, sencilla o grande con
// Label escribiendo lo que se lee, y la guardia de las herramientas de nikke.
//
//   npm run fabrica:corrida-real                 (prepara todo y dice qué lanzaría: no gasta)
//   npm run fabrica:corrida-real -- --correr     (la corre de verdad: gasta)
//   npm run fabrica:corrida-real -- --correr --dejar   (no borra el repo al terminar)
//
// Gasta: es /fabrica:correr con dos tareas chicas, con la suscripción de Claude Code de este equipo
// (no con la clave de la API de la aplicación). Pregunta antes de correrla.
//
// No toca la aplicación: ni sus líneas, ni sus ajustes, ni datos/. Arma los agentes con las mismas
// funciones que usa la aplicación al lanzar una corrida, y lanza Claude Code por
// COMPANIA_CLAUDE_CODE_BIN o, sin ella, el del PATH, con solo el plugin de la fábrica, sin nikke. El repo vive en la
// carpeta temporal del sistema.

import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeCodeDeEsteEquipo, SIN_CLAUDE_CODE } from "../../src/lib/fabrica/motor/claude-code.ts";
import { agenteDeAnuncio, agenteDeRetrabajo, agenteDesde, agentesConHabilidades, archivoDelAgenteDeAnuncio, archivoDelAgenteDeRetrabajo, AGENTE_DE_ANUNCIO, definicionesDisponibles, textosDeNikkes } from "../../src/lib/fabrica/motor/agentes.ts";
import { habilidadesDeLaCorrida } from "../../src/lib/fabrica/habilidades/disco.ts";
import { habilidadesConHuella } from "../../src/lib/fabrica/habilidades/formato.ts";
import { tareaNueva } from "../../src/lib/fabrica/motor/formato.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PLUGIN = path.join(APP, "fabrica");
const correr = process.argv.includes("--correr");
const dejar = process.argv.includes("--dejar") || !correr;
/** Lo más que puede durar: si pasa, se corta y se dice. */
const TOPE_MS = 90 * 60_000;

const bin = claudeCodeDeEsteEquipo()?.ruta;
if (!bin) {
  console.error(SIN_CLAUDE_CODE);
  process.exit(1);
}

const BASE = mkdtempSync(path.join(os.tmpdir(), "fabrica-corrida-"));
const REPO = path.join(BASE, "repo");
const WTS = path.join(BASE, "repo-fabrica");
const PLANTA = path.join(BASE, "planta");
const SALIDA = path.join(BASE, "corrida.jsonl");
const barras = (p) => p.replace(/\\/g, "/");
const git = (args, cwd = REPO) => execFileSync("git", ["-c", "user.email=prueba@example.com", "-c", "user.name=prueba", ...args], { cwd, encoding: "utf8" });
const escribir = (ruta, texto) => {
  mkdirSync(path.dirname(ruta), { recursive: true });
  writeFileSync(ruta, texto);
};

// ---- El repo de prueba -------------------------------------------------------------------------

/** Las habilidades que usa la línea de prueba, con su etapa y su «cuándo». Las de la spec, las del constructor, la de IA y la del aprobador. */
const HABILIDADES = [
  { nombre: "spec-guardarrailes", etapa: "spec", de: "especialidades", cuando: "Cuando la tarea llame a un modelo de IA, cambie un prompt o le dé herramientas a un agente." },
  { nombre: "spec-contratos-y-recursos", etapa: "spec", de: "especialidades", cuando: "Cuando la tarea hable con otro servicio o llame a un modelo de IA." },
  { nombre: "construir-codigo", etapa: "construccion", de: "especialidades", cuando: "Cuando la tarea cambie o agregue código del proyecto." },
  { nombre: "construir-con-ia", etapa: "construccion", de: "cerebro", cuando: "Cuando la tarea llame a un modelo de IA, le dé herramientas a un agente o arme su contexto." },
  { nombre: "aprobar-entrega", etapa: "aprobacion", de: "especialidades", cuando: "En toda tarea que llegue a aprobación con cambios en el código." },
];

function prepararRepo() {
  mkdirSync(REPO, { recursive: true });
  git(["init", "-q"]);
  git(["symbolic-ref", "HEAD", "refs/heads/desarrollo"]);
  git(["config", "core.autocrlf", "false"]);
  escribir(path.join(REPO, ".gitignore"), "node_modules/\nfactory/\n");
  escribir(
    path.join(REPO, "precios.js"),
    "// El precio final de una venta.\nconst DESCUENTO_POR_DEFECTO = 0;\n\nfunction precioFinal(precio, descuento = DESCUENTO_POR_DEFECTO) {\n  return Math.round(precio * (1 - descuento) * 100) / 100;\n}\n\nmodule.exports = { precioFinal, DESCUENTO_POR_DEFECTO };\n",
  );
  escribir(
    path.join(REPO, "ia.js"),
    "// Clasifica un mensaje de un cliente con un modelo de IA. `llamarModelo` recibe el texto y\n// devuelve lo que contestó el modelo, como texto.\nasync function clasificar(texto, llamarModelo) {\n  const respuesta = await llamarModelo(texto);\n  return JSON.parse(respuesta);\n}\n\nmodule.exports = { clasificar };\n",
  );
  escribir(
    path.join(REPO, "test.js"),
    "const assert = require('node:assert/strict');\nconst { precioFinal } = require('./precios.js');\nconst { clasificar } = require('./ia.js');\n\n(async () => {\n  assert.equal(precioFinal(100, 0.1), 90);\n  assert.equal(precioFinal(100), 100);\n  assert.deepEqual(await clasificar('hola', async () => '{\"categoria\":\"consulta\",\"confianza\":0.9}'), { categoria: 'consulta', confianza: 0.9 });\n  console.log('pruebas: ok');\n})().catch((e) => { console.error(e); process.exit(1); });\n",
  );
  escribir(path.join(REPO, "CLAUDE.md"), "# Repo de prueba de la fábrica\n\nJavaScript con CommonJS, sin dependencias. Las pruebas son `node test.js`.\n");
  // Las habilidades del proyecto, con commit: las mismas plantillas que propone la aplicación.
  for (const h of HABILIDADES) {
    const desde = path.join(PLUGIN, "plantillas", h.de, h.nombre);
    cpSync(desde, path.join(REPO, ".claude", "skills", h.nombre), { recursive: true });
  }
  git(["add", "-A"]);
  git(["commit", "-qm", "inicio"]);

  escribir(
    path.join(REPO, "factory", "config.md"),
    [
      "---",
      `build: node -e "require('./precios.js'); require('./ia.js')"`,
      "test: node test.js",
      "rama_base: desarrollo",
      "max_vueltas: 2",
      "paralelo_max: 1",
      "ui: no",
      "aprobacion: agente",
      "integracion: auto",
      `worktrees: ${barras(WTS)}`,
      "jev: no",
      // La línea: la spec en Sonnet y la construcción en Haiku. La aprobación, sin decir: Opus.
      "modelo_spec: sonnet",
      "modelo_construccion: haiku",
      "modelo_revision: haiku",
      "---",
      "",
      "# Fábrica de prueba",
      "",
    ].join("\n"),
  );
  escribir(path.join(REPO, "factory", "habilidades.md"), ["# Habilidades · prueba", "", ...HABILIDADES.map((h) => `- [${h.etapa}] ${h.nombre}: ${h.cuando}`), ""].join("\n"));
  escribir(path.join(REPO, "factory", "memoria", "ficha.md"), "# Ficha · prueba\n\n## Reglas\n\n- [estilo] CommonJS, sin dependencias nuevas. (él, 2026-10-27)\n- [nucleo] precios.js — cómo se cobra\n");
  escribir(path.join(PLANTA, "ficha.md"), "# Ficha · la planta\n\n## Reglas\n\n- [idioma] Español neutro en mensajes y comentarios. (él, 2026-10-27)\n");

  const ahora = new Date().toISOString();
  escribir(
    path.join(REPO, "factory", "tareas", "F-001-validar-la-respuesta-del-modelo.md"),
    tareaNueva(
      "F-001",
      "Validar la respuesta del modelo",
      "En ia.js, `clasificar` usa la respuesta del modelo sin revisarla. Que valide que sea JSON con `categoria` (una de: consulta, reclamo, otro) y `confianza` (un número de 0 a 1), y que si no lo es lance un error que diga qué esperaba y qué llegó. Sin llamar a ningún modelo real: `llamarModelo` sigue llegando como parámetro. Agrega los casos a test.js.",
      ahora,
      "la prueba de la corrida real",
      // El modelo de su construcción, elegido en la tarea: Sonnet, aunque la línea diga Haiku.
      { modeloConstruccion: "sonnet" },
    ),
  );
  escribir(
    path.join(REPO, "factory", "tareas", "F-002-descuento-por-defecto.md"),
    tareaNueva("F-002", "Descuento por defecto", "En precios.js, el descuento por defecto pasa de 0 a 0.05 para todos los clientes. Actualiza test.js.", ahora, "la prueba de la corrida real"),
  );
}

// ---- Lo que la aplicación le pasa a la corrida -----------------------------------------------------

async function armarLaCorrida() {
  const auto = { spec: "auto", construccion: "auto", revision_codigo: "auto", revision_seguridad: "auto", ui: "auto", aprobacion: "auto" };
  const defs = await definicionesDisponibles(REPO, PLUGIN, false);
  const porEtapa = await habilidadesDeLaCorrida(REPO);
  if (!porEtapa) throw new Error("La corrida no ve el catálogo de habilidades.");
  const nikkes = await textosDeNikkes(Object.values(porEtapa).flatMap((l) => l.flatMap((h) => h.nikkes ?? [])));
  const archivoLabel = archivoDelAgenteDeAnuncio(PLUGIN);
  const defLabel = agenteDesde(readFileSync(archivoLabel, "utf8"), archivoLabel);
  const archivoRetrabajo = archivoDelAgenteDeRetrabajo(PLUGIN);
  const defRetrabajo = agenteDesde(readFileSync(archivoRetrabajo, "utf8"), archivoRetrabajo);
  const inyectados = {
    ...agentesConHabilidades(auto, defs, porEtapa, nikkes),
    ...agenteDeAnuncio(defLabel, await textosDeNikkes(defLabel?.nikkes ?? [])),
    ...agenteDeRetrabajo(defRetrabajo, porEtapa.construccion.map((h) => h.nombre), await textosDeNikkes(defRetrabajo?.nikkes ?? [])),
  };
  const archivoAgentes = path.join(BASE, "agentes.json");
  writeFileSync(archivoAgentes, JSON.stringify(inyectados, null, 2) + "\n");
  const conHuella = habilidadesConHuella(porEtapa);
  const faltan = [...new Set(Object.values(porEtapa).flatMap((l) => l.flatMap((h) => h.nikkes ?? [])))].filter((n) => !nikkes.has(n));
  return { inyectados, archivoAgentes, conHuella, faltan };
}

function entorno(conHuella) {
  // Como la aplicación: sin las claves de la aplicación ni nada de ella, y sin nikke.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(COMPANIA_|ANTHROPIC_|FABRICA_)/.test(k) && k !== "TYPESAFE_AI_KEY"));
  return {
    ...env,
    CLAUDE_CODE_PLUGIN_DIRS: "",
    FABRICA_MEMORIA_PLANTA: barras(PLANTA),
    FABRICA_ANUNCIO: "1",
    FABRICA_RETRABAJO: "1",
    ...(conHuella ? { FABRICA_HABILIDADES: JSON.stringify(conHuella) } : {}),
  };
}

function argumentos(archivoAgentes) {
  const args = ["-p", "/fabrica:correr F-001 F-002", "--output-format", "stream-json", "--verbose", "--plugin-dir", PLUGIN, "--model", "sonnet", "--agents", archivoAgentes];
  const modo = process.env.COMPANIA_FABRICA_MODO_PERMISOS?.trim();
  if (modo) args.push("--permission-mode", modo);
  args.push("--settings", JSON.stringify({ env: { CLAUDE_CODE_PLUGIN_DIRS: "", CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1" } }));
  return args;
}

// ---- Lo que se mira al terminar ------------------------------------------------------------------

const resultados = [];
function comprobar(que, ok, detalle = "") {
  resultados.push({ que, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${que}${!ok && detalle ? ` — ${String(detalle).slice(0, 300)}` : ""}`);
}

function tarea(id) {
  const dir = path.join(REPO, "factory", "tareas");
  const nombre = readdirSync(dir).find((n) => n.startsWith(`${id}-`));
  const texto = nombre ? readFileSync(path.join(dir, nombre), "utf8").replace(/\r\n/g, "\n") : "";
  const datos = { _texto: texto };
  for (const l of (/^---\n([\s\S]*?)\n---/.exec(texto)?.[1] ?? "").split("\n")) {
    const m = /^([\w-]+):\s*(.*)$/.exec(l);
    if (m) datos[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return datos;
}

function revisar(minutos) {
  const salida = existsSync(SALIDA) ? readFileSync(SALIDA, "utf8") : "";
  const lineas = salida.split("\n").filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
  // Hay una línea «result» por cada vez que el orquestador retoma (al volver un subagente): el
  // costo de cada una ya es el acumulado, y los turnos son de ese tramo.
  const finales = lineas.filter((l) => l.type === "result");
  const costo = Math.max(0, ...finales.map((l) => Number(l.total_cost_usd) || 0));
  const turnos = finales.reduce((n, l) => n + (Number(l.num_turns) || 0), 0);
  const porModelo = finales.at(-1)?.modelUsage ?? {};
  const eventos = existsSync(path.join(REPO, "factory", "eventos.jsonl")) ? readFileSync(path.join(REPO, "factory", "eventos.jsonl"), "utf8") : "";
  const t1 = tarea("F-001");
  const t2 = tarea("F-002");

  console.log("\nCómo quedó:");
  for (const [id, x] of [["F-001", t1], ["F-002", t2]])
    console.log(`  ${id}: ${x.estado ?? "?"}${x.integracion_clase ? ` · ${x.integracion_clase} (${x.integracion_motivo ?? ""})` : ""}`);
  if (finales.length) {
    console.log(`  Costo según Claude Code: ${costo.toFixed(2)} USD · ${turnos} turnos del orquestador · ${minutos} min de reloj`);
    for (const [modelo, u] of Object.entries(porModelo)) console.log(`    ${modelo}: ${(Number(u.costUSD) || 0).toFixed(2)} USD · ${u.outputTokens ?? 0} tokens de salida · ${u.cacheReadInputTokens ?? 0} leídos de caché`);
  }

  console.log("\nLo que se comprueba:");
  // Una aprobada termina hecha si es sencilla; si es grande, espera tu prueba en aprobación (Plan-Integracion.md).
  const termino = (x) => x.estado === "hecho" || (x.estado === "aprobacion" && x.integracion_clase === "grande");
  comprobar("las dos se aprobaron y se clasificaron: hechas, o esperando tu prueba si son grandes", termino(t1) && termino(t2) && !!t1.integracion_clase && !!t2.integracion_clase, `${t1.estado}/${t1.integracion_clase} ${t2.estado}/${t2.integracion_clase}`);
  comprobar("F-002, que toca precios.js, es grande por el núcleo y no se integró sin tu prueba", t2.integracion_clase === "grande" && /núcleo/.test(t2.integracion_motivo ?? "") && t2.estado !== "hecho", `${t2.estado} ${t2.integracion_motivo}`);
  comprobar("la spec de F-001 aplicó sus especialidades", /spec-guardarrailes|spec-contratos-y-recursos/.test(t1._texto ?? ""), (t1._texto ?? "").slice(0, 300));
  comprobar("la bitácora anota las habilidades que recibió cada etapa", /construir-codigo/.test(t1._texto ?? "") && /aprobar-entrega/.test(t1._texto ?? ""), (t1._texto ?? "").slice(-400));
  comprobar("F-001 se construyó con el modelo elegido en la tarea, sin que Jev lo cambie", /construcción con sonnet: lo eligió él para esta tarea/.test(eventos), eventos.slice(-400));
  // Label escribe en la sección que corresponde a su clase: el PR de una sencilla, la prueba a mano de una grande.
  const deLabel = (x) => (x.integracion_clase === "grande" ? /## Para probar a mano\n\n\S/ : /## Para el PR\n\n\S/).test(x._texto ?? "");
  comprobar("Label escribió lo que se lee de las dos, en la sección de su clase", deLabel(t1) && deLabel(t2), `${t1.integracion_clase} ${t2.integracion_clase}`);
  comprobar("el agente de salida no corrió", !/fabrica-salida/.test(eventos));
  const frenadas = (salida.match(/Las herramientas del mod nikke no se usan en la fábrica/g) ?? []).length;
  console.log(`  · herramientas de nikke frenadas por la guardia: ${frenadas}`);
  const fallas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallas.length} de ${resultados.length} comprobaciones pasaron.`);
  return fallas.length ? 1 : 0;
}

// ---- Principal ------------------------------------------------------------------------------------

async function principal() {
  console.log(`Repo de prueba: ${REPO}`);
  prepararRepo();
  const { inyectados, archivoAgentes, conHuella, faltan } = await armarLaCorrida();
  console.log("\nLos agentes que viajan con la corrida:");
  for (const [nombre, a] of Object.entries(inyectados)) console.log(`  ${nombre} · ${a.model ?? "el de la corrida"} · ${Math.round(a.prompt.length / 1024)} KB de prompt${a.skills ? ` · ${a.skills.join(", ")}` : ""}`);
  if (faltan.length) console.log(`  (no están en la carpeta de nikke de este equipo: ${faltan.join(", ")})`);
  console.log(`  ${AGENTE_DE_ANUNCIO in inyectados ? "Con" : "Sin"} Label.`);
  const args = argumentos(archivoAgentes);
  console.log(`\nLo que se lanza: ${bin} ${args.map((a) => (a.startsWith("{") ? "'{…}'" : /\s/.test(a) ? `"${a}"` : a)).join(" ")}`);
  if (!correr) {
    console.log("\nNo se corrió: agrega --correr para lanzarla. Gasta.");
    return 0;
  }
  const fd = openSync(SALIDA, "w");
  const [programa, argumentosFinales] = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin) ? ["cmd.exe", ["/d", "/s", "/c", bin, ...args]] : [bin, args];
  console.log("\nCorriendo… (la salida entera queda en corrida.jsonl, junto al repo)");
  const inicio = Date.now();
  const r = spawnSync(programa, argumentosFinales, { cwd: REPO, env: entorno(conHuella), stdio: ["ignore", fd, fd], timeout: TOPE_MS });
  closeSync(fd);
  if (r.error) console.log(`Se cortó: ${r.error.message}`);
  else console.log(`Claude Code terminó con ${r.status}.`);
  return revisar(Math.round((Date.now() - inicio) / 60000));
}

let codigo = 1;
try {
  codigo = await principal();
} catch (err) {
  console.error(`\nLa prueba se cortó: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  if (dejar) console.log(`\nEl repo de prueba quedó en ${BASE}.`);
  else rmSync(BASE, { recursive: true, force: true, maxRetries: 5 });
}
process.exit(codigo);
