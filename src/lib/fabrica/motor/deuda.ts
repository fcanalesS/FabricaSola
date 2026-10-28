// Los hallazgos MENORES de las revisiones, juntos: lo que cada tarea terminada dejó sin corregir
// (`ex.Message` al usuario, un TOCTOU, un contraste…) y que dentro de cada archivo se pierde. Él
// los ve en la vista «Deuda» del tablero y, con un clic suyo, cada uno se vuelve una tarea. Lo
// escribieron los agentes: se muestra como texto y, en la tarea nueva, va citado. Es lógica pura.
import type { HallazgoDeDeuda } from "./tipos.ts";

/** El texto de una sección `## nombre` del cuerpo de una tarea, sin los marcadores de las plantillas. */
export function seccionDe(cuerpo: string, nombre: string): string {
  const t = cuerpo.replace(/\r\n/g, "\n");
  const m = new RegExp(`^## ${nombre}[ \\t]*$`, "m").exec(t);
  if (!m) return "";
  const desde = m.index + m[0].length;
  const sig = t.slice(desde).search(/^## /m);
  return t.slice(desde, sig < 0 ? t.length : desde + sig).replace(/^_\(.*\)_$/gm, "").trim();
}

/** Un id corto y estable para un hallazgo: de su tarea y su texto (FNV-1a de 32 bits, dos veces). */
export function idDeHallazgo(tarea: string, texto: string): string {
  const fnv = (s: string, semilla: number) => {
    let h = semilla >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  const clave = `${tarea}\n${texto.replace(/\s+/g, " ").trim()}`;
  return fnv(clave, 0x811c9dc5) + fnv(clave, 0x2b6e1f3d);
}

/** `ruta:línea` de un hallazgo: entre comillas invertidas o suelta. */
const dondeEn = (linea: string) => /`([^`\s]+:\d+)`/.exec(linea)?.[1] ?? /(?:^|[\s(])([\w.\-/\\]+\.\w+:\d+)/.exec(linea)?.[1] ?? null;

/**
 * Los MENORES de `## Hallazgos de revisión` de una tarea, con el revisor bajo cuyo `###` estaban.
 * Un hallazgo es una viñeta que dice MENOR; las líneas con sangría que la siguen son suyas.
 */
export function hallazgosMenores(tarea: { id: string; titulo: string }, cuerpo: string): Omit<HallazgoDeDeuda, "convertidoEn">[] {
  const out: Omit<HallazgoDeDeuda, "convertidoEn">[] = [];
  let revisor: string | null = null;
  let actual: string[] | null = null;
  const cerrar = () => {
    if (!actual) return;
    const linea = actual.join(" ").replace(/\s+/g, " ").trim();
    const texto = linea
      .replace(/^[-*]\s+/, "")
      .replace(/\*\*MENOR\*\*|\bMENOR\b:?/, "")
      .replace(/^[\s·:—-]+/, "")
      // El `ruta:línea` del principio ya va aparte, en `donde`.
      .replace(/^`[^`]+:\d+`\s*[—–:·-]?\s*/, "")
      .trim();
    if (texto) out.push({ id: idDeHallazgo(tarea.id, linea), tarea: tarea.id, tituloDeLaTarea: tarea.titulo, revisor, donde: dondeEn(linea), texto: texto.slice(0, 1200) });
    actual = null;
  };
  for (const l of seccionDe(cuerpo, "Hallazgos de revisión").split("\n")) {
    const sub = /^#{3,6}\s+(.+)$/.exec(l);
    if (sub) {
      cerrar();
      revisor = sub[1]!.trim();
    } else if (/^\s*[-*]\s/.test(l) && !/^\s{2,}/.test(l)) {
      cerrar();
      if (/\bMENOR\b/.test(l)) actual = [l];
    } else if (actual && /^\s{2,}\S/.test(l)) actual.push(l);
    else if (!l.trim()) cerrar();
  }
  cerrar();
  return out;
}

/** El pedido de la tarea que nace de un hallazgo: lo cita, con la tarea de donde viene. */
export function pedidoDeDeuda(h: Omit<HallazgoDeDeuda, "convertidoEn">): { titulo: string; pedido: string } {
  const corto = h.texto.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
  return {
    titulo: `Deuda de ${h.tarea}: ${corto.length > 56 ? `${corto.slice(0, 55)}…` : corto}`,
    pedido: [
      `Un hallazgo MENOR de la revisión de ${h.tarea} («${h.tituloDeLaTarea}») que quedó sin corregir${h.revisor ? `, de la revisión de ${h.revisor}` : ""}:`,
      "",
      ...h.texto.split("\n").map((l) => `> ${l}`),
      "",
      ...(h.donde ? [`Dónde: \`${h.donde}\`.`, ""] : []),
      "Corrígelo sin cambiar nada más. Si ya no aplica en el código actual, dilo y no cambies nada.",
    ].join("\n"),
  };
}
