import { resumenDeHabilidades } from "../habilidades/disco.ts";
import { ultimaEjecucion } from "../procesos/correr.ts";
import { crearProcesoDesdePlantilla, deQuePlantilla, procesosDe, type ProcesoDePlantilla } from "../procesos/disco.ts";
import { crearMemoriaDeLinea, resumenDeLaMemoria, vaultDeLaRaiz } from "../memoria/vault.ts";
import { definicionesDisponibles, disponibles } from "./agentes.ts";
import { lineaPorId, mismaRaiz } from "./lineas.ts";
import { carpetaDelPlugin, continuarTareas, corridaActual, detenerCorrida, gastoDeHoy, gastoPorDia, iniciarCorrida, type Corrida } from "./corridas.ts";
import { costoDeLasTareas, historialDeLaTarea, informeDe, rendimientoDeLosAgentes } from "./informes.ts";
import { detenerRetoma, engancharSesion, esIdDeSesion, leerSesion, retomaActual, retomarSesion, sesionEnganchada, sesionesDelProyecto } from "./sesiones.ts";
import {
  agentesDelProyecto,
  cambiosDeLaTarea,
  descartarTarea,
  seccionesDeLaTarea,
  agentesExternos,
  comandosDelProyecto,
  elegirProyecto,
  fijarAgenteDeRol,
  agentePropio,
  guardarAgentePropio,
  personalizarAgente,
  fijarComandos,
  fijarNotas,
  fijarReglas,
  fijarParalelo,
  fijarTopes,
  fijarAgenteExterno,
  fijarCorridaConNikke,
  fijarLlamarSola,
  fijarModelo,
  fijarModeloDeRol,
  inicializarFabrica,
  instantanea,
  fijarRamaDeTrabajo,
  limpiarRamas,
  ramaDeTrabajo,
  ramasDeLaFabrica,
  leerAjustes,
  lineasDeLaFabrica,
  quitarLineaDeLaFabrica,
  modeloDeLaCorrida,
  modelosPorRol,
  probarComandos,
  reglasDelProyecto,
  raiz,
  revisarProyecto,
  crearTareaDeDeuda,
  crearTareas,
  escribirRespuesta,
  escribirVeredicto,
} from "./proyecto.ts";
import { proponerTareas, tituloDelDocumento } from "./requerimientos.ts";
import { estadoTelefono, llamar } from "./telefono.ts";

/**
 * Lo que antes se le pedía por HTTP al orquestador de Factory-IA, atendido
 * dentro de la aplicación: las mismas rutas y las mismas respuestas, para
 * que quien la usa (`cliente.ts`) no cambie. No es una ruta de Next: nadie
 * de fuera llega aquí. Solo para el servidor.
 */

export type Respuesta = { estado: number; datos: unknown };

const bien = (datos: unknown): Respuesta => ({ estado: 200, datos });
const mal = (err: unknown, estado = 409): Respuesta => ({ estado, datos: { error: err instanceof Error ? err.message : String(err) } });

/** El tope de un documento de requerimientos. */
const REQUERIMIENTOS_MAX_BYTES = 512 * 1024;

function vistaDeLaCorrida(c: Corrida | null, desde = 0) {
  if (!c) return { corrida: null };
  const { lineas, ...resto } = c;
  return { corrida: { ...resto, lineas: lineas.filter((l) => l.n > desde) } };
}

/** Qué proyecto se mira y cómo está configurado. Sin proyecto elegido, `raiz` va vacía. */
async function ajustes() {
  const r = await raiz();
  return {
    raiz: r ?? "",
    fuente: r ? "configuracion" : "ninguno",
    proyecto: r ? await revisarProyecto(r) : { existe: false, esCarpeta: false, tieneFabrica: false, tieneGit: false },
    corridaConNikke: !!(await leerAjustes()).corridaConNikke,
    modelo: await modeloDeLaCorrida(),
    modelosPorRol: await modelosPorRol(),
    externos: await agentesExternos(),
    comandos: await comandosDelProyecto(),
    reglas: await reglasDelProyecto(),
    agentes: await agentesConLista(r),
    topes: (await leerAjustes()).topes ?? {},
    gastoHoyUsd: r ? await gastoDeHoy(r) : 0,
    gastoPorDia: r ? await gastoPorDia(r) : [],
    ramas: await ramasDeLaFabrica(),
    ramaTrabajo: await ramaDeTrabajo(),
    // Cómo está su memoria: cuántas reglas, decisiones y propuestas, y si le falta algo. Sin el texto.
    memoria: r ? await resumenDeLaMemoria(vaultDeLaRaiz(r)).catch(() => null) : null,
    // Su catálogo de habilidades: cuántos usos, cuántas sin usar y sus problemas. Solo nombres, nunca su contenido.
    habilidades: r ? await resumenDeHabilidades(r).catch(() => null) : null,
    // Sus procesos (factory/procesos/): cada uno con sus pasos y lo que no cumple. Nada de esto corre.
    procesos: r ? await procesosDe(r).catch(() => null) : null,
    // Las líneas que conoce la fábrica, y cuál se mira.
    lineas: await (async () => {
      const activa = (await leerAjustes()).lineaActiva;
      return (await lineasDeLaFabrica()).map((l) => ({ id: l.id, nombre: l.nombre, raiz: l.raiz, activa: l.id === activa }));
    })(),
  };
}

/**
 * Saca una línea de la fábrica, sin tocar su repositorio. No mientras una corrida trabaja en ella:
 * la corrida escribe en sus tareas y sus ramas.
 */
async function quitarLinea(id: string) {
  const linea = lineaPorId(await lineasDeLaFabrica(), id);
  const c = await corridaActual();
  if (c?.estado === "corriendo" && mismaRaiz(c.proyecto, linea.raiz)) throw new Error(`Hay una corrida trabajando en ${linea.nombre}: detenla o espera a que termine.`);
  return quitarLineaDeLaFabrica(id);
}

/** El vault de la línea activa, sembrado. Un error que se puede mostrar si no hay línea o no tiene factory/. */
async function crearMemoriaDeLaActiva() {
  const activa = (await leerAjustes()).lineaActiva;
  if (!activa) throw new Error("Todavía no hay un proyecto elegido: elígelo en la configuración.");
  return crearMemoriaDeLinea(activa);
}

/** El proceso de la plantilla en la línea activa, como borrador, en su rama de trabajo. No pisa uno que exista. */
async function crearProcesoDeLaActiva(cual: ProcesoDePlantilla = "publicar") {
  const activa = (await leerAjustes()).lineaActiva;
  const linea = activa ? (await lineasDeLaFabrica()).find((l) => l.id === activa) : undefined;
  if (!linea) throw new Error("Todavía no hay un proyecto elegido: elígelo en la configuración.");
  const rama = await ramaDeTrabajo();
  return crearProcesoDesdePlantilla(linea.raiz, { nombreDeLinea: linea.nombre, rama: rama?.elegida || rama?.raizEn || null, cual });
}

/** Los agentes de las corridas de este equipo: los que se pueden elegir, sin prompts ni rutas. */
const agentesDeLasCorridas = async (r: string | null) => definicionesDisponibles(r, carpetaDelPlugin(), !!(await leerAjustes()).corridaConNikke);

/** El agente de cada etapa del proyecto, cuántas tareas a la vez, y entre qué agentes se elige. `null` sin fábrica. */
async function agentesConLista(r: string | null) {
  const delProyecto = await agentesDelProyecto();
  return delProyecto ? { ...delProyecto, disponibles: disponibles(await agentesDeLasCorridas(r)) } : null;
}

type Cuerpo = Record<string, unknown> | null;

/**
 * Atiende un pedido a la fábrica. `origen`: la dirección de esta aplicación,
 * adonde las corridas mandan su telemetría.
 */
export async function atenderEnLaFabrica(ruta: string, cuerpo: unknown, metodo: "GET" | "POST" | "PUT", contexto: { origen?: string | null } = {}): Promise<Respuesta> {
  const url = new URL(ruta, "http://fabrica.local");
  const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : null) as Cuerpo;
  try {
    switch (`${metodo} ${url.pathname}`) {
      case "GET /api/fabrica": {
        const i = await instantanea();
        // Con lo que lleva costado cada tarea: se suma aquí, no en la instantánea, que también la usa el vigía.
        return i ? bien({ ...i, costos: await costoDeLasTareas(i.raiz) }) : mal("Todavía no hay un proyecto elegido.", 409);
      }
      case "GET /api/corridas/hoy": {
        const r = await raiz();
        return bien({ usd: r ? await gastoDeHoy(r) : 0 });
      }
      case "GET /api/procesos/ultima": {
        // La última vez que corrió un proceso en la línea que se mira, solo si ya terminó.
        const activa = (await leerAjustes()).lineaActiva;
        const e = activa ? await ultimaEjecucion(activa) : null;
        return bien({ ejecucion: e && e.estado !== "corriendo" ? e : null });
      }
      case "GET /api/corridas":
        return bien(vistaDeLaCorrida(await corridaActual(), Number(url.searchParams.get("desde") ?? 0) || 0));
      case "POST /api/corridas":
        if (c?.accion === "iniciar") {
          const tareas = Array.isArray(c.tareas) ? c.tareas.map(String) : undefined;
          return bien(vistaDeLaCorrida(await iniciarCorrida({ tareas, modelo: typeof c.modelo === "string" ? c.modelo : undefined, origen: contexto.origen })));
        }
        if (c?.accion === "detener") return bien(vistaDeLaCorrida(await detenerCorrida()));
        if (c?.accion === "continuar") {
          const tareas = Array.isArray(c.tareas) ? c.tareas.map(String) : [];
          const { encolada, corrida } = await continuarTareas(tareas, contexto.origen ?? null);
          return bien({ ...vistaDeLaCorrida(corrida), encolada });
        }
        return mal('accion es "iniciar", "continuar" o "detener".', 400);
      case "GET /api/cambios": {
        const tarea = url.searchParams.get("tarea") ?? "";
        if (!/^[A-Za-z]{1,8}-\d{1,6}$/.test(tarea)) return mal("Falta la tarea.", 400);
        return bien(await cambiosDeLaTarea(tarea));
      }
      case "GET /api/historial": {
        const tarea = url.searchParams.get("tarea") ?? "";
        if (!/^[A-Za-z]{1,8}-\d{1,6}$/.test(tarea)) return mal("Falta la tarea.", 400);
        const r = await raiz();
        // Con lo que dice la tarea: su pedido, su spec y los hallazgos, para mirarla entera en un lugar.
        return r ? bien({ ...(await historialDeLaTarea(r, tarea)), secciones: await seccionesDeLaTarea(tarea) }) : mal("Todavía no hay un proyecto elegido.", 409);
      }
      case "GET /api/sesiones": {
        const r = await raiz();
        if (!r) return mal("Todavía no hay un proyecto elegido.", 409);
        return bien({ sesiones: await sesionesDelProyecto(r), enganchada: sesionEnganchada(r), retoma: retomaActual() });
      }
      case "GET /api/sesiones/leer": {
        // Sin id, la sesión a la que está enganchada; `desde`, solo lo posterior.
        const r = await raiz();
        if (!r) return mal("Todavía no hay un proyecto elegido.", 409);
        const id = url.searchParams.get("id") || sesionEnganchada(r);
        const desde = url.searchParams.get("desde");
        return bien(id ? await leerSesion(r, id, desde && /^\d{4}-\d{2}-\d{2}T/.test(desde) ? desde : null) : null);
      }
      case "POST /api/sesiones": {
        const r = await raiz();
        if (!r) return mal("Todavía no hay un proyecto elegido.", 409);
        if (c?.accion === "detener") return bien({ retoma: detenerRetoma() });
        if (c?.accion === "soltar") return bien({ enganchada: engancharSesion(r, null) });
        if (!esIdDeSesion(c?.id)) return mal("Falta la sesión.", 400);
        if (c.accion === "enganchar") return bien({ enganchada: engancharSesion(r, c.id) });
        if (c.accion === "retomar") return bien({ retoma: await retomarSesion(r, c.id, typeof c.texto === "string" ? c.texto : "") });
        return mal('accion es "retomar", "detener", "enganchar" o "soltar".', 400);
      }
      case "GET /api/rendimiento": {
        const r = await raiz();
        return r ? bien(await rendimientoDeLosAgentes(r)) : mal("Todavía no hay un proyecto elegido.", 409);
      }
      case "GET /api/informes": {
        const id = url.searchParams.get("id") ?? "";
        const i = await informeDe(id);
        return i ? bien(i) : mal("No hay una corrida con ese id.", 404);
      }
      case "POST /api/respuesta":
        if (typeof c?.tarea !== "string" || typeof c.texto !== "string") return mal("Faltan tarea y texto.", 400);
        return bien(await escribirRespuesta(c.tarea, c.texto, typeof c.por === "string" && c.por.trim() ? c.por.trim() : "aplicacion"));
      case "POST /api/descartar": {
        if (typeof c?.tarea !== "string") return mal("Falta la tarea.", 400);
        // Con una corrida en marcha no: podría estar tomándola en este momento.
        if ((await corridaActual())?.estado === "corriendo") return mal("Hay una corrida en marcha: detenla o espera a que termine para descartar.", 409);
        return bien(await descartarTarea(c.tarea, typeof c.motivo === "string" ? c.motivo : "", typeof c.por === "string" && c.por.trim() ? c.por.trim() : "aplicacion"));
      }
      case "POST /api/veredicto":
        if (typeof c?.tarea !== "string" || (c.veredicto !== "aprobada" && c.veredicto !== "rechazada")) return mal("Faltan tarea y veredicto (aprobada | rechazada).", 400);
        return bien(await escribirVeredicto(c.tarea, c.veredicto, typeof c.motivo === "string" ? c.motivo : "", typeof c.por === "string" && c.por.trim() ? c.por.trim() : "aplicacion"));
      case "GET /api/ajustes":
        return bien(await ajustes());
      case "GET /api/agentes/propio":
        // Su agente propio de una etapa, para editarlo: lo escribió él, en su repositorio.
        return bien({ agente: await agentePropio(url.searchParams.get("rol") ?? "") });
      case "PUT /api/ajustes":
        if (c && "modelo" in c) await fijarModelo(typeof c.modelo === "string" ? c.modelo : null);
        else if (c?.comandos && typeof c.comandos === "object") await fijarComandos(c.comandos);
        else if (c?.reglas && typeof c.reglas === "object") await fijarReglas(c.reglas);
        else if (c && "notas" in c) await fijarNotas(c.notas);
        else if (c?.agenteDeRol && typeof c.agenteDeRol === "object") {
          const x = c.agenteDeRol as Record<string, unknown>;
          const r = await raiz();
          await fijarAgenteDeRol(String(x.rol ?? ""), String(x.valor ?? ""), async (nombre) => (await agentesDeLasCorridas(r)).some((a) => a.nombre === nombre));
        } else if (c?.agentePropio && typeof c.agentePropio === "object") {
          const x = c.agentePropio as Record<string, unknown>;
          await guardarAgentePropio(String(x.rol ?? ""), x);
        } else if (c && typeof c.paraleloMax === "number") await fijarParalelo(c.paraleloMax);
        else if (c?.topes && typeof c.topes === "object") {
          const t = c.topes as Record<string, unknown>;
          const usd = (v: unknown) => (typeof v === "number" ? v : null);
          await fijarTopes(usd(t.diarioUsd), usd(t.corridaUsd));
        }
        else if (c?.agenteExterno && typeof c.agenteExterno === "object") {
          const x = c.agenteExterno as Record<string, unknown>;
          await fijarAgenteExterno(String(x.cual ?? ""), String(x.valor ?? ""));
        } else if (c?.modeloDeRol && typeof c.modeloDeRol === "object") {
          const x = c.modeloDeRol as Record<string, unknown>;
          await fijarModeloDeRol(String(x.rol ?? ""), String(x.modelo ?? ""));
        } else if (c && typeof c.corridaConNikke === "boolean" && !("raiz" in c)) await fijarCorridaConNikke(c.corridaConNikke);
        else if (c && typeof c.llamarSola === "boolean") await fijarLlamarSola(c.llamarSola);
        else if (c && typeof c.ramaTrabajo === "string") await fijarRamaDeTrabajo(c.ramaTrabajo);
        else if (c && (c.raiz === null || (typeof c.raiz === "string" && c.raiz.trim()))) await elegirProyecto(c.raiz as string | null);
        else return mal("Falta la ruta del proyecto.", 400);
        return bien(await ajustes());
      case "POST /api/ajustes":
        if (c?.accion === "inicializar") {
          const inicializada = await inicializarFabrica();
          // Con la factory/ nueva, su memoria: sembrada con propuestas, que no entran a la ficha sin él.
          const memoria = await crearMemoriaDeLaActiva().catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
          const avisos = "error" in memoria ? [...inicializada.avisos, `No se pudo crear la memoria: ${memoria.error}`] : inicializada.avisos;
          return bien({ ...(await ajustes()), inicializada: { ...inicializada, avisos }, ...("error" in memoria ? {} : { memoria }) });
        }
        if (c?.accion === "crear_memoria") {
          const memoriaCreada = await crearMemoriaDeLaActiva();
          return bien({ ...(await ajustes()), memoriaCreada });
        }
        if (c?.accion === "crear_proceso") {
          // Primero se crea: los ajustes que vuelven ya lo traen.
          const procesoCreado = await crearProcesoDeLaActiva(deQuePlantilla(c.cual));
          return bien({ ...(await ajustes()), procesoCreado });
        }
        if (c?.accion === "quitar_linea") {
          if (typeof c.linea !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(c.linea)) return mal("Falta qué línea quitar.", 400);
          const quitada = await quitarLinea(c.linea);
          return bien({ ...(await ajustes()), quitada: { id: quitada.linea.id, nombre: quitada.linea.nombre, eraLaActiva: quitada.eraLaActiva } });
        }
        if (c?.accion === "personalizar_agente") {
          const personalizado = await personalizarAgente(String(c.rol ?? ""), carpetaDelPlugin());
          return bien({ ...(await ajustes()), personalizado });
        }
        if (c?.accion === "probar_comandos") return bien({ ...(await ajustes()), pruebas: await probarComandos() });
        if (c?.accion === "limpiar_ramas") {
          const elegidas = Array.isArray(c.sinIntegrar) ? c.sinIntegrar.filter((x): x is string => typeof x === "string" && /^fabrica\/[A-Za-z0-9._-]+$/.test(x)).slice(0, 500) : [];
          const limpieza = await limpiarRamas(elegidas);
          return bien({ ...(await ajustes()), limpieza });
        }
        return mal('accion es "inicializar", "crear_memoria", "crear_proceso", "personalizar_agente", "probar_comandos", "limpiar_ramas" o "quitar_linea".', 400);
      case "GET /api/telefono":
        return bien(await estadoTelefono());
      case "POST /api/telefono":
        if (c?.accion !== "probar") return mal('accion es "probar".', 400);
        try {
          const { id } = await llamar({ motivo: "Prueba desde la aplicación", auto: false });
          return bien({ ok: true, id, ...(await estadoTelefono()) });
        } catch (err) {
          return { estado: 409, datos: { error: err instanceof Error ? err.message : String(err), ...(await estadoTelefono()) } };
        }
      case "POST /api/deuda":
        if (typeof c?.hallazgo !== "string") return mal("Falta el hallazgo.", 400);
        return bien(await crearTareaDeDeuda(c.hallazgo));
      case "POST /api/requerimientos": {
        const texto = typeof c?.texto === "string" ? c.texto : "";
        if (!texto.trim()) return mal("El documento está vacío.", 400);
        if (new TextEncoder().encode(texto).length > REQUERIMIENTOS_MAX_BYTES) return mal("El documento pasa de 512 KB: pártelo en varios.", 413);
        const titulo = (typeof c?.titulo === "string" && c.titulo.trim()) || tituloDelDocumento(texto);
        return bien(await crearTareas({ titulo, texto }, proponerTareas(texto, { porSeccion: c?.porSeccion === true, titulo })));
      }
      default:
        return mal(`La fábrica no atiende ${metodo} ${url.pathname}.`, 404);
    }
  } catch (err) {
    return mal(err);
  }
}
