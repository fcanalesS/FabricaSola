// Lectura del formato de factory/: frontmatter plano `clave: valor`. Es la misma regla que usa
// el plugin (fabrica/hooks/tareas.ts); si cambia allá, cambia aquí. Es lógica pura.
import { esModeloDeRol, modeloDeRolDesde, type ModeloDeRol } from "../modelos.ts";
import { esEstado, type Config, type Evento, type Tarea, type Veredicto } from "./tipos.ts";

export type Datos = Record<string, string>

export function partir(texto: string): { datos: Datos; cuerpo: string } {
  const t = texto.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(t);
  if (!m) return { datos: {}, cuerpo: t };
  const datos: Datos = {};
  for (const linea of (m[1] ?? "").split("\n")) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(linea);
    if (!kv) continue;
    let v = (kv[2] ?? "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      try {
        v = v.startsWith('"') ? (JSON.parse(v) as string) : v.slice(1, -1);
      } catch {
        v = v.slice(1, -1);
      }
    }
    datos[kv[1]!] = v;
  }
  return { datos, cuerpo: m[2] ?? "" };
}

const necesitaComillas = (v: string) => v === "" || /[:#"'\n]|^\s|\s$/.test(v);

export function unir(datos: Datos, cuerpo: string): string {
  const lineas = Object.entries(datos).map(
    ([k, v]) => `${k}: ${necesitaComillas(v) ? JSON.stringify(v.replace(/\n/g, " ")) : v}`
  );
  return `---\n${lineas.join("\n")}\n---\n${cuerpo.startsWith("\n") ? cuerpo : "\n" + cuerpo}`;
}

const entero = (v: string | undefined, def: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : def;
};

export function configDesde(texto: string): Config {
  const d = partir(texto).datos;
  const ap = d.aprobacion;
  return {
    build: d.build ?? "",
    test: d.test ?? "",
    lint: d.lint ?? "",
    ramaBase: d.rama_base || "main",
    ramaTrabajo: (d.rama_trabajo ?? "").trim(),
    maxVueltas: entero(d.max_vueltas, 3),
    paraleloMax: entero(d.paralelo_max, 2),
    ui: d.ui || "auto",
    aprobacion: ap === "externa" || ap === "ambas" ? ap : "agente",
    puenteUrl: d.puente_url ?? "",
    integracion: d.integracion === "manual" ? "manual" : "auto",
    modeloSpec: modeloDeRolDesde(d.modelo_spec, "spec"),
    modeloConstruccion: modeloDeRolDesde(d.modelo_construccion, "construccion"),
    modeloAprobacion: modeloDeRolDesde(d.modelo_aprobacion, "aprobacion"),
  };
}

/** Los ids de tarea de un texto (`F-009, F-007`), sin repetir. La misma regla del plugin. */
export const idsEn = (texto: string): string[] => [...new Set(texto.match(/\bF-\d+\b/g) ?? [])];

/** El ciclo que formarían las dependencias de un grafo (`id → de quiénes depende`), o `null`. La misma regla del plugin. */
export function cicloEn(grafo: ReadonlyMap<string, readonly string[]>): string[] | null {
  const estado = new Map<string, "visitando" | "listo">();
  const camino: string[] = [];
  const buscar = (id: string): string[] | null => {
    if (estado.get(id) === "listo") return null;
    if (estado.get(id) === "visitando") return [...camino.slice(camino.indexOf(id)), id];
    estado.set(id, "visitando");
    camino.push(id);
    for (const sig of grafo.get(id) ?? []) {
      const c = buscar(sig);
      if (c) return c;
    }
    camino.pop();
    estado.set(id, "listo");
    return null;
  };
  for (const id of grafo.keys()) {
    const c = buscar(id);
    if (c) return c;
  }
  return null;
}

const verif = (v?: string): Tarea["verificacion"] => (v === "ok" || v === "fallo" ? v : "pendiente");
const aprob = (v?: string): Tarea["aprobacionAgente"] =>
  v === "aprobada" || v === "rechazada" ? v : "pendiente";

/** La marca que deja `crearTareas` en el pedido de una tarea que salió de un documento de requerimientos. */
const DE_UN_DOCUMENTO = /_Documento de requerimientos: `(factory\/requerimientos\/[^`\s]{1,200})`_/;

/**
 * La clase de integración que dice la nota de un evento, como la escribe el mod al clasificar:
 * «integración: grande (toca lo delicado…)». `null` si la nota no es esa.
 */
export function claseEnNota(nota: string | undefined): "sencilla" | "grande" | null {
  const m = /^integración: (sencilla|grande)\b/.exec(nota ?? "");
  return m ? (m[1] as "sencilla" | "grande") : null;
}

export function tareaDesde(texto: string, archivo: string): Tarea | undefined {
  const { datos } = partir(texto);
  if (!datos.id) return undefined;
  const documento = DE_UN_DOCUMENTO.exec(texto)?.[1];
  return {
    id: datos.id,
    titulo: datos.titulo || datos.id,
    estado: esEstado(datos.estado) ? datos.estado : "pendiente",
    vueltas: entero(datos.vueltas, 0),
    verificacion: verif(datos.verificacion),
    aprobacionAgente: aprob(datos.aprobacion_agente),
    ...(datos.pruebas === "omitidas" || datos.pruebas === "corridas" || datos.pruebas === "innecesarias" ? { pruebas: datos.pruebas } : {}),
    rama: datos.rama || undefined,
    worktree: datos.worktree || undefined,
    motivo: datos.motivo || undefined,
    creada: datos.creada || undefined,
    actualizada: datos.actualizada || undefined,
    enAprobacionDesde: datos.en_aprobacion_desde || undefined,
    ramaOrigen: datos.rama_origen || undefined,
    integrada: datos.integrada || undefined,
    dependeDe: idsEn(datos.depende_de ?? ""),
    tomadaPor: datos.tomada_por || undefined,
    tomadaHasta: datos.tomada_hasta || undefined,
    ...(Number(datos.sql_sin_verificar) > 0 ? { sqlSinVerificar: Number(datos.sql_sin_verificar) } : {}),
    origenHallazgo: datos.origen_hallazgo || undefined,
    origenEntrada: datos.origen_entrada || undefined,
    ...(datos.titulo_ajeno === "si" ? { tituloAjeno: true } : {}),
    ...(documento ? { documento } : {}),
    ...(esModeloDeRol(datos.modelo_spec) ? { modeloSpec: datos.modelo_spec } : {}),
    ...(esModeloDeRol(datos.modelo_construccion) ? { modeloConstruccion: datos.modelo_construccion } : {}),
    ...(datos.salida === "tu-clic" ? { pideSuClic: (datos.salida_motivo ?? "").trim() } : {}),
    ...(datos.integracion_clase === "sencilla" || datos.integracion_clase === "grande" ? { integracion: { clase: datos.integracion_clase, motivo: (datos.integracion_motivo ?? "").trim(), por: datos.integracion_por === "jev" || datos.integracion_por === "regla" ? datos.integracion_por : "sin_jev" } } : {}),
    archivo,
  };
}

export function veredictoDesde(texto: string): { veredicto: Veredicto; motivo: string; por: string } | undefined {
  try {
    const j = JSON.parse(texto) as Record<string, unknown>;
    if (j.veredicto !== "aprobada" && j.veredicto !== "rechazada") return undefined;
    return { veredicto: j.veredicto, motivo: String(j.motivo ?? ""), por: String(j.por ?? "externo") };
  } catch {
    return undefined;
  }
}

export function eventosDesde(texto: string): Evento[] {
  return texto
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        const e = JSON.parse(l) as Evento;
        return esEstado(e.a) && typeof e.tarea === "string" ? [e] : [];
      } catch {
        return [];
      }
    });
}

/** Pone `clave: valor` en el frontmatter, conservando el resto del archivo. */
export function fijarClave(texto: string, clave: string, valor: string): string {
  const { datos, cuerpo } = partir(texto);
  return unir({ ...datos, [clave]: valor }, cuerpo);
}

export function siguienteId(ids: readonly string[]): string {
  const max = ids.reduce((m, id) => {
    const n = /^F-(\d+)$/.exec(id)?.[1];
    return n ? Math.max(m, Number(n)) : m;
  }, 0);
  return `F-${String(max + 1).padStart(3, "0")}`;
}

export function slug(titulo: string): string {
  return (
    titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "tarea"
  );
}

/**
 * Una tarea nueva en `pendiente`, con la misma plantilla que escribe el plugin. `dependeDe`: las
 * tareas que tienen que estar hechas e integradas antes. `origenHallazgo`: el hallazgo de deuda
 * del que nace, si nace de uno. `origenEntrada`: por dónde entró, si entró por la Entrada.
 * `tituloAjeno`: el título lo escribió otra persona.
 */
export function tareaNueva(
  id: string,
  titulo: string,
  pedido: string,
  ahora: string,
  origen: string,
  extra: { dependeDe?: readonly string[]; origenHallazgo?: string; origenEntrada?: string; tituloAjeno?: boolean; modeloSpec?: ModeloDeRol; modeloConstruccion?: ModeloDeRol } = {},
): string {
  const datos: Datos = {
    id,
    titulo,
    estado: "pendiente",
    vueltas: "0",
    verificacion: "pendiente",
    aprobacion_agente: "pendiente",
    rama: `fabrica/${id}`,
    worktree: "",
    motivo: "",
    ...(extra.dependeDe?.length ? { depende_de: extra.dependeDe.join(",") } : {}),
    ...(extra.origenHallazgo ? { origen_hallazgo: extra.origenHallazgo } : {}),
    // Una línea del frontmatter: sin saltos, para que nadie arme otra clave con el origen.
    ...(extra.origenEntrada ? { origen_entrada: extra.origenEntrada.replace(/[\r\n]+/g, " ").slice(0, 200) } : {}),
    ...(extra.tituloAjeno ? { titulo_ajeno: "si" } : {}),
    // Lo elige él en la petición; se valida aquí también, porque va al frontmatter.
    ...(esModeloDeRol(extra.modeloSpec) ? { modelo_spec: extra.modeloSpec } : {}),
    ...(esModeloDeRol(extra.modeloConstruccion) ? { modelo_construccion: extra.modeloConstruccion } : {}),
    creada: ahora,
    actualizada: ahora,
  };
  const cuerpo = [
    "",
    "## Pedido",
    "",
    pedido.trim() || titulo,
    "",
    "## Spec",
    "",
    "_(la escribe el agente de especificación)_",
    "",
    "## Hallazgos de revisión",
    "",
    "_(ninguno todavía)_",
    "",
    "## Veredicto",
    "",
    "_(pendiente)_",
    "",
    "## Para la memoria",
    "",
    "_(lo que se decidió y conviene recordar en otras tareas; lo anotan los agentes)_",
    "",
    "## Bitácora",
    "",
    `- ${ahora} · creada por ${origen}`,
    "",
  ].join("\n");
  return unir(datos, cuerpo);
}

export function anotar(cuerpo: string, linea: string): string {
  const marca = /^## Bitácora[ \t]*$/m;
  if (!marca.test(cuerpo)) return `${cuerpo.replace(/\s*$/, "")}\n\n## Bitácora\n\n- ${linea}\n`;
  const inicio = cuerpo.search(marca);
  const resto = cuerpo.slice(inicio + 1);
  const sig = resto.search(/^## /m);
  const fin = sig < 0 ? cuerpo.length : inicio + 1 + sig;
  const despues = cuerpo.slice(fin);
  return `${cuerpo.slice(0, fin).replace(/\s*$/, "")}\n- ${linea}\n${despues ? "\n" + despues : ""}`;
}

/** Inserta una entrada en `## Respuesta del humano`, creándola antes de la Bitácora. */
export function anotarRespuestaEn(cuerpo: string, linea: string): string {
  const marca = /^## Respuesta del humano[ \t]*$/m;
  if (marca.test(cuerpo)) {
    const inicio = cuerpo.search(marca);
    const resto = cuerpo.slice(inicio + 1);
    const sig = resto.search(/^## /m);
    const fin = sig < 0 ? cuerpo.length : inicio + 1 + sig;
    const despues = cuerpo.slice(fin);
    return `${cuerpo.slice(0, fin).replace(/\s*$/, "")}\n\n${linea}\n${despues ? "\n" + despues : ""}`;
  }
  const bit = cuerpo.search(/^## Bitácora[ \t]*$/m);
  const bloque = `## Respuesta del humano\n\n${linea}\n\n`;
  return bit < 0 ? `${cuerpo.replace(/\s*$/, "")}\n\n${bloque}` : cuerpo.slice(0, bit) + bloque + cuerpo.slice(bit);
}
