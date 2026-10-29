import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { sinEntidades, TOPES } from "./tipos.ts";

/**
 * Lee una vez un link de referencia, para que los agentes lean esa copia y
 * nunca abran internet. Las guardias
 * van aquí, pegadas a lo que sale:
 *
 *  - solo `https`, sin usuario ni clave en la dirección, solo `GET`, sin
 *    cookies ni claves;
 *  - nunca hacia una dirección privada, de su red de Tailscale o de este
 *    equipo, tampoco por una redirección: se resuelve el nombre y se mira
 *    cada dirección;
 *  - hasta tres redirecciones, 10 segundos y 2 MB;
 *  - solo una página de texto. Una que pide iniciar sesión se reconoce y se
 *    dice que suba una captura.
 *
 * Solo para el servidor. Que el texto no traiga instrucciones lo mira quien
 * lo guarda (`almacen.ts`).
 */

export class LinkNoLeido extends Error {}

export type PaginaLeida = { url: string; sitio: string; titulo: string; texto: string };

export type DependenciasDelLink = {
  pedir: (url: string, init: RequestInit) => Promise<Response>;
  resolver: (nombre: string) => Promise<string[]>;
};

const REALES: DependenciasDelLink = {
  pedir: (url, init) => fetch(url, init),
  resolver: async (nombre) => (await lookup(nombre, { all: true, verbatim: true })).map((d) => d.address),
};

export const ESPERA_MS = 10_000;
export const PESO_MAXIMO = 2 * 1024 * 1024;
const REDIRECCIONES = 3;
const CAPTURA = "pide iniciar sesión, y la aplicación no entra con tu cuenta: sube una captura de lo que necesitas.";

function octetos(ip: string): number[] | null {
  const p = ip.split(".").map(Number);
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}

/** Si una dirección IP es de una red privada, de Tailscale, de este equipo o reservada: a esas no se va. Es lógica pura. */
export function esDireccionPrivada(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = octetos(ip)!;
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && octetos(ip)![2] === 0))) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    const mapeada = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeada) return esDireccionPrivada(mapeada[1]!);
    if (s === "::" || s === "::1") return true;
    // fc00::/7 (privadas), fe80::/10 (del enlace), ff00::/8 (multidifusión), 64:ff9b::/96 (traducción).
    return /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("fd7a:115c:a1e0:");
  }
  return true;
}

/** La dirección, revisada en su forma. Lo que no sirve lanza con un motivo que se puede mostrar. Es lógica pura. */
export function direccionValida(texto: string): URL {
  let u: URL;
  try {
    u = new URL(texto.trim());
  } catch {
    throw new LinkNoLeido("Eso no es una dirección web.");
  }
  if (u.protocol !== "https:") throw new LinkNoLeido("Solo se leen direcciones https.");
  if (u.username || u.password) throw new LinkNoLeido("La dirección no puede llevar usuario ni clave.");
  if (!u.hostname || u.hostname === "localhost" || u.hostname.endsWith(".localhost") || u.hostname.endsWith(".local") || u.hostname.endsWith(".internal")) throw new LinkNoLeido("Esa dirección es de una red privada o de este equipo: no se lee.");
  u.hash = "";
  return u;
}

async function revisarDestino(u: URL, d: DependenciasDelLink): Promise<void> {
  const nombre = u.hostname.replace(/^\[|\]$/g, "");
  const direcciones = isIP(nombre) ? [nombre] : await d.resolver(nombre).catch(() => [] as string[]);
  if (!direcciones.length) throw new LinkNoLeido("No se encontró ese sitio.");
  if (direcciones.some(esDireccionPrivada)) throw new LinkNoLeido("Esa dirección es de una red privada o de este equipo: no se lee.");
}

/** El sitio, como se muestra: el nombre sin «www.». */
export const sitioDe = (u: URL) => u.hostname.replace(/^www\./, "");

/** El texto de una página HTML: sin scripts, estilos ni etiquetas, con los bloques en líneas aparte. Es lógica pura. */
export function textoDeHtml(html: string): { titulo: string; texto: string } {
  const titulo = sinEntidades(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const cuerpo = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|section|article|header|footer|main|nav|aside|li|ul|ol|tr|table|h[1-6]|pre|blockquote|dt|dd)\b[^>]*>/gi, "\n")
    .replace(/<\/(td|th)\s*>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
  const texto = sinEntidades(cuerpo.replace(/&nbsp;/gi, " "))
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").replace(/^(\s*\|\s*)+|(\s*\|\s*)+$/g, "").trim())
    .filter(Boolean)
    .join("\n");
  return { titulo, texto };
}

async function cuerpoConTope(r: Response): Promise<Uint8Array> {
  if (Number(r.headers.get("content-length") ?? 0) > PESO_MAXIMO) throw new LinkNoLeido("La página pesa más de 2 MB: no se lee.");
  if (!r.body) return new Uint8Array();
  const partes: Uint8Array[] = [];
  let total = 0;
  const lector = r.body.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > PESO_MAXIMO) {
      await lector.cancel().catch(() => undefined);
      throw new LinkNoLeido("La página pesa más de 2 MB: no se lee.");
    }
    partes.push(value);
  }
  const todo = new Uint8Array(total);
  let p = 0;
  for (const x of partes) {
    todo.set(x, p);
    p += x.byteLength;
  }
  return todo;
}

const pideSesion = (u: URL, html: string) => /(^|\/)(login|signin|sign-in|sign_in|iniciar-sesion|auth|sso)(\/|$|\?)/i.test(u.pathname) || /<input[^>]+type=["']?password/i.test(html);

/** Lee la página de un link, con las guardias de arriba. Lo que no se pudo lanza `LinkNoLeido`, con un motivo que se puede mostrar. */
export async function leerPagina(texto: string, d: DependenciasDelLink = REALES): Promise<PaginaLeida> {
  let u = direccionValida(texto);
  const sitioPedido = sitioDe(u);
  let r: Response | null = null;
  for (let i = 0; i <= REDIRECCIONES; i++) {
    await revisarDestino(u, d);
    try {
      r = await d.pedir(u.toString(), { method: "GET", redirect: "manual", credentials: "omit", headers: { accept: "text/html,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.1", "user-agent": "fabrica-referencias/1" }, signal: AbortSignal.timeout(ESPERA_MS) });
    } catch {
      throw new LinkNoLeido(`${sitioPedido} no contestó en ${ESPERA_MS / 1000} segundos.`);
    }
    if (r.status < 300 || r.status >= 400) break;
    const siguiente = r.headers.get("location");
    if (!siguiente || i === REDIRECCIONES) throw new LinkNoLeido(`${sitioPedido} redirige demasiadas veces.`);
    u = direccionValida(new URL(siguiente, u).toString());
    r = null;
  }
  if (!r) throw new LinkNoLeido(`${sitioPedido} no contestó.`);
  if (r.status === 401 || r.status === 403) throw new LinkNoLeido(`${sitioDe(u)} ${CAPTURA}`);
  if (!r.ok) throw new LinkNoLeido(`${sitioDe(u)} contestó con un error (${r.status}).`);
  const tipo = (r.headers.get("content-type") ?? "").toLowerCase();
  const esHtml = tipo.includes("text/html") || tipo.includes("application/xhtml");
  if (!esHtml && !/^(text\/(plain|markdown|csv)|application\/json)/.test(tipo)) throw new LinkNoLeido("Ese link no es una página de texto. Si es un PDF o una imagen, descárgalo y súbelo como archivo.");
  const crudo = new TextDecoder("utf-8").decode(await cuerpoConTope(r));
  if (esHtml && pideSesion(u, crudo)) throw new LinkNoLeido(`${sitioDe(u)} ${CAPTURA}`);
  const leido = esHtml ? textoDeHtml(crudo) : { titulo: "", texto: crudo.trim() };
  if (!leido.texto) throw new LinkNoLeido(`${sitioDe(u)} no trae texto que se pueda leer: si se arma con JavaScript, sube una captura.`);
  return { url: u.toString(), sitio: sitioDe(u), titulo: leido.titulo.slice(0, 200), texto: leido.texto.slice(0, TOPES.texto) };
}
