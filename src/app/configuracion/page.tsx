import type { Metadata } from "next";
import { connection } from "next/server";
import { SeccionDeLaFabrica } from "@/components/configuracion/fabrica";
import { MarcoDeLaFabrica } from "@/components/fabrica/marco";

export const metadata: Metadata = { title: "Configuración" };

/** La configuración de la fábrica: las líneas, los agentes y sus modelos, el gasto, las tareas y los avisos. */
export default async function Pagina() {
  // Se lee en cada visita: sin esto, el build la deja fija con lo que había al compilar.
  await connection();
  return (
    <MarcoDeLaFabrica actual="configuracion" titulo="Configuración">
      <SeccionDeLaFabrica />
    </MarcoDeLaFabrica>
  );
}
