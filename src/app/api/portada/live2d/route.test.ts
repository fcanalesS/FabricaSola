import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { NextRequest } from "next/server";
import { pedir, red } from "../../../../pruebas/entorno.ts";

const { GET, POST } = await import("./route.ts");
const { GET: GET_CORE } = await import("./core/route.ts");
const { GET: GET_MODELO } = await import("./modelo/[...ruta]/route.ts");

const URL_LIVE2D = "http://127.0.0.1:3000/api/portada/live2d";
type Respuesta = { error?: string; indicado: { carpeta: string; archivo: string; core: string } | null; portada: unknown };
const estado = async () => (await (await pedir(GET, undefined, URL_LIVE2D)).json()) as Respuesta;
const indicar = async (cuerpo: unknown) => {
  const r = await pedir(POST, cuerpo, URL_LIVE2D);
  return { estado: r.status, ...((await r.json()) as Respuesta) };
};
const archivo = (ruta: string[]) => GET_MODELO(new Request(`${URL_LIVE2D}/modelo/${ruta.join("/")}`) as unknown as NextRequest, { params: Promise.resolve({ ruta }) });

/** Un modelo como viene, el SDK con su Core, y algo afuera de la carpeta del modelo que no se debe servir. */
function equipo() {
  const base = mkdtempSync(path.join(os.tmpdir(), "live2d-indicado-"));
  const modelo = path.join(base, "Hiyori");
  const poner = (ruta: string, texto = "{}") => {
    mkdirSync(path.dirname(ruta), { recursive: true });
    writeFileSync(ruta, texto);
  };
  poner(path.join(modelo, "runtime", "hiyori.model3.json"), '{"Version":3}');
  poner(path.join(modelo, "runtime", "hiyori.moc3"), "moc");
  poner(path.join(modelo, "runtime", "textures", "texture_00.png"), "png");
  poner(path.join(modelo, "runtime", "notas.txt"), "texto");
  poner(path.join(modelo, "runtime", ".oculto", "x.json"));
  poner(path.join(base, "secreto.json"), '{"clave":"no"}');
  const sdk = path.join(base, "CubismSdkForWeb");
  poner(path.join(sdk, "Core", "live2dcubismcore.min.js"), "// core");
  return { base, modelo, sdk, core: path.join(sdk, "Core", "live2dcubismcore.min.js") };
}

test("sin nada indicado ni copiado, la portada queda con su vista simple", async () => {
  assert.deepEqual(await estado(), { indicado: null, portada: null });
  assert.equal((await GET_CORE()).status, 404);
  assert.equal((await archivo(["hiyori.model3.json"])).status, 404);
});

test("no guarda lo que la portada no podría cargar, y dice qué falta", async () => {
  const e = equipo();
  assert.equal((await indicar({ modelo: 1 })).estado, 400);
  const casos: [unknown, RegExp][] = [
    [{ modelo: "", core: e.sdk }, /Indica la carpeta del modelo/],
    [{ modelo: "Hiyori", core: e.sdk }, /rutas van completas/],
    [{ modelo: e.sdk, core: e.sdk }, /no hay un \*\.model3\.json/],
    [{ modelo: e.modelo, core: e.modelo }, /no está live2dcubismcore\.min\.js/],
    [{ modelo: path.join(e.base, "no-existe"), core: e.sdk }, /no hay un \*\.model3\.json/],
  ];
  for (const [cuerpo, motivo] of casos) {
    const r = await indicar(cuerpo);
    assert.equal(r.estado, 409, JSON.stringify(cuerpo));
    assert.match(r.error ?? "", motivo);
    assert.equal(r.indicado, null);
  }
});

test("con la carpeta del modelo y la del SDK, la portada lo carga desde ahí y se sirven sus archivos", async () => {
  const e = equipo();
  const r = await indicar({ modelo: e.modelo, core: e.sdk });
  assert.equal(r.estado, 200);
  assert.deepEqual(r.indicado, { carpeta: e.modelo, archivo: "runtime/hiyori.model3.json", core: e.core });
  assert.deepEqual(r.portada, { url: "/api/portada/live2d/modelo/runtime/hiyori.model3.json", core: "/api/portada/live2d/core", nombre: "hiyori" });
  assert.ok(existsSync(path.join(process.cwd(), "datos", "portada.json")));

  const core = await GET_CORE();
  assert.equal(core.status, 200);
  assert.match(core.headers.get("content-type") ?? "", /javascript/);
  assert.equal(await core.text(), "// core");

  const json = await archivo(["runtime", "hiyori.model3.json"]);
  assert.equal(json.status, 200);
  assert.equal(json.headers.get("content-type"), "application/json");
  assert.equal(await json.text(), '{"Version":3}');
  assert.equal((await archivo(["runtime", "textures", "texture_00.png"])).headers.get("content-type"), "image/png");
  assert.equal((await archivo(["runtime", "hiyori.moc3"])).status, 200);
  assert.equal(red.aOtros.length + red.aServicios.length + red.aClaude.length, 0);
});

test("no sirve nada fuera de la carpeta del modelo, ni lo oculto, ni lo que un modelo no trae", async () => {
  const e = equipo();
  await indicar({ modelo: e.modelo, core: e.core });
  for (const ruta of [["..", "secreto.json"], ["runtime", "..", "..", "secreto.json"], ["runtime", "notas.txt"], ["runtime", ".oculto", "x.json"], ["runtime", "no-existe.json"], ["runtime"], []])
    assert.equal((await archivo(ruta)).status, 404, ruta.join("/"));
  try {
    symlinkSync(e.base, path.join(e.modelo, "runtime", "enlace"), "junction");
  } catch {
    return; // En un equipo que no deja crear enlaces, no hay qué probar.
  }
  assert.equal((await archivo(["runtime", "enlace", "secreto.json"])).status, 404);
});

test("con el *.model3.json mismo, usa ese; si lo indicado desaparece, lo dice; y se deja de usar sin borrar nada", async () => {
  const e = equipo();
  mkdirSync(path.join(e.modelo, "otro"), { recursive: true });
  writeFileSync(path.join(e.modelo, "otro", "aaa.model3.json"), "{}");
  const r = await indicar({ modelo: path.join(e.modelo, "runtime", "hiyori.model3.json"), core: e.core });
  assert.deepEqual(r.indicado, { carpeta: path.join(e.modelo, "runtime"), archivo: "hiyori.model3.json", core: e.core });

  rmSync(path.join(e.modelo, "runtime", "hiyori.model3.json"));
  const roto = await estado();
  assert.ok(roto.indicado);
  assert.deepEqual(Object.keys(roto.portada as object), ["falta", "motivo"]);
  assert.match((roto.portada as { motivo: string }).motivo, /ya no está/);

  const quitado = await indicar({ quitar: true });
  assert.equal(quitado.estado, 200);
  assert.deepEqual({ indicado: quitado.indicado, portada: quitado.portada }, { indicado: null, portada: null });
  assert.ok(existsSync(path.join(e.modelo, "runtime", "hiyori.moc3")));
});
