import type { Metadata } from "next";
import { MarcoDeLaFabrica } from "@/components/fabrica/marco";
import { TareasDeTodas, type Agrupar } from "@/components/fabrica/tareas";
import { leerLaPlanta } from "@/lib/fabrica/planta/disco";
import { NOMBRE_DE_ORIGEN, type OrigenDeTarea } from "@/lib/fabrica/planta/lectura";

export const metadata: Metadata = { title: "Tareas" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const uno = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Las tareas de todas las líneas, con los filtros que traiga la dirección. */
export default async function Pagina({ searchParams }: Props) {
  const q = await searchParams;
  const planta = await leerLaPlanta();
  const linea = uno(q.linea);
  const origen = uno(q.origen);
  const agrupar = uno(q.agrupar);
  const vista = {
    texto: uno(q.q)?.slice(0, 120) ?? "",
    linea: linea && planta.lineas.some((l) => l.id === linea) ? linea : "",
    origen: origen && origen in NOMBRE_DE_ORIGEN ? (origen as OrigenDeTarea) : ("" as const),
    soloEsperan: uno(q.esperan) === "1",
    agrupar: (agrupar === "etapa" || agrupar === "lista" ? agrupar : "linea") as Agrupar,
  };
  return (
    <MarcoDeLaFabrica actual="tareas" titulo="Tareas" teEsperan={planta.numeros.teEsperan}>
      <TareasDeTodas inicial={planta} vista={vista} />
    </MarcoDeLaFabrica>
  );
}
