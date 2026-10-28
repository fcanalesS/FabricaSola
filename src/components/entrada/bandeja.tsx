"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ElementoALaVista, EntradaALaVista } from "@/lib/entrada/acciones";
import { BOTON, CAMPO, enLaEntrada, ETIQUETA, PRINCIPAL } from "./pedir";

/** Lo que dejó en la Bandeja un proceso de la fábrica que falló: texto de una máquina. */
const deUnProceso = (ref: string) => ref.startsWith("proceso:");

/**
 * La Bandeja: lo que llegó y todavía no es tarea. A la izquierda la lista; a
 * la derecha, lo elegido y qué hacer con ello. Nada pasa a una línea sin su
 * clic, y el texto de otra persona se revisa al pasarlo, no antes.
 */

type Pestana = "abiertos" | "pasado" | "descartado";
const PESTANAS: { id: Pestana; nombre: string }[] = [
  { id: "abiertos", nombre: "Por revisar" },
  { id: "pasado", nombre: "Pasados a una línea" },
  { id: "descartado", nombre: "Descartados" },
];

const deLaPestana = (p: Pestana, e: ElementoALaVista) => (p === "abiertos" ? e.estado === "nuevo" || e.estado === "cambio" : e.estado === p);

export function Bandeja({ inicial }: { inicial: EntradaALaVista }) {
  const [entrada, setEntrada] = useState(inicial);
  const [pestana, setPestana] = useState<Pestana>("abiertos");
  const [elegido, setElegido] = useState<number | null>(null);
  const [ocupada, setOcupada] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; malo: boolean } | null>(null);

  const lista = useMemo(() => entrada.bandeja.elementos.filter((e) => deLaPestana(pestana, e)), [entrada, pestana]);
  const actual = lista.find((e) => e.id === elegido) ?? lista[0] ?? null;
  const nombreDeFuente = (id: number | null, ref = "") => (id === null ? (deUnProceso(ref) ? "Un proceso" : "Formulario") : (entrada.fuentes.find((f) => f.id === id)?.nombre ?? "Fuente quitada"));
  const caidas = entrada.fuentes.filter((f) => f.estado === "rechazado" || f.estado === "falta_token" || f.estado === "sin_respuesta");
  const cuenta = (p: Pestana) => (p === "abiertos" ? entrada.bandeja.cuentas.nuevo + entrada.bandeja.cuentas.cambio : entrada.bandeja.cuentas[p]);

  async function hacer(cuerpo: Record<string, unknown>) {
    setOcupada(true);
    setAviso(null);
    const r = await enLaEntrada(cuerpo);
    if (r.entrada) setEntrada(r.entrada);
    setAviso(r.ok ? { texto: r.nota ?? "Hecho.", malo: false } : { texto: r.error ?? "No se pudo.", malo: true });
    setOcupada(false);
    return r.ok;
  }

  return (
    <div className="flex flex-col gap-4">
      {caidas.map((f) => (
        <div key={f.id} role="alert" className="flex flex-wrap items-center gap-3 rounded-[22px] bg-ficha px-5 py-4 text-sm outline-2 outline-aviso outline-solid">
          <p className="min-w-0 flex-1 basis-72">
            <strong>{f.nombre} no lee:</strong>{" "}
            {f.estado === "falta_token" ? (
              <>
                falta <code className="font-mono">{f.variable}</code> en .env.local.
              </>
            ) : (
              <>
                {f.motivo ?? "el servicio no responde."} Si es el token, cámbialo en .env.local (<code className="font-mono">{f.variable}</code>).
              </>
            )}
          </p>
          {f.estado !== "falta_token" && (
            <button type="button" disabled={ocupada} className={PRINCIPAL} onClick={() => void hacer({ accion: "fuente_reintentar", id: f.id }).then((ok) => ok && hacer({ accion: "traer", id: f.id }))}>
              Ya lo cambié: volver a intentar
            </button>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Qué mostrar" className="flex flex-wrap gap-1 rounded-full bg-ficha p-1">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pestana === p.id}
              onClick={() => {
                setPestana(p.id);
                setElegido(null);
              }}
              className={`min-h-9 rounded-full px-3.5 text-sm font-bold ${pestana === p.id ? "bg-papel text-fondo" : "text-tenue"}`}
            >
              {p.nombre} · {cuenta(p.id)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={ocupada || !entrada.fuentes.length} className={BOTON} onClick={() => void hacer({ accion: "traer" })}>
            Traer ahora
          </button>
          <Link href="/fabrica/peticion" className={`${PRINCIPAL} flex items-center`}>
            Escribir una petición
          </Link>
        </div>
      </div>

      {aviso && (
        <p role={aviso.malo ? "alert" : "status"} className={`rounded-2xl bg-relieve px-4 py-3 text-sm ${aviso.malo ? "text-aviso" : ""}`}>
          {aviso.texto}
        </p>
      )}

      {!lista.length ? (
        <section className="flex flex-col items-center gap-2 rounded-[28px] bg-ficha px-6 py-10 text-center">
          <h2 className="text-lg font-extrabold">{pestana === "abiertos" ? "Nada nuevo" : "Nada por aquí"}</h2>
          <p className="max-w-md text-sm text-tenue">
            {pestana === "abiertos"
              ? entrada.fuentes.length
                ? "Todo lo que llegó ya está en una línea o descartado."
                : "Todavía no hay fuentes conectadas: lo que escribas en una petición también puede esperar aquí."
              : "Cuando pases o descartes algo, queda aquí."}
          </p>
        </section>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <ul aria-label="Lo que llegó" className="flex min-w-0 flex-[2_1_300px] flex-col gap-2">
            {lista.map((e) => {
              const esEste = actual?.id === e.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    aria-pressed={esEste}
                    onClick={() => setElegido(e.id)}
                    className={`flex w-full flex-col gap-1.5 rounded-[20px] px-4 py-3 text-left ${esEste ? "bg-realce outline-2 outline-papel outline-solid" : "bg-ficha"}`}
                  >
                    <span className="flex flex-wrap items-center gap-2 text-xs font-bold text-tenue">
                      <span className="rounded-full bg-relieve px-2 py-0.5 text-texto">{nombreDeFuente(e.fuente, e.ref)}</span>
                      {e.fuente !== null && <span>{e.ref}</span>}
                      <span className="ml-auto font-normal">{new Date(e.llegado).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <span className="text-[15px] leading-snug font-extrabold">{e.titulo}</span>
                    <span className="flex flex-wrap gap-1.5 text-xs font-bold">
                      {e.estado === "cambio" && <span className="rounded-full bg-relieve px-2 py-0.5 text-aviso">Cambió en el origen</span>}
                      {e.estado === "nuevo" && !e.esSuyo && <span className="rounded-full bg-relieve px-2 py-0.5 text-aviso">{deUnProceso(e.ref) ? "Lo dejó un proceso que falló" : "Lo abrió otra persona"}</span>}
                      {e.estado === "nuevo" && e.fuente === null && e.esSuyo && <span className="rounded-full bg-relieve px-2 py-0.5">Borrador tuyo</span>}
                      {e.estado === "pasado" && e.tarea && (
                        <span className="rounded-full bg-relieve px-2 py-0.5">
                          {e.tarea} en {e.lineaTarea}
                        </span>
                      )}
                      {e.linea && e.estado === "nuevo" && <span className="rounded-full bg-relieve px-2 py-0.5 text-tenue">→ {e.linea}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {actual && <Detalle key={`${actual.id}-${actual.estado}`} e={actual} entrada={entrada} fuente={nombreDeFuente(actual.fuente, actual.ref)} ocupada={ocupada} hacer={hacer} />}
        </div>
      )}
    </div>
  );
}

function Detalle({ e, entrada, fuente, ocupada, hacer }: { e: ElementoALaVista; entrada: EntradaALaVista; fuente: string; ocupada: boolean; hacer: (c: Record<string, unknown>) => Promise<boolean> }) {
  const lineas = entrada.lineas;
  const [linea, setLinea] = useState(e.linea && lineas.some((l) => l.id === e.linea) ? e.linea : (lineas[0]?.id ?? ""));
  const [titulo, setTitulo] = useState(e.titulo.slice(0, 80));
  const [deps, setDeps] = useState<string[]>([]);
  const abiertas = lineas.find((l) => l.id === linea)?.abiertas ?? [];
  const reescribir = `/fabrica/peticion?desde=${e.id}`;

  return (
    <section aria-labelledby={`detalle-${e.id}`} className="flex min-w-0 flex-[3_1_420px] flex-col gap-4 rounded-[28px] bg-ficha p-5">
      <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-tenue">
        <span className="rounded-full bg-relieve px-2 py-0.5 text-texto">{fuente}</span>
        {e.fuente !== null && <span>{e.ref}</span>}
        {e.autor && <span>· abierto por {e.esSuyo ? `${e.autor} (tú)` : e.autor}</span>}
        {e.etiquetas.length > 0 && <span>· {e.etiquetas.join(", ")}</span>}
      </p>
      <h2 id={`detalle-${e.id}`} className="text-xl leading-tight font-extrabold">
        {e.titulo}
      </h2>

      {e.estado === "cambio" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-extrabold tracking-wide text-tenue uppercase">Lo que se agregó desde que pasó a {e.tarea}</h3>
            <blockquote className="rounded-2xl bg-relieve px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">{e.agregado ?? "Solo se cambió o quitó texto: no hay nada nuevo que hacer."}</blockquote>
          </div>
          <p className="text-sm text-tenue">{e.tarea} no se cambia mientras la fábrica la trabaja: lo nuevo entra como otra tarea, que espera a que {e.tarea} se integre.</p>
          <div className="flex flex-wrap gap-2">
            {e.agregado && (
              <button type="button" disabled={ocupada} className={PRINCIPAL} onClick={() => void hacer({ accion: "cambio_a_tarea", id: e.id })}>
                Crear una tarea con el cambio
              </button>
            )}
            <button type="button" disabled={ocupada} className={BOTON} onClick={() => void hacer({ accion: "ignorar_cambio", id: e.id })}>
              Darlo por visto
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-extrabold tracking-wide text-tenue uppercase">{e.fuente === null ? (e.esSuyo ? "Tu pedido" : "Lo que falló") : "Lo que dice el issue"}</h3>
            <blockquote className="max-h-80 overflow-y-auto rounded-2xl bg-relieve px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">{e.texto || "Sin texto: solo el título."}</blockquote>
            {deUnProceso(e.ref) && (
              <p className="text-sm text-tenue">Lo escribió la aplicación con lo que dijo un comando: al pasarlo se revisa como el issue de otra persona. Si le habla a un asistente, o nadie lo puede revisar, no pasa tal cual.</p>
            )}
            {e.fuente !== null && (
              <p className="text-sm text-tenue">
                {e.esSuyo
                  ? "Lo abriste tú: entra a la tarea entre comillas, como cita."
                  : "Lo abrió otra persona: al pasarlo se revisa si le habla a un asistente. Si es así, o si nadie lo puede revisar, no pasa tal cual."}
              </p>
            )}
          </div>

          {e.estado === "nuevo" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={ETIQUETA}>
                  Línea
                  <select
                    value={linea}
                    onChange={(ev) => {
                      setLinea(ev.target.value);
                      setDeps([]);
                    }}
                    className={CAMPO}
                  >
                    {lineas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre}
                        {l.id === e.linea ? " (por el repositorio)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={ETIQUETA}>
                  Título de la tarea
                  <input value={titulo} maxLength={80} onChange={(ev) => setTitulo(ev.target.value)} className={CAMPO} />
                </label>
              </div>
              {!e.esSuyo && e.fuente !== null && <p className="text-sm text-tenue">Si dejas el título como está, la tarea queda marcada con un título ajeno: no lo escribiste tú.</p>}
              {abiertas.length > 0 && (
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1.5 text-sm font-bold">Depende de (opcional)</legend>
                  <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
                    {abiertas.map((t) => (
                      <label key={t.id} className="flex min-h-8 items-center gap-2 text-sm">
                        <input type="checkbox" checked={deps.includes(t.id)} onChange={(ev) => setDeps((d) => (ev.target.checked ? [...d, t.id].slice(0, 10) : d.filter((x) => x !== t.id)))} />
                        <span className="font-bold">{t.id}</span> {t.titulo}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={ocupada || !linea || !titulo.trim()} className={PRINCIPAL} onClick={() => void hacer({ accion: "pasar", id: e.id, linea, titulo, dependeDe: deps })}>
                  Pasar a {lineas.find((l) => l.id === linea)?.nombre ?? "la línea"}
                </button>
                {e.fuente !== null && (
                  <Link href={reescribir} className={`${BOTON} flex items-center`}>
                    Reescribirlo con mis palabras
                  </Link>
                )}
                <button type="button" disabled={ocupada} className={BOTON} onClick={() => void hacer({ accion: "descartar", id: e.id })}>
                  Descartar
                </button>
              </div>
              {e.fuente !== null && <p className="text-sm text-tenue">Descartar solo lo saca de aquí: en su servicio sigue como estaba.</p>}
              {!lineas.length && <p className="text-sm text-aviso">Todavía no hay líneas: elige un proyecto en la configuración de la fábrica.</p>}
            </>
          ) : (
            <p className="text-sm text-tenue">{e.estado === "pasado" && e.tarea ? `Es ${e.tarea} en ${e.lineaTarea}.` : "Descartado: en el origen sigue como estaba."}</p>
          )}
        </>
      )}
    </section>
  );
}
