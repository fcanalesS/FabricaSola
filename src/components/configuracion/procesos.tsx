"use client";

import { useCallback, useEffect, useState } from "react";
import type { AjustesDeLaFabrica } from "@/lib/fabrica/cliente";
import type { Ejecucion, PuntajeALaVista } from "@/lib/fabrica/procesos/ejecucion";
import { BOTON, Fila } from "./piezas";

/**
 * Los procesos del proyecto (`factory/procesos/`) en su configuración: cómo
 * se publica lo que la fábrica termina, paso a paso, lo que no cumple el
 * formato, y correrlos con su clic. En un paso aprobacion esperan su clic, que
 * se da aquí; él puede quitarlo por proceso mientras cumpla las condiciones.
 * Encender que arranquen solos al integrar. Los corre el código, no un modelo.
 */

const PRINCIPAL = `${BOTON} bg-realce`;
const PASO: Record<string, string> = { push: "Push", ci: "Integración continua", comando: "Comando", salud: "Salud", aprobacion: "Tu clic", tarea: "Pedido", vulnerabilidades: "Vulnerabilidades", evaluacion: "Evaluación", fusion: "Fusión del PR" };
const CUANDO: Record<string, string> = { "a-mano": "a mano", "al-integrar": "al integrar", "cada-dia": "cada día", "cada-semana": "cada semana" };
const ESTADO_DEL_PASO: Record<string, string> = {
  pendiente: "espera",
  corriendo: "corriendo…",
  ok: "bien",
  fallo: "falló",
  deshecho: "deshecho",
  "no-se-deshace": "no se deshace",
  "no-se-deshizo": "no se pudo deshacer",
  "sin-correr": "no corrió",
  esperando: "espera tu clic",
  "no-aprobado": "no lo aprobaste",
};
const ESTADO_DE_LA_EJECUCION: Record<string, string> = { corriendo: "corriendo", esperando: "espera tu clic", termino: "terminó", llego: "llegó hasta donde corre", fallo: "falló", detenida: "detenida" };
const MALOS = new Set(["fallo", "no-se-deshizo"]);

type Contestado = { ejecucion?: Ejecucion | null; solos?: string[]; sinClic?: string[]; condiciones?: Record<string, string[]>; puntajes?: Record<string, PuntajeALaVista[]>; error?: string };

async function pedir(cuerpo?: Record<string, unknown>): Promise<Contestado & { ok: boolean }> {
  try {
    const r = await fetch("/api/fabrica/procesos", cuerpo ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : undefined);
    const d = ((await r.json().catch(() => null)) ?? {}) as Contestado;
    return { ...d, ok: r.ok };
  } catch {
    return { ok: false, error: "La aplicación no responde." };
  }
}

export function SusProcesos({ procesos, ocupada, crear }: { procesos: NonNullable<AjustesDeLaFabrica["procesos"]>; ocupada: boolean; crear: (cual: "publicar" | "vigia" | "evaluacion") => void }) {
  const lista = procesos.procesos;
  const [ejecucion, setEjecucion] = useState<Ejecucion | null>(null);
  // Los procesos de esta línea que él encendió para que arranquen solos al integrar.
  const [solos, setSolos] = useState<string[]>([]);
  // En cuáles quitó su clic para producción, y por qué no podría en los que tienen un paso aprobacion.
  const [sinClic, setSinClic] = useState<string[]>([]);
  const [condiciones, setCondiciones] = useState<Record<string, string[]>>({});
  // De cada proceso con una evaluación, sus últimos puntajes.
  const [puntajes, setPuntajes] = useState<Record<string, PuntajeALaVista[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  // Mientras espera su clic también sigue en marcha: no se corre otro y se mira seguido.
  const corriendo = ejecucion?.estado === "corriendo" || ejecucion?.estado === "esperando";

  const mirar = useCallback(
    () =>
      pedir().then((r) => {
        if (!r.ok) return;
        setEjecucion(r.ejecucion ?? null);
        if (r.puntajes) setPuntajes(r.puntajes);
      }),
    [],
  );
  useEffect(() => {
    pedir().then((r) => {
      if (!r.ok) return;
      setEjecucion(r.ejecucion ?? null);
      setSolos(r.solos ?? []);
      setSinClic(r.sinClic ?? []);
      setCondiciones(r.condiciones ?? {});
      setPuntajes(r.puntajes ?? {});
    });
  }, []);
  // Mientras corre, se mira cada dos segundos.
  useEffect(() => {
    if (!corriendo) return;
    const t = setInterval(() => void mirar(), 2000);
    return () => clearInterval(t);
  }, [corriendo, mirar]);

  async function hacer(cuerpo: Record<string, unknown>) {
    setPidiendo(true);
    setError(null);
    const r = await pedir(cuerpo);
    if (r.ejecucion !== undefined) setEjecucion(r.ejecucion ?? null);
    if (r.solos) setSolos(r.solos);
    if (r.sinClic) setSinClic(r.sinClic);
    if (r.condiciones) setCondiciones(r.condiciones);
    if (r.puntajes) setPuntajes(r.puntajes);
    if (!r.ok) setError(r.error ?? "No se pudo.");
    setPidiendo(false);
  }

  const sinPublicar = !lista.some((p) => p.archivo === "publicar.md");
  const sinVigia = !lista.some((p) => p.archivo === "vigia.md");
  const sinEvaluacion = !lista.some((p) => p.archivo === "evaluacion.md");
  const botonCrear = (sinPublicar || sinVigia || sinEvaluacion) && (
    <span className="flex flex-wrap gap-2">
      {sinPublicar && (
        <button type="button" disabled={ocupada} className={lista.length ? BOTON : PRINCIPAL} onClick={() => crear("publicar")}>
          Crear desde la plantilla
        </button>
      )}
      {sinVigia && (
        <button type="button" disabled={ocupada} className={BOTON} onClick={() => crear("vigia")}>
          Crear el vigía de vulnerabilidades
        </button>
      )}
      {sinEvaluacion && (
        <button type="button" disabled={ocupada} className={BOTON} onClick={() => crear("evaluacion")}>
          Crear la evaluación
        </button>
      )}
    </span>
  );
  if (!lista.length)
    return (
      <Fila
        nombre="Sus procesos"
        que="factory/procesos/"
        estado="Todavía no tiene"
        detalle="Cómo se publica lo que la fábrica termina: push y PR, la integración continua, el entorno de prueba y producción con tu clic. Un paso por línea, y los corre el código, no un modelo. Corren los comandos, las comprobaciones de salud, el push con su PR, la espera de la integración continua y tu clic para producción. También el vigía de vulnerabilidades y la evaluación, que corre tu conjunto de prueba y dice si el puntaje bajó."
      >
        {botonCrear}
      </Fila>
    );
  const conProblemas = lista.filter((p) => p.problemas.length).length;
  return (
    <div className="flex flex-col gap-2 border-t border-relieve pt-4">
      <p className="text-[15px] leading-tight">
        <span className="font-extrabold">Sus procesos</span>{" "}
        <span className="text-tenue">
          · {lista.length === 1 ? "1 proceso" : `${lista.length} procesos`} en factory/procesos/{conProblemas ? ` · ${conProblemas === 1 ? "1 no cumple" : `${conProblemas} no cumplen`} el formato` : ""}
        </span>
      </p>
      <p className="text-sm text-tenue">
        Corre lo que tiene commit, en la raíz, con la raíz sin cambios. El push empuja solo su rama, sin forzar, y abre el PR; integrarlo es tuyo. En un paso aprobacion espera tu clic; un paso tarea suelto todavía no corre. Si un paso falla, se deshace lo hecho. Un agente no puede tocarlos.
      </p>
      <ul className="flex flex-col gap-2">
        {lista.map((p) => {
          const noCorre = p.borrador ? "Es un borrador: quítale «borrador: si» cuando sus comandos sean los de este proyecto." : p.problemas.length ? "Tiene problemas de formato: corrígelos antes de correrlo." : null;
          return (
            <li key={p.archivo}>
              <details className={`rounded-2xl bg-relieve px-4 py-3 ${p.problemas.length ? "outline-2 outline-aviso outline-solid" : ""}`}>
                <summary className="cursor-pointer">
                  <span className="font-bold">{p.nombre || p.archivo}</span>{" "}
                  <span className="text-sm text-tenue">
                    · {CUANDO[p.cuando] ?? (p.cuando || "sin cuándo")}
                    {p.rama && <> · rama {p.rama}</>} · {p.pasos.length === 1 ? "1 paso" : `${p.pasos.length} pasos`}
                  </span>
                  {p.borrador && <span className="ml-2 rounded-full bg-papel px-2 py-0.5 text-xs font-extrabold text-fondo">borrador</span>}
                  {p.problemas.length > 0 && <span className="ml-2 text-sm font-bold text-aviso">{p.problemas.length === 1 ? "1 problema" : `${p.problemas.length} problemas`}</span>}
                </summary>
                <div className="flex flex-col gap-3 pt-3">
                  <p className="font-mono text-xs text-tenue">factory/procesos/{p.archivo}</p>
                  {p.problemas.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm">
                      {p.problemas.map((q, i) => (
                        <li key={i}>
                          {q.linea !== null && <code className="font-mono text-xs">línea {q.linea}</code>} <span className="text-aviso">{q.que}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <ol className="flex flex-col gap-1.5 text-sm">
                    {p.pasos.map((s) => (
                      <li key={s.linea} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="rounded-full bg-ficha px-2.5 py-0.5 text-xs font-bold">{PASO[s.tipo] ?? s.tipo}</span>
                        <span className="font-mono text-[13px] break-all">{s.texto}</span>
                        {p.sinDeshacer.includes(s.linea) && <span className="text-xs text-tenue">no se deshace</span>}
                      </li>
                    ))}
                  </ol>
                  {p.pasos.some((s) => s.tipo === "evaluacion") && <Puntajes lista={puntajes[p.id] ?? []} />}
                  {p.sinDeshacer.length > 0 && <p className="text-xs text-tenue">Con pasos que no se deshacen, producción nunca podrá salir sola en este proceso: siempre va a esperar tu clic.</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={ocupada || pidiendo || corriendo || noCorre !== null} className={PRINCIPAL} onClick={() => void hacer({ accion: "correr", proceso: p.id })}>
                      Correrlo ahora
                    </button>
                    {noCorre && <span className="text-sm text-tenue">{noCorre}</span>}
                  </div>
                  {p.pasos.some((s) => s.tipo === "aprobacion") && (
                    <SinSuClic
                      quitado={sinClic.includes(p.id)}
                      porQue={condiciones[p.id] ?? []}
                      ocupada={ocupada || pidiendo}
                      cambiar={(valor) => void hacer({ accion: "sin_clic", proceso: p.id, valor })}
                    />
                  )}
                  {(p.cuando === "al-integrar" || p.cuando === "cada-dia" || p.cuando === "cada-semana") && (
                    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
                      <input type="checkbox" className="size-4" checked={solos.includes(p.id)} disabled={ocupada || pidiendo} onChange={(ev) => void hacer({ accion: "solo", proceso: p.id, valor: ev.target.checked })} />
                      <span>
                        <span className="font-bold">Que arranque solo</span>{" "}
                        {p.cuando === "al-integrar"
                          ? "cada vez que la fábrica integre una tarea en esta línea, en este equipo. Lo integrado hasta ahora no cuenta."
                          : `${p.cuando === "cada-dia" ? "una vez al día" : "una vez a la semana"}, en este equipo, mientras la aplicación esté abierta.`}
                      </span>
                    </label>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="rounded-2xl bg-relieve px-4 py-3 text-sm text-aviso">
          {error}
        </p>
      )}
      {ejecucion && <LaUltimaVez e={ejecucion} pidiendo={pidiendo} detener={() => void hacer({ accion: "detener" })} responder={(aprobar) => void hacer({ accion: aprobar ? "aprobar" : "no_aprobar" })} />}
      {botonCrear && <div>{botonCrear}</div>}
    </div>
  );
}

function LaUltimaVez({ e, pidiendo, detener, responder }: { e: Ejecucion; pidiendo: boolean; detener: () => void; responder: (aprobar: boolean) => void }) {
  const corriendo = e.estado === "corriendo" || e.estado === "esperando";
  const espera = e.estado === "esperando" ? e.pasos.find((p) => p.estado === "esperando") : undefined;
  const cuando = new Date(e.fin ?? e.inicio).toLocaleString("es", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  return (
    <section aria-live="polite" className={`flex flex-col gap-2 rounded-2xl bg-relieve px-4 py-3 ${e.estado === "fallo" ? "outline-2 outline-aviso outline-solid" : ""}`}>
      <p className="text-sm">
        <span className="font-bold">{corriendo ? "Corriendo ahora" : "La última vez"}:</span> {e.nombre || e.proceso} <span className={e.estado === "fallo" ? "font-bold text-aviso" : "text-tenue"}>· {ESTADO_DE_LA_EJECUCION[e.estado] ?? e.estado}</span>
        <span className="text-tenue">
          {" "}
          · {cuando} · commit <code className="font-mono text-xs">{e.commit.slice(0, 10)}</code>
        </span>
      </p>
      {e.origen === "al-integrar" && <p className="text-sm text-tenue">Arrancó solo, al integrarse una tarea.</p>}
      {e.origen === "periodico" && <p className="text-sm text-tenue">Corrió solo, como le tocaba.</p>}
      {espera && (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl bg-ficha px-4 py-3 outline-2 outline-realce outline-solid">
          <p className="text-sm">
            <strong>Espera tu clic para: {espera.texto}.</strong> Todo lo anterior pasó. Si lo apruebas, sigue con el commit <code className="font-mono text-xs">{e.commit.slice(0, 10)}</code>, el mismo que pasó por prueba; si no, lo hecho hasta aquí queda como está.
          </p>
          {espera.nota && espera.nota !== "Espera tu clic." && <p className="text-xs text-tenue">{espera.nota}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pidiendo} className={PRINCIPAL} onClick={() => responder(true)}>
              Aprobar
            </button>
            <button type="button" disabled={pidiendo} className={BOTON} onClick={() => responder(false)}>
              No aprobar
            </button>
          </div>
        </div>
      )}
      {e.motivo && <p className="text-sm">{e.motivo}</p>}
      {e.paradoEn && <p className="text-sm text-tenue">Se detuvo en la línea {e.paradoEn.linea} ({PASO[e.paradoEn.tipo] ?? e.paradoEn.tipo}): ese tipo de paso todavía no corre.</p>}
      <ol className="flex flex-col gap-1.5 text-sm">
        {e.pasos.map((p) => (
          <li key={p.linea} className="flex flex-col gap-0.5">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className={`text-xs font-bold ${MALOS.has(p.estado) ? "text-aviso" : "text-tenue"}`}>{ESTADO_DEL_PASO[p.estado] ?? p.estado}</span>
              <span className="font-mono text-[13px] break-all">{p.texto}</span>
              {p.ms !== null && p.ms > 0 && <span className="text-xs text-tenue">{p.ms < 1000 ? `${p.ms} ms` : `${Math.round(p.ms / 1000)} s`}</span>}
            </span>
            {p.nota && <span className="text-xs text-tenue">{p.nota}</span>}
            {p.salida && (
              <details>
                <summary className="cursor-pointer text-xs text-tenue">Lo último que dijo</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded-xl bg-ficha px-3 py-2 font-mono text-xs whitespace-pre-wrap">{p.salida}</pre>
              </details>
            )}
          </li>
        ))}
      </ol>
      <p className="text-xs text-tenue">
        La salida entera queda en datos/procesos/{e.linea}/{e.id}.log, con las claves tapadas; en el repositorio, una línea en factory/procesos/registro/.
      </p>
      {corriendo && (
        <div>
          <button type="button" disabled={pidiendo} className={BOTON} onClick={detener}>
            Detener
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Los últimos puntajes de la evaluación de un proceso, del más viejo al más nuevo: solo números,
 * y si pasó. Lo que dijo el comando no se muestra aquí.
 */
function Puntajes({ lista }: { lista: PuntajeALaVista[] }) {
  const ultimo = lista.at(-1);
  if (!ultimo) return <p className="text-sm text-tenue">Todavía no midió ningún puntaje.</p>;
  const fecha = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm">
        <span className="font-bold">Últimos puntajes</span>{" "}
        <span className="text-tenue">
          · el último, {ultimo.puntaje.toFixed(3)}: {ultimo.casos - ultimo.fallidos} de {ultimo.casos} casos bien
        </span>
      </p>
      <ol className="flex flex-wrap gap-1.5">
        {lista.map((x) => (
          <li key={x.id} className={`flex flex-col items-center rounded-xl bg-ficha px-2.5 py-1 ${x.paso ? "" : "outline-2 outline-aviso outline-solid"}`}>
            <span className={`font-mono text-[13px] font-bold ${x.paso ? "" : "text-aviso"}`}>{x.puntaje.toFixed(3)}</span>
            <span className="text-xs text-tenue">
              {fecha(x.fecha)}
              {x.paso ? "" : " · no pasó"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Quitar su clic para producción en un proceso de esta línea. Solo se puede si el proceso cumple
 * las condiciones; si deja de cumplirlas, vuelve a esperar su clic aunque esté quitado.
 */
function SinSuClic({ quitado, porQue, ocupada, cambiar }: { quitado: boolean; porQue: string[]; ocupada: boolean; cambiar: (valor: boolean) => void }) {
  const puede = porQue.length === 0;
  return (
    <div className="flex flex-col gap-1.5">
      <label className={`flex min-h-10 items-center gap-2.5 text-sm ${puede || quitado ? "cursor-pointer" : "opacity-70"}`}>
        <input type="checkbox" className="size-4" checked={quitado} disabled={ocupada || (!puede && !quitado)} onChange={(ev) => cambiar(ev.target.checked)} />
        <span>
          <span className="font-bold">Producción sin tu clic</span> en esta línea, mientras cumpla las condiciones.
        </span>
      </label>
      {!puede && (
        <ul className="flex list-disc flex-col gap-0.5 pl-9 text-xs text-tenue">
          {porQue.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      )}
      {quitado && !puede && <p className="pl-6.5 text-xs font-bold text-aviso">Está quitado, pero ya no cumple: va a esperar tu clic.</p>}
    </div>
  );
}
