/**
 * El vigía de vulnerabilidades, lo puro: qué paquetes con versión exacta usa
 * un proyecto (de sus archivos de bloqueo y manifiestos), qué se le pregunta a
 * OSV.dev y qué contestó. Lo único que sale de este equipo son nombres,
 * versiones y su ecosistema, de paquetes públicos: nunca código ni rutas. Lo
 * decidió él el 26 de octubre de 2026. Un paquete que viene de un registro
 * privado no sale (su nombre podría decir algo de la empresa).
 */

export type Ecosistema = "npm" | "NuGet" | "PyPI";
export type Paquete = { ecosistema: Ecosistema; nombre: string; version: string };
export type ArchivoLeido = { ruta: string; contenido: string };

/** Lo que pasa hacia OSV.dev: con esta forma, y nada más. */
const NOMBRE: Record<Ecosistema, RegExp> = {
  npm: /^(?:@[a-z0-9][a-z0-9._-]{0,100}\/)?[a-z0-9][a-z0-9._-]{0,100}$/,
  NuGet: /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/,
  PyPI: /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/,
};
const VERSION = /^[0-9][0-9A-Za-z.+_-]{0,63}$/;
/** El registro público de npm: lo que viene de otro no sale. */
const REGISTRO_PUBLICO_NPM = "https://registry.npmjs.org/";
export const TOPE_DE_PAQUETES = 1000;

export const esPaqueteValido = (p: Paquete) => NOMBRE[p.ecosistema].test(p.nombre) && VERSION.test(p.version);

/** Los paquetes de un `package-lock.json` (v1, v2 o v3). Los enlazados, los de git o de un registro privado no cuentan. */
function deNpm(texto: string, fuera: Set<string>): Paquete[] {
  let dato: { packages?: Record<string, { version?: unknown; resolved?: unknown; link?: unknown }>; dependencies?: Record<string, unknown> };
  try {
    dato = JSON.parse(texto);
  } catch {
    return [];
  }
  const out: Paquete[] = [];
  const agregar = (nombre: string, version: unknown, resuelto: unknown) => {
    if (typeof version !== "string") return;
    if (typeof resuelto === "string" && !resuelto.startsWith(REGISTRO_PUBLICO_NPM)) {
      fuera.add("de un registro privado, git o un archivo");
      return;
    }
    out.push({ ecosistema: "npm", nombre, version });
  };
  if (dato.packages && typeof dato.packages === "object") {
    for (const [clave, p] of Object.entries(dato.packages)) {
      if (!clave || !p || typeof p !== "object" || p.link === true) continue;
      const i = clave.lastIndexOf("node_modules/");
      if (i < 0) continue;
      agregar(clave.slice(i + "node_modules/".length), p.version, p.resolved);
    }
    return out;
  }
  // La forma vieja (v1): un árbol de dependencias.
  const recorrer = (deps: Record<string, unknown> | undefined) => {
    for (const [nombre, d] of Object.entries(deps ?? {})) {
      const x = d as { version?: unknown; resolved?: unknown; dependencies?: Record<string, unknown> };
      agregar(nombre, x?.version, x?.resolved);
      recorrer(x?.dependencies);
    }
  };
  recorrer(dato.dependencies);
  return out;
}

/** Los `PackageReference` con versión exacta de un `.csproj`. Un rango o un comodín no es una versión. */
function deNuget(texto: string): Paquete[] {
  const out: Paquete[] = [];
  for (const m of texto.matchAll(/<PackageReference\b([^>]*?)(\/>|>([\s\S]*?)<\/PackageReference>)/gi)) {
    const attrs = m[1] ?? "";
    const nombre = /\bInclude\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
    const version = /\bVersion\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? /<Version>\s*([^<]+?)\s*<\/Version>/i.exec(m[3] ?? "")?.[1];
    if (nombre && version) out.push({ ecosistema: "NuGet", nombre, version: version.trim() });
  }
  return out;
}

/** Los `nombre==versión` de un `requirements*.txt`. Lo que no está fijado no tiene una versión que revisar. */
function dePypi(texto: string): Paquete[] {
  const out: Paquete[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*==\s*([0-9][0-9A-Za-z.+_-]*)\s*(?:#.*|;.*)?$/.exec(linea);
    if (m) out.push({ ecosistema: "PyPI", nombre: m[1]!.toLowerCase(), version: m[2]! });
  }
  return out;
}

/** Si un archivo es de los que el vigía lee. */
export const esArchivoDePaquetes = (nombre: string) => /^(package-lock\.json|requirements[\w.-]*\.txt)$|\.csproj$/i.test(nombre);

/**
 * Los paquetes con versión exacta de un proyecto, sin repetir, hasta el tope. Lo que no tiene la
 * forma de un nombre o una versión no entra: no sale nada que no sea eso. `fuera` dice qué se dejó.
 */
export function paquetesDe(archivos: readonly ArchivoLeido[]): { paquetes: Paquete[]; fuera: string[] } {
  const fuera = new Set<string>();
  const todos: Paquete[] = [];
  for (const a of archivos) {
    const nombre = a.ruta.split("/").at(-1) ?? a.ruta;
    if (/^package-lock\.json$/i.test(nombre)) todos.push(...deNpm(a.contenido, fuera));
    else if (/\.csproj$/i.test(nombre)) todos.push(...deNuget(a.contenido));
    else if (/^requirements[\w.-]*\.txt$/i.test(nombre)) todos.push(...dePypi(a.contenido));
  }
  const vistos = new Set<string>();
  const paquetes: Paquete[] = [];
  for (const p of todos) {
    if (!esPaqueteValido(p)) {
      fuera.add("con un nombre o una versión que no se entiende");
      continue;
    }
    const clave = `${p.ecosistema}:${p.nombre}@${p.version}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    paquetes.push(p);
  }
  if (paquetes.length > TOPE_DE_PAQUETES) fuera.add(`más de ${TOPE_DE_PAQUETES} (se revisaron los primeros)`);
  return { paquetes: paquetes.slice(0, TOPE_DE_PAQUETES), fuera: [...fuera] };
}

export const DIRECCION_DE_OSV = "https://api.osv.dev/v1/querybatch";

/** Lo que se le manda a OSV.dev: por cada paquete, su nombre, su ecosistema y su versión. Nada más. */
export const consultaParaOSV = (paquetes: readonly Paquete[]) => ({
  queries: paquetes.filter(esPaqueteValido).map((p) => ({ package: { name: p.nombre, ecosystem: p.ecosistema }, version: p.version })),
});

const ID_DE_VULNERABILIDAD = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,60}$/;

/**
 * Los paquetes con vulnerabilidades, según lo que contestó OSV.dev (en el mismo orden que la
 * consulta). De cada vulnerabilidad, solo su id: el texto que trae lo escribió otra persona.
 * `null` si la respuesta no tiene esa forma.
 */
export function vulnerablesSegunOSV(paquetes: readonly Paquete[], respuesta: unknown): { paquete: Paquete; ids: string[] }[] | null {
  const resultados = (respuesta as { results?: unknown } | null)?.results;
  if (!Array.isArray(resultados) || resultados.length !== paquetes.length) return null;
  const out: { paquete: Paquete; ids: string[] }[] = [];
  resultados.forEach((r, i) => {
    const vulns = (r as { vulns?: unknown } | null)?.vulns;
    const ids = Array.isArray(vulns) ? [...new Set(vulns.map((v) => (v as { id?: unknown })?.id).filter((id): id is string => typeof id === "string" && ID_DE_VULNERABILIDAD.test(id)))] : [];
    if (ids.length) out.push({ paquete: paquetes[i]!, ids });
  });
  return out;
}

/** Lo que dice el paso, una línea por paquete: qué versión y qué vulnerabilidades, con su dirección en OSV.dev. */
export const lineasDeVulnerables = (v: readonly { paquete: Paquete; ids: string[] }[]) =>
  v.map(({ paquete: p, ids }) => `${p.ecosistema} ${p.nombre} ${p.version}: ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? ` y ${ids.length - 5} más` : ""} (https://osv.dev/vulnerability/${ids[0]})`);
