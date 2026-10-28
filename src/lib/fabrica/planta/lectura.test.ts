import assert from "node:assert/strict";
import { test } from "node:test";
import { tareaDesde, tareaNueva } from "../motor/formato.ts";
import type { Tarea } from "../motor/tipos.ts";
import { eligeModeloDeSpec, etapaDe, filtrarTarjetas, numerosDeLaPlanta, origenDe, porcentajeALaPrimera, stackDe, teEspera, type TarjetaDeLaPlanta } from "./lectura.ts";

const tarea = (t: Partial<Tarea>): Tarea => ({ id: "F-001", titulo: "Una", estado: "pendiente", vueltas: 0, verificacion: "pendiente", aprobacionAgente: "pendiente", dependeDe: [], archivo: "x.md", ...t });
const AHORA = Date.parse("2026-10-26T15:00:00");

test("la etapa de una tarea: la detenida, en la etapa de la que vino; la hecha, solo si fue hoy", () => {
  assert.equal(etapaDe(tarea({ estado: "revision" }), { ahora: AHORA }), "revision");
  assert.equal(etapaDe(tarea({ estado: "necesita-humano" }), { detenidaDesde: "verificacion", ahora: AHORA }), "verificacion");
  // Sin saber de dónde vino, o si vino de algo que no es una etapa de trabajo: Pendiente.
  assert.equal(etapaDe(tarea({ estado: "necesita-humano" }), { ahora: AHORA }), "pendiente");
  assert.equal(etapaDe(tarea({ estado: "necesita-humano" }), { detenidaDesde: "pendiente", ahora: AHORA }), "pendiente");
  assert.equal(etapaDe(tarea({ estado: "hecho" }), { hechaEn: "2026-10-26T09:00:00", ahora: AHORA }), "hechas");
  assert.equal(etapaDe(tarea({ estado: "hecho" }), { hechaEn: "2026-10-25T23:00:00", ahora: AHORA }), null);
  assert.equal(etapaDe(tarea({ estado: "hecho" }), { ahora: AHORA }), null);
  assert.equal(etapaDe(tarea({ estado: "descartada" }), { ahora: AHORA }), null);
});

test("qué lo espera: la pregunta sin respuesta, y el veredicto solo si la línea se lo pide y no lo dio", () => {
  assert.equal(teEspera(tarea({ estado: "necesita-humano" }), null), "pregunta");
  assert.equal(teEspera(tarea({ estado: "necesita-humano", respuesta: { texto: "sí", por: "él", fecha: "x" } }), null), null);
  assert.equal(teEspera(tarea({ estado: "aprobacion" }), { aprobacion: "ambas" }), "veredicto");
  assert.equal(teEspera(tarea({ estado: "aprobacion" }), { aprobacion: "externa" }), "veredicto");
  assert.equal(teEspera(tarea({ estado: "aprobacion" }), { aprobacion: "agente" }), null);
  assert.equal(teEspera(tarea({ estado: "aprobacion", veredictoExterno: { veredicto: "aprobada", motivo: "", por: "él" } }), { aprobacion: "ambas" }), null);
  // Una grande ya aprobada por el agente espera su prueba aunque la línea no pida su veredicto.
  const grande = { clase: "grande" as const, motivo: "toca lo delicado", por: "regla" as const };
  assert.equal(teEspera(tarea({ estado: "aprobacion", aprobacionAgente: "aprobada", integracion: grande }), { aprobacion: "agente" }), "veredicto");
  assert.equal(teEspera(tarea({ estado: "aprobacion", aprobacionAgente: "pendiente", integracion: grande }), { aprobacion: "agente" }), null);
  assert.equal(teEspera(tarea({ estado: "aprobacion", aprobacionAgente: "aprobada", integracion: grande, veredictoExterno: { veredicto: "aprobada", motivo: "", por: "él" } }), { aprobacion: "agente" }), null);
  assert.equal(teEspera(tarea({ estado: "aprobacion", aprobacionAgente: "aprobada", integracion: { ...grande, clase: "sencilla" } }), { aprobacion: "agente" }), null);
});

test("de dónde entró: el issue con su número, sin la dirección; el resto por su nombre", () => {
  assert.deepEqual(origenDe({ origenEntrada: "github:dueno/repo#131" }), { origen: "github", texto: "GitHub #131" });
  assert.deepEqual(origenDe({ origenEntrada: "gitlab:grupo/sub/repo#44" }), { origen: "gitlab", texto: "GitLab #44" });
  assert.deepEqual(origenDe({ origenEntrada: "github:algo raro" }), { origen: "github", texto: "GitHub" });
  assert.deepEqual(origenDe({ origenEntrada: "formulario" }), { origen: "formulario", texto: "Formulario" });
  assert.deepEqual(origenDe({ documento: "factory/requerimientos/a.md" }), { origen: "documento", texto: "Documento" });
  // La deuda manda: nació de un hallazgo aunque haya entrado por otro lado.
  assert.deepEqual(origenDe({ origenHallazgo: "0123456789abcdef", origenEntrada: "formulario" }), { origen: "deuda", texto: "Deuda" });
  assert.deepEqual(origenDe({}), { origen: "otro", texto: "A mano" });
});

test("el stack sale de la ficha: framework, lenguaje, runtime y base de datos, sin lo que se prohíbe", () => {
  const regla = (tema: string, texto: string, prohibe = false) => ({ tema, texto, prohibe });
  assert.equal(stackDe([regla("base-de-datos", "SQL Server."), regla("runtime", ".NET 10"), regla("base-de-datos", "MongoDB", true), regla("pruebas", "xUnit")]), ".NET 10 · SQL Server");
  assert.equal(stackDe([regla("pruebas", "xUnit")]), null);
  assert.equal(stackDe([]), null);
});

test("los números de la planta suman los de cada línea leída; «a la primera» se calcula sobre todas", () => {
  const numeros = (abiertas: number, teEsperan: number, hechasHoy: number, aLaPrimera: { sinVolver: number; hechas: number } | null, esperaMasVieja: string | null) => ({
    abiertas,
    teEsperan,
    hechasHoy,
    aLaPrimera,
    esperaMasVieja,
    porEtapa: { pendiente: 0, spec: 0, construccion: 0, revision: 0, verificacion: 0, aprobacion: 0, hechas: hechasHoy },
  });
  const p = numerosDeLaPlanta([
    { estado: "corriendo", numeros: numeros(7, 2, 2, { sinVolver: 4, hechas: 5 }, "2026-10-26T10:00:00Z"), gastoHoyUsd: 1.12 },
    { estado: "quieta", numeros: numeros(2, 1, 1, { sinVolver: 3, hechas: 3 }, "2026-10-26T08:00:00Z"), gastoHoyUsd: 0.14 },
    { estado: "error", numeros: null, gastoHoyUsd: 0 },
  ]);
  assert.deepEqual([p.lineas, p.corriendo, p.abiertas, p.teEsperan, p.hechasHoy], [3, 1, 9, 3, 3]);
  assert.deepEqual(p.aLaPrimera, { sinVolver: 7, hechas: 8 });
  assert.equal(porcentajeALaPrimera(p.aLaPrimera), 88);
  assert.equal(p.esperaMasVieja, "2026-10-26T08:00:00Z");
  assert.ok(Math.abs(p.gastoHoyUsd - 1.26) < 1e-9);
  assert.equal(porcentajeALaPrimera(null), null);
});

test("el filtro de todas las tareas: por línea, por origen, por texto sin tildes y las que te esperan", () => {
  const t = (linea: string, id: string, titulo: string, extra: Partial<TarjetaDeLaPlanta> = {}): TarjetaDeLaPlanta & { linea: string } => ({
    linea,
    id,
    titulo,
    tituloAjeno: false,
    estado: "pendiente",
    etapa: "pendiente",
    espera: null,
    desde: null,
    origen: "otro",
    origenTexto: "A mano",
    vueltas: 0,
    rama: `fabrica/${id}`,
    hechaEn: null,
    dependeDe: [],
    motivo: null,
    modeloSpec: null,
    eligeModeloDeSpec: true,
    modeloConstruccion: null,
    eligeModeloDeConstruccion: true,
    pideSuClic: null,
    integracion: null,
    debioEsperar: false,
    ...extra,
  });
  const todas = [
    t("pos", "F-001", "Exportación a CSV", { origen: "github", origenTexto: "GitHub #128", espera: "pregunta" }),
    t("pos", "F-002", "Filtro por tienda"),
    t("bodega", "F-001", "Ajuste por merma", { origen: "formulario", origenTexto: "Formulario" }),
  ];
  const ids = (f: Parameters<typeof filtrarTarjetas>[1]) => filtrarTarjetas(todas, f).map((x) => `${x.linea}/${x.id}`);
  assert.deepEqual(ids({}), ["pos/F-001", "pos/F-002", "bodega/F-001"]);
  assert.deepEqual(ids({ linea: "bodega" }), ["bodega/F-001"]);
  assert.deepEqual(ids({ origen: "github" }), ["pos/F-001"]);
  assert.deepEqual(ids({ texto: "EXPORTACION" }), ["pos/F-001"]);
  assert.deepEqual(ids({ texto: "#128" }), ["pos/F-001"]);
  assert.deepEqual(ids({ texto: "fabrica/F-002" }), ["pos/F-002"]);
  assert.deepEqual(ids({ soloEsperan: true }), ["pos/F-001"]);
  assert.deepEqual(ids({ texto: "   " }), ["pos/F-001", "pos/F-002", "bodega/F-001"]);
});

test("el modelo de la spec se elige antes de escribirla, o cuando se detuvo a preguntar antes de construir", () => {
  assert.equal(eligeModeloDeSpec("pendiente", null), true);
  assert.equal(eligeModeloDeSpec("necesita-humano", "spec"), true);
  assert.equal(eligeModeloDeSpec("necesita-humano", "pendiente"), true);
  assert.equal(eligeModeloDeSpec("necesita-humano", "construccion"), false);
  assert.equal(eligeModeloDeSpec("necesita-humano", null), false);
  for (const estado of ["spec", "construccion", "revision", "aprobacion", "hecho", "descartada"] as const) assert.equal(eligeModeloDeSpec(estado, null), false, estado);
});

test("una tarea nueva lleva su modelo solo si es uno conocido, y se lee de vuelta", () => {
  const con = tareaNueva("F-001", "Algo", "Pedido.", "2026-10-26T10:00:00Z", "prueba", { modeloSpec: "fable" });
  assert.equal(tareaDesde(con, "F-001-algo.md")?.modeloSpec, "fable");
  const otro = tareaNueva("F-002", "Algo", "Pedido.", "2026-10-26T10:00:00Z", "prueba", { modeloSpec: "gpt-5\nestado: hecho" as never });
  assert.doesNotMatch(otro, /modelo_spec|estado: hecho/);
  assert.equal(tareaDesde(otro, "F-002-algo.md")?.modeloSpec, undefined);
  assert.equal(tareaDesde("---\nid: F-003\nmodelo_spec: gpt-5\n---\n", "F-003.md")?.modeloSpec, undefined);
});
