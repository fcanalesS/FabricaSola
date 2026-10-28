import type { NextRequest } from "next/server";
import { accionDeEntrada, hacerEnLaEntrada, vistaDeLaEntrada } from "@/lib/entrada/acciones";

/**
 * La Entrada de la fábrica: el formulario de petición, la Bandeja y las
 * fuentes. Cada cambio sale de un clic suyo, y lo que se devuelve nunca trae
 * un token: de cada fuente solo el nombre de su variable y si está.
 */


export async function GET() {
  return Response.json(await vistaDeLaEntrada());
}

export async function POST(request: NextRequest) {
  const accion = accionDeEntrada(await request.json().catch(() => null));
  if (!accion) return Response.json({ error: "accion_desconocida" }, { status: 400 });
  const hecho = await hacerEnLaEntrada(accion);
  // Aunque no se haya hecho, se devuelve cómo quedó.
  const entrada = await vistaDeLaEntrada();
  if (!hecho.hecho) return Response.json({ error: hecho.motivo, ...(hecho.errores ? { errores: hecho.errores } : {}), entrada }, { status: hecho.errores ? 400 : 409 });
  return Response.json({ nota: hecho.nota, ...(hecho.tarea ? { tarea: hecho.tarea } : {}), entrada });
}
