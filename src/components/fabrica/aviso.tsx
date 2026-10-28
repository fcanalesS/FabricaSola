import Link from "next/link";

/**
 * Una pantalla sola, para cuando no hay página que mostrar: un error o una dirección que no existe.
 * Dice qué pasó y cómo seguir. Sin el menú, que lee archivos y podría ser lo que falló.
 */

export const BOTON_DEL_AVISO = "flex min-h-11 items-center rounded-full bg-relieve px-4 text-sm font-bold";

export function PantallaDeAviso({ titulo, children, acciones }: { titulo: string; children: React.ReactNode; acciones?: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-xl flex-col gap-4 rounded-[28px] bg-ficha p-6">
        <h1 className="text-2xl leading-tight font-extrabold">{titulo}</h1>
        <div className="flex flex-col gap-2 text-tenue">{children}</div>
        <div className="flex flex-wrap gap-2">
          {acciones}
          <Link href="/fabrica" className={BOTON_DEL_AVISO}>
            Ir a la planta
          </Link>
          <Link href="/fabrica/equipo" className={BOTON_DEL_AVISO}>
            Ver este equipo
          </Link>
        </div>
      </div>
    </main>
  );
}
