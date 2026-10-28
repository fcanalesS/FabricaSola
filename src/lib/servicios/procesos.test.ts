import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { cerrarProceso, comandoParaVerProceso, esDelPrograma, expandirCasa, lineaDelProceso, rutaDePython, ultimasLineas } from "./procesos.ts";

test("qué programa es un proceso: ps en Mac, PowerShell en Windows", () => {
  assert.deepEqual(comandoParaVerProceso(4321, "darwin"), ["ps", ["-p", "4321", "-o", "command="]]);
  const [programa, argumentos] = comandoParaVerProceso(4321, "win32");
  assert.equal(programa, "powershell.exe");
  assert.match(argumentos.at(-1)!, /Win32_Process -Filter "ProcessId=4321"\)\.CommandLine/);
});

test("se reconoce el programa también con las barras de Windows", () => {
  assert.ok(esDelPrograma("/Users/x/.venv/bin/python servicios/camara/servidor.py --puerto 8791", "camara/servidor.py"));
  assert.ok(esDelPrograma('"C:\\app\\servicios\\camara\\.venv\\Scripts\\python.exe" C:\\app\\servicios\\camara\\servidor.py --puerto 8791', "camara/servidor.py"));
  assert.ok(esDelPrograma("C:\\whisper\\whisper-server.exe -m modelo.bin", "whisper-server"));
  assert.ok(!esDelPrograma("node otro.js", "camara/servidor.py"));
  assert.ok(!esDelPrograma(null, "whisper-server"));
});

test("el Python del entorno según el sistema", () => {
  assert.equal(rutaDePython("/app/servicios/camara/.venv", "darwin"), "/app/servicios/camara/.venv/bin/python");
  assert.equal(rutaDePython("C:\\app\\servicios\\camara\\.venv", "win32"), "C:\\app\\servicios\\camara\\.venv\\Scripts\\python.exe");
});

test("~/ y ~\\ se leen desde la carpeta del usuario; lo demás queda igual", () => {
  // Lo esperado se arma con path.join, como la función: en Windows sale con «\», en Mac y Linux con «/».
  assert.equal(expandirCasa("~/modelos/ggml.bin", "/Users/el"), path.join("/Users/el", "modelos", "ggml.bin"));
  // Fuera de Windows, «\» no separa carpetas: basta con que empiece en la casa.
  assert.ok(expandirCasa("~\\modelos\\ggml.bin", "/Users/el").startsWith(path.join("/Users/el", "modelos")));
  assert.equal(expandirCasa("/opt/modelos/ggml.bin", "/Users/el"), "/opt/modelos/ggml.bin");
});

test("las últimas líneas de un registro, sin los \\r de Windows", () => {
  assert.deepEqual(ultimasLineas("uno\r\ndos\r\ntres\r\n", 2), ["dos", "tres"]);
  assert.deepEqual(ultimasLineas("a\nb\n", 6), ["a", "b"]);
});

test("en este equipo: se lee la línea de un proceso de verdad y se cierra con lo que lanzó", { skip: process.platform === "win32" }, async () => {
  const proceso = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", "prueba-de-procesos"], { detached: true, stdio: "ignore" });
  await new Promise((listo) => proceso.once("spawn", listo));
  const pid = proceso.pid!;
  assert.ok(esDelPrograma(lineaDelProceso(pid), "prueba-de-procesos"));
  const cerrado = new Promise((listo) => proceso.once("exit", listo));
  cerrarProceso(pid);
  await cerrado;
  assert.equal(lineaDelProceso(pid), null);
});
