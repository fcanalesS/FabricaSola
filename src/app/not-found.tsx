import type { Metadata } from "next";
import { PantallaDeAviso } from "@/components/fabrica/aviso";

export const metadata: Metadata = { title: "No existe" };

/** Una dirección que no existe, o una línea o tarea que ya no está. */
export default function NoExiste() {
  return (
    <PantallaDeAviso titulo="Esto no existe">
      <p>La dirección no lleva a ninguna página, o lo que buscabas (una línea, una tarea) ya no está.</p>
    </PantallaDeAviso>
  );
}
