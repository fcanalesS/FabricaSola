import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { MarcoDeLaFabrica } from "@/components/fabrica/marco";
import { loQueTieneEsteEquipo, type EstadoDePieza, type Pieza } from "@/lib/fabrica/equipo";

export const metadata: Metadata = { title: "Este equipo" };

const ESTADO: Record<EstadoDePieza, { texto: string; clase: string; icono: React.ReactNode }> = {
  lista: { texto: "Lista", clase: "text-texto", icono: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  falta: { texto: "Falta", clase: "text-peligro", icono: <path d="M6 6l12 12M18 6L6 18" /> },
  revisar: { texto: "Revisar", clase: "text-aviso", icono: <path d="M12 7v6M12 17h.01" /> },
  apagada: { texto: "No está", clase: "text-tenue", icono: <path d="M6 12h12" /> },
};

function Fila({ pieza }: { pieza: Pieza }) {
  const e = ESTADO[pieza.estado];
  return (
    <li className="flex gap-3 border-t border-relieve pt-4 first:border-t-0 first:pt-0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`mt-0.5 flex-none ${e.clase}`}>
        {e.icono}
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-tight">
          <span className="font-extrabold">{pieza.nombre}</span> <span className={`font-bold ${e.clase}`}>· {e.texto}</span>
        </p>
        <p className="mt-1 break-words">{pieza.como}</p>
        <p className="mt-1 text-sm text-tenue">Para qué: {pieza.permite}</p>
        {pieza.hacer && <p className="mt-1 text-sm font-bold">Qué hacer: <span className="font-normal">{pieza.hacer}</span></p>}
      </div>
    </li>
  );
}

/**
 * Lo que tiene este equipo: Claude Code y su sesión, git, gh y glab, Jev, las fuentes, el teléfono,
 * Codex y Antigravity. Se mira en cada visita; una variable nueva vale al reiniciar la aplicación.
 */
export default async function Pagina() {
  await connection();
  const grupos = await loQueTieneEsteEquipo();
  const piezas = grupos.flatMap((g) => g.piezas);
  const faltan = piezas.filter((p) => p.estado === "falta").length;
  return (
    <MarcoDeLaFabrica
      actual="equipo"
      titulo="Este equipo"
      descripcion={
        faltan
          ? `Te ${faltan === 1 ? "falta una pieza" : `faltan ${faltan} piezas`} para correr. Lo demás es opcional: lo que no está queda apagado.`
          : "Lo necesario para correr está. Lo demás es opcional: lo que no está queda apagado, y aquí dice qué agregar."
      }
      acciones={
        <Link href="/fabrica/equipo" className="flex min-h-11 items-center rounded-full bg-relieve px-4 text-sm font-bold">
          Volver a mirar
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        {grupos.map((g) => (
          <section key={g.titulo} aria-labelledby={`equipo-${g.titulo}`} className="rounded-[28px] bg-ficha p-5">
            <h2 id={`equipo-${g.titulo}`} className="text-lg leading-tight font-extrabold">
              {g.titulo}
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {g.piezas.map((p) => (
                <Fila key={p.id} pieza={p} />
              ))}
            </ul>
          </section>
        ))}
        <p className="text-sm text-tenue">Las variables van en .env.local, en la carpeta de la aplicación; .env.example dice cuáles hay. De las claves y los tokens solo se dice si están.</p>
      </div>
    </MarcoDeLaFabrica>
  );
}
