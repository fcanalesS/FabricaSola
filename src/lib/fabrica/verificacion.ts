/**
 * Los comandos con que la fábrica verifica cada tarea de un proyecto (build,
 * test y lint) y su rama base, como están en su `factory/config.md`. Va aparte
 * del motor porque lo usa también la página, en el navegador: la
 * configuración los muestra y los edita, y el tablero no deja correr sin
 * ellos. Es lógica pura.
 */

export type ComandosDelProyecto = { build: string; test: string; lint: string; ramaBase: string };

export const NOMBRES_DE_COMANDO = ["build", "test", "lint"] as const;
export type NombreDeComando = (typeof NOMBRES_DE_COMANDO)[number];

/** Lo que se dice cuando no hay con qué verificar: el mismo motivo en la API y en el botón. */
export const SIN_COMANDOS =
  "Este proyecto no tiene comandos de build, test ni lint en factory/config.md: sin ellos, cada tarea terminaría esperando a una persona. Complétalos en la configuración, en «Los comandos del proyecto».";

/** Si faltan los tres comandos de verificación. Con uno solo ya se puede correr. */
export const sinComandos = (c: Partial<Record<NombreDeComando, string>> | null | undefined) => !!c && NOMBRES_DE_COMANDO.every((n) => !(c[n] ?? "").trim());

const LARGO_DE_COMANDO = 1000;

/** Una rama que git aceptaría como nombre: sin espacios, sin `..` y sin empezar con `-`. */
export const esNombreDeRama = (v: string) => /^[\w][\w./-]{0,199}$/.test(v) && !v.includes("..") && !v.endsWith(".lock") && !v.endsWith("/");

/**
 * Los comandos que él escribió, revisados: una línea cada uno, sin caracteres de control, y una
 * rama con nombre de rama. Devuelve los comandos limpios, o el motivo por el que no valen.
 */
export function revisarComandos(dato: unknown): { comandos: ComandosDelProyecto } | { error: string } {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  const comandos = { build: "", test: "", lint: "", ramaBase: "" };
  for (const n of NOMBRES_DE_COMANDO) {
    const v = d[n] ?? "";
    if (typeof v !== "string") return { error: `${n} tiene que ser texto.` };
    if (v.length > LARGO_DE_COMANDO) return { error: `${n} pasa de ${LARGO_DE_COMANDO} caracteres.` };
    if (/\p{Cc}/u.test(v)) return { error: `${n} tiene que ir en una sola línea.` };
    comandos[n] = v.trim();
  }
  const rama = typeof d.ramaBase === "string" ? d.ramaBase.trim() : "";
  if (!esNombreDeRama(rama)) return { error: "La rama base no tiene forma de nombre de rama." };
  comandos.ramaBase = rama;
  return { comandos };
}

/** Cómo salió cada comando al probarlo: `vacio`, si no hay; `omitido`, si usa `{archivos}` y solo tiene sentido en una tarea. */
export type PruebaDeComando = { nombre: NombreDeComando; comando: string; resultado: "ok" | "fallo" | "vacio" | "omitido"; codigo: number | null; salida: string; ms: number };
