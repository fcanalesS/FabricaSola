import assert from "node:assert/strict";
import { test } from "node:test";
import { agregarLinea, idDeLinea, lineaPorId, lineasDe, mismaRaiz, quitarLinea } from "./lineas.ts";

test("el id de una línea sale del nombre de su carpeta, sin tildes ni mayúsculas, y no se repite", () => {
  assert.equal(idDeLinea("/Users/alguien/proyectos/POS Tiendas", []), "pos-tiendas");
  assert.equal(idDeLinea("C:\\proyectos\\Atalaya-HUD\\", []), "atalaya-hud");
  assert.equal(idDeLinea("/x/Configuración_Año", []), "configuracion-ano");
  assert.equal(idDeLinea("/x/pos-tiendas", ["pos-tiendas"]), "pos-tiendas-2");
  assert.equal(idDeLinea("/x/pos-tiendas", ["pos-tiendas", "pos-tiendas-2"]), "pos-tiendas-3");
  assert.equal(idDeLinea("/x/###", []), "linea");
  assert.ok(idDeLinea(`/x/${"a".repeat(80)}`, []).length <= 40);
});

test("unos ajustes de antes, con un solo proyecto, son una línea, la activa", () => {
  const { lineas, lineaActiva } = lineasDe({ raiz: "/Users/alguien/proyectos/pos-tiendas" });
  assert.deepEqual(lineas, [{ id: "pos-tiendas", nombre: "pos-tiendas", raiz: "/Users/alguien/proyectos/pos-tiendas" }]);
  assert.equal(lineaActiva, "pos-tiendas");
  assert.deepEqual(lineasDe({}), { lineas: [], lineaActiva: null });
  assert.deepEqual(lineasDe({ raiz: "  " }), { lineas: [], lineaActiva: null });
});

test("con líneas guardadas valen esas: las mal formadas y los ids repetidos se ignoran, y la activa tiene que ser una de ellas", () => {
  const buena = { id: "pos-tiendas", nombre: "pos-tiendas", raiz: "/p/pos-tiendas" };
  const otra = { id: "saludos", nombre: "saludos", raiz: "/p/saludos" };
  const leidas = lineasDe({ raiz: "/p/vieja", lineas: [buena, { id: "Mal Id", nombre: "x", raiz: "/p/x" }, { id: "sin-raiz", nombre: "x", raiz: "" }, null, { ...buena, raiz: "/p/otra" }, otra], lineaActiva: "saludos" });
  assert.deepEqual(leidas, { lineas: [buena, otra], lineaActiva: "saludos" });
  assert.equal(lineasDe({ lineas: [buena], lineaActiva: "no-existe" }).lineaActiva, null);
  assert.equal(lineasDe({ lineas: [buena], lineaActiva: 3 }).lineaActiva, null);
});

test("agregar un proyecto que ya es línea no la repite; en Windows no importan las mayúsculas", () => {
  const una = agregarLinea([], "C:\\Proyectos\\POS", "win32");
  assert.equal(una.linea.id, "pos");
  const otra = agregarLinea(una.lineas, "c:\\proyectos\\pos\\", "win32");
  assert.equal(otra.lineas.length, 1);
  assert.equal(otra.linea, una.linea);
  assert.equal(mismaRaiz("/p/POS", "/p/pos", "linux"), false);
  const dos = agregarLinea(una.lineas, "D:\\otra\\pos", "win32");
  assert.deepEqual(dos.lineas.map((l) => l.id), ["pos", "pos-2"]);
});

test("quitar una línea deja las demás; una que no existe es un error", () => {
  const lineas = [
    { id: "pos", nombre: "pos", raiz: "/p/pos" },
    { id: "turnos", nombre: "turnos", raiz: "/p/turnos" },
  ];
  const r = quitarLinea(lineas, "pos");
  assert.deepEqual(r.lineas.map((l) => l.id), ["turnos"]);
  assert.equal(r.quitada.raiz, "/p/pos");
  assert.equal(lineas.length, 2);
  assert.throws(() => quitarLinea(lineas, "otra"), /No hay ninguna línea «otra»/);
  // Sin líneas guardadas, una raíz de antes no vuelve a aparecer.
  assert.deepEqual(lineasDe({ lineas: [], raiz: "/p/pos" }).lineas, []);
});

test("un id de línea que no existe es un error, nunca otra línea", () => {
  const lineas = [{ id: "pos-tiendas", nombre: "pos-tiendas", raiz: "/p/pos-tiendas" }];
  assert.equal(lineaPorId(lineas, "pos-tiendas").raiz, "/p/pos-tiendas");
  assert.throws(() => lineaPorId(lineas, "pos"), /No hay ninguna línea «pos»/);
  assert.throws(() => lineaPorId([], "pos-tiendas"), /No hay ninguna línea/);
});
