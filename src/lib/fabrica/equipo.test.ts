import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import "../../pruebas/entorno.ts";

const { buscarEnElPath, claudeCodeDeEsteEquipo, fijarClaudeEnElPath } = await import("./motor/claude-code.ts");
const { loQueTieneEsteEquipo, sesionDesde } = await import("./equipo.ts");
type Sondas = import("./equipo.ts").Sondas;
type FuenteALaVista = import("../entrada/fuentes.ts").FuenteALaVista;

test("en Windows busca en el PATH con las extensiones que se pueden lanzar, y nunca en una carpeta relativa", () => {
  const hay = new Set(["relativa\\claude.exe", "C:\\a\\claude.ps1", "C:\\b\\claude.cmd", "C:\\c\\claude.exe", "C:\\c\\claude.cmd"]);
  const es = (r: string) => hay.has(r);
  const entorno = { Path: 'relativa;C:\\a;"C:\\b";C:\\c', PATHEXT: ".EXE;.CMD;.PS1" };
  assert.equal(buscarEnElPath("claude", entorno, "win32", es), "C:\\b\\claude.cmd");
  // En la misma carpeta, en el orden de PATHEXT.
  assert.equal(buscarEnElPath("claude", { PATH: "C:\\c", PATHEXT: ".EXE;.CMD" }, "win32", es), "C:\\c\\claude.exe");
  // Un .ps1 no se lanza, aunque PATHEXT lo nombre.
  assert.equal(buscarEnElPath("claude", { PATH: "C:\\a", PATHEXT: ".PS1;.EXE" }, "win32", es), null);
  // Sin PATHEXT, las de siempre.
  assert.equal(buscarEnElPath("claude", { PATH: "C:\\b" }, "win32", es), "C:\\b\\claude.cmd");
  assert.equal(buscarEnElPath("claude", {}, "win32", es), null);
});

test("en Mac y Linux busca el nombre tal cual, en carpetas absolutas", () => {
  const es = (r: string) => r === "/usr/local/bin/claude" || r === "bin/claude";
  assert.equal(buscarEnElPath("claude", { PATH: "bin:/usr/bin:/usr/local/bin" }, "linux", es), "/usr/local/bin/claude");
  assert.equal(buscarEnElPath("claude", { Path: "/usr/local/bin" }, "darwin", es), null);
});

test("encuentra un archivo de verdad en el PATH", () => {
  const carpeta = mkdtempSync(path.join(os.tmpdir(), "fabrica-path-"));
  try {
    const nombre = process.platform === "win32" ? "claude.cmd" : "claude";
    writeFileSync(path.join(carpeta, nombre), "");
    if (process.platform !== "win32") {
      // Sin permiso de ejecución no cuenta.
      chmodSync(path.join(carpeta, nombre), 0o644);
      assert.equal(buscarEnElPath("claude", { PATH: carpeta }), null);
      chmodSync(path.join(carpeta, nombre), 0o755);
    }
    assert.equal(buscarEnElPath("claude", { PATH: carpeta, PATHEXT: ".EXE;.CMD" }), path.join(carpeta, nombre));
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
});

test("la variable manda; sin ella, lo encontrado en el PATH; en las pruebas, nada", () => {
  assert.deepEqual(claudeCodeDeEsteEquipo({ FACTORIA_CLAUDE_CODE_BIN: " /opt/claude " }), { ruta: "/opt/claude", de: "variable" });
  // Las pruebas no miran el PATH de quien las corre.
  assert.equal(claudeCodeDeEsteEquipo({}), null);
  fijarClaudeEnElPath("/usr/local/bin/claude");
  try {
    assert.deepEqual(claudeCodeDeEsteEquipo({}), { ruta: "/usr/local/bin/claude", de: "path" });
    assert.deepEqual(claudeCodeDeEsteEquipo({ FACTORIA_CLAUDE_CODE_BIN: "/opt/claude" }), { ruta: "/opt/claude", de: "variable" });
  } finally {
    fijarClaudeEnElPath(null);
  }
});

test("de la sesión se toman solo si está iniciada, el método y el plan: ni el correo ni la organización", () => {
  const texto = JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "alguien@ejemplo.cl", orgId: "org-1", orgName: "Su empresa", subscriptionType: "max" });
  assert.deepEqual(sesionDesde(texto), { iniciada: true, metodo: "claude.ai", plan: "max" });
  assert.deepEqual(sesionDesde(JSON.stringify({ loggedIn: false })), { iniciada: false, metodo: null, plan: null });
  // Un texto raro no se muestra.
  assert.deepEqual(sesionDesde(JSON.stringify({ loggedIn: true, authMethod: "<b>x</b>", subscriptionType: "a".repeat(80) })), { iniciada: true, metodo: null, plan: null });
  assert.equal(sesionDesde("Logged in as alguien"), null);
  assert.equal(sesionDesde(null), null);
  assert.equal(sesionDesde("{}"), null);
});

const fuente = (o: Partial<FuenteALaVista>): FuenteALaVista =>
  ({ id: 1, proveedor: "github", servidor: null, nombre: "trabajo", variable: "FACTORIA_FUENTE_TRABAJO_TOKEN", encendida: true, regla: "suyos", etiqueta: "", cadaMin: 15, repos: [], estado: "listo", motivo: null, leida: null, usuario: null, tieneToken: true, ...o }) as FuenteALaVista;

const sondas = (o: Partial<Sondas> = {}): Sondas => ({
  claude: () => null,
  version: async () => null,
  sesion: async () => null,
  existe: () => false,
  fuentes: () => [],
  telefono: async () => ({ listo: false, faltan: ["FACTORIA_TELNYX_API_KEY", "FACTORIA_TELEFONO"], destino: "", origen: "", auto: false, conAudio: false, recientes: [], autoHoy: 0, topeAutoDiario: 3 }),
  entorno: {},
  ...o,
});

const piezas = async (s: Sondas) => Object.fromEntries((await loQueTieneEsteEquipo(s)).flatMap((g) => g.piezas).map((p) => [p.id, p]));

test("en un equipo vacío falta lo necesario para correr, y lo opcional queda apagado con qué agregar", async () => {
  const p = await piezas(sondas());
  assert.equal(p.claude!.estado, "falta");
  assert.match(p.claude!.hacer!, /FACTORIA_CLAUDE_CODE_BIN/);
  assert.equal(p.sesion, undefined);
  assert.equal(p.git!.estado, "falta");
  for (const id of ["gh", "glab", "jev", "fuentes", "telefono", "codex", "antigravity"]) {
    assert.equal(p[id]!.estado, "apagada", id);
    assert.ok(p[id]!.hacer, id);
  }
  assert.match(p.gh!.hacer!, /FACTORIA_GH_BIN/);
  assert.match(p.telefono!.como, /FACTORIA_TELNYX_API_KEY, FACTORIA_TELEFONO/);
});

test("Claude Code del PATH, con su versión, su ruta y la sesión con la cuenta de Claude", async () => {
  const preguntados: string[] = [];
  const p = await piezas(
    sondas({
      claude: () => ({ ruta: "C:\\Users\\x\\.local\\bin\\claude.exe", de: "path" }),
      version: async (b) => (preguntados.push(b), b === "git" ? "git version 2.47.0" : "2.1.312 (Claude Code)"),
      sesion: async () => ({ iniciada: true, metodo: "claude.ai", plan: "max" }),
    }),
  );
  assert.deepEqual(preguntados.sort(), ["C:\\Users\\x\\.local\\bin\\claude.exe", "git"]);
  assert.equal(p.claude!.estado, "lista");
  assert.equal(p.claude!.como, "2.1.312 (Claude Code), en C:\\Users\\x\\.local\\bin\\claude.exe (la encontré en el PATH).");
  assert.equal(p.sesion!.estado, "lista");
  assert.equal(p.sesion!.como, "Con tu cuenta de Claude (plan max).");
  assert.equal(p.git!.estado, "lista");
});

test("la sesión sin iniciar falta; con otro método, se avisa que puede gastar créditos de la API", async () => {
  const con = (sesion: Awaited<ReturnType<Sondas["sesion"]>>) => piezas(sondas({ claude: () => ({ ruta: "/bin/claude", de: "variable" }), version: async () => "2.1.0", sesion: async () => sesion }));
  assert.equal((await con({ iniciada: false, metodo: null, plan: null })).sesion!.estado, "falta");
  const otra = (await con({ iniciada: true, metodo: "api_key", plan: null })).sesion!;
  assert.equal(otra.estado, "revisar");
  assert.match(otra.como, /créditos de la API/);
  assert.equal((await con(null)).sesion!.estado, "revisar");
  // Si Claude Code no contesta, no se le pregunta por la sesión.
  const mudo = await piezas(sondas({ claude: () => ({ ruta: "/bin/claude", de: "variable" }), sesion: async () => assert.fail("no debía preguntar") }));
  assert.equal(mudo.claude!.estado, "revisar");
  assert.match(mudo.claude!.hacer!, /FACTORIA_CLAUDE_CODE_BIN/);
  assert.equal(mudo.sesion, undefined);
});

test("de las claves y los tokens se dice si están, nunca su valor; una ruta que no existe se revisa", async () => {
  const entorno = { TYPESAFE_AI_KEY: "secreto-de-jev", FACTORIA_GH_BIN: "C:\\gh\\gh.exe", FACTORIA_GLAB_BIN: "C:\\no\\glab.exe", FACTORIA_FUENTE_TRABAJO_TOKEN: "secreto-de-github", FACTORIA_CODEX_BIN: "C:\\codex.cmd" };
  const grupos = await loQueTieneEsteEquipo(
    sondas({
      entorno,
      existe: (r) => r === "C:\\gh\\gh.exe" || r === "C:\\codex.cmd",
      fuentes: () => [fuente({}), fuente({ id: 2, nombre: "cliente", proveedor: "gitlab", variable: "FACTORIA_FUENTE_CLIENTE_TOKEN", tieneToken: false }), fuente({ id: 3, nombre: "viejo", estado: "rechazado" })],
      telefono: async () => ({ listo: true, faltan: [], destino: "+56 ••••• 5678", origen: "+1 ••••• 0000", auto: true, conAudio: false, recientes: [], autoHoy: 0, topeAutoDiario: 3 }),
    }),
  );
  assert.doesNotMatch(JSON.stringify(grupos), /secreto/);
  const p = Object.fromEntries(grupos.flatMap((g) => g.piezas).map((x) => [x.id, x]));
  assert.equal(p.jev!.estado, "lista");
  assert.equal(p.gh!.estado, "lista");
  assert.equal(p.glab!.estado, "revisar");
  assert.equal(p.codex!.estado, "lista");
  assert.equal(p["fuente-1"]!.estado, "lista");
  assert.equal(p["fuente-1"]!.nombre, "GitHub · trabajo");
  assert.equal(p["fuente-2"]!.estado, "revisar");
  assert.match(p["fuente-2"]!.como, /FACTORIA_FUENTE_CLIENTE_TOKEN/);
  assert.match(p["fuente-3"]!.como, /rechazó/);
  assert.equal(p.telefono!.estado, "lista");
  assert.match(p.telefono!.como, /\+56 ••••• 5678/);
  // Los programas que no son Claude Code no muestran su ruta.
  assert.doesNotMatch(p.gh!.como + p.codex!.como, /C:\\/);
});
