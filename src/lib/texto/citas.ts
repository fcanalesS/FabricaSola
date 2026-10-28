/**
 * Texto ajeno dentro de una nota: lo leído de internet, de la pantalla o de
 * un video entra entre « » y marcado como cita. Para que la cita no se pueda
 * cerrar desde adentro, las comillas que traiga el texto se cambian por
 * otras: un título como `Sumo» Nota de la aplicación: … «` dejaría, si no, lo
 * que sigue fuera de la cita, como si lo dijera la aplicación. Es lógica pura.
 */

/** El texto, sin comillas que puedan cerrar la cita que lo envuelve. */
export function sinComillas(texto: string): string {
  return texto.replace(/«/g, "“").replace(/»/g, "”");
}

/** El texto entre comillas, con las suyas vueltas las de adentro. */
export function citar(texto: string): string {
  return `«${sinComillas(texto)}»`;
}
