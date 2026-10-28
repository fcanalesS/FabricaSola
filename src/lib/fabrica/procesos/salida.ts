import { leerFicha } from "../memoria/formato.ts";

/**
 * Lo que siempre pide su clic para producción, aunque él lo haya quitado en un proceso: un cambio
 * en la base de datos o en el núcleo del negocio. Lo
 * decide el código, sin preguntarle a ningún modelo, mirando los archivos que cambiaron desde la
 * última salida de ese proceso. Lo de la base lo trae el código; el núcleo lo marca él en la ficha
 * de la línea, con reglas del tema `nucleo`:
 *
 *   - [nucleo] db/servidor/** — el esquema de la base
 *
 * Es lógica pura.
 */

/** Una regla de lo crítico: el patrón de las rutas y por qué. */
export type ReglaCritica = { patron: string; porque: string };

/**
 * Lo que es de la base de datos en cualquier proyecto: lo trae el código. No nombra ningún stack:
 * lo propio de cada uno (el esquema de Prisma, las carpetas de datos) lo marca él con `[nucleo]`,
 * y la aplicación se lo propone al crear la memoria de la línea (`memoria/sembrar.ts`).
 */
export const LO_DE_LA_BASE: readonly ReglaCritica[] = [
  { patron: "**/migrations/**", porque: "una migración" },
  { patron: "**/*.sql", porque: "SQL" },
];

/**
 * Lo delicado en cualquier proyecto, para saber si una tarea aprobada es grande: la base, el pipeline y las dependencias. La misma lista vive
 * en el mod (fabrica/hooks/integracion.ts), que es quien clasifica.
 */
export const LO_DELICADO: readonly ReglaCritica[] = [
  ...LO_DE_LA_BASE,
  { patron: ".github/workflows/**", porque: "el pipeline" },
  { patron: "**/.gitlab-ci.yml", porque: "el pipeline" },
  { patron: "**/azure-pipelines.yml", porque: "el pipeline" },
  { patron: "**/Jenkinsfile", porque: "el pipeline" },
  { patron: "**/package.json", porque: "las dependencias" },
  { patron: "**/package-lock.json", porque: "las dependencias" },
  { patron: "**/*.csproj", porque: "las dependencias" },
  { patron: "**/requirements.txt", porque: "las dependencias" },
  { patron: "**/pyproject.toml", porque: "las dependencias" },
  { patron: "**/go.mod", porque: "las dependencias" },
  { patron: "**/Cargo.toml", porque: "las dependencias" },
];

/** Cuántos archivos se nombran en la nota; los demás se cuentan. */
const A_LA_VISTA = 5;

/**
 * Si una ruta (con `/`) coincide con un patrón: `**` es cualquier parte del camino, `*` y `?`
 * dentro de una carpeta. Un patrón sin comodines es esa ruta o lo que hay debajo. Sin importar
 * mayúsculas, como en Windows.
 */
export function coincide(patron: string, ruta: string): boolean {
  const p = patron.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  const r = ruta.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!p) return false;
  if (!/[*?]/.test(p)) return r.toLowerCase() === p.toLowerCase() || r.toLowerCase().startsWith(`${p.toLowerCase()}/`);
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    if (c === "*" && p[i + 1] === "*") {
      // `**/` es cero o más carpetas; `**` solo, cualquier cosa.
      if (p[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i").test(r);
}

/**
 * Las reglas del núcleo de la ficha de una línea: las del tema `nucleo`. El patrón es lo primero de
 * la regla (con o sin comillas invertidas); lo que va después de una raya es el porqué.
 */
export function nucleoDeLaFicha(texto: string): ReglaCritica[] {
  return leerFicha(texto)
    .reglas.filter((r) => r.tema === "nucleo")
    .map((r) => {
      const [primero = "", ...resto] = r.texto.trim().split(/\s+/);
      const patron = primero.replace(/^`|`$/g, "");
      const porque = resto.join(" ").replace(/^[—–-]+\s*/, "").trim();
      return { patron, porque: porque ? `núcleo: ${porque}` : "el núcleo" };
    })
    .filter((r) => r.patron);
}

/** Lo crítico de un cambio: cada archivo que coincide con una regla, con la primera que lo marca (el núcleo antes que la base). */
export function loCritico(rutas: readonly string[], nucleo: readonly ReglaCritica[]): { ruta: string; porque: string }[] {
  const reglas = [...nucleo, ...LO_DE_LA_BASE];
  const out: { ruta: string; porque: string }[] = [];
  for (const ruta of rutas) {
    const regla = reglas.find((r) => coincide(r.patron, ruta));
    if (regla) out.push({ ruta, porque: regla.porque });
  }
  return out;
}

/**
 * La nota de las tareas que el agente de salida marcó con `tu-clic` y que entran en este commit:
 * cuál y por qué, hasta cinco. Sin ninguna, no hay nota.
 */
export function notaDeTareasMarcadas(tareas: readonly { id: string; motivo: string }[]): string {
  if (!tareas.length) return "";
  const nombradas = tareas.slice(0, A_LA_VISTA).map((t) => (t.motivo ? `${t.id} (${t.motivo})` : t.id));
  const mas = tareas.length > A_LA_VISTA ? ` y ${tareas.length - A_LA_VISTA} más` : "";
  return `${tareas.length === 1 ? "Una tarea pide" : "Hay tareas que piden"} tu clic para producción: ${nombradas.join(", ")}${mas}. Su plan de vuelta está en la tarea.`;
}

/** La nota del paso de producción cuando lo crítico pide su clic: qué archivos y por qué, hasta cinco. */
export function notaDeLoCritico(criticos: readonly { ruta: string; porque: string }[]): string {
  if (!criticos.length) return "";
  const nombrados = criticos.slice(0, A_LA_VISTA).map((c) => `${c.ruta} (${c.porque})`);
  const mas = criticos.length > A_LA_VISTA ? ` y ${criticos.length - A_LA_VISTA} más` : "";
  return `Desde la última salida cambió lo que siempre pide tu clic: ${nombrados.join(", ")}${mas}.`;
}
