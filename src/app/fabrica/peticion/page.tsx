import type { Metadata } from "next";
import { PaginaDeLaEntrada } from "@/components/entrada/pagina";
import { Peticion, type DesdeUnIssue } from "@/components/entrada/peticion";
import { vistaDeLaEntrada } from "@/lib/entrada/acciones";

export const metadata: Metadata = { title: "Nueva petición" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * El formulario de petición. Con `?desde=<id>`, él reescribe con sus palabras un issue que espera
 * en la Bandeja: se trae su título y su referencia, nunca su texto. Con `?linea=<id>`, llega con
 * esa línea elegida (si existe; si no, la primera).
 */
export default async function Pagina({ searchParams }: Props) {
  const params = await searchParams;
  const entrada = await vistaDeLaEntrada();
  const id = Number(params.desde);
  const e = Number.isInteger(id) ? entrada.bandeja.elementos.find((x) => x.id === id && x.fuente !== null && x.estado === "nuevo") : undefined;
  const desde: DesdeUnIssue | null = e ? { id: e.id, titulo: e.titulo, linea: e.linea, ref: e.ref, fuente: entrada.fuentes.find((f) => f.id === e.fuente)?.nombre ?? "el issue" } : null;
  return (
    <PaginaDeLaEntrada parte="peticion">
      <Peticion lineas={entrada.lineas} desde={desde} lineaElegida={typeof params.linea === "string" ? params.linea : null} />
    </PaginaDeLaEntrada>
  );
}
