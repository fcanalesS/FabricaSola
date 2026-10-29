import { esModeloDeRol, type ModeloDeRol } from "../fabrica/modelos.ts";
import { bajarTitulos } from "../fabrica/motor/requerimientos.ts";

/**
 * La petición que él escribe en el formulario de la Entrada: qué revisa lo que
 * llega y cómo se arma el pedido de la tarea. El texto es suyo, así que entra
 * tal cual, sin `citar()`: solo se bajan los títulos para que un `##` suyo no
 * corte la sección Pedido. Es lógica pura.
 */

export const LIMITES = { titulo: 80, que: 8000, criterio: 400, criterios: 20, fuera: 2000, archivos: 1000, dependeDe: 10 } as const;

export type Peticion = {
  linea: string;
  titulo: string;
  que: string;
  criterios: string[];
  fueraDeAlcance: string;
  archivos: string;
  dependeDe: string[];
  /** `cola`: entra a la línea como pendiente. `bandeja`: queda como borrador suyo en la Bandeja. */
  destino: "cola" | "bandeja";
  /** El issue de la Bandeja que él reescribe con sus palabras, si viene de ahí. Solo con destino `cola`. */
  desde?: number;
  /** Con qué modelo se escribe su spec, si él eligió uno para esta tarea. Sin él, el de la línea. Solo con destino `cola`. */
  modeloSpec?: ModeloDeRol;
  /** Con qué modelo se construye, si él eligió uno para esta tarea. Sin él, el de la línea, y Jev puede abaratarlo. Solo con destino `cola`. */
  modeloConstruccion?: ModeloDeRol;
  /** El lote de referencias que se agregó mientras se escribía: pasa a la tarea, o al borrador. */
  lote?: string;
};

export type CampoDePeticion = "linea" | "titulo" | "que" | "criterios" | "fueraDeAlcance" | "archivos" | "dependeDe" | "destino" | "modeloSpec" | "modeloConstruccion";

/** Lo de varias líneas: sin caracteres de control, salvo el salto y la tabulación. */
const varias = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[^\P{Cc}\n\t]/gu, "").trim() : "");
/** Lo de una línea: los saltos pasan a espacios. */
const una = (v: unknown) => varias(v).replace(/\s+/g, " ").trim();

/** Lo que llegó del formulario, revisado. Con algo mal, los errores por campo, para mostrarlos junto a cada uno. */
export function peticionDesde(dato: unknown): { peticion: Peticion } | { errores: Partial<Record<CampoDePeticion, string>> } {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  const errores: Partial<Record<CampoDePeticion, string>> = {};

  const linea = una(d.linea);
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(linea)) errores.linea = "Elige una línea.";

  const titulo = una(d.titulo);
  if (!titulo) errores.titulo = "Escribe un título.";
  else if (titulo.length > LIMITES.titulo) errores.titulo = `Hasta ${LIMITES.titulo} caracteres: es también el nombre de su rama.`;

  const que = varias(d.que);
  if (!que) errores.que = "Escribe qué necesitas.";
  else if (que.length > LIMITES.que) errores.que = `Hasta ${LIMITES.que} caracteres. Si es más, usa un documento de requerimientos.`;

  const crudos = Array.isArray(d.criterios) ? d.criterios : [];
  const criterios = crudos.map(una).filter(Boolean);
  if (crudos.length > LIMITES.criterios) errores.criterios = `Hasta ${LIMITES.criterios} criterios.`;
  else if (criterios.some((c) => c.length > LIMITES.criterio)) errores.criterios = `Cada criterio, hasta ${LIMITES.criterio} caracteres.`;

  const fueraDeAlcance = varias(d.fueraDeAlcance);
  if (fueraDeAlcance.length > LIMITES.fuera) errores.fueraDeAlcance = `Hasta ${LIMITES.fuera} caracteres.`;
  const archivos = varias(d.archivos);
  if (archivos.length > LIMITES.archivos) errores.archivos = `Hasta ${LIMITES.archivos} caracteres.`;

  const deps = Array.isArray(d.dependeDe) ? d.dependeDe.map(una).filter(Boolean) : [];
  if (deps.length > LIMITES.dependeDe || deps.some((x) => !/^F-\d{1,6}$/i.test(x))) errores.dependeDe = "Elige tareas de la lista.";
  const dependeDe = [...new Set(deps.map((x) => x.toUpperCase()))];

  const destino = d.destino === undefined ? "cola" : d.destino;
  if (destino !== "cola" && destino !== "bandeja") errores.destino = "Elige a dónde va.";

  // Los dos modelos, con la misma regla: uno de la lista, y solo al crear la tarea.
  const modelos: Partial<Record<"modeloSpec" | "modeloConstruccion", ModeloDeRol>> = {};
  for (const campo of ["modeloSpec", "modeloConstruccion"] as const) {
    const v = d[campo];
    if (v === undefined || v === null || v === "") continue;
    if (!esModeloDeRol(v)) errores[campo] = "Elige un modelo de la lista.";
    else if (destino === "bandeja") errores[campo] = "El modelo se elige al crear la tarea, no para un borrador.";
    else modelos[campo] = v;
  }

  if (Object.keys(errores).length) return { errores };
  const desde = destino === "cola" && Number.isInteger(d.desde) && (d.desde as number) > 0 ? (d.desde as number) : undefined;
  const lote = typeof d.lote === "string" && /^[a-f0-9]{32}$/.test(d.lote) ? d.lote : undefined;
  return { peticion: { linea, titulo, que, criterios, fueraDeAlcance, archivos, dependeDe, destino: destino as Peticion["destino"], ...(desde ? { desde } : {}), ...modelos, ...(lote ? { lote } : {}) } };
}

/** El pedido de la tarea, con las secciones que leen la spec y los revisores. */
export function pedidoDeLaPeticion(p: Pick<Peticion, "que" | "criterios" | "fueraDeAlcance" | "archivos">): string {
  const partes = [bajarTitulos(p.que)];
  if (p.criterios.length) partes.push(`### Criterios de aceptación\n\n${p.criterios.map((c, i) => `${i + 1}. ${bajarTitulos(c).replace(/^#+\s*/, "")}`).join("\n")}`);
  if (p.fueraDeAlcance) partes.push(`### Fuera de alcance\n\n${bajarTitulos(p.fueraDeAlcance)}`);
  if (p.archivos) partes.push(`### Archivos o zonas que toca\n\n${bajarTitulos(p.archivos)}`);
  partes.push("_Escrito por quien usa la fábrica, en su formulario._");
  return partes.join("\n\n");
}
