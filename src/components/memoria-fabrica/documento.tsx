"use client";

import { useId, useState } from "react";
import { BOTON, CAMPO, ETIQUETA, PRINCIPAL } from "@/components/entrada/pedir";
import type { DocumentoDeMemoria } from "@/lib/fabrica/memoria/formato";

/**
 * Una decisión o una propuesta: cómo se ve y el formulario con que él la
 * corrige o escribe la que reemplaza a otra. Lo que escribe se revisa en el
 * servidor; aquí solo se arma.
 */

export const SECCIONES = ["Decisión", "Por qué", "Qué se descartó", "Qué implica"] as const;
const SIN_ESCRIBIR = "_(sin escribir)_";
export const AREA = "min-h-24 w-full rounded-2xl bg-relieve px-3.5 py-2.5 text-sm text-texto outline-none placeholder:text-tenue focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-papel";

const escrito = (t: string | undefined) => (t && t !== SIN_ESCRIBIR ? t : "");

export type DatosDelFormulario = { titulo: string; temas: string; regla: string; secciones: Record<(typeof SECCIONES)[number], string> };

export const datosDe = (d: DocumentoDeMemoria | null, conRegla = true): DatosDelFormulario => ({
  titulo: d?.titulo ?? "",
  temas: d?.temas.join(", ") ?? "",
  regla: conRegla ? (d?.regla ?? "") : "",
  secciones: Object.fromEntries(SECCIONES.map((s) => [s, escrito(d?.secciones[s])])) as DatosDelFormulario["secciones"],
});

/** Los temas como chips, para leerlos de un vistazo. */
export function Temas({ temas }: { temas: readonly string[] }) {
  if (!temas.length) return null;
  return (
    <ul aria-label="Temas" className="flex flex-wrap gap-1.5">
      {temas.map((t) => (
        <li key={t} className="rounded-full bg-relieve px-2.5 py-0.5 font-mono text-xs">
          {t}
        </li>
      ))}
    </ul>
  );
}

/** Las secciones fijas: la decisión a la vista y el resto plegado. */
export function Secciones({ d }: { d: DocumentoDeMemoria }) {
  const resto = SECCIONES.slice(1).filter((s) => escrito(d.secciones[s]));
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="whitespace-pre-wrap">{escrito(d.secciones["Decisión"]) || <span className="text-tenue">Sin decisión escrita.</span>}</p>
      {resto.length > 0 && (
        <details className="rounded-2xl bg-relieve px-3.5 py-2">
          <summary className="cursor-pointer py-1 font-bold">{resto.join(", ")}</summary>
          <div className="flex flex-col gap-3 pt-2 pb-1">
            {resto.map((s) => (
              <div key={s}>
                <h4 className="text-xs font-extrabold tracking-wide text-tenue uppercase">{s}</h4>
                <p className="mt-1 whitespace-pre-wrap">{escrito(d.secciones[s])}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** El formulario de una decisión o una propuesta. `error` es lo que contestó el servidor la última vez. */
export function FormularioDeDocumento({
  inicial,
  ayudaRegla,
  boton,
  ocupada,
  error,
  guardar,
  cancelar,
}: {
  inicial: DatosDelFormulario;
  ayudaRegla: string;
  boton: string;
  ocupada: boolean;
  error: string | null;
  guardar: (d: DatosDelFormulario) => void;
  cancelar: () => void;
}) {
  const [d, setD] = useState(inicial);
  const id = useId();
  const cambiar = (campo: "titulo" | "temas" | "regla", v: string) => setD((x) => ({ ...x, [campo]: v }));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        guardar(d);
      }}
    >
      <label className={ETIQUETA}>
        Título
        <input className={CAMPO} value={d.titulo} maxLength={120} required onChange={(e) => cambiar("titulo", e.target.value)} />
      </label>
      <label className={ETIQUETA}>
        Temas
        <input className={`${CAMPO} font-mono`} value={d.temas} placeholder="base-de-datos, orm" aria-describedby={`${id}-temas`} onChange={(e) => cambiar("temas", e.target.value)} />
        <span id={`${id}-temas`} className="text-xs font-normal text-tenue">
          Separados por coma. Quedan en minúsculas, sin tildes y con guiones; el primero es el de la ficha.
        </span>
      </label>
      <label className={ETIQUETA}>
        Regla para la ficha
        <input className={CAMPO} value={d.regla} maxLength={160} placeholder="PostgreSQL 16, con Prisma." aria-describedby={`${id}-regla`} onChange={(e) => cambiar("regla", e.target.value)} />
        <span id={`${id}-regla`} className="text-xs font-normal text-tenue">
          {ayudaRegla}
        </span>
      </label>
      {SECCIONES.map((s) => (
        <label key={s} className={ETIQUETA}>
          {s}
          <textarea
            className={AREA}
            value={d.secciones[s]}
            required={s === "Decisión"}
            rows={s === "Decisión" ? 3 : 2}
            onChange={(e) => setD((x) => ({ ...x, secciones: { ...x.secciones, [s]: e.target.value } }))}
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="text-sm text-aviso">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={ocupada} className={PRINCIPAL}>
          {boton}
        </button>
        <button type="button" disabled={ocupada} className={BOTON} onClick={cancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Lo del formulario, como lo espera la ruta. */
export const paraLaRuta = (d: DatosDelFormulario) => ({ titulo: d.titulo, temas: d.temas.split(","), regla: d.regla, secciones: d.secciones });
