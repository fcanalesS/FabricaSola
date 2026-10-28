import type { DatabaseSync } from "node:sqlite";

/**
 * Las fuentes de la Entrada: de dónde trae issues la fábrica. Solo para el servidor.
 *
 * El token de cada una vive en `.env.local`, y lo cambia él a mano: aquí se
 * guarda solo el **nombre** de su variable. Lo decidió él el 26 de octubre de
 * 2026. De un token solo se sabe si está; si el servicio lo rechaza, lo dice el
 * lector al leer.
 *
 * Las guardias van aquí, pegadas a quien lee `process.env`:
 *  - El nombre tiene que ser `COMPANIA_FUENTE_<NOMBRE>_TOKEN`. Sin eso, una
 *    conexión podría apuntar a una clave de IA y mandarla a un servidor
 *    cualquiera: la dirección de un servidor propio la escribe él.
 *  - Dos conexiones no usan la misma variable.
 *  - El valor solo lo lee `tokenDe`, que usa el lector para armar el pedido.
 *    Ninguna vista, ruta ni registro lo trae.
 *  - Un servidor propio va por `https://`, sin usuario ni clave en la dirección.
 */

export const PROVEEDORES = ["github", "gitlab"] as const;
export type Proveedor = (typeof PROVEEDORES)[number];
export const NOMBRE_DEL_PROVEEDOR: Record<Proveedor, string> = { github: "GitHub", gitlab: "GitLab" };

/** Qué issues entran: los que abrió él con la etiqueta, cualquiera con la etiqueta, o todos los abiertos. */
export const REGLAS = ["suyos", "etiqueta", "todos"] as const;
export type Regla = (typeof REGLAS)[number];

/** Cada cuántos minutos lee. `0`: solo con «Traer ahora». */
export const CADA_MIN = [5, 15, 60, 0] as const;

export type RepoALinea = { repo: string; linea: string };

/** El estado guardado: lo pone el lector. `falta_token` y `apagada` se ven al armar la vista. */
export type EstadoLeido = "sin_leer" | "listo" | "rechazado" | "sin_respuesta";
export type EstadoDeFuente = EstadoLeido | "falta_token" | "apagada";

export type Fuente = {
  id: number;
  proveedor: Proveedor;
  /** `null`: el servicio público (github.com, gitlab.com). */
  servidor: string | null;
  nombre: string;
  variable: string;
  encendida: boolean;
  regla: Regla;
  etiqueta: string;
  cadaMin: number;
  repos: RepoALinea[];
  estado: EstadoLeido;
  motivo: string | null;
  leida: number | null;
  /** Su nombre en el servicio, para la regla «suyos». Lo trae el lector. */
  usuario: string | null;
  /** El estado del que ya se avisó, para no repetirlo. */
  avisada: string | null;
};

/** Lo que ven las pantallas y las rutas: nunca el token. */
export type FuenteALaVista = Omit<Fuente, "estado" | "avisada"> & { estado: EstadoDeFuente; tieneToken: boolean };

const VARIABLE = /^COMPANIA_FUENTE_[A-Z0-9][A-Z0-9_]{0,60}_TOKEN$/;
export const esVariableDeFuente = (nombre: string): boolean => VARIABLE.test(nombre);

/** Los nombres de las variables de fuente que existen en el entorno: solo nombres, nunca valores. */
export function variablesDeFuente(entorno: Record<string, string | undefined> = process.env): string[] {
  return Object.keys(entorno)
    .filter((k) => esVariableDeFuente(k) && !!entorno[k]?.trim())
    .sort();
}

/**
 * El token de una fuente, para armar el pedido al servicio. Es lo único que lee el valor, y vuelve
 * a mirar el nombre: una fila cambiada a mano en la base tampoco puede apuntar a otra clave.
 */
export function tokenDe(f: Pick<Fuente, "variable">, entorno: Record<string, string | undefined> = process.env): string | null {
  if (!esVariableDeFuente(f.variable)) return null;
  return entorno[f.variable]?.trim() || null;
}

type Fila = Record<string, unknown>;
const desdeFila = (f: Fila): Fuente => ({
  id: Number(f.id),
  proveedor: (PROVEEDORES as readonly string[]).includes(String(f.proveedor)) ? (f.proveedor as Proveedor) : "github",
  servidor: f.servidor === null ? null : String(f.servidor),
  nombre: String(f.nombre),
  variable: String(f.variable),
  encendida: Number(f.encendida) === 1,
  regla: (REGLAS as readonly string[]).includes(String(f.regla)) ? (f.regla as Regla) : "suyos",
  etiqueta: String(f.etiqueta),
  cadaMin: Number(f.cada_min),
  repos: reposDe(f.repos),
  estado: (["sin_leer", "listo", "rechazado", "sin_respuesta"] as const).find((e) => e === f.estado) ?? "sin_leer",
  motivo: f.motivo === null ? null : String(f.motivo),
  leida: f.leida === null ? null : Number(f.leida),
  usuario: f.usuario === null ? null : String(f.usuario),
  avisada: f.avisada === null ? null : String(f.avisada),
});

function reposDe(guardado: unknown): RepoALinea[] {
  try {
    const v = JSON.parse(String(guardado)) as unknown;
    return Array.isArray(v) ? v.filter((x): x is RepoALinea => !!x && typeof x.repo === "string" && typeof x.linea === "string") : [];
  } catch {
    return [];
  }
}

export function fuentes(db: DatabaseSync): Fuente[] {
  return db.prepare("select * from fuentes order by id").all().map((f) => desdeFila(f as Fila));
}

export function fuente(db: DatabaseSync, id: number): Fuente | null {
  const f = db.prepare("select * from fuentes where id = ?").get(id);
  return f ? desdeFila(f as Fila) : null;
}

/** El estado que se ve: apagada, sin token, o lo último que dijo el lector. */
export function estadoDe(f: Fuente, entorno: Record<string, string | undefined> = process.env): EstadoDeFuente {
  if (!f.encendida) return "apagada";
  if (!tokenDe(f, entorno)) return "falta_token";
  return f.estado;
}

export function vistaDeFuente(f: Fuente, entorno: Record<string, string | undefined> = process.env): FuenteALaVista {
  const resto: Omit<Fuente, "estado" | "avisada"> & Partial<Pick<Fuente, "estado" | "avisada">> = { ...f };
  delete resto.estado;
  delete resto.avisada;
  return { ...resto, estado: estadoDe(f, entorno), tieneToken: !!tokenDe(f, entorno) };
}

export const vistaDeFuentes = (db: DatabaseSync, entorno: Record<string, string | undefined> = process.env) => fuentes(db).map((f) => vistaDeFuente(f, entorno));

/** La dirección de un servidor propio, revisada: `https://`, sin usuario, clave, consulta ni fragmento. */
export function servidorDesde(texto: string): string {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    throw new Error("La dirección del servidor no es válida.");
  }
  if (url.protocol !== "https:") throw new Error("El servidor tiene que ser https://.");
  if (url.username || url.password) throw new Error("La dirección no puede llevar usuario ni clave: el token va en .env.local.");
  if (url.search || url.hash) throw new Error("La dirección del servidor va sin «?» ni «#».");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

const REPO: Record<Proveedor, RegExp> = {
  github: /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/,
  // En GitLab un proyecto puede estar dentro de grupos y subgrupos.
  gitlab: /^[A-Za-z0-9_.-]{1,100}(\/[A-Za-z0-9_.-]{1,100}){1,6}$/,
};

/** Los repositorios y su línea, revisados. Un repositorio va a una sola línea, y la línea tiene que existir. */
export function reposDesde(proveedor: Proveedor, dato: unknown, lineas: readonly string[]): RepoALinea[] {
  if (!Array.isArray(dato) || dato.length > 30) throw new Error("Los repositorios van en una lista de hasta 30.");
  const vistos = new Set<string>();
  return dato.map((x) => {
    const repo: string = typeof x?.repo === "string" ? x.repo.trim().replace(/^\/+|\/+$/g, "") : "";
    const linea: string = typeof x?.linea === "string" ? x.linea : "";
    if (!REPO[proveedor].test(repo) || repo.split("/").some((p) => p === "." || p === "..")) throw new Error(`«${repo.slice(0, 120)}» no es un repositorio (dueño/nombre).`);
    if (!lineas.includes(linea)) throw new Error(`No hay ninguna línea «${linea.slice(0, 40)}».`);
    if (vistos.has(repo.toLowerCase())) throw new Error(`«${repo}» está dos veces.`);
    vistos.add(repo.toLowerCase());
    return { repo, linea };
  });
}

export type DatosDeFuente = {
  proveedor: Proveedor;
  servidor: string | null;
  nombre: string;
  variable: string;
  regla: Regla;
  etiqueta: string;
  cadaMin: number;
  repos: RepoALinea[];
};

/** Lo que llega para crear o cambiar una fuente, revisado. Lanza con un mensaje que se puede mostrar. */
export function datosDeFuente(dato: unknown, lineas: readonly string[]): DatosDeFuente {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  const proveedor = d.proveedor;
  if (!(PROVEEDORES as readonly unknown[]).includes(proveedor)) throw new Error("Elige GitHub o GitLab.");
  const servidor = typeof d.servidor === "string" && d.servidor.trim() ? servidorDesde(d.servidor) : null;
  const nombre = typeof d.nombre === "string" ? d.nombre.replace(/\s+/g, " ").trim() : "";
  if (!nombre || nombre.length > 60) throw new Error("La conexión necesita un nombre, de hasta 60 caracteres.");
  const variable = typeof d.variable === "string" ? d.variable.trim() : "";
  if (!esVariableDeFuente(variable)) throw new Error("La variable tiene que llamarse COMPANIA_FUENTE_<NOMBRE>_TOKEN: así ninguna conexión usa una clave de IA.");
  const regla = d.regla ?? "suyos";
  if (!(REGLAS as readonly unknown[]).includes(regla)) throw new Error("Elige qué issues entran.");
  const etiqueta = typeof d.etiqueta === "string" ? d.etiqueta.trim() : "";
  if (regla !== "todos" && (!etiqueta || etiqueta.length > 50 || /[,\p{Cc}]/u.test(etiqueta))) throw new Error("Escribe la etiqueta, sin comas.");
  const cadaMin = d.cadaMin === undefined ? 5 : Number(d.cadaMin);
  if (!(CADA_MIN as readonly number[]).includes(cadaMin)) throw new Error("Cada cuánto lee: 5, 15 o 60 minutos, o solo a pedido.");
  const repos = reposDesde(proveedor as Proveedor, d.repos ?? [], lineas);
  return { proveedor: proveedor as Proveedor, servidor, nombre, variable, regla: regla as Regla, etiqueta, cadaMin, repos };
}

export function agregarFuente(db: DatabaseSync, d: DatosDeFuente): Fuente {
  if (fuentes(db).some((f) => f.variable === d.variable)) throw new Error(`${d.variable} ya la usa otra conexión.`);
  const r = db
    .prepare("insert into fuentes (proveedor, servidor, nombre, variable, regla, etiqueta, cada_min, repos) values (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(d.proveedor, d.servidor, d.nombre, d.variable, d.regla, d.etiqueta, d.cadaMin, JSON.stringify(d.repos));
  return fuente(db, Number(r.lastInsertRowid))!;
}

/** Cambia una fuente. Si cambian su variable o su servidor, vuelve a «sin leer»: lo que dijo el lector era de otro token. */
export function cambiarFuente(db: DatabaseSync, id: number, d: DatosDeFuente): Fuente {
  const antes = fuente(db, id);
  if (!antes) throw new Error("Esa conexión ya no existe.");
  if (fuentes(db).some((f) => f.id !== id && f.variable === d.variable)) throw new Error(`${d.variable} ya la usa otra conexión.`);
  const otra = antes.variable !== d.variable || antes.servidor !== d.servidor || antes.proveedor !== d.proveedor;
  db.prepare("update fuentes set proveedor = ?, servidor = ?, nombre = ?, variable = ?, regla = ?, etiqueta = ?, cada_min = ?, repos = ? where id = ?").run(
    d.proveedor,
    d.servidor,
    d.nombre,
    d.variable,
    d.regla,
    d.etiqueta,
    d.cadaMin,
    JSON.stringify(d.repos),
    id,
  );
  if (otra) db.prepare("update fuentes set estado = 'sin_leer', motivo = null, usuario = null, avisada = null where id = ?").run(id);
  return fuente(db, id)!;
}

export function encenderFuente(db: DatabaseSync, id: number, encendida: boolean): void {
  if (!fuente(db, id)) throw new Error("Esa conexión ya no existe.");
  db.prepare("update fuentes set encendida = ? where id = ?").run(encendida ? 1 : 0, id);
}

/** Quita la conexión. Lo que trajo y ya está en la Bandeja se queda: es de él. */
export function quitarFuente(db: DatabaseSync, id: number): void {
  db.prepare("delete from fuentes where id = ?").run(id);
}

/** «Ya lo cambié»: una fuente rechazada vuelve a intentar en la vuelta siguiente. */
export function reintentarFuente(db: DatabaseSync, id: number): void {
  db.prepare("update fuentes set estado = 'sin_leer', motivo = null where id = ? and estado in ('rechazado', 'sin_respuesta')").run(id);
}

/** Lo que dijo el lector de una fuente. */
export function anotarLectura(db: DatabaseSync, id: number, datos: { estado: EstadoLeido; motivo?: string | null; usuario?: string | null; ahora: number }): void {
  db.prepare("update fuentes set estado = ?, motivo = ?, leida = ?, usuario = coalesce(?, usuario) where id = ?").run(datos.estado, datos.motivo ?? null, datos.ahora, datos.usuario ?? null, id);
}

/** Anota de qué estado ya se avisó, para no repetirlo. */
export function anotarAviso(db: DatabaseSync, id: number, estado: string | null): void {
  db.prepare("update fuentes set avisada = ? where id = ?").run(estado, id);
}
