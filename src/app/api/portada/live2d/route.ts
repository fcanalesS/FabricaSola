import type { NextRequest } from "next/server";
import { indicarLive2D, leerLive2DIndicado, modeloDeLaPortada, quitarLive2DIndicado } from "@/lib/portada/modelo";

/**
 * El modelo Live2D de la portada, para la configuración: qué indicó él y cómo está la portada
 * (`GET`), indicar la carpeta del modelo y el Core (`POST { modelo, core }`) o dejar de usarlos
 * (`POST { quitar: true }`). Se guarda en datos/portada.json; nada se copia ni se borra.
 */

async function estado() {
  const [indicado, portada] = await Promise.all([leerLive2DIndicado(), modeloDeLaPortada()]);
  return { indicado, portada };
}

export async function GET() {
  return Response.json(await estado());
}

export async function POST(request: NextRequest) {
  const d = (await request.json().catch(() => null)) as { modelo?: unknown; core?: unknown; quitar?: unknown } | null;
  if (d?.quitar === true) {
    await quitarLive2DIndicado();
    return Response.json(await estado());
  }
  if (typeof d?.modelo !== "string" || typeof d.core !== "string") return Response.json({ error: "pedido_desconocido" }, { status: 400 });
  const hecho = await indicarLive2D(d.modelo, d.core);
  if (!hecho.hecho) return Response.json({ error: hecho.motivo, ...(await estado()) }, { status: 409 });
  return Response.json(await estado());
}
