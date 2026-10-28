"use client";

import Link from "next/link";
import type { LineaDeLaPlanta, Planta as DatosDeLaPlanta } from "@/lib/fabrica/planta/disco";
import { ETAPAS_DE_LA_PLANTA, NOMBRE_DE_ETAPA, porcentajeALaPrimera, type EtapaDeLaPlanta } from "@/lib/fabrica/planta/lectura";
import { duracion, EstadoDeLaLinea, hace, hora, Inicial, rutaDeTarea, usd } from "./piezas";
import { AlDia, usePlanta } from "./use-planta";

/**
 * La planta: todas las líneas a la vez, como en el lienzo. Solo muestra: lo que se hace con una
 * tarea se hace en su línea. Se vuelve a leer cada pocos segundos mientras la pestaña se ve.
 */

export function Planta({ inicial }: { inicial: DatosDeLaPlanta }) {
  const { planta, ahora, sinRespuesta, segundos } = usePlanta(inicial);
  const n = planta.numeros;
  const primera = porcentajeALaPrimera(n.aLaPrimera);
  const masVieja = hace(n.esperaMasVieja, ahora);
  const sinLineas = planta.lineas.length === 0;

  if (sinLineas) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-[22px] bg-ficha p-6">
        <h2 className="text-lg font-extrabold">Todavía no hay líneas</h2>
        <p className="max-w-xl text-sm text-tenue">Una línea es un repositorio con git: la fábrica le arma su carpeta factory/ y trabaja su cola. Elige la primera en la configuración.</p>
        <Link href="/configuracion#fabrica" className="flex min-h-11 items-center rounded-full bg-acento px-5 text-sm font-extrabold text-papel">
          Agregar una línea
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="-mt-2">
        <AlDia segundos={segundos} sinRespuesta={sinRespuesta} />
      </div>

      <div className="flex min-w-0 flex-col gap-5">
          <section aria-label="La planta en números" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Numero etiqueta="Líneas corriendo" valor={String(n.corriendo)} de={`de ${n.lineas}`} detalle={`${n.abiertas} ${n.abiertas === 1 ? "abierta" : "abiertas"} en la planta`} />
            <Numero etiqueta="Te esperan" valor={String(n.teEsperan)} detalle={masVieja ? `La más vieja: ${masVieja.replace("hace ", "")}` : "Nada te espera"} llama={n.teEsperan > 0} />
            <Numero etiqueta="Hechas hoy" valor={String(n.hechasHoy)} detalle={`${usd(n.gastoHoyUsd)} USD hoy`} />
            <Numero etiqueta="A la primera" valor={primera === null ? "—" : `${primera}%`} detalle={n.aLaPrimera ? `${n.aLaPrimera.sinVolver} de ${n.aLaPrimera.hechas}, en 7 días` : "Sin hechas en 7 días"} />
          </section>

          <section aria-labelledby="t-puestos" className="flex flex-col gap-3 rounded-[22px] bg-ficha p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="t-puestos" className="text-lg font-extrabold">
                Puestos de trabajo
              </h2>
              <span className="text-sm text-tenue">
                {planta.puestos.maximo === null ? (
                  "Ninguna línea corre ahora"
                ) : (
                  <>
                    <strong className="text-texto">
                      {planta.puestos.ocupados.length} de {planta.puestos.maximo}
                    </strong>{" "}
                    ocupados · los de la línea que corre
                  </>
                )}
              </span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: Math.max(planta.puestos.maximo ?? 0, planta.puestos.ocupados.length) }, (_, i) => {
                const p = planta.puestos.ocupados[i];
                return p ? (
                  <li key={i} className="flex flex-col gap-0.5 rounded-2xl bg-realce px-3.5 py-2.5">
                    <span className="text-xs font-bold text-tenue">
                      Puesto {i + 1} · {p.nombreDeLinea}
                    </span>
                    <span className="text-sm font-extrabold">{p.tarea ?? "La corrida"}</span>
                    <span className="truncate text-xs text-tenue">
                      {p.agente} · {hace(p.desde, ahora)?.replace("hace ", "") ?? "—"}
                    </span>
                  </li>
                ) : (
                  <li key={i} className="flex flex-col gap-0.5 rounded-2xl border-2 border-dashed border-relieve px-3.5 py-2.5">
                    <span className="text-xs font-bold text-tenue">Puesto {i + 1}</span>
                    <span className="text-sm font-extrabold text-tenue">Libre</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-tenue">Hoy corre una línea a la vez, con sus puestos. Repartirlos entre varias líneas llega con el cambio a la fábrica.</p>
          </section>

          <CadaLinea lineas={planta.lineas} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="t-esperan" className="flex flex-col gap-3 rounded-[22px] bg-ficha p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="t-esperan" className="text-lg font-extrabold">
              Te esperan <span className="text-tenue">· {planta.teEsperan.length}</span>
            </h2>
            <Link href="/fabrica/tareas?esperan=1" className="text-sm font-bold underline-offset-4 hover:underline">
              Ver todas
            </Link>
          </div>
          {planta.teEsperan.length === 0 ? (
            <p className="text-sm text-tenue">Nada te espera. Las preguntas de las tareas y los veredictos que te piden aparecen aquí.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {planta.teEsperan.slice(0, 8).map((t) => {
                return (
                  <article key={`${t.linea}/${t.id}`} className="flex flex-col gap-2 rounded-2xl bg-relieve p-3.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${t.espera === "pregunta" ? "bg-aviso text-tinta" : "bg-papel text-tinta"}`}>{t.espera === "pregunta" ? "Pregunta" : "Veredicto"}</span>
                      <span className="font-bold text-tenue">{t.nombreDeLinea}</span>
                      <span className="font-mono font-bold">{t.id}</span>
                      <span className="min-w-0 flex-1 basis-40 font-bold">{t.titulo}</span>
                      <span className="text-xs text-tenue">{hace(t.desde, ahora)}</span>
                    </div>
                    {t.motivo && <p className="text-sm text-tenue">{t.motivo}</p>}
                    <div>
                      <Link href={rutaDeTarea(t.linea, t.id)} className="inline-flex min-h-10 items-center rounded-full bg-realce px-4 text-sm font-bold">
                        {t.espera === "pregunta" ? "Responder" : "Ver y decidir"}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="t-corridas" className="flex flex-col gap-3 rounded-[22px] bg-ficha p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="t-corridas" className="text-lg font-extrabold">
              Corridas de hoy <span className="text-tenue">· {planta.corridas.length}</span>
            </h2>
            <span className="text-sm text-tenue">{usd(planta.corridas.reduce((s, c) => s + (c.costoUsd ?? 0), 0))} USD en total</span>
          </div>
          {planta.corridas.length === 0 ? (
            <p className="text-sm text-tenue">Hoy no corrió ninguna línea.</p>
          ) : (
            <div tabIndex={0} role="region" aria-label="Tabla de corridas de hoy" className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-tenue uppercase">
                    <th scope="col" className="py-1.5 pr-3 font-extrabold">Línea</th>
                    <th scope="col" className="py-1.5 pr-3 font-extrabold">Empezó</th>
                    <th scope="col" className="py-1.5 pr-3 font-extrabold">Duró</th>
                    <th scope="col" className="py-1.5 text-right font-extrabold">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {planta.corridas.map((c) => (
                    <tr key={c.id} className="border-t border-relieve">
                      <td className="py-2 pr-3">
                        <span className="flex flex-col">
                          <span className="font-bold">{c.nombreDeLinea ?? "Una línea que ya no está"}</span>
                          <span className={`text-xs ${c.estado === "fallida" || c.estado === "detenida" ? "text-peligro" : "text-tenue"}`}>
                            {ESTADO_DE_CORRIDA[c.estado ?? "sin"]} · {c.tareas.length ? c.tareas.join(", ") : "toda la cola"}
                          </span>
                        </span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{hora(c.inicio)}</td>
                      <td className="py-2 pr-3 tabular-nums">{duracion(c.duracionMs)}</td>
                      <td className="py-2 text-right tabular-nums">{usd(c.costoUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="t-lineas" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="t-lineas" className="text-lg font-extrabold">
            Líneas de producción
          </h2>
          <Link href="/configuracion#fabrica" className="text-sm font-bold underline-offset-4 hover:underline">
            Agregar una línea
          </Link>
        </div>
        {planta.lineas.map((l) => (
          <LineaDeProduccion key={l.id} l={l} trabajando={planta.puestos.ocupados.filter((p) => p.linea === l.id).map((p) => p.tarea)} />
        ))}
      </section>
    </div>
  );
}

const ESTADO_DE_CORRIDA: Record<string, string> = { corriendo: "En curso", terminada: "Terminó", fallida: "Falló", detenida: "Se detuvo", sin: "Sin cerrar" };

function Numero({ etiqueta, valor, de, detalle, llama }: { etiqueta: string; valor: string; de?: string; detalle: string; llama?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-[22px] bg-ficha p-4 ${llama ? "outline-2 outline-aviso outline-solid" : ""}`}>
      <span className="text-xs font-extrabold text-tenue">{etiqueta}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[32px] leading-none font-extrabold tabular-nums">{valor}</span>
        {de && <span className="text-sm font-bold text-tenue">{de}</span>}
      </span>
      <span className={`text-xs font-bold ${llama ? "text-aviso" : "text-tenue"}`}>{detalle}</span>
    </div>
  );
}

function CadaLinea({ lineas }: { lineas: LineaDeLaPlanta[] }) {
  return (
    <section aria-labelledby="t-porlinea" className="flex flex-col gap-3 rounded-[22px] bg-ficha p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-porlinea" className="text-lg font-extrabold">
          Cada línea, hoy
        </h2>
        <span className="text-xs text-tenue">«A la primera»: hechas sin volver a construcción, últimos 7 días</span>
      </div>
      <div tabIndex={0} role="region" aria-label="Tabla de cada línea" className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-xs text-tenue uppercase">
              <th scope="col" className="py-1.5 pr-3 font-extrabold">Línea</th>
              <th scope="col" className="py-1.5 pr-3 font-extrabold">Estado</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-extrabold">Abiertas</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-extrabold">Te esperan</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-extrabold">Hechas hoy</th>
              <th scope="col" className="py-1.5 pr-3 font-extrabold">A la primera</th>
              <th scope="col" className="py-1.5 text-right font-extrabold">USD hoy</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => {
              const p = porcentajeALaPrimera(l.numeros?.aLaPrimera ?? null);
              return (
                <tr key={l.id} className="border-t border-relieve">
                  <th scope="row" className="py-2 pr-3 text-left">
                    <Link href={`/fabrica/lineas/${encodeURIComponent(l.id)}`} className="flex items-center gap-2 font-bold underline-offset-4 hover:underline">
                      <Inicial nombre={l.nombre} />
                      {l.nombre}
                    </Link>
                  </th>
                  <td className="py-2 pr-3">
                    <EstadoDeLaLinea estado={l.estado} />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.numeros?.abiertas ?? "—"}</td>
                  <td className={`py-2 pr-3 text-right font-bold tabular-nums ${l.numeros?.teEsperan ? "text-aviso" : "text-tenue"}`}>{l.numeros?.teEsperan ?? "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.numeros?.hechasHoy ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-relieve">
                        <span className="block h-full rounded-full bg-papel" style={{ width: `${p ?? 0}%` }} />
                      </span>
                      <span className="tabular-nums">{p === null ? "—" : `${p}%`}</span>
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{usd(l.gastoHoyUsd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LineaDeProduccion({ l, trabajando }: { l: LineaDeLaPlanta; trabajando: (string | null)[] }) {
  const enEtapa = (e: EtapaDeLaPlanta) => l.tarjetas.filter((t) => t.etapa === e);
  return (
    <article aria-label={l.nombre} className={`flex flex-col gap-3 rounded-[22px] bg-ficha p-5 ${l.estado === "error" ? "outline-2 outline-peligro outline-solid" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Inicial nombre={l.nombre} grande />
        <div className="flex min-w-0 flex-1 basis-56 flex-col">
          <Link href={`/fabrica/lineas/${encodeURIComponent(l.id)}`} className="text-[17px] font-extrabold underline-offset-4 hover:underline">
            {l.nombre}
          </Link>
          <span className="truncate text-sm text-tenue">
            {[l.stack, l.rama ? `rama ${l.rama}` : null].filter(Boolean).join(" · ") || l.raiz}
          </span>
        </div>
        <EstadoDeLaLinea estado={l.estado} />
        {l.entradas.length > 0 && (
          <span className="text-sm text-tenue">
            Entra de: <strong className="text-texto">{l.entradas.join(" · ")}</strong>
          </span>
        )}
      </div>
      {l.numeros && (
        <ol aria-label={`Tareas de ${l.nombre} por etapa`} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {ETAPAS_DE_LA_PLANTA.map((e) => {
            const tareas = enEtapa(e);
            const espera = tareas.some((t) => t.espera);
            const trabaja = tareas.some((t) => trabajando.includes(t.id));
            const nota = espera ? "te espera" : trabaja ? "trabajando" : tareas.length === 0 ? "—" : e === "hechas" ? "hoy" : "en cola";
            return (
              <li key={e} className={`flex flex-col gap-0.5 rounded-xl px-3 py-2 ${espera ? "bg-relieve outline-2 outline-aviso outline-solid" : trabaja ? "bg-realce" : "bg-relieve"}`}>
                <span className="text-xs font-bold text-tenue">{NOMBRE_DE_ETAPA[e]}</span>
                <span className="text-xl leading-tight font-extrabold tabular-nums">{tareas.length}</span>
                <span className={`text-xs font-bold ${espera ? "text-aviso" : "text-tenue"}`}>{nota}</span>
              </li>
            );
          })}
        </ol>
      )}
      {l.error && <p className={`text-sm ${l.estado === "error" ? "text-peligro" : "text-tenue"}`}>{l.error}</p>}
    </article>
  );
}
