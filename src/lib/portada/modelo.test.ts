import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ARCHIVO_DEL_CORE, modeloDeLaPortada } from "./modelo.ts";

/** Una carpeta public/live2d/ de prueba, con lo que se le pida. */
function carpeta(archivos: string[], conCore = true) {
  const base = mkdtempSync(path.join(os.tmpdir(), "live2d-"));
  mkdirSync(path.join(base, "modelo"), { recursive: true });
  mkdirSync(path.join(base, "core"), { recursive: true });
  if (conCore) writeFileSync(path.join(base, "core", ARCHIVO_DEL_CORE), "// core");
  for (const a of archivos) {
    mkdirSync(path.dirname(path.join(base, "modelo", a)), { recursive: true });
    writeFileSync(path.join(base, "modelo", a), "{}");
  }
  return base;
}

test("sin modelo, nada: la portada queda con su vista simple", async () => {
  assert.equal(await modeloDeLaPortada(carpeta([])), null);
  assert.equal(await modeloDeLaPortada(carpeta(["hiyori/hiyori.moc3", "LEEME.txt"])), null);
  assert.equal(await modeloDeLaPortada(path.join(os.tmpdir(), "no-existe-live2d")), null);
});

test("con su carpeta tal como viene, el primero por orden de su ruta, con la dirección para cargarlo", async () => {
  const base = carpeta(["Mao Pro/runtime/mao_pro.model3.json", "hiyori/hiyori.model3.json", "hiyori/hiyori.moc3"]);
  assert.deepEqual(await modeloDeLaPortada(base), { url: "/live2d/modelo/Mao%20Pro/runtime/mao_pro.model3.json", nombre: "mao_pro" });
  assert.deepEqual(await modeloDeLaPortada(carpeta(["zeta.model3.json", "alfa/alfa.model3.json"])), { url: "/live2d/modelo/alfa/alfa.model3.json", nombre: "alfa" });
});

test("con un modelo pero sin el Core, dice qué falta", async () => {
  assert.deepEqual(await modeloDeLaPortada(carpeta(["hiyori/hiyori.model3.json"], false)), { falta: "core", nombre: "hiyori" });
});

test("no baja más de tres niveles, ni entra a lo oculto, ni a nombres raros", async () => {
  assert.equal(await modeloDeLaPortada(carpeta(["a/b/c/hondo.model3.json"])), null);
  assert.equal(await modeloDeLaPortada(carpeta([".oculto/x.model3.json"])), null);
  assert.equal(await modeloDeLaPortada(carpeta(["raro%2F/x.model3.json"])), null);
});

test("no sigue un enlace hacia otra carpeta", async () => {
  const afuera = mkdtempSync(path.join(os.tmpdir(), "afuera-"));
  writeFileSync(path.join(afuera, "ajeno.model3.json"), "{}");
  const base = carpeta([]);
  try {
    symlinkSync(afuera, path.join(base, "modelo", "enlace"), "junction");
  } catch {
    return; // En un equipo que no deja crear enlaces, no hay qué probar.
  }
  assert.equal(await modeloDeLaPortada(base), null);
});
