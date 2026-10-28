import type { Metadata } from "next";
import { connection } from "next/server";
import { Fuentes } from "@/components/entrada/fuentes";
import { PaginaDeLaEntrada } from "@/components/entrada/pagina";
import { vistaDeLaEntrada } from "@/lib/entrada/acciones";

export const metadata: Metadata = { title: "Fuentes" };


/** Las fuentes de la Entrada: de dónde trae issues, y si su token está. Se lee en cada visita. */
export default async function Pagina() {
  // Se lee en cada visita: sin esto, el build la deja fija con lo que había al compilar.
  await connection();
  const entrada = await vistaDeLaEntrada();
  return (
    <PaginaDeLaEntrada parte="fuentes">
      <Fuentes inicial={entrada} />
    </PaginaDeLaEntrada>
  );
}
