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

/** El archivo del agente de la fábrica de una etapa, sin `.md` (en `fabrica/agents/`). */
export const archivoDelRol = (rol: RolDeAgente) => ROLES_DE_AGENTE[rol].defecto.slice("fabrica:".length);
/**
 * El nombre del agente propio de una etapa: una copia del de la fábrica en `.claude/agents/` del
 * proyecto, que se edita desde la configuración. Es el mismo que pone `/fabrica:agentes copiar`
 * (fabrica/hooks/tareas.ts, `nombreDeCopia`): las dos formas llegan al mismo archivo.
 */
export const nombreDeCopia = (rol: RolDeAgente) => `fabrica-${archivoDelRol(rol)}`;

/** Los topes de lo que se escribe en un agente propio. */
export const AGENTE_PROPIO = { descripcionMax: 500, instruccionesMax: 64 * 1024 } as const;

/**
 * Lo escrito en un agente propio, revisado: la descripción en una línea y las instrucciones sin
 * caracteres de control. Su nombre, sus herramientas y su modelo no se escriben aquí: los pone su
 * etapa. Es lógica pura.
 */
export function revisarAgentePropio(dato: unknown): { descripcion: string; instrucciones: string } | { error: string } {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  const descripcion = typeof d.descripcion === "string" ? d.descripcion.replace(/\s+/g, " ").trim() : "";
  const instrucciones = typeof d.instrucciones === "string" ? d.instrucciones.replace(/\r\n?/g, "\n").trim() : "";
  if (!descripcion) return { error: "Falta la descripción: con ella el orquestador sabe qué hace este agente." };
  if (descripcion.length > AGENTE_PROPIO.descripcionMax) return { error: `La descripción va hasta ${AGENTE_PROPIO.descripcionMax} caracteres.` };
  if (/\p{Cc}/u.test(descripcion)) return { error: "La descripción trae caracteres de control." };
  if (!instrucciones) return { error: "Faltan las instrucciones." };
  if (new TextEncoder().encode(instrucciones).length > AGENTE_PROPIO.instruccionesMax) return { error: "Las instrucciones van hasta 64 KB." };
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(instrucciones)) return { error: "Las instrucciones traen caracteres de control." };
  return { descripcion, instrucciones };
}
/** Si vale como modelo de un rol: uno de Claude, o `inherit`. */
export const esModeloDeRol = (v: unknown): v is ModeloDeRol => v === "inherit" || (typeof v === "string" && (MODELOS_DE_CLAUDE as readonly string[]).includes(v));
/**
 * El modelo de un rol según su valor en factory/config.md. Sin uno válido, el mismo que usa el
 * plugin: la spec y la aprobación en Opus, los revisores en Sonnet y el resto con el de la corrida.
 */
export function modeloDeRolDesde(valor: string | undefined, rol: RolConModelo): ModeloDeRol {
  const v = valor?.trim();
  // La aprobación en Opus: lo decidió él el 27 de octubre de 2026.
  return esModeloDeRol(v) ? v : rol === "spec" || rol === "aprobacion" ? "opus" : rol === "revision" ? "sonnet" : "inherit";
}
/** Cuántas tareas puede trabajar la fábrica a la vez: lo mismo que acepta el plugin. */
export const PARALELO = { min: 1, max: 6 } as const;
