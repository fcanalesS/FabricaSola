import { deflateRawSync } from "node:zlib";

/**
 * Documentos de prueba: un zip armado a mano, y un Word con sus párrafos. El
 * lector de la aplicación no mira el CRC, así que va en cero.
 */

/** Un zip con sus entradas comprimidas. */
export function zipDePrueba(entradas: Record<string, string | Uint8Array>): Uint8Array {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let p = 0;
  for (const [nombre, contenido] of Object.entries(entradas)) {
    const crudo = typeof contenido === "string" ? Buffer.from(contenido) : Buffer.from(contenido);
    const comp = deflateRawSync(crudo);
    const n = Buffer.from(nombre);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(crudo.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(crudo.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(p, 42);
    locales.push(local, n, comp);
    centrales.push(central, n);
    p += 30 + n.length + comp.length;
  }
  const dir = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(entradas).length, 8);
  fin.writeUInt16LE(Object.keys(entradas).length, 10);
  fin.writeUInt32LE(dir.length, 12);
  fin.writeUInt32LE(p, 16);
  return new Uint8Array(Buffer.concat([...locales, dir, fin]));
}

export const wordDePrueba = (parrafos: string[]) =>
  zipDePrueba({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": `<w:document><w:body>${parrafos.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`,
  });

