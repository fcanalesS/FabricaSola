/**
 * Los modelos de la fábrica y los roles que llevan uno propio. Va aparte de
 * `cliente.ts` porque lo usa también la página de configuración, en el
 * navegador, y `cliente.ts` arrastra el motor, que es de servidor. Es lógica
 * pura.
 */

/** Los modelos que acepta Claude Code. */
export const MODELOS_DE_CLAUDE = ["haiku", "sonnet", "opus", "fable"] as const;
export type ModeloDeClaude = (typeof MODELOS_DE_CLAUDE)[number];
/** Un rol puede ir además con `inherit`: el modelo de la corrida. */
export type ModeloDeRol = ModeloDeClaude | "inherit";
export const ROLES_CON_MODELO = ["spec", "construccion", "revision", "aprobacion"] as const;
export type RolConModelo = (typeof ROLES_CON_MODELO)[number];

/**
 * Las etapas que hace un agente, con su clave en factory/config.md y el agente de la fábrica que
 * las hace si no se elige otro (`auto`). Las mismas del plugin (fabrica/hooks/tareas.ts, `ROLES`).
 */
export const ROLES_DE_AGENTE = {
  spec: { clave: "agente_spec", nombre: "Escribir la spec", defecto: "fabrica:spec-escritor" },
  construccion: { clave: "agente_construccion", nombre: "Construir", defecto: "fabrica:constructor" },
  revision_codigo: { clave: "agente_revision_codigo", nombre: "Revisar el código", defecto: "fabrica:revisor-codigo" },
  revision_seguridad: { clave: "agente_revision_seguridad", nombre: "Revisar la seguridad", defecto: "fabrica:revisor-seguridad" },
  ui: { clave: "agente_ui", nombre: "Revisar la interfaz", defecto: "fabrica:revisor-ui" },
  aprobacion: { clave: "agente_aprobacion", nombre: "Aprobar", defecto: "fabrica:aprobador" },
} as const;
export type RolDeAgente = keyof typeof ROLES_DE_AGENTE;
export const esRolDeAgente = (x: unknown): x is RolDeAgente => typeof x === "string" && x in ROLES_DE_AGENTE;
/** Un nombre de agente: `nombre` o `plugin:nombre`, en minúsculas, dígitos y guiones. La misma regla del plugin. */
export const esNombreDeAgente = (x: unknown): x is string => typeof x === "string" && /^[a-z0-9][a-z0-9-]*(:[a-z0-9][a-z0-9-]*)?$/.test(x);
/** Si vale como modelo de un rol: uno de Claude, o `inherit`. */
export const esModeloDeRol = (v: unknown): v is ModeloDeRol => v === "inherit" || (typeof v === "string" && (MODELOS_DE_CLAUDE as readonly string[]).includes(v));
/**
 * El modelo de un rol según su valor en factory/config.md. Sin uno válido, el mismo que usa el
 * plugin: la spec y la aprobación en Opus, los revisores en Sonnet y el resto con el de la corrida.
 */
export function modeloDeRolDesde(valor: string | undefined, rol: RolConModelo): ModeloDeRol {
  const v = valor?.trim();
  // La aprobación en Opus: lo decidió él el 27 de octubre de 2026 (fabrica/docs/Plan-Aprobador.md).
  return esModeloDeRol(v) ? v : rol === "spec" || rol === "aprobacion" ? "opus" : rol === "revision" ? "sonnet" : "inherit";
}
/** Cuántas tareas puede trabajar la fábrica a la vez: lo mismo que acepta el plugin. */
export const PARALELO = { min: 1, max: 6 } as const;
