import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { pedir, red } from "../../../../pruebas/entorno.ts";

const { GET, POST, PUT } = await import("./route.ts");
const { elegirProyecto } = await import("../../../../lib/fabrica/motor/proyecto.ts");
const { configDesde, partir } = await import("../../../../lib/fabrica/motor/formato.ts");

beforeEach(() => {
  red.reiniciar();
});
afterEach(async () => {
  await red.calma();
});

const hacer = async (cuerpo: unknown) => {
  const r = await pedir(POST, cuerpo, "http://127.0.0.1:3000/api/fabrica/linea");
  return { estado: r.status, ...((await r.json()) as { nota?: string; error?: string }) };
};
const ver = async (consulta: string) => {
  const r = await pedir(GET, undefined, `http://127.0.0.1:3000/api/fabrica/linea?${consulta}`);
  return { estado: r.status, ...((await r.json()) as { detalle?: { secciones: { pedido: string } | null; historial: { pasos: { a: string }[] } }; error?: string }) };
};
const nadaSalio = () => red.aClaude.length === 0 && red.aJev.length === 0 && red.aServicios.length === 0 && red.aOtros.length === 0;

const TAREAS = [
  { id: "F-001", titulo: "Exportar a CSV", estado: "necesita-humano", motivo: "¿Coma o punto y coma?" },
  { id: "F-002", titulo: "Filtro por tienda", estado: "aprobacion" },
  { id: "F-003", titulo: "Paginación", estado: "pendiente" },
];

let n = 0;
/** Una línea con las mismas tres tareas que las demás: el mismo id en dos líneas no es la misma tarea. */
async function linea(nombre: string) {
  const raiz = path.join(mkdtempSync(path.join(os.tmpdir(), "linea-")), `${nombre}-${++n}`);
  mkdirSync(path.join(raiz, "factory", "tareas"), { recursive: true });
  writeFileSync(path.join(raiz, "factory", "config.md"), "---\nbuild: npm run build\naprobacion: ambas\n---\n");
  for (const t of TAREAS) writeFileSync(path.join(raiz, "factory", "tareas", `${t.id}-x.md`), `---\n${Object.entries({ ...t, vueltas: "0" }).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n## Pedido\n\nEl pedido de ${t.id}.\n`);
  writeFileSync(path.join(raiz, "factory", "eventos.jsonl"), JSON.stringify({ ts: new Date().toISOString(), tarea: "F-001", de: "spec", a: "necesita-humano" }) + "\n");
  await elegirProyecto(raiz);
  return { id: `${nombre}-${n}`, raiz };
}
const archivos = (raiz: string) =>
  readdirSync(path.join(raiz, "factory"), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const p = path.join(e.parentPath, e.name);
      return `${path.relative(raiz, p)}:${statSync(p).size}`;
    })
    .sort();
const estadoDe = (raiz: string, id: string) => partir(readFileSync(path.join(raiz, "factory", "tareas", `${id}-x.md`), "utf8")).datos.estado;

test("en una línea que no es la activa, contestar, aprobar, rechazar y descartar escriben en la suya y no tocan la activa", async () => {
  const a = await linea("pos");
  const b = await linea("inventario"); // la activa
  const antesDeB = archivos(b.raiz);

  const respuesta = await hacer({ accion: "responder", linea: a.id, tarea: "F-001", texto: "Con punto y coma." });
  assert.equal(respuesta.estado, 200);
  assert.match(respuesta.nota ?? "", /sigue cuando corra/);
  const escrita = JSON.parse(readFileSync(path.join(a.raiz, "factory", "respuestas", "F-001.json"), "utf8")) as { texto: string; por: string };
  assert.deepEqual([escrita.texto, escrita.por], ["Con punto y coma.", "persona, desde la aplicación de compañía"]);

  const aprobada = await hacer({ accion: "aprobar", linea: a.id, tarea: "F-002" });
  assert.equal(aprobada.estado, 200);
  assert.equal((JSON.parse(readFileSync(path.join(a.raiz, "factory", "veredictos", "F-002.json"), "utf8")) as { veredicto: string }).veredicto, "aprobada");

  // Un rechazo sin motivo no se acepta.
  assert.equal((await hacer({ accion: "rechazar", linea: a.id, tarea: "F-002" })).estado, 400);
  // Ni contestar lo que no espera una respuesta.
  assert.equal((await hacer({ accion: "responder", linea: a.id, tarea: "F-003", texto: "Hola" })).estado, 409);

  const descartada = await hacer({ accion: "descartar", linea: a.id, tarea: "F-003", motivo: "Ya no va" });
  assert.equal(descartada.estado, 200);
  assert.equal(estadoDe(a.raiz, "F-003"), "descartada");
  assert.match(readFileSync(path.join(a.raiz, "factory", "eventos.jsonl"), "utf8"), /"a":"descartada"/);

  // La activa, intacta.
  assert.deepEqual(archivos(b.raiz), antesDeB);
  assert.equal(estadoDe(b.raiz, "F-003"), "pendiente");
  assert.ok(nadaSalio());
});

test("una línea que no existe es un error, y no escribe en ninguna", async () => {
  const a = await linea("caja");
  const antes = archivos(a.raiz);
  const r = await hacer({ accion: "aprobar", linea: "no-existe", tarea: "F-002" });
  assert.equal(r.estado, 400);
  assert.match(r.error ?? "", /no-existe/);
  assert.equal((await hacer({ accion: "aprobar", linea: "../otra", tarea: "F-002" })).estado, 400);
  assert.equal((await hacer({ accion: "aprobar", linea: a.id, tarea: "F-2; rm" })).estado, 400);
  assert.deepEqual(archivos(a.raiz), antes);
  assert.equal((await ver("linea=no-existe&tarea=F-001")).estado, 404);
});

test("leer una tarea de cualquier línea: su pedido y su camino", async () => {
  const a = await linea("bodega");
  await linea("otra"); // la activa
  const r = await ver(`linea=${a.id}&tarea=F-001`);
  assert.equal(r.estado, 200);
  assert.match(r.detalle?.secciones?.pedido ?? "", /El pedido de F-001/);
  assert.deepEqual(r.detalle?.historial.pasos.map((p) => p.a), ["necesita-humano"]);
});

test("en la línea activa, el veredicto va por el camino de la columna: al motor, que después intenta seguir con la tarea", async () => {
  const a = await linea("activa");
  red.fabrica = ({ ruta }) =>
    ruta === "/api/veredicto"
      ? { estado: 200, datos: {} }
      : ruta === "/api/ajustes"
        ? { estado: 200, datos: { corridaConNikke: false } }
        : ruta === "/api/corridas"
          ? { estado: 409, datos: { error: "Falta COMPANIA_CLAUDE_CODE_BIN en .env.local." } }
          : null;
  const r = await hacer({ accion: "aprobar", linea: a.id, tarea: "F-002" });
  assert.equal(r.estado, 200);
  const veredicto = red.aLaFabrica.find((p) => p.ruta === "/api/veredicto");
  assert.deepEqual([veredicto?.cuerpo.tarea, veredicto?.cuerpo.veredicto], ["F-002", "aprobada"]);
  assert.deepEqual(red.aLaFabrica.find((p) => p.ruta === "/api/corridas")?.cuerpo, { accion: "continuar", tareas: ["F-002"] });
  // No siguió, y lo dice; lo que escribe es cosa del motor, no de esta ruta.
  assert.match(r.nota ?? "", /no siguió/);
  assert.ok(!existsSync(path.join(a.raiz, "factory", "veredictos", "F-002.json")));
  assert.ok(nadaSalio());
});

const ajustar = async (cuerpo: unknown) => {
  const r = await pedir(PUT, cuerpo, "http://127.0.0.1:3000/api/fabrica/linea");
  return { estado: r.status, ...((await r.json()) as { nota?: string; error?: string }) };
};
const configDe = (raiz: string) => readFileSync(path.join(raiz, "factory", "config.md"), "utf8");

test("el modelo de la spec se fija en la línea que se pide, aunque no sea la activa, y conserva lo demás", async () => {
  const a = await linea("caja");
  const b = await linea("bodega"); // la activa
  assert.equal(configDesde(configDe(a.raiz)).modeloSpec, "opus", "sin decir nada, la spec va en Opus, como en el plugin");
  const deLaActiva = configDe(b.raiz);

  const r = await ajustar({ linea: a.id, modeloSpec: "fable" });
  assert.equal(r.estado, 200);
  assert.match(r.nota ?? "", /Fable/);
  const datos = partir(configDe(a.raiz)).datos;
  assert.equal(datos.modelo_spec, "fable");
  assert.equal(datos.build, "npm run build");
  assert.equal(datos.aprobacion, "ambas");
  assert.equal(configDesde(configDe(a.raiz)).modeloSpec, "fable");
  assert.equal(configDe(b.raiz), deLaActiva, "la activa no se toca");

  assert.equal((await ajustar({ linea: b.id, modeloSpec: "inherit" })).estado, 200);
  assert.equal(configDesde(configDe(b.raiz)).modeloSpec, "inherit");
  assert.ok(nadaSalio());
});

test("el modelo de la construcción se fija en su línea, sin tocar el de la spec, y dice que Jev puede abaratarlo", async () => {
  const a = await linea("caja");
  const b = await linea("bodega"); // la activa
  assert.equal(configDesde(configDe(a.raiz)).modeloConstruccion, "inherit", "sin decir nada, el de la corrida, como en el plugin");
  const deLaActiva = configDe(b.raiz);

  const r = await ajustar({ linea: a.id, modeloConstruccion: "opus" });
  assert.equal(r.estado, 200);
  assert.match(r.nota ?? "", /^caja-\d+ construye con Opus desde la próxima tarea\. En las tareas simples, Jev puede usar Sonnet\.$/);
  const datos = partir(configDe(a.raiz)).datos;
  assert.deepEqual([datos.modelo_construccion, datos.modelo_spec ?? null, datos.build], ["opus", null, "npm run build"]);
  assert.equal(configDesde(configDe(a.raiz)).modeloConstruccion, "opus");
  assert.equal(configDesde(configDe(a.raiz)).modeloSpec, "opus", "la spec sigue con la suya");
  assert.equal(configDe(b.raiz), deLaActiva, "la activa no se toca");

  // Con uno que ya es barato, no hay nada que abaratar.
  assert.match((await ajustar({ linea: a.id, modeloConstruccion: "haiku" })).nota ?? "", /^caja-\d+ construye con Haiku desde la próxima tarea\.$/);
  // Lo que se ve de la línea en la planta trae los dos.
  const { leerLaPlanta } = await import("../../../../lib/fabrica/planta/disco.ts");
  const vista = (await leerLaPlanta()).lineas.find((x) => x.id === a.id)!;
  assert.deepEqual([vista.config?.modeloSpec, vista.config?.modeloConstruccion], ["opus", "haiku"]);
  assert.ok(nadaSalio());
});

test("la aprobación va en Opus si no dice otro, y se cambia en su línea; la planta trae los tres modelos", async () => {
  const a = await linea("caja");
  await linea("bodega"); // la activa
  assert.equal(configDesde(configDe(a.raiz)).modeloAprobacion, "opus", "sin decir nada, Opus: lo decidió él");
  const r = await ajustar({ linea: a.id, modeloAprobacion: "sonnet" });
  assert.equal(r.estado, 200);
  assert.match(r.nota ?? "", /^caja-\d+ aprueba con Sonnet desde la próxima tarea\.$/);
  const datos = partir(configDe(a.raiz)).datos;
  assert.deepEqual([datos.modelo_aprobacion, datos.modelo_spec ?? null, datos.modelo_construccion ?? null], ["sonnet", null, null]);

  const { leerLaPlanta } = await import("../../../../lib/fabrica/planta/disco.ts");
  const vista = (await leerLaPlanta()).lineas.find((x) => x.id === a.id)!;
  assert.deepEqual([vista.config?.modeloSpec, vista.config?.modeloConstruccion, vista.config?.modeloAprobacion, vista.config?.maxVueltas], ["opus", "inherit", "sonnet", 3]);
  for (const cuerpo of [{ linea: a.id, modeloAprobacion: "gpt-5" }, { linea: a.id, modeloAprobacion: "opus", modeloSpec: "opus" }]) assert.equal((await ajustar(cuerpo)).estado, 400, JSON.stringify(cuerpo));
  assert.ok(nadaSalio());
});

test("un modelo o una línea que no se conocen no escriben nada", async () => {
  const a = await linea("caja");
  const antes = configDe(a.raiz);
  for (const cuerpo of [
    { linea: a.id, modeloSpec: "gpt-5" },
    { linea: a.id, modeloSpec: "constructor" },
    { linea: a.id, modeloConstruccion: "gpt-5" },
    // Uno por vez: los dos juntos no dicen qué cambió.
    { linea: a.id, modeloSpec: "opus", modeloConstruccion: "opus" },
    { linea: a.id },
    { linea: "../otra", modeloSpec: "opus" },
    null,
  ]) assert.equal((await ajustar(cuerpo)).estado, 400, JSON.stringify(cuerpo));
  const r = await ajustar({ linea: "no-existe", modeloSpec: "opus" });
  assert.equal(r.estado, 400);
  assert.match(r.error ?? "", /no-existe/);
  assert.equal(configDe(a.raiz), antes);
});

test("el modelo de la spec de una tarea se elige en cualquier línea, antes de escribirla o si se detuvo a preguntar", async () => {
  const a = await linea("caja");
  const b = await linea("bodega"); // la activa
  const elegir = (l: string, tarea: string, modelo: unknown) => hacer({ accion: "modelo_spec", linea: l, tarea, modelo });
  const datosDe = (raiz: string, id: string) => partir(readFileSync(path.join(raiz, "factory", "tareas", `${id}-x.md`), "utf8"));

  let r = await elegir(a.id, "F-003", "fable");
  assert.equal(r.estado, 200);
  assert.match(r.nota ?? "", /Fable/);
  assert.equal(datosDe(a.raiz, "F-003").datos.modelo_spec, "fable");
  assert.match(datosDe(a.raiz, "F-003").cuerpo, /la spec se escribe con fable: lo eligió persona/);
  assert.equal(estadoDe(a.raiz, "F-003"), "pendiente");

  // F-001 se detuvo a preguntar desde la spec: su próxima vuelta puede ir con otro.
  assert.equal((await elegir(a.id, "F-001", "haiku")).estado, 200);
  // F-002 ya está en aprobación: su spec ya se escribió.
  r = await elegir(a.id, "F-002", "opus");
  assert.equal(r.estado, 409);
  assert.match(r.error ?? "", /aprobacion/);
  assert.equal(datosDe(a.raiz, "F-002").datos.modelo_spec, undefined);

  // Volver al de la línea quita el campo.
  assert.equal((await elegir(a.id, "F-003", null)).estado, 200);
  assert.equal(datosDe(a.raiz, "F-003").datos.modelo_spec, undefined);

  // En la activa también queda escrito directo: no pasa por la fábrica.
  assert.equal((await elegir(b.id, "F-003", "sonnet")).estado, 200);
  assert.equal(datosDe(b.raiz, "F-003").datos.modelo_spec, "sonnet");
  assert.equal(red.aLaFabrica.length, 0);

  // Lo que no se conoce no escribe nada.
  const antes = archivos(a.raiz);
  for (const modelo of ["gpt-5", "constructor", undefined, 3]) assert.equal((await elegir(a.id, "F-003", modelo)).estado, 400, String(modelo));
  assert.equal((await elegir("no-existe", "F-003", "opus")).estado, 400);
  assert.equal((await elegir(a.id, "F-999", "opus")).estado, 409);
  assert.deepEqual(archivos(a.raiz), antes);
  assert.ok(nadaSalio());
});

test("el modelo de la construcción de una tarea se elige mientras pueda volver a construirse, y no toca el de la spec", async () => {
  const a = await linea("caja");
  await linea("bodega"); // la activa: en la otra, descartar escribe directo
  const elegir = (tarea: string, modelo: unknown) => hacer({ accion: "modelo_construccion", linea: a.id, tarea, modelo });
  const datosDe = (id: string) => partir(readFileSync(path.join(a.raiz, "factory", "tareas", `${id}-x.md`), "utf8"));

  let r = await elegir("F-003", "opus");
  assert.equal(r.estado, 200);
  assert.equal(r.nota, "F-003 se construye con Opus, también si vuelve a construcción. Jev no lo cambia.");
  assert.equal(datosDe("F-003").datos.modelo_construccion, "opus");
  assert.equal(datosDe("F-003").datos.modelo_spec, undefined);
  assert.match(datosDe("F-003").cuerpo, /se construye con opus: lo eligió persona/);

  // F-002 está en aprobación: si se rechaza vuelve a construcción, así que todavía se elige.
  assert.equal((await elegir("F-002", "haiku")).estado, 200);
  assert.equal(datosDe("F-002").datos.modelo_construccion, "haiku");
  // La planta lo muestra en su tarjeta.
  const { leerLaPlanta } = await import("../../../../lib/fabrica/planta/disco.ts");
  const tarjeta = (await leerLaPlanta()).lineas.find((x) => x.id === a.id)!.tarjetas.find((t) => t.id === "F-002")!;
  assert.deepEqual([tarjeta.modeloConstruccion, tarjeta.eligeModeloDeConstruccion, tarjeta.eligeModeloDeSpec], ["haiku", true, false]);

  // Volver al de la línea quita el campo.
  r = await elegir("F-003", null);
  assert.equal(r.nota, "F-003 se construye con el modelo de la línea.");
  assert.equal(datosDe("F-003").datos.modelo_construccion, undefined);

  // Descartada, ya no se construye: no se elige.
  assert.equal((await hacer({ accion: "descartar", linea: a.id, tarea: "F-003", motivo: "Ya no va" })).estado, 200);
  r = await elegir("F-003", "opus");
  assert.equal(r.estado, 409);
  assert.match(r.error ?? "", /descartada/);
  assert.equal(datosDe("F-003").datos.modelo_construccion, undefined);
  for (const modelo of ["gpt-5", undefined]) assert.equal((await elegir("F-002", modelo)).estado, 400, String(modelo));
  assert.ok(nadaSalio());
});

test("la tarjeta de una tarea dice si el agente de salida pidió su clic para producción", async () => {
  const a = await linea("caja");
  const archivo = path.join(a.raiz, "factory", "tareas", "F-003-x.md");
  const { leerLaPlanta } = await import("../../../../lib/fabrica/planta/disco.ts");
  const tarjeta = async () => (await leerLaPlanta()).lineas.find((x) => x.id === a.id)!.tarjetas.find((t) => t.id === "F-003")!;
  assert.equal((await tarjeta()).pideSuClic, null);
  writeFileSync(archivo, readFileSync(archivo, "utf8").replace("---\n\n", "salida: tu-clic\nsalida_motivo: borra la columna precio_viejo\n---\n\n"));
  assert.equal((await tarjeta()).pideSuClic, "borra la columna precio_viejo");
  writeFileSync(archivo, readFileSync(archivo, "utf8").replace("salida: tu-clic", "salida: sin-objecion"));
  assert.equal((await tarjeta()).pideSuClic, null);
});

test("la tarjeta de una tarea dice si es sencilla o grande, y por qué; con otro valor, nada", async () => {
  const a = await linea("caja");
  const archivo = path.join(a.raiz, "factory", "tareas", "F-003-x.md");
  const { leerLaPlanta } = await import("../../../../lib/fabrica/planta/disco.ts");
  const tarjeta = async () => (await leerLaPlanta()).lineas.find((x) => x.id === a.id)!.tarjetas.find((t) => t.id === "F-003")!;
  const original = readFileSync(archivo, "utf8");
  assert.equal((await tarjeta()).integracion, null);
  writeFileSync(archivo, original.replace("---\n\n", "integracion_clase: grande\nintegracion_por: regla\nintegracion_motivo: \"toca lo delicado: db/alta.sql (SQL)\"\n---\n\n"));
  assert.deepEqual((await tarjeta()).integracion, { clase: "grande", motivo: "toca lo delicado: db/alta.sql (SQL)", por: "regla" });
  writeFileSync(archivo, original.replace("---\n\n", "integracion_clase: enorme\n---\n\n"));
  assert.equal((await tarjeta()).integracion, null);
  writeFileSync(archivo, original);
});

test("«Debió esperarme» anota un error de Jev en su línea, se puede quitar, y solo vale para lo que Jev dejó entrar sola", async () => {
  const a = await linea("caja");
  await linea("otra"); // la activa: la marca vale igual en la que no lo es
  const archivo = path.join(a.raiz, "factory", "tareas", "F-002-x.md");
  const jev = path.join(a.raiz, "factory", "jev.jsonl");
  const { leerLaPlanta } = await import("../../../../lib/fabrica/planta/disco.ts");
  const tarjeta = async () => (await leerLaPlanta()).lineas.find((x) => x.id === a.id)!.tarjetas.find((t) => t.id === "F-002")!;
  const lineas = () => (existsSync(jev) ? readFileSync(jev, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { t: string; decision: string; acierto?: boolean }) : []);
  const original = readFileSync(archivo, "utf8");

  // Sin clasificar, o clasificada por una regla, no hay de qué aprender.
  assert.equal((await hacer({ accion: "debio_esperar", linea: a.id, tarea: "F-002", marcar: true })).estado, 409);
  writeFileSync(archivo, original.replace("---\n\n", "integracion_clase: sencilla\nintegracion_por: regla\nintegracion_motivo: solo estilos\n---\n\n"));
  assert.equal((await hacer({ accion: "debio_esperar", linea: a.id, tarea: "F-002", marcar: true })).estado, 409);
  assert.equal((await hacer({ accion: "debio_esperar", linea: a.id, tarea: "F-002", marcar: "si" })).estado, 400);
  assert.deepEqual(lineas(), []);

  writeFileSync(archivo, original.replace("---\n\n", "integracion_clase: sencilla\nintegracion_por: jev\nintegracion_motivo: \"Jev ve el cambio superficial (p=0.81, umbral 0.70)\"\n---\n\n"));
  writeFileSync(jev, JSON.stringify({ t: "decision", ts: "2026-10-27T10:00:00.000Z", tarea: "F-002", decision: "integracion", p: 0.81, umbral: 0.7, ahorra: true, control: false }) + "\n");
  assert.equal((await tarjeta()).debioEsperar, false);
  const marcada = await hacer({ accion: "debio_esperar", linea: a.id, tarea: "F-002", marcar: true });
  assert.equal(marcada.estado, 200);
  assert.match(marcada.nota ?? "", /tenía que esperarte/);
  assert.equal((await tarjeta()).debioEsperar, true);
  assert.deepEqual(lineas().map((l) => [l.t, l.decision, l.acierto]), [["decision", "integracion", undefined], ["resultado", "integracion", false]]);

  // El umbral se aprieta por encima de lo que dijo Jev, igual que en el mod.
  const { lineasDeJev, umbralesAjustados } = await import("../../../../lib/fabrica/motor/jev.ts");
  assert.equal(Math.round(umbralesAjustados(lineasDeJev(readFileSync(jev, "utf8"))).integracion.umbral * 100), 82);

  // Marcar otra vez no anota nada; quitarla deja una línea que la retira, y el umbral vuelve.
  assert.match((await hacer({ accion: "debio_esperar", linea: a.id, tarea: "F-002", marcar: true })).nota ?? "", /ya estaba marcada/);
  assert.equal(lineas().length, 2);
  assert.equal((await hacer({ accion: "debio_esperar", linea: a.id, tarea: "F-002", marcar: false })).estado, 200);
  assert.equal((await tarjeta()).debioEsperar, false);
  assert.deepEqual(lineas().map((l) => l.t), ["decision", "resultado", "retira"]);
  assert.equal(umbralesAjustados(lineasDeJev(readFileSync(jev, "utf8"))).integracion.umbral, 0.7);
  assert.ok(nadaSalio());
  writeFileSync(archivo, original);
});

test("leer una tarea trae lo que escribió Label: el texto del PR y lo que se prueba a mano", async () => {
  const a = await linea("caja");
  const archivo = path.join(a.raiz, "factory", "tareas", "F-002-x.md");
  writeFileSync(archivo, readFileSync(archivo, "utf8") + "\n## Para probar a mano\n\n1. Cobra 1000 con descuento.\n2. El total tiene que ser 950.\n");
  const r = await ver(`linea=${a.id}&tarea=F-002`);
  assert.equal(r.estado, 200);
  const s = r.detalle?.secciones as unknown as { probarAMano: string; paraElPR: string };
  assert.match(s.probarAMano, /El total tiene que ser 950/);
  assert.equal(s.paraElPR, "");
  assert.ok(nadaSalio());
});
