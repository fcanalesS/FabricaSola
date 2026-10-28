import { redirect } from "next/navigation";
import { connection } from "next/server";
import { MarcoDeLaFabrica } from "@/components/fabrica/marco";
import { leerAjustes, lineasDeLaFabrica } from "@/lib/fabrica/motor/proyecto";
import Link from "next/link";


/** Las líneas: lleva a la activa o, si no hay, a la primera. Sin líneas, dice cómo agregar una. */
export default async function Pagina() {
  // Se lee en cada visita: sin esto, el build la deja fija con lo que había al compilar.
  await connection();
  const [lineas, ajustes] = await Promise.all([lineasDeLaFabrica(), leerAjustes()]);
  const destino = lineas.find((l) => l.id === ajustes.lineaActiva) ?? lineas[0];
  if (destino) redirect(`/fabrica/lineas/${encodeURIComponent(destino.id)}`);
  return (
    <MarcoDeLaFabrica actual="lineas" titulo="Líneas">
      <section className="flex flex-col items-start gap-3 rounded-[22px] bg-ficha p-6">
        <p className="max-w-xl text-sm text-tenue">Todavía no hay líneas. Una línea es un repositorio con git: la fábrica le arma su carpeta factory/ y trabaja su cola.</p>
        <Link href="/configuracion#fabrica" className="flex min-h-11 items-center rounded-full bg-acento px-5 text-sm font-extrabold text-papel">
          Agregar una línea
        </Link>
      </section>
    </MarcoDeLaFabrica>
  );
}
