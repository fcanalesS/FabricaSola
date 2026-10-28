import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { leerVault, revisarVault, type ArchivoDelVault } from "../memoria/formato.ts";
import { agentesConHabilidades, conSusNikkes, textosDeNikkes } from "../motor/agentes.ts";
import { costoDeEspecialidades, plantillaDelCerebro, plantillasDeEspecialidades } from "./disco.ts";
import { CEREBRO as LISTA_DEL_CEREBRO, ESPECIALIDADES, IA, LEY, propuestaDelCerebro, propuestaDeLaLey, propuestasDeEspecialidades } from "./especialidades.ts";
import { habilidadDesde, habilidadesPorEtapa, huellaDe, nikkesDe, TOPES_DE_HABILIDAD, type HabilidadDisponible } from "./formato.ts";
import { aprobarHabilidad, aprobarHabilidadSuya, problemasDeLaHabilidad } from "./propuestas.ts";

const PLANTILLAS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "fabrica", "plantillas", "especialidades");
const plantillas = await plantillasDeEspecialidades(PLANTILLAS, "spec");
const delConstructor = await plantillasDeEspecialidades(PLANTILLAS, "construccion");
const delAprobador = await plantillasDeEspecialidades(PLANTILLAS, "aprobacion");
const VAULT: ArchivoDelVault[] = [{ ruta: "ficha.md", texto: "# Memoria de caja\n\n## Reglas\n" }];
const FECHA = "2026-10-26";

const NIKKES: Record<string, string[]> = {
  "spec-guardarrailes": ["crow-abuso", "noah-robustez"],
  "spec-datos-y-contexto": ["velvet-auditoria", "modernia-interna"],
  "spec-evaluacion": ["rapunzel-pruebas"],
  "spec-contratos-y-recursos": ["drake-contrato", "behemoth-drenaje", "jackal-carga"],
  "construir-codigo": ["centi-implementacion", "ade-convenciones", "drake-contrato", "noah-robustez", "rapunzel-pruebas"],
  "construir-seguridad": ["crow-abuso", "modernia-interna", "velvet-auditoria"],
  "construir-interfaz": ["ade-convenciones", "modernia-recien-llegada", "liberalio-ruido"],
  "aprobar-entrega": ["privaty-entrega"],
};

test("las ocho plantillas se leen como habilidades de su etapa, con sus Nikkes y dentro de los topes", () => {
  assert.deepEqual([...plantillas, ...delConstructor, ...delAprobador].map((p) => p.nombre), ESPECIALIDADES.map((e) => e.nombre));
  assert.deepEqual(delAprobador.map((p) => [p.nombre, p.etapa]), [["aprobar-entrega", "aprobacion"]]);
  assert.deepEqual(plantillas.map((p) => p.etapa), ["spec", "spec", "spec", "spec"]);
  assert.deepEqual(delConstructor.map((p) => p.nombre), ["construir-codigo", "construir-seguridad", "construir-interfaz"]);
  for (const p of [...plantillas, ...delConstructor, ...delAprobador]) {
    const h = habilidadDesde(p.nombre, p.skill, "proyecto");
    assert.equal(h?.nombre, p.nombre);
    assert.ok(h?.descripcion, `${p.nombre} sin descripción`);
    assert.equal(h?.soloAMano, false);
    assert.deepEqual(h?.nikkes, NIKKES[p.nombre]);
    assert.ok(p.cuando.length <= TOPES_DE_HABILIDAD.cuando, `${p.nombre}: su «cuándo» pasa del tope`);
    assert.ok(new TextEncoder().encode(p.skill).length <= TOPES_DE_HABILIDAD.bytesPorArchivo);
    assert.doesNotMatch(p.skill, /\r/);
  }
});

test("las Nikkes de una habilidad: solo nombres con forma, sin repetir y con tope", () => {
  assert.deepEqual(nikkesDe("crow-abuso, ../secreto, Crow, crow-abuso, a b, noah-robustez"), ["crow-abuso", "noah-robustez"]);
  assert.deepEqual(nikkesDe(undefined), []);
  assert.equal(nikkesDe(Array.from({ length: 9 }, (_, i) => `n${i}`).join(",")).length, 6);
});

test("proponerlas deja una propuesta por cada una que falta, que el vault da por buena y que se aprueba tal cual", () => {
  const r = propuestasDeEspecialidades(VAULT, plantillas, { disponibles: [], catalogo: null, fecha: FECHA });
  assert.deepEqual(r.nuevas.map((n) => [n.id, n.nombre]), [
    ["P-0001", "spec-guardarrailes"],
    ["P-0002", "spec-datos-y-contexto"],
    ["P-0003", "spec-evaluacion"],
    ["P-0004", "spec-contratos-y-recursos"],
  ]);
  const archivos = [...VAULT, ...r.nuevas.map(({ ruta, texto }) => ({ ruta, texto }))];
  assert.deepEqual(revisarVault(archivos).filter((p) => p.ruta.startsWith("propuestas/")), []);
  const propuestas = leerVault(archivos).propuestas;
  for (const [i, p] of propuestas.entries()) {
    assert.deepEqual(problemasDeLaHabilidad(p), []);
    assert.deepEqual(p.habilidad?.etapas, ["spec"]);
    // El SKILL.md de la propuesta es el de la plantilla, byte por byte.
    assert.equal(p.habilidad?.archivos.find((a) => a.ruta === "SKILL.md")?.texto, plantillas[i]!.skill);
  }

  const aprobada = aprobarHabilidad(archivos, "P-0001", { catalogo: null, nombreDeLinea: "caja", disponibles: [], leyoLosScripts: false });
  const skill = aprobada.repositorio.find((a) => a.ruta === ".claude/skills/spec-guardarrailes/SKILL.md");
  assert.equal(skill?.texto, plantillas[0]!.skill);
  assert.equal(huellaDe(skill!.texto), huellaDe(plantillas[0]!.skill));
  assert.match(aprobada.repositorio.find((a) => a.ruta === "factory/habilidades.md")!.texto, /^- \[spec\] spec-guardarrailes: Cuando la tarea llame a un modelo de IA/m);
});

test("no se propone la que ya existe, la que el catálogo nombra ni la que ya espera; los ids siguen", () => {
  const primeras = propuestasDeEspecialidades(VAULT, plantillas, { disponibles: [], catalogo: null, fecha: FECHA });
  const conPropuestas = [...VAULT, ...primeras.nuevas.map(({ ruta, texto }) => ({ ruta, texto }))];
  const otraVez = propuestasDeEspecialidades(conPropuestas, plantillas, { disponibles: [], catalogo: null, fecha: FECHA });
  assert.deepEqual(otraVez.nuevas, []);
  assert.deepEqual(otraVez.omitidas.map((o) => o.por), ["ya está propuesta (P-0001)", "ya está propuesta (P-0002)", "ya está propuesta (P-0003)", "ya está propuesta (P-0004)"]);

  const disponibles: HabilidadDisponible[] = [{ nombre: "spec-evaluacion", descripcion: "x", origen: "suya", soloAMano: false }];
  // Una rechazada antes no frena: él la vuelve a pedir. Su id sí cuenta.
  const conOtra: ArchivoDelVault[] = [...VAULT, { ruta: "propuestas/P-0007-otra.md", texto: "---\nid: P-0007\nestado: rechazada\nhabilidad: spec-guardarrailes\n---\n" }];
  const r = propuestasDeEspecialidades(conOtra, plantillas, { disponibles, catalogo: "# Habilidades\n\n- [spec] spec-contratos-y-recursos: a mano.\n", fecha: FECHA });
  assert.deepEqual(r.nuevas.map((n) => [n.id, n.nombre]), [
    ["P-0008", "spec-guardarrailes"],
    ["P-0009", "spec-datos-y-contexto"],
  ]);
  assert.deepEqual(r.omitidas, [
    { nombre: "spec-evaluacion", por: "ya es una habilidad tuya" },
    { nombre: "spec-contratos-y-recursos", por: "el catálogo ya la nombra" },
  ]);
});

test("el agente de la etapa lleva el archivo entero de cada Nikke, leído de la carpeta de nikke y nada de fuera", async () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "nikkes-"));
  const dir = path.join(base, "agents");
  mkdirSync(dir);
  const crow = "---\nname: crow-abuso\n---\n\n# Crow — Casos de abuso\n\nNaciste en el Outer Rim.\nLlamas al Comandante «Commander».\n";
  writeFileSync(path.join(dir, "crow-abuso.md"), crow);
  writeFileSync(path.join(base, "secreto.md"), "no me leas");

  const textos = await textosDeNikkes(["crow-abuso", "noah-robustez", "../secreto", "Crow-Abuso", "crow-abuso"], dir);
  assert.deepEqual([...textos.keys()], ["crow-abuso"]);
  assert.equal(textos.get("crow-abuso"), crow);
  assert.equal((await textosDeNikkes(["crow-abuso"], path.join(base, "no-existe"))).size, 0);

  const prompt = conSusNikkes("# Escritor de specs", ["crow-abuso", "noah-robustez"], textos);
  assert.ok(prompt.startsWith("# Escritor de specs\n"));
  // Entero, tal cual: con su frontmatter, su historia y su voz.
  assert.ok(prompt.includes(crow.trim()));
  assert.match(prompt, /solo al abrir y al cerrar tu resumen final/);
  assert.match(prompt, /No llegaron, porque no están en la carpeta de nikke de este equipo: noah-robustez/);
  assert.doesNotMatch(prompt, /no me leas/);
  assert.equal(conSusNikkes("# Solo", [], textos), "# Solo");

  const def = (nombre: string) => ({ nombre, descripcion: nombre, prompt: `# ${nombre}`, tools: ["Read"], model: null, archivo: "x.md", enCorridas: "si" as const });
  const defs = ["fabrica:spec-escritor", "fabrica:constructor", "fabrica:revisor-codigo", "fabrica:revisor-seguridad", "fabrica:revisor-ui", "fabrica:aprobador"].map(def);
  const auto = { spec: "auto", construccion: "auto", revision_codigo: "auto", revision_seguridad: "auto", ui: "auto", aprobacion: "auto" };
  const agentes = agentesConHabilidades(auto, defs, { spec: [{ nombre: "spec-guardarrailes", nikkes: ["crow-abuso"] }], construccion: [{ nombre: "wolff-db" }], revision: [], aprobacion: [] }, textos);
  assert.ok(agentes["fabrica-hab-spec"]!.prompt.includes(crow.trim()));
  assert.equal(agentes["fabrica-hab-construccion"]!.prompt, "# fabrica:constructor");
});

test("las del constructor se proponen para la construcción, y se aprueban en su etapa", () => {
  const r = propuestasDeEspecialidades(VAULT, delConstructor, { disponibles: [], catalogo: null, fecha: FECHA });
  assert.deepEqual(r.nuevas.map((n) => [n.id, n.nombre]), [
    ["P-0001", "construir-codigo"],
    ["P-0002", "construir-seguridad"],
    ["P-0003", "construir-interfaz"],
  ]);
  const archivos = [...VAULT, ...r.nuevas.map(({ ruta, texto }) => ({ ruta, texto }))];
  assert.deepEqual(revisarVault(archivos).filter((p) => p.ruta.startsWith("propuestas/")), []);
  const propuestas = leerVault(archivos).propuestas;
  assert.equal(propuestas[0]!.titulo, "Habilidad construir-codigo para la construcción");
  for (const p of propuestas) {
    assert.deepEqual(problemasDeLaHabilidad(p), []);
    assert.deepEqual(p.habilidad?.etapas, ["construccion"]);
  }
  // Lo que dice de qué implica es de la construcción, no de la spec.
  const texto = r.nuevas[0]!.texto;
  assert.match(texto, /Plan-Builder\.md/);
  assert.match(texto, /otra vez en\s+cada vuelta de retrabajo/);
  assert.match(texto, /archivos enteros\s+al constructor/);
  assert.match(texto, /Darle a la construcción de esta línea/);
  assert.doesNotMatch(texto, /la spec de esta línea no se salta/);

  const aprobada = aprobarHabilidad(archivos, "P-0001", { catalogo: null, nombreDeLinea: "caja", disponibles: [], leyoLosScripts: false });
  assert.equal(aprobada.repositorio.find((a) => a.ruta === ".claude/skills/construir-codigo/SKILL.md")?.texto, delConstructor[0]!.skill);
  assert.match(aprobada.repositorio.find((a) => a.ruta === "factory/habilidades.md")!.texto, /^- \[construccion\] construir-codigo: Cuando la tarea cambie o agregue código del proyecto\.$/m);
});

test("el constructor lleva las Nikkes de sus especialidades una vez cada una, y si ya es Centi, Centi no va otra vez", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "nikkes-"));
  const nombres = [...new Set([...NIKKES["construir-codigo"]!, ...NIKKES["construir-seguridad"]!])];
  for (const n of nombres) writeFileSync(path.join(dir, `${n}.md`), `---\nname: ${n}\n---\n\n# ${n}\n\nEl oficio de ${n}.\n`);
  const textos = await textosDeNikkes(nombres, dir);
  const porEtapa = {
    spec: [],
    construccion: [
      { nombre: "construir-codigo", nikkes: NIKKES["construir-codigo"] },
      { nombre: "construir-seguridad", nikkes: NIKKES["construir-seguridad"] },
    ],
    revision: [],
    aprobacion: [],
  };
  const def = (nombre: string, enCorridas: "si" | "inyectado" = "si") => ({ nombre, descripcion: nombre, prompt: `# ${nombre}`, tools: ["Read"], model: null, archivo: "x.md", enCorridas });
  const auto = { spec: "auto", construccion: "auto", revision_codigo: "auto", revision_seguridad: "auto", ui: "auto", aprobacion: "auto" };
  const cuantas = (prompt: string, n: string) => prompt.split(`El oficio de ${n}.`).length - 1;

  // Con el constructor de la fábrica: las ocho, una vez cada una.
  const conElDeLaFabrica = agentesConHabilidades(auto, [def("fabrica:constructor")], porEtapa, textos)["fabrica-hab-construccion"]!;
  for (const n of nombres) assert.equal(cuantas(conElDeLaFabrica.prompt, n), 1, n);
  assert.deepEqual(conElDeLaFabrica.skills, ["construir-codigo", "construir-seguridad"]);

  // Con Centi elegida como constructora: su prompt ya es su archivo, y no se suma otra vez.
  const centi = { ...def("nikke:centi-implementacion", "inyectado"), prompt: textos.get("centi-implementacion")! };
  const conCenti = agentesConHabilidades({ ...auto, construccion: "nikke:centi-implementacion" }, [def("fabrica:constructor"), centi], porEtapa, textos)["fabrica-hab-construccion"]!;
  assert.equal(cuantas(conCenti.prompt, "centi-implementacion"), 1);
  assert.equal(cuantas(conCenti.prompt, "drake-contrato"), 1);
});

test("lo que pesa cada especialidad: sus Nikkes y sus bytes, sin leerlas; sin la carpeta de nikke, no se sabe", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "nikkes-"));
  writeFileSync(path.join(dir, "crow-abuso.md"), "x".repeat(1000));
  writeFileSync(path.join(dir, "modernia-interna.md"), "x".repeat(500));
  const costos = await costoDeEspecialidades(PLANTILLAS, dir, CEREBRO);
  // Las especialidades y, después, las del cerebro.
  assert.deepEqual(costos.map((c) => c.nombre), [...ESPECIALIDADES.map((e) => e.nombre), "ley-21719", "construir-con-ia"]);
  assert.deepEqual(costos.find((c) => c.nombre === "ley-21719"), { nombre: "ley-21719", nikkes: [], bytes: 0 });
  // Sin la plantilla de una del cerebro, esa no se muestra.
  assert.equal((await costoDeEspecialidades(PLANTILLAS, dir, path.join(dir, "no-existe"))).length, ESPECIALIDADES.length);
  // velvet-auditoria no está en esa carpeta: cuenta cero.
  assert.deepEqual(costos.find((c) => c.nombre === "construir-seguridad"), { nombre: "construir-seguridad", nikkes: NIKKES["construir-seguridad"], bytes: 1500 });
  assert.equal((await costoDeEspecialidades(PLANTILLAS, null, CEREBRO)).find((c) => c.nombre === "construir-codigo")?.bytes, null);
});

const CEREBRO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "fabrica", "plantillas", "cerebro");

test("la habilidad de la Ley 21.719: dice de qué versión es, no certifica y entra en spec y revisión", async () => {
  const skill = await plantillaDelCerebro(LEY.nombre, CEREBRO);
  const h = habilidadDesde(LEY.nombre, skill, "suya");
  assert.equal(h?.nombre, "ley-21719");
  assert.ok(h?.descripcion);
  assert.equal(h?.nikkes, undefined);
  assert.match(skill, /13 de diciembre de 2024/);
  assert.match(skill, /1 de diciembre de 2026/);
  assert.match(skill, /No certifica/);
  assert.ok(LEY.cuando.length <= TOPES_DE_HABILIDAD.cuando);
  assert.deepEqual([...LEY.etapas], ["spec", "revision"]);
});

test("se propone en la planta y, aprobada, queda como habilidad suya tal cual; no se repite ni pisa", async () => {
  const skill = await plantillaDelCerebro(LEY.nombre, CEREBRO);
  const planta: ArchivoDelVault[] = [{ ruta: "ficha.md", texto: "# Memoria de la planta\n" }];
  const r = propuestaDeLaLey(planta, skill, { suyas: [], fecha: FECHA });
  assert.ok("nueva" in r);
  const archivos = [...planta, { ruta: r.nueva.ruta, texto: r.nueva.texto }];
  assert.deepEqual(revisarVault(archivos).filter((p) => p.ruta.startsWith("propuestas/")), []);
  const p = leerVault(archivos).propuestas[0]!;
  assert.deepEqual(problemasDeLaHabilidad(p), []);
  assert.deepEqual(p.habilidad?.etapas, ["spec", "revision"]);

  const aprobada = aprobarHabilidadSuya(archivos, r.nueva.id, { suyas: [], leyoLosScripts: false });
  assert.equal(aprobada.nombre, "ley-21719");
  assert.deepEqual(aprobada.archivos, [{ ruta: "SKILL.md", texto: skill }]);
  assert.match(aprobada.vault[0]!.texto, /estado: aprobada/);

  assert.ok("omitida" in propuestaDeLaLey(archivos, skill, { suyas: [], fecha: FECHA }), "ya espera");
  const suya: HabilidadDisponible = { nombre: "ley-21719", descripcion: "x", origen: "suya", soloAMano: false };
  assert.ok("omitida" in propuestaDeLaLey(planta, skill, { suyas: [suya], fecha: FECHA }), "ya es suya");
  assert.throws(() => aprobarHabilidadSuya(archivos, r.nueva.id, { suyas: [suya], leyoLosScripts: false }), /no la pisa/);
});

test("construir con IA: del cerebro, para la construcción, con Noah, Drake y Behemoth; la ley y ella salen de una sola lista", async () => {
  assert.deepEqual(LISTA_DEL_CEREBRO.map((h) => h.nombre), ["ley-21719", "construir-con-ia"]);
  const skill = await plantillaDelCerebro(IA.nombre, CEREBRO);
  const h = habilidadDesde(IA.nombre, skill, "suya");
  assert.deepEqual(h?.nikkes, ["noah-robustez", "drake-contrato", "behemoth-drenaje"]);
  assert.ok(h?.descripcion);
  assert.deepEqual([...IA.etapas], ["construccion"]);
  assert.ok(IA.cuando.length <= TOPES_DE_HABILIDAD.cuando);
  assert.ok(new TextEncoder().encode(skill).length <= TOPES_DE_HABILIDAD.bytesPorArchivo);
  assert.match(skill, /parcialmente correcto/);
  assert.match(skill, /no llamas a un modelo de verdad/);

  const planta: ArchivoDelVault[] = [{ ruta: "ficha.md", texto: "# Memoria de la planta\n" }];
  const r = propuestaDelCerebro(planta, IA, skill, { suyas: [], fecha: FECHA });
  assert.ok("nueva" in r);
  const archivos = [...planta, { ruta: r.nueva.ruta, texto: r.nueva.texto }];
  assert.deepEqual(revisarVault(archivos).filter((p) => p.ruta.startsWith("propuestas/")), []);
  const p = leerVault(archivos).propuestas[0]!;
  assert.equal(p.titulo, "Habilidad construir-con-ia para toda la fábrica");
  assert.deepEqual(problemasDeLaHabilidad(p), []);
  assert.deepEqual(p.habilidad?.etapas, ["construccion"]);
  assert.match(r.nueva.texto, /27 de octubre de 2026/);

  const aprobada = aprobarHabilidadSuya(archivos, r.nueva.id, { suyas: [], leyoLosScripts: false });
  assert.deepEqual(aprobada.archivos, [{ ruta: "SKILL.md", texto: skill }]);
  // Las dos pueden esperar a la vez en la planta: cada una cuenta la suya.
  const conLaLey = propuestaDelCerebro(archivos, LEY, await plantillaDelCerebro(LEY.nombre, CEREBRO), { suyas: [], fecha: FECHA });
  assert.ok("nueva" in conLaLey);
  assert.ok("omitida" in propuestaDelCerebro(archivos, IA, skill, { suyas: [], fecha: FECHA }));
});

test("las Nikkes de una habilidad suya llegan al constructor igual que las de una del proyecto", async () => {
  const skill = await plantillaDelCerebro(IA.nombre, CEREBRO);
  const suya = habilidadDesde(IA.nombre, skill, "suya")!;
  const porEtapa = habilidadesPorEtapa(`# Habilidades\n\n- [construccion] construir-con-ia: ${IA.cuando}\n`, [suya]);
  assert.deepEqual(porEtapa.construccion.map((x) => [x.nombre, x.origen, x.nikkes]), [["construir-con-ia", "suya", ["noah-robustez", "drake-contrato", "behemoth-drenaje"]]]);

  const dir = mkdtempSync(path.join(os.tmpdir(), "nikkes-"));
  for (const n of suya.nikkes!) writeFileSync(path.join(dir, `${n}.md`), `# ${n}\n\nEl oficio de ${n}.\n`);
  const textos = await textosDeNikkes(suya.nikkes!, dir);
  const def = { nombre: "fabrica:constructor", descripcion: "x", prompt: "# Constructor", tools: ["Read"], model: null, archivo: "x.md", enCorridas: "si" as const };
  const auto = { spec: "auto", construccion: "auto", revision_codigo: "auto", revision_seguridad: "auto", ui: "auto", aprobacion: "auto" };
  const agente = agentesConHabilidades(auto, [def], porEtapa, textos)["fabrica-hab-construccion"]!;
  assert.deepEqual(agente.skills, ["construir-con-ia"]);
  for (const n of suya.nikkes!) assert.match(agente.prompt, new RegExp(`El oficio de ${n}\.`));
});

test("la del aprobador: Privaty sin correr las pruebas ni sus herramientas, y se propone para la aprobación", async () => {
  const p = delAprobador[0]!;
  assert.match(p.skill, /No corres la construcción ni las pruebas/);
  assert.match(p.skill, /mcp__fabrica__aprobar/);
  assert.match(p.skill, /nunca con\s+una herramienta del mod nikke/);
  const r = propuestasDeEspecialidades(VAULT, delAprobador, { disponibles: [], catalogo: null, fecha: FECHA });
  const archivos = [...VAULT, ...r.nuevas.map(({ ruta, texto }) => ({ ruta, texto }))];
  const propuesta = leerVault(archivos).propuestas[0]!;
  assert.equal(propuesta.titulo, "Habilidad aprobar-entrega para la aprobación");
  assert.deepEqual(propuesta.habilidad?.etapas, ["aprobacion"]);
  assert.deepEqual(problemasDeLaHabilidad(propuesta), []);
  const aprobada = aprobarHabilidad(archivos, propuesta.id, { catalogo: null, nombreDeLinea: "caja", disponibles: [], leyoLosScripts: false });
  assert.match(aprobada.repositorio.find((a) => a.ruta === "factory/habilidades.md")!.texto, /^- \[aprobacion\] aprobar-entrega: /m);

  // El aprobador con la especialidad lleva a Privaty, con la regla de no usar sus herramientas.
  const dir = mkdtempSync(path.join(os.tmpdir(), "nikkes-"));
  writeFileSync(path.join(dir, "privaty-entrega.md"), "# Privaty\n\nUsa mcp__nikke__entrega_veredicto.\n");
  const textos = await textosDeNikkes(["privaty-entrega"], dir);
  const def = { nombre: "fabrica:aprobador", descripcion: "x", prompt: "# Aprobador", tools: ["Read", "mcp__fabrica__aprobar"], model: null, archivo: "x.md", enCorridas: "si" as const };
  const auto = { spec: "auto", construccion: "auto", revision_codigo: "auto", revision_seguridad: "auto", ui: "auto", aprobacion: "auto" };
  const agente = agentesConHabilidades(auto, [def], { spec: [], construccion: [], revision: [], aprobacion: [{ nombre: "aprobar-entrega", nikkes: ["privaty-entrega"] }] }, textos)["fabrica-hab-aprobacion"]!;
  assert.match(agente.prompt, /# Privaty/);
  assert.match(agente.prompt, /Sus herramientas propias \(`mcp__nikke__\*`\) no se usan aquí/);
  assert.ok(!agente.tools!.some((t) => t.startsWith("mcp__nikke__")));
});

test("el agente de salida: con Viper y Marian enteras, solo su herramienta de la fábrica, y fuera de los que se eligen por etapa", async () => {
  const { agenteDesde, agenteDeSalida, archivoDelAgenteDeSalida, AGENTE_DE_SALIDA, definicionesDisponibles } = await import("../motor/agentes.ts");
  const { readFileSync } = await import("node:fs");
  const plugin = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "fabrica");
  const archivo = archivoDelAgenteDeSalida(plugin);
  const def = agenteDesde(readFileSync(archivo, "utf8"), archivo)!;
  assert.deepEqual(def.nikkes, ["viper-salida", "marian-compatibilidad"]);
  assert.equal(def.model, "sonnet");
  assert.match(def.prompt, /Solo puedes endurecer/);

  const dir = mkdtempSync(path.join(os.tmpdir(), "nikkes-"));
  writeFileSync(path.join(dir, "viper-salida.md"), "# Viper\n\nUsa mcp__nikke__salida_plan.\n");
  writeFileSync(path.join(dir, "marian-compatibilidad.md"), "# Marian\n\nQuién depende.\n");
  const agentes = agenteDeSalida(def, await textosDeNikkes(def.nikkes!, dir));
  const salida = agentes[AGENTE_DE_SALIDA]!;
  assert.equal(AGENTE_DE_SALIDA, "fabrica-salida");
  assert.match(salida.prompt, /# Viper/);
  assert.match(salida.prompt, /# Marian/);
  assert.match(salida.prompt, /no se usan aquí/);
  assert.deepEqual(salida.tools, ["Read", "Grep", "Glob", "Bash", "mcp__fabrica__salida"]);
  assert.deepEqual(agenteDeSalida(null, new Map()), {});

  // No está entre los agentes de la fábrica que se eligen para una etapa.
  const defs = await definicionesDisponibles(null, plugin, false);
  assert.ok(defs.some((d) => d.nombre === "fabrica:aprobador"));
  assert.ok(!defs.some((d) => d.nombre === "fabrica:salida" || d.nombre === AGENTE_DE_SALIDA));
});

test("Label: con su archivo entero, solo herramientas de lectura y la suya de la fábrica, y fuera de los que se eligen por etapa", async () => {
  const { agenteDesde, agenteDeAnuncio, archivoDelAgenteDeAnuncio, AGENTE_DE_ANUNCIO, definicionesDisponibles } = await import("../motor/agentes.ts");
  const { readFileSync } = await import("node:fs");
  const plugin = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "fabrica");
  const archivo = archivoDelAgenteDeAnuncio(plugin);
  const def = agenteDesde(readFileSync(archivo, "utf8"), archivo)!;
  assert.deepEqual(def.nikkes, ["label-anuncio"]);
  assert.equal(def.model, "sonnet");
  assert.match(def.prompt, /Lo que rompe va primero/);
  assert.match(def.prompt, /Nunca copies el texto de un issue/);
  assert.match(def.prompt, /Un valor esperado que no corriste va marcado «\(sin correr\)»/);

  const dir = mkdtempSync(path.join(os.tmpdir(), "nikkes-"));
  writeFileSync(path.join(dir, "label-anuncio.md"), "# Label\n\nEscribe el README con Write.\n");
  const label = agenteDeAnuncio(def, await textosDeNikkes(def.nikkes!, dir))[AGENTE_DE_ANUNCIO]!;
  assert.equal(AGENTE_DE_ANUNCIO, "fabrica-anuncio");
  assert.match(label.prompt, /# Label/);
  // Su archivo nombra Write, pero el agente no lo tiene: solo lee, y su texto lo registra el mod.
  assert.deepEqual(label.tools, ["Read", "Grep", "Glob", "Bash", "mcp__fabrica__anuncio"]);
  assert.deepEqual(agenteDeAnuncio(null, new Map()), {});

  const defs = await definicionesDisponibles(null, plugin, false);
  assert.ok(!defs.some((d) => d.nombre === "fabrica:anuncio" || d.nombre === AGENTE_DE_ANUNCIO));
});

test("el revisor de interfaz revisa también la UX: el recorrido de quien la usa y sus mensajes", async () => {
  const { agenteDesde } = await import("../motor/agentes.ts");
  const { readFileSync } = await import("node:fs");
  const archivo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "fabrica", "agents", "revisor-ui.md");
  const def = agenteDesde(readFileSync(archivo, "utf8"), archivo)!;
  assert.match(def.descripcion, /el recorrido de quien la usa/);
  assert.match(def.prompt, /\*\*El recorrido \(UX\)\*\*/);
  assert.match(def.prompt, /sabe qué pasó y qué hacer después/);
  assert.match(def.prompt, /\*\*Mensajes\*\*: un error dice qué pasó y cómo seguir/);
  assert.equal(def.model, "sonnet");
});

test("el retrabajo: Snow White y Rapunzel enteras, las habilidades de construcción de la línea, sin modelo propio y fuera de los que se eligen", async () => {
  const { agenteDesde, agenteDeRetrabajo, archivoDelAgenteDeRetrabajo, AGENTE_DE_RETRABAJO, definicionesDisponibles } = await import("../motor/agentes.ts");
  const { readFileSync } = await import("node:fs");
  const plugin = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "fabrica");
  const archivo = archivoDelAgenteDeRetrabajo(plugin);
  const def = agenteDesde(readFileSync(archivo, "utf8"), archivo)!;
  assert.deepEqual(def.nikkes, ["snow-white-arreglo", "rapunzel-pruebas"]);
  // El modelo lo pone el orquestador: el de la construcción de la tarea, que Jev no abarata en el retrabajo.
  assert.equal(def.model, null);
  assert.match(def.prompt, /CAUSA FUERA DE LA TAREA:/);
  assert.match(def.prompt, /Corres solo las que\s+escribiste/);

  const dir = mkdtempSync(path.join(os.tmpdir(), "nikkes-"));
  writeFileSync(path.join(dir, "snow-white-arreglo.md"), "# Snow White\n\nReproduce el fallo.\n");
  writeFileSync(path.join(dir, "rapunzel-pruebas.md"), "# Rapunzel\n\nEjecuta la suite existente.\n");
  const agente = agenteDeRetrabajo(def, ["construir-codigo", "construir-con-ia", "construir-codigo"], await textosDeNikkes(def.nikkes!, dir))[AGENTE_DE_RETRABAJO]!;
  assert.equal(AGENTE_DE_RETRABAJO, "fabrica-retrabajo");
  assert.match(agente.prompt, /# Snow White/);
  assert.match(agente.prompt, /# Rapunzel/);
  assert.deepEqual(agente.skills, ["construir-codigo", "construir-con-ia"]);
  assert.deepEqual(agente.tools, ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]);
  assert.ok(!("model" in agente));
  // Sin habilidades en la línea, viaja igual, sin `skills`.
  assert.ok(!("skills" in agenteDeRetrabajo(def, [], new Map())[AGENTE_DE_RETRABAJO]!));
  assert.deepEqual(agenteDeRetrabajo(null, [], new Map()), {});

  const defs = await definicionesDisponibles(null, plugin, false);
  assert.ok(!defs.some((d) => d.nombre === "fabrica:retrabajo" || d.nombre === AGENTE_DE_RETRABAJO));
});
