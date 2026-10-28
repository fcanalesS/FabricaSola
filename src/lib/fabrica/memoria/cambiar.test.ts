import assert from "node:assert/strict";
import { test } from "node:test";
import { agregarALaFicha, aprobar, editarPropuesta, envolver, guardarFicha, quitarDeLaFicha, rechazar, reemplazar, type HechoEnElVault } from "./cambiar.ts";
import { leerDocumento, leerFicha, revisarVault, type ArchivoDelVault } from "./formato.ts";
import { documento, nombreDeArchivo } from "./plantillas.ts";

const FICHA = `# Ficha · pos-tiendas

- [base-de-datos] PostgreSQL 16, con Prisma. (D-0001)
- [base-de-datos] NO: SQL Server, MySQL ni MongoDB. (D-0001)
- [fechas] Se guardan en UTC. (D-0002)
- [pruebas] node --test; nada de Jest.
`;
const decision = (id: string, titulo: string, temas: string[]) =>
  documento({ id, titulo, estado: "vigente", fecha: "2026-10-20", temas, origen: "F-001", aprobo: "él", secciones: { Decisión: titulo, "Por qué": "Porque sí." } });
const propuesta = (id: string, titulo: string, mas: Partial<Parameters<typeof documento>[0]> = {}) =>
  documento({ id, titulo, estado: "propuesta", fecha: "2026-10-26", temas: ["validacion", "api"], origen: "F-014", propone: "fabrica:constructor", regla: "El cuerpo de cada ruta se valida con Zod.", secciones: { Decisión: "Zod en cada ruta." }, ...mas });

const VAULT: ArchivoDelVault[] = [
  { ruta: "ficha.md", texto: FICHA },
  { ruta: `decisiones/${nombreDeArchivo("D-0001", "PostgreSQL con Prisma")}`, texto: decision("D-0001", "PostgreSQL con Prisma", ["base-de-datos", "orm"]) },
  { ruta: `decisiones/${nombreDeArchivo("D-0002", "Fechas en UTC")}`, texto: decision("D-0002", "Fechas en UTC", ["fechas"]) },
  { ruta: `propuestas/${nombreDeArchivo("P-0001", "Validar con Zod")}`, texto: propuesta("P-0001", "Validar con Zod") },
  { ruta: `propuestas/${nombreDeArchivo("P-0002", "Sin regla")}`, texto: propuesta("P-0002", "Sin regla", { regla: "", temas: ["estructura"] }) },
];
const AHORA = { ahora: new Date("2026-10-27T12:00:00Z"), aprobo: "él" };

/** El vault después de aplicar los cambios: lo que quedaría en el disco. */
const aplicar = (archivos: readonly ArchivoDelVault[], r: HechoEnElVault) => {
  const porRuta = new Map(archivos.map((a) => [a.ruta, a.texto]));
  for (const c of r.cambios) porRuta.set(c.ruta, c.texto);
  return [...porRuta].map(([ruta, texto]) => ({ ruta, texto }));
};
const doc = (archivos: readonly ArchivoDelVault[], prefijo: string) => {
  const a = archivos.find((x) => x.ruta.split("/").pop()!.startsWith(prefijo))!;
  return leerDocumento(a.texto, a.ruta);
};
const ficha = (archivos: readonly ArchivoDelVault[]) => archivos.find((a) => a.ruta === "ficha.md")!.texto;

test("aprobar escribe la decisión con el siguiente D-, su regla en la ficha junto a su tema, y la propuesta queda aprobada", () => {
  const r = aprobar(VAULT, "P-0001", AHORA);
  const despues = aplicar(VAULT, r);
  assert.equal(r.nota, "P-0001 aprobada como D-0003, con su regla en la ficha.");
  assert.deepEqual(r.cambios.map((c) => c.ruta).sort(), ["decisiones/D-0003-validar-con-zod.md", "ficha.md", "propuestas/P-0001-validar-con-zod.md"]);
  const d = doc(despues, "D-0003");
  assert.deepEqual([d.estado, d.fecha, d.temas, d.origen, d.aprobo, d.secciones["Decisión"]], ["vigente", "2026-10-27", ["validacion", "api"], "P-0001", "él", "Zod en cada ruta."]);
  const p = doc(despues, "P-0001");
  assert.deepEqual([p.estado, p.motivo], ["aprobada", "Aprobada como D-0003."]);
  // Con su primer tema; validacion no estaba, así que va al final.
  assert.equal(ficha(despues).trimEnd().split("\n").at(-1), "- [validacion] El cuerpo de cada ruta se valida con Zod. (D-0003)");
  assert.deepEqual(revisarVault(despues), []);
  assert.throws(() => aprobar(despues, "P-0001", AHORA), /P-0001 ya está aprobada/);
  assert.throws(() => aprobar(VAULT, "P-0099", AHORA), /No hay ninguna propuesta P-0099/);
});

test("una propuesta sin regla se aprueba como decisión, y la ficha no cambia", () => {
  const r = aprobar(VAULT, "P-0002", AHORA);
  assert.equal(r.cambios.find((c) => c.ruta === "ficha.md")!.texto, FICHA);
  assert.deepEqual(r.avisos, ["No tenía regla: la decisión queda, pero a la ficha no entra nada."]);
});

test("rechazar deja la propuesta rechazada con su motivo y no toca la ficha", () => {
  const r = rechazar(VAULT, "P-0001", "  Ya se valida en el middleware.  ");
  assert.deepEqual(r.cambios.map((c) => c.ruta), ["propuestas/P-0001-validar-con-zod.md"]);
  const p = doc(aplicar(VAULT, r), "P-0001");
  assert.deepEqual([p.estado, p.motivo], ["rechazada", "Ya se valida en el middleware."]);
  assert.throws(() => rechazar(VAULT, "P-0001", "  "), /Falta el motivo/);
  assert.deepEqual(revisarVault(aplicar(VAULT, r)), []);
});

test("reemplazar deja las dos decisiones enlazadas y en la ficha la regla nueva en lugar de las de la vieja", () => {
  const r = reemplazar(VAULT, "D-0001", { titulo: "MySQL 8 con Prisma", temas: ["Base de datos"], regla: "MySQL 8, con Prisma.", secciones: { Decisión: "El hosting nuevo solo trae MySQL." } }, AHORA);
  const despues = aplicar(VAULT, r);
  const vieja = doc(despues, "D-0001");
  const nueva = doc(despues, "D-0003");
  assert.deepEqual([vieja.estado, vieja.reemplazadaPor], ["reemplazada", "D-0003"]);
  assert.deepEqual([nueva.estado, nueva.reemplaza, nueva.temas], ["vigente", "D-0001", ["base-de-datos"]]);
  const reglas = leerFicha(ficha(despues)).reglas.map((x) => `[${x.tema}] ${x.texto} ${x.fuente}`);
  // Las dos reglas que citaban a D-0001 salen; la nueva entra junto a las de su tema (no queda ninguna, va al final).
  assert.deepEqual(reglas, ["[fechas] Se guardan en UTC. D-0002", "[pruebas] node --test; nada de Jest. null", "[base-de-datos] MySQL 8, con Prisma. D-0003"]);
  assert.ok(r.avisos.includes("Salieron de la ficha 2 reglas de D-0001."));
  assert.deepEqual(revisarVault(despues), []);
  assert.throws(() => reemplazar(despues, "D-0001", { titulo: "Otra", temas: ["x"], regla: "", secciones: { Decisión: "x" } }, AHORA), /D-0001 ya está reemplazada/);
});

test("una propuesta que reemplaza una decisión, al aprobarse, la deja reemplazada", () => {
  const vault = [...VAULT, { ruta: "propuestas/P-0003-fechas-locales.md", texto: propuesta("P-0003", "Fechas locales", { temas: ["fechas"], regla: "Se guardan en la hora de la tienda.", reemplaza: "D-0002" }) }];
  const despues = aplicar(vault, aprobar(vault, "P-0003", AHORA));
  assert.deepEqual([doc(despues, "D-0002").estado, doc(despues, "D-0002").reemplazadaPor, doc(despues, "D-0003").reemplaza], ["reemplazada", "D-0003", "D-0002"]);
  assert.ok(ficha(despues).includes("- [fechas] Se guardan en la hora de la tienda. (D-0003)"));
  assert.ok(!ficha(despues).includes("(D-0002)"));
});

test("editar una propuesta la deja en el mismo archivo, revisada; lo que falta no se guarda", () => {
  const r = editarPropuesta(VAULT, "P-0001", { titulo: "  Validar con Zod 4 ", temas: ["Validación", "API", "api"], regla: "Zod 4 en cada ruta.", secciones: { Decisión: `- ${"palabra ".repeat(40).trim()}` } });
  const p = doc(aplicar(VAULT, r), "P-0001");
  assert.deepEqual([p.titulo, p.estado, p.temas, p.regla, p.origen, p.propone], ["Validar con Zod 4", "propuesta", ["validacion", "api"], "Zod 4 en cada ruta.", "F-014", "fabrica:constructor"]);
  assert.ok(p.secciones["Decisión"]!.split("\n").every((l) => l.length <= 100));
  assert.throws(() => editarPropuesta(VAULT, "P-0001", { titulo: "", temas: [], regla: "", secciones: {} }), /le falta el título, le falta al menos un tema, le falta la decisión/);
});

test("la ficha que él escribe se guarda si son reglas; si no, dice qué línea está mal", () => {
  const r = guardarFicha(VAULT, `${FICHA}- [ui] Tailwind 4. (D-0009)\r\n\r\n`);
  assert.equal(r.cambios[0]!.texto, `${FICHA}- [ui] Tailwind 4. (D-0009)\n`);
  assert.deepEqual(r.avisos, ["Cita D-0009, que no es una decisión vigente."]);
  assert.throws(() => guardarFicha(VAULT, `${FICHA}Usar Tailwind\n`), /la línea 7 no es una regla/);
  assert.throws(() => guardarFicha(VAULT, `${FICHA}- [ui] ${"x".repeat(200)}\n`), /pasa de 200 caracteres/);
  const larga = `# Ficha\n\n${Array.from({ length: 151 }, (_, i) => `- [tema] Regla ${i}.`).join("\n")}\n`;
  assert.match(guardarFicha(VAULT, larga).avisos.join(" "), /tiene 152 líneas.*el tope es 150/);
});

test("la ficha: una regla va junto a las de su tema; quitar saca las que citan esa decisión", () => {
  assert.equal(agregarALaFicha(FICHA, "- [base-de-datos] Índices con nombre. (D-0005)", "base-de-datos").split("\n")[4], "- [base-de-datos] Índices con nombre. (D-0005)");
  assert.equal(agregarALaFicha("# Ficha · x\n\n", "- [a] Algo.", "a"), "# Ficha · x\n\n- [a] Algo.\n");
  assert.deepEqual(quitarDeLaFicha(FICHA, "D-0002"), { ficha: FICHA.replace("- [fechas] Se guardan en UTC. (D-0002)\n", ""), quitadas: 1 });
  assert.equal(envolver("corta"), "corta");
});
