// De un documento de requerimientos funcionales a tareas de la fábrica: cómo se corta para
// crearlas. La vista previa de la configuración (../requerimientos.ts) sigue la misma regla. Es
// lógica pura.

/**
 * `dependeDe`: lo que dice su subsección `### Depende de`, tal cual: ids de tareas que ya están en
 * la cola (`F-009`) o títulos de otras secciones del mismo documento. Los resuelve quien las crea.
 */
export type TareaPropuesta = { titulo: string; pedido: string; dependeDe: string[] }

/**
 * Lo que dice la subsección `### Depende de` de una sección: una referencia por viñeta o
 * separadas por coma. Vacío si no está.
 */
export function dependenciasDeLaSeccion(texto: string): string[] {
  const t = texto.replace(/\r\n/g, "\n");
  const m = /^#{3,6}\s+depende de\s*:?\s*$/im.exec(t);
  if (!m) return [];
  const resto = t.slice(m.index + m[0].length);
  const fin = resto.search(/^#{1,6}\s/m);
  return [
    ...new Set(
      (fin < 0 ? resto : resto.slice(0, fin))
        .split("\n")
        .flatMap((l) => l.replace(/^\s*[-*]\s+/, "").split(/,(?![^«"]*[»"])/))
        .map((x) => x.replace(/[*_`«»"]/g, "").replace(/\.$/, "").trim())
        .filter((x) => x && !/^(ninguna|nada|-)$/i.test(x)),
    ),
  ];
}

const limpiarTitulo = (t: string) =>
  t
    .replace(/^#+\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

/**
 * Baja dos niveles los títulos del texto que se incrusta en una tarea (`#` → `###`). En el archivo
 * de la tarea, un `##` de más cortaría la sección Pedido y la spec perdería lo que sigue.
 */
export function bajarTitulos(texto: string): string {
  return texto.replace(/^(#{1,4})(?=\s)/gm, "##$1");
}

/** El título del documento: el `# ` del principio, o su primera línea con texto. */
export function tituloDelDocumento(texto: string): string {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const h1 = lineas.find((l) => /^#\s+\S/.test(l));
  const primera = lineas.find((l) => l.trim());
  return limpiarTitulo(h1 ?? primera ?? "") || "Requerimientos";
}

/**
 * Una tarea por cada sección `## ` del documento, o una sola con todo si se pide así o no hay
 * secciones. Lo que va antes de la primera sección es contexto y viaja con cada tarea.
 */
export function proponerTareas(texto: string, opciones: { porSeccion: boolean; titulo?: string }): TareaPropuesta[] {
  const t = texto.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  const tituloDoc = opciones.titulo?.trim() || tituloDelDocumento(t);

  const partes = t.split(/^(?=##\s+\S)/m);
  const tieneSecciones = partes.length > 1 || /^##\s+\S/.test(partes[0] ?? "");
  if (!opciones.porSeccion || !tieneSecciones) return [{ titulo: tituloDoc, pedido: bajarTitulos(t), dependeDe: dependenciasDeLaSeccion(t) }];

  // El contexto pierde su `# título`, que ya va en el encabezado "Contexto del documento".
  const contexto = /^##\s/.test(partes[0] ?? "")
    ? ""
    : bajarTitulos((partes.shift() ?? "").replace(/^#\s+.*$/m, "").trim());
  return partes
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [cabeza = "", ...resto] = p.split("\n");
      const cuerpo = bajarTitulos(resto.join("\n").trim());
      const pedido = [
        cuerpo || limpiarTitulo(cabeza),
        contexto ? `\n### Contexto del documento "${tituloDoc}"\n\n${contexto}` : "",
      ].join("\n");
      return { titulo: limpiarTitulo(cabeza), pedido: pedido.trim(), dependeDe: dependenciasDeLaSeccion(resto.join("\n")) };
    });
}
