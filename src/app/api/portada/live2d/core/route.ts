import { promises as fs } from "node:fs";
import { archivoDelCore } from "@/lib/portada/modelo";

/** El Core de Cubism que él indicó en la configuración, para la portada. Sin uno, 404. */
export async function GET() {
  const ruta = await archivoDelCore();
  if (!ruta) return Response.json({ error: "sin_core" }, { status: 404 });
  return new Response(new Uint8Array(await fs.readFile(ruta)), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } });
}
