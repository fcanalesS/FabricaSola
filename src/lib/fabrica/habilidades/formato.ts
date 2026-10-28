import { partir } from "../motor/formato.ts";

/**
 * El catálogo de habilidades de una línea (`factory/habilidades.md`): qué
 * habilidad usa cada etapa de la fábrica, y cuándo. Una habilidad es un
 * `SKILL.md` del estándar de Claude Code; sin una línea en el catálogo, la
 * fábrica no la usa aunque exista. Se lee con `grep`:
 *
 *   - [construccion] wolff-db: antes de escribir SQL contra la base wolff.
 *   - [spec, revision] ditab-view: al crear o revisar una vista de Ditab.
 *
 * Bajo `## Sin asignar` van las que existen y todavía no usa ninguna etapa:
 * `- nombre: lo que dice de sí misma.` Es solo para que él las vea; la fábrica
 * no las usa. Lo escribe él; los agentes no. Es lógica pura: recibe los textos
 * ya leídos.
 */

/** Las etapas de la fábrica que tienen un agente y pueden recibir habilidades. */
export const ETAPAS = ["spec", "construccion", "revision", "aprobacion"] as const;
export type Etapa = (typeof ETAPAS)[number];

/** El nombre de una habilidad: el de su carpeta, en minúsculas y con guiones; las de un plugin, `plugin:nombre`. */
export const NOMBRE_DE_HABILIDAD = /^[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

export const TOPE_DE_LINEA = 200;
export const SIN_ASIGNAR = "Sin asignar";

/** El nombre de una habilidad que se crea en el proyecto: el de su carpeta, sin plugin. */
export const NOMBRE_DE_HABILIDAD_NUEVA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** La ruta de un archivo dentro de una habilidad: hasta tres niveles, sin `..` ni archivos ocultos. La misma del mod. */
export const RUTA_DE_ARCHIVO_DE_HABILIDAD = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*){0,2}$/;
/** Los topes de una habilidad propuesta: los mismos del mod. */
export const TOPES_DE_HABILIDAD = { archivos: 10, bytesPorArchivo: 32 * 1024, bytes: 96 * 1024, cuando: 150 } as const;
/** Un archivo que no es texto de la habilidad (un `.md` o un `.txt`): algo que Claude Code puede correr. */
export const esScript = (ruta: string) => !/\.(md|txt)$/i.test(ruta);

export type UsoDeHabilidad = { linea: number; etapas: string[]; nombre: string; cuando: string };
export type SinAsignar = { linea: number; nombre: string; texto: string };
export type Catalogo = { titulo: string | null; usos: UsoDeHabilidad[]; sinAsignar: SinAsignar[]; malas: { linea: number; texto: string }[] };

const lineasDe = (texto: string) => texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");

const USO = /^- \[([^\]]*)\]\s+([^:\s]+(?::[^:\s]+)?):\s*(.+?)\s*$/;
const LIBRE = /^- ([^:\s[]+(?::[^:\s]+)?):\s*(.*?)\s*$/;

/**
 * El catálogo, línea por línea. Un uso va antes de `## Sin asignar`; una habilidad sin asignar,
 * después. Una línea que empieza con `- ` y no es ninguna de las dos va a `malas`; el resto (los
 * títulos, la explicación, las líneas en blanco) no cuenta.
 */
export function leerCatalogo(texto: string): Catalogo {
  const catalogo: Catalogo = { titulo: null, usos: [], sinAsignar: [], malas: [] };
  let enSinAsignar = false;
  lineasDe(texto).forEach((l, i) => {
    const linea = i + 1;
    const titulo = /^(#{1,6})\s+(.+?)\s*$/.exec(l);
    if (titulo) {
      if (titulo[1] === "#" && catalogo.titulo === null) catalogo.titulo = titulo[2]!;
      enSinAsignar = titulo[1] === "##" && titulo[2]!.toLowerCase() === SIN_ASIGNAR.toLowerCase();
      return;
    }
    if (!l.startsWith("- ")) return;
    if (enSinAsignar) {
      const m = LIBRE.exec(l);
      if (m) catalogo.sinAsignar.push({ linea, nombre: m[1]!, texto: m[2]! });
      else catalogo.malas.push({ linea, texto: l });
      return;
    }
    const m = USO.exec(l);
    if (!m) {
      catalogo.malas.push({ linea, texto: l });
      return;
    }
    const etapas = m[1]!
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    catalogo.usos.push({ linea, etapas, nombre: m[2]!, cuando: m[3]! });
  });
  return catalogo;
}

/** De dónde sale una habilidad: del repositorio del proyecto, o de las suyas (no versionadas). */
export type OrigenDeHabilidad = "proyecto" | "suya";

/** Lo que se sabe de una habilidad que existe, sacado de su frontmatter. Nunca su contenido. */
export type HabilidadDisponible = {
  nombre: string;
  descripcion: string;
  origen: OrigenDeHabilidad;
  /** `disable-model-invocation: true`: no se puede dar a un agente. */
  soloAMano: boolean;
  /**
   * Los oficios con que trabaja (`oficios:` en su frontmatter): archivos de `fabrica/oficios/` cuyo
   * texto le pasa la corrida al agente de su etapa. Solo nombres con forma válida.
   */
  oficios?: string[];
  /** Dónde está su `SKILL.md` y la huella de su contenido (`huellaDe`). Solo en el servidor: no van a ninguna pantalla. */
  ruta?: string;
  huella?: string;
};

/**
 * La huella del contenido de un `SKILL.md`: FNV-1a de 32 bits, en hex. La misma cuenta en el plugin
 * (fabrica/hooks/habilidades.ts): dice con qué versión empezó una corrida, también en las
 * habilidades que no están en un repositorio. Los saltos de línea de Windows no la cambian.
 */
export function huellaDe(texto: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(texto.replace(/\r\n?/g, "\n"))) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const unaLinea = (t: string) => t.replace(/\s+/g, " ").trim();

/**
 * El nombre y la descripción de un `SKILL.md`, de su frontmatter. El nombre de la carpeta manda si
 * el frontmatter no trae uno. Lo demás del archivo no se mira: su contenido no sale de aquí.
 */
export function habilidadDesde(carpeta: string, texto: string, origen: OrigenDeHabilidad): HabilidadDisponible | null {
  const { datos } = partir(texto);
  const nombre = (datos.name ?? "").trim() || carpeta;
  if (!NOMBRE_DE_HABILIDAD.test(nombre)) return null;
  return {
    nombre,
    descripcion: unaLinea(datos.description ?? "").slice(0, 300),
    origen,
    soloAMano: /^true$/i.test((datos["disable-model-invocation"] ?? "").trim()),
    ...(oficiosDe(datos.oficios).length ? { oficios: oficiosDe(datos.oficios) } : {}),
  };
}

/** Las etapas que tienen especialidades. */
export const ETAPAS_CON_ESPECIALIDADES = ["spec", "construccion", "aprobacion"] as const;
export type EtapaConEspecialidades = (typeof ETAPAS_CON_ESPECIALIDADES)[number];

/**
 * Una especialidad: una habilidad de una etapa que una línea enciende, con su «cuándo» para el
 * catálogo (hasta 150 caracteres). Sus plantillas: `fabrica/plantillas/especialidades/`.
 */
export type Especialidad = { nombre: string; cuando: string; etapa: EtapaConEspecialidades };

/**
 * Las especialidades: cuatro de la spec (fabrica/docs/Plan-Spec.md, etapa 3) y tres del
 * constructor (fabrica/docs/Plan-Builder.md, etapa 3). El «cuándo» de cada una en el catálogo:
 * hasta 150 caracteres, como cualquier uso.
 */
export const ESPECIALIDADES: readonly Especialidad[] = [
  { nombre: "spec-guardarrailes", etapa: "spec", cuando: "Cuando la tarea llame a un modelo de IA, cambie un prompt o le dé herramientas a un agente." },
  { nombre: "spec-datos-y-contexto", etapa: "spec", cuando: "Cuando la tarea toque datos personales o los mande a un modelo de IA." },
  { nombre: "spec-evaluacion", etapa: "spec", cuando: "Cuando la tarea cambie lo que responde un modelo de IA, o el modelo mismo." },
  { nombre: "spec-contratos-y-recursos", etapa: "spec", cuando: "Cuando la tarea hable con otro servicio o llame a un modelo de IA." },
  { nombre: "construir-codigo", etapa: "construccion", cuando: "Cuando la tarea cambie o agregue código del proyecto." },
  { nombre: "construir-seguridad", etapa: "construccion", cuando: "Cuando la tarea toque permisos, datos de personas, claves, entradas de afuera, conectores o dependencias." },
  { nombre: "construir-interfaz", etapa: "construccion", cuando: "Cuando la tarea cambie lo que ve o usa una persona: pantallas, formularios, mensajes o flujos." },
  { nombre: "aprobar-entrega", etapa: "aprobacion", cuando: "En toda tarea que llegue a aprobación con cambios en el código." },
];

/** Las especialidades de una etapa. */
export const especialidadesDe = (etapa: EtapaConEspecialidades) => ESPECIALIDADES.filter((e) => e.etapa === etapa);


/**
 * Una habilidad del cerebro de la fábrica: una sola para todas las líneas. Su plantilla está en
 * `fabrica/plantillas/cerebro/<nombre>/`, su propuesta va al vault de la planta, y aprobarla la
 * escribe como habilidad suya (`~/.claude/skills/<nombre>/`); cada línea la usa solo si su
 * catálogo la nombra, en sus etapas. `resumen` es lo que dice la pantalla de una línea.
 */
export type HabilidadDelCerebro = { nombre: string; etapas: readonly Etapa[]; cuando: string; resumen: string };

/** La Ley 21.719 (fabrica/docs/Plan-Spec.md, etapa 4): marca riesgos en la spec y los comprueba en la revisión. */
export const LEY = {
  nombre: "ley-21719",
  etapas: ["spec", "revision"],
  cuando: "Cuando la tarea toque datos personales de personas en Chile.",
  resumen: "La Ley 21.719, para toda la fábrica: en la spec marca los riesgos y en la revisión los comprueba. No certifica el cumplimiento.",
} as const satisfies HabilidadDelCerebro;

/** Construir con IA (fabrica/docs/Plan-Builder.md, etapa 4): lo que la fábrica sabe de construir con un modelo. */
export const IA = {
  nombre: "construir-con-ia",
  etapas: ["construccion"],
  cuando: "Cuando la tarea llame a un modelo de IA, le dé herramientas a un agente o arme su contexto.",
  resumen:
    "Lo que la fábrica sabe de construir con IA, para todas las líneas: defensas para respuestas parcialmente correctas, conectores con permisos mínimos, contexto y RAG con tope, y streaming y respaldos que avisan.",
} as const satisfies HabilidadDelCerebro;

/** Las habilidades del cerebro de la fábrica, en el orden en que se muestran. */
export const CEREBRO: readonly HabilidadDelCerebro[] = [LEY, IA];

/** La del cerebro con ese nombre, o `undefined`. */
export const delCerebro = (nombre: unknown) => CEREBRO.find((h) => h.nombre === nombre);

/** El nombre de un oficio: el de su archivo en `fabrica/oficios/`, sin ruta ni extensión. */
export const NOMBRE_DE_OFICIO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Cuántos oficios puede nombrar una habilidad. */
export const MAX_OFICIOS = 6;

/** Los oficios de `oficios: a, b`: sin repetir, solo los que tienen forma de nombre, y hasta el tope. */
export function oficiosDe(valor: string | undefined): string[] {
  const nombres = (valor ?? "").split(",").map((n) => n.trim());
  return [...new Set(nombres.filter((n) => NOMBRE_DE_OFICIO.test(n)))].slice(0, MAX_OFICIOS);
}

export type ProblemaDelCatalogo = { linea: number | null; que: string };

/**
 * Lo que no cumple el catálogo, con su línea: lo que haría que la fábrica no pudiera dar una
 * habilidad o que un `grep` la perdiera. `disponibles` son las que existen (las del proyecto y, si
 * se permiten, las suyas). No corrige nada.
 */
export function revisarCatalogo(texto: string, disponibles: readonly HabilidadDisponible[]): ProblemaDelCatalogo[] {
  const problemas: ProblemaDelCatalogo[] = [];
  const decir = (linea: number | null, que: string) => problemas.push({ linea, que });
  if (/\r/.test(texto)) decir(null, "Tiene saltos de línea de Windows (CRLF): van LF.");
  lineasDe(texto).forEach((l, i) => {
    if (l.length > TOPE_DE_LINEA) decir(i + 1, `La línea pasa de ${TOPE_DE_LINEA} caracteres.`);
  });
  const c = leerCatalogo(texto);
  for (const m of c.malas) decir(m.linea, "No es un uso: van como «- [etapa, etapa] nombre: cuándo.», y bajo «## Sin asignar», «- nombre: qué hace.».");
  const porNombre = new Map(disponibles.map((d) => [d.nombre, d]));
  const vistos = new Set<string>();
  for (const u of c.usos) {
    if (!u.etapas.length) decir(u.linea, "No dice en qué etapa se usa.");
    for (const e of u.etapas) {
      if (!(ETAPAS as readonly string[]).includes(e)) decir(u.linea, `«${e}» no es una etapa de la fábrica: ${ETAPAS.join(", ")}.`);
      else if (vistos.has(`${e}:${u.nombre}`)) decir(u.linea, `${u.nombre} ya está en ${e} más arriba.`);
      vistos.add(`${e}:${u.nombre}`);
    }
    if (!NOMBRE_DE_HABILIDAD.test(u.nombre)) {
      decir(u.linea, `«${u.nombre}» no es un nombre de habilidad: minúsculas, números y guiones.`);
      continue;
    }
    const d = porNombre.get(u.nombre);
    if (!d) decir(u.linea, `No hay ninguna habilidad «${u.nombre}» en el proyecto${u.nombre.includes(":") ? " (las de un plugin no se pueden comprobar desde aquí)" : " ni entre las tuyas"}.`);
    else if (d.soloAMano) decir(u.linea, `${u.nombre} solo se usa a mano (disable-model-invocation): no se le puede dar a un agente.`);
  }
  return problemas;
}

/** Las habilidades que cada etapa recibe, según el catálogo. Las que no existen o son solo a mano, no. */
export type HabilidadDeEtapa = { nombre: string; cuando: string; origen: OrigenDeHabilidad; ruta?: string; huella?: string; oficios?: string[] };

export function habilidadesPorEtapa(texto: string, disponibles: readonly HabilidadDisponible[]): Record<Etapa, HabilidadDeEtapa[]> {
  const porNombre = new Map(disponibles.map((d) => [d.nombre, d]));
  const porEtapa: Record<Etapa, HabilidadDeEtapa[]> = { spec: [], construccion: [], revision: [], aprobacion: [] };
  for (const u of leerCatalogo(texto).usos) {
    const d = porNombre.get(u.nombre);
    if (!d || d.soloAMano) continue;
    for (const e of u.etapas) {
      const lista = porEtapa[e as Etapa];
      if (lista && !lista.some((x) => x.nombre === u.nombre)) lista.push({ nombre: u.nombre, cuando: u.cuando, origen: d.origen, ...(d.ruta ? { ruta: d.ruta } : {}), ...(d.huella ? { huella: d.huella } : {}), ...(d.oficios?.length ? { oficios: d.oficios } : {}) });
    }
  }
  return porEtapa;
}

export type HabilidadConHuella = { nombre: string; huella: string; origen: OrigenDeHabilidad; ruta: string };

/**
 * Lo que la corrida le pasa al plugin en `FABRICA_HABILIDADES`: por etapa, cada habilidad con su
 * huella al empezar y dónde está su `SKILL.md`, para anotarla en la tarea y ver si cambió. Las
 * etapas sin habilidades no van. `null` si ninguna tiene.
 */
export function habilidadesConHuella(porEtapa: Record<Etapa, readonly HabilidadDeEtapa[]>): Partial<Record<Etapa, HabilidadConHuella[]>> | null {
  const out: Partial<Record<Etapa, HabilidadConHuella[]>> = {};
  for (const e of ETAPAS) {
    const lista = porEtapa[e].filter((h) => h.ruta && h.huella).map((h) => ({ nombre: h.nombre, huella: h.huella!, origen: h.origen, ruta: h.ruta! }));
    if (lista.length) out[e] = lista;
  }
  return Object.keys(out).length ? out : null;
}

/** La línea de un uso en el catálogo: `- [construccion, revision] nombre: cuándo.` */
export const lineaDeUso = (u: { nombre: string; etapas: readonly string[]; cuando: string }) => `- [${u.etapas.join(", ")}] ${u.nombre}: ${unaLinea(u.cuando)}`;

/**
 * Pone una habilidad en sus etapas: su línea va después del último uso (o antes de `## Sin asignar`)
 * y sale de las sin asignar. Si el catálogo ya la usa, no la repite: lanza, para que él la cambie
 * en su línea. Lo que se pueda decir lo revisa antes: nombre, etapas, cuándo y el tope de la línea.
 */
export function asignarEnElCatalogo(texto: string, u: { nombre: string; etapas: readonly string[]; cuando: string }): string {
  const etapas = [...new Set(u.etapas)];
  const cuando = unaLinea(u.cuando);
  const falta = [
    NOMBRE_DE_HABILIDAD.test(u.nombre) ? "" : `«${u.nombre.slice(0, 40)}» no es un nombre de habilidad`,
    etapas.length ? "" : "falta al menos una etapa",
    ...etapas.filter((e) => !(ETAPAS as readonly string[]).includes(e)).map((e) => `«${e.slice(0, 20)}» no es una etapa de la fábrica`),
    cuando ? "" : "falta cuándo se usa",
  ].filter(Boolean);
  if (falta.length) throw new Error(`No se asignó: ${falta.join(", ")}.`);
  const linea = lineaDeUso({ nombre: u.nombre, etapas, cuando });
  if (linea.length > TOPE_DE_LINEA) throw new Error(`La línea queda en ${linea.length} caracteres y el tope es ${TOPE_DE_LINEA}: acorta el «cuándo».`);
  const c = leerCatalogo(texto);
  const ya = c.usos.find((x) => x.nombre === u.nombre);
  if (ya) throw new Error(`${u.nombre} ya está en el catálogo (línea ${ya.linea}): cambia sus etapas ahí.`);

  const sacar = new Set(c.sinAsignar.filter((s) => s.nombre === u.nombre).map((s) => s.linea));
  let lineas = lineasDe(texto).map((l, i) => (sacar.has(i + 1) ? null : l));
  const ultimo = c.usos.at(-1)?.linea;
  const titulo = lineas.findIndex((l) => l !== null && /^##\s+/.test(l) && l.replace(/^##\s+/, "").trim().toLowerCase() === SIN_ASIGNAR.toLowerCase());
  if (ultimo) lineas.splice(ultimo, 0, linea);
  else if (titulo >= 0) lineas.splice(titulo, 0, linea, "");
  else {
    while (lineas.length && !lineas.at(-1)?.trim()) lineas.pop();
    lineas.push("", linea);
  }
  // Sin ninguna habilidad sin asignar, su título sobra.
  lineas = lineas.filter((l) => l !== null);
  if (!leerCatalogo(lineas.join("\n")).sinAsignar.length) {
    const i = lineas.findIndex((l) => /^##\s+/.test(l!) && l!.replace(/^##\s+/, "").trim().toLowerCase() === SIN_ASIGNAR.toLowerCase());
    if (i >= 0) lineas.splice(i, 1);
  }
  return `${(lineas as string[]).join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "")}\n`;
}

/**
 * El catálogo que él escribió, listo para guardar: saltos LF y sin espacios al final. Lo que no es un
 * uso o pasa el tope de la línea no se guarda (lanza); lo demás que no cumple (una habilidad que no
 * existe, por ejemplo) se guarda y se avisa: él puede estar a medio camino.
 */
export function catalogoParaGuardar(texto: string, disponibles: readonly HabilidadDisponible[]): { texto: string; avisos: string[] } {
  const limpio = `${lineasDe(texto)
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n*$/, "")}\n`;
  const c = leerCatalogo(limpio);
  if (c.malas.length) {
    const cuales = c.malas.slice(0, 3).map((m) => m.linea).join(", ");
    throw new Error(`No se guardó: ${c.malas.length === 1 ? `la línea ${cuales} no es un uso` : `las líneas ${cuales}${c.malas.length > 3 ? " y otras" : ""} no son usos`}. Van como «- [construccion] nombre: cuándo.», y bajo «## ${SIN_ASIGNAR}», «- nombre: qué hace.».`);
  }
  const largas = lineasDe(limpio).flatMap((l, i) => (l.length > TOPE_DE_LINEA ? [i + 1] : []));
  if (largas.length) throw new Error(`No se guardó: ${largas.length === 1 ? `la línea ${largas[0]} pasa` : `las líneas ${largas.slice(0, 3).join(", ")} pasan`} de ${TOPE_DE_LINEA} caracteres.`);
  return { texto: limpio, avisos: revisarCatalogo(limpio, disponibles).map((p) => (p.linea ? `Línea ${p.linea}: ${p.que}` : p.que)) };
}

/**
 * El catálogo de una línea nueva. Las habilidades que el proyecto ya tiene van **sin asignar**: la
 * fábrica no usa ninguna hasta que él la ponga en una etapa.
 */
export function catalogoNuevo(nombre: string, delProyecto: readonly HabilidadDisponible[]): string {
  const sinAsignar = delProyecto
    .filter((d) => d.origen === "proyecto")
    .map((d) => `- ${d.nombre}: ${(d.descripcion || "sin descripción").replaceAll("\n", " ")}`.slice(0, TOPE_DE_LINEA));
  return [
    `# Habilidades · ${nombre}`,
    "",
    "Qué habilidad usa cada etapa de la fábrica, y cuándo: una por línea, como",
    "«- [construccion] nombre: cuándo usarla.». Etapas: spec, construccion, revision, aprobacion.",
    "Sin una línea aquí, la fábrica no usa una habilidad aunque exista. Lo escribe una persona.",
    "",
    ...(sinAsignar.length ? [`## ${SIN_ASIGNAR}`, "", ...sinAsignar, ""] : []),
  ].join("\n");
}
