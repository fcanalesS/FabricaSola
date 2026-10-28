"use client";

import type { ReactNode } from "react";

/** Un grupo de botones donde solo uno está elegido. */
export function Segmento<T extends string>({
  etiqueta,
  valor,
  opciones,
  alElegir,
}: {
  etiqueta: string;
  valor: T | null;
  opciones: { id: T; texto: string }[];
  alElegir: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-ficha/90 p-1 shadow-lg" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valor === o.id}
          onClick={() => alElegir(o.id)}
          className={`min-h-9 rounded-full px-3.5 text-sm font-bold ${
            valor === o.id ? "bg-papel text-tinta" : "text-tenue hover:text-texto"
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/** Un interruptor con su explicación al lado. */
export function Interruptor({
  titulo,
  detalle,
  activo,
  alCambiar,
  deshabilitado,
}: {
  titulo: string;
  detalle?: string;
  activo: boolean;
  alCambiar: (activo: boolean) => void;
  deshabilitado?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 rounded-2xl bg-ficha p-3 ${deshabilitado ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        role="switch"
        checked={activo}
        disabled={deshabilitado}
        onChange={(e) => alCambiar(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative mt-0.5 h-6 w-11 flex-none rounded-full bg-relieve transition-colors peer-checked:bg-acento peer-focus-visible:outline peer-focus-visible:outline-2 focus-visible:outline-solid peer-focus-visible:outline-papel after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5"
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-bold">{titulo}</span>
        {detalle && <span className="text-sm text-tenue">{detalle}</span>}
      </span>
    </label>
  );
}

export function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-1">
      <h2 className="px-1 text-sm font-extrabold tracking-wide text-tenue uppercase">{titulo}</h2>
      {nota && <p className="px-1 pb-1 text-sm text-tenue">{nota}</p>}
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </section>
  );
}
