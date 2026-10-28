/**
 * Quién puede llamar a la aplicación: solo sus propias páginas, en este
 * equipo. Es lógica pura; la aplica `src/proxy.ts` a todo lo que hay en `/api`.
 *
 * El servidor escucha solo en este equipo, pero el navegador también es de
 * este equipo: sin esto, cualquier página abierta en otra pestaña podría
 * mandarle peticiones a la aplicación y, por ejemplo, borrar un gusto o
 * hacerla gastar créditos. Dos comprobaciones lo impiden:
 *
 *  - El nombre del servidor tiene que ser el de este equipo. Así no sirve un
 *    dominio ajeno que apunte a 127.0.0.1.
 *  - Lo que cambia algo tiene que venir de la propia aplicación. El navegador
 *    dice de dónde viene cada petición, y una página no puede mentir en eso.
 *
 * Lo que no viene de un navegador (los comandos de este proyecto, `curl`) no
 * trae esas cabeceras y pasa: quien puede correr un comando aquí ya puede todo.
 */

const LOCALES = new Set(["127.0.0.1", "localhost", "[::1]"]);

const nombreDe = (host: string) => host.replace(/:\d+$/, "").toLowerCase();

export function esPeticionAjena(peticion: { metodo: string; host: string | null; origen: string | null; sitio: string | null }): boolean {
  if (!peticion.host || !LOCALES.has(nombreDe(peticion.host))) return true;
  if (peticion.metodo === "GET" || peticion.metodo === "HEAD") return false;
  if (peticion.sitio && peticion.sitio !== "same-origin" && peticion.sitio !== "none") return true;
  if (peticion.origen && peticion.origen !== `http://${peticion.host}`) return true;
  return false;
}
