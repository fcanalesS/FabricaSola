"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { BOTON, CAMPO, PRINCIPAL } from "@/components/entrada/pedir";
import type { DocumentoDeMemoria, Hallazgo } from "@/lib/fabrica/memoria/formato";
import type { MemoriaALaVista } from "@/lib/fabrica/memoria/pantalla";
import { AREA, datosDe, FormularioDeDocumento, paraLaRuta, Secciones, Temas } from "./documento";
import { DetalleDeHabilidad, Habilidades } from "./habilidades";
import { buscarEnElVault, enLaMemoria, type ContestadoPorLaMemoria } from "./pedir";

/**
 * La pantalla Memoria: elegir la línea o la planta y, de su vault, revisar
 * las propuestas, corregir la ficha, ver y reemplazar decisiones, leer la
 * bitácora, buscar y, en una línea, ver y asignar sus habilidades. Cada
 * cambio es un clic suyo, y la aplicación no hace commit: se lo recuerda
 * mientras haya archivos sin subir.
 */

type Pestana = "propuestas" | "ficha" | "decisiones" | "bitacora" | "habilidades" | "buscar";
type Hacer = (cuerpo: Record<string, unknown>) => Promise<ContestadoPorLaMemoria & { ok: boolean }>;
type Aviso = { texto: string; malo: boolean; avisos: string[] };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function Memoria({ inicial }: { inicial: MemoriaALaVista }) {
  const [memoria, setMemoria] = useState(inicial);
  const abiertas = memoria.propuestas.filter((p) => p.estado === "propuesta");
  const [pestana, setPestana] = useState<Pestana>(abiertas.length ? "propuestas" : "ficha");
  const [ocupada, setOcupada] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const idPanel = useId();

  const hacer: Hacer = async (cuerpo) => {
    setOcupada(true);
    setAviso(null);
    const r = await enLaMemoria({ ...cuerpo, en: memoria.en });
    if (r.memoria) setMemoria(r.memoria);
    setAviso(r.ok ? { texto: r.nota ?? "Hecho.", malo: false, avisos: r.avisos ?? [] } : { texto: r.error ?? "No se pudo.", malo: true, avisos: [] });
    setOcupada(false);
    return r;
  };

  const enlace = (en: string) => `/fabrica/memoria?en=${encodeURIComponent(en)}`;
  const pestanas: { id: Pestana; nombre: string }[] = [
    { id: "propuestas", nombre: `Propuestas${abiertas.length ? ` · ${abiertas.length}` : ""}` },
    { id: "ficha", nombre: "Ficha" },
    { id: "decisiones", nombre: "Decisiones" },
    { id: "bitacora", nombre: "Bitácora" },
    ...(memoria.habilidades ? [{ id: "habilidades" as const, nombre: "Habilidades" }] : []),
    { id: "buscar", nombre: "Buscar" },
  ];
  // Si se cambia a la planta, que no tiene habilidades, se vuelve a la ficha.
  const vista: Pestana = pestana === "habilidades" && !memoria.habilidades ? "ficha" : pestana;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="De qué proyecto" className="flex flex-wrap gap-1.5">
        {memoria.lugares.map((l) => {
          const aqui = l.en === memoria.en;
          return (
            <Link
              key={l.en}
              href={enlace(l.en)}
              aria-current={aqui ? "page" : undefined}
              className={`flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold ${aqui ? "bg-papel text-fondo" : "bg-relieve"} ${l.existe ? "" : "opacity-70"}`}
            >
              {l.nombre}
              {l.porRevisar > 0 && (
                <span aria-label={`${l.porRevisar} por revisar`} className={`rounded-full px-2 text-xs font-extrabold ${aqui ? "bg-fondo text-papel" : "bg-realce"}`}>
                  {l.porRevisar}
                </span>
              )}
              {!l.existe && <span className="text-xs font-normal">sin memoria</span>}
            </Link>
          );
        })}
      </nav>

      {aviso && (
        <div role={aviso.malo ? "alert" : "status"} className={`rounded-2xl bg-relieve px-4 py-3 text-sm ${aviso.malo ? "text-aviso" : ""}`}>
          <p>{aviso.texto}</p>
          {aviso.avisos.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-tenue">
              {aviso.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!memoria.existe ? (
        <section className="flex flex-col items-center gap-3 rounded-[28px] bg-ficha px-6 py-10 text-center">
          <h2 className="text-lg font-extrabold">{memoria.esPlanta ? "La planta todavía no tiene memoria" : `${memoria.nombre} todavía no tiene memoria`}</h2>
          <p className="max-w-lg text-sm text-tenue">
            {memoria.esPlanta
              ? "Lo que vale en todos los proyectos: el idioma de los comentarios, las convenciones de la casa. Se crea vacía, y la escribes tú."
              : "Se crea en factory/memoria/, con lo que dicen sus manifiestos (base de datos, framework, versiones) como propuestas: a la ficha no entra nada sin ti."}
          </p>
          <button type="button" disabled={ocupada} className={PRINCIPAL} onClick={() => void hacer({ accion: "crear" })}>
            Crear la memoria
          </button>
        </section>
      ) : (
        <>
          <Recordatorios memoria={memoria} />
          <div role="tablist" aria-label="Qué mirar" className="flex flex-wrap gap-1 self-start rounded-full bg-ficha p-1">
            {pestanas.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`${idPanel}-${p.id}`}
                aria-selected={vista === p.id}
                aria-controls={idPanel}
                onClick={() => setPestana(p.id)}
                className={`min-h-9 rounded-full px-3.5 text-sm font-bold ${vista === p.id ? "bg-papel text-fondo" : "text-tenue"}`}
              >
                {p.nombre}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={idPanel} aria-labelledby={`${idPanel}-${vista}`}>
            {vista === "propuestas" && <Propuestas memoria={memoria} ocupada={ocupada} hacer={hacer} />}
            {vista === "ficha" && <Ficha key={memoria.ficha?.texto} memoria={memoria} ocupada={ocupada} hacer={hacer} />}
            {vista === "decisiones" && <Decisiones memoria={memoria} ocupada={ocupada} hacer={hacer} />}
            {vista === "bitacora" && <Bitacora memoria={memoria} />}
            {vista === "habilidades" && memoria.habilidades && (
              <Habilidades
                h={memoria.habilidades}
                nombre={memoria.nombre}
                ocupada={ocupada}
                hacer={hacer}
                propuestas={abiertas.filter((p) => p.habilidad).length}
                verPropuestas={() => setPestana("propuestas")}
              />
            )}
            {vista === "buscar" && <Buscar en={memoria.en} />}
          </div>
        </>
      )}
    </div>
  );
}

/** Lo que él tiene que saber antes de seguir: lo que falta subir y lo que no cumple el formato. */
function Recordatorios({ memoria }: { memoria: MemoriaALaVista }) {
  const f = memoria.ficha;
  const pasada = f && (f.lineas > f.topes.lineas || f.bytes > f.topes.bytes);
  return (
    <>
      {memoria.sinCommit !== null && memoria.sinCommit > 0 && (
        <p role="status" className="rounded-[22px] bg-ficha px-5 py-4 text-sm outline-2 outline-realce outline-solid">
          <strong>{plural(memoria.sinCommit, "archivo de la memoria está", "archivos de la memoria están")} sin commit</strong> en{" "}
          <code className="font-mono break-all">{memoria.carpeta}</code>. La aplicación no los sube: revísalos y haz el commit tú, para que las tareas de otras sesiones los vean igual.
        </p>
      )}
      {memoria.esPlanta && <p className="text-sm text-tenue">La memoria de la planta vive en <code className="font-mono break-all">{memoria.carpeta}</code>, fuera de los repositorios: vale para todas las líneas.</p>}
      {pasada && (
        <p role="alert" className="rounded-[22px] bg-ficha px-5 py-4 text-sm outline-2 outline-aviso outline-solid">
          <strong>La ficha pasa su tope</strong> ({f.lineas} de {f.topes.lineas} líneas, {f.bytes} de {f.topes.bytes} bytes). Entra entera a cada tarea: lleva lo menos usado a decisiones.
        </p>
      )}
      {memoria.problemas.length > 0 && (
        <details className="rounded-[22px] bg-ficha px-5 py-3 text-sm outline-2 outline-aviso outline-solid">
          <summary className="cursor-pointer py-1 font-bold">{plural(memoria.problemas.length, "cosa no cumple", "cosas no cumplen")} el formato del vault</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {memoria.problemas.map((p, i) => (
              <li key={i}>
                <code className="font-mono text-xs">
                  {p.ruta}
                  {p.linea !== null ? `:${p.linea}` : ""}
                </code>{" "}
                — {p.que}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Cabeza({ d, extra }: { d: DocumentoDeMemoria; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-mono text-xs font-bold text-tenue">{d.id}</span>
        <h3 className="text-base leading-snug font-extrabold">{d.titulo || "Sin título"}</h3>
        {extra}
      </div>
      <Temas temas={d.temas} />
    </div>
  );
}

const ESTADO: Record<string, string> = { aprobada: "Aprobada", rechazada: "Rechazada", propuesta: "Por revisar", vigente: "Vigente", reemplazada: "Reemplazada" };
const Estado = ({ estado }: { estado: string }) => <span className="rounded-full bg-relieve px-2.5 py-0.5 text-xs font-bold">{ESTADO[estado] ?? estado}</span>;

function Propuestas({ memoria, ocupada, hacer }: { memoria: MemoriaALaVista; ocupada: boolean; hacer: Hacer }) {
  const abiertas = memoria.propuestas.filter((p) => p.estado === "propuesta");
  const revisadas = memoria.propuestas.filter((p) => p.estado !== "propuesta");
  return (
    <div className="flex flex-col gap-3">
      {!abiertas.length ? (
        <section className="flex flex-col items-center gap-2 rounded-[28px] bg-ficha px-6 py-10 text-center">
          <h2 className="text-lg font-extrabold">Nada por revisar</h2>
          <p className="max-w-md text-sm text-tenue">Cuando una tarea termine con algo «para la memoria», su propuesta llega aquí.</p>
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {abiertas.map((p) => (
            <li key={p.ruta}>
              <Propuesta p={p} ocupada={ocupada} hacer={hacer} />
            </li>
          ))}
        </ul>
      )}
      {revisadas.length > 0 && (
        <details className="rounded-[22px] bg-ficha px-5 py-3">
          <summary className="cursor-pointer py-1 text-sm font-bold">Ya revisadas · {revisadas.length}</summary>
          <ul className="mt-2 flex flex-col gap-3">
            {revisadas.map((p) => (
              <li key={p.ruta} className="flex flex-col gap-1.5 border-t border-relieve pt-3 text-sm">
                <Cabeza d={p} extra={<Estado estado={p.estado} />} />
                {p.motivo && <p className="text-tenue">{p.motivo}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Propuesta({ p, ocupada, hacer }: { p: DocumentoDeMemoria; ocupada: boolean; hacer: Hacer }) {
  const [modo, setModo] = useState<"ver" | "editar" | "rechazar">("ver");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  // En una habilidad con scripts: que él marcó que los leyó enteros.
  const [leido, setLeido] = useState(false);
  const conScripts = (p.habilidad?.archivos ?? []).some((a) => !/\.(md|txt)$/i.test(a.ruta));
  const idMotivo = useId();
  const pedir = async (cuerpo: Record<string, unknown>) => {
    const r = await hacer({ ...cuerpo, id: p.id });
    setError(r.ok ? null : (r.error ?? "No se pudo."));
    if (r.ok) setModo("ver");
  };
  const deDonde = [p.propone && `propone ${p.propone}`, p.origen && `de ${p.origen}`, p.fecha].filter(Boolean).join(" · ");
  return (
    <article className="flex flex-col gap-3 rounded-[22px] bg-ficha px-5 py-4">
      <Cabeza d={p} extra={p.habilidad ? <span className="rounded-full bg-realce px-2.5 py-0.5 text-xs font-bold">Habilidad nueva</span> : undefined} />
      {deDonde && <p className="text-xs text-tenue">{deDonde}</p>}
      {modo === "editar" && !p.habilidad ? (
        <FormularioDeDocumento
          inicial={datosDe(p)}
          ayudaRegla="Una línea. Con «NO:» delante si prohíbe algo. Vacía, la decisión queda pero a la ficha no entra nada."
          boton="Guardar la propuesta"
          ocupada={ocupada}
          error={error}
          guardar={(d) => void pedir({ accion: "editar", datos: paraLaRuta(d) })}
          cancelar={() => {
            setModo("ver");
            setError(null);
          }}
        />
      ) : (
        <>
          {p.habilidad ? (
            <>
              <Secciones d={p} />
              <DetalleDeHabilidad p={p} leido={leido} setLeido={setLeido} />
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-relieve px-3.5 py-2.5 text-sm">
                <span className="text-xs font-extrabold tracking-wide text-tenue uppercase">Entra a la ficha</span>
                <p className="mt-1 font-mono text-[13px] break-words">{p.regla ? `- [${p.temas[0] ?? "?"}] ${p.regla}` : <span className="font-sans text-tenue">Nada: no trae regla. Queda solo la decisión.</span>}</p>
                {p.reemplaza && <p className="mt-1 text-tenue">Reemplaza a {p.reemplaza}: sus reglas salen de la ficha.</p>}
              </div>
              <Secciones d={p} />
            </>
          )}
          {modo === "rechazar" ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void pedir({ accion: "rechazar", motivo });
              }}
            >
              <label htmlFor={idMotivo} className="text-sm font-bold">
                Por qué no
              </label>
              <input id={idMotivo} className={CAMPO} value={motivo} maxLength={180} required autoFocus placeholder="Ya se valida en el middleware." onChange={(e) => setMotivo(e.target.value)} aria-describedby={`${idMotivo}-ayuda`} />
              <span id={`${idMotivo}-ayuda`} className="text-xs text-tenue">
                Queda en la propuesta: así la fábrica no vuelve a proponer lo mismo.
              </span>
              {error && (
                <p role="alert" className="text-sm text-aviso">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={ocupada || !motivo.trim()} className={PRINCIPAL}>
                  Rechazar
                </button>
                <button type="button" disabled={ocupada} className={BOTON} onClick={() => setModo("ver")}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <>
              {error && (
                <p role="alert" className="text-sm text-aviso">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={ocupada || (conScripts && !leido)} className={PRINCIPAL} onClick={() => void pedir({ accion: "aprobar", ...(p.habilidad ? { leyoLosScripts: leido } : {}) })}>
                  Aprobar
                </button>
                {!p.habilidad && (
                  <button type="button" disabled={ocupada} className={BOTON} onClick={() => setModo("editar")}>
                    Editar
                  </button>
                )}
                <button type="button" disabled={ocupada} className={BOTON} onClick={() => setModo("rechazar")}>
                  Rechazar
                </button>
              </div>
            </>
          )}
        </>
      )}
    </article>
  );
}

function Ficha({ memoria, ocupada, hacer }: { memoria: MemoriaALaVista; ocupada: boolean; hacer: Hacer }) {
  const original = memoria.ficha?.texto ?? "";
  const [texto, setTexto] = useState(original);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).length;
  const bytes = new TextEncoder().encode(texto).length;
  const topes = memoria.ficha?.topes ?? { lineas: 150, bytes: 8192 };
  const cambio = texto !== original;
  return (
    <form
      className="flex flex-col gap-3 rounded-[22px] bg-ficha px-5 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await hacer({ accion: "ficha", texto });
        setError(r.ok ? null : (r.error ?? "No se pudo."));
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-base font-extrabold">
          La ficha
        </label>
        <p className={`text-xs ${lineas > topes.lineas || bytes > topes.bytes ? "font-bold text-aviso" : "text-tenue"}`}>
          {lineas} de {topes.lineas} líneas · {bytes} de {topes.bytes} bytes
        </p>
      </div>
      <p id={`${id}-ayuda`} className="text-sm text-tenue">
        Entra entera a cada tarea. Una regla por línea: <code className="font-mono">- [tema] Texto. (D-0001)</code>, con <code className="font-mono">NO:</code> para lo que no se usa. Lo que sale de una decisión se cambia mejor
        reemplazándola.
      </p>
      <textarea
        id={id}
        className={`${AREA} min-h-80 font-mono text-[13px] leading-relaxed`}
        spellCheck={false}
        value={texto}
        aria-describedby={`${id}-ayuda`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setTexto(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-aviso">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={ocupada || !cambio} className={PRINCIPAL}>
          Guardar la ficha
        </button>
        <button
          type="button"
          disabled={ocupada || !cambio}
          className={BOTON}
          onClick={() => {
            setTexto(original);
            setError(null);
          }}
        >
          Deshacer
        </button>
      </div>
    </form>
  );
}

function Decisiones({ memoria, ocupada, hacer }: { memoria: MemoriaALaVista; ocupada: boolean; hacer: Hacer }) {
  const vigentes = memoria.decisiones.filter((d) => d.estado === "vigente");
  const otras = memoria.decisiones.filter((d) => d.estado !== "vigente");
  return (
    <div className="flex flex-col gap-3">
      {!vigentes.length ? (
        <section className="flex flex-col items-center gap-2 rounded-[28px] bg-ficha px-6 py-10 text-center">
          <h2 className="text-lg font-extrabold">Todavía no hay decisiones</h2>
          <p className="max-w-md text-sm text-tenue">Cada propuesta que apruebes queda aquí, con su porqué.</p>
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {vigentes.map((d) => (
            <li key={d.ruta}>
              <Decision d={d} ocupada={ocupada} hacer={hacer} />
            </li>
          ))}
        </ul>
      )}
      {otras.length > 0 && (
        <details className="rounded-[22px] bg-ficha px-5 py-3">
          <summary className="cursor-pointer py-1 text-sm font-bold">Reemplazadas y rechazadas · {otras.length}</summary>
          <ul className="mt-2 flex flex-col gap-3">
            {otras.map((d) => (
              <li key={d.ruta} className="flex flex-col gap-1.5 border-t border-relieve pt-3 text-sm">
                <Cabeza d={d} extra={<Estado estado={d.estado} />} />
                {d.reemplazadaPor && <p className="text-tenue">La reemplaza {d.reemplazadaPor}.</p>}
                <Secciones d={d} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Decision({ d, ocupada, hacer }: { d: DocumentoDeMemoria; ocupada: boolean; hacer: Hacer }) {
  const [reemplazando, setReemplazando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deDonde = [d.fecha, d.aprobo && `aprobó ${d.aprobo}`, d.origen && `de ${d.origen}`, d.reemplaza && `reemplaza a ${d.reemplaza}`].filter(Boolean).join(" · ");
  return (
    <article className="flex flex-col gap-3 rounded-[22px] bg-ficha px-5 py-4">
      <Cabeza d={d} />
      {deDonde && <p className="text-xs text-tenue">{deDonde}</p>}
      {reemplazando ? (
        <>
          <p className="text-sm">
            Escribe la decisión nueva. {d.id} no se borra: queda reemplazada, enlazada a la nueva, y sus reglas salen de la ficha.
          </p>
          <FormularioDeDocumento
            inicial={datosDe(d, false)}
            ayudaRegla="Entra a la ficha en lugar de las reglas de la decisión vieja. Vacía, a la ficha no entra nada."
            boton={`Reemplazar ${d.id}`}
            ocupada={ocupada}
            error={error}
            guardar={async (datos) => {
              const r = await hacer({ accion: "reemplazar", id: d.id, datos: paraLaRuta(datos) });
              setError(r.ok ? null : (r.error ?? "No se pudo."));
              if (r.ok) setReemplazando(false);
            }}
            cancelar={() => {
              setReemplazando(false);
              setError(null);
            }}
          />
        </>
      ) : (
        <>
          <Secciones d={d} />
          <div>
            <button type="button" disabled={ocupada} className={BOTON} onClick={() => setReemplazando(true)}>
              Reemplazar
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function Bitacora({ memoria }: { memoria: MemoriaALaVista }) {
  if (!memoria.bitacora.length)
    return (
      <section className="flex flex-col items-center gap-2 rounded-[28px] bg-ficha px-6 py-10 text-center">
        <h2 className="text-lg font-extrabold">La bitácora está vacía</h2>
        <p className="max-w-md text-sm text-tenue">Cada tarea que termine deja aquí una línea: qué tocó y qué decisiones aplicó.</p>
      </section>
    );
  return (
    <ul className="flex flex-col gap-2 rounded-[22px] bg-ficha px-5 py-4 text-sm">
      {memoria.bitacora.map((e) => (
        <li key={`${e.ruta}:${e.linea}`} className="flex flex-col gap-0.5 border-t border-relieve pt-2 first:border-t-0 first:pt-0">
          <p>
            <span className="font-mono text-xs text-tenue">{e.fecha}</span> <strong className="font-mono text-xs">{e.tarea}</strong> {e.titulo} <span className="text-tenue">· {e.estado}</span>
          </p>
          {(e.toca.length > 0 || e.decisiones.length > 0 || e.habilidades.length > 0) && (
            <p className="text-xs break-words text-tenue">
              {e.toca.length > 0 && <>Tocó {e.toca.join(", ")}. </>}
              {e.decisiones.length > 0 && <>Aplicó {e.decisiones.join(", ")}. </>}
              {e.habilidades.length > 0 && <>Con {e.habilidades.join(", ")}.</>}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Buscar({ en }: { en: string }) {
  const [texto, setTexto] = useState("");
  const [hallazgos, setHallazgos] = useState<Hallazgo[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-ficha px-5 py-4">
      <form
        role="search"
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBuscando(true);
          const r = await buscarEnElVault(en, texto);
          setHallazgos(r.ok ? (r.hallazgos ?? []) : null);
          setError(r.ok ? null : (r.error ?? "No se pudo."));
          setBuscando(false);
        }}
      >
        <label htmlFor={id} className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5 text-sm font-bold">
          Buscar en todo el vault
          <input id={id} type="search" className={CAMPO} value={texto} placeholder="postgres migraciones" onChange={(e) => setTexto(e.target.value)} />
        </label>
        <button type="submit" disabled={buscando || !texto.trim()} className={PRINCIPAL}>
          Buscar
        </button>
      </form>
      <p className="text-xs text-tenue">Como grep, pero sin tildes ni mayúsculas: las líneas que tienen todas las palabras.</p>
      {error && (
        <p role="alert" className="text-sm text-aviso">
          {error}
        </p>
      )}
      {hallazgos && (
        <div role="status">
          {!hallazgos.length ? (
            <p className="text-sm text-tenue">Nada con esas palabras.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {hallazgos.map((h) => (
                <li key={`${h.ruta}:${h.linea}`} className="flex flex-col gap-0.5 border-t border-relieve pt-1.5 first:border-t-0 first:pt-0">
                  <code className="font-mono text-xs text-tenue">
                    {h.ruta}:{h.linea}
                  </code>
                  <span className="font-mono text-[13px] break-words">{h.texto}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
