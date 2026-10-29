import { inflateRawSync } from "node:zlib";

/**
 * Lo justo para leer un zip: Word y Excel son un zip con XML adentro. Se lee
 * el directorio del final, y cada entrada se descomprime con un tope, para
 * que un zip armado para inflarse no tumbe al servidor. Sin zip64 ni cifrado:
 * un archivo así no es un documento normal y se rechaza. Es lógica pura.
 */

export class ZipInvalido extends Error {}

export type EntradaDeZip = { nombre: string; metodo: number; comprimido: number; tamano: number; desde: number };

const FIN = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_ENTRADAS = 5_000;

export const esZip = (b: Uint8Array) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/** Las entradas del zip, por su directorio central. */
export function entradasDelZip(b: Uint8Array): EntradaDeZip[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // El fin del directorio está al final, después de un comentario de hasta 65 535 bytes.
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i--) {
    if (v.getUint32(i, true) === FIN) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ZipInvalido("No es un zip completo.");
  const cuantas = v.getUint16(fin + 10, true);
  const inicio = v.getUint32(fin + 16, true);
  if (cuantas === 0xffff || inicio === 0xffffffff) throw new ZipInvalido("Es un zip64: no se lee.");
  if (cuantas > MAX_ENTRADAS) throw new ZipInvalido("Tiene demasiadas partes.");
  const entradas: EntradaDeZip[] = [];
  let p = inicio;
  for (let i = 0; i < cuantas; i++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== CENTRAL) throw new ZipInvalido("El directorio del zip está roto.");
    const banderas = v.getUint16(p + 8, true);
    if (banderas & 1) throw new ZipInvalido("Está cifrado.");
    const largoNombre = v.getUint16(p + 28, true);
    const nombre = new TextDecoder().decode(b.subarray(p + 46, p + 46 + largoNombre));
    entradas.push({ nombre, metodo: v.getUint16(p + 10, true), comprimido: v.getUint32(p + 20, true), tamano: v.getUint32(p + 24, true), desde: v.getUint32(p + 42, true) });
    p += 46 + largoNombre + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return entradas;
}

/** El contenido de una entrada, descomprimido hasta `tope` bytes. Más que eso se rechaza. */
export function leerEntrada(b: Uint8Array, e: EntradaDeZip, tope: number): Uint8Array {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (e.desde + 30 > b.length || v.getUint32(e.desde, true) !== LOCAL) throw new ZipInvalido("Una parte del zip está rota.");
  const datos = e.desde + 30 + v.getUint16(e.desde + 26, true) + v.getUint16(e.desde + 28, true);
  const crudo = b.subarray(datos, datos + e.comprimido);
  if (crudo.length !== e.comprimido) throw new ZipInvalido("Una parte del zip está cortada.");
  if (e.metodo === 0) {
    if (crudo.length > tope) throw new ZipInvalido("Descomprimido pasa del tope.");
    return crudo;
  }
  if (e.metodo !== 8) throw new ZipInvalido("Usa una compresión que no se lee.");
  try {
    return new Uint8Array(inflateRawSync(crudo, { maxOutputLength: tope }));
  } catch {
    throw new ZipInvalido("Descomprimido pasa del tope, o está roto.");
  }
}

/** Las entradas que importan, por nombre, leídas con un tope para todas juntas. */
export function leerDelZip(b: Uint8Array, quiero: (nombre: string) => boolean, topeTotal: number): Map<string, string> {
  const leidas = new Map<string, string>();
  let usado = 0;
  for (const e of entradasDelZip(b)) {
    if (!quiero(e.nombre)) continue;
    const contenido = leerEntrada(b, e, topeTotal - usado);
    usado += contenido.length;
    if (usado > topeTotal) throw new ZipInvalido("Descomprimido pasa del tope.");
    leidas.set(e.nombre, new TextDecoder().decode(contenido));
  }
  return leidas;
}
