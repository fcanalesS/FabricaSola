import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { MarcoDeLaFabrica } from "@/components/fabrica/marco";
import { Planta } from "@/components/fabrica/planta";
import { leerLaPlanta } from "@/lib/fabrica/planta/disco";

export const metadata: Metadata = { title: "La planta" };


/** La planta: todas las líneas de la fábrica a la vez. Se lee en cada visita y después cada pocos segundos. */
export default async function Pagina() {
  // Se lee en cada visita: sin esto, el build la deja fija con lo que había al compilar.
  await connection();
  const planta = await leerLaPlanta();
  return (
    <MarcoDeLaFabrica
      actual="planta"
      titulo="La planta"
      teEsperan={planta.numeros.teEsperan}
      acciones={
        <>
          <Link href="/fabrica/peticion" className="flex min-h-11 items-center rounded-full bg-relieve px-4 text-sm font-bold">
            Nueva tarea
          </Link>
          <button type="button" disabled aria-describedby="planta-llega-despues" className="min-h-11 rounded-full bg-relieve px-4 text-sm font-bold opacity-45">
            Pausar la planta
          </button>
          <button type="button" disabled aria-describedby="planta-llega-despues" className="min-h-11 rounded-full bg-acento px-4 text-sm font-extrabold text-papel opacity-45">
            Correr todas
          </button>
          <span id="planta-llega-despues" className="basis-full text-right text-xs text-tenue">
            Pausar y correr varias líneas a la vez llegan con el cambio a la fábrica.
          </span>
        </>
      }
    >
      <Planta inicial={planta} />
    </MarcoDeLaFabrica>
  );
}
