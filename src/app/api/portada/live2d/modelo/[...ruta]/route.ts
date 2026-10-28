import { promises as fs } from "node:fs";
import type { NextRequest } from "next/server";
import { archivoDelModelo } from "@/lib/portada/modelo";

/**
 * Los archivos del modelo Live2D que él indicó en la configuración: el `*.model3.json` y lo que
 * nombra (moc3, texturas, motions, física), con la misma ruta que tienen en su carpeta. El guardia
 * de qué se sirve está en `archivoDelModelo`. Lo demás, 404.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ ruta: string[] }> }) {
  const archivo = await archivoDelModelo((await ctx.params).ruta ?? []);
  if (!archivo) return Response.json({ error: "no_esta" }, { status: 404 });
  return new Response(new Uint8Array(await fs.readFile(archivo.ruta)), { headers: { "content-type": archivo.tipo, "cache-control": "no-cache" } });
}
