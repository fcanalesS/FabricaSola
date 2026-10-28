import assert from "node:assert/strict";
import { test } from "node:test";
import { comandosDelClaudeMd, detectarComandos, entornoDelProyecto, enShell, proyectosDeLaSolucion } from "./comandos.ts";

// Una solución como la de WolffWebNET10: el proyecto de pruebas no está en la solución.
const SLN = `Microsoft Visual Studio Solution File, Format Version 12.00
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "WolffWeb", "WolffWeb\\WolffWeb.csproj", "{1}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "WolffWeb.Bci", "WolffWeb.Bci\\WolffWeb.Bci.csproj", "{2}"
EndProject
`;
const CSPROJ_DE_PRUEBAS = `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="xunit" Version="2.9.0" /></ItemGroup></Project>`;

// El bloque de comandos del CLAUDE.md de WolffWebNET10, como está.
const CLAUDE_MD_WOLFF = `# WolffWeb

## Build, run, test, lint
\`\`\`powershell
dotnet build WolffWeb.sln
dotnet run --project WolffWeb          # http://localhost:5167 (perfil "WolffWeb")
# Visual Studio / IIS Express          # http://localhost:19964
dotnet test WolffWeb.Tests             # xunit; compila WolffWeb por ProjectReference
cd WolffWeb; npm run lint              # eslint wwwroot/js
\`\`\`
- Solo HTTP (interno).

## Arquitectura
\`\`\`
dotnet test Otra.sln
\`\`\`
`;

test(".NET con el proyecto de pruebas fuera de la solución: el test apunta a ese proyecto, y se avisa", () => {
  const r = detectarComandos([
    { ruta: "WolffWeb.sln", contenido: SLN },
    { ruta: "WolffWeb" },
    { ruta: "WolffWeb/WolffWeb.csproj", contenido: "<Project Sdk=\"Microsoft.NET.Sdk.Web\" />" },
    { ruta: "WolffWeb.Tests/WolffWeb.Tests.csproj", contenido: CSPROJ_DE_PRUEBAS },
  ]);
  assert.equal(r.build, "dotnet build WolffWeb.sln --nologo -v q");
  assert.equal(r.test, "dotnet test WolffWeb.Tests/WolffWeb.Tests.csproj --nologo -v q");
  assert.equal(r.lint, "");
  assert.ok(r.avisos.some((a) => /WolffWeb\.Tests\.csproj no está en WolffWeb\.sln/.test(a)));
});

test(".NET con las pruebas dentro de la solución: se prueba la solución; sin pruebas, se avisa", () => {
  const conPruebas = detectarComandos([
    { ruta: "Caja.sln", contenido: `${SLN}Project("{X}") = "Caja.Tests", "Caja.Tests\\Caja.Tests.csproj", "{3}"\nEndProject\n` },
    { ruta: "Caja.Tests/Caja.Tests.csproj", contenido: CSPROJ_DE_PRUEBAS },
  ]);
  assert.equal(conPruebas.test, "dotnet test Caja.sln --nologo -v q");
  const sinPruebas = detectarComandos([{ ruta: "Caja.sln", contenido: SLN }]);
  assert.equal(sinPruebas.test, "");
  assert.ok(sinPruebas.avisos.some((a) => /no tiene pruebas/.test(a)));
  assert.deepEqual(proyectosDeLaSolucion(`<Solution><Project Path="src/A/A.csproj" /></Solution>`), ["src/A/A.csproj"]);
});

test("npm: cada comando, solo si su script existe; el placeholder de npm no es una prueba", () => {
  const scripts = (s: Record<string, string>) => JSON.stringify({ name: "x", scripts: s });
  const completo = detectarComandos([{ ruta: "package.json", contenido: scripts({ build: "next build", test: "node --test", lint: "eslint" }) }]);
  assert.deepEqual([completo.build, completo.test, completo.lint], ["npm run build", "npm test", "npm run lint"]);
  const sinTest = detectarComandos([{ ruta: "package.json", contenido: scripts({ build: "tsc", test: 'echo "Error: no test specified" && exit 1' }) }]);
  assert.deepEqual([sinTest.build, sinTest.test, sinTest.lint], ["npm run build", "", ""]);
  assert.ok(sinTest.avisos.some((a) => /no tiene un script de pruebas/.test(a)));
});

test("sin nada reconocible, todo vacío y un aviso que lo dice", () => {
  const r = detectarComandos([{ ruta: "LEEME.txt" }, { ruta: "docs" }], null);
  assert.deepEqual([r.build, r.test, r.lint], ["", "", ""]);
  assert.ok(r.avisos.some((a) => /No se reconoció el proyecto/.test(a)));
});

test("los comandos del CLAUDE.md mandan sobre la tabla", () => {
  assert.deepEqual(comandosDelClaudeMd(CLAUDE_MD_WOLFF), { build: "dotnet build WolffWeb.sln", test: "dotnet test WolffWeb.Tests", lint: "cd WolffWeb; npm run lint" });
  const r = detectarComandos([{ ruta: "WolffWeb.sln", contenido: SLN }, { ruta: "WolffWeb.Tests/WolffWeb.Tests.csproj", contenido: CSPROJ_DE_PRUEBAS }], CLAUDE_MD_WOLFF);
  assert.equal(r.build, "dotnet build WolffWeb.sln");
  assert.equal(r.test, "dotnet test WolffWeb.Tests");
  assert.ok(r.avisos.some((a) => /CLAUDE\.md/.test(a)));
  // Un lint de todo el proyecto: se sugiere {archivos}.
  assert.ok(r.avisos.some((a) => /\{archivos\}/.test(a)));
  // Un CLAUDE.md sin bloque de comandos no cambia nada.
  assert.deepEqual(comandosDelClaudeMd("# Proyecto\n\n## Arquitectura\n```\ndotnet build X.sln\n```\n"), {});
});

test("Python, Rust y Go, por la tabla de /fabrica:init", () => {
  const py = detectarComandos([{ ruta: "pyproject.toml", contenido: "[tool.ruff]\nline-length = 100\n" }, { ruta: "tests" }, { ruta: "tests/test_caja.py" }]);
  assert.deepEqual([py.build, py.test, py.lint], ["", "pytest -q", "ruff check ."]);
  assert.equal(detectarComandos([{ ruta: "Cargo.toml" }]).lint, "cargo clippy -- -D warnings");
  assert.equal(detectarComandos([{ ruta: "go.mod" }]).test, "go test ./...");
});

test("los comandos del proyecto corren sin las claves de la aplicación, en la shell del sistema", () => {
  assert.deepEqual(entornoDelProyecto({ PATH: "/bin", FACTORIA_CLAUDE_API_KEY: "x", ANTHROPIC_API_KEY: "y", FABRICA_JEV_KEY: "z", TYPESAFE_AI_KEY: "j" }), { PATH: "/bin" });
  assert.deepEqual(enShell("npm test", true), ["powershell", "-NoProfile", "-NonInteractive", "-Command", "npm test"]);
  assert.deepEqual(enShell("npm test", false), ["sh", "-c", "npm test"]);
});
