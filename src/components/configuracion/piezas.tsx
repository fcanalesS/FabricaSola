"use client";

import { useSyncExternalStore } from "react";

/** Las piezas de la página de configuración: sus secciones, sus líneas y sus botones. */

export const BOTON = "min-h-9 pointer-coarse:min-h-11 flex-none rounded-full bg-relieve px-3.5 text-sm font-bold disabled:opacity-45";
/** Un campo de texto de una línea, con el aspecto de los de esta página. */
export const CAMPO = "min-h-9 pointer-coarse:min-h-11 rounded-full bg-relieve px-3.5 text-sm text-texto outline-none placeholder:text-tenue focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-papel";

/** Una línea de la configuración: qué es, cómo está y, si se puede, qué hacer con ello. */
export function Fila({ nombre, que, estado, detalle, alerta = false, children }: { nombre: string; que: string; estado: string; detalle?: string; alerta?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-relieve pt-4 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-[15px] leading-tight">
          <span className="font-extrabold">{nombre}</span> <span className="text-tenue">· {que}</span>
        </p>
        <p className={`mt-1 font-bold ${alerta ? "text-aviso" : ""}`}>{estado}</p>
        {detalle && <p className="text-sm text-tenue">{detalle}</p>}
      </div>
      {children && <div className="flex flex-none gap-2">{children}</div>}
    </div>
  );
}

export function Seccion({ titulo, bajada, children }: { titulo: string; bajada: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] bg-ficha p-5">
      <h2 className="text-lg leading-tight font-extrabold">{titulo}</h2>
      <p className="mt-0.5 text-sm text-tenue">{bajada}</p>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Lo que dice la dirección después de «#», sin el «#». En el servidor, nada. */
const leerLaParte = () => window.location.hash.replace(/^#/, "");
const alCambiarLaParte = (avisar: () => void) => {
  window.addEventListener("hashchange", avisar);
  return () => window.removeEventListener("hashchange", avisar);
};
export function useParteDeLaDireccion(): string {
  return useSyncExternalStore(alCambiarLaParte, leerLaParte, () => "");
}

/** Va a una parte de la página: queda en la dirección (atrás vuelve a la anterior) y se ve desde arriba. */
export function irALaParte(parte: string): void {
  window.location.hash = parte;
  requestAnimationFrame(() => window.scrollTo({ top: 0 }));
}

/**
 * La fila de botones para elegir una parte de una sección: se ve una a la vez. Cada una queda en la
 * dirección, para llegar directo y para volver con atrás.
 */
export function Partes<T extends string>({ partes, actual, prefijo, etiqueta }: { partes: readonly { id: T; nombre: string }[]; actual: T; prefijo: string; etiqueta: string }) {
  return (
    <nav aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {partes.map((p) => (
        <a
          key={p.id}
          href={`#${prefijo}${p.id}`}
          aria-current={p.id === actual ? "true" : undefined}
          onClick={(e) => {
            e.preventDefault();
            irALaParte(`${prefijo}${p.id}`);
          }}
          className={`inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-extrabold pointer-coarse:min-h-11 ${p.id === actual ? "bg-realce text-white" : "bg-relieve text-tenue"}`}
        >
          {p.nombre}
        </a>
      ))}
    </nav>
  );
}
