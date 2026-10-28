import type { NextRequest } from "next/server";
import { ajustarLaFabrica, ajustePedido, leerAjustesDeLaFabrica } from "@/lib/fabrica/cliente";
import { claudeCode } from "@/lib/fabrica/motor/corridas";
import { agentesDeEsteEquipo } from "@/lib/fabrica/motor/proyecto";

/**
 * La configuración de la fábrica, para la página de configuración del modo
 * trabajo: qué proyecto mira, crearle una factory/ básica, los modelos y los
 * agentes de cada rol, y convertir un documento de requerimientos en tareas.
 * El mod nikke solo se apaga: la fábrica es para que trabaje sola, y sus
 * guardas detendrían las corridas esperando una firma. Lo decidió él el 17 de
 * octubre de 2026. Cada cambio sale de un clic suyo. En casa no existe.
 *
 * `claudeCode` dice si este equipo tiene Claude Code (`COMPANIA_CLAUDE_CODE_BIN` o el
 * `claude` del PATH): sin él se configura, pero no se corre.
 * `enEsteEquipo`, si tiene las de Codex y Antigravity: sin la suya, ese
 * agente no se puede encender. Las rutas no se muestran.
 */


export async function GET() {
  return Response.json({ ...(await leerAjustesDeLaFabrica()), ...deEsteEquipo() });
}

/** Qué programas tiene este equipo, sin sus rutas. */
function deEsteEquipo() {
  const { codex, antigravity } = agentesDeEsteEquipo();
  return { claudeCode: claudeCode() !== null, enEsteEquipo: { codex: codex !== null, antigravity: antigravity !== null } };
}

export async function POST(request: NextRequest) {
  const ajuste = ajustePedido(await request.json().catch(() => null));
  if (!ajuste) return Response.json({ error: "ajuste_desconocido" }, { status: 400 });
  const hecho = await ajustarLaFabrica(ajuste);
  // Aunque la fábrica diga que no, se devuelve cómo quedó.
  const ahora = { ...(await leerAjustesDeLaFabrica()), ...deEsteEquipo() };
  if (!hecho.hecho) return Response.json({ error: hecho.motivo, ...ahora }, { status: 409 });
  return Response.json({ ...hecho, ...ahora });
}
