import Link from "next/link";
import { baseDeDatos } from "@/lib/datos";
import { cuentas } from "@/lib/entrada/bandeja";
import { vistaDeFuentes } from "@/lib/entrada/fuentes";
import { lineasDeLaFabrica } from "@/lib/fabrica/motor/proyecto";

/**
 * Lo común de las páginas de la fábrica, en el servidor: el menú (la planta, las líneas, las
 * tareas, la Entrada, la memoria, este equipo y la configuración) y la cabecera de cada página. En una
 * pantalla ancha el menú va a la izquierda; en una angosta, arriba y en fila.
 */

export type ParteDeLaFabrica = "planta" | "lineas" | "tareas" | "bandeja" | "peticion" | "fuentes" | "memoria" | "equipo" | "configuracion";

type Item = { id: ParteDeLaFabrica; nombre: string; ruta: string; icono: React.ReactNode };

const ICONO = {
  planta: <path d="M3 21V10l6 4V10l6 4V6l6 4v11zM3 21h18" />,
  lineas: <path d="M3 6h18M3 12h18M3 18h18" />,
  tareas: <path d="M4 4h5v16H4zM10.5 4h5v11h-5zM17 4h4v7h-4z" />,
  bandeja: <path d="M4 13l2.5-8h11L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h5l1 2h4l1-2h5" />,
  peticion: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14h6" />,
  fuentes: <path d="M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0zM12 17v4" />,
  memoria: <path d="M5 4h11l3 3v13H5zM9 4v5h6V4M8 14h8M8 17h5" />,
  equipo: <path d="M3 5h18v11H3zM8 20h8M12 16v4" />,
  configuracion: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />,
};

const GRUPOS: { titulo: string; items: Item[] }[] = [
  {
    titulo: "Fábrica",
    items: [
      { id: "planta", nombre: "La planta", ruta: "/fabrica", icono: ICONO.planta },
      { id: "lineas", nombre: "Líneas", ruta: "/fabrica/lineas", icono: ICONO.lineas },
      { id: "tareas", nombre: "Tareas", ruta: "/fabrica/tareas", icono: ICONO.tareas },
    ],
  },
  {
    titulo: "Entrada",
    items: [
      { id: "bandeja", nombre: "Bandeja", ruta: "/fabrica/bandeja", icono: ICONO.bandeja },
      { id: "peticion", nombre: "Nueva petición", ruta: "/fabrica/peticion", icono: ICONO.peticion },
      { id: "fuentes", nombre: "Fuentes", ruta: "/fabrica/fuentes", icono: ICONO.fuentes },
    ],
  },
  {
    titulo: "Ajustes",
    items: [
      { id: "memoria", nombre: "Memoria", ruta: "/fabrica/memoria", icono: ICONO.memoria },
      { id: "equipo", nombre: "Este equipo", ruta: "/fabrica/equipo", icono: ICONO.equipo },
      { id: "configuracion", nombre: "Configuración", ruta: "/configuracion", icono: ICONO.configuracion },
    ],
  },
];

/** Lo que el menú dice al lado de cada parte. Sin la base, nada. */
async function marcas(teEsperan: number | undefined) {
  const out: Partial<Record<Item["id"], { texto: string; etiqueta: string; llama: boolean }>> = {};
  const lineas = await lineasDeLaFabrica().catch(() => []);
  if (lineas.length) out.lineas = { texto: String(lineas.length), etiqueta: `${lineas.length} ${lineas.length === 1 ? "línea" : "líneas"}`, llama: false };
  if (teEsperan) out.tareas = { texto: String(teEsperan), etiqueta: `${teEsperan} te ${teEsperan === 1 ? "espera" : "esperan"}`, llama: true };
  try {
    const db = baseDeDatos();
    const c = cuentas(db);
    const nuevos = c.nuevo + c.cambio;
    if (nuevos) out.bandeja = { texto: String(nuevos), etiqueta: `${nuevos} por revisar`, llama: true };
    const caidas = vistaDeFuentes(db).filter((f) => f.estado === "rechazado" || f.estado === "falta_token" || f.estado === "sin_respuesta").length;
    if (caidas) out.fuentes = { texto: "!", etiqueta: `${caidas} sin leer`, llama: true };
  } catch {
    // Sin la base, el menú va sin marcas.
  }
  return out;
}

export async function MarcoDeLaFabrica({
  actual,
  titulo,
  descripcion,
  acciones,
  teEsperan,
  children,
}: {
  actual: ParteDeLaFabrica
  titulo: React.ReactNode
  descripcion?: React.ReactNode
  /** Lo que va a la derecha del título: los botones de la página. */
  acciones?: React.ReactNode
  /** Cuántas cosas te esperan en toda la planta, si la página ya lo sabe. */
  teEsperan?: number
  children: React.ReactNode
}) {
  const m = await marcas(teEsperan);
  return (
    <>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <nav aria-label="Secciones de la fábrica" className="flex flex-col gap-1 bg-ficha px-3 py-4 lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:flex-none lg:overflow-y-auto lg:px-4 lg:py-7">
          <div className="flex items-center justify-between gap-3 px-2 pb-2 lg:pb-4">
            <span className="flex items-center gap-2.5">
              <svg width="30" height="30" viewBox="0 0 34 34" aria-hidden="true">
                <rect width="34" height="34" rx="10" className="fill-acento" />
                <path d="M17 6 L19.4 14.6 L28 17 L19.4 19.4 L17 28 L14.6 19.4 L6 17 L14.6 14.6 Z" className="fill-papel" />
              </svg>
              <span className="text-[15px] leading-tight font-extrabold">La fábrica</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 lg:flex-col lg:flex-nowrap">
            {GRUPOS.map((g) => (
              <div key={g.titulo} className="flex flex-wrap items-center gap-1 lg:flex-col lg:items-stretch">
                <span className="hidden px-3 pt-3 pb-1 text-xs font-extrabold tracking-[.08em] text-tenue uppercase lg:block">{g.titulo}</span>
                {g.items.map((it) => {
                  const aqui = it.id === actual;
                  const marca = m[it.id];
                  return (
                    <Link
                      key={it.id}
                      href={it.ruta}
                      aria-current={aqui ? "page" : undefined}
                      className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-bold lg:min-h-11 lg:text-[15px] ${aqui ? "bg-acento text-papel" : "text-tenue hover:bg-relieve hover:text-texto"}`}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="hidden flex-none sm:block">
                        {it.icono}
                      </svg>
                      {it.nombre}
                      {marca && (
                        <span
                          aria-label={marca.etiqueta}
                          className={`ml-auto flex h-[22px] min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-extrabold ${aqui ? "bg-papel text-acento" : marca.llama ? "bg-aviso text-tinta" : "bg-relieve text-texto"}`}
                        >
                          {marca.texto}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>
        <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 sm:px-8 lg:py-7">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[28px] leading-tight font-extrabold">{titulo}</h1>
              {descripcion && <div className="mt-1 max-w-3xl text-sm text-tenue">{descripcion}</div>}
            </div>
            {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
          </header>
          {children}
        </main>
      </div>
    </>
  );
}
