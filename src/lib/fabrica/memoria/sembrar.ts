import type { ArchivoDelProyecto } from "../motor/comandos.ts";

/**
 * Lo que se ve de un proyecto en sus manifiestos, para sembrar su memoria: qué
 * base de datos, ORM, framework, runtime y pruebas usa, con sus versiones. Sale
 * solo de lo que dicen `package.json`, los `.csproj`, `pyproject.toml`,
 * `requirements.txt`, `global.json` y `.nvmrc`: no se lee el código ni se
 * deduce nada más. Cada tema es una **propuesta**: a la ficha entra solo si él
 * la aprueba. Es lógica pura.
 *
 * Las versiones quedan escritas para lo que venga después (avisar de una
 * vulnerabilidad conocida en una versión, por ejemplo).
 */

export type Sembrado = {
  /** El tema de la ficha: `base-de-datos`, `framework`, `runtime`, `pruebas`, `lenguaje`. */
  tema: string;
  titulo: string;
  /** La regla, como entraría a la ficha si él la aprueba. */
  regla: string;
  /** De qué archivos sale, para el porqué. */
  fuentes: string[];
  /** Lo detectado con su versión, para «Qué implica». */
  detalle: string[];
};

type Visto = { tema: string; nombre: string; version: string | null; fuente: string; orden: number; /** El paquete que lo dijo. */ paquete?: string };

const normal = (ruta: string) => ruta.replace(/\\/g, "/").replace(/^\.\//, "");
/** «^16.3.6», «~5.0», «>=24» → «16.3.6», «5.0», «>=24». Lo que no parece una versión, nada. */
const version = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const limpia = v.trim().replace(/^[\^~=v]+/, "");
  return /^(>=?|<=?)?\s*\d/.test(limpia) ? limpia : null;
};

// Paquete → qué es. El orden dice cómo se nombra cuando hay varios del mismo tema.
const DE_NPM: Record<string, { tema: string; nombre: string; orden?: number }> = {
  pg: { tema: "base-de-datos", nombre: "PostgreSQL" },
  postgres: { tema: "base-de-datos", nombre: "PostgreSQL" },
  "@neondatabase/serverless": { tema: "base-de-datos", nombre: "PostgreSQL" },
  mysql: { tema: "base-de-datos", nombre: "MySQL" },
  mysql2: { tema: "base-de-datos", nombre: "MySQL" },
  mssql: { tema: "base-de-datos", nombre: "SQL Server" },
  tedious: { tema: "base-de-datos", nombre: "SQL Server" },
  mongodb: { tema: "base-de-datos", nombre: "MongoDB" },
  mongoose: { tema: "base-de-datos", nombre: "MongoDB" },
  "better-sqlite3": { tema: "base-de-datos", nombre: "SQLite" },
  sqlite3: { tema: "base-de-datos", nombre: "SQLite" },
  prisma: { tema: "orm", nombre: "Prisma" },
  "@prisma/client": { tema: "orm", nombre: "Prisma" },
  "drizzle-orm": { tema: "orm", nombre: "Drizzle" },
  typeorm: { tema: "orm", nombre: "TypeORM" },
  sequelize: { tema: "orm", nombre: "Sequelize" },
  knex: { tema: "orm", nombre: "Knex" },
  next: { tema: "framework", nombre: "Next.js", orden: 0 },
  "@nestjs/core": { tema: "framework", nombre: "NestJS", orden: 0 },
  "@angular/core": { tema: "framework", nombre: "Angular", orden: 0 },
  nuxt: { tema: "framework", nombre: "Nuxt", orden: 0 },
  "@sveltejs/kit": { tema: "framework", nombre: "SvelteKit", orden: 0 },
  react: { tema: "framework", nombre: "React", orden: 1 },
  vue: { tema: "framework", nombre: "Vue", orden: 1 },
  svelte: { tema: "framework", nombre: "Svelte", orden: 1 },
  express: { tema: "framework", nombre: "Express", orden: 2 },
  fastify: { tema: "framework", nombre: "Fastify", orden: 2 },
  typescript: { tema: "lenguaje", nombre: "TypeScript" },
  jest: { tema: "pruebas", nombre: "Jest" },
  vitest: { tema: "pruebas", nombre: "Vitest" },
  mocha: { tema: "pruebas", nombre: "Mocha" },
  "@playwright/test": { tema: "pruebas", nombre: "Playwright" },
};

const DE_NUGET: [RegExp, { tema: string; nombre: string }][] = [
  [/^Microsoft\.EntityFrameworkCore\.SqlServer$|^Microsoft\.Data\.SqlClient$|^System\.Data\.SqlClient$/i, { tema: "base-de-datos", nombre: "SQL Server" }],
  [/^Npgsql(\..+)?$/i, { tema: "base-de-datos", nombre: "PostgreSQL" }],
  [/^Pomelo\.EntityFrameworkCore\.MySql$|^MySql\.Data$|^MySqlConnector$/i, { tema: "base-de-datos", nombre: "MySQL" }],
  [/^MongoDB\.Driver$/i, { tema: "base-de-datos", nombre: "MongoDB" }],
  [/^Microsoft\.(EntityFrameworkCore\.Sqlite|Data\.Sqlite)$/i, { tema: "base-de-datos", nombre: "SQLite" }],
  [/^Microsoft\.EntityFrameworkCore$/i, { tema: "orm", nombre: "Entity Framework Core" }],
  [/^Dapper$/i, { tema: "orm", nombre: "Dapper" }],
  [/^xunit$/i, { tema: "pruebas", nombre: "xUnit" }],
  [/^NUnit$/i, { tema: "pruebas", nombre: "NUnit" }],
  [/^MSTest\.TestFramework$/i, { tema: "pruebas", nombre: "MSTest" }],
];

const DE_PYTHON: Record<string, { tema: string; nombre: string; orden?: number }> = {
  "psycopg": { tema: "base-de-datos", nombre: "PostgreSQL" },
  "psycopg2": { tema: "base-de-datos", nombre: "PostgreSQL" },
  "psycopg2-binary": { tema: "base-de-datos", nombre: "PostgreSQL" },
  "asyncpg": { tema: "base-de-datos", nombre: "PostgreSQL" },
  "pymysql": { tema: "base-de-datos", nombre: "MySQL" },
  "mysqlclient": { tema: "base-de-datos", nombre: "MySQL" },
  "pyodbc": { tema: "base-de-datos", nombre: "SQL Server u otra por ODBC" },
  "pymssql": { tema: "base-de-datos", nombre: "SQL Server" },
  "pymongo": { tema: "base-de-datos", nombre: "MongoDB" },
  "sqlalchemy": { tema: "orm", nombre: "SQLAlchemy" },
  "django": { tema: "framework", nombre: "Django", orden: 0 },
  "fastapi": { tema: "framework", nombre: "FastAPI", orden: 0 },
  "flask": { tema: "framework", nombre: "Flask", orden: 0 },
  "pytest": { tema: "pruebas", nombre: "pytest" },
};

function deNpm(ruta: string, contenido: string, vistos: Visto[]): void {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(contenido) as Record<string, unknown>;
  } catch {
    return;
  }
  const deps = { ...((j.devDependencies as Record<string, unknown>) ?? {}), ...((j.dependencies as Record<string, unknown>) ?? {}) };
  for (const [paquete, v] of Object.entries(deps)) {
    const que = DE_NPM[paquete];
    if (que) vistos.push({ ...que, paquete, version: version(v), fuente: ruta, orden: que.orden ?? 0 });
  }
  const motor = (j.engines as Record<string, unknown> | undefined)?.node;
  if (typeof motor === "string") vistos.push({ tema: "runtime", nombre: "Node", version: motor.trim(), fuente: ruta, orden: 0 });
  const prueba = (j.scripts as Record<string, unknown> | undefined)?.test;
  if (typeof prueba === "string" && /\bnode\s+--test\b/.test(prueba)) vistos.push({ tema: "pruebas", nombre: "node --test", version: null, fuente: ruta, orden: 0 });
}

function deCsproj(ruta: string, contenido: string, vistos: Visto[]): void {
  for (const m of contenido.matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]*)")?/gi)) {
    const hallado = DE_NUGET.find(([re]) => re.test(m[1]!));
    if (hallado) vistos.push({ ...hallado[1], paquete: m[1]!, version: version(m[2]), fuente: ruta, orden: 0 });
  }
  const tf = /<TargetFrameworks?>([^<]+)<\/TargetFrameworks?>/i.exec(contenido)?.[1];
  for (const t of tf?.split(";") ?? []) {
    const n = /^net(\d+\.\d+)/i.exec(t.trim());
    if (n) vistos.push({ tema: "runtime", nombre: ".NET", version: n[1]!, fuente: ruta, orden: 0 });
  }
}

function dePython(ruta: string, contenido: string, vistos: Visto[]): void {
  // Una dependencia por línea (requirements) o entre comillas (pyproject): el nombre y su versión.
  for (const m of contenido.matchAll(/(?:^|["'\s])([A-Za-z][A-Za-z0-9_.-]*)\s*(?:\[[^\]]*\])?\s*(?:(==|>=|~=|<=|>)\s*([0-9][^"',;\s]*))?(?=["',;\s]|$)/gm)) {
    const que = DE_PYTHON[m[1]!.toLowerCase()];
    if (que) vistos.push({ ...que, paquete: m[1]!.toLowerCase(), version: m[3] ? `${m[2] === "==" ? "" : m[2]}${m[3]}` : null, fuente: ruta, orden: que.orden ?? 0 });
  }
}

const TITULOS: Record<string, string> = { "base-de-datos": "Base de datos", orm: "Acceso a datos", framework: "Framework", runtime: "Runtime", lenguaje: "Lenguaje", pruebas: "Pruebas" };
const ORDEN_DE_TEMAS = ["base-de-datos", "orm", "framework", "runtime", "lenguaje", "pruebas"];

/** Con su versión. La de una base de datos es la de su paquete (el driver), no la del servidor: va entre paréntesis. */
const conVersion = (v: Visto) =>
  v.tema === "base-de-datos" && v.paquete ? `${v.nombre} (${v.paquete}${v.version ? ` ${v.version}` : ""})` : v.version ? `${v.nombre} ${v.version}` : v.nombre;

/** Lo que se ve en los manifiestos del proyecto, una propuesta por tema. */
export function loQueSeVe(archivos: readonly ArchivoDelProyecto[]): Sembrado[] {
  const vistos: Visto[] = [];
  for (const a of archivos) {
    if (a.contenido === undefined) continue;
    const ruta = normal(a.ruta);
    const nombre = ruta.split("/").pop()!.toLowerCase();
    if (nombre === "package.json") deNpm(ruta, a.contenido, vistos);
    else if (nombre.endsWith(".csproj")) deCsproj(ruta, a.contenido, vistos);
    else if (nombre === "pyproject.toml" || nombre === "requirements.txt") dePython(ruta, a.contenido, vistos);
    else if (nombre === ".nvmrc" || nombre === ".node-version") {
      const v = a.contenido.trim().split(/\s/)[0];
      if (v) vistos.push({ tema: "runtime", nombre: "Node", version: v.replace(/^v/, ""), fuente: ruta, orden: 0 });
    } else if (nombre === "global.json") {
      try {
        const v = (JSON.parse(a.contenido) as { sdk?: { version?: unknown } }).sdk?.version;
        if (typeof v === "string") vistos.push({ tema: "runtime", nombre: ".NET SDK", version: v, fuente: ruta, orden: 1 });
      } catch {
        // Un global.json roto no dice nada.
      }
    }
  }

  const sembrados: Sembrado[] = [];
  for (const tema of ORDEN_DE_TEMAS) {
    // Lo mismo visto en varios archivos va una vez, con la primera versión que se encontró.
    const unicos = new Map<string, Visto>();
    for (const v of vistos.filter((x) => x.tema === tema).sort((a, b) => a.orden - b.orden)) {
      const ya = unicos.get(v.nombre);
      if (!ya) unicos.set(v.nombre, v);
      else if (!ya.version && v.version) unicos.set(v.nombre, v);
    }
    const lista = [...unicos.values()];
    if (!lista.length) continue;
    const nombres = lista.map((v) => v.nombre);
    const regla =
      tema === "base-de-datos"
        ? lista.length === 1
          ? `${conVersion(lista[0]!)}.`
          : `${nombres.join(" y ")}: el proyecto usa más de una.`
        : `${lista.map(conVersion).join(", ")}.`;
    sembrados.push({
      tema,
      titulo: `${TITULOS[tema]}: ${nombres.join(", ")}`,
      regla,
      fuentes: [...new Set(lista.map((v) => v.fuente))],
      detalle: lista.map((v) => `${conVersion(v)} (en ${v.fuente})`),
    });
  }
  // Con Prisma, su esquema es la base: se propone marcarlo como núcleo, así una tarea que lo toca
  // es grande y pide su clic para producción. El código no lo trae: no nombra ningún stack.
  const prisma = vistos.find((v) => v.tema === "orm" && v.nombre === "Prisma");
  if (prisma)
    sembrados.push({
      tema: "nucleo",
      titulo: "Núcleo: el esquema de Prisma",
      regla: "`**/schema.prisma` — el esquema de Prisma, que cambia la base",
      fuentes: [prisma.fuente],
      detalle: ["Una tarea que toque el esquema espera tu prueba antes de integrarse, y pide tu clic para producción."],
    });
  return sembrados;
}
