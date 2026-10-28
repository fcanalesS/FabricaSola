import assert from "node:assert/strict";
import { test } from "node:test";
import { buscar, contradice, leerBitacora, leerDocumento, leerFicha, leerVault, lineaDeBitacora, prohibidos, revisarVault, type ArchivoDelVault } from "./formato.ts";
import { documento, fichaVacia, leeme, nombreDeArchivo, SECCIONES, TOPES } from "./plantillas.ts";
import { loQueSeVe } from "./sembrar.ts";
import { lineaDeLaFicha } from "./cambiar.ts";
import { nucleoDeLaFicha } from "../procesos/salida.ts";

const FICHA = `# Ficha · pos-tiendas

- [base-de-datos] PostgreSQL 16, con Prisma. (D-0001)
- [base-de-datos] NO: SQL Server, MySQL ni MongoDB. (D-0001)
- [fechas] Se guardan en UTC y se muestran en la hora de la tienda. (D-0002)
- [ui] Tailwind 4; sin otra librería de componentes. (él, 2026-10-12)
- [pruebas] node --test; nada de Jest.
`;

const decision = (id: string, titulo: string, mas: Partial<Parameters<typeof documento>[0]> = {}) =>
  documento({ id, titulo, estado: "vigente", fecha: "2026-10-26", temas: ["base-de-datos"], origen: "F-014", aprobo: "él", secciones: { Decisión: "Algo.", "Por qué": "Porque sí." }, ...mas });

/** Un vault sano: la ficha, dos decisiones, una propuesta y la bitácora del mes. */
const VAULT: ArchivoDelVault[] = [
  { ruta: "LEEME.md", texto: leeme("pos-tiendas") },
  { ruta: "ficha.md", texto: FICHA },
  { ruta: `decisiones/${nombreDeArchivo("D-0001", "PostgreSQL con Prisma")}`, texto: decision("D-0001", "PostgreSQL 16 con Prisma", { temas: ["base-de-datos", "orm"] }) },
  { ruta: `decisiones/${nombreDeArchivo("D-0002", "Fechas en UTC")}`, texto: decision("D-0002", "Fechas en UTC", { temas: ["fechas"] }) },
  {
    ruta: `propuestas/${nombreDeArchivo("P-0001", "Usar Zod para validar")}`,
    texto: documento({ id: "P-0001", titulo: "Usar Zod para validar", estado: "propuesta", fecha: "2026-10-26", temas: ["validacion"], origen: "F-015", propone: "fabrica:constructor", secciones: { Decisión: "Zod." } }),
  },
  { ruta: "bitacora/2026-10.md", texto: `${lineaDeBitacora({ fecha: "2026-10-26", tarea: "F-014", titulo: "Exportar ventas · a CSV", estado: "hecha", toca: ["src/reportes/ventas.ts"], decisiones: ["D-0001"] })}\n` },
];

test("la ficha se lee regla por regla: su tema, si prohíbe algo y de dónde sale", () => {
  const f = leerFicha(FICHA);
  assert.equal(f.titulo, "Ficha · pos-tiendas");
  assert.equal(f.malas.length, 0);
  assert.equal(f.reglas.length, 5);
  assert.deepEqual(f.reglas[1], { linea: 4, tema: "base-de-datos", prohibe: true, texto: "SQL Server, MySQL ni MongoDB.", fuente: "D-0001", decisiones: ["D-0001"] });
  assert.deepEqual([f.reglas[3]!.fuente, f.reglas[3]!.decisiones], ["él, 2026-10-12", []]);
  assert.equal(f.reglas[4]!.fuente, null);
  // Lo que no es una regla se dice con su línea.
  const mala = leerFicha("# Ficha\n\n- [Base de Datos] PostgreSQL.\n- sin tema\nTexto suelto\n- [ok] Bien.\n");
  assert.deepEqual(
    mala.malas.map((m) => m.linea),
    [3, 4, 5],
  );
  assert.equal(mala.reglas.length, 1);
});

test("una decisión se lee con su frontmatter plano y sus secciones fijas", () => {
  const d = leerDocumento(decision("D-0001", "PostgreSQL: 16 con Prisma", { temas: ["base-de-datos", "orm"], secciones: { Decisión: "## no es otra sección\nPostgreSQL." } }), "decisiones/D-0001-postgresql.md");
  assert.deepEqual([d.tipo, d.id, d.titulo, d.estado, d.temas, d.origen, d.aprobo], ["decision", "D-0001", "PostgreSQL: 16 con Prisma", "vigente", ["base-de-datos", "orm"], "F-014", "él"]);
  // Un `##` dentro del texto baja de nivel al escribirse: no inventa otra sección.
  assert.deepEqual(Object.keys(d.secciones), [...SECCIONES]);
  assert.equal(d.secciones["Decisión"], "#### no es otra sección\nPostgreSQL.");
  assert.equal(d.secciones["Por qué"], "_(sin escribir)_");
});

test("la bitácora se escribe y se lee igual, y un título no rompe el formato", () => {
  const linea = lineaDeBitacora({ fecha: "2026-10-26", tarea: "F-014", titulo: "Exportar · ventas\na CSV", estado: "hecha", toca: ["a.ts", "b.ts"], decisiones: ["D-0001"], habilidades: ["wolff-db"] });
  assert.equal(linea, "- 2026-10-26 · F-014 · Exportar - ventas a CSV · hecha · toca: a.ts, b.ts · decisiones: D-0001 · habilidades: wolff-db");
  const { entradas, malas } = leerBitacora(`# Octubre\n\n${linea}\n- 2026-10-27 · F-015 · Otra · hecha\n- mal\n`);
  assert.deepEqual(entradas[0], { linea: 3, fecha: "2026-10-26", tarea: "F-014", titulo: "Exportar - ventas a CSV", estado: "hecha", toca: ["a.ts", "b.ts"], decisiones: ["D-0001"], habilidades: ["wolff-db"] });
  // Una de antes de las habilidades se lee igual, sin ellas.
  assert.deepEqual([entradas[1]!.toca, entradas[1]!.decisiones, entradas[1]!.habilidades], [[], [], []]);
  assert.deepEqual(malas.map((m) => m.linea), [5]);
});

test("un vault sano no tiene problemas, y lo que escriben las plantillas pasa su propia revisión", () => {
  assert.deepEqual(revisarVault(VAULT), []);
  const v = leerVault(VAULT);
  assert.deepEqual([v.decisiones.length, v.propuestas.length, v.bitacora.length], [2, 1, 1]);
  assert.deepEqual(revisarVault([{ ruta: "ficha.md", texto: fichaVacia("x") }]), []);
});

test("la revisión dice qué no cumple el formato, con su archivo y su línea", () => {
  const malo: ArchivoDelVault[] = [
    { ruta: "ficha.md", texto: "# Ficha\n\n- [base-de-datos] MongoDB. (D-0009)\n- [fechas] UTC. (D-0002)\r\nsuelta\n" },
    { ruta: "decisiones/D-0002-fechas.md", texto: decision("D-0002", "Fechas", { estado: "reemplazada" }) },
    { ruta: "decisiones/D-0003-otra.md", texto: decision("D-0002", "Otra con id repetido", { temas: ["Base de Datos"], estado: "talvez", fecha: "26/10/2026" }) },
    { ruta: "decisiones/Mal Nombre.md", texto: decision("X-1", "", { temas: [] }) },
    { ruta: "propuestas/P-0001-algo.md", texto: documento({ id: "P-0001", titulo: "Algo", estado: "rechazada", fecha: "2026-10-26", temas: ["x"], origen: "F-1", secciones: {} }) },
    { ruta: "bitacora/octubre.md", texto: "- no es una línea\n" },
  ];
  const ps = revisarVault(malo);
  const hay = (ruta: string, que: RegExp, linea?: number) => assert.ok(ps.some((p) => p.ruta === ruta && que.test(p.que) && (linea === undefined || p.linea === linea)), `${ruta}: ${que}`);
  hay("ficha.md", /CRLF/);
  hay("ficha.md", /Cita D-0009, que no existe/, 3);
  hay("ficha.md", /Cita D-0002, que está reemplazada/, 4);
  hay("ficha.md", /No es una regla/, 5);
  hay("decisiones/D-0002-fechas.md", /no dice por cuál/);
  hay("decisiones/D-0003-otra.md", /ya lo usa/);
  hay("decisiones/D-0003-otra.md", /El estado «talvez» no vale/);
  hay("decisiones/D-0003-otra.md", /AAAA-MM-DD/);
  hay("decisiones/D-0003-otra.md", /tema «Base de Datos»/);
  hay("decisiones/Mal Nombre.md", /no es de una decisión/);
  hay("decisiones/Mal Nombre.md", /nombre del archivo/);
  hay("decisiones/Mal Nombre.md", /No tiene título/);
  hay("decisiones/Mal Nombre.md", /No tiene temas/);
  hay("propuestas/P-0001-algo.md", /rechazada sin motivo/);
  hay("bitacora/octubre.md", /por mes/);
  hay("bitacora/octubre.md", /No es una línea de la bitácora/, 1);
  // Las líneas largas y la ficha que pasa su tope.
  const larga = `# F\n\n${Array.from({ length: TOPES.fichaLineas + 1 }, (_, i) => `- [t] Regla ${i}.`).join("\n")}\n- [t] ${"x".repeat(TOPES.linea)}\n`;
  const deLaLarga = revisarVault([{ ruta: "ficha.md", texto: larga }]);
  assert.ok(deLaLarga.some((p) => /líneas, y entra entera/.test(p.que)));
  assert.ok(deLaLarga.some((p) => /pasa de 200 caracteres/.test(p.que)));
});

test("buscar es como grep, sin tildes ni mayúsculas, y también por tema", () => {
  assert.deepEqual(buscar(VAULT, "postgresql prisma")[0], { ruta: "ficha.md", linea: 3, texto: "- [base-de-datos] PostgreSQL 16, con Prisma. (D-0001)" });
  assert.ok(buscar(VAULT, "postgresql").some((h) => h.ruta.startsWith("decisiones/D-0001")));
  assert.ok(buscar(VAULT, "LIBRERIA").some((h) => h.texto.includes("librería")));
  // Por tema: las reglas de ese tema y los documentos que lo tienen.
  const porTema = buscar(VAULT, "", { temas: ["fechas"] });
  assert.deepEqual(
    porTema.map((h) => h.ruta),
    ["ficha.md", "decisiones/D-0002-fechas-en-utc.md"],
  );
  assert.match(porTema[1]!.texto, /^titulo: Fechas en UTC$/);
  assert.deepEqual(buscar(VAULT, "utc", { temas: ["base-de-datos"] }), []);
  assert.equal(buscar(VAULT, "a", { max: 3 }).length, 3);
  // La bitácora también se busca.
  assert.ok(buscar(VAULT, "exportar ventas").some((h) => h.ruta === "bitacora/2026-10.md"));
});

test("una regla NO: se parte en lo que prohíbe, y contradice lo ve en un pedido", () => {
  const ficha = leerFicha(FICHA);
  assert.deepEqual(prohibidos(ficha.reglas[1]!), ["SQL Server", "MySQL", "MongoDB"]);
  const choques = contradice(ficha, "Migrar los reportes a MongoDB para que sean más rápidos.");
  assert.deepEqual(
    choques.map((c) => [c.termino, c.regla.linea]),
    [["MongoDB", 4]],
  );
  assert.deepEqual(
    contradice(ficha, "Usar sql server en las tiendas").map((c) => c.termino),
    ["SQL Server"],
  );
  // Una palabra dentro de otra no cuenta, ni lo que la ficha no prohíbe.
  assert.deepEqual(contradice(ficha, "Revisar mysqldump y el MySQLConnector"), []);
  assert.deepEqual(contradice(ficha, "Agregar un índice en PostgreSQL"), []);
});

test("lo que escriben las plantillas se encuentra con los patrones de grep que da el LEEME", () => {
  // Los mismos patrones que `LEEME.md` le enseña a cualquier IA, línea por línea, como grep.
  const lineasQue = (texto: string, patron: RegExp) => texto.split("\n").filter((l) => patron.test(l));
  const d = VAULT[2]!.texto;
  assert.deepEqual(lineasQue(d, /^estado: vigente$/), ["estado: vigente"]);
  assert.deepEqual(lineasQue(d, /^temas:.*base-de-datos/), ["temas: base-de-datos, orm"]);
  assert.equal(lineasQue(FICHA, /\[base-de-datos\]/).length, 2);
  assert.deepEqual(lineasQue(FICHA, /NO:/), ["- [base-de-datos] NO: SQL Server, MySQL ni MongoDB. (D-0001)"]);
  // El LEEME nombra esos mismos patrones, y sus secciones fijas.
  const l = leeme("pos-tiendas");
  for (const patron of ['grep -rn "\\[base-de-datos\\]" ficha.md', 'grep -n "NO:" ficha.md', 'grep -rl "^estado: vigente" decisiones/']) assert.ok(l.includes(patron), patron);
  for (const s of SECCIONES) assert.ok(l.includes(`## ${s}`), s);
});

test("el nombre de un archivo sale de su id y su título, sin tildes ni mayúsculas", () => {
  assert.equal(nombreDeArchivo("D-0001", "PostgreSQL 16 con Prisma"), "D-0001-postgresql-16-con-prisma.md");
  assert.equal(nombreDeArchivo("P-0012", "¿Usar Zod? ¡Sí!"), "P-0012-usar-zod-si.md");
  assert.equal(nombreDeArchivo("D-0002", "···"), "D-0002.md");
});

test("de los manifiestos de Node sale la base de datos (con su driver), el ORM, el framework, el runtime y las pruebas", () => {
  const paquete = {
    engines: { node: ">=24" },
    scripts: { test: 'node --test "src/**/*.test.ts"' },
    dependencies: { next: "16.3.6", react: "19.2.8", pg: "^8.11.3", "@prisma/client": "^5.22.0" },
    devDependencies: { prisma: "^5.22.0", typescript: "^5.6.0" },
  };
  const s = loQueSeVe([{ ruta: "package.json", contenido: JSON.stringify(paquete) }, { ruta: ".nvmrc", contenido: "v26.12.1\n" }, { ruta: "src" }]);
  assert.deepEqual(
    s.map((x) => [x.tema, x.regla]),
    [
      ["base-de-datos", "PostgreSQL (pg 8.11.3)."],
      ["orm", "Prisma 5.22.0."],
      ["framework", "Next.js 16.3.6, React 19.2.8."],
      ["runtime", "Node >=24."],
      ["lenguaje", "TypeScript 5.6.0."],
      ["pruebas", "node --test."],
      ["nucleo", "`**/schema.prisma` — el esquema de Prisma, que cambia la base"],
    ],
  );
  assert.deepEqual(s[0]!.fuentes, ["package.json"]);
  // Aprobada, la regla del núcleo es la que leen la integración y la salida a producción.
  const nucleo = s.find((x) => x.tema === "nucleo")!;
  assert.deepEqual(nucleoDeLaFicha(lineaDeLaFicha(nucleo.tema, nucleo.regla, "D-0007")), [{ patron: "**/schema.prisma", porque: "núcleo: el esquema de Prisma, que cambia la base" }]);
  // Node visto en dos lugares va una vez, con la versión del primero; el detalle dice de dónde sale.
  assert.match(s.find((x) => x.tema === "runtime")!.detalle.join(" "), /Node >=24 \(en package\.json\)/);
});

test("de un .csproj sale SQL Server y .NET; de pyproject, Django y PostgreSQL; sin manifiestos, nada", () => {
  const csproj = `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup>
    <ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="10.0.0" /><PackageReference Include="Dapper" Version="2.1.35" /></ItemGroup></Project>`;
  const net = loQueSeVe([{ ruta: "Web/Web.csproj", contenido: csproj }, { ruta: "global.json", contenido: '{"sdk":{"version":"10.0.100"}}' }]);
  assert.deepEqual(
    net.map((x) => [x.tema, x.regla]),
    [
      ["base-de-datos", "SQL Server (Microsoft.EntityFrameworkCore.SqlServer 10.0.0)."],
      ["orm", "Dapper 2.1.35."],
      ["runtime", ".NET 10.0, .NET SDK 10.0.100."],
    ],
  );
  const py = loQueSeVe([{ ruta: "pyproject.toml", contenido: '[project]\nname = "fastapi-app"\ndependencies = ["django>=5.1", "psycopg[binary]==3.2.1", "pytest"]\n' }]);
  assert.deepEqual(
    py.map((x) => [x.tema, x.regla]),
    [
      ["base-de-datos", "PostgreSQL (psycopg 3.2.1)."],
      ["framework", "Django >=5.1."],
      ["pruebas", "pytest."],
    ],
  );
  // Dos bases de datos: una propuesta que lo dice, para que él decida.
  const dos = loQueSeVe([{ ruta: "package.json", contenido: JSON.stringify({ dependencies: { pg: "8.0.0", mongodb: "6.0.0" } }) }]);
  assert.equal(dos[0]!.regla, "PostgreSQL y MongoDB: el proyecto usa más de una.");
  assert.deepEqual(loQueSeVe([{ ruta: "README.md" }, { ruta: "package.json", contenido: "{ roto" }]), []);
});

/**
 * Una propuesta y una línea de bitácora tal como las escribe el plugin al pasar una tarea a `hecho`
 * (fabrica/hooks/memoria.ts). La misma propuesta está en su prueba (fabrica/hooks/tareas.test.ts),
 * que comprueba que el plugin la escribe así: si cambia allá, cambia aquí.
 */
const PROPUESTA_DEL_PLUGIN = [
  "---",
  "id: P-0002",
  "titulo: Validar el cuerpo con Zod",
  "estado: propuesta",
  "fecha: 2026-10-26",
  "temas: validacion, api",
  "origen: F-014",
  'propone: "fabrica:constructor"',
  "regla: El cuerpo de cada ruta se valida con Zod.",
  'reemplaza: ""',
  "---",
  "",
  "## Decisión",
  "",
  "Las rutas nuevas validan el cuerpo con un esquema de Zod.",
  "",
  "## Por qué",
  "",
  "Zod ya está en el proyecto y da los tipos.",
  "",
  "## Qué se descartó",
  "",
  "- Validar a mano: se repetía en cada ruta.",
  "",
  "## Qué implica",
  "",
  "_(sin escribir)_",
  "",
].join("\n");
const BITACORA_DEL_PLUGIN = "# Bitácora de 2026-10\n\n- 2026-10-26 · F-014 · Exportar ventas a CSV · hecha · toca: src/reportes/ventas.ts, src/reportes/ventas.test.ts · decisiones: D-0001\n";

test("lo que el plugin escribe al terminar una tarea pasa la revisión del vault y se lee entero", () => {
  const ruta = `propuestas/${nombreDeArchivo("P-0002", "Validar el cuerpo con Zod")}`;
  const archivos = [...VAULT.filter((a) => !a.ruta.startsWith("bitacora/")), { ruta, texto: PROPUESTA_DEL_PLUGIN }, { ruta: "bitacora/2026-10.md", texto: BITACORA_DEL_PLUGIN }];
  assert.deepEqual(revisarVault(archivos), []);
  const p = leerDocumento(PROPUESTA_DEL_PLUGIN, ruta);
  assert.deepEqual(
    [p.tipo, p.id, p.estado, p.temas, p.origen, p.propone, p.regla],
    ["propuesta", "P-0002", "propuesta", ["validacion", "api"], "F-014", "fabrica:constructor", "El cuerpo de cada ruta se valida con Zod."],
  );
  assert.equal(p.secciones["Qué se descartó"], "- Validar a mano: se repetía en cada ruta.");
  const [linea] = leerBitacora(BITACORA_DEL_PLUGIN).entradas;
  assert.deepEqual(
    [linea!.tarea, linea!.titulo, linea!.estado, linea!.toca, linea!.decisiones],
    ["F-014", "Exportar ventas a CSV", "hecha", ["src/reportes/ventas.ts", "src/reportes/ventas.test.ts"], ["D-0001"]],
  );
});
