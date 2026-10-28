import type { NextRequest } from "next/server";
import { accionDeMemoria, buscarEnLaMemoria, hacerEnLaMemoria, vistaDeLaMemoria } from "@/lib/fabrica/memoria/pantalla";

/**
 * La memoria de la fábrica: la ficha, las decisiones y las propuestas de cada
 * línea y de la planta. Lo que se aprueba lo aprueba él con un clic; la
 * aplicación escribe los archivos y no hace commit. Nada de esto va a un
 * modelo.
 */


export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams;
  const memoria = await vistaDeLaMemoria(q.get("en") ?? undefined);
  const texto = q.get("buscar");
  return Response.json(texto === null ? { memoria } : { memoria, hallazgos: await buscarEnLaMemoria(memoria.en, texto) });
}

export async function POST(request: NextRequest) {
  const accion = accionDeMemoria(await request.json().catch(() => null));
  if (!accion) return Response.json({ error: "accion_desconocida" }, { status: 400 });
  const hecho = await hacerEnLaMemoria(accion);
  // Aunque no se haya hecho, se devuelve cómo quedó.
  const memoria = await vistaDeLaMemoria(accion.en);
  if (!hecho.hecho) return Response.json({ error: hecho.motivo, memoria }, { status: 409 });
  return Response.json({ nota: hecho.nota, avisos: hecho.avisos, memoria });
}
