"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import type { Planta } from "@/lib/fabrica/planta/disco";
import type { DetalleDeTarea } from "@/lib/fabrica/planta/acciones";
import { ETAPAS_DE_LA_PLANTA, NOMBRE_DE_ETAPA, pideSuVeredicto, type TarjetaDeLaPlanta } from "@/lib/fabrica/planta/lectura";
import type { CambiosDeTarea } from "@/lib/fabrica/motor/proyecto";
import type { ModeloDeRol } from "@/lib/fabrica/modelos";
import { EstadoDeLaLinea, hace, MODELOS_DE_LA_APROBACION, MODELOS_DE_LA_CONSTRUCCION, MODELOS_DE_LA_SPEC, opcionDeLaLinea, pieDeTarjeta, TarjetaChica, usd } from "./piezas";
import { AlDia, usePlanta } from "./use-planta";

/**
 * Una línea, como en el lienzo: su cabecera, sus fichas y su cola por etapa. Al elegir una tarea se
 * abre al lado, con su pedido, su spec, sus hallazgos y su camino, y con lo que él puede hacer:
 * contestarle, aprobarla, rechazarla o descartarla. Lo que hace va con la línea, nunca a la activa.
 */

const APRUEBA: Record<string, string> = { agente: "El agente aprobador", externa: "Tú, desde la aplicación", ambas: "El agente y tú" };
const ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  spec: "Spec",
  construccion: "Construcción",
  revision: "Revisión",
  verificacion: "Verificación",
  aprobacion: "Aprobación",
  "necesita-humano": "Te espera",
  hecho: "Hecha",
  descartada: "Descartada",
};
const DESCARTABLES = ["pendiente", "spec", "construccion"];

/** Con qué verifica la línea, en palabras: «Build y pruebas», «Solo lint», «Sin comandos». */
function verificaCon(c: { build: string; test: string; lint: string }): string {
  const hay = [c.build && "build", c.test && "pruebas", c.lint && "lint"].filter((x): x is string => !!x);
  if (!hay.length) return "Sin comandos";
  const dicho = hay.length === 1 ? hay[0]! : `${hay.slice(0, -1).join(", ")} y ${hay.at(-1)}`;
  return (hay.length === 1 ? "Solo " : "") + (hay.length === 1 ? dicho : dicho.charAt(0).toUpperCase() + dicho.slice(1));
}

export function LineaVista({ inicial, linea: id, tareaInicial }: { inicial: Planta; linea: string; tareaInicial: string | null }) {
  const { planta, ahora, sinRespuesta, segundos, leer } = usePlanta(inicial);
  const [elegida, setElegida] = useState<string | null>(tareaInicial);
  const l = planta.lineas.find((x) => x.id === id);

  const elegir = useCallback(
    (tarea: string | null) => {
      setElegida(tarea);
      // La dirección dice qué tarea se mira, para volver a ella o compartirla.
      const url = new URL(window.location.href);
      if (tarea) url.searchParams.set("tarea", tarea);
      else url.searchParams.delete("tarea");
      window.history.replaceState(null, "", url);
    },
    [],
  );

  if (!l) return <p className="rounded-[22px] bg-ficha p-5 text-sm">Esta línea ya no está en la fábrica.</p>;

  const trabajos = new Map(planta.puestos.ocupados.filter((p) => p.linea === l.id && p.tarea).map((p) => [p.tarea!, p]));
  const n = l.numeros;
  const tarjeta = elegida ? l.tarjetas.find((t) => t.id === elegida) : undefined;
  const c = l.config;

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Dónde estás" className="-mt-3 flex flex-wrap items-center gap-2 text-sm font-bold text-tenue">
        <Link href="/fabrica" className="underline-offset-4 hover:underline">
          La planta
        </Link>
        <span aria-hidden="true">›</span>
        <span>Líneas</span>
        <span aria-hidden="true">›</span>
        <span aria-current="page" className="text-texto">
          {l.nombre}
        </span>
      </nav>

      {planta.lineas.length > 1 && (
        <nav aria-label="Cambiar de línea" className="flex flex-wrap gap-2">
          {planta.lineas.map((o) => (
            <Link
              key={o.id}
              href={`/fabrica/lineas/${encodeURIComponent(o.id)}`}
              aria-current={o.id === l.id ? "page" : undefined}
              className={`flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-bold ${o.id === l.id ? "bg-papel text-tinta" : "bg-relieve"}`}
            >
              {o.nombre}
              <span className={`text-xs ${o.id === l.id ? "text-tinta" : "text-tenue"}`}>{o.estado === "corriendo" ? "corriendo" : o.numeros?.teEsperan ? `${o.numeros.teEsperan} te esperan` : ""}</span>
            </Link>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <EstadoDeLaLinea estado={l.estado} />
        <AlDia segundos={segundos} sinRespuesta={sinRespuesta} />
      </div>
      {l.error && <p className={`rounded-[22px] bg-ficha p-4 text-sm ${l.estado === "error" ? "text-peligro" : ""}`}>{l.error}</p>}

      {c && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FichaDelModelo rol="spec" linea={l.id} modelo={c.modeloSpec} alCambiar={leer} />
          <FichaDelModelo rol="construccion" linea={l.id} modelo={c.modeloConstruccion} alCambiar={leer} />
          <FichaDelModelo rol="aprobacion" linea={l.id} modelo={c.modeloAprobacion} alCambiar={leer} />
          <Ficha titulo="Verificación" valor={verificaCon(c)} detalle={[c.build, c.test, c.lint].filter(Boolean).join(" · ") || "Sin con qué verificar, cada tarea termina esperándote."} />
          <Ficha titulo="Puestos" valor={`Hasta ${c.paraleloMax} a la vez`} detalle={`Hoy lleva ${usd(l.gastoHoyUsd)} USD. El tope por línea llega con el cambio a la fábrica.`} />
          <Ficha titulo="Quién aprueba" valor={APRUEBA[c.aprobacion] ?? c.aprobacion} detalle={`${c.integracion === "auto" ? "Se integra sola en su rama, en este equipo. Nunca hace push." : "Queda la rama para que la integres tú."} Hasta ${c.maxVueltas} ${c.maxVueltas === 1 ? "vuelta" : "vueltas"} de retrabajo; después te espera.`} />
          <Ficha titulo="Entradas" valor={l.entradas.join(" · ")} detalle="Los issues de las conexiones que apuntan aquí, y lo que escribas en una petición." enlace={{ texto: "Configurar las entradas", href: "/fabrica/fuentes" }} />
        </div>
      )}

      <nav aria-label="Qué mirar de esta línea" className="flex flex-wrap gap-1 self-start rounded-full bg-ficha p-1">
        <span aria-current="page" className="flex min-h-10 items-center rounded-full bg-acento px-4 text-sm font-extrabold text-papel">
          Cola
        </span>
        <Link href={`/fabrica/memoria?en=${encodeURIComponent(l.id)}`} className="flex min-h-10 items-center rounded-full px-4 text-sm font-bold text-tenue hover:text-texto">
          Memoria
        </Link>
        <Link href="/fabrica/fuentes" className="flex min-h-10 items-center rounded-full px-4 text-sm font-bold text-tenue hover:text-texto">
          Entradas
        </Link>
        <Link href="/configuracion#fabrica" className="flex min-h-10 items-center rounded-full px-4 text-sm font-bold text-tenue hover:text-texto">
          Ajustes
        </Link>
      </nav>

      {n && (
        <section aria-label={`La cola de ${l.nombre}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>
              <strong>
                {n.abiertas} {n.abiertas === 1 ? "abierta" : "abiertas"}
              </strong>{" "}
              · {n.teEsperan} te {n.teEsperan === 1 ? "espera" : "esperan"}
              {l.estado === "corriendo" && ` · usa ${trabajos.size} de ${c?.paraleloMax ?? "?"} puestos`}
            </span>
            <span className="text-xs text-tenue">Las tareas se numeran por línea: F-012 de aquí no es F-012 de otra.</span>
          </div>
          <div className="grid gap-5 2xl:grid-cols-[1fr_minmax(360px,440px)]">
            <div className="overflow-x-auto pb-2">
              <div className="grid min-w-[980px] grid-cols-7 gap-2">
                {ETAPAS_DE_LA_PLANTA.map((e) => {
                  const tareas = l.tarjetas.filter((t) => t.etapa === e);
                  return (
                    <section key={e} aria-label={NOMBRE_DE_ETAPA[e]} className={`flex min-h-40 flex-col gap-2 rounded-2xl p-2 ${e === "aprobacion" || e === "hechas" ? "bg-realce/60" : "bg-relieve"}`}>
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-xs font-extrabold tracking-[.04em] uppercase">{e === "hechas" ? "Hecho hoy" : NOMBRE_DE_ETAPA[e]}</h3>
                        <span className="text-xs font-bold text-tenue">{tareas.length}</span>
                      </div>
                      {tareas.map((t) => (
                        <TarjetaChica key={t.id} t={t} alElegir={() => elegir(t.id === elegida ? null : t.id)} elegida={t.id === elegida} trabajando={trabajos.has(t.id)} pie={pieDeTarjeta(t, ahora, trabajos.get(t.id))} />
                      ))}
                      {tareas.length === 0 && <p className="px-1 text-xs text-tenue">{e === "verificacion" ? "Nada que verificar ahora." : "—"}</p>}
                    </section>
                  );
                })}
              </div>
            </div>
            {tarjeta ? (
              <PanelDeTarea key={`${l.id}/${tarjeta.id}`} linea={l.id} t={tarjeta} pideVeredicto={pideSuVeredicto(c)} ahora={ahora} modelosDeLaLinea={{ spec: c?.modeloSpec ?? null, construccion: c?.modeloConstruccion ?? null }} alCerrar={() => elegir(null)} alHacer={leer} />
            ) : (
              <p className="hidden self-start rounded-[22px] bg-ficha p-5 text-sm text-tenue 2xl:block">Elige una tarea para ver su pedido, su spec y su camino, y para contestarle o darle tu veredicto.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Ficha({ titulo, valor, detalle, enlace }: { titulo: string; valor: string; detalle: string; enlace?: { texto: string; href: string } }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-1 rounded-[22px] bg-ficha p-4">
      <h2 className="text-xs font-extrabold text-tenue">{titulo}</h2>
      <span className="font-extrabold">{valor}</span>
      <span className="text-xs break-words text-tenue">{detalle}</span>
      {enlace && (
        <Link href={enlace.href} className="mt-1 self-start text-xs font-bold underline underline-offset-4">
          {enlace.texto}
        </Link>
      )}
    </section>
  );
}

type Hecho = { texto: string; malo: boolean } | null;

/**
 * Con qué modelo se escribe la spec de esta tarea, o con cuál se construye, si él quiere otro que
 * el de la línea. El de la spec se ve mientras su spec no se escribió, o cuando se detuvo a
 * preguntarle; el de la construcción, mientras la tarea pueda volver a construirse. Elegido en la
 * tarea, Jev no abarata la construcción. No borra lo que él estaba escribiendo en el panel.
 */
function ModeloDeLaTarea({ rol, linea, t, modeloDeLaLinea, alCambiar }: { rol: "spec" | "construccion"; linea: string; t: TarjetaDeLaPlanta; modeloDeLaLinea: ModeloDeRol | null; alCambiar: () => Promise<void> }) {
  const id = useId();
  const [elegido, setElegido] = useState<ModeloDeRol | "linea" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<Hecho>(null);
  const modelos = rol === "spec" ? MODELOS_DE_LA_SPEC : MODELOS_DE_LA_CONSTRUCCION;
  const valor = elegido ?? (rol === "spec" ? t.modeloSpec : t.modeloConstruccion) ?? "linea";
  const detalle =
    valor === "linea"
      ? rol === "spec"
        ? "El que tiene elegido la línea."
        : "El que tiene elegido la línea. En las tareas simples, Jev puede usar Sonnet."
      : rol === "spec"
        ? modelos.find((m) => m.valor === valor)?.detalle
        : "Elegido para esta tarea: Jev no lo cambia, y vale también si vuelve a construcción.";
  const titulo =
    rol === "spec"
      ? t.estado === "pendiente"
        ? "Escribir la spec con"
        : "Escribir la spec, la próxima vez, con"
      : t.estado === "pendiente" || t.estado === "spec"
        ? "Construir con"
        : "Construir, la próxima vez, con";

  async function cambiar(nuevo: ModeloDeRol | "linea") {
    setElegido(nuevo);
    setEnviando(true);
    setHecho(null);
    const r = await enLaLinea({ accion: rol === "spec" ? "modelo_spec" : "modelo_construccion", linea, tarea: t.id, modelo: nuevo === "linea" ? null : nuevo });
    setHecho({ texto: r.texto, malo: !r.ok });
    if (r.ok) await alCambiar();
    else setElegido(null);
    setEnviando(false);
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-relieve p-3.5">
      <label htmlFor={id} className="text-sm font-bold">
        {titulo}
      </label>
      <select id={id} value={valor} disabled={enviando} onChange={(e) => void cambiar(e.target.value as ModeloDeRol | "linea")} className="min-h-10 self-start rounded-full bg-ficha px-3 text-sm font-extrabold disabled:opacity-60">
        <option value="linea">{opcionDeLaLinea(modelos, modeloDeLaLinea)}</option>
        {modelos.map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.nombre}
          </option>
        ))}
      </select>
      <span className="text-xs text-tenue">{detalle}</span>
      {hecho && (
        <span role={hecho.malo ? "alert" : "status"} className={`text-xs font-bold ${hecho.malo ? "text-peligro" : ""}`}>
          {hecho.texto}
        </span>
      )}
    </div>
  );
}

/** Lo que cambia entre la ficha de la spec y la de la construcción: qué dice, qué ofrece y qué campo manda. */
const FICHAS_DE_MODELO = {
  spec: { titulo: "La spec se escribe con", nombre: "La spec", modelos: MODELOS_DE_LA_SPEC, campo: "modeloSpec" },
  construccion: { titulo: "Se construye con", nombre: "La construcción", modelos: MODELOS_DE_LA_CONSTRUCCION, campo: "modeloConstruccion" },
  aprobacion: { titulo: "Se aprueba con", nombre: "La aprobación", modelos: MODELOS_DE_LA_APROBACION, campo: "modeloAprobacion" },
} as const;

/**
 * Con qué modelo de Claude se escribe la spec de esta línea, o con cuál se construye, y cambiarlo.
 * Va con su línea, sea o no la activa.
 */
function FichaDelModelo({ rol, linea, modelo, alCambiar }: { rol: keyof typeof FICHAS_DE_MODELO; linea: string; modelo: ModeloDeRol; alCambiar: () => Promise<void> | void }) {
  const ficha = FICHAS_DE_MODELO[rol];
  const id = useId();
  // Lo elegido se ve mientras la planta vuelve a leerse; si la aplicación no lo guarda, vuelve al de antes.
  const [elegido, setElegido] = useState<ModeloDeRol | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<Hecho>(null);
  const valor = elegido ?? modelo;
  const actual = ficha.modelos.find((m) => m.valor === valor);

  async function cambiar(nuevo: ModeloDeRol) {
    setElegido(nuevo);
    setEnviando(true);
    setHecho(null);
    try {
      const r = await fetch("/api/fabrica/linea", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ linea, [ficha.campo]: nuevo }) });
      const d = ((await r.json().catch(() => null)) ?? {}) as { nota?: string; error?: string };
      if (!r.ok) {
        setElegido(null);
        setHecho({ texto: d.error ?? "La aplicación no lo cambió.", malo: true });
        return;
      }
      setHecho({ texto: d.nota ?? "Cambiado.", malo: false });
      await alCambiar();
    } catch {
      setElegido(null);
      setHecho({ texto: "No pude hablar con la aplicación.", malo: true });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-label={ficha.nombre} className="flex flex-col gap-1 rounded-[22px] bg-ficha p-4">
      <h2 className="text-xs font-extrabold text-tenue">
        <label htmlFor={id}>{ficha.titulo}</label>
      </h2>
      <select
        id={id}
        value={valor}
        disabled={enviando}
        onChange={(e) => void cambiar(e.target.value as ModeloDeRol)}
        className="min-h-10 self-start rounded-full bg-relieve px-3 font-extrabold disabled:opacity-60"
      >
        {ficha.modelos.map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.nombre}
          </option>
        ))}
      </select>
      <span className="text-xs break-words text-tenue">{actual?.detalle}</span>
      {hecho && (
        <span role={hecho.malo ? "alert" : "status"} className={`text-xs font-bold ${hecho.malo ? "text-peligro" : ""}`}>
          {hecho.texto}
        </span>
      )}
    </section>
  );
}

async function enLaLinea(cuerpo: Record<string, unknown>): Promise<{ ok: boolean; texto: string }> {
  try {
    const r = await fetch("/api/fabrica/linea", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
    const d = ((await r.json().catch(() => null)) ?? {}) as { nota?: string; error?: string };
    return r.ok ? { ok: true, texto: d.nota ?? "Hecho." } : { ok: false, texto: d.error ?? "La aplicación no lo hizo." };
  } catch {
    return { ok: false, texto: "La aplicación no responde." };
  }
}

function PanelDeTarea({ linea, t, pideVeredicto, ahora, modelosDeLaLinea, alCerrar, alHacer }: { linea: string; t: TarjetaDeLaPlanta; pideVeredicto: boolean; ahora: number; modelosDeLaLinea: { spec: ModeloDeRol | null; construccion: ModeloDeRol | null }; alCerrar: () => void; alHacer: () => Promise<void> }) {
  const id = useId();
  const [detalle, setDetalle] = useState<DetalleDeTarea | null>(null);
  const [cambios, setCambios] = useState<CambiosDeTarea | null>(null);
  const [verCambios, setVerCambios] = useState(false);
  const [texto, setTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [hecho, setHecho] = useState<Hecho>(null);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/fabrica/linea?linea=${encodeURIComponent(linea)}&tarea=${encodeURIComponent(t.id)}`, { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? ((await r.json()) as { detalle: DetalleDeTarea }) : null;
    setDetalle(d?.detalle ?? null);
  }, [linea, t.id]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/fabrica/linea?linea=${encodeURIComponent(linea)}&tarea=${encodeURIComponent(t.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ detalle: DetalleDeTarea }>) : null))
      .then((d) => {
        if (vivo) setDetalle(d?.detalle ?? null);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [linea, t.id]);

  async function hacer(cuerpo: Record<string, unknown>) {
    setOcupada(true);
    setHecho(null);
    const r = await enLaLinea({ linea, tarea: t.id, ...cuerpo });
    setHecho({ texto: r.texto, malo: !r.ok });
    if (r.ok) {
      setTexto("");
      setMotivo("");
      setConfirmarDescarte(false);
      await Promise.all([alHacer(), cargar()]);
    }
    setOcupada(false);
  }

  async function mostrarCambios() {
    setVerCambios((v) => !v);
    if (cambios) return;
    const r = await fetch(`/api/fabrica/linea?linea=${encodeURIComponent(linea)}&tarea=${encodeURIComponent(t.id)}&cambios=1`, { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? ((await r.json()) as { cambios: CambiosDeTarea }) : null;
    setCambios(d?.cambios ?? { tarea: t.id, motivo: "No se pudieron leer sus cambios." });
  }

  const s = detalle?.secciones;
  const pasos = detalle?.historial.pasos.slice(-8).reverse() ?? [];
  // Una grande espera su prueba aunque la línea no pida su veredicto (fabrica/docs/Plan-Integracion.md).
  const grande = t.integracion?.clase === "grande";
  const aprobable = t.estado === "aprobacion" && (pideVeredicto || t.espera === "veredicto");

  return (
    <aside aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4 self-start rounded-[22px] bg-ficha p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-tenue">
            <span className="font-mono">{t.id}</span> · {ESTADO[t.estado] ?? t.estado} · {t.origenTexto}
          </p>
          <h2 id={`${id}-titulo`} className="text-lg leading-snug font-extrabold">
            {t.titulo}
          </h2>
        </div>
        <button type="button" onClick={alCerrar} aria-label="Cerrar la tarea" className="flex size-10 flex-none items-center justify-center rounded-full bg-relieve text-lg font-bold">
          ×
        </button>
      </div>

      {t.espera === "pregunta" && (
        <div className="flex flex-col gap-2 rounded-2xl bg-relieve p-3.5 outline-2 outline-aviso outline-solid">
          <p className="text-xs font-extrabold text-aviso">Te preguntó {hace(t.desde, ahora)}</p>
          <p className="text-sm whitespace-pre-wrap">{t.motivo ?? "La tarea necesita que le contestes."}</p>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Tu respuesta
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={4000} className="w-full rounded-2xl bg-ficha px-3.5 py-2.5 text-sm font-normal" />
          </label>
          <button type="button" disabled={ocupada || !texto.trim()} onClick={() => void hacer({ accion: "responder", texto })} className="min-h-11 self-start rounded-full bg-acento px-5 text-sm font-extrabold text-papel disabled:opacity-45">
            Responder
          </button>
        </div>
      )}

      {aprobable && (
        <div className="flex flex-col gap-2 rounded-2xl bg-relieve p-3.5 outline-2 outline-aviso outline-solid">
          <p className="text-xs font-extrabold text-aviso">{grande ? "Espera que la pruebes a mano" : "Espera tu veredicto"}</p>
          {grande && (
            <p className="text-sm">
              Es grande{t.integracion?.motivo ? `: ${t.integracion.motivo}` : ""}. Pruébala en su rama{t.rama ? <> (<span className="font-mono">{t.rama}</span>)</> : ""} antes de dejarla entrar.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={ocupada} onClick={() => void hacer({ accion: "aprobar" })} className="min-h-11 rounded-full bg-acento px-5 text-sm font-extrabold text-papel disabled:opacity-45">
              {grande ? "Probada, intégrala" : "Aprobar"}
            </button>
            <button type="button" onClick={() => void mostrarCambios()} aria-expanded={verCambios} className="min-h-11 rounded-full bg-ficha px-4 text-sm font-bold">
              {verCambios ? "Ocultar los cambios" : "Ver los cambios"}
            </button>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            {grande ? "Si la devuelves, qué falló al probarla (lo lee quien la arregla)" : "Si la rechazas, por qué (lo lee quien la arregla)"}
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={4000} className="w-full rounded-2xl bg-ficha px-3.5 py-2.5 text-sm font-normal" />
          </label>
          <button type="button" disabled={ocupada || !motivo.trim()} onClick={() => void hacer({ accion: "rechazar", motivo })} className="min-h-11 self-start rounded-full bg-ficha px-4 text-sm font-bold disabled:opacity-45">
            {grande ? "Devuélvela" : "Rechazar"}
          </button>
        </div>
      )}

      {t.integracion && (
        <div role="note" className="flex flex-col gap-1 rounded-2xl bg-relieve p-3.5 text-sm">
          <span className="font-bold">{t.integracion.clase === "sencilla" ? "Sencilla" : "Grande"}</span>
          <span className="text-tenue">
            {t.integracion.motivo ? `${t.integracion.motivo.charAt(0).toUpperCase()}${t.integracion.motivo.slice(1)}.` : ""}{" "}
            {t.integracion.clase === "sencilla" ? "Puede integrarse sola." : "No se integra sin que la pruebes a mano."}
          </span>
          {/* Solo de lo que decidió Jev se aprende: una regla no cambia con su marca. */}
          {t.integracion.clase === "sencilla" && t.integracion.por === "jev" && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {t.debioEsperar && <span className="font-bold">La marcaste: tenía que esperarte.</span>}
              <button
                type="button"
                disabled={ocupada}
                onClick={() => void hacer({ accion: "debio_esperar", marcar: !t.debioEsperar })}
                className="min-h-11 rounded-full bg-ficha px-4 text-sm font-bold disabled:opacity-45"
              >
                {t.debioEsperar ? "Quitar la marca" : "Debió esperarme"}
              </button>
            </div>
          )}
        </div>
      )}
      {t.pideSuClic !== null && (
        <div role="note" className="flex flex-col gap-1 rounded-2xl bg-relieve p-3.5 text-sm">
          <span className="font-bold">Pide tu clic para producción</span>
          <span className="text-tenue">
            {t.pideSuClic || "Lo pidió el agente de salida."} Aunque le hayas quitado tu clic al proceso, va a esperarlo cuando esta tarea llegue a producción. Su plan para volver atrás está en «Plan de vuelta», en el archivo de la tarea.
          </span>
        </div>
      )}
      {t.eligeModeloDeSpec && <ModeloDeLaTarea rol="spec" linea={linea} t={t} modeloDeLaLinea={modelosDeLaLinea.spec} alCambiar={alHacer} />}
      {t.eligeModeloDeConstruccion && <ModeloDeLaTarea rol="construccion" linea={linea} t={t} modeloDeLaLinea={modelosDeLaLinea.construccion} alCambiar={alHacer} />}

      {hecho && (
        <p role={hecho.malo ? "alert" : "status"} className={`text-sm font-bold ${hecho.malo ? "text-peligro" : ""}`}>
          {hecho.texto}
        </p>
      )}

      {verCambios && (
        <div className="flex flex-col gap-2">
          {!cambios ? (
            <p className="text-sm text-tenue">Leyendo sus cambios…</p>
          ) : "motivo" in cambios ? (
            <p className="text-sm text-tenue">{cambios.motivo}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-0.5 text-xs">
                {cambios.archivos.map((a) => (
                  <li key={a.ruta} className="flex justify-between gap-3 font-mono">
                    <span className="truncate">{a.ruta}</span>
                    <span className="flex-none text-tenue">{a.nuevo ? "nuevo" : a.agregadas === null ? "binario" : `+${a.agregadas} −${a.quitadas}`}</span>
                  </li>
                ))}
              </ul>
              <pre tabIndex={0} className="max-h-96 overflow-auto rounded-2xl bg-fondo p-3 text-xs leading-relaxed">
                {cambios.diff}
                {cambios.cortado && "\n… (sigue: es muy largo para mostrarlo entero)"}
              </pre>
            </>
          )}
        </div>
      )}

      {!detalle ? (
        <p className="text-sm text-tenue">Leyendo la tarea…</p>
      ) : (
        <>
          {/* Lo de Label va primero en una grande que espera: es lo que se lee para probarla. */}
          {s?.probarAMano && <Seccion titulo="Para probar a mano (lo escribió Label)" texto={s.probarAMano} abierta={grande && aprobable} />}
          {s?.pedido && <Seccion titulo="Pedido" texto={s.pedido} abierta />}
          {s?.paraElPR && <Seccion titulo="Para el PR (lo escribió Label)" texto={s.paraElPR} />}
          {s?.spec && <Seccion titulo="Spec" texto={s.spec} />}
          {s?.hallazgos && <Seccion titulo="Hallazgos de revisión" texto={s.hallazgos} />}
          {s?.respuesta && <Seccion titulo="Tus respuestas" texto={s.respuesta} />}
          {pasos.length > 0 && (
            <section aria-label="Su camino" className="flex flex-col gap-1.5">
              <h3 className="text-xs font-extrabold text-tenue uppercase">Su camino</h3>
              <ol className="flex flex-col gap-1 text-xs">
                {pasos.map((p, i) => (
                  <li key={`${p.ts}-${i}`} className="flex gap-2">
                    <span className="w-24 flex-none text-tenue">{hace(p.ts, ahora)}</span>
                    <span>
                      {p.de ? `${ESTADO[p.de] ?? p.de} → ` : ""}
                      {ESTADO[p.a] ?? p.a}
                      {p.agente ? ` · ${p.agente}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      {DESCARTABLES.includes(t.estado) && (
        <div className="flex flex-col gap-2 border-t border-relieve pt-3">
          {!confirmarDescarte ? (
            <button type="button" onClick={() => setConfirmarDescarte(true)} className="min-h-10 self-start rounded-full bg-relieve px-4 text-sm font-bold">
              Descartar esta tarea…
            </button>
          ) : (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                Por qué (opcional)
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={600} className="min-h-10 w-full rounded-2xl bg-relieve px-3.5 text-sm font-normal" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={ocupada} onClick={() => void hacer({ accion: "descartar", motivo })} className="min-h-10 rounded-full bg-acento px-4 text-sm font-extrabold text-papel disabled:opacity-45">
                  Sí, descartarla
                </button>
                <button type="button" onClick={() => setConfirmarDescarte(false)} className="min-h-10 rounded-full bg-relieve px-4 text-sm font-bold">
                  No
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function Seccion({ titulo, texto, abierta }: { titulo: string; texto: string; abierta?: boolean }) {
  return (
    <details open={abierta} className="rounded-2xl bg-relieve px-3.5 py-2.5">
      <summary className="cursor-pointer text-sm font-extrabold">{titulo}</summary>
      <div className="mt-2 max-h-80 overflow-auto text-sm whitespace-pre-wrap text-tenue">{texto.trim()}</div>
    </details>
  );
}
