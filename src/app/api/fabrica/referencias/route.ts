import type { NextRequest } from "next/server";
import { agregarArchivo, agregarPagina, destinoDesde, quitarReferencia, ReferenciaNoAgregada, referenciasDe, type Destino } from "@/lib/fabrica/referencias/almacen";
import { leerPagina, LinkNoLeido } from "@/lib/fabrica/referencias/link";
import { TOPES } from "@/lib/fabrica/referencias/tipos";

/**
 * Las referencias de una tarea: archivos que él sube y links que la
 * aplicación lee una vez. Viven fuera del repositorio. El archivo llega en el
 * cuerpo, sin envoltorio, y su peso se mira antes y después de leerlo; el
 * destino (un lote de la petición, un borrador o una tarea pendiente) va en
 * la dirección. Las guardias de cada cosa van en su función.
 */

const destinoDeLaDireccion = (request: NextRequest): Destino | null => {
  const q = new URL(request.url).searchParams;
  return destinoDesde({ lote: q.get("lote") ?? undefined, borrador: q.has("borrador") ? Number(q.get("borrador")) : undefined, linea: q.get("linea") ?? undefined, tarea: q.get("tarea") ?? undefined });
};

const motivo = (e: unknown) => (e instanceof ReferenciaNoAgregada || e instanceof LinkNoLeido ? e.message : "No se pudo.");

export async function GET(request: NextRequest) {
  const destino = destinoDeLaDireccion(request);
  if (!destino) return Response.json({ error: "destino_invalido" }, { status: 400 });
  return Response.json({ referencias: await referenciasDe(destino) });
}

export async function POST(request: NextRequest) {
  // Con JSON es un link que leer, o una referencia que quitar; con otro tipo, un archivo.
  if (request.headers.get("content-type")?.includes("application/json")) {
    const c = (await request.json().catch(() => null)) as { accion?: unknown; destino?: unknown; url?: unknown; n?: unknown } | null;
    const destino = destinoDesde(c?.destino);
    if (!destino) return Response.json({ error: "destino_invalido" }, { status: 400 });
    try {
      if (c?.accion === "link" && typeof c.url === "string" && c.url.length <= 2_000) {
        const referencia = await agregarPagina(destino, await leerPagina(c.url));
        return Response.json({ referencia, referencias: await referenciasDe(destino) });
      }
      if (c?.accion === "quitar" && Number.isInteger(c.n)) {
        await quitarReferencia(destino, c.n as number);
        return Response.json({ referencias: await referenciasDe(destino) });
      }
    } catch (e) {
      return Response.json({ error: motivo(e), referencias: await referenciasDe(destino).catch(() => []) }, { status: 409 });
    }
    return Response.json({ error: "accion_desconocida" }, { status: 400 });
  }

  const destino = destinoDeLaDireccion(request);
  if (!destino) return Response.json({ error: "destino_invalido" }, { status: 400 });
  const demasiado = { error: `Cada archivo pesa hasta ${TOPES.porArchivo / 1024 / 1024} MB.` };
  if (Number(request.headers.get("content-length") ?? 0) > TOPES.porArchivo) return Response.json(demasiado, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > TOPES.porArchivo) return Response.json(demasiado, { status: 413 });
  let nombre = "archivo";
  try {
    nombre = decodeURIComponent(request.headers.get("x-nombre") ?? "archivo");
  } catch {
    // Un nombre mal codificado se queda como «archivo».
  }
  try {
    const referencia = await agregarArchivo(destino, nombre, bytes);
    return Response.json({ referencia, referencias: await referenciasDe(destino) });
  } catch (e) {
    return Response.json({ error: motivo(e), referencias: await referenciasDe(destino).catch(() => []) }, { status: 409 });
  }
}
