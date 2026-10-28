import { partir, unir } from "../motor/formato.ts";
import { comparable, leerFicha, leerVault, type ArchivoDelVault, type DocumentoDeMemoria } from "./formato.ts";
import { documento, nombreDeArchivo, SECCIONES, TEMA, TOPES } from "./plantillas.ts";

/**
 * Lo que él cambia en la memoria desde su pantalla: aprobar, editar o rechazar
 * una propuesta, reemplazar una decisión y corregir la ficha. Cada función
 * recibe el vault ya leído y devuelve los archivos que cambian, sin tocar el
 * disco: escribirlos es de `vault.ts`, y el commit es de él. Un pedido que no
 * se puede hacer lanza un error que se puede mostrar. Es lógica pura.
 *
 * Los agentes no llegan aquí: solo proponen (`## Para la memoria`). Lo que
 * se aprueba lo aprueba una persona.
 */

export type CambioEnElVault = { ruta: string; texto: string };
export type HechoEnElVault = { cambios: CambioEnElVault[]; nota: string; avisos: string[] };

/** Lo que él escribe de una decisión o una propuesta: lo demás (id, fecha, de dónde salió) no se toca. */
export type DatosEditables = {
  titulo: string;
  temas: readonly string[];
  regla: string;
  secciones: Partial<Record<(typeof SECCIONES)[number], string>>;
};

export const ID_DE_PROPUESTA = /^P-\d{4,}$/;
export const ID_DE_DECISION = /^D-\d{4,}$/;
const TOPE_DE_TITULO = 120;
const TOPE_DE_REGLA = 160;
const TOPE_DE_MOTIVO = 180;
const ANCHO = 100;
const SIN_ESCRIBIR = "_(sin escribir)_";

const unaLinea = (t: string) => t.replace(/\s+/g, " ").trim();
const lineasDe = (t: string) => t.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
/** Un tema como los de la ficha: en minúsculas, sin tildes y con guiones. */
export const temaNormal = (t: string) => comparable(t).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Corta en palabras las líneas largas, con la sangría de la lista: una línea del vault no pasa de 200. */
export function envolver(texto: string, ancho = ANCHO): string {
  return lineasDe(texto)
    .flatMap((l) => {
      if (l.length <= ancho) return [l];
      const sangria = /^(\s*(?:[-*]|\d+\.)?\s*)/.exec(l)![1]!;
      const resto = " ".repeat(sangria.length);
      const salida: string[] = [];
      let linea = sangria;
      for (const palabra of l.slice(sangria.length).split(/\s+/).filter(Boolean)) {
        if (linea.trim() && `${linea} ${palabra}`.length > ancho) {
          salida.push(linea);
          linea = resto + palabra;
        } else linea = linea.trim() ? `${linea} ${palabra}` : linea + palabra;
      }
      salida.push(linea);
      return salida;
    })
    .join("\n");
}

/** Cambia solo esas claves del frontmatter y deja el resto del archivo como estaba. */
function conDatos(texto: string, cambios: Record<string, string>): string {
  const { datos, cuerpo } = partir(texto);
  return unir({ ...datos, ...cambios }, cuerpo);
}

const textoDe = (archivos: readonly ArchivoDelVault[], ruta: string) => archivos.find((a) => a.ruta === ruta)?.texto ?? "";

function documentoPorId(docs: readonly DocumentoDeMemoria[], id: string, que: string): DocumentoDeMemoria {
  // Con un id repetido vale el primero, como en revisarVault.
  const d = docs.find((x) => x.id === id);
  if (!d) throw new Error(`No hay ninguna ${que} ${id.slice(0, 20)}.`);
  return d;
}

/** El siguiente id libre de esa clase. Los ids no se reusan: cuentan también los de nombres de archivo. */
export function siguienteId(docs: readonly DocumentoDeMemoria[], letra: "D" | "P"): string {
  const patron = new RegExp(`^${letra}-(\\d+)`);
  const max = docs.reduce((m, d) => Math.max(m, Number(patron.exec(d.id)?.[1] ?? 0), Number(patron.exec(d.ruta.split("/").pop() ?? "")?.[1] ?? 0)), 0);
  return `${letra}-${String(max + 1).padStart(4, "0")}`;
}

const seccionesDe = (d: DocumentoDeMemoria) => Object.fromEntries(SECCIONES.map((s) => [s, (d.secciones[s] ?? "") === SIN_ESCRIBIR ? "" : (d.secciones[s] ?? "")])) as DatosEditables["secciones"];

/** Lo que él escribió, revisado y en la forma del vault. Lanza con lo que hay que corregir. */
export function revisarDatos(d: DatosEditables): DatosEditables {
  const titulo = unaLinea(d.titulo);
  const temas = [...new Set(d.temas.map(temaNormal).filter((t) => TEMA.test(t)))];
  const regla = unaLinea(d.regla);
  const secciones = Object.fromEntries(SECCIONES.map((s) => [s, envolver((d.secciones[s] ?? "").replace(/\r\n?/g, "\n").trim())])) as DatosEditables["secciones"];
  const falta = [
    titulo ? "" : "le falta el título",
    titulo.length > TOPE_DE_TITULO ? `el título pasa de ${TOPE_DE_TITULO} caracteres` : "",
    temas.length ? "" : "le falta al menos un tema",
    secciones["Decisión"] ? "" : "le falta la decisión",
    regla.length > TOPE_DE_REGLA ? `la regla pasa de ${TOPE_DE_REGLA} caracteres` : "",
  ].filter(Boolean);
  if (falta.length) throw new Error(`No se guardó: ${falta.join(", ")}.`);
  return { titulo, temas, regla, secciones };
}

/** La línea de la ficha de una regla: `- [tema] Texto. (D-0003)`. */
export const lineaDeLaFicha = (tema: string, regla: string, id: string) => `- [${tema}] ${regla.replace(/\s*\([^()]*\)\s*$/, "")} (${id})`;

/** Agrega una regla junto a las de su tema; si no hay ninguna de ese tema, al final. */
export function agregarALaFicha(ficha: string, linea: string, tema: string): string {
  const lineas = lineasDe(ficha);
  while (lineas.length && !lineas.at(-1)!.trim()) lineas.pop();
  const ultima = leerFicha(ficha).reglas.filter((r) => r.tema === tema).at(-1)?.linea;
  if (ultima) lineas.splice(ultima, 0, linea);
  else {
    // Después de un título, una línea en blanco.
    if (lineas.length && /^#{1,6}\s/.test(lineas.at(-1)!)) lineas.push("");
    lineas.push(linea);
  }
  return `${lineas.join("\n")}\n`;
}

/** Quita de la ficha las reglas que citan esa decisión. Devuelve la ficha y cuántas quitó. */
export function quitarDeLaFicha(ficha: string, id: string): { ficha: string; quitadas: number } {
  const citan = new Set(leerFicha(ficha).reglas.filter((r) => r.decisiones.includes(id)).map((r) => r.linea));
  const lineas = lineasDe(ficha).filter((_, i) => !citan.has(i + 1));
  return { ficha: `${lineas.join("\n").replace(/\n*$/, "")}\n`, quitadas: citan.size };
}

/** Si la ficha pasa sus topes: entra entera a cada tarea. */
export function avisosDeLaFicha(ficha: string): string[] {
  const lineas = lineasDe(ficha).filter((l) => l.trim()).length;
  const bytes = new TextEncoder().encode(ficha).length;
  return [
    lineas > TOPES.fichaLineas ? `La ficha tiene ${lineas} líneas y entra entera a cada tarea: el tope es ${TOPES.fichaLineas}. Pasa lo menos usado a decisiones.` : "",
    bytes > TOPES.fichaBytes ? `La ficha pesa ${bytes} bytes: el tope es ${TOPES.fichaBytes}.` : "",
  ].filter(Boolean);
}

/** La nueva decisión en la ficha y, si reemplaza otra, la vieja fuera de ella. */
function fichaConDecision(ficha: string, d: { id: string; tema: string; regla: string; reemplaza: string }): { ficha: string; avisos: string[] } {
  const avisos: string[] = [];
  let texto = ficha;
  if (d.reemplaza) {
    const r = quitarDeLaFicha(texto, d.reemplaza);
    texto = r.ficha;
    if (r.quitadas) avisos.push(`${r.quitadas === 1 ? "Salió de la ficha la regla" : `Salieron de la ficha ${r.quitadas} reglas`} de ${d.reemplaza}.`);
  }
  if (d.regla) {
    const linea = lineaDeLaFicha(d.tema, d.regla, d.id);
    if (linea.length > TOPES.linea) throw new Error(`La regla queda en ${linea.length} caracteres en la ficha, y el tope es ${TOPES.linea}: acórtala.`);
    texto = agregarALaFicha(texto, linea, d.tema);
  } else avisos.push("No tenía regla: la decisión queda, pero a la ficha no entra nada.");
  return { ficha: texto, avisos: [...avisos, ...avisosDeLaFicha(texto)] };
}

export type Quien = { ahora: Date; aprobo: string };

/**
 * Aprobar una propuesta: la decisión con el siguiente `D-`, su regla en la ficha (con su primer
 * tema) y la propuesta como aprobada. Si la propuesta reemplaza una decisión vigente, la vieja
 * queda reemplazada, enlazada a la nueva, y sus reglas salen de la ficha.
 */
export function aprobar(archivos: readonly ArchivoDelVault[], id: string, quien: Quien): HechoEnElVault {
  const vault = leerVault(archivos);
  if (!vault.ficha) throw new Error("Este vault no tiene ficha: créalo primero.");
  const p = documentoPorId(vault.propuestas, id, "propuesta");
  if (p.estado !== "propuesta") throw new Error(`${p.id} ya está ${p.estado}.`);
  // Una habilidad no es una decisión: se aprueba con sus archivos (habilidades/propuestas.ts).
  if (p.habilidad) throw new Error(`${p.id} es una habilidad: se aprueba con sus archivos, no como decisión.`);
  const datos = revisarDatos({ titulo: p.titulo, temas: p.temas, regla: p.regla, secciones: seccionesDe(p) });
  const vieja = p.reemplaza ? documentoPorId(vault.decisiones, p.reemplaza, "decisión") : null;
  if (vieja && vieja.estado !== "vigente") throw new Error(`${p.id} reemplaza a ${vieja.id}, que está ${vieja.estado}.`);
  const nuevo = siguienteId(vault.decisiones, "D");
  const ficha = fichaConDecision(textoDe(archivos, "ficha.md"), { id: nuevo, tema: datos.temas[0]!, regla: datos.regla, reemplaza: vieja?.id ?? "" });
  const cambios: CambioEnElVault[] = [
    {
      ruta: `decisiones/${nombreDeArchivo(nuevo, datos.titulo)}`,
      texto: documento({ id: nuevo, titulo: datos.titulo, estado: "vigente", fecha: quien.ahora.toISOString().slice(0, 10), temas: datos.temas, origen: p.id, aprobo: quien.aprobo, reemplaza: vieja?.id ?? "", secciones: datos.secciones }),
    },
    { ruta: p.ruta, texto: conDatos(textoDe(archivos, p.ruta), { estado: "aprobada", motivo: `Aprobada como ${nuevo}.` }) },
    ...(vieja ? [{ ruta: vieja.ruta, texto: conDatos(textoDe(archivos, vieja.ruta), { estado: "reemplazada", reemplazada_por: nuevo }) }] : []),
    { ruta: "ficha.md", texto: ficha.ficha },
  ];
  const nota = `${p.id} aprobada como ${nuevo}${datos.regla ? ", con su regla en la ficha" : ""}${vieja ? `; reemplaza a ${vieja.id}` : ""}.`;
  return { cambios, nota, avisos: ficha.avisos };
}

/** Rechazar una propuesta, con su motivo: así no se vuelve a proponer lo mismo. La ficha no se toca. */
export function rechazar(archivos: readonly ArchivoDelVault[], id: string, motivo: string): HechoEnElVault {
  const p = documentoPorId(leerVault(archivos).propuestas, id, "propuesta");
  if (p.estado !== "propuesta") throw new Error(`${p.id} ya está ${p.estado}.`);
  const m = unaLinea(motivo);
  if (!m) throw new Error("Falta el motivo: es lo que evita que se vuelva a proponer lo mismo.");
  if (m.length > TOPE_DE_MOTIVO) throw new Error(`El motivo pasa de ${TOPE_DE_MOTIVO} caracteres.`);
  return { cambios: [{ ruta: p.ruta, texto: conDatos(textoDe(archivos, p.ruta), { estado: "rechazada", motivo: m }) }], nota: `${p.id} rechazada.`, avisos: [] };
}

/** Corregir una propuesta antes de aprobarla. Sigue siendo una propuesta, en el mismo archivo. */
export function editarPropuesta(archivos: readonly ArchivoDelVault[], id: string, cambios: DatosEditables): HechoEnElVault {
  const p = documentoPorId(leerVault(archivos).propuestas, id, "propuesta");
  if (p.estado !== "propuesta") throw new Error(`${p.id} ya está ${p.estado}: no se edita.`);
  if (p.habilidad) throw new Error(`${p.id} es una habilidad: no se edita aquí. Apruébala y corrige su SKILL.md en el repositorio, o recházala con su motivo.`);
  const d = revisarDatos(cambios);
  const texto = documento({ id: p.id, titulo: d.titulo, estado: "propuesta", fecha: p.fecha, temas: d.temas, origen: p.origen, propone: p.propone, regla: d.regla, reemplaza: p.reemplaza, secciones: d.secciones });
  return { cambios: [{ ruta: p.ruta, texto }], nota: `${p.id} guardada.`, avisos: [] };
}

/**
 * Reemplazar una decisión vigente por otra que escribe él: la nueva con el siguiente `D-` y
 * `reemplaza`, la vieja `reemplazada` con `reemplazada_por`, y en la ficha la regla nueva en
 * lugar de las que citaban a la vieja. La vieja no se borra: queda la historia.
 */
export function reemplazar(archivos: readonly ArchivoDelVault[], id: string, nueva: DatosEditables, quien: Quien): HechoEnElVault {
  const vault = leerVault(archivos);
  if (!vault.ficha) throw new Error("Este vault no tiene ficha: créalo primero.");
  const vieja = documentoPorId(vault.decisiones, id, "decisión");
  if (vieja.estado !== "vigente") throw new Error(`${vieja.id} ya está ${vieja.estado}.`);
  const d = revisarDatos(nueva);
  const nuevo = siguienteId(vault.decisiones, "D");
  const ficha = fichaConDecision(textoDe(archivos, "ficha.md"), { id: nuevo, tema: d.temas[0]!, regla: d.regla, reemplaza: vieja.id });
  return {
    cambios: [
      {
        ruta: `decisiones/${nombreDeArchivo(nuevo, d.titulo)}`,
        texto: documento({ id: nuevo, titulo: d.titulo, estado: "vigente", fecha: quien.ahora.toISOString().slice(0, 10), temas: d.temas, origen: `reemplaza a ${vieja.id}`, aprobo: quien.aprobo, reemplaza: vieja.id, secciones: d.secciones }),
      },
      { ruta: vieja.ruta, texto: conDatos(textoDe(archivos, vieja.ruta), { estado: "reemplazada", reemplazada_por: nuevo }) },
      { ruta: "ficha.md", texto: ficha.ficha },
    ],
    nota: `${vieja.id} quedó reemplazada por ${nuevo}.`,
    avisos: ficha.avisos,
  };
}

/** La ficha que él escribió. Solo reglas, títulos y líneas en blanco: es lo que entra a cada tarea. */
export function guardarFicha(archivos: readonly ArchivoDelVault[], texto: string): HechoEnElVault {
  if (!archivos.some((a) => a.ruta === "ficha.md")) throw new Error("Este vault no tiene ficha: créalo primero.");
  const limpio = `${lineasDe(texto).map((l) => l.trimEnd()).join("\n").replace(/\n*$/, "")}\n`;
  const ficha = leerFicha(limpio);
  const largas = lineasDe(limpio).flatMap((l, i) => (l.length > TOPES.linea ? [i + 1] : []));
  if (ficha.malas.length) {
    const cuales = ficha.malas.slice(0, 3).map((m) => m.linea).join(", ");
    throw new Error(`No se guardó: ${ficha.malas.length === 1 ? `la línea ${cuales} no es una regla` : `las líneas ${cuales}${ficha.malas.length > 3 ? " y otras" : ""} no son reglas`}. Van como «- [tema] Texto. (D-0001)», con el tema en minúsculas, sin tildes y con guiones.`);
  }
  if (largas.length) throw new Error(`No se guardó: ${largas.length === 1 ? `la línea ${largas[0]} pasa` : `las líneas ${largas.slice(0, 3).join(", ")} pasan`} de ${TOPES.linea} caracteres.`);
  // Lo que cita tiene que existir y estar vigente: se avisa, no se frena (él puede estar a medio camino).
  const vigentes = new Set(leerVault(archivos).decisiones.filter((d) => d.estado === "vigente").map((d) => d.id));
  const citas = [...new Set(ficha.reglas.flatMap((r) => r.decisiones))].filter((id) => !vigentes.has(id));
  return {
    cambios: [{ ruta: "ficha.md", texto: limpio }],
    nota: `Ficha guardada: ${ficha.reglas.length} ${ficha.reglas.length === 1 ? "regla" : "reglas"}.`,
    avisos: [...(citas.length ? [`Cita ${citas.join(", ")}, que no ${citas.length === 1 ? "es una decisión vigente" : "son decisiones vigentes"}.`] : []), ...avisosDeLaFicha(limpio)],
  };
}
