import assert from "node:assert/strict";
import { test } from "node:test";
import { partir } from "../motor/formato.ts";
import { aprobar, editarPropuesta, rechazar } from "../memoria/cambiar.ts";
import { leerVault, revisarVault, type ArchivoDelVault } from "../memoria/formato.ts";
import { asignarEnElCatalogo, catalogoParaGuardar, leerCatalogo, type HabilidadDisponible } from "./formato.ts";
import { aprobarHabilidad, scriptsDe } from "./propuestas.ts";

// La misma propuesta que escribe el mod (fabrica/hooks/tareas.test.ts, DOCUMENTO_DE_HABILIDAD).
const PROPUESTA = [
  "---",
  "id: P-0002",
  "titulo: Consultar el esquema de wolff",
  "estado: propuesta",
  "fecha: 2026-10-26",
  "temas: habilidades",
  "origen: F-014",
  'propone: "fabrica:constructor"',
  'regla: ""',
  'reemplaza: ""',
  "habilidad: wolff-esquema",
  "etapas: construccion, revision",
  "cuando: antes de escribir SQL contra wolff.",
  "---",
  "",
  "## Decisión",
  "",
  "Usar la habilidad «wolff-esquema» en construccion, revision: antes de escribir SQL contra wolff.",
  "",
  "## Por qué",
  "",
  "tres tareas buscaron el mismo esquema a mano.",
  "",
  "## Qué se descartó",
  "",
  "_(sin escribir)_",
  "",
  "## Qué implica",
  "",
  "_(sin escribir)_",
  "",
  "## Archivos",
  "",
  "### SKILL.md",
  "",
  "    ---",
  "    name: wolff-esquema",
  "    description: Consulta el esquema de wolff antes de escribir SQL.",
  "    ---",
  "",
  "    ## Cómo",
  "",
  "    1. Corre `scripts/esquema.sh <tabla>`.",
  "        - Si falla, pregunta.",
  "",
  "### scripts/esquema.sh",
  "",
  "    #!/bin/sh",
  '    sqlcmd -Q "sp_help $1"',
  "",
].join("\n");

const RUTA = "propuestas/P-0002-consultar-el-esquema-de-wolff.md";
const vault = (texto = PROPUESTA): ArchivoDelVault[] => [
  { ruta: "ficha.md", texto: "# Ficha · pos\n\n" },
  { ruta: RUTA, texto },
];

const CATALOGO = `# Habilidades · pos

Qué habilidad usa cada etapa.

- [spec] ditab-view: al escribir la spec de una vista.

## Sin asignar

- desplegar: Despliega.
- otra: Otra cosa.
`;

const DISPONIBLES: HabilidadDisponible[] = [
  { nombre: "ditab-view", descripcion: "Vistas.", origen: "proyecto", soloAMano: false },
  { nombre: "desplegar", descripcion: "Despliega.", origen: "proyecto", soloAMano: false },
  { nombre: "otra", descripcion: "Otra cosa.", origen: "proyecto", soloAMano: false },
];

const aprobarla = (extra: Partial<Parameters<typeof aprobarHabilidad>[2]> = {}, archivos = vault()) =>
  aprobarHabilidad(archivos, "P-0002", { catalogo: CATALOGO, nombreDeLinea: "pos", disponibles: DISPONIBLES, leyoLosScripts: true, ...extra });

test("la aplicación lee la propuesta como la escribe el mod: sus archivos, sin la sangría, y el vault la da por buena", () => {
  const p = leerVault(vault()).propuestas[0]!;
  assert.deepEqual(p.habilidad, {
    nombre: "wolff-esquema",
    etapas: ["construccion", "revision"],
    cuando: "antes de escribir SQL contra wolff.",
    archivos: [
      { ruta: "SKILL.md", texto: "---\nname: wolff-esquema\ndescription: Consulta el esquema de wolff antes de escribir SQL.\n---\n\n## Cómo\n\n1. Corre `scripts/esquema.sh <tabla>`.\n    - Si falla, pregunta.\n" },
      { ruta: "scripts/esquema.sh", texto: '#!/bin/sh\nsqlcmd -Q "sp_help $1"\n' },
    ],
  });
  // El «## Cómo» de adentro no cortó la sección: Archivos sigue siendo una sola.
  assert.deepEqual(Object.keys(p.secciones), ["Decisión", "Por qué", "Qué se descartó", "Qué implica", "Archivos"]);
  assert.deepEqual(scriptsDe(p), ["scripts/esquema.sh"]);
  // Una línea de código larga no es un problema del vault; una del texto, sí.
  const larga = PROPUESTA.replace('    sqlcmd -Q "sp_help $1"', `    sqlcmd -Q "${"x".repeat(220)}"`);
  assert.deepEqual(revisarVault(vault(larga)), []);
  assert.deepEqual(
    revisarVault(vault(larga.replace("tres tareas", "x".repeat(220)))).map((x) => x.que),
    ["La línea pasa de 200 caracteres."],
  );
  // Una decisión cualquiera no tiene habilidad.
  assert.equal(leerVault([{ ruta: "decisiones/D-0001-x.md", texto: "---\nid: D-0001\nhabilidad: x\n---\n" }]).decisiones[0]!.habilidad, null);
});

test("aprobarla escribe su SKILL.md y sus scripts en .claude/skills/, su línea en el catálogo y la propuesta aprobada", () => {
  const r = aprobarla();
  assert.deepEqual(
    r.repositorio.map((a) => a.ruta),
    [".claude/skills/wolff-esquema/SKILL.md", ".claude/skills/wolff-esquema/scripts/esquema.sh", "factory/habilidades.md"],
  );
  assert.equal(r.repositorio[1]!.texto, '#!/bin/sh\nsqlcmd -Q "sp_help $1"\n');
  const catalogo = r.repositorio[2]!.texto;
  assert.deepEqual(
    leerCatalogo(catalogo).usos.map((u) => [u.etapas, u.nombre, u.cuando]),
    [
      [["spec"], "ditab-view", "al escribir la spec de una vista."],
      [["construccion", "revision"], "wolff-esquema", "antes de escribir SQL contra wolff."],
    ],
  );
  assert.equal(r.vault.length, 1);
  assert.deepEqual([r.vault[0]!.ruta, partir(r.vault[0]!.texto).datos.estado], [RUTA, "aprobada"]);
  // Lo demás del archivo queda como estaba: los archivos siguen ahí, para la historia.
  assert.match(r.vault[0]!.texto, /### scripts\/esquema\.sh/);
  assert.equal(r.nota, "P-0002 aprobada: la habilidad «wolff-esquema» quedó en .claude/skills/wolff-esquema/ y en el catálogo (construccion, revision).");
});

test("no se aprueba sin decir que leyó sus scripts, ni encima de una habilidad que ya existe, ni dos veces", () => {
  assert.throws(() => aprobarla({ leyoLosScripts: false }), /Trae un script \(scripts\/esquema\.sh\): léelos enteros/);
  assert.throws(() => aprobarla({ disponibles: [...DISPONIBLES, { nombre: "wolff-esquema", descripcion: "", origen: "suya", soloAMano: false }] }), /Ya hay una habilidad «wolff-esquema» tuya/);
  const aprobada = PROPUESTA.replace("estado: propuesta", "estado: aprobada");
  assert.throws(() => aprobarla({}, vault(aprobada)), /P-0002 ya está aprobada/);
  // Sin scripts, no hace falta marcar nada.
  const sinScripts = PROPUESTA.slice(0, PROPUESTA.indexOf("### scripts/"));
  assert.equal(aprobarla({ leyoLosScripts: false }, vault(sinScripts)).repositorio.length, 2);
  // Tocada a mano: un nombre que no vale o sin SKILL.md no se aprueba.
  assert.throws(() => aprobarla({}, vault(PROPUESTA.replace("habilidad: wolff-esquema", "habilidad: ../fuera"))), /no es un nombre de habilidad/);
  assert.throws(() => aprobarla({}, vault(PROPUESTA.replace("### SKILL.md", "### LEEME.md"))), /no trae su SKILL\.md/);
});

test("sin catálogo, nace con ella; si el catálogo ya la nombraba, su línea queda como estaba", () => {
  const sin = aprobarla({ catalogo: null });
  assert.deepEqual(leerCatalogo(sin.repositorio.at(-1)!.texto).usos.map((u) => u.nombre), ["wolff-esquema"]);
  assert.ok(sin.avisos.some((a) => /no tenía catálogo/.test(a)));
  const nombrada = `${CATALOGO.replace("- [spec] ditab-view", "- [aprobacion] wolff-esquema: al final.\n- [spec] ditab-view")}`;
  const r = aprobarla({ catalogo: nombrada });
  assert.equal(r.repositorio.at(-1)!.texto, nombrada);
  assert.ok(r.avisos.some((a) => /ya la nombraba en la línea 5/.test(a)));
});

test("rechazarla no escribe nada fuera de la propuesta; no se aprueba como decisión ni se edita", () => {
  const r = rechazar(vault(), "P-0002", "Ya hay un script para eso.");
  assert.deepEqual(r.cambios.map((c) => c.ruta), [RUTA]);
  assert.deepEqual([partir(r.cambios[0]!.texto).datos.estado, partir(r.cambios[0]!.texto).datos.motivo], ["rechazada", "Ya hay un script para eso."]);
  assert.throws(() => aprobar(vault(), "P-0002", { ahora: new Date(), aprobo: "él" }), /es una habilidad: se aprueba con sus archivos/);
  assert.throws(() => editarPropuesta(vault(), "P-0002", { titulo: "x", temas: ["x"], regla: "", secciones: { Decisión: "x" } }), /no se edita aquí/);
});

test("asignar pone la línea después del último uso y la saca de «Sin asignar»; sin ninguna sin asignar, el título sobra", () => {
  const una = asignarEnElCatalogo(CATALOGO, { nombre: "desplegar", etapas: ["aprobacion"], cuando: "al aprobar una tarea que despliega." });
  assert.deepEqual(leerCatalogo(una).usos.map((u) => u.nombre), ["ditab-view", "desplegar"]);
  assert.deepEqual(leerCatalogo(una).sinAsignar.map((s) => s.nombre), ["otra"]);
  const dos = asignarEnElCatalogo(una, { nombre: "otra", etapas: ["spec", "revision"], cuando: "siempre." });
  assert.doesNotMatch(dos, /## Sin asignar/);
  assert.match(dos, /^- \[spec, revision\] otra: siempre\.$/m);
  assert.throws(() => asignarEnElCatalogo(dos, { nombre: "otra", etapas: ["spec"], cuando: "x" }), /ya está en el catálogo \(línea \d+\)/);
  assert.throws(() => asignarEnElCatalogo(CATALOGO, { nombre: "x", etapas: ["deploy"], cuando: "" }), /«deploy» no es una etapa de la fábrica, falta cuándo se usa/);
  // Un catálogo sin usos: la línea va antes de «Sin asignar».
  const vacio = "# Habilidades · pos\n\nExplicación.\n\n## Sin asignar\n\n- otra: Otra cosa.\n- desplegar: Despliega.\n";
  assert.equal(asignarEnElCatalogo(vacio, { nombre: "otra", etapas: ["spec"], cuando: "siempre." }), "# Habilidades · pos\n\nExplicación.\n\n- [spec] otra: siempre.\n\n## Sin asignar\n\n- desplegar: Despliega.\n");
});

test("el catálogo que él escribe se guarda si cada línea es un uso; lo que no existe se avisa", () => {
  const r = catalogoParaGuardar(`${CATALOGO}- [construccion] no-existe: nunca.   \r\n`.replace("## Sin asignar\n\n- desplegar: Despliega.\n- otra: Otra cosa.\n", ""), DISPONIBLES);
  assert.doesNotMatch(r.texto, /\r| $/m);
  assert.deepEqual(r.avisos, ["Línea 7: No hay ninguna habilidad «no-existe» en el proyecto ni entre las tuyas."]);
  assert.throws(() => catalogoParaGuardar(`${CATALOGO}\nUsar wolff siempre\n- algo sin forma\n`, DISPONIBLES), /la línea 13 no es un uso/);
});
