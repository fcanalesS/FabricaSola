import Link from "next/link";
import type { ModeloDeRol } from "@/lib/fabrica/modelos";
import type { EstadoDeLinea, TarjetaDeLaPlanta } from "@/lib/fabrica/planta/lectura";

/**
 * Piezas que comparten las pantallas de la planta: cómo se dice un gasto, una hora o un estado.
 * Sin estado propio: sirven en el servidor y en el cliente.
 */

/** Los modelos con que se puede escribir una spec, como se ofrecen: el nombre y para qué conviene. */
export const MODELOS_DE_LA_SPEC: { valor: ModeloDeRol; nombre: string; detalle: string }[] = [
  { valor: "opus", nombre: "Opus", detalle: "El que usa la fábrica si no se elige otro." },
  { valor: "fable", nombre: "Fable", detalle: "El más capaz y el más caro: para pedidos grandes y difusos." },
  { valor: "sonnet", nombre: "Sonnet", detalle: "Más barato que Opus: para pedidos que ya son claros." },
  { valor: "haiku", nombre: "Haiku", detalle: "El más barato: para pedidos chicos y precisos." },
  { valor: "inherit", nombre: "El de la corrida", detalle: "El mismo modelo con que se lanza la corrida." },
];

/** Los modelos con que se puede aprobar. Opus si no se elige otro: lo decidió él el 27 de octubre de 2026. */
export const MODELOS_DE_LA_APROBACION: { valor: ModeloDeRol; nombre: string; detalle: string }[] = [
  { valor: "opus", nombre: "Opus", detalle: "El que usa la fábrica si no se elige otro: juzga contra la spec, los hallazgos y las fichas." },
  { valor: "fable", nombre: "Fable", detalle: "El más capaz y el más caro: para líneas con reglas delicadas." },
  { valor: "sonnet", nombre: "Sonnet", detalle: "Más barato: para líneas con tareas chicas y specs claras." },
  { valor: "haiku", nombre: "Haiku", detalle: "El más barato, y el que más arriesga aprobar algo que no cumple." },
  { valor: "inherit", nombre: "El de la corrida", detalle: "El mismo modelo con que se lanza la corrida." },
];

/** La opción «el de la línea» de un selector de modelo, con el que tiene la línea: «El de la línea (Opus)». */
export function opcionDeLaLinea(modelos: readonly { valor: ModeloDeRol; nombre: string }[], deLaLinea: ModeloDeRol | null | undefined): string {
  const m = modelos.find((x) => x.valor === deLaLinea);
  if (!m) return "El de la línea";
  return `El de la línea (${m.valor === "inherit" ? "el de la corrida" : m.nombre})`;
}

/** Los modelos con que se puede construir, con lo que conviene saber de cada uno. Jev abarata las tareas simples a Sonnet. */
export const MODELOS_DE_LA_CONSTRUCCION: { valor: ModeloDeRol; nombre: string; detalle: string }[] = [
  { valor: "inherit", nombre: "El de la corrida", detalle: "El que usa la fábrica si no se elige otro. En las tareas simples, Jev lo baja a Sonnet." },
  { valor: "fable", nombre: "Fable", detalle: "El más capaz y el más caro. En las tareas simples, Jev lo baja a Sonnet." },
  { valor: "opus", nombre: "Opus", detalle: "Para cambios grandes o delicados. En las tareas simples, Jev lo baja a Sonnet." },
  { valor: "sonnet", nombre: "Sonnet", detalle: "Más barato: para tareas acotadas y con la spec clara." },
  { valor: "haiku", nombre: "Haiku", detalle: "El más barato: para cambios chicos y mecánicos." },
];


/** Un gasto en USD como se escribe aquí: `1,84`. */
export const usd = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(2).replace(".", ",") : "—");

/** «hace 40 min», «hace 3 h», «hace 2 días»; `null` si no hay hora. */
export function hace(iso: string | null | undefined, ahora: number): string | null {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.round((ahora - t) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

/** La hora de un instante, en este equipo: `11:05`. */
export const hora = (iso: string | null | undefined) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
};

/** Cuánto duró: `38 min`, `1 h 05 min`. */
export function duracion(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export const ESTADO_DE_LINEA: Record<EstadoDeLinea, { texto: string; clase: string }> = {
  corriendo: { texto: "Corriendo", clase: "bg-papel text-tinta" },
  quieta: { texto: "Quieta", clase: "bg-relieve text-tenue" },
  "sin-fabrica": { texto: "Sin factory/", clase: "bg-relieve text-tenue" },
  error: { texto: "No se pudo leer", clase: "bg-relieve text-peligro outline-1 outline-peligro outline-solid" },
};

export function EstadoDeLaLinea({ estado }: { estado: EstadoDeLinea }) {
  const e = ESTADO_DE_LINEA[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold whitespace-nowrap ${e.clase}`}>
      {estado === "corriendo" && (
        <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
        </svg>
      )}
      {e.texto}
    </span>
  );
}

/** La inicial de una línea, en su cuadrito. */
export function Inicial({ nombre, grande }: { nombre: string; grande?: boolean }) {
  return (
    <span aria-hidden="true" className={`flex flex-none items-center justify-center rounded-lg bg-realce font-extrabold uppercase ${grande ? "size-12 text-xl" : "size-7 text-xs"}`}>
      {nombre.slice(0, 1)}
    </span>
  );
}

/** La dirección de una tarea en su línea. */
export const rutaDeTarea = (linea: string, id: string) => `/fabrica/lineas/${encodeURIComponent(linea)}?tarea=${encodeURIComponent(id)}`;

/**
 * Una tarea en su tarjeta chica, como en el kanban y en la grilla de todas. Con `href` lleva a su
 * línea; con `alElegir`, la elige en la misma página. `elegida`: la que se está mirando.
 */
export function TarjetaChica({ t, href, alElegir, elegida, pie, trabajando, linea }: { t: TarjetaDeLaPlanta; href?: string; alElegir?: () => void; elegida?: boolean; pie?: string | null; trabajando?: boolean; /** El nombre de su línea, si la tarjeta va fuera de ella. */ linea?: string }) {
  const clase = `flex w-full flex-col gap-1 rounded-xl p-2.5 text-left hover:bg-realce ${elegida ? "bg-realce" : "bg-ficha"} ${t.espera ? "outline-2 outline-aviso outline-solid" : trabajando ? "outline-1 outline-papel outline-solid" : ""}`;
  const dentro = (
    <>
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[13px] font-bold">{t.id}</span>
        {linea && <span className="truncate text-[11px] font-bold text-tenue">{linea}</span>}
        {t.espera && <span className="ml-auto flex-none rounded-full bg-aviso px-1.5 text-[11px] font-extrabold text-tinta">Te espera</span>}
      </span>
      <span className="line-clamp-3 text-[13px] leading-snug font-bold">{t.titulo}</span>
      <span className="text-[11px] font-bold text-tenue">{t.origenTexto}</span>
      {pie && <span className="text-[11px] text-tenue">{pie}</span>}
    </>
  );
  if (alElegir)
    return (
      <button type="button" onClick={alElegir} aria-pressed={elegida} className={clase}>
        {dentro}
      </button>
    );
  return (
    <Link href={href ?? "#"} className={clase}>
      {dentro}
    </Link>
  );
}

/** Lo que dice el pie de una tarjeta: quién la trabaja, qué espera, en qué vuelta va o cuándo se hizo. */
export function pieDeTarjeta(t: TarjetaDeLaPlanta, ahora: number, trabajo?: { agente: string } | null): string | null {
  if (t.espera === "pregunta") return `te preguntó ${hace(t.desde, ahora) ?? ""}`.trim();
  if (t.espera === "veredicto") return `${t.integracion?.clase === "grande" ? "espera tu prueba" : "espera tu veredicto"} ${hace(t.desde, ahora) ?? ""}`.trim();
  if (trabajo) return `${trabajo.agente} · trabajando`;
  if (t.etapa === "hechas") return `${t.hechaEn ? `hecha a las ${hora(t.hechaEn)}` : "hecha hoy"}${t.pideSuClic !== null ? " · pide tu clic para producción" : ""}`;
  if (t.vueltas > 0) return `${t.vueltas + 1}.ª vuelta`;
  if (t.estado === "pendiente" && t.dependeDe.length) return `después de ${t.dependeDe.join(", ")}`;
  return t.estado === "pendiente" ? "en cola" : null;
}
