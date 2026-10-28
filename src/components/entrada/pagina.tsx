import { MarcoDeLaFabrica } from "@/components/fabrica/marco";

/**
 * Lo común de las páginas de la Entrada, en el servidor: el menú de la fábrica y la cabecera de
 * cada una. Lo que llega al navegador es la vista, que no trae ningún token.
 */

export type ParteDeLaEntrada = "bandeja" | "peticion" | "fuentes";

const CABECERA: Record<ParteDeLaEntrada, { titulo: string; descripcion: string }> = {
  bandeja: { titulo: "Bandeja", descripcion: "Lo que llega a la fábrica antes de volverse tarea. Nada pasa a una línea sin tu clic, y en el origen no se cambia nada." },
  peticion: { titulo: "Nueva petición", descripcion: "Lo que escribas aquí es tuyo: puede ir directo a la cola de una línea, o quedar como borrador en la Bandeja." },
  fuentes: { titulo: "Fuentes", descripcion: "De dónde trae issues la fábrica. Solo lee: no comenta, no cierra y no etiqueta nada en el origen." },
};

export function PaginaDeLaEntrada({ parte, children }: { parte: ParteDeLaEntrada; children: React.ReactNode }) {
  const c = CABECERA[parte];
  return (
    <MarcoDeLaFabrica actual={parte} titulo={c.titulo} descripcion={c.descripcion}>
      {children}
    </MarcoDeLaFabrica>
  );
}
