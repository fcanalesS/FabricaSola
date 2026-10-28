import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { pedir, red } from "../../../../pruebas/entorno.ts";

const { GET, POST } = await import("./route.ts");
const { elegirProyecto } = await import("../../../../lib/fabrica/motor/proyecto.ts");
const { partir } = await import("../../../../lib/fabrica/motor/formato.ts");

beforeEach(() => {
  red.reiniciar();
});
afterEach(async () => {
  await red.calma();
});

type Documento = { ruta: string; id: string; titulo: string; estado: string; temas: string[]; reemplaza: string; reemplazadaPor: string; motivo: string };
type Memoria = {
  lugares: { en: string; nombre: string; esPlanta: boolean; existe: boolean; porRevisar: number }[];
  en: string;
  existe: boolean;
  ficha: { texto: string; reglas: number } | null;
  decisiones: Documento[];
  propuestas: Documento[];
  problemas: { ruta: string; que: string }[];
  sinCommit: number | null;
  habilidades: {
    texto: string;
    usos: { nombre: string; etapas: string[]; existe: boolean; tareas: number; ultima: string | null }[];
    sinUsar: { nombre: string; origen: string }[];
    costos: { nombre: string; oficios: string[]; bytes: number | null }[];
  } | null;
};
type Respuesta = { nota?: string; error?: string; avisos?: string[]; memoria: Memoria; hallazgos?: { ruta: string; linea: number; texto: string }[] };

const hacer = async (cuerpo: unknown) => {
  const r = await pedir(POST, cuerpo);
  return { estado: r.status, ...((await r.json()) as Respuesta) };
};
const ver = async (consulta = "") => {
  const r = await pedir(GET, undefined, `http://127.0.0.1:3000/api/fabrica/memoria${consulta}`);
  return { estado: r.status, ...((await r.json()) as Respuesta) };
};
/** Nada salió del equipo: ni a un modelo, ni a Jev, ni a un servicio, ni a otro lado. */
const nadaSalio = () => red.aClaude.length === 0 && red.aJev.length === 0 && red.aServicios.length === 0 && red.aOtros.length === 0;

let n = 0;
/** Una línea nueva con su factory/config.md y un package.json que usa PostgreSQL. */
async function lineaNueva(nombre = "linea", git = false) {
  const raiz = path.join(mkdtempSync(path.join(os.tmpdir(), "memoria-")), `${nombre}-${++n}`);
  mkdirSync(path.join(raiz, "factory"), { recursive: true });
  writeFileSync(path.join(raiz, "factory", "config.md"), "---\nbuild: npm run build\n---\n");
  writeFileSync(path.join(raiz, "package.json"), JSON.stringify({ dependencies: { pg: "8.11.3" } }));
  if (git) execFileSync("git", ["init", "-q"], { cwd: raiz });
  await elegirProyecto(raiz);
  return { id: `${nombre}-${n}`, raiz, vault: path.join(raiz, "factory", "memoria") };
}
const leer = (dir: string, carpeta: string, prefijo: string) => {
  const archivo = readdirSync(path.join(dir, carpeta)).find((x) => x.startsWith(prefijo))!;
  return partir(readFileSync(path.join(dir, carpeta, archivo), "utf8")).datos;
};
const ficha = (dir: string) => readFileSync(path.join(dir, "ficha.md"), "utf8");

test("crear la memoria de una línea la siembra con propuestas; aprobar escribe la decisión y la línea de la ficha, y nada sale a un modelo", async () => {
  const l = await lineaNueva("pos");
  const antes = await ver(`?en=${l.id}`);
  assert.deepEqual([antes.memoria.en, antes.memoria.existe], [l.id, false]);
  assert.ok(antes.memoria.lugares.some((x) => x.esPlanta && x.en === "_planta"));

  const creada = await hacer({ accion: "crear", en: l.id });
  assert.equal(creada.estado, 200, creada.error);
  assert.match(creada.nota!, /Memoria creada, con 1 propuesta para revisar/);
  const p = creada.memoria.propuestas[0]!;
  assert.deepEqual([p.id, p.estado, p.temas], ["P-0001", "propuesta", ["base-de-datos"]]);

  const r = await hacer({ accion: "aprobar", en: l.id, id: "P-0001" });
  assert.equal(r.estado, 200, r.error);
  assert.equal(r.nota, "P-0001 aprobada como D-0001, con su regla en la ficha.");
  assert.deepEqual([leer(l.vault, "decisiones", "D-0001").estado, leer(l.vault, "propuestas", "P-0001").estado], ["vigente", "aprobada"]);
  assert.match(ficha(l.vault), /^- \[base-de-datos\] PostgreSQL \(pg 8\.11\.3\)\. \(D-0001\)$/m);
  assert.deepEqual(r.memoria.problemas, []);
  // No es un repositorio: no se sabe qué está sin commit.
  assert.equal(r.memoria.sinCommit, null);
  assert.ok(nadaSalio());
});

test("rechazar sin motivo no se hace; con motivo, queda rechazada y la ficha no cambia", async () => {
  const l = await lineaNueva("caja");
  await hacer({ accion: "crear", en: l.id });
  const fichaAntes = ficha(l.vault);
  const sinMotivo = await hacer({ accion: "rechazar", en: l.id, id: "P-0001", motivo: " " });
  assert.equal(sinMotivo.estado, 409);
  assert.match(sinMotivo.error!, /Falta el motivo/);
  const r = await hacer({ accion: "rechazar", en: l.id, id: "P-0001", motivo: "Es solo para los reportes." });
  assert.equal(r.estado, 200);
  assert.deepEqual([leer(l.vault, "propuestas", "P-0001").estado, leer(l.vault, "propuestas", "P-0001").motivo], ["rechazada", "Es solo para los reportes."]);
  assert.equal(ficha(l.vault), fichaAntes);
  assert.equal((await hacer({ accion: "aprobar", en: l.id, id: "P-0001" })).estado, 409);
  assert.ok(nadaSalio());
});

test("reemplazar deja las dos decisiones enlazadas y la ficha con la nueva", async () => {
  const l = await lineaNueva("turnos");
  await hacer({ accion: "crear", en: l.id });
  await hacer({ accion: "aprobar", en: l.id, id: "P-0001" });
  const r = await hacer({ accion: "reemplazar", en: l.id, id: "D-0001", datos: { titulo: "MySQL 8", temas: "base-de-datos", regla: "MySQL 8, con mysql2.", secciones: { Decisión: "El hosting nuevo solo trae MySQL." } } });
  assert.equal(r.estado, 200, r.error);
  assert.deepEqual([leer(l.vault, "decisiones", "D-0001").estado, leer(l.vault, "decisiones", "D-0001").reemplazada_por, leer(l.vault, "decisiones", "D-0002").reemplaza], ["reemplazada", "D-0002", "D-0001"]);
  assert.match(ficha(l.vault), /^- \[base-de-datos\] MySQL 8, con mysql2\. \(D-0002\)$/m);
  assert.doesNotMatch(ficha(l.vault), /\(D-0001\)/);
  assert.deepEqual(r.memoria.problemas, []);
  assert.ok(nadaSalio());
});

test("la ficha de la planta se escribe a mano; lo que no es una regla no se guarda; y se busca sin tildes", async () => {
  const creada = await hacer({ accion: "crear", en: "_planta" });
  assert.equal(creada.estado, 200, creada.error);
  const mala = await hacer({ accion: "ficha", en: "_planta", texto: "# Ficha · la planta\n\nUsar Tailwind\n" });
  assert.equal(mala.estado, 409);
  assert.match(mala.error!, /la línea 3 no es una regla/);
  const r = await hacer({ accion: "ficha", en: "_planta", texto: "# Ficha · la planta\n\n- [estilo] Comentarios en español, con tildes.\n" });
  assert.equal(r.estado, 200, r.error);
  assert.equal(r.memoria.ficha!.reglas, 1);
  // La planta vive en comun/, fuera de un repositorio.
  assert.equal(r.memoria.sinCommit, null);
  const b = await ver("?en=_planta&buscar=ESPANOL tildes");
  assert.deepEqual(b.hallazgos!.map((h) => [h.ruta, h.linea]), [["ficha.md", 3]]);
  assert.ok(nadaSalio());
});

test("en un repositorio, la pantalla sabe cuántos archivos del vault siguen sin commit", async () => {
  const l = await lineaNueva("con-git", true);
  const r = await hacer({ accion: "crear", en: l.id });
  // LEEME, la ficha, la propuesta sembrada y los tres .gitkeep.
  assert.equal(r.memoria.sinCommit, 6);
});

/** Una propuesta de habilidad como la deja el mod al terminar una tarea, con un script. */
const propuestaDeHabilidad = (nombre: string) =>
  [
    "---",
    "id: P-0002",
    `titulo: La habilidad ${nombre}`,
    "estado: propuesta",
    "fecha: 2026-10-26",
    "temas: habilidades",
    "origen: F-014",
    'propone: "fabrica:constructor"',
    'regla: ""',
    'reemplaza: ""',
    `habilidad: ${nombre}`,
    "etapas: construccion",
    "cuando: antes de escribir SQL.",
    "---",
    "",
    ...["Decisión", "Por qué", "Qué se descartó", "Qué implica"].flatMap((s) => [`## ${s}`, "", "_(sin escribir)_", ""]),
    "## Archivos",
    "",
    "### SKILL.md",
    "",
    "    ---",
    `    name: ${nombre}`,
    "    description: Mira el esquema antes de escribir SQL.",
    "    ---",
    "",
    "    Corre scripts/esquema.sh.",
    "",
    "### scripts/esquema.sh",
    "",
    "    #!/bin/sh",
    "    echo esquema",
    "",
  ].join("\n");

test("aprobar una habilidad propuesta escribe su SKILL.md, su script y su línea en el catálogo; sin leer el script, nada", async () => {
  const l = await lineaNueva("habil");
  await hacer({ accion: "crear", en: l.id });
  writeFileSync(path.join(l.vault, "propuestas", "P-0002-la-habilidad-wolff-esquema.md"), propuestaDeHabilidad("wolff-esquema"));
  const skill = path.join(l.raiz, ".claude", "skills", "wolff-esquema");

  const sinLeer = await hacer({ accion: "aprobar", en: l.id, id: "P-0002" });
  assert.equal(sinLeer.estado, 409);
  assert.match(sinLeer.error!, /léelos enteros/);
  assert.equal(existsSync(skill), false);

  const r = await hacer({ accion: "aprobar", en: l.id, id: "P-0002", leyoLosScripts: true });
  assert.equal(r.estado, 200, r.error);
  assert.equal(readFileSync(path.join(skill, "SKILL.md"), "utf8"), "---\nname: wolff-esquema\ndescription: Mira el esquema antes de escribir SQL.\n---\n\nCorre scripts/esquema.sh.\n");
  assert.equal(readFileSync(path.join(skill, "scripts", "esquema.sh"), "utf8"), "#!/bin/sh\necho esquema\n");
  assert.match(readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8"), /^- \[construccion\] wolff-esquema: antes de escribir SQL\.$/m);
  assert.equal(leer(l.vault, "propuestas", "P-0002").estado, "aprobada");
  // La pantalla ya la ve en el catálogo, existente; y otra vez no se aprueba.
  assert.deepEqual(r.memoria.habilidades!.usos.map((u) => [u.nombre, u.existe]), [["wolff-esquema", true]]);
  assert.equal((await hacer({ accion: "aprobar", en: l.id, id: "P-0002", leyoLosScripts: true })).estado, 409);
  assert.deepEqual(r.memoria.problemas, []);
  assert.ok(nadaSalio());
});

test("rechazar una habilidad propuesta no escribe nada fuera del vault; una que ya existe en el proyecto no se pisa", async () => {
  const l = await lineaNueva("habil-no");
  mkdirSync(path.join(l.raiz, ".claude", "skills", "ya-esta"), { recursive: true });
  writeFileSync(path.join(l.raiz, ".claude", "skills", "ya-esta", "SKILL.md"), "---\nname: ya-esta\ndescription: La de antes.\n---\n\nNo me pises.\n");
  await hacer({ accion: "crear", en: l.id });
  const catalogo = readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8");

  writeFileSync(path.join(l.vault, "propuestas", "P-0002-la-habilidad-ya-esta.md"), propuestaDeHabilidad("ya-esta"));
  const pisar = await hacer({ accion: "aprobar", en: l.id, id: "P-0002", leyoLosScripts: true });
  assert.equal(pisar.estado, 409);
  assert.match(pisar.error!, /Ya hay una habilidad «ya-esta» en el proyecto/);
  assert.equal(readFileSync(path.join(l.raiz, ".claude", "skills", "ya-esta", "SKILL.md"), "utf8"), "---\nname: ya-esta\ndescription: La de antes.\n---\n\nNo me pises.\n");

  const r = await hacer({ accion: "rechazar", en: l.id, id: "P-0002", motivo: "Ya la tenemos." });
  assert.equal(r.estado, 200, r.error);
  assert.equal(leer(l.vault, "propuestas", "P-0002").estado, "rechazada");
  assert.equal(readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8"), catalogo);
  assert.deepEqual(readdirSync(path.join(l.raiz, ".claude", "skills")), ["ya-esta"]);
  assert.ok(nadaSalio());
});

test("la pestaña Habilidades: las que no se usan, asignarlas, cuánto se usaron y el catálogo escrito a mano", async () => {
  const l = await lineaNueva("habil-tab");
  mkdirSync(path.join(l.raiz, ".claude", "skills", "ditab-view"), { recursive: true });
  writeFileSync(path.join(l.raiz, ".claude", "skills", "ditab-view", "SKILL.md"), "---\nname: ditab-view\ndescription: Vistas de Ditab.\n---\n\nHola.\n");
  const creada = await hacer({ accion: "crear", en: l.id });
  assert.deepEqual(creada.memoria.habilidades!.sinUsar.map((s) => [s.nombre, s.origen]), [["ditab-view", "proyecto"]]);
  writeFileSync(path.join(l.vault, "bitacora", "2026-10.md"), "# Bitácora de 2026-10\n\n- 2026-10-20 · F-001 · Una · hecha · habilidades: ditab-view\n- 2026-10-24 · F-002 · Otra · hecha · habilidades: ditab-view\n");

  const asignada = await hacer({ accion: "asignar", en: l.id, nombre: "ditab-view", etapas: ["spec", "construccion"], cuando: "al hacer una vista de Ditab." });
  assert.equal(asignada.estado, 200, asignada.error);
  assert.equal(asignada.nota, "ditab-view quedó en spec, construccion.");
  const h = asignada.memoria.habilidades!;
  assert.deepEqual(h.usos.map((u) => [u.nombre, u.etapas, u.tareas, u.ultima]), [["ditab-view", ["spec", "construccion"], 2, "2026-10-24"]]);
  assert.deepEqual(h.sinUsar, []);
  assert.equal((await hacer({ accion: "asignar", en: l.id, nombre: "no-existe", etapas: ["spec"], cuando: "x" })).estado, 409);

  const mal = await hacer({ accion: "catalogo", en: l.id, texto: `${h.texto}Esto no es un uso\n- y esto tampoco\n` });
  assert.equal(mal.estado, 409);
  assert.match(mal.error!, /no es un uso/);
  const bien = await hacer({ accion: "catalogo", en: l.id, texto: `${h.texto}- [revision] fantasma: nunca.\n` });
  assert.equal(bien.estado, 200, bien.error);
  assert.match(bien.avisos!.join(" "), /No hay ninguna habilidad «fantasma»/);
  // La planta no tiene catálogo.
  assert.equal((await hacer({ accion: "crear-catalogo", en: "_planta" })).estado, 409);
  assert.equal((await ver("?en=_planta")).memoria.habilidades, null);
  assert.ok(nadaSalio());
});

test("lo que no tiene forma de acción no se hace; un lugar que no existe tampoco, y no es otro vault", async () => {
  const l = await lineaNueva("rara");
  await hacer({ accion: "crear", en: l.id });
  for (const malo of [
    { accion: "aprobar", en: l.id, id: "../../ficha" },
    { accion: "aprobar", en: "../otra", id: "P-0001" },
    { accion: "reemplazar", en: l.id, id: "P-0001", datos: {} },
    { accion: "borrar", en: l.id },
    { accion: "ficha", en: l.id, texto: 3 },
  ])
    assert.equal((await hacer(malo)).estado, 400, JSON.stringify(malo));
  const otra = await hacer({ accion: "aprobar", en: "no-existe", id: "P-0001" });
  assert.equal(otra.estado, 409);
  assert.match(otra.error!, /No hay ninguna línea «no-existe»/);
  assert.equal(leer(l.vault, "propuestas", "P-0001").estado, "propuesta");
});

test("las especialidades de la spec se proponen en la memoria de una línea, y aprobar una la deja tal cual en el proyecto", async () => {
  // Cada archivo de pruebas corre en su carpeta: las plantillas vienen del repositorio, como en la aplicación.
  const plantillas = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "fabrica", "plantillas", "especialidades");
  cpSync(plantillas, path.join(process.cwd(), "fabrica", "plantillas", "especialidades"), { recursive: true });
  const l = await lineaNueva("con-ia");
  assert.equal((await hacer({ accion: "proponer-especialidades", en: l.id })).estado, 409, "sin memoria, no");
  await hacer({ accion: "crear", en: l.id });
  const antes = readdirSync(path.join(l.vault, "propuestas")).filter((x) => x.endsWith(".md")).length;
  const catalogo = readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8");

  const r = await hacer({ accion: "proponer-especialidades", en: l.id });
  assert.equal(r.estado, 200, r.error);
  assert.match(r.nota ?? "", /4 propuestas/);
  const nuevas = r.memoria.propuestas.filter((p) => p.titulo.startsWith("Habilidad spec-"));
  assert.equal(nuevas.length, 4);
  assert.equal(readdirSync(path.join(l.vault, "propuestas")).filter((x) => x.endsWith(".md")).length, antes + 4);
  assert.deepEqual(r.memoria.problemas, []);
  // Nada en el repositorio hasta que él apruebe.
  assert.equal(existsSync(path.join(l.raiz, ".claude", "skills")), false);
  assert.equal(readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8"), catalogo);

  const otraVez = await hacer({ accion: "proponer-especialidades", en: l.id });
  assert.equal(otraVez.nota, "No quedó ninguna por proponer.");

  const guardarrailes = nuevas.find((p) => p.titulo === "Habilidad spec-guardarrailes para la spec")!;
  const aprobada = await hacer({ accion: "aprobar", en: l.id, id: guardarrailes.id });
  assert.equal(aprobada.estado, 200, aprobada.error);
  assert.equal(
    readFileSync(path.join(l.raiz, ".claude", "skills", "spec-guardarrailes", "SKILL.md"), "utf8"),
    readFileSync(path.join(plantillas, "spec-guardarrailes", "SKILL.md"), "utf8").replace(/\r\n?/g, "\n"),
  );
  assert.match(readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8"), /^- \[spec\] spec-guardarrailes: /m);

  // La planta no tiene catálogo: ahí no se proponen.
  assert.equal((await hacer({ accion: "proponer-especialidades", en: "_planta" })).estado, 400);

  // Las del constructor, aparte: con su etapa, y sin tocar las de la spec.
  const constructor = await hacer({ accion: "proponer-especialidades", en: l.id, etapa: "construccion" });
  assert.equal(constructor.estado, 200, constructor.error);
  assert.match(constructor.nota ?? "", /3 propuestas/);
  const delConstructor = constructor.memoria.propuestas.filter((p) => p.titulo.startsWith("Habilidad construir-"));
  assert.deepEqual(delConstructor.map((p) => p.titulo).sort(), [
    "Habilidad construir-codigo para la construcción",
    "Habilidad construir-interfaz para la construcción",
    "Habilidad construir-seguridad para la construcción",
  ]);
  const codigo = delConstructor.find((p) => p.titulo.includes("construir-codigo"))!;
  assert.equal((await hacer({ accion: "aprobar", en: l.id, id: codigo.id })).estado, 200);
  assert.match(readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8"), /^- \[construccion\] construir-codigo: /m);
  for (const etapa of ["revision", "otra", 3]) assert.equal((await hacer({ accion: "proponer-especialidades", en: l.id, etapa })).estado, 400, String(etapa));

  // La pestaña dice lo que pesa cada una: sus oficios y sus bytes.
  const habilidades = (await ver(`?en=${l.id}`)).memoria.habilidades!;
  assert.deepEqual(habilidades.costos.find((c) => c.nombre === "construir-interfaz")?.oficios, ["convenciones", "mirada-sin-contexto", "ruido-y-registros"]);
  assert.equal(habilidades.costos.length, 8);
  assert.ok(nadaSalio());
});

test("la Ley 21.719: se propone en La planta, aprobada queda entre las tuyas, y una línea la usa con un clic", async () => {
  const cerebro = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "fabrica", "plantillas", "cerebro");
  cpSync(cerebro, path.join(process.cwd(), "fabrica", "plantillas", "cerebro"), { recursive: true });
  const l = await lineaNueva("con-datos");
  await hacer({ accion: "crear", en: l.id }); // crea también la memoria de la planta
  const catalogoAntes = readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8");

  const r = await hacer({ accion: "proponer-ley", en: l.id });
  assert.equal(r.estado, 200, r.error);
  assert.match(r.nota ?? "", /Quedó propuesta en La planta como P-\d{4}/);
  const id = /P-\d{4}/.exec(r.nota!)![0];
  // Nada en la línea: ni su catálogo ni su repositorio.
  assert.equal(readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8"), catalogoAntes);
  assert.equal(existsSync(path.join(l.raiz, ".claude", "skills")), false);

  const aprobada = await hacer({ accion: "aprobar", en: "_planta", id });
  assert.equal(aprobada.estado, 200, aprobada.error);
  const suya = path.join(process.env.CLAUDE_CONFIG_DIR!, "skills", "ley-21719", "SKILL.md");
  assert.equal(readFileSync(suya, "utf8"), readFileSync(path.join(cerebro, "ley-21719", "SKILL.md"), "utf8").replace(/\r\n?/g, "\n"));
  assert.equal(existsSync(path.join(l.raiz, ".claude", "skills")), false);
  assert.equal((await hacer({ accion: "proponer-ley", en: l.id })).nota?.startsWith("No hizo falta: ya es una habilidad tuya"), true);

  // La línea la ve entre las tuyas, y la usa en spec y revisión.
  const vista = await ver(`?en=${l.id}`);
  assert.ok(vista.memoria.habilidades!.sinUsar.some((s) => s.nombre === "ley-21719" && s.origen === "suya"));
  const usada = await hacer({ accion: "asignar", en: l.id, nombre: "ley-21719", etapas: ["spec", "revision"], cuando: "Cuando la tarea toque datos personales de personas en Chile." });
  assert.equal(usada.estado, 200, usada.error);
  assert.match(readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8"), /^- \[spec, revision\] ley-21719: /m);
  assert.ok(nadaSalio());
});

test("construir con IA: se propone en La planta como la ley, aprobada queda entre las tuyas, y una línea la usa en la construcción", async () => {
  const cerebro = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "fabrica", "plantillas", "cerebro");
  cpSync(cerebro, path.join(process.cwd(), "fabrica", "plantillas", "cerebro"), { recursive: true });
  const l = await lineaNueva("con-ia-cerebro");
  await hacer({ accion: "crear", en: l.id });
  const catalogoAntes = readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8");

  const r = await hacer({ accion: "proponer-cerebro", en: l.id, nombre: "construir-con-ia" });
  assert.equal(r.estado, 200, r.error);
  const id = /P-\d{4}/.exec(r.nota!)![0];
  assert.equal(readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8"), catalogoAntes);
  // Solo las del cerebro: un nombre cualquiera no se propone.
  for (const nombre of ["construir-codigo", "../secreto", undefined]) assert.equal((await hacer({ accion: "proponer-cerebro", en: l.id, nombre })).estado, 400, String(nombre));

  assert.equal((await hacer({ accion: "aprobar", en: "_planta", id })).estado, 200);
  const suya = path.join(process.env.CLAUDE_CONFIG_DIR!, "skills", "construir-con-ia", "SKILL.md");
  assert.equal(readFileSync(suya, "utf8"), readFileSync(path.join(cerebro, "construir-con-ia", "SKILL.md"), "utf8").replace(/\r\n?/g, "\n"));
  assert.equal(existsSync(path.join(l.raiz, ".claude", "skills")), false);

  const vista = await ver(`?en=${l.id}`);
  assert.ok(vista.memoria.habilidades!.sinUsar.some((s) => s.nombre === "construir-con-ia" && s.origen === "suya"));
  assert.deepEqual(vista.memoria.habilidades!.costos.find((c) => c.nombre === "construir-con-ia")?.oficios, ["robustez", "contratos", "consumo-de-recursos"]);
  const usada = await hacer({ accion: "asignar", en: l.id, nombre: "construir-con-ia", etapas: ["construccion"], cuando: "Cuando la tarea llame a un modelo de IA, le dé herramientas a un agente o arme su contexto." });
  assert.equal(usada.estado, 200, usada.error);
  assert.match(readFileSync(path.join(l.raiz, "factory", "habilidades.md"), "utf8"), /^- \[construccion\] construir-con-ia: /m);
  assert.ok(nadaSalio());
});
