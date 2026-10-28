import type { NextRequest } from "next/server";
import { listarCarpetas } from "@/lib/fabrica/motor/carpetas";

/**
 * Las carpetas de este equipo, para elegir la del proyecto de la fábrica sin
 * escribir su ruta (`?ruta=`; sin ella, la carpeta del usuario). Solo en el
 * trabajo, y solo nombres de carpetas: nada se lee por dentro.
 */
export async function GET(request: NextRequest) {
  try {
    return Response.json(await listarCarpetas(new URL(request.url).searchParams.get("ruta")));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 });
  }
}
