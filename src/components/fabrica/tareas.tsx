"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Planta } from "@/lib/fabrica/planta/disco";
import { ETAPAS_DE_LA_PLANTA, filtrarTarjetas, NOMBRE_DE_ETAPA, NOMBRE_DE_ORIGEN, type FiltroDeTareas, type OrigenDeTarea } from "@/lib/fabrica/planta/lectura";
import { EstadoDeLaLinea, hace, pieDeTarjeta, rutaDeTarea, TarjetaChica } from "./piezas";
import { AlDia, usePlanta } from "./use-planta";

/**
 * Las tareas de todas las líneas, como en el lienzo: agrupadas por línea y etapa, solo por etapa, o
 * en una lista, con filtros. Solo muestra: cada tarjeta lleva a su tarea en su línea. Los filtros
 * quedan en la dirección de la página, para volver a ellos.
 */

export type Agrupar = "linea" | "etapa" | "lista";
export type VistaDeTareas = FiltroDeTareas & { agrupar: Agrupar };

const AGRUPAR: { id: Agrupar; nombre: string }[] = [
  { id: "linea", nombre: "Línea y etapa" },
  { id: "etapa", nombre: "Solo etapa" },
  { id: "lista", nombre: "Lista" },
];
const ORIGENES = Object.keys(NOMBRE_DE_ORIGEN) as OrigenDeTarea[];

export function TareasDeTodas({ inicial, vista: vistaInicial }: { inicial: Planta; vista: VistaDeTareas }) {
  const { planta, ahora, sinRespuesta, segundos } = usePlanta(inicial);
  const [vista, setVista] = useState(vistaInicial);

  function cambiar(cambio: Partial<VistaDeTareas>) {
    const nueva = { ...vista, ...cambio };
    setVista(nueva);
    const url = new URL(window.location.href);
    const poner = (k: string, v: string | undefined) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    poner("q", nueva.texto?.trim() || undefined);
    poner("linea", nueva.linea || undefined);
    poner("origen", nueva.origen || undefined);
    poner("esperan", nueva.soloEsperan ? "1" : undefined);
    poner("agrupar", nueva.agrupar === "linea" ? undefined : nueva.agrupar);
    window.history.replaceState(null, "", url);
  }

  const todas = useMemo(() => planta.lineas.flatMap((l) => l.tarjetas.map((t) => ({ ...t, linea: l.id, nombreDeLinea: l.nombre }))), [planta]);
  const filtradas = useMemo(() => filtrarTarjetas(todas, vista), [todas, vista]);
  const trabajos = new Map(planta.puestos.ocupados.filter((p) => p.tarea).map((p) => [`${p.linea}/${p.tarea}`, p]));
  const lineas = vista.linea ? planta.lineas.filter((l) => l.id === vista.linea) : planta.lineas;
  const abiertas = todas.filter((t) => t.etapa !== "hechas").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-sm text-tenue">
          Todas las líneas a la vez · {abiertas} {abiertas === 1 ? "abierta" : "abiertas"}, {planta.numeros.teEsperan} te {planta.numeros.teEsperan === 1 ? "espera" : "esperan"}
        </p>
        <AlDia segundos={segundos} sinRespuesta={sinRespuesta} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="pb-1.5 text-sm font-bold">Agrupar por</legend>
          <div className="flex gap-1 rounded-full bg-ficha p-1">
            {AGRUPAR.map((a) => (
              <label key={a.id} className={`flex min-h-10 cursor-pointer items-center rounded-full px-4 text-sm font-bold has-focus-visible:outline-2 has-focus-visible:outline-papel has-focus-visible:outline-solid ${vista.agrupar === a.id ? "bg-papel text-tinta" : "text-tenue"}`}>
                <input type="radio" name="agrupar" value={a.id} checked={vista.agrupar === a.id} onChange={() => cambiar({ agrupar: a.id })} className="sr-only" />
                {a.nombre}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex min-w-48 flex-[2_1_14rem] flex-col gap-1.5 text-sm font-bold">
          Buscar
          <input type="search" value={vista.texto ?? ""} onChange={(e) => cambiar({ texto: e.target.value })} placeholder="Id, título, issue o rama" className="min-h-10 rounded-2xl bg-relieve px-3.5 text-sm font-normal placeholder:text-tenue" />
        </label>
        <label className="flex flex-[1_1_10rem] flex-col gap-1.5 text-sm font-bold">
          Línea
          <select value={vista.linea ?? ""} onChange={(e) => cambiar({ linea: e.target.value })} className="min-h-10 rounded-2xl bg-relieve px-3 text-sm font-normal">
            <option value="">Todas</option>
            {planta.lineas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-[1_1_10rem] flex-col gap-1.5 text-sm font-bold">
          De dónde entró
          <select value={vista.origen ?? ""} onChange={(e) => cambiar({ origen: e.target.value as OrigenDeTarea | "" })} className="min-h-10 rounded-2xl bg-relieve px-3 text-sm font-normal">
            <option value="">Todas</option>
            {ORIGENES.map((o) => (
              <option key={o} value={o}>
                {NOMBRE_DE_ORIGEN[o]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm font-bold">
          <input type="checkbox" checked={!!vista.soloEsperan} onChange={(e) => cambiar({ soloEsperan: e.target.checked })} className="size-5" />
          Solo las que te esperan
        </label>
      </div>

      {filtradas.length === 0 && <p className="rounded-[22px] bg-ficha p-5 text-sm text-tenue">{todas.length === 0 ? "No hay tareas abiertas ni hechas hoy en ninguna línea." : "Ninguna tarea pasa estos filtros."}</p>}

      {filtradas.length > 0 && vista.agrupar === "linea" && (
        <div tabIndex={0} role="region" aria-label="Tareas por línea y etapa" className="overflow-x-auto pb-2">
          <div role="table" aria-label="Tareas por línea y etapa" className="flex min-w-[1100px] flex-col gap-2">
            <div role="row" className="grid grid-cols-[170px_repeat(7,minmax(0,1fr))] gap-2">
              <span role="columnheader" className="px-2 text-xs font-extrabold text-tenue uppercase">
                Línea
              </span>
              {ETAPAS_DE_LA_PLANTA.map((e) => (
                <span key={e} role="columnheader" className="px-2 text-xs font-extrabold text-tenue uppercase">
                  {NOMBRE_DE_ETAPA[e]}
                </span>
              ))}
            </div>
            {lineas.map((l) => {
              const suyas = filtradas.filter((t) => t.linea === l.id);
              if (!suyas.length && (vista.texto || vista.origen || vista.soloEsperan)) return null;
              return (
                <div key={l.id} role="row" className={`grid grid-cols-[170px_repeat(7,minmax(0,1fr))] gap-2 rounded-[18px] bg-ficha p-2 ${l.estado === "error" ? "outline-2 outline-peligro outline-solid" : ""}`}>
                  <div role="rowheader" className="flex flex-col items-start gap-1 p-1.5">
                    <Link href={`/fabrica/lineas/${encodeURIComponent(l.id)}`} className="font-extrabold underline-offset-4 hover:underline">
                      {l.nombre}
                    </Link>
                    <EstadoDeLaLinea estado={l.estado} />
                  </div>
                  {ETAPAS_DE_LA_PLANTA.map((e) => (
                    <div key={e} role="cell" className="flex min-h-16 flex-col gap-1.5 rounded-xl bg-relieve p-1.5">
                      {suyas
                        .filter((t) => t.etapa === e)
                        .map((t) => (
                          <TarjetaChica key={t.id} t={t} href={rutaDeTarea(t.linea, t.id)} trabajando={trabajos.has(`${t.linea}/${t.id}`)} pie={pieDeTarjeta(t, ahora, trabajos.get(`${t.linea}/${t.id}`))} />
                        ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filtradas.length > 0 && vista.agrupar === "etapa" && (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1100px] grid-cols-7 gap-2">
            {ETAPAS_DE_LA_PLANTA.map((e) => {
              const deLaEtapa = filtradas.filter((t) => t.etapa === e);
              return (
                <section key={e} aria-label={NOMBRE_DE_ETAPA[e]} className="flex min-h-40 flex-col gap-2 rounded-2xl bg-relieve p-2">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-xs font-extrabold uppercase">{NOMBRE_DE_ETAPA[e]}</h2>
                    <span className="text-xs font-bold text-tenue">{deLaEtapa.length}</span>
                  </div>
                  {deLaEtapa.map((t) => (
                    <TarjetaChica key={`${t.linea}/${t.id}`} t={t} linea={t.nombreDeLinea} href={rutaDeTarea(t.linea, t.id)} trabajando={trabajos.has(`${t.linea}/${t.id}`)} pie={pieDeTarjeta(t, ahora, trabajos.get(`${t.linea}/${t.id}`))} />
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {filtradas.length > 0 && vista.agrupar === "lista" && (
        <div tabIndex={0} role="region" aria-label="Lista de tareas" className="overflow-x-auto rounded-[22px] bg-ficha p-4">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-tenue uppercase">
                <th scope="col" className="py-1.5 pr-3 font-extrabold">Línea</th>
                <th scope="col" className="py-1.5 pr-3 font-extrabold">Tarea</th>
                <th scope="col" className="py-1.5 pr-3 font-extrabold">Etapa</th>
                <th scope="col" className="py-1.5 pr-3 font-extrabold">Entró de</th>
                <th scope="col" className="py-1.5 font-extrabold">Desde</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((t) => (
                <tr key={`${t.linea}/${t.id}`} className="border-t border-relieve">
                  <td className="py-2 pr-3 font-bold">{t.nombreDeLinea}</td>
                  <td className="py-2 pr-3">
                    <Link href={rutaDeTarea(t.linea, t.id)} className="underline-offset-4 hover:underline">
                      <span className="font-mono font-bold">{t.id}</span> {t.titulo}
                    </Link>
                    {t.espera && <span className="ml-2 rounded-full bg-aviso px-1.5 text-[11px] font-extrabold text-tinta">Te espera</span>}
                  </td>
                  <td className="py-2 pr-3">{NOMBRE_DE_ETAPA[t.etapa]}</td>
                  <td className="py-2 pr-3 text-tenue">{t.origenTexto}</td>
                  <td className="py-2 text-tenue">{hace(t.desde, ahora) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
