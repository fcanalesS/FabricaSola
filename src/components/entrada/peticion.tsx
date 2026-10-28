"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { LineaALaVista } from "@/lib/entrada/acciones";
import { LIMITES } from "@/lib/entrada/peticion";
import type { ModeloDeRol } from "@/lib/fabrica/modelos";
import { MODELOS_DE_LA_CONSTRUCCION, MODELOS_DE_LA_SPEC, opcionDeLaLinea } from "../fabrica/piezas";
import { BOTON, CAMPO, enLaEntrada, ETIQUETA, PRINCIPAL } from "./pedir";

/**
 * El formulario de petición: lo que él escribe es el pedido de la tarea, tal
 * cual. Con criterios que se puedan comprobar, la fábrica se salta la spec.
 * Los errores van junto a cada campo. `desde`: el issue de la Bandeja que él
 * reescribe con sus palabras; la tarea recuerda de dónde salió.
 */

export type DesdeUnIssue = { id: number; titulo: string; linea: string | null; ref: string; fuente: string };

type Errores = Partial<Record<"linea" | "titulo" | "que" | "criterios" | "fueraDeAlcance" | "archivos" | "dependeDe" | "destino" | "modeloSpec" | "modeloConstruccion", string>>;

export function Peticion({ lineas, desde, lineaElegida = null }: { lineas: LineaALaVista[]; desde: DesdeUnIssue | null; /** La que se eligió al llegar («Nueva tarea aquí»), si existe. */ lineaElegida?: string | null }) {
  const id = useId();
  const pedida = desde?.linea ?? lineaElegida;
  const inicial = pedida && lineas.some((l) => l.id === pedida) ? pedida : (lineas[0]?.id ?? "");
  const [linea, setLinea] = useState(inicial);
  const [titulo, setTitulo] = useState(desde?.titulo.slice(0, LIMITES.titulo) ?? "");
  const [que, setQue] = useState("");
  const [criterios, setCriterios] = useState<string[]>([""]);
  const [fuera, setFuera] = useState("");
  const [archivos, setArchivos] = useState("");
  const [deps, setDeps] = useState<string[]>([]);
  const [destino, setDestino] = useState<"cola" | "bandeja">("cola");
  const [modelo, setModelo] = useState<ModeloDeRol | "linea">("linea");
  const [modeloConstruccion, setModeloConstruccion] = useState<ModeloDeRol | "linea">("linea");
  const [errores, setErrores] = useState<Errores>({});
  const [ocupada, setOcupada] = useState(false);
  const [hecho, setHecho] = useState<{ texto: string; malo: boolean } | null>(null);

  const abiertas = lineas.find((l) => l.id === linea)?.abiertas ?? [];
  const nombreDeLinea = lineas.find((l) => l.id === linea)?.nombre ?? "la línea";
  const laLinea = lineas.find((l) => l.id === linea);
  const err = (campo: keyof Errores) => (errores[campo] ? { "aria-invalid": true, "aria-describedby": `${id}-${campo}` } : {});
  const fallo = (campo: keyof Errores) =>
    errores[campo] ? (
      <span id={`${id}-${campo}`} className="text-sm font-bold text-aviso">
        {errores[campo]}
      </span>
    ) : null;

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setOcupada(true);
    setHecho(null);
    const r = await enLaEntrada({ accion: "peticion", linea, titulo, que, criterios, fueraDeAlcance: fuera, archivos, dependeDe: deps, destino, ...(desde && destino === "cola" ? { desde: desde.id } : {}), ...(destino === "cola" && modelo !== "linea" ? { modeloSpec: modelo } : {}), ...(destino === "cola" && modeloConstruccion !== "linea" ? { modeloConstruccion } : {}) });
    setOcupada(false);
    setErrores((r.errores ?? {}) as Errores);
    if (!r.ok) {
      setHecho({ texto: r.errores ? "Revisa lo marcado." : (r.error ?? "No se pudo."), malo: true });
      return;
    }
    setHecho({ texto: r.nota ?? "Listo.", malo: false });
    setTitulo("");
    setQue("");
    setCriterios([""]);
    setFuera("");
    setArchivos("");
    setDeps([]);
    setModelo("linea");
    setModeloConstruccion("linea");
  }

  if (!lineas.length)
    return (
      <section className="rounded-[28px] bg-ficha p-6 text-sm">
        <p className="font-bold">Todavía no hay líneas.</p>
        <p className="mt-1 text-tenue">Una línea es un proyecto con su carpeta factory: elígelo en la configuración de la fábrica y vuelve.</p>
      </section>
    );

  return (
    <form onSubmit={(ev) => void enviar(ev)} aria-label="La petición" className="flex flex-wrap items-start gap-5" noValidate>
      <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-5 rounded-[28px] bg-ficha p-5">
        {desde && (
          <p className="rounded-2xl bg-relieve px-4 py-3 text-sm">
            Reescribes con tus palabras <strong>{desde.fuente} {desde.ref}</strong>. El pedido es lo que escribas aquí; la tarea recuerda de qué issue salió, y el issue sale de la Bandeja.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={ETIQUETA}>
            Línea
            <select
              value={linea}
              onChange={(ev) => {
                setLinea(ev.target.value);
                setDeps([]);
              }}
              className={CAMPO}
              {...err("linea")}
            >
              {lineas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
            {fallo("linea")}
          </label>
          <label className={ETIQUETA}>
            Título
            <input value={titulo} maxLength={LIMITES.titulo} onChange={(ev) => setTitulo(ev.target.value)} className={CAMPO} aria-describedby={`${id}-titulo-ayuda`} {...err("titulo")} />
            <span id={`${id}-titulo-ayuda`} className="font-normal text-tenue">
              Una línea, hasta {LIMITES.titulo} caracteres. Es el nombre de la tarea y de su rama.
            </span>
            {fallo("titulo")}
          </label>
        </div>

        <label className={ETIQUETA}>
          Qué necesitas
          <textarea value={que} rows={5} maxLength={LIMITES.que} onChange={(ev) => setQue(ev.target.value)} className={`${CAMPO} py-3 leading-relaxed`} {...err("que")} />
          <span className="font-normal text-tenue">Para quién es y para qué. El cómo lo decide la fábrica, salvo que importe.</span>
          {fallo("que")}
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Criterios de aceptación</legend>
          <p className="text-sm text-tenue">Cada uno, algo que se vea o que pase y se pueda comprobar: «En Inventario › Stock hay un botón Exportar CSV».</p>
          {criterios.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 flex-none text-right font-bold text-tenue">{i + 1}</span>
              <input
                value={c}
                maxLength={LIMITES.criterio}
                aria-label={`Criterio ${i + 1}`}
                onChange={(ev) => setCriterios((cs) => cs.map((x, j) => (j === i ? ev.target.value : x)))}
                className={CAMPO}
                {...err("criterios")}
              />
              <button type="button" aria-label={`Quitar el criterio ${i + 1}`} disabled={criterios.length === 1} className={BOTON} onClick={() => setCriterios((cs) => cs.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </div>
          ))}
          {fallo("criterios")}
          <button type="button" disabled={criterios.length >= LIMITES.criterios} className={`${BOTON} self-start`} onClick={() => setCriterios((cs) => [...cs, ""])}>
            Agregar un criterio
          </button>
        </fieldset>

        <details className="rounded-2xl bg-relieve px-4">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold">Más detalle (opcional): fuera de alcance, dependencias, archivos</summary>
          <div className="flex flex-col gap-4 pt-1 pb-4">
            <label className={ETIQUETA}>
              Fuera de alcance
              <textarea value={fuera} rows={2} maxLength={LIMITES.fuera} onChange={(ev) => setFuera(ev.target.value)} className={`${CAMPO} bg-ficha py-2.5`} {...err("fueraDeAlcance")} />
              {fallo("fueraDeAlcance")}
            </label>
            {abiertas.length > 0 && (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1.5 text-sm font-bold">Depende de</legend>
                <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
                  {abiertas.map((t) => (
                    <label key={t.id} className="flex min-h-8 items-center gap-2 text-sm">
                      <input type="checkbox" checked={deps.includes(t.id)} onChange={(ev) => setDeps((d) => (ev.target.checked ? [...d, t.id].slice(0, LIMITES.dependeDe) : d.filter((x) => x !== t.id)))} />
                      <span className="font-bold">{t.id}</span> {t.titulo}
                    </label>
                  ))}
                </div>
                {fallo("dependeDe")}
              </fieldset>
            )}
            <label className={ETIQUETA}>
              Archivos o zonas que toca
              <input value={archivos} maxLength={LIMITES.archivos} placeholder="Por ejemplo: Controllers/StockController.cs" onChange={(ev) => setArchivos(ev.target.value)} className={`${CAMPO} bg-ficha`} {...err("archivos")} />
              <span className="font-normal text-tenue">Si dos tareas dicen tocar lo mismo, la segunda espera a que la primera se integre.</span>
              {fallo("archivos")}
            </label>
          </div>
        </details>
      </div>

      <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
        <fieldset className="flex flex-col gap-2 rounded-[28px] bg-ficha p-5">
          <legend className="sr-only">A dónde va</legend>
          <h2 aria-hidden="true" className="text-lg font-extrabold">
            A dónde va
          </h2>
          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 ${destino === "cola" ? "bg-realce" : "bg-relieve"}`}>
            <input type="radio" name={`${id}-destino`} checked={destino === "cola"} onChange={() => setDestino("cola")} className="mt-1" />
            <span>
              <span className="block font-bold">Directo a la cola de {nombreDeLinea}</span>
              <span className="text-sm text-tenue">Entra como pendiente y la toma el próximo puesto libre.</span>
            </span>
          </label>
          {destino === "cola" && (
            <details className="rounded-2xl bg-relieve px-4" {...(errores.modeloSpec || errores.modeloConstruccion ? { open: true } : {})}>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold">Con qué modelos se hace (opcional)</summary>
              <div className="flex flex-col gap-4 pb-4">
                <label className={ETIQUETA}>
                  La spec se escribe con
                  <select value={modelo} onChange={(ev) => setModelo(ev.target.value as ModeloDeRol | "linea")} className={`${CAMPO} bg-ficha`} {...err("modeloSpec")}>
                    <option value="linea">{opcionDeLaLinea(MODELOS_DE_LA_SPEC, laLinea?.modeloSpec)}</option>
                    {MODELOS_DE_LA_SPEC.map((m) => (
                      <option key={m.valor} value={m.valor}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                  <span className="font-normal text-tenue">{modelo === "linea" ? "Con otro, la spec se escribe siempre, aunque el pedido ya sea claro." : MODELOS_DE_LA_SPEC.find((m) => m.valor === modelo)?.detalle}</span>
                  {fallo("modeloSpec")}
                </label>
                <label className={ETIQUETA}>
                  Se construye con
                  <select value={modeloConstruccion} onChange={(ev) => setModeloConstruccion(ev.target.value as ModeloDeRol | "linea")} className={`${CAMPO} bg-ficha`} {...err("modeloConstruccion")}>
                    <option value="linea">{opcionDeLaLinea(MODELOS_DE_LA_CONSTRUCCION, laLinea?.modeloConstruccion)}</option>
                    {MODELOS_DE_LA_CONSTRUCCION.map((m) => (
                      <option key={m.valor} value={m.valor}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                  <span className="font-normal text-tenue">{modeloConstruccion === "linea" ? "En las tareas simples, Jev puede usar Sonnet." : "Elegido para esta tarea: Jev no lo cambia, y vale también si vuelve a construcción."}</span>
                  {fallo("modeloConstruccion")}
                </label>
              </div>
            </details>
          )}
          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 ${destino === "bandeja" ? "bg-realce" : "bg-relieve"} ${desde ? "opacity-60" : ""}`}>
            <input type="radio" name={`${id}-destino`} checked={destino === "bandeja"} disabled={!!desde} onChange={() => setDestino("bandeja")} className="mt-1" />
            <span>
              <span className="block font-bold">A la Bandeja, para revisarla después</span>
              <span className="text-sm text-tenue">{desde ? "Lo que reescribes de un issue va directo a la cola." : "Queda como borrador tuyo, sin número todavía."}</span>
            </span>
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="submit" disabled={ocupada} className={PRINCIPAL}>
              {destino === "cola" ? "Crear la tarea" : "Dejarla en la Bandeja"}
            </button>
            <Link href="/fabrica/bandeja" className={`${BOTON} flex items-center`}>
              Ir a la Bandeja
            </Link>
          </div>
          {hecho && (
            <p role={hecho.malo ? "alert" : "status"} className={`mt-1 rounded-2xl bg-relieve px-4 py-3 text-sm ${hecho.malo ? "text-aviso" : ""}`}>
              {hecho.texto}
            </p>
          )}
        </fieldset>
      </div>
    </form>
  );
}
