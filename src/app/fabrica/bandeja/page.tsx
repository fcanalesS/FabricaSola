import type { Metadata } from "next";
import { Bandeja } from "@/components/entrada/bandeja";
import { PaginaDeLaEntrada } from "@/components/entrada/pagina";
import { vistaDeLaEntrada } from "@/lib/entrada/acciones";

export const metadata: Metadata = { title: "Bandeja" };


/** La Bandeja: lo que llegó a la fábrica y todavía no es tarea. Se lee en cada visita. */
export default async function Pagina() {
  const entrada = await vistaDeLaEntrada();
  return (
    <PaginaDeLaEntrada parte="bandeja">
      <Bandeja inicial={entrada} />
    </PaginaDeLaEntrada>
  );
}
