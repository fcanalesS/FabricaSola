import { partir } from "../motor/formato.ts";
import { esRamaProtegida } from "../motor/proyecto.ts";

/**
 * Los procesos de una línea (`factory/procesos/<id>.md`): cómo se publica lo
 * que la fábrica terminó, paso a paso, en un archivo que se lee con `grep` y
 * que escribe él. Aquí solo se lee y se revisa; correrlos es del motor, y lo
 * hace el código, no un modelo (lo decidió él el 26 de octubre de 2026). Es
 * lógica pura: recibe el texto ya leído.
 *
 *   ---
 *   id: publicar
 *   nombre: Publicar en prueba y en producción
 *   cuando: a-mano
 *   rama: desarrollo
 *   ---
 *
 *   - [push] y PR contra main
 *   - [ci] la integración continua del commit · tope 30m
 *   - [comando] ./scripts/desplegar.sh prueba {commit} · deshacer: ./scripts/desplegar.sh prueba {anterior}
 *   - [salud] GET https://prueba.pos.local/salud → 200 · tope 2m
 *   - [aprobacion] producción
 *
 * Con «- [fusion] el PR en main · squash» después del push y de la integración continua, el PR se
 * fusiona solo (procesos/fusion.ts): lo decidió él el 27 de octubre de 2026.
 *
 * Cada paso es `- [tipo] qué · opción · opción`. Lo que no empieza con `- `
 * (títulos, explicación, líneas en blanco) no cuenta.
 */

/** Los tipos de paso. No hay pasos libres que interprete un modelo. */
export const TIPOS_DE_PASO = ["push", "ci", "comando", "salud", "aprobacion", "tarea", "vulnerabilidades", "evaluacion", "fusion"] as const;
export type TipoDePaso = (typeof TIPOS_DE_PASO)[number];

/** Cuándo corre un proceso. */
export const CUANDO = ["a-mano", "al-integrar", "cada-dia", "cada-semana"] as const;

/** Lo que el código pone en un comando al correrlo. Nada más se reemplaza. */
export const MARCAS = ["{commit}", "{anterior}", "{rama}"] as const;
/** En una evaluación, además: la ruta del archivo donde el comando deja su resultado, fuera del repositorio. */
export const MARCA_DEL_RESULTADO = "{resultado}";

export const TOPE_DE_LINEA = 200;
/** El tope más largo de un paso. */
export const TOPE_MAXIMO_SEGUNDOS = 6 * 3600;
/** El nombre de una clave que recibe un paso: el de la variable de entorno que ve el comando. */
export const NOMBRE_DE_CLAVE = /^[A-Z][A-Z0-9_]{0,39}$/;
/** El nombre del archivo de un proceso, sin `.md`: minúsculas, números y guiones. */
export const ID_DE_PROCESO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type Salud = { metodo: "GET" | "HEAD"; url: string; codigo: number };

export type Paso = {
  linea: number;
  tipo: string;
  /** Lo que va después del tipo, sin las opciones. */
  texto: string;
  /** El tope, en segundos; `null` si no lo dice (el motor pone uno). */
  tope: number | null;
  /** El comando que lo deshace; `""` si dice que no se deshace (`deshacer: —`); `null` si no lo dice. */
  deshacer: string | null;
  /** Qué hacer si falla: deshacer lo hecho (siempre), y además dejar un pedido en la Bandeja. */
  siFalla: "deshacer" | "tarea" | null;
  /** En `push`: contra qué rama se abre el PR, si lo dice (`y PR contra main`). */
  prContra: string | null;
  /** En `salud`: qué se pide y qué se espera. */
  salud: Salud | null;
  /**
   * En `comando` y `evaluacion`: las claves que recibe (`clave: TOKEN`). Le llegan como variable de
   * entorno con ese nombre, y su valor sale de `COMPANIA_PROCESO_<LINEA>_<NOMBRE>` en `.env.local`.
   * Solo a ese paso.
   */
  claves: string[];
  /** En `evaluacion`: el puntaje más bajo que pasa (`umbral 0.8`), de 0 a 1; `null` si no lo dice. */
  umbral: number | null;
  /** En `evaluacion`: cuánto puede bajar respecto de la vez anterior (`tolerancia 0.02`); `null` si no lo dice. */
  tolerancia: number | null;
  /** En `fusion`: cómo se fusiona el PR (`merge`, `squash` o `rebase`); `null` si no lo dice (`merge`). */
  estilo: "merge" | "squash" | "rebase" | null;
  /** Lo que no se entendió de este paso. */
  problemas: string[];
};

export type Proceso = {
  /** Del frontmatter; vacío si no lo trae. */
  id: string;
  nombre: string;
  cuando: string;
  rama: string;
  /** `borrador: si`: está a medio escribir y no corre. La plantilla nace así. */
  borrador: boolean;
  pasos: Paso[];
  /** Líneas que empiezan con `- ` y no son un paso. */
  malas: { linea: number; texto: string }[];
};

export type ProblemaDelProceso = { linea: number | null; que: string };

const lineasDe = (texto: string) => texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
/** Lo que va después de ` # ` en un valor del frontmatter es un comentario. */
const sinComentario = (v: string | undefined) => (v ?? "").replace(/\s+#.*$/, "").trim();

const PASO = /^- \[([^\]]*)\]\s*(.*?)\s*$/;
/** Una rama que git aceptaría, sin espacios ni rarezas. */
const RAMA = /^(?!\/|.*\/\/|.*\.\.|.*\/$|.*\.lock$|-)[A-Za-z0-9._/-]{1,200}$/;
const SEPARADOR = /\s+·\s+/;
const NADA = new Set(["—", "-", "–", "nada", "no"]);
/** Lo que necesita una shell: los pasos corren sin ella. */
const DE_SHELL = /[|&;<>`]|\$\(|\$\{?[A-Za-z_]/;

/** Un tope como `30s`, `2m` o `1h`, en segundos; `null` si no tiene esa forma. */
export function segundosDe(t: string): number | null {
  const m = /^(\d{1,5})\s*(s|m|h)$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2] as "s" | "m" | "h"];
}

/** `GET https://… → 200`: lo que pide un paso de salud. */
export function saludDe(texto: string): Salud | null {
  const m = /^(GET|HEAD)\s+(\S+)\s+(?:→|->)\s+(\d{3})$/.exec(texto.trim());
  if (!m) return null;
  return { metodo: m[1] as Salud["metodo"], url: m[2]!, codigo: Number(m[3]) };
}

/** Las marcas `{…}` de un comando que el código no conoce. */
const marcasDesconocidas = (t: string, extra: readonly string[] = []) => (t.match(/\{[^{}]*\}/g) ?? []).filter((m) => !(MARCAS as readonly string[]).includes(m) && !extra.includes(m));

/** Un número de 0 a 1, como `0.8` o `0,8`; `null` si no lo es. */
function fraccionDe(t: string): number | null {
  if (!/^(?:0|1)(?:[.,]\d{1,4})?$/.test(t.trim())) return null;
  const n = Number(t.trim().replace(",", "."));
  return n >= 0 && n <= 1 ? n : null;
}

function leerPaso(tipo: string, resto: string, linea: number): Paso {
  const [texto = "", ...opciones] = resto.split(SEPARADOR);
  const paso: Paso = { linea, tipo, texto: texto.trim(), tope: null, deshacer: null, siFalla: null, prContra: null, salud: null, claves: [], umbral: null, tolerancia: null, estilo: null, problemas: [] };
  const decir = (que: string) => paso.problemas.push(que);
  for (const o of opciones) {
    const op = o.trim();
    let m: RegExpExecArray | null;
    if ((m = /^(umbral|tolerancia):?\s+(.+)$/i.exec(op))) {
      const cual = m[1]!.toLowerCase() as "umbral" | "tolerancia";
      const n = fraccionDe(m[2]!);
      if (n === null) decir(`«${op.slice(0, 30)}» no vale: ${cual} va de 0 a 1, como «${cual} ${cual === "umbral" ? "0.8" : "0.02"}».`);
      else paso[cual] = n;
    } else if ((m = /^tope\s+(.+)$/i.exec(op))) {
      const s = segundosDe(m[1]!);
      if (s === null) decir(`«${op.slice(0, 30)}» no es un tope: va como «tope 30s», «tope 2m» o «tope 1h».`);
      else if (s < 1 || s > TOPE_MAXIMO_SEGUNDOS) decir(`El tope va entre 1 segundo y ${TOPE_MAXIMO_SEGUNDOS / 3600} horas.`);
      else paso.tope = s;
    } else if ((m = /^deshacer:\s*(.*)$/i.exec(op))) paso.deshacer = NADA.has(m[1]!.trim().toLowerCase()) ? "" : m[1]!.trim();
    else if ((m = /^claves?:\s*(.*)$/i.exec(op))) {
      for (const c of m[1]!.split(",").map((x) => x.trim()).filter(Boolean)) {
        if (!NOMBRE_DE_CLAVE.test(c)) decir(`«${c.slice(0, 30)}» no es un nombre de clave: mayúsculas, números y _, como DEPLOY_TOKEN.`);
        else if (!paso.claves.includes(c)) paso.claves.push(c);
      }
    } else if ((m = /^si falla:\s*(.*)$/i.exec(op))) {
      const v = m[1]!.trim().toLowerCase();
      if (v === "deshacer" || v === "tarea") paso.siFalla = v;
      else decir(`«si falla: ${v.slice(0, 20)}» no vale: es «deshacer» o «tarea».`);
    } else if (tipo === "fusion" && /^(merge|squash|rebase)$/i.test(op)) {
      if (paso.estilo !== null) decir("Una fusión lleva un solo estilo: merge, squash o rebase.");
      paso.estilo = op.toLowerCase() as "merge" | "squash" | "rebase";
    } else decir(`«${op.slice(0, 40)}» no es una opción: tope, deshacer, clave, si falla, umbral, tolerancia${tipo === "fusion" ? ", merge, squash o rebase" : ""}.`);
  }

  if (!(TIPOS_DE_PASO as readonly string[]).includes(tipo)) decir(`«${tipo.slice(0, 20)}» no es un tipo de paso: ${TIPOS_DE_PASO.join(", ")}.`);
  if (tipo === "comando") {
    if (!paso.texto) decir("No dice qué comando corre.");
    if (paso.deshacer === null) decir("Un comando puede cambiar algo de afuera: declara cómo se deshace («deshacer: …», o «deshacer: —» si no cambia nada).");
    for (const [que, t] of [["El comando", paso.texto], ["Su deshacer", paso.deshacer ?? ""]] as const) {
      if (DE_SHELL.test(t)) decir(`${que} usa algo de una shell (|, &, ;, <, >, $): los pasos corren sin shell. Ponlo en un script del repositorio.`);
      for (const marca of marcasDesconocidas(t)) decir(`${que} usa ${marca.slice(0, 20)}, que el código no pone: solo ${MARCAS.join(", ")}.`);
    }
  } else if (paso.deshacer !== null) decir(`Solo un comando se deshace: «deshacer» no va en un paso ${tipo}.`);
  if (tipo === "evaluacion") {
    // Corre como un comando, pero mide: no cambia nada de afuera, así que no se deshace.
    if (!paso.texto) decir("No dice qué comando corre la evaluación.");
    if (DE_SHELL.test(paso.texto)) decir("El comando usa algo de una shell (|, &, ;, <, >, $): los pasos corren sin shell. Ponlo en un script del repositorio.");
    for (const marca of marcasDesconocidas(paso.texto, [MARCA_DEL_RESULTADO])) decir(`El comando usa ${marca.slice(0, 20)}, que el código no pone: solo ${[...MARCAS, MARCA_DEL_RESULTADO].join(", ")}.`);
  } else if (paso.umbral !== null || paso.tolerancia !== null) decir(`Solo una evaluación lleva umbral o tolerancia: no van en un paso ${tipo}.`);
  if (tipo === "salud") {
    paso.salud = saludDe(paso.texto);
    if (!paso.salud) decir("Una comprobación de salud va como «GET https://… → 200».");
    else if (!/^https?:\/\/[^\s/]+/.test(paso.salud.url)) decir("La dirección de la comprobación va con http:// o https://.");
  }
  if (tipo === "push") {
    const m = /\bPR\s+contra\s+(\S+)/i.exec(paso.texto);
    paso.prContra = m ? m[1]!.replace(/[.,;]$/, "") : null;
    if (paso.prContra !== null && !RAMA.test(paso.prContra)) decir(`«${paso.prContra.slice(0, 40)}» no es un nombre de rama para el PR.`);
  }
  if ((tipo === "aprobacion" || tipo === "tarea") && !paso.texto) decir(tipo === "aprobacion" ? "Di qué se aprueba: «- [aprobacion] producción»." : "Di qué se pide: «- [tarea] arreglar lo que falló».");
  if (paso.tope !== null && !["ci", "comando", "salud", "vulnerabilidades", "evaluacion"].includes(tipo)) decir(`Un paso ${tipo} no lleva tope.`);
  if (paso.claves.length && tipo !== "comando" && tipo !== "evaluacion") decir(`Solo un comando o una evaluación reciben claves: «clave» no va en un paso ${tipo}.`);
  return paso;
}

/** Un proceso, paso por paso. Lo que no se entiende queda en `malas` o en los problemas de cada paso. */
export function leerProceso(texto: string): Proceso {
  const { datos, cuerpo } = partir(texto);
  const inicio = lineasDe(texto).length - lineasDe(cuerpo).length;
  const proceso: Proceso = {
    id: sinComentario(datos.id),
    nombre: sinComentario(datos.nombre),
    cuando: sinComentario(datos.cuando),
    rama: sinComentario(datos.rama),
    borrador: /^(si|sí|true)$/i.test(sinComentario(datos.borrador)),
    pasos: [],
    malas: [],
  };
  lineasDe(cuerpo).forEach((l, i) => {
    const linea = inicio + i + 1;
    if (!l.startsWith("- ")) return;
    const m = PASO.exec(l);
    if (!m) proceso.malas.push({ linea, texto: l });
    else proceso.pasos.push(leerPaso(m[1]!.trim().toLowerCase(), m[2]!, linea));
  });
  return proceso;
}


/**
 * Lo que no cumple un proceso, con su línea: lo que haría que no se pudiera correr igual cada vez.
 * `archivo` es su nombre (`publicar.md`): el id tiene que ser el mismo. No corrige nada.
 */
export function revisarProceso(texto: string, archivo: string): ProblemaDelProceso[] {
  const problemas: ProblemaDelProceso[] = [];
  const decir = (linea: number | null, que: string) => problemas.push({ linea, que });
  if (/\r/.test(texto)) decir(null, "Tiene saltos de línea de Windows (CRLF): van LF.");
  lineasDe(texto).forEach((l, i) => {
    if (l.length > TOPE_DE_LINEA) decir(i + 1, `La línea pasa de ${TOPE_DE_LINEA} caracteres.`);
  });
  if (!/^---\r?\n/.test(texto.replace(/^﻿/, ""))) decir(1, "Le falta el frontmatter: id, nombre, cuando y rama, entre «---».");
  const p = leerProceso(texto);
  const esperado = archivo.replace(/\.md$/i, "");
  if (!p.id) decir(null, "No tiene id.");
  else if (!ID_DE_PROCESO.test(p.id)) decir(null, `El id «${p.id.slice(0, 40)}» va en minúsculas, con números y guiones.`);
  else if (p.id !== esperado) decir(null, `El id es «${p.id}», pero el archivo se llama ${archivo}: tienen que coincidir.`);
  if (!p.nombre) decir(null, "No tiene nombre.");
  if (!(CUANDO as readonly string[]).includes(p.cuando)) decir(null, `«cuando: ${p.cuando.slice(0, 30)}» no vale: ${CUANDO.join(", ")}.`);
  const empuja = p.pasos.some((x) => x.tipo === "push");
  if (p.rama) {
    if (!RAMA.test(p.rama)) decir(null, `«${p.rama.slice(0, 40)}» no es un nombre de rama.`);
    else if (esRamaProtegida(p.rama)) decir(null, `La rama de un proceso no puede ser ${p.rama}: la fábrica nunca empuja a una protegida.`);
  } else if (empuja) decir(null, "Tiene un push y no dice qué rama empuja (rama).");
  for (const x of p.pasos) if (x.tipo === "push" && x.prContra && p.rama && x.prContra === p.rama) decir(x.linea, `El PR iría de ${p.rama} contra ${p.rama}: contra otra rama, como main.`);
  for (const m of p.malas) decir(m.linea, `No es un paso: van como «- [tipo] qué · opción», con tipo ${TIPOS_DE_PASO.join(", ")}.`);
  if (!p.pasos.length) decir(null, "No tiene pasos.");
  // El puntaje se compara con el de la vez anterior del mismo proceso: con dos, no se sabría cuál con cuál.
  for (const x of p.pasos.filter((y) => y.tipo === "evaluacion").slice(1)) decir(x.linea, "Un proceso lleva una sola evaluación: para otra, haz otro proceso.");
  // La fusión es la del PR que abrió el mismo proceso, y solo después de que pasó su integración continua.
  const fusiones = p.pasos.filter((y) => y.tipo === "fusion");
  for (const x of fusiones.slice(1)) decir(x.linea, "Un proceso fusiona una sola vez.");
  if (fusiones[0]) {
    const i = p.pasos.indexOf(fusiones[0]);
    const push = p.pasos.slice(0, i).findLastIndex((y) => y.tipo === "push" && y.prContra);
    if (push < 0) decir(fusiones[0].linea, "Una fusión va después de un push que abre su PR («- [push] y PR contra main»).");
    else if (!p.pasos.slice(push + 1, i).some((y) => y.tipo === "ci")) decir(fusiones[0].linea, "Una fusión va después de esperar la integración continua del commit («- [ci] …»), entre el push y ella.");
  }
  for (const x of p.pasos) for (const q of x.problemas) decir(x.linea, q);
  return problemas;
}

/**
 * Los pasos que no se pueden deshacer (`deshacer: —`): con alguno, el proceso no puede llegar
 * solo a producción, aunque él quite el clic. Pasar entero por el entorno de prueba se mira al
 * correrlo, no aquí.
 */
export const pasosSinDeshacer = (p: Proceso) => p.pasos.filter((x) => x.tipo === "comando" && x.deshacer === "").map((x) => x.linea);

/**
 * La plantilla del vigía de vulnerabilidades: un proceso de un solo paso, una vez al día. No nace
 * como borrador (no tiene comandos que cambiar), pero no corre solo hasta que él lo encienda.
 */
export function plantillaDelVigia(o: { nombreDeLinea: string }): string {
  return [
    "---",
    "id: vigia",
    `nombre: Vigía de vulnerabilidades de ${o.nombreDeLinea}`,
    "cuando: cada-dia          # cada-dia | cada-semana: corre solo si lo enciendes en la configuración",
    "---",
    "",
    "# Vigía de vulnerabilidades",
    "",
    "Revisa en OSV.dev las versiones exactas de los paquetes del proyecto (package-lock.json, los .csproj",
    "y los requirements.txt con ==). Solo salen nombres y versiones de paquetes públicos, nunca código.",
    "Si alguno tiene una vulnerabilidad conocida, deja en la Bandeja el pedido de actualizarlo.",
    "",
    "- [vulnerabilidades] los paquetes del proyecto · si falla: tarea",
    "",
  ].join("\n");
}

/**
 * La plantilla de la evaluación: corre el conjunto de prueba del proyecto y compara el puntaje con
 * el umbral y con la vez anterior. Nace como borrador y a mano: el comando es de ejemplo, y
 * correrla cada semana es decisión suya (`cuando: cada-semana` y encenderla en la configuración).
 */
export function plantillaDeEvaluacion(o: { nombreDeLinea: string }): string {
  return [
    "---",
    "id: evaluacion",
    `nombre: Evaluación de ${o.nombreDeLinea}`,
    "cuando: a-mano            # a-mano | cada-semana: cada semana corre solo si lo enciendes en la configuración",
    "borrador: si              # quítalo cuando el comando sea el de este proyecto: hasta entonces no corre",
    "---",
    "",
    "# Evaluación",
    "",
    "Corre el conjunto de prueba del proyecto y dice si empeoró respecto de la vez anterior: después de",
    "cambiar el modelo, el prompt o la infraestructura. El comando escribe su resultado en {resultado}",
    "(la misma ruta llega en la variable FABRICA_RESULTADO), fuera del repositorio, con esta forma:",
    "",
    '    { "puntaje": 0.87, "casos": 40, "fallidos": 5 }',
    "",
    "De ese archivo se toman solo esos tres números; lo demás no se lee. El paso falla si el puntaje",
    "queda bajo el umbral o baja más que la tolerancia respecto de la vez anterior (0.02 si no la dice).",
    "Un modelo en la nube necesita su clave: «clave: NOMBRE», que sale de COMPANIA_PROCESO_<LINEA>_NOMBRE",
    "en el .env.local de la aplicación. Un modelo local, como Ollama, no necesita ninguna.",
    "",
    "- [evaluacion] node evals/correr.mjs {resultado} · umbral 0.8 · tolerancia 0.02 · tope 30m · si falla: tarea",
    "",
  ].join("\n");
}

/**
 * La plantilla de un proceso: nace como borrador, a mano, con comandos de ejemplo que él cambia
 * por los de su proyecto. Mientras diga `borrador: si`, no corre.
 */
export function plantillaDeProceso(o: { nombreDeLinea: string; rama: string }): string {
  return [
    "---",
    "id: publicar",
    `nombre: Publicar ${o.nombreDeLinea} en prueba y en producción`,
    "cuando: a-mano            # a-mano | al-integrar | cada-dia | cada-semana",
    `rama: ${o.rama}`,
    "borrador: si              # quítalo cuando los comandos sean los de este proyecto: hasta entonces no corre",
    "---",
    "",
    "# Publicar",
    "",
    "Un paso por línea: «- [tipo] qué · opción». Tipos: push, ci, comando, salud, aprobacion, fusion y tarea.",
    "Opciones: «tope 2m», «deshacer: comando» (o «deshacer: —» si no cambia nada) y «si falla: tarea».",
    "Los comandos corren sin shell, en la raíz del repositorio; el código pone {commit}, {anterior} y {rama}.",
    "",
    "- [push] y PR contra main",
    "- [ci] la integración continua del commit · tope 30m",
    "- [comando] ./scripts/desplegar.sh prueba {commit} · tope 10m · deshacer: ./scripts/desplegar.sh prueba {anterior}",
    "- [salud] GET https://prueba.ejemplo.local/salud → 200 · tope 2m",
    "- [aprobacion] producción",
    "- [comando] ./scripts/desplegar.sh produccion {commit} · tope 10m · deshacer: ./scripts/desplegar.sh produccion {anterior}",
    "- [salud] GET https://ejemplo.local/salud → 200 · tope 2m · si falla: tarea",
    "",
  ].join("\n");
}
