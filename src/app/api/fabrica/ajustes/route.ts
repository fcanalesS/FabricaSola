import type { NextRequest } from "next/server";
import { ajustarLaFabrica, ajustePedido, leerAgentePropio, leerAjustesDeLaFabrica } from "@/lib/fabrica/cliente";
import { esRolDeAgente } from "@/lib/fabrica/modelos";
import { claudeCode } from "@/lib/fabrica/motor/corridas";
import { agentesDeEsteEquipo } from "@/lib/fabrica/motor/proyecto";

/**
 * La configuración de la fábrica, para la página de configuración del modo
 * trabajo: qué proyecto mira, crearle una factory/ básica, los modelos y los
 * agentes de cada rol, y convertir un documento de requerimientos en tareas.
 * Cada cambio sale de un clic suyo.
 *
 * `claudeCode` dice si este equipo tiene Claude Code (`FACTORIA_CLAUDE_CODE_BIN` o el
 * `claude` del PATH): sin él se configura, pero no se corre.
 * `enEsteEquipo`, si tiene las de Codex y Antigravity: sin la suya, ese
 * agente no se puede encender. Las rutas no se muestran.
 *
 * El agente propio de una etapa es una copia del de la fábrica en `.claude/agents/` del proyecto:
 * se crea con un clic (`personalizar_agente`) y se guarda lo que él escribe (`agente_propio`). La
 * aplicación no hace commit.
 */


export async function GET(request: NextRequest) {
  // Con `?agente=<etapa>`, el agente propio de esa etapa, para editarlo.
  const rol = new URL(request.url).searchParams.get("agente");
  if (rol !== null) {
    if (!esRolDeAgente(rol)) return Response.json({ error: "etapa_desconocida" }, { status: 400 });
    const leido = await leerAgentePropio(rol);
    return "motivo" in leido ? Response.json({ error: leido.motivo }, { status: 409 }) : Response.json(leido);
  }
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
