import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  anteriorEnElRegistro,
  argumentosDeLaCI,
  argumentosDelPR,
  estadoDeLaCI,
  pedidoDeLaFalla,
  porQueNoSinClic,
  refDelPedido,
  conMarcas,
  direccionEn,
  herramientaDePR,
  lineaDeRegistro,
  partirComando,
  rechazoPorAvance,
  secretosDelEntorno,
  tapar,
  variableDeClave,
  variableDeHerramienta,
  yaHabiaPR,
  type Ejecucion,
} from "./ejecucion.ts";
import { lanzamiento } from "./correr.ts";
import { leerProceso, revisarProceso } from "./formato.ts";

test("un comando se parte como lo haría una persona, sin shell: comillas para lo que lleva espacios", () => {
  assert.deepEqual(partirComando(`  docker build -t "pos:{commit}" .  `), ["docker", "build", "-t", "pos:{commit}", "."]);
  assert.deepEqual(partirComando(`node 'scripts/con espacio.mjs' "" fin`), ["node", "scripts/con espacio.mjs", "", "fin"]);
  assert.deepEqual(partirComando(`./x.sh a"b c"d`), ["./x.sh", "ab cd"]);
  assert.throws(() => partirComando(`./x.sh "sin cerrar`), /comilla abierta/);
});

test("las marcas van dentro de cada argumento: lo que valen no parte ni agrega argumentos", () => {
  const m = { commit: "a1b2c3", anterior: "f0e1d2", rama: "desarrollo" };
  assert.deepEqual(conMarcas(["./d.sh", "prueba", "{commit}", "--de={anterior}", "{rama}"], m), ["./d.sh", "prueba", "a1b2c3", "--de=f0e1d2", "desarrollo"]);
  // Una rama con espacios o un «;» no podría colarse: es un solo argumento.
  assert.deepEqual(conMarcas(["echo", "{rama}"], { ...m, rama: "x; rm -rf /" }), ["echo", "x; rm -rf /"]);
  assert.throws(() => conMarcas(["./d.sh", "{anterior}"], { ...m, anterior: null }), /todavía no terminó ninguna vez/);
});

test("las claves salen de COMPANIA_PROCESO_<LINEA>_<NOMBRE> y se tapan en todo lo que se guarda", () => {
  assert.equal(variableDeClave("pos-tiendas", "DEPLOY_TOKEN"), "COMPANIA_PROCESO_POS_TIENDAS_DEPLOY_TOKEN");
  const secretos = secretosDelEntorno({ COMPANIA_PROCESO_POS_TOKEN: "abc123secreto", COMPANIA_PROCESO_POS_CORTA: "xy", COMPANIA_CLAUDE_KEY: "no-es-de-procesos", PATH: "/bin" });
  assert.deepEqual(secretos, ["abc123secreto"]);
  assert.equal(tapar("token=abc123secreto y otra vez abc123secreto.", secretos), "token=«clave tapada» y otra vez «clave tapada».");
});

test("una clave se declara en el paso, por su nombre, y solo en un comando", () => {
  const p = leerProceso("---\nid: x\nnombre: X\ncuando: a-mano\n---\n\n- [comando] ./d.sh · deshacer: — · clave: DEPLOY_TOKEN, OTRA\n- [salud] GET https://x.local → 200 · clave: T\n- [comando] ./e.sh · deshacer: — · clave: minusculas\n");
  assert.deepEqual(p.pasos[0]!.claves, ["DEPLOY_TOKEN", "OTRA"]);
  const q = revisarProceso("---\nid: x\nnombre: X\ncuando: a-mano\n---\n\n- [comando] ./d.sh · deshacer: — · clave: DEPLOY_TOKEN, OTRA\n- [salud] GET https://x.local → 200 · clave: T\n- [comando] ./e.sh · deshacer: — · clave: minusculas\n", "x.md").map((x) => `${x.linea}: ${x.que}`);
  assert.equal(q.length, 2);
  assert.match(q[0]!, /^8: Solo un comando o una evaluación reciben claves/);
  assert.match(q[1]!, /^9: «minusculas» no es un nombre de clave/);
});

const ejecucion = (mas: Partial<Ejecucion>): Ejecucion => ({
  id: "20261026-164000-publicar",
  linea: "pos",
  proceso: "publicar",
  nombre: "Publicar",
  commit: "a".repeat(40),
  inicio: "2026-10-26T19:40:00.000Z",
  fin: null,
  estado: "termino",
  pasos: [],
  paradoEn: null,
  motivo: null,
  ...mas,
});
const paso = (linea: number, estado: Ejecucion["pasos"][number]["estado"], tipo = "comando") => ({ linea, tipo, texto: "x", estado, ms: 1, salida: "", nota: "" });

test("la línea del registro dice qué pasó, con el commit entero, sin nada de lo que dijeron los comandos", () => {
  const cuando = new Date(2026, 9, 26, 16, 40);
  const c = "a".repeat(40);
  assert.equal(lineaDeRegistro(ejecucion({ pasos: [paso(10, "ok"), paso(11, "ok", "salud")] }), cuando), `- 2026-10-26 16:40 · publicar · ${c} · terminó · 2 pasos`);
  assert.equal(
    lineaDeRegistro(ejecucion({ estado: "fallo", pasos: [paso(10, "deshecho"), paso(11, "no-se-deshace"), paso(12, "fallo"), paso(13, "sin-correr")] }), cuando),
    `- 2026-10-26 16:40 · publicar · ${c} · falló · en la línea 12 (comando) · deshecho 1 de 2`,
  );
  assert.equal(lineaDeRegistro(ejecucion({ estado: "llego", paradoEn: { linea: 12, tipo: "push" }, pasos: [paso(10, "ok"), paso(12, "sin-correr", "push")] }), cuando), `- 2026-10-26 16:40 · publicar · ${c} · llegó · hasta la línea 12 (push), que todavía no corre`);
  assert.equal(lineaDeRegistro(ejecucion({ estado: "detenida", pasos: [paso(10, "ok"), paso(11, "fallo")] }), cuando), `- 2026-10-26 16:40 · publicar · ${c} · detenida · a mano, después de 1 paso`);
  assert.ok(lineaDeRegistro(ejecucion({ estado: "fallo", pasos: [paso(10, "fallo")] }), cuando).length <= 200);
});

test("{anterior} es el commit de la última vez que el proceso terminó o llegó hasta donde corre", () => {
  const registro = [
    "# Registro de 2026-10",
    "",
    `- 2026-10-20 10:00 · publicar · ${"1".repeat(40)} · terminó · 3 pasos`,
    `- 2026-10-21 10:00 · publicar · ${"2".repeat(40)} · llegó · hasta la línea 12 (push), que todavía no corre`,
    `- 2026-10-22 10:00 · publicar · ${"3".repeat(40)} · falló · en la línea 14 (comando)`,
    `- 2026-10-23 10:00 · otro · ${"4".repeat(40)} · terminó · 1 paso`,
  ].join("\n");
  assert.equal(anteriorEnElRegistro([registro], "publicar"), "2".repeat(40));
  assert.equal(anteriorEnElRegistro([registro, `- 2026-11-01 09:00 · publicar · ${"5".repeat(40)} · terminó · 1 paso\n`], "publicar"), "5".repeat(40));
  assert.equal(anteriorEnElRegistro([registro], "nuevo"), null);
});

test("el PR lo abre gh o glab según el remoto, con lo que arma el código", () => {
  assert.equal(herramientaDePR("git@github.com:alguien/pos.git"), "gh");
  assert.equal(herramientaDePR("https://gitlab.empresa.cl/equipo/pos.git"), "glab");
  assert.equal(herramientaDePR("C:/repos/remoto.git"), "gh");
  assert.deepEqual([variableDeHerramienta("gh"), variableDeHerramienta("glab")], ["COMPANIA_GH_BIN", "COMPANIA_GLAB_BIN"]);
  const o = { rama: "desarrollo", base: "main", titulo: "T", cuerpo: "C" };
  assert.deepEqual(argumentosDelPR("gh", o), ["pr", "create", "--base", "main", "--head", "desarrollo", "--title", "T", "--body", "C"]);
  assert.deepEqual(argumentosDelPR("glab", o), ["mr", "create", "--source-branch", "desarrollo", "--target-branch", "main", "--title", "T", "--description", "C", "--remove-source-branch=false", "--yes"]);
  assert.deepEqual(argumentosDelPR("glab", { ...o, cuerpoEn: "C:/fuera/cuerpo.md" }).slice(-5), ["--title", "T", "--description-file", "C:/fuera/cuerpo.md", "--remove-source-branch=false", "--yes"].slice(-5));
});

test("lo que dicen git y los servicios: un rechazo por avance, un PR que ya existía y su dirección", () => {
  assert.ok(rechazoPorAvance("To C:/r.git\n!\trefs/heads/desarrollo:refs/heads/desarrollo\t[rejected] (fetch first)\nDone"));
  assert.ok(rechazoPorAvance(" ! [rejected]        desarrollo -> desarrollo (non-fast-forward)"));
  assert.ok(!rechazoPorAvance(" ! [remote rejected] desarrollo -> desarrollo (pre-receive hook declined)\nerror: failed to push some refs"));
  assert.ok(yaHabiaPR('a pull request for branch "x" into branch "main" already exists:'));
  assert.equal(direccionEn("Creating pull request\nhttps://github.com/a/b/pull/8\n"), "https://github.com/a/b/pull/8");
  assert.equal(direccionEn("nada"), null);
});

test("en Windows, un .cmd va con cmd /d /s /c y la línea entera entre comillas; lo que cmd interpretaría no pasa", { skip: process.platform !== "win32" }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "con espacio "));
  const bin = path.join(dir, "gh.cmd");
  writeFileSync(bin, "@echo off\r\n");
  const l = await lanzamiento([bin, "pr", "--title", "Dos palabras", ""], dir, { PATH: "", PATHEXT: ".EXE;.CMD" }, "win32");
  assert.deepEqual(l, { programa: "cmd.exe", args: ["/d", "/s", "/c", `""${bin}" pr --title "Dos palabras" """`], tal_cual: true });
  await assert.rejects(lanzamiento([bin, "100%"], dir, { PATH: "" }, "win32"), /interpretaría «100%»/);
  await assert.rejects(lanzamiento([bin, "a&b"], dir, { PATH: "" }, "win32"), /interpretaría/);
});

test("la integración continua de GitHub se lee de sus check runs: espera, pasa o no pasa", () => {
  assert.deepEqual(argumentosDeLaCI("gh", "abc"), ["api", "repos/{owner}/{repo}/commits/abc/check-runs?per_page=100"]);
  assert.deepEqual(argumentosDeLaCI("glab", "abc"), ["api", "projects/:id/pipelines?sha=abc"]);
  const gh = (runs: unknown[]) => estadoDeLaCI("gh", JSON.stringify({ total_count: runs.length, check_runs: runs }));
  assert.equal(gh([])!.estado, "sin");
  assert.deepEqual(gh([{ name: "build", status: "in_progress", conclusion: null }, { name: "lint", status: "completed", conclusion: "success" }]), { estado: "esperando", detalle: "Faltan 1 de 2: build.", url: null });
  assert.deepEqual(gh([{ name: "build", status: "completed", conclusion: "success" }, { name: "docs", status: "completed", conclusion: "skipped" }]), { estado: "bien", detalle: "Pasó: build, docs.", url: null });
  const mal = gh([{ name: "build", status: "completed", conclusion: "success" }, { name: "pruebas", status: "completed", conclusion: "failure", html_url: "https://github.com/a/b/runs/9" }]);
  assert.deepEqual(mal, { estado: "mal", detalle: "No pasó: pruebas (failure).", url: "https://github.com/a/b/runs/9" });
  // Lo que no es lo que contesta GitHub no se entiende.
  assert.equal(estadoDeLaCI("gh", "no es json"), null);
  assert.equal(estadoDeLaCI("gh", JSON.stringify({ message: "Not Found" })), null);
});

test("la de GitLab, del último pipeline del commit", () => {
  const gl = (p: unknown[]) => estadoDeLaCI("glab", JSON.stringify(p));
  assert.equal(gl([])!.estado, "sin");
  assert.equal(gl([{ id: 7, status: "failed" }, { id: 9, status: "running" }])!.estado, "esperando");
  assert.deepEqual(gl([{ id: 9, status: "success", web_url: "https://gitlab.x/p/-/pipelines/9" }]), { estado: "bien", detalle: "El pipeline 9 pasó.", url: "https://gitlab.x/p/-/pipelines/9" });
  assert.deepEqual(gl([{ id: 9, status: "manual" }])!.estado, "mal");
  assert.match(gl([{ id: 9, status: "canceled" }])!.detalle, /terminó canceled/);
});

test("el pedido de una falla dice qué falló y lo último que dijo, sin pasar de su tope", () => {
  const e = ejecucion({
    estado: "fallo",
    pasos: [
      { linea: 9, tipo: "comando", texto: "./desplegar.sh {commit}", estado: "deshecho", ms: 1, salida: "", nota: "Deshecho." },
      { linea: 10, tipo: "ci", texto: "la integración continua", estado: "fallo", ms: 1, salida: Array.from({ length: 40 }, (_, i) => `línea ${i}`).join("\n"), nota: "La integración continua no pasó: No pasó: pruebas (failure)." },
    ],
  });
  assert.equal(refDelPedido(e), "proceso:pos/publicar/20261026-164000-publicar");
  const p = pedidoDeLaFalla(e, e.pasos[1]!);
  assert.equal(p.titulo, "Arreglar el proceso publicar: falló la línea 10 (ci)");
  assert.match(p.texto, /^El proceso Publicar \(factory\/procesos\/publicar\.md\) falló al publicar el commit a{40}, en la línea 10 \(ci\): la integración continua$/m);
  assert.match(p.texto, /Lo que dijo la aplicación: La integración continua no pasó/);
  // Solo las últimas 30 líneas, con sangría: van como texto, no como formato.
  assert.doesNotMatch(p.texto, /línea 9\n/);
  assert.match(p.texto, /^ {4}línea 39$/m);
  assert.match(p.texto, /Se deshizo lo hecho: línea 9 deshecha\./);
});

test("producción sin su clic: con paso aprobacion, todo se deshace, hay salud después y esta versión ya llegó hasta producción", () => {
  const proceso = (pasos: string[]) => leerProceso(`---\nid: p\nnombre: P\ncuando: a-mano\n---\n\n${pasos.join("\n")}\n`);
  const bueno = proceso(["- [comando] ./d.sh prueba · deshacer: ./d.sh atras", "- [aprobacion] producción", "- [comando] ./d.sh prod · deshacer: ./d.sh prod-atras", "- [salud] GET https://x.local → 200"]);
  const llego = { huella: "h1", pasos: [{ linea: 8, tipo: "aprobacion", texto: "producción", estado: "ok" as const, ms: 1, salida: "", nota: "" }] };
  assert.deepEqual(porQueNoSinClic(bueno, "h1", [llego]), []);
  // Otra versión del proceso tiene que pasar otra vez; la que no llegó a producción no cuenta.
  assert.match(porQueNoSinClic(bueno, "h2", [llego]).join(), /todavía no pasó entera/);
  assert.match(porQueNoSinClic(bueno, "h1", [{ huella: "h1", pasos: [{ ...llego.pasos[0]!, estado: "sin-correr" as const }] }]).join(), /todavía no pasó entera/);
  assert.deepEqual(porQueNoSinClic(proceso(["- [comando] ./d.sh · deshacer: —"]), "h1", [llego]), ["No tiene un paso aprobacion: no hay clic que quitar."]);
  const malo = proceso(["- [comando] docker build . · deshacer: —", "- [aprobacion] producción", "- [comando] ./d.sh prod · deshacer: ./d.sh atras"]);
  assert.deepEqual(porQueNoSinClic(malo, "h1", [llego]), ["La línea 7 no se puede deshacer (deshacer: —).", "Después de producción no hay una comprobación de salud: sin ella no se sabe si salió bien, ni hay cuándo deshacer."]);
});

test("lo que no va a poder correr en este equipo: claves, remoto y la herramienta del servicio, solo por su nombre", async () => {
  const { loQueNoVaAPoder } = await import("./ejecucion.ts");
  const pasos = [
    { linea: 3, tipo: "comando", claves: ["TOKEN", "OTRA"], prContra: null },
    { linea: 4, tipo: "push", claves: [], prContra: null },
    { linea: 5, tipo: "push", claves: [], prContra: "main" },
    { linea: 6, tipo: "ci", claves: [], prContra: null },
    { linea: 7, tipo: "fusion", claves: [], prContra: null },
    { linea: 8, tipo: "salud", claves: [], prContra: null },
    { linea: 9, tipo: "evaluacion", claves: ["CLAVE"], prContra: null },
  ];
  const entorno = { COMPANIA_PROCESO_MI_POS_TOKEN: "secreto", COMPANIA_PROCESO_MI_POS_CLAVE: "otro-secreto" };
  assert.deepEqual(loQueNoVaAPoder(pasos, { linea: "mi-pos", remoto: "git@gitlab.empresa.cl:equipo/pos.git", entorno }), [
    "Línea 3 (comando): falta COMPANIA_PROCESO_MI_POS_OTRA en .env.local.",
    "Línea 5 (push): empuja, pero el PR no se abre: falta COMPANIA_GLAB_BIN en .env.local, con la ruta de glab.",
    "Línea 6 (ci): no puede leer la integración continua: falta COMPANIA_GLAB_BIN en .env.local, con la ruta de glab.",
    "Línea 7 (fusion): no puede fusionar: falta COMPANIA_GLAB_BIN en .env.local, con la ruta de glab.",
  ]);
  // Sin remoto, ningún paso que lo necesita; con la herramienta, nada más que la clave.
  assert.deepEqual(loQueNoVaAPoder(pasos.slice(1, 4), { linea: "x", remoto: null, entorno: {} }).length, 3);
  assert.deepEqual(loQueNoVaAPoder(pasos, { linea: "mi-pos", remoto: "https://github.com/a/b.git", entorno: { ...entorno, COMPANIA_PROCESO_MI_POS_OTRA: "x", COMPANIA_GH_BIN: "/bin/gh" } }), []);
  assert.doesNotMatch(JSON.stringify(loQueNoVaAPoder(pasos, { linea: "mi-pos", remoto: null, entorno })), /secreto/);
});
