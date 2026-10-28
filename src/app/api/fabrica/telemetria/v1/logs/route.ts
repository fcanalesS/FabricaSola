import { recibirOtlp } from "@/lib/fabrica/motor/telemetria";

/**
 * La telemetría de las corridas de la fábrica (OTLP/HTTP JSON): los eventos de
 * Claude Code. Solo guarda la de corridas que lanzó esta aplicación, y de cada
 * evento una lista cerrada de campos (ver `motor/telemetria.ts`).
 */
export const POST = (request: Request) => recibirOtlp("logs", request);
