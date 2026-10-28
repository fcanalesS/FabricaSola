import type { Metadata } from "next";
import { Memoria } from "@/components/memoria-fabrica/memoria";
import { PaginaDeLaMemoria } from "@/components/memoria-fabrica/pagina";
import { vistaDeLaMemoria } from "@/lib/fabrica/memoria/pantalla";

export const metadata: Metadata = { title: "Memoria" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** La memoria de la fábrica: la ficha, las decisiones y las propuestas de cada línea y de la planta. Se lee en cada visita. */
export default async function Pagina({ searchParams }: Props) {
  const q = await searchParams;
  const memoria = await vistaDeLaMemoria(q.en);
  return (
    <PaginaDeLaMemoria>
      {/* Con otro lugar, el componente empieza de nuevo: sin lo que se estaba editando en el anterior. */}
      <Memoria key={memoria.en} inicial={memoria} />
    </PaginaDeLaMemoria>
  );
}
