import { entradasDelZip, esZip, leerDelZip, ZipInvalido } from "./zip.ts";

/**
 * Qué es un archivo de referencia, por sus bytes y no por su nombre, y su
 * texto si lo tiene: un Word o un Excel se pasan a texto aquí, sin
 * dependencias. De un Excel quedan los valores de sus celdas (de una fórmula,
 * lo que calculó); las macros y las imágenes no se leen. Es lógica pura.
 */

export type TipoDeReferencia = "imagen" | "pdf" | "texto" | "word" | "excel" | "pagina";

export const TOPES = {
  /** Por archivo subido. */
  porArchivo: 10 * 1024 * 1024,
  /** Lo de todas las referencias de una tarea. */
  porTarea: 40 * 1024 * 1024,
  cuantas: 12,
  /** El texto que se saca de un documento o de un link. */
  texto: 60_000,
  /** Lo que puede ocupar un Word o un Excel descomprimido. */
  descomprimido: 50 * 1024 * 1024,
  /** El nombre de un archivo, como se muestra. */
  nombre: 120,
} as const;

export const NOMBRE_DEL_TIPO: Record<TipoDeReferencia, string> = {
  imagen: "una imagen",
  pdf: "un PDF",
  texto: "un archivo de texto",
  word: "un documento de Word",
  excel: "una planilla de Excel",
  pagina: "una página web",
};

export class ArchivoNoAceptado extends Error {}

export type Reconocido = { tipo: Exclude<TipoDeReferencia, "pagina">; extension: string; mime: string };

const empieza = (b: Uint8Array, ...bytes: number[]) => bytes.every((x, i) => b[i] === x);
const EXT_DE_TEXTO = /\.(txt|md|markdown|csv|json)$/i;

/** El texto de unos bytes que dicen ser texto: UTF-8, o Windows-1252 si no lo es (un CSV de Excel). Sin bytes de control, o no es texto. */
export function comoTexto(b: Uint8Array): string | null {
  const sinBom = empieza(b, 0xef, 0xbb, 0xbf) ? b.subarray(3) : b;
  for (const x of sinBom) if (x < 0x09 || (x > 0x0d && x < 0x20 && x !== 0x1b)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(sinBom);
  } catch {
    return new TextDecoder("windows-1252").decode(sinBom);
  }
}

/** Qué es, por sus primeros bytes y, en un zip, por lo que trae adentro. Lo que no es de los tipos aceptados lanza `ArchivoNoAceptado`. */
export function reconocer(b: Uint8Array, nombre: string): Reconocido {
  if (empieza(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { tipo: "imagen", extension: "png", mime: "image/png" };
  if (empieza(b, 0xff, 0xd8, 0xff)) return { tipo: "imagen", extension: "jpg", mime: "image/jpeg" };
  if (empieza(b, 0x52, 0x49, 0x46, 0x46) && empieza(b.subarray(8), 0x57, 0x45, 0x42, 0x50)) return { tipo: "imagen", extension: "webp", mime: "image/webp" };
  if (empieza(b, 0x25, 0x50, 0x44, 0x46, 0x2d)) return { tipo: "pdf", extension: "pdf", mime: "application/pdf" };
  if (esZip(b)) {
    let nombres: string[];
    try {
      nombres = entradasDelZip(b).map((e) => e.nombre);
    } catch (e) {
      throw new ArchivoNoAceptado(e instanceof ZipInvalido ? `No se pudo abrir: ${e.message.charAt(0).toLowerCase()}${e.message.slice(1)}` : "No se pudo abrir.");
    }
    if (nombres.includes("word/document.xml")) return { tipo: "word", extension: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    if (nombres.includes("xl/workbook.xml")) return { tipo: "excel", extension: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    throw new ArchivoNoAceptado("Es un zip, pero no es un Word ni un Excel.");
  }
  if (EXT_DE_TEXTO.test(nombre) && comoTexto(b) !== null) {
    const ext = nombre.match(EXT_DE_TEXTO)![1]!.toLowerCase();
    return { tipo: "texto", extension: ext === "markdown" ? "md" : ext, mime: ext === "json" ? "application/json" : ext === "csv" ? "text/csv" : ext === "txt" ? "text/plain" : "text/markdown" };
  }
  throw new ArchivoNoAceptado("Se aceptan imágenes (PNG, JPG, WebP), PDF, texto (TXT, MD, CSV, JSON), Word (DOCX) y Excel (XLSX).");
}

/** El XML, sin sus entidades. */
export function sinEntidades(t: string): string {
  return t.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (_, dec: string | undefined, hex: string | undefined, nombre: string | undefined) => {
    if (dec || hex) {
      const n = dec ? Number(dec) : parseInt(hex!, 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[nombre!.toLowerCase() as "amp"];
  });
}

/** El texto de un Word: sus párrafos, en orden, con sus tabulaciones y saltos. */
export function textoDeWord(b: Uint8Array): string {
  const xml = leerDelZip(b, (n) => n === "word/document.xml", TOPES.descomprimido).get("word/document.xml") ?? "";
  let texto = "";
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<\/w:p>/g)) {
    if (m[1] !== undefined) texto += sinEntidades(m[1]);
    else if (m[0] === "<w:tab/>") texto += "\t";
    else texto += "\n";
  }
  return texto.replace(/\n{3,}/g, "\n\n").trim();
}

/** El texto de un Excel: cada hoja con su nombre, y cada fila con sus celdas separadas por « | ». */
export function textoDeExcel(b: Uint8Array): string {
  const partes = leerDelZip(b, (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(n), TOPES.descomprimido);
  const compartidos = [...(partes.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1]!.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => sinEntidades(t[1]!)).join(""));
  const destinos = new Map([...(partes.get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/\bId="([^"]+)"/)?.[1] ?? "", (m[0].match(/\bTarget="([^"]+)"/)?.[1] ?? "").replace(/^\/?xl\//, "")]));
  const hojas = [...(partes.get("xl/workbook.xml") ?? "").matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    nombre: sinEntidades(m[0].match(/\bname="([^"]*)"/)?.[1] ?? "Hoja"),
    archivo: `xl/${destinos.get(m[0].match(/\br:id="([^"]+)"/)?.[1] ?? "") ?? ""}`,
  }));
  const salida: string[] = [];
  for (const h of hojas) {
    const xml = partes.get(h.archivo);
    if (!xml) continue;
    const filas: string[] = [];
    for (const fila of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const celdas: string[] = [];
      for (const c of fila[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tipo = c[1]!.match(/\bt="([^"]+)"/)?.[1];
        const adentro = c[2] ?? "";
        const v = adentro.match(/<v>([^<]*)<\/v>/)?.[1];
        let valor = "";
        if (tipo === "s") valor = compartidos[Number(v)] ?? "";
        else if (tipo === "inlineStr") valor = [...adentro.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => sinEntidades(t[1]!)).join("");
        else if (tipo === "b") valor = v === "1" ? "VERDADERO" : "FALSO";
        else valor = sinEntidades(v ?? "");
        celdas.push(valor.replace(/\s+/g, " ").trim());
      }
      while (celdas.length && !celdas.at(-1)) celdas.pop();
      if (celdas.length) filas.push(celdas.join(" | "));
    }
    if (filas.length) salida.push(`Hoja «${h.nombre}»\n${filas.join("\n")}`);
  }
  return salida.join("\n\n").trim();
}

/** El texto que se saca de un archivo ya reconocido, cortado al tope; `null` si es imagen o PDF. */
export function textoDelArchivo(b: Uint8Array, r: Reconocido): string | null {
  let texto: string | null;
  try {
    texto = r.tipo === "word" ? textoDeWord(b) : r.tipo === "excel" ? textoDeExcel(b) : r.tipo === "texto" ? comoTexto(b) : null;
  } catch (e) {
    throw new ArchivoNoAceptado(e instanceof ZipInvalido ? `No se pudo leer: ${e.message.charAt(0).toLowerCase()}${e.message.slice(1)}` : "No se pudo leer.");
  }
  return texto === null ? null : texto.slice(0, TOPES.texto);
}

/** El nombre de un archivo como se guarda y se muestra: sin carpetas, sin caracteres de control y corto. */
export function nombreLimpio(nombre: string): string {
  const base = nombre.split(/[\\/]/).at(-1) ?? "";
  const limpio = base.replace(/[^\P{Cc}]/gu, "").replace(/\s+/g, " ").trim();
  return (limpio || "archivo").slice(0, TOPES.nombre);
}
