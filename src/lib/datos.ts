import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Los datos de la fábrica en este equipo: la carpeta `datos/` en la raíz del programa, con los
 * ajustes, las corridas, los registros de los procesos, el vault de la planta y una base SQLite
 * (con el módulo que trae Node y sin ORM) para la Entrada. No entra al repositorio. Solo para el
 * servidor.
 *
 * El esquema crece por migraciones: cada una se aplica una sola vez y en orden, y `user_version`
 * dice por cuál va. Una migración ya aplicada no se edita: se agrega otra.
 */

const MIGRACIONES = [
  `
  -- La Entrada de la fábrica. De dónde lee: el token no se guarda aquí, solo
  -- el nombre de su variable en .env.local. El estado lo pone el lector al leer.
  create table fuentes (
    id integer primary key,
    proveedor text not null,
    servidor text,
    nombre text not null,
    variable text not null unique,
    encendida integer not null default 1,
    regla text not null default 'suyos',
    etiqueta text not null default 'fabrica',
    cada_min integer not null default 5,
    repos text not null default '[]',
    estado text not null default 'sin_leer',
    motivo text,
    leida integer,
    usuario text,
    avisada text
  );

  -- Lo que entra antes de volverse tarea: issues de las fuentes y borradores
  -- del formulario (sin fuente). «texto_pasado» es el texto cuando se pasó a
  -- una línea, para ver después qué cambió en el origen.
  create table bandeja (
    id integer primary key,
    fuente integer,
    ref text not null,
    repo text,
    linea text,
    titulo text not null,
    texto text not null,
    autor text,
    es_suyo integer not null default 0,
    etiquetas text not null default '',
    creado text,
    cambiado text,
    huella text not null,
    estado text not null default 'nuevo',
    tarea text,
    linea_tarea text,
    texto_pasado text,
    llegado integer not null,
    unique (fuente, ref)
  );
  `,
];

/** Aplica las migraciones que le falten a una base. Las ya hechas no se repiten. */
export function ponerAlDia(db: DatabaseSync, migraciones: string[]): void {
  const hechas = Number(db.prepare("pragma user_version").get()?.user_version ?? 0);
  for (let i = hechas; i < migraciones.length; i++) {
    db.exec("begin");
    try {
      db.exec(migraciones[i]);
      db.exec(`pragma user_version = ${i + 1}`);
      db.exec("commit");
    } catch (e) {
      db.exec("rollback");
      throw e;
    }
  }
}

/** Abre la base de la fábrica en una ruta y la deja al día. `:memory:` sirve para las pruebas. */
export function abrirBaseDeDatos(ruta: string): DatabaseSync {
  if (ruta !== ":memory:") mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec("pragma journal_mode = wal; pragma foreign_keys = on;");
  ponerAlDia(db, MIGRACIONES);
  return db;
}

// En `globalThis` para que la recarga de módulos de desarrollo no abra la misma base dos veces.
const abiertas = ((globalThis as { __basesDeDatos?: Map<string, DatabaseSync> }).__basesDeDatos ??= new Map());

const raiz = () => /*turbopackIgnore: true*/ process.cwd();

/** La carpeta de los datos de la fábrica en este equipo. */
export function carpetaDeDatos(): string {
  return path.join(raiz(), "datos");
}

// Las bases que este módulo ya revisó. No va en `globalThis` a propósito: una recarga de desarrollo
// puede traer una migración nueva, y la base abierta desde antes se quedaría sin ella.
const alDia = new WeakSet<DatabaseSync>();

/** La base de la fábrica en este equipo, abierta una sola vez. */
export function baseDeDatos(): DatabaseSync {
  const ruta = path.join(carpetaDeDatos(), "fabrica.db");
  let db = abiertas.get(ruta);
  if (!db) abiertas.set(ruta, (db = abrirBaseDeDatos(ruta)));
  else if (!alDia.has(db)) ponerAlDia(db, MIGRACIONES);
  alDia.add(db);
  return db;
}
