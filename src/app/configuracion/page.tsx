import type { Metadata } from "next";
import { SeccionDeLaFabrica } from "@/components/configuracion/fabrica";
import { MarcoDeLaFabrica } from "@/components/fabrica/marco";

export const metadata: Metadata = { title: "Configuración" };

/** La configuración de la fábrica: las líneas, los agentes y sus modelos, el gasto, las tareas y los avisos. */
export default function Pagina() {
  return (
    <MarcoDeLaFabrica actual="configuracion" titulo="Configuración">
      <SeccionDeLaFabrica />
    </MarcoDeLaFabrica>
  );
}
