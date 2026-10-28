import { leerRendimiento } from "@/lib/fabrica/cliente";

/**
 * Cuánto rinde cada agente en el proyecto elegido: encargos, tiempo, costo y
 * vueltas, para elegir con datos qué agente va en cada rol. Solo lee.
 */
export async function GET() {
  const r = await leerRendimiento();
  if ("motivo" in r) return Response.json({ error: "La fábrica no responde." }, { status: 502 });
  return Response.json(r);
}
