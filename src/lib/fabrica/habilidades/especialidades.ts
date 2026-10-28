import { partir, unir } from "../motor/formato.ts";
import { envolver, siguienteId } from "../memoria/cambiar.ts";
import { leerVault, SECCION_DE_ARCHIVOS, type ArchivoDelVault } from "../memoria/formato.ts";
import { documento, nombreDeArchivo } from "../memoria/plantillas.ts";
import { habilidadDesde, IA, LEY, leerCatalogo, type Especialidad, type HabilidadDelCerebro, type HabilidadDisponible } from "./formato.ts";

export { CEREBRO, ESPECIALIDADES, IA, LEY, type Especialidad } from "./formato.ts";

/**
 * Las especialidades: habilidades de una etapa que una línea enciende. Cuatro de la spec
 * (fabrica/docs/Plan-Spec.md, etapa 3), para las tareas que tocan IA o datos personales, y tres del
 * constructor (fabrica/docs/Plan-Builder.md, etapa 3): código, seguridad e interfaz. Viven como
 * plantillas en `fabrica/plantillas/especialidades/<nombre>/SKILL.md`, y la aplicación las deja como
 * propuestas en el vault de una línea cuando él lo pide: él las aprueba de a una, viendo su texto
 * entero, y aprobarla escribe la habilidad y su línea del catálogo, sin commit. Cada una nombra a
 * sus Nikkes (`nikkes:`), cuyos archivos enteros le pasa la corrida al agente de su etapa. Es
 * lógica pura.
 */

/** Cómo se dice cada etapa en una propuesta. */
const DICHO_DE_LA_ETAPA = {
  spec: {
    la: "la spec",
    plan: "fabrica/docs/Plan-Spec.md",
    agente: "al agente de spec",
    temas: ["especificacion", "habilidades"],
    implica: "Con ella, la spec de esta línea no se salta, y cada spec lleva unos miles de tokens más por cada Nikke.",
  },
  construccion: {
    la: "la construcción",
    plan: "fabrica/docs/Plan-Builder.md",
    agente: "al constructor",
    temas: ["construccion", "habilidades"],
    implica: "Cada construcción de esta línea lleva unos miles de tokens más por cada Nikke, y otra vez en cada vuelta de retrabajo.",
  },
  aprobacion: {
    la: "la aprobación",
    plan: "fabrica/docs/Plan-Aprobador.md",
    agente: "al aprobador",
    temas: ["aprobacion", "habilidades"],
    implica: "Cada aprobación de esta línea lleva unos miles de tokens más por cada Nikke. Sus herramientas propias no se usan: el veredicto se registra con mcp__fabrica__aprobar.",
  },
} as const;

/** Una plantilla leída: su nombre, su «cuándo» y el texto de su `SKILL.md`. */
export type PlantillaDeEspecialidad = Especialidad & { skill: string };

export type PropuestasDeEspecialidades = {
  /** Los documentos nuevos del vault, con su ruta relativa (`propuestas/P-0003-….md`). */
  nuevas: { ruta: string; texto: string; nombre: string; id: string }[];
  /** Las que no se propusieron, con el porqué. */
  omitidas: { nombre: string; por: string }[];
};

const ESTADOS_QUE_CUENTAN = ["propuesta", "aprobada"];

/** El texto de un archivo como lo escribe el mod en `## Archivos`: con cuatro espacios de sangría. */
const sangrado = (texto: string) =>
  texto
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((l) => (l ? `    ${l}` : ""))
    .join("\n");

/**
 * Las propuestas que faltan en este vault. No se propone una que ya existe como habilidad (del
 * proyecto o suya), una que el catálogo ya nombra, ni una que ya espera o ya se aprobó. Una
 * rechazada sí: él la vuelve a pedir con un clic.
 */
export function propuestasDeEspecialidades(
  archivos: readonly ArchivoDelVault[],
  plantillas: readonly PlantillaDeEspecialidad[],
  e: { disponibles: readonly HabilidadDisponible[]; catalogo: string | null; fecha: string },
): PropuestasDeEspecialidades {
  const vault = leerVault(archivos);
  const nombradas = new Set(e.catalogo === null ? [] : leerCatalogo(e.catalogo).usos.map((u) => u.nombre));
  const primero = Number(siguienteId([...vault.decisiones, ...vault.propuestas], "P").slice(2));
  const nuevas: PropuestasDeEspecialidades["nuevas"] = [];
  const omitidas: PropuestasDeEspecialidades["omitidas"] = [];
  for (const p of plantillas) {
    const ya = e.disponibles.find((d) => d.nombre === p.nombre);
    if (ya) {
      omitidas.push({ nombre: p.nombre, por: ya.origen === "suya" ? "ya es una habilidad tuya" : "ya está en el proyecto" });
      continue;
    }
    if (nombradas.has(p.nombre)) {
      omitidas.push({ nombre: p.nombre, por: "el catálogo ya la nombra" });
      continue;
    }
    const previa = vault.propuestas.find((x) => x.habilidad?.nombre === p.nombre && ESTADOS_QUE_CUENTAN.includes(x.estado));
    if (previa) {
      omitidas.push({ nombre: p.nombre, por: `ya está ${previa.estado === "propuesta" ? "propuesta" : "aprobada"} (${previa.id})` });
      continue;
    }
    const nikkes = habilidadDesde(p.nombre, p.skill, "proyecto")?.nikkes ?? [];
    const d = DICHO_DE_LA_ETAPA[p.etapa];
    // Los ids cuentan también los que se acaban de proponer.
    const id = `P-${String(primero + nuevas.length).padStart(4, "0")}`;
    const titulo = `Habilidad ${p.nombre} para ${d.la}`;
    const texto = documentoDeHabilidad({
      id,
      titulo,
      fecha: e.fecha,
      nombre: p.nombre,
      etapas: [p.etapa],
      cuando: p.cuando,
      skill: p.skill,
      temas: d.temas,
      origen: `Memoria › Habilidades: proponer las especialidades de ${d.la}`,
      secciones: {
        "Decisión": `Darle a ${d.la} de esta línea la habilidad «${p.nombre}». ${p.cuando}`,
        "Por qué":
          `Es una de las especialidades de ${d.la} (${d.plan}). ` +
          (nikkes.length ? `Trabaja con ${nikkes.join(", ")}: la corrida le pasa sus archivos enteros ${d.agente}, y su voz sale solo al abrir y al cerrar su resumen.` : ""),
        "Qué se descartó": "Copiar el lore de las Nikkes dentro de la habilidad: quedarían dos copias, y la habilidad se quedaría con la vieja.",
        "Qué implica": `Aprobarla escribe .claude/skills/${p.nombre}/SKILL.md y su línea en factory/habilidades.md, sin commit. ${d.implica}`,
      },
    });
    nuevas.push({ ruta: `propuestas/${nombreDeArchivo(id, titulo)}`, texto, nombre: p.nombre, id });
  }
  return { nuevas, omitidas };
}

/** La propuesta de una habilidad en el vault: el documento de siempre, más su habilidad y su `SKILL.md` en `## Archivos`. */
function documentoDeHabilidad(d: {
  id: string;
  titulo: string;
  fecha: string;
  nombre: string;
  etapas: readonly string[];
  cuando: string;
  skill: string;
  temas: readonly string[];
  origen: string;
  secciones: Record<"Decisión" | "Por qué" | "Qué se descartó" | "Qué implica", string>;
}): string {
  const base = documento({
    id: d.id,
    titulo: d.titulo,
    estado: "propuesta",
    fecha: d.fecha,
    temas: d.temas,
    origen: d.origen,
    propone: "la aplicación, a pedido de él",
    regla: "",
    secciones: Object.fromEntries(Object.entries(d.secciones).map(([k, v]) => [k, envolver(v)])),
  });
  const { datos, cuerpo } = partir(base);
  return unir(
    { ...datos, habilidad: d.nombre, etapas: d.etapas.join(", "), cuando: d.cuando },
    `${cuerpo.replace(/\n+$/, "\n")}\n## ${SECCION_DE_ARCHIVOS}\n\n### SKILL.md\n\n${sangrado(d.skill)}\n`,
  );
}

// ---- Las habilidades del cerebro de la fábrica ---------------------------------------------------

type SeccionesDePropuesta = Record<"Decisión" | "Por qué" | "Qué se descartó" | "Qué implica", string>;

/** Lo que dice la propuesta de cada habilidad del cerebro: sus temas, de dónde sale y sus secciones. */
const TEXTOS_DEL_CEREBRO: Record<string, { temas: readonly string[]; origen: string; secciones: SeccionesDePropuesta }> = {
  [LEY.nombre]: {
    temas: ["datos-personales", "habilidades"],
    origen: "Memoria › Habilidades: proponer la habilidad de la Ley 21.719",
    secciones: {
      "Decisión": "Tener una habilidad de la Ley 21.719 para toda la fábrica, que la spec y la revisión de cada línea usan si su catálogo la nombra.",
      "Por qué":
        "Lo decidió él el 26 de octubre de 2026: la ley queda en el cerebro de la fábrica como una habilidad, no dentro de una especialidad. " +
        "Una sola copia: si la ley o su reglamento cambian, se corrige en un lugar.",
      "Qué se descartó": "Una copia por línea: quedarían varias, cada una con su versión. Un catálogo de habilidades de la planta: no hace falta para una sola.",
      "Qué implica":
        "Aprobarla la escribe en tu carpeta de Claude Code (skills/ley-21719/SKILL.md), fuera de todo repositorio. " +
        "Como habilidad tuya, Claude Code también la ofrece en tus sesiones. En la fábrica, cada línea la usa solo si su catálogo la nombra. " +
        "No certifica el cumplimiento: marca riesgos y decide una persona.",
    },
  },
  [IA.nombre]: {
    temas: ["construccion", "ia", "habilidades"],
    origen: "Memoria › Habilidades: proponer la habilidad de construir con IA",
    secciones: {
      "Decisión":
        "Tener una habilidad de construir con IA para toda la fábrica, que la construcción de cada línea usa si su catálogo la nombra. " +
        "Trabaja con noah-robustez, drake-contrato y behemoth-drenaje: la corrida le pasa sus archivos enteros al constructor.",
      "Por qué":
        "Lo decidió él el 27 de octubre de 2026: lo que la fábrica sabe de construir con IA vive en su cerebro, como la Ley 21.719. " +
        "Una línea que no trabaja con IA no la carga, y lo que se aprende se corrige en un solo lugar.",
      "Qué se descartó": "Repartirla dentro de código, seguridad e interfaz: una línea sin IA cargaría ese conocimiento sin usarlo. Una copia por línea: quedarían varias versiones.",
      "Qué implica":
        "Aprobarla la escribe en tu carpeta de Claude Code (skills/construir-con-ia/SKILL.md), fuera de todo repositorio. " +
        "Como habilidad tuya, Claude Code también la ofrece en tus sesiones. En la fábrica, cada línea la usa solo si su catálogo la nombra, " +
        "y cada construcción lleva unos miles de tokens más por cada Nikke, otra vez en cada retrabajo.",
    },
  },
};

/** La propuesta de una habilidad del cerebro en el vault de la planta, o por qué no hace falta. */
export function propuestaDelCerebro(
  archivos: readonly ArchivoDelVault[],
  h: HabilidadDelCerebro,
  skill: string,
  e: { suyas: readonly HabilidadDisponible[]; fecha: string },
): { nueva: { ruta: string; texto: string; id: string } } | { omitida: string } {
  const t = TEXTOS_DEL_CEREBRO[h.nombre];
  if (!t) throw new Error(`${h.nombre} no es una habilidad del cerebro.`);
  if (e.suyas.some((s) => s.nombre === h.nombre)) return { omitida: "ya es una habilidad tuya: úsala en cada línea desde su pestaña Habilidades" };
  const vault = leerVault(archivos);
  const previa = vault.propuestas.find((x) => x.habilidad?.nombre === h.nombre && ESTADOS_QUE_CUENTAN.includes(x.estado));
  if (previa) return { omitida: `ya está ${previa.estado === "propuesta" ? "propuesta" : "aprobada"} en La planta (${previa.id})` };
  const id = siguienteId([...vault.decisiones, ...vault.propuestas], "P");
  const titulo = `Habilidad ${h.nombre} para toda la fábrica`;
  const texto = documentoDeHabilidad({ id, titulo, fecha: e.fecha, nombre: h.nombre, etapas: h.etapas, cuando: h.cuando, skill, temas: t.temas, origen: t.origen, secciones: t.secciones });
  return { nueva: { ruta: `propuestas/${nombreDeArchivo(id, titulo)}`, texto, id } };
}

/** La propuesta de la ley: la primera del cerebro. */
export const propuestaDeLaLey = (archivos: readonly ArchivoDelVault[], skill: string, e: { suyas: readonly HabilidadDisponible[]; fecha: string }) =>
  propuestaDelCerebro(archivos, LEY, skill, e);
