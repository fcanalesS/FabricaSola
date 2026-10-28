import type { DatabaseSync } from "node:sqlite";
import { crearTareaEn, TITULO_MAX } from "../fabrica/motor/proyecto.ts";
import { bajarTitulos } from "../fabrica/motor/requerimientos.ts";
import { esPedidoDeUnProceso } from "../fabrica/procesos/ejecucion.ts";
import { citar } from "../texto/citas.ts";
import { traeInstrucciones } from "../texto/instrucciones.ts";
import { elemento, loAgregado, marcarPasado, type ElementoDeBandeja } from "./bandeja.ts";
import { fuente, NOMBRE_DEL_PROVEEDOR } from "./fuentes.ts";

/**
 * Pasar algo de la Bandeja a una línea: es donde texto de afuera se vuelve el
 * pedido de una tarea que los agentes van a construir. Solo con un clic suyo,
 * y con la guardia aquí, pegada a lo que protege:
 *
 *  - Un borrador del formulario es suyo: su pedido va tal cual.
 *  - Lo que deja un proceso que falló lo escribió una máquina: se revisa como
 *    el issue de otra persona.
 *  - Un issue que abrió él entra entre « », con `citar()`, y su referencia.
 *  - Un issue de otra persona se revisa antes (`traeInstrucciones`). Si le
 *    habla a un asistente, o nadie lo pudo revisar, **no pasa**, ni recortado:
 *    lo que queda es que él lo reescriba con sus palabras en el formulario.
 *    Lo decidió él el 26 de octubre de 2026: Jev puede leer ese texto.
 *  - Si él no cambió el título de un issue de otra persona, la tarea queda con
 *    `titulo_ajeno`, y lo que habla en voz alta dice solo su id.
 *
 * Solo para el servidor.
 */

const sinEspacios = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

/** De dónde vino, para el pie del pedido y `origen_entrada`. */
export function origenDe(db: DatabaseSync, e: ElementoDeBandeja): { pie: string; origen: string } {
  if (e.fuente === null && esPedidoDeUnProceso(e.ref)) return { pie: `_Lo dejó la fábrica al fallar un proceso: ${e.ref.slice("proceso:".length)}._`, origen: e.ref };
  const f = e.fuente === null ? null : fuente(db, e.fuente);
  const servicio = f ? NOMBRE_DEL_PROVEEDOR[f.proveedor] : "un servicio";
  return { pie: `_Issue: ${servicio} ${e.ref}${e.autor ? `, abierto por ${e.autor}` : ""}._`, origen: `${f?.proveedor ?? "fuente"}:${e.ref}` };
}

/** El texto de otra persona, revisado. Lanza con un mensaje que él puede leer. */
async function revisarTextoAjeno(texto: string): Promise<void> {
  const trae = await traeInstrucciones(texto);
  if (trae === true) throw new Error("Trae una instrucción para agentes: no pasa tal cual. Reescríbelo con tus palabras o descártalo.");
  if (trae === null) throw new Error("Nadie pudo revisar el texto: no pasa tal cual. Reescríbelo con tus palabras, o prueba de nuevo en un rato.");
}

export async function pasarALinea(db: DatabaseSync, id: number, datos: { linea: string; titulo: string; dependeDe?: readonly string[] }) {
  const e = elemento(db, id);
  if (!e) throw new Error("Eso ya no está en la Bandeja.");
  if (e.estado !== "nuevo") throw new Error("Eso ya pasó a una línea o se descartó.");
  const titulo = datos.titulo.replace(/\s+/g, " ").trim().slice(0, TITULO_MAX);

  let creada: { linea: string; id: string; titulo: string };
  // Sin fuente y suyo: un borrador del formulario. Sin fuente y no suyo: lo dejó un proceso, y se revisa.
  if (e.fuente === null && e.esSuyo) {
    creada = await crearTareaEn(datos.linea, { titulo, pedido: e.texto, dependeDe: datos.dependeDe, origenEntrada: "formulario" }, "la aplicación de compañía, desde el formulario");
  } else {
    if (!e.esSuyo) await revisarTextoAjeno(`${e.titulo}\n${e.texto}`);
    const { pie, origen } = origenDe(db, e);
    const pedido = `${citar(bajarTitulos(e.texto) || e.titulo)}\n\n${pie}`;
    const tituloAjeno = !e.esSuyo && sinEspacios(titulo) === sinEspacios(e.titulo);
    creada = await crearTareaEn(datos.linea, { titulo, pedido, dependeDe: datos.dependeDe, origenEntrada: origen, tituloAjeno }, "la aplicación de compañía, desde la Bandeja");
  }
  marcarPasado(db, id, { tarea: creada.id, linea: creada.linea });
  return creada;
}

/**
 * Un issue que cambió después de volverse tarea. La tarea en curso no se toca (el contrato del
 * plugin no deja cambiar una que existe): lo agregado entra como otra tarea, que espera a la primera.
 */
export async function crearTareaDelCambio(db: DatabaseSync, id: number) {
  const e = elemento(db, id);
  if (!e || e.estado !== "cambio") throw new Error("Ese cambio ya no está en la Bandeja.");
  if (!e.tarea || !e.lineaTarea) throw new Error("No se sabe a qué tarea fue.");
  const agregado = loAgregado(e.textoPasado ?? "", e.texto);
  if (!agregado) throw new Error("No se agregó nada: solo se cambió o quitó texto. Dalo por visto.");
  if (!e.esSuyo) await revisarTextoAjeno(agregado);
  const { pie, origen } = origenDe(db, e);
  const base = e.esSuyo ? e.titulo : e.tarea;
  const titulo = `${base} (cambio)`.length > TITULO_MAX ? `${base.slice(0, TITULO_MAX - 10).trim()} (cambio)` : `${base} (cambio)`;
  const pedido = `Lo que se agregó al issue después de que pasó a ${e.tarea}:\n\n${citar(bajarTitulos(agregado))}\n\n${pie}`;
  const creada = await crearTareaEn(e.lineaTarea, { titulo, pedido, dependeDe: [e.tarea], origenEntrada: origen }, "la aplicación de compañía, desde la Bandeja");
  // Queda visto: el texto de ahora es el de referencia para el próximo cambio.
  db.prepare("update bandeja set estado = 'pasado', texto_pasado = texto where id = ?").run(id);
  return creada;
}
