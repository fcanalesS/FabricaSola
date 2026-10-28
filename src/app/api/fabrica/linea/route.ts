import type { NextRequest } from "next/server";
import { accionDeLinea, ajustarLinea, ajusteDeLinea, cambiosEnLaLinea, detalleDeTarea, hacerEnLaLinea } from "@/lib/fabrica/planta/acciones";

/**
 * Una tarea de una línea cualquiera, para la pantalla de esa línea. `GET` la lee (con `cambios=1`,
 * también su diff); `POST` hace lo que él pidió con un clic: contestarle, aprobarla, rechazarla o
 * descartarla; `PUT` cambia un ajuste de la línea. Toda acción lleva su línea, y una que no existe
 * es un error.
 */


export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams;
  const linea = q.get("linea") ?? "";
  const tarea = q.get("tarea") ?? "";
  if (q.get("cambios") === "1") {
    const cambios = await cambiosEnLaLinea(linea, tarea).catch((e: unknown) => ({ tarea, motivo: e instanceof Error ? e.message : String(e) }));
    return cambios ? Response.json({ cambios }) : Response.json({ error: "No hay esa línea o esa tarea." }, { status: 404 });
  }
  const detalle = await detalleDeTarea(linea, tarea);
  return detalle ? Response.json({ detalle }) : Response.json({ error: "No hay esa línea o esa tarea." }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const accion = accionDeLinea(await request.json().catch(() => null));
  if (!accion) return Response.json({ error: "accion_desconocida" }, { status: 400 });
  const origen = new URL(request.url).origin;
  const r = await hacerEnLaLinea(accion, { origen });
  if (!r.hecho) return Response.json({ error: r.motivo }, { status: r.desconocida ? 400 : 409 });
  return Response.json({ nota: r.nota });
}

/** Un ajuste de la línea, como con qué modelo se escribe su spec. Va con su línea, sea o no la activa. */
export async function PUT(request: NextRequest) {
  const ajuste = ajusteDeLinea(await request.json().catch(() => null));
  if (!ajuste) return Response.json({ error: "ajuste_desconocido" }, { status: 400 });
  const r = await ajustarLinea(ajuste);
  if (!r.hecho) return Response.json({ error: r.motivo }, { status: r.desconocida ? 400 : 409 });
  return Response.json({ nota: r.nota });
}
