/**
 * Qué se ve en la página de configuración según lo que dice su dirección
 * después de «#»: una sección a la vez y, en la de la fábrica, una de sus
 * partes. Así se llega directo a una, y atrás vuelve a la anterior. Es
 * lógica pura.
 */

/** Las partes de la sección de la fábrica, en el orden en que se muestran. */
export const PARTES_DE_LA_FABRICA = [
  { id: "proyecto", nombre: "Proyecto" },
  { id: "agentes", nombre: "Agentes y modelos" },
  { id: "gasto", nombre: "Gasto" },
  { id: "tareas", nombre: "Tareas" },
  { id: "avisos", nombre: "Avisos" },
  { id: "portada", nombre: "Portada" },
] as const;
export type ParteDeLaFabrica = (typeof PARTES_DE_LA_FABRICA)[number]["id"];

/**
 * Qué sección se ve: la que nombra la dirección, o la de la fábrica si nombra una de sus partes
 * («fabrica-agentes», o «comandos», que viene del tablero). Si no nombra ninguna que exista, la
 * primera.
 */
export function seccionDe(parte: string, validas: readonly string[]): string {
  const de = parte === "comandos" || parte.startsWith("fabrica-") ? "fabrica" : parte;
  return validas.includes(de) ? de : validas[0]!;
}

/** Qué parte de la fábrica se ve: «fabrica-agentes» es la de agentes; «comandos» y lo demás, la del proyecto. */
export function parteDeLaFabrica(parte: string): ParteDeLaFabrica {
  const id = parte.replace(/^fabrica-/, "");
  return PARTES_DE_LA_FABRICA.find((p) => p.id === id)?.id ?? "proyecto";
}
