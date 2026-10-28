import { NextResponse, type NextRequest } from "next/server";
import { esPeticionAjena } from "@/lib/servidor/origen";

/** A las rutas de la aplicación solo las llaman sus propias páginas. El porqué está en `lib/servidor/origen.ts`. */
export function proxy(request: NextRequest) {
  const ajena = esPeticionAjena({
    metodo: request.method,
    host: request.headers.get("host"),
    origen: request.headers.get("origin"),
    sitio: request.headers.get("sec-fetch-site"),
  });
  return ajena ? NextResponse.json({ error: "peticion_ajena" }, { status: 403 }) : NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
