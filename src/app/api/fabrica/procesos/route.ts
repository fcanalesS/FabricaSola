import type { NextRequest } from "next/server";
import { lineaPorId } from "@/lib/fabrica/motor/lineas";
import { fijarProcesoSinClic, fijarProcesoSolo, leerAjustes, lineasDeLaFabrica, procesosSinClicDe, procesosSolosDe } from "@/lib/fabrica/motor/proyecto";
import { correrProceso, detenerProceso, olvidarAlIntegrar, porQueNoSinClicEn, puntajesDelProceso, responderAprobacion, ultimaEjecucion } from "@/lib/fabrica/procesos/correr";
import { procesosDe } from "@/lib/fabrica/procesos/disco";

/**
 * Correr un proceso de la línea que se mira, con su clic, y ver cómo va. Lo
 * corre el código: comandos y comprobaciones de salud, en orden, sin shell y
 * con tope, el push de su rama con su PR y la espera de la integración
 * continua; en un paso aprobacion espera su clic (aprobar o no aprobar se
 * hace aquí); el paso vulnerabilidades pregunta a OSV.dev por nombres y
 * versiones de paquetes; el paso evaluacion corre el conjunto de prueba y
 * compara su puntaje (de cada proceso con una, se devuelven sus últimos
 * puntajes, solo números); un paso tarea suelto todavía no corre. También
 * encender o apagar que un proceso arranque solo (`cuando: al-integrar`, al
 * integrar una tarea; `cada-dia` o `cada-semana`, cada tanto), y quitar su
 * clic para producción en un proceso, solo si cumple las condiciones
 * (`porQueNoSinClic`). Nada de esto va a un modelo. Antes de empezar se
 * revisa todo, y lo que no está vuelve como motivo. En casa no existe.
 */

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function lineaActiva(): Promise<string | null> {
  const a = (await leerAjustes()).lineaActiva;
  return typeof a === "string" ? a : null;
}

/**
 * Cómo está la línea: la última ejecución, los procesos que arrancan solos, en cuáles quitó su clic
 * para producción y, de cada uno con un paso aprobacion, por qué no podría pasar sin su clic.
 */
async function vista(linea: string | null) {
  if (!linea) return { ejecucion: null, solos: [], sinClic: [], condiciones: {}, puntajes: {} };
  const raiz = lineaPorId(await lineasDeLaFabrica(), linea).raiz;
  const procesos = (await procesosDe(raiz)).procesos.filter((p) => p.id);
  const condiciones: Record<string, string[]> = {};
  for (const p of procesos.filter((x) => x.pasos.some((s) => s.tipo === "aprobacion"))) condiciones[p.id] = await porQueNoSinClicEn(linea, p.id);
  // De cada uno con una evaluación, sus últimos puntajes: solo números.
  const puntajes: Record<string, Awaited<ReturnType<typeof puntajesDelProceso>>> = {};
  for (const p of procesos.filter((x) => x.pasos.some((s) => s.tipo === "evaluacion"))) puntajes[p.id] = await puntajesDelProceso(linea, p.id);
  return { ejecucion: await ultimaEjecucion(linea), solos: await procesosSolosDe(linea), sinClic: await procesosSinClicDe(linea), condiciones, puntajes };
}

export async function GET() {
  return Response.json(await vista(await lineaActiva()));
}

export async function POST(request: NextRequest) {
  const d = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const linea = await lineaActiva();
  const proceso = typeof d.proceso === "string" && ID.test(d.proceso) && d.proceso.length <= 60 ? d.proceso : null;
  try {
    if (d.accion === "correr") {
      if (!proceso) return Response.json({ error: "Falta qué proceso correr." }, { status: 400 });
      if (!linea) return Response.json({ error: "Todavía no hay un proyecto elegido: elígelo en la configuración." }, { status: 409 });
      await correrProceso(linea, proceso);
      return Response.json(await vista(linea));
    }
    if (d.accion === "detener") {
      const e = await detenerProceso();
      return e ? Response.json({ ...(await vista(linea)), ejecucion: e }) : Response.json({ error: "No hay ningún proceso corriendo." }, { status: 409 });
    }
    if (d.accion === "aprobar" || d.accion === "no_aprobar") {
      // Su clic para producción: solo responde al proceso que lo espera en esta línea.
      if (!linea) return Response.json({ error: "Todavía no hay un proyecto elegido." }, { status: 409 });
      await responderAprobacion(linea, d.accion === "aprobar" ? "aprobar" : "rechazar");
      return Response.json(await vista(linea));
    }
    if (d.accion === "sin_clic") {
      if (!proceso || typeof d.valor !== "boolean") return Response.json({ error: "Falta qué proceso y si pasa sin tu clic." }, { status: 400 });
      if (!linea) return Response.json({ error: "Todavía no hay un proyecto elegido." }, { status: 409 });
      if (d.valor) {
        const porQue = await porQueNoSinClicEn(linea, proceso);
        if (porQue.length) return Response.json({ error: `Todavía no puede pasar a producción sin tu clic: ${porQue.join(" ")}`, ...(await vista(linea)) }, { status: 409 });
      }
      await fijarProcesoSinClic(linea, proceso, d.valor);
      return Response.json(await vista(linea));
    }
    if (d.accion === "solo") {
      if (!proceso || typeof d.valor !== "boolean") return Response.json({ error: "Falta qué proceso y si arranca solo." }, { status: 400 });
      if (!linea) return Response.json({ error: "Todavía no hay un proyecto elegido: elígelo en la configuración." }, { status: 409 });
      if (d.valor) {
        // Solo uno que dice que es para eso: el interruptor no cambia cuándo corre un proceso.
        const p = (await procesosDe(lineaPorId(await lineasDeLaFabrica(), linea).raiz)).procesos.find((x) => x.id === proceso);
        if (!p) return Response.json({ error: `No hay ningún proceso ${proceso} en esta línea.`, ...(await vista(linea)) }, { status: 409 });
        if (!["al-integrar", "cada-dia", "cada-semana"].includes(p.cuando)) return Response.json({ error: `${proceso} dice «cuando: ${p.cuando}»: solo arranca solo uno que dice «cuando: al-integrar», «cada-dia» o «cada-semana».`, ...(await vista(linea)) }, { status: 409 });
        if (p.cuando === "al-integrar") await olvidarAlIntegrar(linea);
      }
      await fijarProcesoSolo(linea, proceso, d.valor);
      return Response.json(await vista(linea));
    }
    return Response.json({ error: "accion_desconocida" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "No se pudo.", ...(await vista(linea)) }, { status: 409 });
  }
}
