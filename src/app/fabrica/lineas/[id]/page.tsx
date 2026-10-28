import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LineaVista } from "@/components/fabrica/linea";
import { MarcoDeLaFabrica } from "@/components/fabrica/marco";
import { lineasDeLaFabrica } from "@/lib/fabrica/motor/proyecto";
import { leerLaPlanta } from "@/lib/fabrica/planta/disco";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: (await lineasDeLaFabrica()).find((l) => l.id === id)?.nombre ?? "Líneas" };
}

/**
 * Una línea: su cola por etapa y lo que se puede hacer con sus tareas, sin que tenga que ser la
 * activa. Un id que no es de ninguna línea no muestra otra: no existe.
 */
export default async function Pagina({ params, searchParams }: Props) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const planta = await leerLaPlanta();
  const linea = planta.lineas.find((l) => l.id === id);
  if (!linea) notFound();
  const tarea = typeof q.tarea === "string" && /^F-\d{1,6}$/.test(q.tarea) ? q.tarea : null;
  return (
    <MarcoDeLaFabrica
      actual="lineas"
      titulo={linea.nombre}
      descripcion={[linea.raiz, linea.stack, linea.rama ? `trabaja en la rama ${linea.rama}` : null].filter(Boolean).join(" · ")}
      teEsperan={planta.numeros.teEsperan}
      acciones={
        <>
          <Link href={`/fabrica/peticion?linea=${encodeURIComponent(linea.id)}`} className="flex min-h-11 items-center rounded-full bg-acento px-4 text-sm font-extrabold text-papel">
            Nueva tarea aquí
          </Link>
          <button type="button" disabled aria-describedby="linea-pausa-despues" className="min-h-11 rounded-full bg-relieve px-4 text-sm font-bold opacity-45">
            Pausar esta línea
          </button>
          <span id="linea-pausa-despues" className="basis-full text-right text-xs text-tenue">
            Pausar una línea llega con el cambio a la fábrica.
          </span>
        </>
      }
    >
      <LineaVista inicial={planta} linea={linea.id} tareaInicial={tarea} />
    </MarcoDeLaFabrica>
  );
}
