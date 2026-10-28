import { recibirOtlp } from "@/lib/fabrica/motor/telemetria";

/** Las métricas de las corridas de la fábrica (OTLP/HTTP JSON). Ver la ruta de los eventos, al lado. */
export const POST = (request: Request) => recibirOtlp("metrics", request);
