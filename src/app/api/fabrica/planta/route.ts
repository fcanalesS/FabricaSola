import { leerLaPlanta } from "@/lib/fabrica/planta/disco";

/**
 * La planta: todas las líneas de la fábrica a la vez, con sus tareas, lo que te espera, lo hecho
 * hoy, el gasto y las corridas de hoy. Solo lee: no corre nada, no escribe nada y nada de esto va
 * a un modelo.
 */

export async function GET() {
  return Response.json({ planta: await leerLaPlanta() });
}
