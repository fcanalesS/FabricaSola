import assert from "node:assert/strict";
import { test } from "node:test";
import { coincide, LO_DE_LA_BASE, LO_DELICADO, loCritico, notaDeLoCritico, notaDeTareasMarcadas, nucleoDeLaFicha } from "./salida.ts";

test("los patrones: ** cruza carpetas, * y ? no, y sin comodines es la ruta o lo que hay debajo", () => {
  assert.ok(coincide("**/*.sql", "tablas.sql"));
  assert.ok(coincide("**/*.sql", "db/servidor/tablas.SQL"));
  assert.ok(coincide("**/migrations/**", "src/Data/Migrations/2026_alta.cs"));
  assert.ok(!coincide("**/migrations/**", "src/migrationsviejas/a.cs"));
  assert.ok(coincide("src/*.ts", "src/a.ts"));
  assert.ok(!coincide("src/*.ts", "src/core/a.ts"));
  assert.ok(coincide("src/?.ts", "src/a.ts"));
  assert.ok(coincide("db/servidor", "db/servidor/tablas.sql"));
  assert.ok(coincide("db/servidor/", "db/servidor/x/y.cs"));
  assert.ok(!coincide("db/servidor", "db/servidor-viejo/x.cs"));
  assert.ok(coincide("src\\Core\\**", "src/core/Precios.cs"));
  assert.ok(!coincide("", "a.cs"));
  // Un patrón no puede colar una expresión: los paréntesis y los puntos son literales.
  assert.ok(!coincide("a.(b|c)", "axb"));
});

test("el núcleo sale de las reglas del tema nucleo de la ficha, con su porqué", () => {
  const ficha = [
    "# Memoria de pos-tiendas",
    "",
    "## Reglas",
    "",
    "- [nucleo] `src/Ventas/**` — el corazón del negocio",
    "- [nucleo] db/servidor",
    "- [datos] NO: guardar el RUT en claro",
    "",
  ].join("\n");
  assert.deepEqual(nucleoDeLaFicha(ficha), [
    { patron: "src/Ventas/**", porque: "núcleo: el corazón del negocio" },
    { patron: "db/servidor", porque: "el núcleo" },
  ]);
  assert.deepEqual(nucleoDeLaFicha(""), []);
});

test("lo crítico de un cambio: el núcleo antes que la base, y lo demás no cuenta", () => {
  const nucleo = [{ patron: "src/Ventas/**", porque: "núcleo: el corazón del negocio" }];
  assert.deepEqual(loCritico(["src/Ventas/Caja.cs", "db/alta.sql", "README.md", "src/Web/x.tsx", "src/Ventas/migrations/1.sql"], nucleo), [
    { ruta: "src/Ventas/Caja.cs", porque: "núcleo: el corazón del negocio" },
    { ruta: "db/alta.sql", porque: "SQL" },
    { ruta: "src/Ventas/migrations/1.sql", porque: "núcleo: el corazón del negocio" },
  ]);
  assert.deepEqual(loCritico(["README.md", "src/a.ts"], []), []);
  // El esquema de Prisma es de un stack: lo marca él con [nucleo], y la aplicación se lo propone.
  assert.deepEqual(loCritico(["prisma/schema.prisma"], []), []);
  assert.equal(LO_DE_LA_BASE.length, 2);
});

// Los mismos casos que la prueba del mod (fabrica/hooks/tareas.test.ts, «Sencilla o grande»).
test("lo delicado marca la base, el pipeline y las dependencias de cualquier stack, sin nombrar lenguajes", () => {
  const delicado = (r: string) => LO_DELICADO.some((x) => coincide(x.patron, r));
  for (const r of ["db/alta.sql", "src/Datos/Migrations/1_Inicial.cs", ".github/workflows/ci.yml", "src/Api/Api.csproj", "go.mod", "web/package.json", "ci/.gitlab-ci.yml", "Jenkinsfile"]) assert.ok(delicado(r), r);
  for (const r of ["web/estilos.css", "src/Vistas/Caja.xaml", "src/app/page.tsx", "prisma/schema.prisma"]) assert.ok(!delicado(r), r);
  assert.equal(LO_DELICADO.length, 13);
});

test("la nota nombra hasta cinco archivos y cuenta los demás; sin nada crítico, no hay nota", () => {
  assert.equal(notaDeLoCritico([]), "");
  assert.equal(notaDeLoCritico([{ ruta: "db/a.sql", porque: "SQL" }]), "Desde la última salida cambió lo que siempre pide tu clic: db/a.sql (SQL).");
  const muchos = Array.from({ length: 7 }, (_, i) => ({ ruta: `db/${i}.sql`, porque: "SQL" }));
  assert.match(notaDeLoCritico(muchos), /db\/4\.sql \(SQL\) y 2 más\.$/);
});

test("la nota de las tareas que el agente de salida marcó: cuál y por qué, hasta cinco", () => {
  assert.equal(notaDeTareasMarcadas([]), "");
  assert.equal(notaDeTareasMarcadas([{ id: "F-014", motivo: "borra una columna" }]), "Una tarea pide tu clic para producción: F-014 (borra una columna). Su plan de vuelta está en la tarea.");
  assert.match(notaDeTareasMarcadas([{ id: "F-1", motivo: "" }, { id: "F-2", motivo: "x" }]), /^Hay tareas que piden tu clic para producción: F-1, F-2 \(x\)\./);
});
