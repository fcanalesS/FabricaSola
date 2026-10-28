import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { pedir, red } from "../../../../pruebas/entorno.ts";

const { GET } = await import("./route.ts");
const { elegirProyecto, instantanea } = await import("../../../../lib/fabrica/motor/proyecto.ts");
const { carpetaDeCorridas } = await import("../../../../lib/fabrica/motor/corridas.ts");

beforeEach(() => {
  red.reiniciar();
});
afterEach(async () => {
  await red.calma();
});

type Tarjeta = { id: string; titulo: string; etapa: string; espera: string | null; desde: string | null; origen: string; origenTexto: string; motivo: string | null; linea?: string };
type Linea = {
  id: string;
  nombre: string;
  activa: boolean;
  estado: string;
  error: string | null;
  stack: string | null;
  entradas: string[];
  tarjetas: Tarjeta[];
  numeros: { abiertas: number; teEsperan: number; hechasHoy: number; aLaPrimera: { sinVolver: number; hechas: number } | null; porEtapa: Record<string, number> } | null;
  gastoHoyUsd: number;
};
type Planta = {
  lineas: Linea[];
  numeros: { lineas: number; corriendo: number; abiertas: number; teEsperan: number; hechasHoy: number; aLaPrimera: { sinVolver: number; hechas: number } | null; gastoHoyUsd: number };
  teEsperan: Tarjeta[];
  corridas: { id: string; linea: string | null; estado: string | null; costoUsd: number | null }[];
  puestos: { ocupados: unknown[]; maximo: number | null };
};

const ver = async () => {
  const r = await pedir(GET, undefined, "http://127.0.0.1:3000/api/fabrica/planta");
  return { estado: r.status, ...((await r.json()) as { planta: Planta; error?: string }) };
};
const nadaSalio = () => red.aClaude.length === 0 && red.aJev.length === 0 && red.aServicios.length === 0 && red.aOtros.length === 0;

const hace = (ms: number) => new Date(Date.now() - ms).toISOString();
const DIA = 86_400_000;

let n = 0;
/** Una línea con su factory/, sus tareas y sus eventos. La deja como línea de la fábrica (y activa). */
async function linea(nombre: string, tareas: Record<string, string>[], eventos: Record<string, unknown>[], config = "aprobacion: ambas\nparalelo_max: 3") {
  const raiz = path.join(mkdtempSync(path.join(os.tmpdir(), "planta-")), `${nombre}-${++n}`);
  mkdirSync(path.join(raiz, "factory", "tareas"), { recursive: true });
  writeFileSync(path.join(raiz, "factory", "config.md"), `---\nbuild: npm run build\n${config}\n---\n`);
  for (const t of tareas) {
    const datos = Object.entries(t).filter(([k]) => k !== "cuerpo").map(([k, v]) => `${k}: ${v}`).join("\n");
    writeFileSync(path.join(raiz, "factory", "tareas", `${t.id}-x.md`), `---\n${datos}\n---\n\n## Pedido\n\n${t.cuerpo ?? t.titulo}\n`);
  }
  writeFileSync(path.join(raiz, "factory", "eventos.jsonl"), eventos.map((e) => JSON.stringify(e)).join("\n") + (eventos.length ? "\n" : ""));
  await elegirProyecto(raiz);
  return { id: `${nombre}-${n}`, raiz };
}

/** Una corrida guardada, como la deja `iniciarCorrida`. */
function corrida(proyecto: string, inicio: Date, extra: Record<string, unknown>) {
  mkdirSync(carpetaDeCorridas(), { recursive: true });
  const id = inicio.toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  writeFileSync(path.join(carpetaDeCorridas(), `${id}.json`), JSON.stringify({ id, proyecto, tareas: [], inicio: inicio.toISOString(), comando: "claude", ...extra }));
  return id;
}

/** Los archivos de una carpeta, con su tamaño y su hora: para ver que nada se escribió. */
const foto = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const p = path.join(e.parentPath, e.name);
      const s = statSync(p);
      return `${p}:${s.size}:${s.mtimeMs}`;
    })
    .sort();

test("lee cada línea por separado: sus tareas por etapa, lo que lo espera, lo hecho hoy y «a la primera», sin escribir nada ni salir a la red", async () => {
  const a = await linea(
    "pos",
    [
      { id: "F-001", titulo: "Exportar a CSV", estado: "necesita-humano", vueltas: "0", motivo: "¿Coma o punto y coma?", origen_entrada: "github:dueno/pos#128" },
      { id: "F-002", titulo: "Filtro por tienda", estado: "aprobacion", vueltas: "1", en_aprobacion_desde: hace(10 * 60_000), cuerpo: "Filtrar.\n\n_Documento de requerimientos: `factory/requerimientos/202610261200-stock.md`_" },
      { id: "F-003", titulo: "Columna de pago", estado: "hecho", vueltas: "0", origen_entrada: "formulario" },
      { id: "F-004", titulo: "Filtro guardado", estado: "hecho", vueltas: "2" },
      { id: "F-005", titulo: "De la semana pasada", estado: "hecho", vueltas: "0" },
      { id: "F-006", titulo: "Ya no va", estado: "descartada", vueltas: "0" },
      { id: "F-007", titulo: "Construyéndose", estado: "construccion", vueltas: "0", origen_hallazgo: "0123456789abcdef" },
    ],
    [
      { ts: hace(40 * 60_000), tarea: "F-001", de: "spec", a: "necesita-humano" },
      { ts: hace(60_000), tarea: "F-003", de: "aprobacion", a: "hecho" },
      { ts: hace(2 * 60_000), tarea: "F-004", de: "aprobacion", a: "hecho" },
      { ts: hace(8 * DIA), tarea: "F-005", de: "aprobacion", a: "hecho" },
    ],
  );
  // La misma numeración en otra línea: F-001 de aquí no es F-001 de allá.
  const b = await linea("inventario", [{ id: "F-001", titulo: "Ajuste por merma", estado: "pendiente", vueltas: "0" }], []);
  // Una línea sin factory/ y otra cuya carpeta se borró: no tapan a las demás.
  const sinFabrica = path.join(mkdtempSync(path.join(os.tmpdir(), "planta-")), "saludos");
  mkdirSync(sinFabrica);
  await elegirProyecto(sinFabrica);
  const borrada = await linea("vieja", [], []);
  rmSync(borrada.raiz, { recursive: true, force: true });

  const antes = [...foto(a.raiz), ...foto(b.raiz)];
  const r = await ver();
  assert.equal(r.estado, 200);
  const p = r.planta;
  const la = p.lineas.find((l) => l.id === a.id)!;
  const lb = p.lineas.find((l) => l.id === b.id)!;

  // Por etapa: la que espera una respuesta va en la etapa de la que vino; las hechas de otro día y las descartadas no se muestran.
  assert.deepEqual(
    la.tarjetas.map((t) => [t.id, t.etapa, t.espera]),
    [
      ["F-001", "spec", "pregunta"],
      ["F-002", "aprobacion", "veredicto"],
      ["F-003", "hechas", null],
      ["F-004", "hechas", null],
      ["F-007", "construccion", null],
    ],
  );
  assert.equal(la.tarjetas[0]!.motivo, "¿Coma o punto y coma?");
  assert.deepEqual(
    la.tarjetas.map((t) => t.origenTexto),
    ["GitHub #128", "Documento", "Formulario", "A mano", "Deuda"],
  );
  assert.deepEqual(la.numeros && [la.numeros.abiertas, la.numeros.teEsperan, la.numeros.hechasHoy], [3, 2, 2]);
  // «A la primera»: de las hechas en 7 días (F-003 y F-004), solo F-003 no volvió.
  assert.deepEqual(la.numeros?.aLaPrimera, { sinVolver: 1, hechas: 2 });
  assert.deepEqual(la.entradas, ["Formulario"]);

  assert.deepEqual(lb.tarjetas.map((t) => [t.id, t.titulo, t.etapa]), [["F-001", "Ajuste por merma", "pendiente"]]);
  assert.equal(lb.numeros?.aLaPrimera, null);

  const sf = p.lineas.find((l) => l.nombre === "saludos")!;
  assert.deepEqual([sf.estado, sf.tarjetas.length, sf.numeros], ["sin-fabrica", 0, null]);
  const lv = p.lineas.find((l) => l.id === borrada.id)!;
  assert.equal(lv.estado, "error");
  assert.match(lv.error ?? "", /carpeta/);
  // La activa es la última elegida, y se dice: la planta no la usa para actuar.
  assert.deepEqual(p.lineas.filter((l) => l.activa).map((l) => l.id), [borrada.id]);

  // Toda la planta: lo que lo espera, de lo más viejo a lo más nuevo.
  assert.deepEqual([p.numeros.lineas, p.numeros.abiertas, p.numeros.teEsperan, p.numeros.hechasHoy], [4, 4, 2, 2]);
  assert.deepEqual(p.teEsperan.map((t) => [t.linea, t.id]), [[a.id, "F-001"], [a.id, "F-002"]]);

  // Solo leyó.
  assert.deepEqual([...foto(a.raiz), ...foto(b.raiz)], antes);
  assert.ok(nadaSalio());
});

test("un veredicto que la línea no le pide, o una pregunta ya respondida, no lo esperan", async () => {
  const l = await linea(
    "solo-agente",
    [
      { id: "F-001", titulo: "La aprueba el agente", estado: "aprobacion", vueltas: "0" },
      { id: "F-002", titulo: "Ya respondida", estado: "necesita-humano", vueltas: "0", actualizada: hace(60 * 60_000) },
    ],
    [{ ts: hace(60 * 60_000), tarea: "F-002", de: "construccion", a: "necesita-humano" }],
    "aprobacion: agente",
  );
  mkdirSync(path.join(l.raiz, "factory", "respuestas"), { recursive: true });
  writeFileSync(path.join(l.raiz, "factory", "respuestas", "F-002.json"), JSON.stringify({ texto: "Con coma.", por: "él", fecha: hace(1000) }));
  const p = (await ver()).planta;
  const la = p.lineas.find((x) => x.id === l.id)!;
  assert.deepEqual(la.tarjetas.map((t) => [t.id, t.etapa, t.espera]), [["F-001", "aprobacion", null], ["F-002", "construccion", null]]);
  assert.equal(la.numeros?.teEsperan, 0);
});

test("la instantánea de la línea activa sigue igual: sus últimos eventos, no todos", async () => {
  const eventos = Array.from({ length: 250 }, (_, i) => ({ ts: hace((250 - i) * 1000), tarea: "F-001", de: "pendiente", a: "spec" }));
  await linea("muchos", [{ id: "F-001", titulo: "Una", estado: "spec", vueltas: "0" }], eventos);
  assert.equal((await instantanea())?.eventos.length, 200);
});

test("las corridas de hoy van a su línea con lo que costaron; las de otro día no cuentan, y la que corre pone a su línea corriendo", async () => {
  const a = await linea("caja", [], []);
  const b = await linea("bodega", [], []);
  const ahora = Date.now();
  corrida(a.raiz, new Date(ahora - 2000), { estado: "terminada", fin: new Date(ahora - 500).toISOString(), costoUsd: 0.5 });
  corrida(a.raiz, new Date(ahora - 3 * DIA), { estado: "terminada", costoUsd: 9 });
  corrida(b.raiz, new Date(ahora), { estado: "corriendo", pid: process.pid });

  const p = (await ver()).planta;
  const la = p.lineas.find((x) => x.id === a.id)!;
  const lb = p.lineas.find((x) => x.id === b.id)!;
  assert.equal(la.gastoHoyUsd, 0.5);
  assert.deepEqual([la.estado, lb.estado], ["quieta", "corriendo"]);
  assert.deepEqual(p.corridas.map((c) => [c.linea, c.estado]), [[b.id, "corriendo"], [a.id, "terminada"]]);
  assert.equal(p.numeros.corriendo, 1);
  // Mientras corre una sola línea, los puestos son los de esa línea.
  assert.equal(p.puestos.maximo, 3);
  assert.ok(nadaSalio());
});
