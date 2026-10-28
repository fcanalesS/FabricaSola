import { unir } from "../motor/formato.ts";
import { bajarTitulos } from "../motor/requerimientos.ts";

/**
 * Las plantillas del vault de la memoria de la fábrica, en un solo lugar: el
 * `LEEME.md` que explica el formato a cualquier IA que llegue sin contexto, la
 * ficha, una decisión y una propuesta. Lo que escriben tiene que poder leerse
 * con `grep`: una regla por línea, frontmatter plano y secciones con nombre
 * fijo. Es lógica pura.
 */

/** Los topes: la ficha entra entera a cada tarea, así que es corta. */
export const TOPES = { fichaLineas: 150, fichaBytes: 8 * 1024, linea: 200 } as const;

/** Las secciones de una decisión o una propuesta, siempre con estos nombres y en este orden. */
export const SECCIONES = ["Decisión", "Por qué", "Qué se descartó", "Qué implica"] as const;

/** Los estados de un documento del vault. */
export const ESTADOS_DE_DECISION = ["vigente", "reemplazada", "rechazada"] as const;
export const ESTADOS_DE_PROPUESTA = ["propuesta", "aprobada", "rechazada"] as const;

/** Un tema: minúsculas, sin tildes, con guiones. Igual en la ficha y en el frontmatter. */
export const TEMA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function leeme(nombre: string): string {
  return `# Memoria de ${nombre}

Lo que la fábrica no puede olvidar de este proyecto: las decisiones de arquitectura, el stack y lo
que no se usa. Antes de trabajar, toda tarea lee \`ficha.md\` entera y las decisiones de los temas
que toca. Si un pedido contradice una decisión vigente, se le pregunta a una persona.

Solo una persona escribe reglas. Los agentes proponen en su tarea (\`## Para la memoria\`); al
terminarla, la fábrica deja la propuesta en \`propuestas/\`, y una persona la aprueba o la rechaza.
Si hay una ficha de la planta, vale en todos los proyectos; si dice algo distinto, manda esta.

## Qué hay

- \`ficha.md\`: lo que entra siempre. Una regla por línea: \`- [tema] Texto. (D-0001)\`.
  Lo prohibido empieza con \`NO:\` después del tema. Hasta ${TOPES.fichaLineas} líneas.
- \`decisiones/D-NNNN-<nombre>.md\`: una decisión por archivo, con su porqué. No se borra: se
  reemplaza (\`estado: reemplazada\` y \`reemplazada_por\`).
- \`propuestas/P-NNNN-<nombre>.md\`: lo que propone un agente, hasta que una persona lo aprueba o
  lo rechaza. Una rechazada queda, con su motivo, para no volver a proponerla. La de una habilidad
  nueva trae \`habilidad\`, \`etapas\` y \`cuando\`, y sus archivos en \`## Archivos\` (\`### ruta\` y
  el texto con cuatro espacios de sangría); al aprobarla, va a \`.claude/skills/\` y al catálogo.
- \`bitacora/AAAA-MM.md\`: una línea por tarea terminada. Son hechos, no reglas.

## Cómo buscar

- Todo lo de un tema: \`grep -rn "\\[base-de-datos\\]" ficha.md\` y \`grep -rl "^temas:.*base-de-datos" decisiones/\`.
- Lo que no se usa: \`grep -n "NO:" ficha.md\`.
- Las decisiones vigentes: \`grep -rl "^estado: vigente" decisiones/\`.

## Formato

- Frontmatter plano entre \`---\`: \`clave: valor\`, una por línea.
- Claves de una decisión: \`id\`, \`titulo\`, \`estado\` (${ESTADOS_DE_DECISION.join(", ")}), \`fecha\`
  (AAAA-MM-DD), \`temas\` (separados por coma), \`origen\` (la tarea o la persona), \`aprobo\`,
  \`reemplaza\`, \`reemplazada_por\`.
- Una propuesta usa las mismas, con \`estado\` (${ESTADOS_DE_PROPUESTA.join(", ")}), \`propone\`, \`regla\`
  (la línea que entraría a la ficha, con el primer tema) y \`motivo\` si se rechazó.
- Secciones fijas: ${SECCIONES.map((s) => `\`## ${s}\``).join(", ")}.
- Temas en minúsculas, sin tildes y con guiones. UTF-8, saltos LF y líneas de hasta ${TOPES.linea}
  caracteres. Nombres de archivo en minúsculas después del id, sin tildes y con guiones.
`;
}

export function fichaVacia(nombre: string): string {
  return `# Ficha · ${nombre}\n\n`;
}

export type DatosDeDocumento = {
  id: string;
  titulo: string;
  estado: string;
  fecha: string;
  temas: readonly string[];
  origen: string;
  /** Solo en una decisión: quién la aprobó. */
  aprobo?: string;
  /** Solo en una propuesta: quién la propone. */
  propone?: string;
  /** Solo en una propuesta: la regla que entraría a la ficha, con el primer tema, si se aprueba. Una línea. */
  regla?: string;
  reemplaza?: string;
  reemplazadaPor?: string;
  motivo?: string;
  secciones: Partial<Record<(typeof SECCIONES)[number], string>>;
};

/** Una decisión o una propuesta, con su frontmatter plano y sus secciones fijas. */
export function documento(d: DatosDeDocumento): string {
  const esPropuesta = d.id.startsWith("P-");
  const datos: Record<string, string> = {
    id: d.id,
    titulo: d.titulo,
    estado: d.estado,
    fecha: d.fecha,
    temas: d.temas.join(", "),
    origen: d.origen,
    ...(esPropuesta ? { propone: d.propone ?? "", regla: (d.regla ?? "").replace(/\s+/g, " ").trim() } : { aprobo: d.aprobo ?? "" }),
    reemplaza: d.reemplaza ?? "",
    ...(esPropuesta ? {} : { reemplazada_por: d.reemplazadaPor ?? "" }),
    ...(d.motivo ? { motivo: d.motivo } : {}),
  };
  // Un `##` dentro del texto cortaría la sección: los títulos de adentro bajan dos niveles.
  const cuerpo = SECCIONES.map((s) => `## ${s}\n\n${bajarTitulos((d.secciones[s] ?? "").trim()) || "_(sin escribir)_"}\n`).join("\n");
  return unir(datos, `\n${cuerpo}`);
}

/** El nombre del archivo de un documento: su id y su título en minúsculas, sin tildes y con guiones. */
export function nombreDeArchivo(id: string, titulo: string): string {
  const nombre = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  return `${id}${nombre ? `-${nombre}` : ""}.md`;
}
