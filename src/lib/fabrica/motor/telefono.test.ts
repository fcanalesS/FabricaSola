import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, test } from "node:test";
import { red } from "../../../pruebas/entorno.ts";

// El teléfono de la fábrica, con Telnyx de mentira (`red.telnyx`): nada suena de verdad.
const { atenderEnLaFabrica } = await import("./rutas.ts");
const { carpetaDeLaFabrica, elegirProyecto, fijarLlamarSola } = await import("./proyecto.ts");
const { enmascarar, esE164, llamar, motivoParaLlamar, PAUSA_POR_TAREA_MS, TOPE_AUTO_DIARIO } = await import("./telefono.ts");
const { olvidarLoLeido, revisarLaFabrica } = await import("./vigia.ts");

const VARIABLES = { COMPANIA_TELNYX_API_KEY: "clave-telnyx-de-prueba", COMPANIA_TELNYX_CONNECTION_ID: "conexion-1", COMPANIA_TELNYX_NUMERO_ORIGEN: "+12025550123", COMPANIA_TELEFONO: "+56912345678" };
const configurar = () => Object.assign(process.env, VARIABLES);
const registro = () => path.join(carpetaDeLaFabrica(), "llamadas.json");
/** Deja anotadas llamadas de hace un rato, como si ya hubieran pasado. */
const yaLlamo = (llamadas: { haceMin: number; auto: boolean; tarea?: string }[]) =>
  writeFileSync(registro(), JSON.stringify(llamadas.map((l) => ({ ts: new Date(Date.now() - l.haceMin * 60_000).toISOString(), motivo: "antes", auto: l.auto, ...(l.tarea ? { tarea: l.tarea } : {}) }))));
const pedir = (ruta: string, cuerpo?: unknown, metodo: "GET" | "POST" | "PUT" = cuerpo === undefined ? "GET" : "POST") => atenderEnLaFabrica(ruta, cuerpo, metodo);

beforeEach(async () => {
  red.reiniciar();
  for (const k of Object.keys(process.env)) if (/^COMPANIA_TELNYX_|^COMPANIA_TELEFONO$/.test(k)) delete process.env[k];
  mkdirSync(carpetaDeLaFabrica(), { recursive: true });
  writeFileSync(registro(), "[]");
  await fijarLlamarSola(false);
});

test("los números se enmascaran y solo vale el formato internacional", () => {
  assert.equal(enmascarar("+56912345678"), "+56 ••••• 5678");
  assert.equal(enmascarar(""), "");
  assert.ok(esE164("+12025550123"));
  assert.ok(!esE164("912345678"));
  assert.ok(!esE164("+56 9 1234 5678"));
});

test("sin configurar, dice qué variables faltan y no llama a nadie", async () => {
  process.env.COMPANIA_TELNYX_NUMERO_ORIGEN = "202-555-0123";
  const estado = (await pedir("/api/telefono")).datos as { listo: boolean; faltan: string[] };
  assert.equal(estado.listo, false);
  assert.deepEqual(estado.faltan, ["COMPANIA_TELNYX_API_KEY", "COMPANIA_TELNYX_CONNECTION_ID", "COMPANIA_TELNYX_NUMERO_ORIGEN", "COMPANIA_TELEFONO"]);
  const r = await pedir("/api/telefono", { accion: "probar" });
  assert.equal(r.estado, 409);
  assert.match(String((r.datos as { error: string }).error), /Falta configurar en \.env\.local: COMPANIA_TELNYX_API_KEY/);
  assert.equal(red.aTelnyx.length, 0);
});

test("la prueba hace sonar el teléfono con los datos de .env.local; a la página solo llegan los números enmascarados", async () => {
  configurar();
  const r = await pedir("/api/telefono", { accion: "probar" });
  assert.equal(r.estado, 200);
  assert.equal(red.aTelnyx.length, 1);
  assert.equal(red.aTelnyx[0].clave, "clave-telnyx-de-prueba");
  assert.deepEqual(red.aTelnyx[0].cuerpo, { connection_id: "conexion-1", to: "+56912345678", from: "+12025550123", timeout_secs: 30, time_limit_secs: 90 });
  const visto = JSON.stringify(r.datos);
  assert.match(visto, /\+56 ••••• 5678/);
  assert.doesNotMatch(visto, /912345678|clave-telnyx/);
  // Dos clics seguidos no son dos llamadas: cada una cuesta.
  const otra = await pedir("/api/telefono", { accion: "probar" });
  assert.equal(otra.estado, 409);
  assert.match(String((otra.datos as { error: string }).error), /menos de 2 minutos/);
  assert.equal(red.aTelnyx.length, 1);
});

test("si Telnyx dice que no, queda anotado con su motivo", async () => {
  configurar();
  red.telnyx = () => ({ estado: 403, datos: { errors: [{ code: "10010", title: "Destination not allowed", detail: "Chile is not enabled" }] } });
  const r = await pedir("/api/telefono", { accion: "probar" });
  assert.equal(r.estado, 409);
  const estado = r.datos as { error: string; recientes: { error?: string }[] };
  assert.match(estado.error, /Telnyx rechazó la llamada: 10010 · Destination not allowed · Chile is not enabled/);
  assert.match(String(estado.recientes[0].error), /Destination not allowed/);
});

test("llamar sola respeta sus frenos: encendido, una vez por tarea cada media hora y un tope por día", async () => {
  configurar();
  await assert.rejects(llamar({ motivo: "F-001 te pregunta", auto: true, tarea: "F-001" }), /apagado/);
  await fijarLlamarSola(true);
  yaLlamo([{ haceMin: (PAUSA_POR_TAREA_MS / 60_000) - 5, auto: true, tarea: "F-001" }]);
  await assert.rejects(llamar({ motivo: "F-001 te pregunta", auto: true, tarea: "F-001" }), /F-001 hace menos de 30 minutos/);
  assert.deepEqual(await llamar({ motivo: "F-002 te pregunta", auto: true, tarea: "F-002" }), { id: "llamada-de-prueba" });
  yaLlamo(Array.from({ length: TOPE_AUTO_DIARIO }, (_, i) => ({ haceMin: 40 + i * 10, auto: true, tarea: `F-0${i}` })));
  await assert.rejects(llamar({ motivo: "F-009 te pregunta", auto: true, tarea: "F-009" }), /Ya van 3 llamadas solas hoy/);
});

test("llama por lo que lo espera: una pregunta, o una aprobación si el proyecto pide su veredicto; nada más", () => {
  assert.deepEqual(motivoParaLlamar({ tarea: "F-001", de: "spec", a: "necesita-humano", nota: "¿También al importar?" }, false), { motivo: "F-001 te pregunta: ¿También al importar?" });
  assert.deepEqual(motivoParaLlamar({ tarea: "F-002", de: "verificacion", a: "aprobacion" }, true), { motivo: "F-002 espera tu veredicto" });
  assert.equal(motivoParaLlamar({ tarea: "F-002", de: "verificacion", a: "aprobacion" }, false), null);
  assert.equal(motivoParaLlamar({ tarea: "F-001", de: "necesita-humano", a: "necesita-humano" }, false), null);
  assert.equal(motivoParaLlamar({ tarea: "F-003", de: "revision", a: "verificacion" }, true), null);
  // Una grande, al clasificarse: espera su prueba.
  const grande = { tarea: "F-004", de: "aprobacion", a: "aprobacion", nota: "integración: grande (toca lo delicado: db/alta.sql (SQL))" };
  assert.deepEqual(motivoParaLlamar(grande, false), { motivo: "F-004 es grande: espera tu prueba a mano" });
  // Si la línea ya pedía su veredicto, sonó al llegar a aprobación: no suena dos veces.
  assert.equal(motivoParaLlamar(grande, true), null);
  assert.equal(motivoParaLlamar({ ...grande, nota: "integración: sencilla (solo estilos)" }, false), null);
});

test("el vigía no llama por lo que ya estaba; por lo nuevo que lo espera, sí, y solo si llamar sola está encendido", async () => {
  const proyecto = mkdtempSync(path.join(os.tmpdir(), "fabrica-vigia-"));
  await elegirProyecto(proyecto);
  await pedir("/api/ajustes", { accion: "inicializar" });
  const eventos = path.join(proyecto, "factory", "eventos.jsonl");
  const evento = (e: Record<string, unknown>) => appendFileSync(eventos, JSON.stringify({ ts: new Date().toISOString(), ...e }) + "\n");
  evento({ tarea: "F-001", de: "spec", a: "necesita-humano", nota: "Vieja" });
  olvidarLoLeido();
  const llamadas: string[] = [];
  const anotar = async (o: { motivo: string }) => {
    llamadas.push(o.motivo);
    return { id: "x" };
  };
  // Al arrancar se lee hasta donde está: lo viejo no suena.
  assert.deepEqual(await revisarLaFabrica(anotar), []);
  // Apagado, lo nuevo tampoco.
  evento({ tarea: "F-002", de: "spec", a: "necesita-humano", nota: "¿Cuál?" });
  assert.deepEqual(await revisarLaFabrica(anotar), []);
  await fijarLlamarSola(true);
  evento({ tarea: "F-003", de: "spec", a: "necesita-humano", nota: "¿Y esto?" });
  evento({ tarea: "F-004", de: "revision", a: "verificacion" });
  // La factory/ básica pide el veredicto de una persona (aprobacion: ambas).
  evento({ tarea: "F-005", de: "verificacion", a: "aprobacion" });
  assert.deepEqual(await revisarLaFabrica(anotar), ["F-003 te pregunta: ¿Y esto?", "F-005 espera tu veredicto"]);
  assert.deepEqual(llamadas, ["F-003 te pregunta: ¿Y esto?", "F-005 espera tu veredicto"]);
  // Y lo ya leído no vuelve a sonar.
  assert.deepEqual(await revisarLaFabrica(anotar), []);
  await elegirProyecto(null);
});

test("al contestar suena el audio fijo si lo hay, o nada", async () => {
  configurar();
  process.env.COMPANIA_TELNYX_AUDIO_URL = "https://ejemplo.invalid/aviso.mp3";
  const r = await pedir("/api/telefono", { accion: "probar" });
  assert.equal(r.estado, 200);
  assert.equal(red.aTelnyx[0].cuerpo.audio_url, "https://ejemplo.invalid/aviso.mp3");
  assert.equal((r.datos as { conAudio: boolean }).conAudio, true);

  writeFileSync(registro(), "[]");
  delete process.env.COMPANIA_TELNYX_AUDIO_URL;
  const otra = await pedir("/api/telefono", { accion: "probar" });
  assert.equal(otra.estado, 200);
  assert.deepEqual(Object.keys(red.aTelnyx[1].cuerpo).sort(), ["connection_id", "from", "time_limit_secs", "timeout_secs", "to"]);
});

test("dos clics a la vez no son dos llamadas: la segunda se rechaza", async () => {
  configurar();
  const [una, otra] = await Promise.all([pedir("/api/telefono", { accion: "probar" }), pedir("/api/telefono", { accion: "probar" })]);
  assert.deepEqual([una.estado, otra.estado].sort(), [200, 409]);
  assert.equal(red.aTelnyx.length, 1);
});

test("la clase de integración se lee de la nota que deja el mod al clasificar, y de ninguna otra", async () => {
  const { claseEnNota } = await import("./formato.ts");
  assert.equal(claseEnNota("integración: grande (toca lo delicado: db/alta.sql (SQL))"), "grande");
  assert.equal(claseEnNota("integración: sencilla (Jev ve el cambio superficial (p=0.88, umbral 0.70)); sus pruebas, que se habían omitido, se corrieron y pasan"), "sencilla");
  assert.equal(claseEnNota("integración: grandeza"), null);
  assert.equal(claseEnNota("la integración: grande"), null);
  assert.equal(claseEnNota(undefined), null);
});
