import { partir } from "../motor/formato.ts";
import { ETAPAS, NOMBRE_DE_HABILIDAD_NUEVA, RUTA_DE_ARCHIVO_DE_HABILIDAD } from "../habilidades/formato.ts";
import { ESTADOS_DE_DECISION, ESTADOS_DE_PROPUESTA, SECCIONES, TEMA, TOPES } from "./plantillas.ts";

/**
 * Leer, revisar y buscar en el vault de la memoria de la fábrica. El vault son
 * archivos Markdown que se leen con `grep` y con cualquier IA (`LEEME.md`
 * explica el formato): aquí no se escribe nada, solo se lee lo que hay. Es
 * lógica pura: recibe los archivos ya leídos, con su ruta relativa al vault.
 */

export type ArchivoDelVault = { ruta: string; texto: string };

export type ReglaDeFicha = {
  linea: number;
  tema: string;
  /** Empieza con `NO:`: algo que en este proyecto no se usa. */
  prohibe: boolean;
  /** La regla, sin el tema ni de dónde sale. */
  texto: string;
  /** Lo que va entre paréntesis al final: una decisión o una persona con fecha. */
  fuente: string | null;
  /** Las decisiones que cita. */
  decisiones: string[];
};

export type Ficha = { titulo: string | null; reglas: ReglaDeFicha[]; malas: { linea: number; texto: string }[] };

export type DocumentoDeMemoria = {
  ruta: string;
  tipo: "decision" | "propuesta";
  id: string;
  titulo: string;
  estado: string;
  fecha: string;
  temas: string[];
  origen: string;
  aprobo: string;
  propone: string;
  /** En una propuesta: la regla que entraría a la ficha si se aprueba. */
  regla: string;
  reemplaza: string;
  reemplazadaPor: string;
  motivo: string;
  secciones: Record<string, string>;
  /** Solo en la propuesta de una habilidad nueva (`habilidad:` en su frontmatter): dónde se usaría y sus archivos. */
  habilidad: HabilidadDeLaPropuesta | null;
};

export type ArchivoDeHabilidad = { ruta: string; texto: string };
export type HabilidadDeLaPropuesta = { nombre: string; etapas: string[]; cuando: string; archivos: ArchivoDeHabilidad[] };

/** La sección de una propuesta de habilidad con sus archivos: `### ruta` y su texto con cuatro espacios de sangría. */
export const SECCION_DE_ARCHIVOS = "Archivos";

/** Los archivos de `## Archivos`, sin la sangría con que los escribe el mod. */
export function archivosDeLaSeccion(texto: string): ArchivoDeHabilidad[] {
  const archivos: { ruta: string; lineas: string[] }[] = [];
  for (const l of lineasDe(texto)) {
    const h = /^###\s+(.+?)\s*$/.exec(l);
    if (h) archivos.push({ ruta: h[1]!, lineas: [] });
    else archivos.at(-1)?.lineas.push(l.startsWith("    ") ? l.slice(4) : l.trim() ? l : "");
  }
  return archivos.map((a) => {
    const lineas = [...a.lineas];
    while (lineas.length && !lineas[0]) lineas.shift();
    while (lineas.length && !lineas.at(-1)) lineas.pop();
    return { ruta: a.ruta, texto: lineas.length ? `${lineas.join("\n")}\n` : "" };
  });
}

/** Una línea de la bitácora. `habilidades`: las que recibieron sus agentes (desde H3 del plan de habilidades). */
export type EntradaDeBitacora = { linea: number; fecha: string; tarea: string; titulo: string; estado: string; toca: string[]; decisiones: string[]; habilidades: string[] };

export type Vault = {
  ficha: Ficha | null;
  decisiones: DocumentoDeMemoria[];
  propuestas: DocumentoDeMemoria[];
  bitacora: (EntradaDeBitacora & { ruta: string })[];
};

export type Problema = { ruta: string; linea: number | null; que: string };

const ID_DE_DECISION = /^D-\d{4,}$/;
const ID_DE_PROPUESTA = /^P-\d{4,}$/;
const DECISION_CITADA = /\bD-\d{4,}\b/g;
const lineasDe = (texto: string) => texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");

const REGLA = /^- \[([^\]]*)\]\s+(.+?)\s*$/;
const FUENTE_AL_FINAL = /\s*\(([^()]+)\)\s*$/;

/** La ficha, regla por regla. Lo que no es un título, una línea en blanco ni una regla, va a `malas`. */
export function leerFicha(texto: string): Ficha {
  const ficha: Ficha = { titulo: null, reglas: [], malas: [] };
  lineasDe(texto).forEach((l, i) => {
    const linea = i + 1;
    if (!l.trim()) return;
    if (/^#{1,6}\s/.test(l)) {
      if (ficha.titulo === null && l.startsWith("# ")) ficha.titulo = l.slice(2).trim();
      return;
    }
    const m = REGLA.exec(l);
    if (!m || !TEMA.test(m[1] ?? "")) {
      ficha.malas.push({ linea, texto: l });
      return;
    }
    let resto = m[2] ?? "";
    const f = FUENTE_AL_FINAL.exec(resto);
    const fuente = f ? (f[1] ?? "").trim() : null;
    if (f) resto = resto.slice(0, f.index).trim();
    const prohibe = /^NO:\s*/.test(resto);
    if (prohibe) resto = resto.replace(/^NO:\s*/, "");
    ficha.reglas.push({ linea, tema: m[1]!, prohibe, texto: resto, fuente, decisiones: fuente?.match(DECISION_CITADA) ?? [] });
  });
  return ficha;
}

/** Las secciones `## Nombre` de un cuerpo, con su texto. */
function seccionesDe(cuerpo: string): Record<string, string> {
  const secciones: Record<string, string> = {};
  let actual: string | null = null;
  for (const l of lineasDe(cuerpo)) {
    const h = /^## (.+?)\s*$/.exec(l);
    if (h) {
      actual = h[1]!;
      secciones[actual] = "";
    } else if (actual !== null) secciones[actual] += `${l}\n`;
  }
  for (const k of Object.keys(secciones)) secciones[k] = secciones[k]!.trim();
  return secciones;
}

/** Una decisión o una propuesta. El tipo sale de su carpeta; lo que falte queda vacío y lo dice `revisarVault`. */
export function leerDocumento(texto: string, ruta: string): DocumentoDeMemoria {
  const { datos, cuerpo } = partir(texto);
  const v = (k: string) => (datos[k] ?? "").trim();
  const secciones = seccionesDe(cuerpo);
  const esHabilidad = ruta.startsWith("propuestas/") && !!v("habilidad");
  return {
    ruta,
    tipo: ruta.startsWith("propuestas/") ? "propuesta" : "decision",
    id: v("id"),
    titulo: v("titulo"),
    estado: v("estado"),
    fecha: v("fecha"),
    temas: v("temas")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    origen: v("origen"),
    aprobo: v("aprobo"),
    propone: v("propone"),
    regla: v("regla"),
    reemplaza: v("reemplaza"),
    reemplazadaPor: v("reemplazada_por"),
    motivo: v("motivo"),
    secciones,
    habilidad: esHabilidad
      ? {
          nombre: v("habilidad"),
          etapas: v("etapas")
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean),
          cuando: v("cuando"),
          archivos: archivosDeLaSeccion(secciones[SECCION_DE_ARCHIVOS] ?? ""),
        }
      : null,
  };
}

const SEPARADOR = " · ";
const BITACORA = /^- (\d{4}-\d{2}-\d{2}) · ([A-Za-z]{1,8}-\d{1,6}) · (.+)$/;

/** Una línea de la bitácora: `- AAAA-MM-DD · F-014 · título · estado · toca: a, b · decisiones: D-0001`. */
export function leerBitacora(texto: string): { entradas: EntradaDeBitacora[]; malas: { linea: number; texto: string }[] } {
  const entradas: EntradaDeBitacora[] = [];
  const malas: { linea: number; texto: string }[] = [];
  lineasDe(texto).forEach((l, i) => {
    if (!l.trim() || /^#{1,6}\s/.test(l)) return;
    const m = BITACORA.exec(l);
    if (!m) {
      malas.push({ linea: i + 1, texto: l });
      return;
    }
    const partes = (m[3] ?? "").split(SEPARADOR);
    const campo = (nombre: string) =>
      (partes.find((p) => p.startsWith(`${nombre}: `)) ?? "")
        .slice(nombre.length + 2)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    const libres = partes.filter((p) => !/^(toca|decisiones|habilidades): /.test(p));
    entradas.push({ linea: i + 1, fecha: m[1]!, tarea: m[2]!, titulo: libres[0] ?? "", estado: libres[1] ?? "", toca: campo("toca"), decisiones: campo("decisiones"), habilidades: campo("habilidades") });
  });
  return { entradas, malas };
}

/** Una línea de la bitácora, lista para agregar. El título no puede romper el formato. */
export function lineaDeBitacora(e: Omit<EntradaDeBitacora, "linea" | "habilidades"> & { habilidades?: readonly string[] }): string {
  const limpio = (t: string) => t.replace(/[\r\n]+/g, " ").replaceAll("·", "-").trim();
  const partes = [e.fecha, e.tarea, limpio(e.titulo), limpio(e.estado)];
  if (e.toca.length) partes.push(`toca: ${e.toca.map(limpio).join(", ")}`);
  if (e.decisiones.length) partes.push(`decisiones: ${e.decisiones.join(", ")}`);
  if (e.habilidades?.length) partes.push(`habilidades: ${e.habilidades.join(", ")}`);
  return `- ${partes.join(SEPARADOR)}`;
}

/** El vault entero, de sus archivos. Lo que no está en una carpeta conocida no se lee. */
export function leerVault(archivos: readonly ArchivoDelVault[]): Vault {
  const vault: Vault = { ficha: null, decisiones: [], propuestas: [], bitacora: [] };
  for (const a of archivos) {
    if (a.ruta === "ficha.md") vault.ficha = leerFicha(a.texto);
    else if (/^decisiones\/[^/]+\.md$/.test(a.ruta)) vault.decisiones.push(leerDocumento(a.texto, a.ruta));
    else if (/^propuestas\/[^/]+\.md$/.test(a.ruta)) vault.propuestas.push(leerDocumento(a.texto, a.ruta));
    else if (/^bitacora\/[^/]+\.md$/.test(a.ruta)) vault.bitacora.push(...leerBitacora(a.texto).entradas.map((e) => ({ ...e, ruta: a.ruta })));
  }
  return vault;
}

const NOMBRE_DE_DOCUMENTO = /^[DP]-\d{4,}(?:-[a-z0-9]+)*\.md$/;
const NOMBRE_DE_BITACORA = /^\d{4}-\d{2}\.md$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lo que no cumple el formato del vault, con archivo y línea: lo que haría fallar un `grep` o
 * confundiría a una IA. No corrige nada.
 */
export function revisarVault(archivos: readonly ArchivoDelVault[]): Problema[] {
  const problemas: Problema[] = [];
  const decir = (ruta: string, linea: number | null, que: string) => problemas.push({ ruta, linea, que });

  // Lo común a todos: saltos LF y líneas cortas. Los archivos de una habilidad propuesta son código: ahí no hay tope.
  for (const a of archivos) {
    if (/\r/.test(a.texto)) decir(a.ruta, null, "Tiene saltos de línea de Windows (CRLF): van LF.");
    const esHabilidad = a.ruta.startsWith("propuestas/") && !!partir(a.texto).datos.habilidad?.trim();
    let enArchivos = false;
    lineasDe(a.texto).forEach((l, i) => {
      if (/^## /.test(l)) enArchivos = esHabilidad && l === `## ${SECCION_DE_ARCHIVOS}`;
      if (l.length > TOPES.linea && !(enArchivos && l.startsWith("    "))) decir(a.ruta, i + 1, `La línea pasa de ${TOPES.linea} caracteres.`);
    });
  }

  const vault = leerVault(archivos);
  const fichaTexto = archivos.find((a) => a.ruta === "ficha.md")?.texto;
  if (vault.ficha && fichaTexto !== undefined) {
    for (const m of vault.ficha.malas) decir("ficha.md", m.linea, "No es una regla: van como «- [tema] Texto. (D-0001)», con el tema en minúsculas, sin tildes y con guiones.");
    const lineas = lineasDe(fichaTexto).filter((l) => l.trim()).length;
    if (lineas > TOPES.fichaLineas) decir("ficha.md", null, `La ficha tiene ${lineas} líneas, y entra entera a cada tarea: el tope es ${TOPES.fichaLineas}.`);
    const bytes = new TextEncoder().encode(fichaTexto).length;
    if (bytes > TOPES.fichaBytes) decir("ficha.md", null, `La ficha pesa ${bytes} bytes: el tope es ${TOPES.fichaBytes}.`);
  }

  // Los documentos: frontmatter, nombres e ids.
  const porId = new Map<string, DocumentoDeMemoria>();
  for (const d of [...vault.decisiones, ...vault.propuestas]) {
    const nombre = d.ruta.split("/").pop() ?? "";
    const esperado = d.tipo === "decision" ? ID_DE_DECISION : ID_DE_PROPUESTA;
    const estados: readonly string[] = d.tipo === "decision" ? ESTADOS_DE_DECISION : ESTADOS_DE_PROPUESTA;
    if (!d.id) decir(d.ruta, null, "No tiene id en su frontmatter.");
    else if (!esperado.test(d.id)) decir(d.ruta, null, `El id «${d.id}» no es de ${d.tipo === "decision" ? "una decisión (D-0001)" : "una propuesta (P-0001)"}.`);
    else if (porId.has(d.id)) decir(d.ruta, null, `El id ${d.id} ya lo usa ${porId.get(d.id)!.ruta}.`);
    else porId.set(d.id, d);
    if (!NOMBRE_DE_DOCUMENTO.test(nombre) || (d.id && !nombre.startsWith(`${d.id}`))) decir(d.ruta, null, "El nombre del archivo va como su id y su título en minúsculas, sin tildes y con guiones.");
    if (!d.titulo) decir(d.ruta, null, "No tiene título.");
    if (!estados.includes(d.estado)) decir(d.ruta, null, `El estado «${d.estado}» no vale: ${estados.join(", ")}.`);
    if (!FECHA.test(d.fecha)) decir(d.ruta, null, "La fecha va como AAAA-MM-DD.");
    if (!d.temas.length) decir(d.ruta, null, "No tiene temas: así no se encuentra por tema.");
    for (const t of d.temas) if (!TEMA.test(t)) decir(d.ruta, null, `El tema «${t}» va en minúsculas, sin tildes y con guiones.`);
    for (const s of SECCIONES) if (!(s in d.secciones)) decir(d.ruta, null, `Le falta la sección «## ${s}».`);
    if (d.tipo === "decision" && d.estado === "reemplazada" && !d.reemplazadaPor) decir(d.ruta, null, "Está reemplazada, pero no dice por cuál (reemplazada_por).");
    if (d.tipo === "propuesta" && d.estado === "rechazada" && !d.motivo) decir(d.ruta, null, "Está rechazada sin motivo: así se puede volver a proponer lo mismo.");
    if (d.habilidad) {
      const h = d.habilidad;
      if (!NOMBRE_DE_HABILIDAD_NUEVA.test(h.nombre)) decir(d.ruta, null, `«${h.nombre.slice(0, 40)}» no es un nombre de habilidad: minúsculas, números y guiones.`);
      if (!h.etapas.length) decir(d.ruta, null, "La habilidad no dice en qué etapa se usa (etapas).");
      for (const e of h.etapas) if (!(ETAPAS as readonly string[]).includes(e)) decir(d.ruta, null, `«${e}» no es una etapa de la fábrica: ${ETAPAS.join(", ")}.`);
      if (!h.archivos.some((x) => x.ruta === "SKILL.md")) decir(d.ruta, null, "La habilidad no trae su SKILL.md en «## Archivos».");
      for (const x of h.archivos) if (!RUTA_DE_ARCHIVO_DE_HABILIDAD.test(x.ruta)) decir(d.ruta, null, `La ruta «${x.ruta.slice(0, 40)}» no vale para un archivo de la habilidad.`);
    }
  }
  // Con un id repetido vale el primero, como en el chequeo de arriba.
  const decisiones = new Map<string, DocumentoDeMemoria>();
  for (const d of vault.decisiones) if (d.id && !decisiones.has(d.id)) decisiones.set(d.id, d);
  for (const d of vault.decisiones) {
    if (d.reemplazadaPor && !decisiones.has(d.reemplazadaPor)) decir(d.ruta, null, `La reemplaza ${d.reemplazadaPor}, que no existe.`);
    if (d.reemplaza && !decisiones.has(d.reemplaza)) decir(d.ruta, null, `Dice que reemplaza a ${d.reemplaza}, que no existe.`);
  }

  // Lo que la ficha cita tiene que existir y estar vigente.
  for (const r of vault.ficha?.reglas ?? []) {
    for (const id of r.decisiones) {
      const d = decisiones.get(id);
      if (!d) decir("ficha.md", r.linea, `Cita ${id}, que no existe.`);
      else if (d.estado !== "vigente") decir("ficha.md", r.linea, `Cita ${id}, que está ${d.estado}${d.reemplazadaPor ? ` (la reemplaza ${d.reemplazadaPor})` : ""}.`);
    }
  }

  // La bitácora.
  for (const a of archivos) {
    if (!a.ruta.startsWith("bitacora/")) continue;
    if (!NOMBRE_DE_BITACORA.test(a.ruta.slice("bitacora/".length))) decir(a.ruta, null, "La bitácora va por mes: bitacora/AAAA-MM.md.");
    for (const m of leerBitacora(a.texto).malas) decir(a.ruta, m.linea, "No es una línea de la bitácora: «- AAAA-MM-DD · F-014 · título · estado».");
  }
  return problemas;
}

/** Sin tildes ni mayúsculas, para buscar como lo haría una persona. */
export const comparable = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type Hallazgo = { ruta: string; linea: number; texto: string };

/**
 * Busca en el vault como lo haría `grep`, pero sin tildes ni mayúsculas: las líneas que tienen
 * todas las palabras del texto. Con `temas`, solo en las reglas de la ficha de esos temas y en los
 * documentos que los tienen (de esos, sin texto, la línea del título).
 */
export function buscar(archivos: readonly ArchivoDelVault[], texto: string, opciones: { temas?: readonly string[]; max?: number } = {}): Hallazgo[] {
  const palabras = comparable(texto).split(/\s+/).filter(Boolean);
  const temas = opciones.temas?.length ? new Set(opciones.temas) : null;
  const max = opciones.max ?? 50;
  const hallazgos: Hallazgo[] = [];
  const tiene = (l: string) => palabras.every((p) => comparable(l).includes(p));
  for (const a of archivos) {
    if (hallazgos.length >= max) break;
    const lineas = lineasDe(a.texto);
    if (temas) {
      if (a.ruta === "ficha.md") {
        for (const r of leerFicha(a.texto).reglas) if (temas.has(r.tema) && tiene(lineas[r.linea - 1]!)) hallazgos.push({ ruta: a.ruta, linea: r.linea, texto: lineas[r.linea - 1]! });
        continue;
      }
      if (!/^(decisiones|propuestas)\//.test(a.ruta)) continue;
      const d = leerDocumento(a.texto, a.ruta);
      if (!d.temas.some((t) => temas.has(t))) continue;
      if (!palabras.length) {
        const i = lineas.findIndex((l) => l.startsWith("titulo:"));
        hallazgos.push({ ruta: a.ruta, linea: i + 1, texto: lineas[i] ?? d.titulo });
        continue;
      }
    }
    if (!palabras.length) continue;
    lineas.forEach((l, i) => {
      if (hallazgos.length < max && l.trim() && tiene(l)) hallazgos.push({ ruta: a.ruta, linea: i + 1, texto: l });
    });
  }
  return hallazgos.slice(0, max);
}

/** Lo que una regla `NO:` prohíbe, uno por uno: «SQL Server, MySQL ni MongoDB» → tres. */
export function prohibidos(regla: Pick<ReglaDeFicha, "texto">): string[] {
  return regla.texto
    .replace(/[.;:]+$/, "")
    .split(/,|\s+ni\s+|\s+y\s+|\s+o\s+|\s+nor\s+/i)
    .map((t) => t.replace(/^(nada de|ningun[ao]?|ni)\s+/i, "").trim())
    .filter((t) => t.length >= 2);
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Si un texto nombra algo que la ficha prohíbe. Es una sospecha para el agente de spec, no un
 * juicio: «migrar a MongoDB» contra «NO: … MongoDB» sí; una palabra suelta dentro de otra, no.
 */
export function contradice(ficha: Ficha, texto: string): { regla: ReglaDeFicha; termino: string }[] {
  const t = comparable(texto);
  const choques: { regla: ReglaDeFicha; termino: string }[] = [];
  for (const regla of ficha.reglas) {
    if (!regla.prohibe) continue;
    for (const termino of prohibidos(regla)) {
      const patron = new RegExp(`(^|[^\\p{L}\\p{N}])${escapar(comparable(termino))}($|[^\\p{L}\\p{N}])`, "u");
      if (patron.test(t)) choques.push({ regla, termino });
    }
  }
  return choques;
}
