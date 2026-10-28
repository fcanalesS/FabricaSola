import { MarcoDeLaFabrica } from "@/components/fabrica/marco";

/**
 * Lo común de la pantalla Memoria, en el servidor: el menú de la fábrica y su
 * cabecera. Lo que se mueve va en el cliente.
 */
export function PaginaDeLaMemoria({ children }: { children: React.ReactNode }) {
  return (
    <MarcoDeLaFabrica
      actual="memoria"
     
      titulo="La memoria de la fábrica"
      descripcion="Lo que cada proyecto ya decidió, para que ninguna tarea lo olvide. Los agentes proponen; a la ficha entra solo lo que apruebas tú. Los archivos quedan en el repositorio, sin commit."
    >
      {children}
    </MarcoDeLaFabrica>
  );
}
