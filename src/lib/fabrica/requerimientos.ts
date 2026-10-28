/**
 * La vista previa de un documento de requerimientos: qué tareas va a crear la
 * fábrica con él. Sigue la misma regla que el motor
 * (`motor/requerimientos.ts`): una tarea
 * por cada sección `## `, o una sola si no hay secciones o él la pide así. Es
 * solo para mostrar: las tareas las corta y las crea el motor. Es
 * lógica pura, y sirve en la página.
 */
import { dependenciasDeLaSeccion } from "./motor/requerimientos.ts";

/** `dependeDe`: lo que dice su `### Depende de`, con la misma regla del motor (que es lógica pura). */
export type TareaPropuesta = { titulo: string; resumen: string; dependeDe: string[] };

const limpiarTitulo = (t: string) =>
  t
    .replace(/^#+\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

/** El título del documento: el `# ` del principio, o su primera línea con texto. */
export function tituloDelDocumento(texto: string): string {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const h1 = lineas.find((l) => /^#\s+\S/.test(l));
  const primera = lineas.find((l) => l.trim());
  return limpiarTitulo(h1 ?? primera ?? "") || "Requerimientos";
}

/** La primera línea con texto de un trozo, sin marcas de título. */
const primeraLinea = (trozo: string) => limpiarTitulo(trozo.split("\n").find((l) => l.trim() && !/^#/.test(l.trim())) ?? "");

/** Las tareas que saldrían del documento, con su título y la primera línea de lo que piden. */
export function tareasPropuestas(texto: string, opciones: { porSeccion: boolean; titulo?: string }): TareaPropuesta[] {
  const t = texto.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  const tituloDoc = opciones.titulo?.trim() || tituloDelDocumento(t);
  const partes = t.split(/^(?=##\s+\S)/m);
  const tieneSecciones = partes.length > 1 || /^##\s+\S/.test(partes[0] ?? "");
  if (!opciones.porSeccion || !tieneSecciones) return [{ titulo: tituloDoc, resumen: primeraLinea(t), dependeDe: dependenciasDeLaSeccion(t) }];
  // Lo que va antes de la primera sección es contexto: viaja con cada tarea, pero no es una.
  if (!/^##\s/.test(partes[0] ?? "")) partes.shift();
  return partes
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [cabeza = "", ...resto] = p.split("\n");
      return { titulo: limpiarTitulo(cabeza), resumen: primeraLinea(resto.join("\n")), dependeDe: dependenciasDeLaSeccion(resto.join("\n")) };
    });
}
