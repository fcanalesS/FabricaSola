// Los comandos de build, test y lint de un proyecto, deducidos de sus archivos y de su CLAUDE.md,
// para que una factory/ nueva no quede con los comandos vacíos sin avisar. Sigue la tabla de
// /fabrica:init (fabrica/commands/init.md, «2. Detectar el proyecto»): cada comando que devuelve
// existe en el proyecto. Es lógica pura: quien lee el disco es proyecto.ts.

/** Un archivo de la raíz o de un nivel más abajo, con su contenido si es uno de los que se leen. */
export type ArchivoDelProyecto = { ruta: string; contenido?: string }

export type ComandosDetectados = { build: string; test: string; lint: string; avisos: string[] }

/**
 * Los archivos cuyo contenido hace falta para decidir. El resto basta con saber que están. Los de
 * versiones (`.nvmrc`, `global.json`) y `requirements.txt` los usa la memoria para sembrar su ficha.
 */
export const hayQueLeer = (ruta: string) => /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|global\.json|\.nvmrc|\.node-version)$|\.(sln|slnx|csproj)$/i.test(ruta);

const nombre = (ruta: string) => ruta.split("/").at(-1) ?? ruta;
const nivel = (ruta: string) => ruta.split("/").length - 1;
const normal = (ruta: string) => ruta.replace(/\\/g, "/").replace(/^\.\//, "");
/** Una ruta para la línea de comandos: entre comillas si tiene espacios. */
const enComando = (ruta: string) => (/\s/.test(ruta) ? `"${ruta}"` : ruta);

// ---- Lo que dice el CLAUDE.md del proyecto -------------------------------------------------------

/**
 * Los comandos de un bloque «Build, run, test, lint» (o «Comandos», «Commands») del CLAUDE.md: las
 * líneas de sus bloques de código, sin comentarios. Mandan sobre la tabla. Lo que no es build, test
 * ni lint (correr la aplicación, por ejemplo) no se toma.
 */
export function comandosDelClaudeMd(texto: string): Partial<Record<"build" | "test" | "lint", string>> {
  const out: Partial<Record<"build" | "test" | "lint", string>> = {};
  let enSeccion = false;
  let enBloque = false;
  for (const linea of texto.replace(/\r\n/g, "\n").split("\n")) {
    const encabezado = /^#{1,6}\s+(.*)$/.exec(linea);
    if (encabezado && !enBloque) {
      enSeccion = /\b(build|test|lint|comandos|commands)\b/i.test(encabezado[1] ?? "");
      continue;
    }
    if (/^\s*(```|~~~)/.test(linea)) {
      enBloque = !enBloque;
      continue;
    }
    if (!enSeccion || !enBloque) continue;
    // Sin el prompt de la consola ni el comentario del final.
    const comando = linea.replace(/^\s*[$>]\s+/, "").replace(/\s+#.*$/, "").trim();
    if (!comando || comando.startsWith("#")) continue;
    const tipo = /\b(lint|eslint|ruff|clippy|go vet|stylelint|flake8)\b/i.test(comando)
      ? "lint"
      : /(\btest\b|\bpytest\b|\bvitest\b|\bjest\b)/i.test(comando)
        ? "test"
        : /\bbuild\b|\btsc\b.*--noEmit/i.test(comando)
          ? "build"
          : null;
    if (tipo && !out[tipo]) out[tipo] = comando;
  }
  return out;
}

// ---- .NET ------------------------------------------------------------------------------------------

/** Los proyectos que nombra una solución (.sln o .slnx), como rutas relativas a la carpeta de la solución. */
export function proyectosDeLaSolucion(contenido: string): string[] {
  const sln = [...contenido.matchAll(/^Project\("[^"]*"\)\s*=\s*"[^"]*",\s*"([^"]+\.csproj)"/gim)].map((m) => m[1]!);
  const slnx = [...contenido.matchAll(/<Project\s+Path="([^"]+\.csproj)"/gi)].map((m) => m[1]!);
  return [...sln, ...slnx].map(normal);
}

/** Si un .csproj es de pruebas: por su nombre, o porque referencia xunit, nunit, mstest o el SDK de pruebas. */
const esDePruebas = (a: ArchivoDelProyecto) =>
  /\.Tests?\.csproj$/i.test(a.ruta) || /\b(xunit|nunit|mstest|Microsoft\.NET\.Test\.Sdk)\b/i.test(a.contenido ?? "");

function dotnet(archivos: ArchivoDelProyecto[], avisos: string[]): { build: string; test: string; lint: string } | null {
  const soluciones = archivos.filter((a) => /\.(sln|slnx)$/i.test(a.ruta)).sort((x, y) => nivel(x.ruta) - nivel(y.ruta) || x.ruta.localeCompare(y.ruta));
  const csprojs = archivos.filter((a) => /\.csproj$/i.test(a.ruta));
  if (!soluciones.length && !csprojs.length) return null;
  const pruebas = csprojs.filter(esDePruebas);

  if (!soluciones.length) {
    const principal = csprojs.find((c) => !esDePruebas(c)) ?? csprojs[0]!;
    if (csprojs.filter((c) => !esDePruebas(c)).length > 1) avisos.push(`Hay varios proyectos .csproj y ninguna solución: se usó ${principal.ruta}. Revísalo.`);
    const test = pruebas[0];
    if (!test) avisos.push("No se encontró un proyecto de pruebas (.Tests.csproj o con xunit, nunit o mstest): la verificación solo va a compilar.");
    return { build: `dotnet build ${enComando(principal.ruta)} --nologo -v q`, test: test ? `dotnet test ${enComando(test.ruta)} --nologo -v q` : "", lint: "" };
  }

  const sln = soluciones[0]!;
  if (soluciones.length > 1) avisos.push(`Hay ${soluciones.length} soluciones: se usó ${sln.ruta}. Si la principal es otra, cámbialo.`);
  const carpeta = sln.ruta.includes("/") ? sln.ruta.slice(0, sln.ruta.lastIndexOf("/") + 1) : "";
  const enLaSolucion = new Set(proyectosDeLaSolucion(sln.contenido ?? "").map((p) => (carpeta + p).toLowerCase()));
  const dentro = pruebas.filter((p) => enLaSolucion.has(p.ruta.toLowerCase()));
  const fuera = pruebas.filter((p) => !enLaSolucion.has(p.ruta.toLowerCase()));
  const build = `dotnet build ${enComando(sln.ruta)} --nologo -v q`;

  let test = "";
  if (dentro.length) test = `dotnet test ${enComando(sln.ruta)} --nologo -v q`;
  else if (fuera.length) {
    // `dotnet test` sobre la solución no las correría: se apunta al proyecto de pruebas.
    test = `dotnet test ${enComando(fuera[0]!.ruta)} --nologo -v q`;
    avisos.push(`${nombre(fuera[0]!.ruta)} no está en ${nombre(sln.ruta)}: dotnet test sobre la solución no correría sus pruebas, así que el comando de test apunta a ese proyecto.${fuera.length > 1 ? ` Hay otros fuera de la solución (${fuera.slice(1).map((f) => nombre(f.ruta)).join(", ")}): agrégalos a mano si hace falta.` : ""}`);
  } else avisos.push("El proyecto no tiene pruebas (.Tests.csproj o con xunit, nunit o mstest): la verificación solo va a compilar.");
  return { build, test, lint: "" };
}

// ---- npm, Python, Rust y Go -----------------------------------------------------------------------

/** El script de pruebas que pone `npm init`: no prueba nada. */
const PLACEHOLDER_DE_NPM = /no test specified/i;

function npm(archivos: ArchivoDelProyecto[], avisos: string[]): { build: string; test: string; lint: string } | null {
  const pkg = archivos.filter((a) => nombre(a.ruta) === "package.json").sort((x, y) => nivel(x.ruta) - nivel(y.ruta))[0];
  if (!pkg) return null;
  let scripts: Record<string, unknown> = {};
  try {
    scripts = ((JSON.parse(pkg.contenido ?? "{}") as { scripts?: Record<string, unknown> }).scripts ?? {}) as Record<string, unknown>;
  } catch {
    avisos.push(`${pkg.ruta} no se pudo leer como JSON.`);
  }
  const carpeta = pkg.ruta.includes("/") ? pkg.ruta.slice(0, pkg.ruta.lastIndexOf("/")) : "";
  // Un package.json que no está en la raíz se corre desde su carpeta.
  const en = (c: string) => (carpeta ? `cd ${enComando(carpeta)}; ${c}` : c);
  const hay = (s: string) => typeof scripts[s] === "string" && (scripts[s] as string).trim() !== "";
  const test = hay("test") && !PLACEHOLDER_DE_NPM.test(String(scripts.test)) ? en("npm test") : "";
  if (!test) avisos.push(`${pkg.ruta} no tiene un script de pruebas: la verificación no va a correr pruebas.`);
  return { build: hay("build") ? en("npm run build") : "", test, lint: hay("lint") ? en("npm run lint") : "" };
}

function python(archivos: ArchivoDelProyecto[], avisos: string[]): { build: string; test: string; lint: string } | null {
  const raiz = archivos.filter((a) => nivel(a.ruta) === 0);
  if (!raiz.some((a) => /^(pyproject\.toml|requirements\.txt)$/i.test(a.ruta))) return null;
  const pyproject = raiz.find((a) => a.ruta.toLowerCase() === "pyproject.toml")?.contenido ?? "";
  const hayPruebas = archivos.some((a) => /(^|\/)tests?\//i.test(a.ruta) || /(^|\/)(test_[^/]+|[^/]+_test)\.py$/i.test(a.ruta) || a.ruta.toLowerCase() === "tests" || a.ruta.toLowerCase() === "test") || /\[tool\.pytest/i.test(pyproject);
  const ruff = /\[tool\.ruff/i.test(pyproject) || raiz.some((a) => /^\.?ruff\.toml$/i.test(a.ruta));
  if (!hayPruebas) avisos.push("No se encontraron pruebas de Python (tests/ o test_*.py): la verificación no va a correr pruebas.");
  return { build: "", test: hayPruebas ? "pytest -q" : "", lint: ruff ? "ruff check ." : "" };
}

const cargo = (archivos: ArchivoDelProyecto[]) =>
  archivos.some((a) => a.ruta === "Cargo.toml") ? { build: "cargo build", test: "cargo test", lint: "cargo clippy -- -D warnings" } : null;
const go = (archivos: ArchivoDelProyecto[]) => (archivos.some((a) => a.ruta === "go.mod") ? { build: "go build ./...", test: "go test ./...", lint: "go vet ./..." } : null);

/**
 * Los comandos de build, test y lint de un proyecto. `archivos`: los de la raíz y los de un nivel
 * más abajo, con el contenido de los que se leen (`hayQueLeer`). `claudeMd`: el CLAUDE.md del
 * proyecto, si tiene; sus comandos mandan sobre la tabla. Sin nada reconocible, todo vacío y un
 * aviso que lo dice.
 */
export function detectarComandos(archivos: readonly ArchivoDelProyecto[], claudeMd?: string | null): ComandosDetectados {
  const lista = archivos.map((a) => ({ ...a, ruta: normal(a.ruta) }));
  const avisos: string[] = [];
  const deTabla = dotnet(lista, avisos) ?? npm(lista, avisos) ?? python(lista, avisos) ?? cargo(lista) ?? go(lista);
  const delMd = claudeMd ? comandosDelClaudeMd(claudeMd) : {};
  const desdeMd = Object.keys(delMd).length > 0;
  if (desdeMd) {
    // Lo que dice el CLAUDE.md manda: los avisos de la tabla sobre esos comandos ya no aplican.
    avisos.splice(0, avisos.length);
    avisos.push(`Los comandos ${Object.keys(delMd).join(", ")} salen del CLAUDE.md del proyecto.`);
  }
  const r = { build: delMd.build ?? deTabla?.build ?? "", test: delMd.test ?? deTabla?.test ?? "", lint: delMd.lint ?? deTabla?.lint ?? "" };
  if (!deTabla && !desdeMd) avisos.push("No se reconoció el proyecto (ni .sln, .csproj, package.json, pyproject.toml, Cargo.toml ni go.mod) ni hay comandos en su CLAUDE.md: escribe build, test y lint a mano.");
  else if (!r.build && !r.test && !r.lint) avisos.push("No quedó ningún comando de build, test ni lint: escríbelos a mano, o la fábrica no puede verificar.");
  if (r.lint && !r.lint.includes("{archivos}")) avisos.push("Si el lint ya falla por errores previos del proyecto, usa {archivos} para lintear solo lo que cambia cada tarea (y lint_extensiones).");
  return { ...r, avisos };
}

// ---- Probar los comandos ---------------------------------------------------------------------------

/** El argv para correr un comando de config.md en la shell del sistema: la misma que usa el plugin. */
export const enShell = (comando: string, windows: boolean): string[] =>
  windows ? ["powershell", "-NoProfile", "-NonInteractive", "-Command", comando] : ["sh", "-c", comando];

/**
 * El entorno con que corren los comandos del proyecto: sin nada de la aplicación (sus claves
 * FACTORIA_, ANTHROPIC_, las de la fábrica ni la de Jev). Las pruebas del proyecto no las ven.
 */
export function entornoDelProyecto(base: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined && !/^(FACTORIA_|ANTHROPIC_|FABRICA_)/.test(k) && k !== "TYPESAFE_AI_KEY") env[k] = v;
  return env;
}

/** Las últimas `n` líneas con algo de una salida, recortadas. */
export const colaDe = (texto: string, n: number, largo = 2000) =>
  texto.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim()).slice(-n).join("\n").slice(-largo);
