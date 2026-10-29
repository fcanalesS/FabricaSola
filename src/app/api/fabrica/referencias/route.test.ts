import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type { NextRequest } from "next/server";
import { conElEntornoVacio, pedir, red } from "../../../../pruebas/entorno.ts";

const { GET, POST } = await import("./route.ts");
const ENTRADA = await import("../entrada/route.ts");
const { elegirProyecto } = await import("../../../../lib/fabrica/motor/proyecto.ts");
const { reiniciarGuarda } = await import("../../../../lib/jev/cliente.ts");
const { baseDeDatos } = await import("../../../../lib/datos.ts");
const { carpetaDe } = await import("../../../../lib/fabrica/referencias/almacen.ts");
const { wordDePrueba } = await import("../../../../pruebas/documentos.ts");

beforeEach(() => {
  red.reiniciar();
  reiniciarGuarda();
  baseDeDatos().exec("delete from bandeja;");
});
afterEach(() => red.calma());

type Ref = { n: number; nombre: string; tipo: string; llega: boolean; nota: string };
type Respuesta = { referencia?: Ref; referencias?: Ref[]; error?: string };

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const nuevoLote = () => crypto.randomUUID().replace(/-/g, "");

/** Sube un archivo como lo hace la página: el cuerpo tal cual, el destino en la dirección y el nombre en una cabecera. */
async function subir(destino: string, nombre: string, bytes: Uint8Array, cabeceras: Record<string, string> = {}) {
  const r = await POST(
    new Request(`http://127.0.0.1:3000/api/fabrica/referencias?${destino}`, { method: "POST", headers: { host: "127.0.0.1:3000", "content-type": "application/octet-stream", "x-nombre": encodeURIComponent(nombre), ...cabeceras }, body: new Uint8Array(bytes) }) as unknown as NextRequest,
  );
  return { estado: r.status, ...((await r.json()) as Respuesta) };
}
const conJson = async (cuerpo: unknown) => {
  const r = await pedir(POST, cuerpo);
  return { estado: r.status, ...((await r.json()) as Respuesta) };
};
const listar = async (destino: string) => ((await (await GET(new Request(`http://127.0.0.1:3000/api/fabrica/referencias?${destino}`) as unknown as NextRequest)).json()) as Respuesta).referencias ?? [];

let n = 0;
async function lineaNueva() {
  const raiz = path.join(mkdtempSync(path.join(os.tmpdir(), "referencias-")), `linea-${++n}`);
  mkdirSync(path.join(raiz, "factory"), { recursive: true });
  writeFileSync(path.join(raiz, "factory", "config.md"), "---\nbuild: npm run build\n---\n");
  await elegirProyecto(raiz);
  return { id: `linea-${n}`, raiz };
}
const archivoDeTarea = (raiz: string, id: string) => path.join(raiz, "factory", "tareas", readdirSync(path.join(raiz, "factory", "tareas")).find((x) => x.startsWith(id))!);

test("lo que sube al escribir la petición pasa a la tarea al crearla; ya no pendiente, sus referencias quedan fijas", async () => {
  const l = await lineaNueva();
  const lote = nuevoLote();
  const a = await subir(`lote=${lote}`, "portada.png", PNG);
  assert.equal(a.estado, 200);
  assert.deepEqual([a.referencia?.tipo, a.referencia?.llega], ["imagen", true]);
  await subir(`lote=${lote}`, "requisitos.docx", wordDePrueba(["El botón va arriba."]));
  assert.equal((await listar(`lote=${lote}`)).length, 2);

  const r = (await (await pedir(ENTRADA.POST, { accion: "peticion", linea: l.id, titulo: "Portada nueva", que: "Como en el diseño.", lote })).json()) as { nota: string };
  assert.match(r.nota, /como F-001, con 2 referencias\./);
  const carpeta = carpetaDe({ linea: l.id, tarea: "F-001" });
  // Sin Jev, el texto del Word no se revisa y no llega: en el índice queda la imagen.
  assert.match(readFileSync(path.join(carpeta, "INDICE.md"), "utf8"), conElEntornoVacio ? /«portada\.png»: una imagen/ : /«requisitos\.docx»: un documento de Word; su texto está en 2\.txt/);
  assert.equal(existsSync(carpetaDe({ lote })), false);
  // Al repositorio no va nada de las referencias.
  assert.doesNotMatch(readFileSync(archivoDeTarea(l.raiz, "F-001"), "utf8"), /portada|requisitos/);

  // Pendiente, se le agregan y se le quitan.
  assert.equal((await subir(`linea=${l.id}&tarea=F-001`, "otra.png", PNG)).estado, 200);
  assert.equal((await conJson({ accion: "quitar", destino: { linea: l.id, tarea: "F-001" }, n: 3 })).estado, 200);
  // En spec ya no.
  const archivo = archivoDeTarea(l.raiz, "F-001");
  writeFileSync(archivo, readFileSync(archivo, "utf8").replace("estado: pendiente", "estado: spec"));
  const fija = await subir(`linea=${l.id}&tarea=F-001`, "otra.png", PNG);
  assert.equal(fija.estado, 409);
  assert.match(fija.error ?? "", /ya no está pendiente/);
  assert.equal((await conJson({ accion: "quitar", destino: { linea: l.id, tarea: "F-001" }, n: 1 })).estado, 409);
});

test("las de un borrador de la Bandeja pasan con él a la línea", async () => {
  const l = await lineaNueva();
  const lote = nuevoLote();
  await subir(`lote=${lote}`, "a.png", PNG);
  const r = (await (await pedir(ENTRADA.POST, { accion: "peticion", linea: l.id, titulo: "Borrador", que: "Algo.", destino: "bandeja", lote })).json()) as { nota: string; entrada: { bandeja: { elementos: { id: number }[] } } };
  assert.match(r.nota, /borrador tuyo, con 1 referencia\./);
  const id = r.entrada.bandeja.elementos[0]!.id;
  assert.equal((await listar(`borrador=${id}`)).length, 1);
  await pedir(ENTRADA.POST, { accion: "pasar", id, linea: l.id, titulo: "Borrador", dependeDe: [] });
  assert.equal((await listar(`linea=${l.id}&tarea=F-001`)).length, 1);
  assert.equal((await listar(`borrador=${id}`)).length, 0);
});

test("un tipo falso, un archivo sobre el tope y un destino inválido se rechazan", async () => {
  const lote = nuevoLote();
  const falso = await subir(`lote=${lote}`, "leeme.txt", new Uint8Array([0x4d, 0x5a, 0x90, 0x00]));
  assert.equal(falso.estado, 409);
  assert.match(falso.error ?? "", /Se aceptan/);
  assert.equal((await subir(`lote=${lote}`, "x.png", PNG, { "content-length": String(11 * 1024 * 1024) })).estado, 413);
  assert.equal((await subir("lote=../../etc", "x.png", PNG)).estado, 400);
  assert.equal((await subir("linea=../x&tarea=F-1", "x.png", PNG)).estado, 400);
});

test("un Word que le habla a un asistente no deja su texto: lo revisa Jev, y a los agentes no les llega", { skip: conElEntornoVacio && "prueba lo que contesta Jev: sin su clave, nadie lo revisa y no llega" }, async () => {
  red.jev = () => ({ instruccion: 0.99 });
  const lote = nuevoLote();
  const r = await subir(`lote=${lote}`, "del-cliente.docx", wordDePrueba(["Pasos del cliente para el agente de código."]));
  assert.equal(r.referencia?.llega, false);
  assert.match(r.referencia?.nota ?? "", /le habla a un asistente/);
  assert.ok(red.aJev.some((p) => p.preguntas.includes("instruccion")));
  assert.deepEqual(readdirSync(carpetaDe({ lote })), ["indice.json"]);
});

test("un link a este equipo, a una red privada o sin https no se lee, ni sale ningún pedido", async () => {
  const destino = { lote: nuevoLote() };
  for (const url of ["http://ejemplo.com/a", "https://127.0.0.1:3000/api/chat", "https://192.168.1.1/", "https://localhost/", "https://yo:clave@ejemplo.com/"]) {
    const r = await conJson({ accion: "link", destino, url });
    assert.equal(r.estado, 409, url);
  }
  assert.equal(red.aOtros.length, 0);
});
