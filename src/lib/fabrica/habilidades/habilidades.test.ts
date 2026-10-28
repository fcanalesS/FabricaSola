import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogoNuevo, habilidadDesde, habilidadesConHuella, habilidadesPorEtapa, huellaDe, leerCatalogo, revisarCatalogo, type HabilidadDisponible } from "./formato.ts";

const DISPONIBLES: HabilidadDisponible[] = [
  { nombre: "wolff-db", descripcion: "Consultar la base wolff.", origen: "suya", soloAMano: false },
  { nombre: "ditab-view", descripcion: "Vistas de Ditab.", origen: "proyecto", soloAMano: false },
  { nombre: "desplegar", descripcion: "Despliega.", origen: "proyecto", soloAMano: true },
];

const CATALOGO = `# Habilidades · pos-tiendas

Qué habilidad usa cada etapa.

- [construccion] wolff-db: antes de escribir SQL contra la base wolff.
- [spec, revision] ditab-view: al crear o revisar una vista de Ditab.

## Sin asignar

- desplegar: Despliega.
`;

test("el catálogo se lee uso por uso, con sus etapas; lo de «Sin asignar» va aparte", () => {
  const c = leerCatalogo(CATALOGO);
  assert.equal(c.titulo, "Habilidades · pos-tiendas");
  assert.deepEqual(
    c.usos.map((u) => [u.linea, u.etapas, u.nombre, u.cuando]),
    [
      [5, ["construccion"], "wolff-db", "antes de escribir SQL contra la base wolff."],
      [6, ["spec", "revision"], "ditab-view", "al crear o revisar una vista de Ditab."],
    ],
  );
  assert.deepEqual(c.sinAsignar, [{ linea: 10, nombre: "desplegar", texto: "Despliega." }]);
  assert.deepEqual(c.malas, []);
  assert.deepEqual(revisarCatalogo(CATALOGO, DISPONIBLES), []);
});

test("la revisión dice qué no cumple, con su línea: etapa inventada, habilidad que no existe, solo a mano, repetida, mal escrita", () => {
  const malo = [
    "# Habilidades",
    "",
    "- [deploy] wolff-db: en una etapa que no existe.",
    "- [construccion] no-existe: algo.",
    "- [construccion] desplegar: no se le puede dar a un agente.",
    "- [construccion] wolff-db: una vez.",
    "- [construccion] wolff-db: otra vez.",
    "- usar wolff-db en la construccion",
    `- [spec] ditab-view: ${"x".repeat(200)}`,
    "- [] ditab-view: sin etapa.",
  ].join("\r\n");
  const problemas = revisarCatalogo(malo, DISPONIBLES);
  const en = (linea: number) => problemas.filter((p) => p.linea === linea).map((p) => p.que);
  assert.match(problemas[0]!.que, /CRLF/);
  assert.match(en(3).join(), /«deploy» no es una etapa de la fábrica/);
  assert.match(en(4).join(), /No hay ninguna habilidad «no-existe» en el proyecto ni entre las tuyas/);
  assert.match(en(5).join(), /desplegar solo se usa a mano/);
  assert.match(en(7).join(), /wolff-db ya está en construccion más arriba/);
  assert.match(en(8).join(), /No es un uso/);
  assert.match(en(9).join(), /pasa de 200 caracteres/);
  assert.match(en(10).join(), /No dice en qué etapa/);
  // Una de un plugin no se puede comprobar desde aquí, y se dice.
  assert.match(revisarCatalogo("- [spec] otro-mod:revision-de-codigo: al revisar.\n", DISPONIBLES)[0]!.que, /las de un plugin no se pueden comprobar/);
});

test("cada etapa recibe solo lo que el catálogo le da, y nunca una que no existe o es solo a mano", () => {
  const porEtapa = habilidadesPorEtapa(`${CATALOGO}- [aprobacion] no-existe: algo.\n`.replace("## Sin asignar", "- [aprobacion] desplegar: no.\n\n## Sin asignar"), DISPONIBLES);
  assert.deepEqual(porEtapa.construccion, [{ nombre: "wolff-db", cuando: "antes de escribir SQL contra la base wolff.", origen: "suya" }]);
  assert.deepEqual(porEtapa.spec.map((h) => h.nombre), ["ditab-view"]);
  assert.deepEqual(porEtapa.revision.map((h) => h.nombre), ["ditab-view"]);
  assert.deepEqual(porEtapa.aprobacion, []);
});

test("de un SKILL.md se toma el nombre (el del frontmatter o el de su carpeta), la descripción y si es solo a mano", () => {
  assert.deepEqual(habilidadDesde("wolff-db", "---\nname: wolff-db\ndescription: Consultar la base wolff.\n---\n\nInstrucciones que no se leen.", "suya"), {
    nombre: "wolff-db",
    descripcion: "Consultar la base wolff.",
    origen: "suya",
    soloAMano: false,
  });
  assert.equal(habilidadDesde("mi-carpeta", "Sin frontmatter.", "proyecto")!.nombre, "mi-carpeta");
  assert.equal(habilidadDesde("x", "---\nname: x\ndisable-model-invocation: true\n---\n", "proyecto")!.soloAMano, true);
  assert.equal(habilidadDesde("Con Espacios", "", "proyecto"), null);
});

test("la huella de una habilidad es la misma que calcula el plugin, y los saltos de Windows no la cambian", () => {
  // El mismo valor está en la prueba del plugin (fabrica/hooks/tareas.test.ts).
  assert.equal(huellaDe("---\nname: wolff-db\n---\n\nConsultar la base.\n"), "8cb1200c");
  assert.equal(huellaDe("---\r\nname: wolff-db\r\n---\r\n\r\nConsultar la base.\r\n"), "8cb1200c");
  assert.equal(huellaDe(""), "811c9dc5");
});

test("a la corrida va cada habilidad con su huella y su archivo; las etapas sin habilidades no van", () => {
  const porEtapa = {
    spec: [],
    construccion: [{ nombre: "wolff-db", cuando: "x", origen: "suya" as const, ruta: "/c/wolff/SKILL.md", huella: "8cb1200c" }, { nombre: "sin-archivo", cuando: "x", origen: "proyecto" as const }],
    revision: [],
    aprobacion: [],
  };
  assert.deepEqual(habilidadesConHuella(porEtapa), { construccion: [{ nombre: "wolff-db", huella: "8cb1200c", origen: "suya", ruta: "/c/wolff/SKILL.md" }] });
  assert.equal(habilidadesConHuella({ spec: [], construccion: [], revision: [], aprobacion: [] }), null);
});

test("un catálogo nuevo trae las del proyecto sin asignar, ninguna en una etapa, y pasa su propia revisión", () => {
  const nuevo = catalogoNuevo("pos-tiendas", DISPONIBLES);
  const c = leerCatalogo(nuevo);
  assert.deepEqual(c.usos, []);
  // Las suyas no entran: son de todos sus proyectos.
  assert.deepEqual(c.sinAsignar.map((s) => s.nombre), ["ditab-view", "desplegar"]);
  assert.deepEqual(revisarCatalogo(nuevo, DISPONIBLES), []);
  assert.doesNotMatch(catalogoNuevo("vacío", []), /Sin asignar/);
});
