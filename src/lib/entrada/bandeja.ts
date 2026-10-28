import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/**
 * La Bandeja: lo que entra a la fábrica antes de volverse tarea. Issues que
 * trae el lector de las fuentes y borradores que él deja desde el formulario.
 * Nada sale de aquí a una línea sin su clic (`pasar.ts`), y descartar solo lo
 * saca de la Bandeja: en el origen no se cambia nada. Solo para el servidor.
 */

export type EstadoEnBandeja = "nuevo" | "pasado" | "descartado" | "cambio";

export type ElementoDeBandeja = {
  id: number;
  /** La fuente de donde vino; `null`: un borrador del formulario. */
  fuente: number | null;
  /** En el origen: `dueno/repo#132`. Para un borrador, `borrador`. */
  ref: string;
  repo: string | null;
  /** La línea a la que va: la de su repositorio, o la que eligió él. */
  linea: string | null;
  titulo: string;
  texto: string;
  autor: string | null;
  /** Si lo escribió él: un borrador suyo, o un issue que abrió él. */
  esSuyo: boolean;
  etiquetas: string[];
  creado: string | null;
  cambiado: string | null;
  estado: EstadoEnBandeja;
  /** La tarea en que se convirtió, y en qué línea. */
  tarea: string | null;
  lineaTarea: string | null;
  textoPasado: string | null;
  llegado: number;
};

/** Un issue como lo trae un proveedor, antes de entrar a la Bandeja. */
export type IssueLeido = { ref: string; repo: string; titulo: string; texto: string; autor: string; etiquetas: string[]; creado: string; cambiado: string };

/** Lo que entra a la base, para que un issue enorme no la llene. */
export const TEXTO_MAX = 20_000;
const TITULO_MAX = 300;

export const huellaDe = (titulo: string, texto: string) => createHash("sha256").update(`${titulo}\n${texto}`).digest("hex").slice(0, 32);

type Fila = Record<string, unknown>;
const tal = (v: unknown) => (v === null || v === undefined ? null : String(v));
const desdeFila = (f: Fila): ElementoDeBandeja => ({
  id: Number(f.id),
  fuente: f.fuente === null ? null : Number(f.fuente),
  ref: String(f.ref),
  repo: tal(f.repo),
  linea: tal(f.linea),
  titulo: String(f.titulo),
  texto: String(f.texto),
  autor: tal(f.autor),
  esSuyo: Number(f.es_suyo) === 1,
  etiquetas: String(f.etiquetas ?? "")
    .split(",")
    .filter(Boolean),
  creado: tal(f.creado),
  cambiado: tal(f.cambiado),
  estado: (["nuevo", "pasado", "descartado", "cambio"] as const).find((e) => e === f.estado) ?? "nuevo",
  tarea: tal(f.tarea),
  lineaTarea: tal(f.linea_tarea),
  textoPasado: tal(f.texto_pasado),
  llegado: Number(f.llegado),
});

export function elemento(db: DatabaseSync, id: number): ElementoDeBandeja | null {
  const f = db.prepare("select * from bandeja where id = ?").get(id);
  return f ? desdeFila(f as Fila) : null;
}

/** Los elementos en ese estado (o todos), lo último que llegó primero. */
export function elementos(db: DatabaseSync, estado?: EstadoEnBandeja | "abiertos"): ElementoDeBandeja[] {
  const filas =
    estado === "abiertos"
      ? db.prepare("select * from bandeja where estado in ('nuevo', 'cambio') order by llegado desc, id desc").all()
      : estado
        ? db.prepare("select * from bandeja where estado = ? order by llegado desc, id desc").all(estado)
        : db.prepare("select * from bandeja order by llegado desc, id desc").all();
  return filas.map((f) => desdeFila(f as Fila));
}

/** Cuántos hay en cada estado, para las pestañas. */
export function cuentas(db: DatabaseSync): Record<EstadoEnBandeja, number> {
  const c: Record<EstadoEnBandeja, number> = { nuevo: 0, pasado: 0, descartado: 0, cambio: 0 };
  for (const f of db.prepare("select estado, count(*) as n from bandeja group by estado").all() as Fila[]) {
    const e = String(f.estado) as EstadoEnBandeja;
    if (e in c) c[e] = Number(f.n);
  }
  return c;
}

const recortar = (t: string, max: number) => (t.length > max ? `${t.slice(0, max)}…` : t);

/**
 * Un issue que trajo el lector. Nuevo: entra como `nuevo`. Ya visto y sin cambios: nada. Si
 * cambió y todavía no pasó a una línea, se actualiza en su lugar. Si ya pasó y su texto cambió,
 * vuelve como `cambio`, con el texto de cuando pasó guardado para ver qué se agregó.
 */
export function recibirIssue(db: DatabaseSync, fuente: number, issue: IssueLeido, datos: { linea: string; esSuyo: boolean; ahora: number }): "nuevo" | "igual" | "actualizado" | "cambio" {
  const titulo = recortar(issue.titulo.replace(/\s+/g, " ").trim(), TITULO_MAX) || issue.ref;
  const texto = recortar(issue.texto.replace(/\r\n?/g, "\n").trim(), TEXTO_MAX);
  const huella = huellaDe(titulo, texto);
  const ya = db.prepare("select * from bandeja where fuente = ? and ref = ?").get(fuente, issue.ref) as Fila | undefined;
  if (!ya) {
    db.prepare(
      "insert into bandeja (fuente, ref, repo, linea, titulo, texto, autor, es_suyo, etiquetas, creado, cambiado, huella, estado, llegado) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nuevo', ?)",
    ).run(fuente, issue.ref, issue.repo, datos.linea, titulo, texto, issue.autor, datos.esSuyo ? 1 : 0, issue.etiquetas.join(","), issue.creado, issue.cambiado, huella, datos.ahora);
    return "nuevo";
  }
  if (String(ya.huella) === huella) return "igual";
  const pasado = ya.estado === "pasado" || ya.estado === "cambio";
  const estado = pasado ? "cambio" : String(ya.estado);
  db.prepare("update bandeja set titulo = ?, texto = ?, huella = ?, cambiado = ?, etiquetas = ?, estado = ? where id = ?").run(titulo, texto, huella, issue.cambiado, issue.etiquetas.join(","), estado, Number(ya.id));
  return pasado ? "cambio" : "actualizado";
}

/** Un borrador del formulario: suyo, con el pedido ya armado y la línea que eligió. */
export function guardarBorrador(db: DatabaseSync, datos: { linea: string; titulo: string; pedido: string; ahora: number }): number {
  const r = db
    .prepare("insert into bandeja (fuente, ref, linea, titulo, texto, es_suyo, huella, estado, llegado) values (null, 'borrador', ?, ?, ?, 1, ?, 'nuevo', ?)")
    .run(datos.linea, datos.titulo, datos.pedido, huellaDe(datos.titulo, datos.pedido), datos.ahora);
  return Number(r.lastInsertRowid);
}

/**
 * El pedido que deja un proceso de la fábrica cuando falla un paso con `si falla: tarea`. Sin
 * fuente y **no suyo**: lo escribió una máquina con lo que dijo un comando, así que antes de pasar
 * a una línea se revisa como el issue de otra persona. Si ya hay uno abierto de ese mismo proceso,
 * no se deja otro: `null`.
 */
export function dejarPedidoDeUnProceso(db: DatabaseSync, datos: { ref: string; linea: string; proceso: string; titulo: string; texto: string; ahora: number }): number | null {
  const prefijo = `proceso:${datos.linea}/${datos.proceso}/`;
  const abierto = db.prepare("select id from bandeja where fuente is null and estado = 'nuevo' and substr(ref, 1, ?) = ?").get(prefijo.length, prefijo);
  if (abierto) return null;
  const titulo = recortar(datos.titulo.replace(/\s+/g, " ").trim(), TITULO_MAX);
  const texto = recortar(datos.texto.replace(/\r\n?/g, "\n").trim(), TEXTO_MAX);
  const r = db
    .prepare("insert into bandeja (fuente, ref, linea, titulo, texto, autor, es_suyo, huella, estado, llegado) values (null, ?, ?, ?, ?, 'la fábrica', 0, ?, 'nuevo', ?)")
    .run(datos.ref, datos.linea, titulo, texto, huellaDe(titulo, texto), datos.ahora);
  return Number(r.lastInsertRowid);
}

/** Pasó a una línea: queda anotada la tarea y el texto de ese momento. */
export function marcarPasado(db: DatabaseSync, id: number, datos: { tarea: string; linea: string }): void {
  db.prepare("update bandeja set estado = 'pasado', tarea = ?, linea_tarea = ?, texto_pasado = texto where id = ?").run(datos.tarea, datos.linea, id);
}

/** Descartar solo lo saca de la Bandeja. El issue sigue como estaba en su servicio. */
export function descartar(db: DatabaseSync, id: number): void {
  const e = elemento(db, id);
  if (!e) throw new Error("Eso ya no está en la Bandeja.");
  if (e.estado !== "nuevo") throw new Error("Solo se descarta lo que todavía no pasó a una línea.");
  db.prepare("update bandeja set estado = 'descartado' where id = ?").run(id);
}

/** Un cambio en el origen que no merece tarea: se da por visto. */
export function ignorarCambio(db: DatabaseSync, id: number): void {
  const e = elemento(db, id);
  if (!e || e.estado !== "cambio") throw new Error("Ese cambio ya no está en la Bandeja.");
  db.prepare("update bandeja set estado = 'pasado', texto_pasado = texto where id = ?").run(id);
}

/** Las líneas que se agregaron al texto: las que están ahora y no estaban antes. Es lógica pura. */
export function loAgregado(antes: string, ahora: string): string {
  const previas = new Set(antes.split("\n").map((l) => l.trim()));
  return ahora
    .split("\n")
    .filter((l) => l.trim() && !previas.has(l.trim()))
    .join("\n")
    .trim();
}
