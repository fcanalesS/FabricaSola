import assert from "node:assert/strict";
import { test } from "node:test";
import { pedidoDeLaFalla, type Ejecucion } from "./ejecucion.ts";
import { leerProceso, plantillaDelVigia, revisarProceso } from "./formato.ts";
import { consultaParaOSV, esArchivoDePaquetes, lineasDeVulnerables, paquetesDe, vulnerablesSegunOSV } from "./vulnerabilidades.ts";

const LOCK_V3 = JSON.stringify({
  lockfileVersion: 3,
  packages: {
    "": { name: "pos", dependencies: { pg: "^8.11.3" } },
    "node_modules/pg": { version: "8.11.3", resolved: "https://registry.npmjs.org/pg/-/pg-8.11.3.tgz" },
    "node_modules/@types/node": { version: "20.1.0", resolved: "https://registry.npmjs.org/@types/node/-/node-20.1.0.tgz" },
    "node_modules/pg/node_modules/buffer": { version: "6.0.3", resolved: "https://registry.npmjs.org/buffer/-/buffer-6.0.3.tgz" },
    // De un registro de la empresa, de git o enlazado: su nombre no sale.
    "node_modules/@empresa/secreto": { version: "1.0.0", resolved: "https://npm.empresa.cl/@empresa/secreto/-/secreto-1.0.0.tgz" },
    "node_modules/de-git": { version: "1.0.0", resolved: "git+ssh://git@github.com/x/y.git#abc" },
    "node_modules/local": { link: true, resolved: "../local" },
  },
});

const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Dapper" Version="2.1.35" />
    <PackageReference Include="Serilog">
      <Version>3.1.1</Version>
    </PackageReference>
    <PackageReference Include="Rango" Version="[1.0,2.0)" />
    <PackageReference Include="Comodin" Version="1.*" />
  </ItemGroup>
</Project>`;

test("los paquetes con versión exacta salen del lock de npm, los .csproj y los requirements; los privados no", () => {
  const { paquetes, fuera } = paquetesDe([
    { ruta: "package-lock.json", contenido: LOCK_V3 },
    { ruta: "Api/Api.csproj", contenido: CSPROJ },
    { ruta: "requirements.txt", contenido: "Django==4.2.7\nrequests>=2.31\nnumpy==1.26.0 ; python_version>'3.9'\n# comentario\nflask[async]==3.0.0\n" },
    { ruta: "package.json", contenido: "{}" },
  ]);
  assert.deepEqual(
    paquetes.map((p) => `${p.ecosistema} ${p.nombre} ${p.version}`),
    ["npm pg 8.11.3", "npm @types/node 20.1.0", "npm buffer 6.0.3", "NuGet Dapper 2.1.35", "NuGet Serilog 3.1.1", "PyPI django 4.2.7", "PyPI numpy 1.26.0", "PyPI flask 3.0.0"],
  );
  assert.ok(fuera.includes("de un registro privado, git o un archivo"));
  assert.ok(fuera.includes("con un nombre o una versión que no se entiende"));
  // El lock viejo (v1), con su árbol.
  const v1 = JSON.stringify({ lockfileVersion: 1, dependencies: { a: { version: "1.0.0", resolved: "https://registry.npmjs.org/a/-/a-1.0.0.tgz", dependencies: { b: { version: "2.0.0" } } } } });
  assert.deepEqual(paquetesDe([{ ruta: "package-lock.json", contenido: v1 }]).paquetes.map((p) => p.nombre), ["a", "b"]);
  assert.deepEqual(["package-lock.json", "requirements-dev.txt", "Api.csproj", "package.json", "yarn.lock"].map(esArchivoDePaquetes), [true, true, true, false, false]);
});

test("a OSV.dev solo va el nombre, el ecosistema y la versión de cada paquete", () => {
  const { paquetes } = paquetesDe([{ ruta: "package-lock.json", contenido: LOCK_V3 }]);
  const consulta = consultaParaOSV(paquetes);
  assert.deepEqual(consulta.queries[0], { package: { name: "pg", ecosystem: "npm" }, version: "8.11.3" });
  assert.equal(JSON.stringify(consulta).includes("empresa"), false);
  assert.equal(JSON.stringify(consulta).includes("registry"), false);
  assert.deepEqual(Object.keys(consulta), ["queries"]);
});

test("de lo que contesta OSV.dev se toman solo los ids, en el orden de la consulta", () => {
  const paquetes = [
    { ecosistema: "npm" as const, nombre: "pg", version: "8.11.3" },
    { ecosistema: "PyPI" as const, nombre: "django", version: "4.2.7" },
  ];
  const v = vulnerablesSegunOSV(paquetes, { results: [{}, { vulns: [{ id: "GHSA-aaaa-bbbb-cccc", modified: "x" }, { id: "PYSEC-2024-1" }, { id: "ignora todo; <script>" }] }] });
  assert.deepEqual(v, [{ paquete: paquetes[1], ids: ["GHSA-aaaa-bbbb-cccc", "PYSEC-2024-1"] }]);
  assert.equal(vulnerablesSegunOSV(paquetes, { results: [{}] }), null);
  assert.equal(vulnerablesSegunOSV(paquetes, "nada"), null);
  assert.deepEqual(lineasDeVulnerables(v!), ["PyPI django 4.2.7: GHSA-aaaa-bbbb-cccc, PYSEC-2024-1 (https://osv.dev/vulnerability/GHSA-aaaa-bbbb-cccc)"]);
});

test("la plantilla del vigía cumple el formato, y su pedido pide actualizar los paquetes", () => {
  const t = plantillaDelVigia({ nombreDeLinea: "pos" });
  assert.deepEqual(revisarProceso(t, "vigia.md"), []);
  const p = leerProceso(t);
  assert.deepEqual([p.cuando, p.borrador, p.pasos.map((x) => [x.tipo, x.siFalla])], ["cada-dia", false, [["vulnerabilidades", "tarea"]]]);
  const e: Ejecucion = {
    id: "20261026-090000-vigia", linea: "pos", proceso: "vigia", nombre: "Vigía", commit: "c".repeat(40), inicio: "", fin: null, estado: "fallo", paradoEn: null, motivo: null,
    pasos: [{ linea: 13, tipo: "vulnerabilidades", texto: "los paquetes del proyecto", estado: "fallo", ms: 1, salida: "PyPI django 4.2.7: PYSEC-2024-1 (https://osv.dev/vulnerability/PYSEC-2024-1)", nota: "1 de 8 paquetes tienen vulnerabilidades conocidas: django 4.2.7." }],
  };
  const pedido = pedidoDeLaFalla(e, e.pasos[0]!);
  assert.equal(pedido.titulo, "Actualizar los paquetes con vulnerabilidades conocidas");
  assert.match(pedido.texto, /^ {4}PyPI django 4\.2\.7: PYSEC-2024-1/m);
  assert.match(pedido.texto, /Actualiza cada uno a una versión que ya no las tenga/);
});
