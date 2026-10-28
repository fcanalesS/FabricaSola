import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import "../../../pruebas/entorno.ts";

const { carpetaDeSesiones, leerSesion, pasosDe, procesarSalidaDeRetoma, resumenDeSesion, retomarSesion, sesionesDelProyecto, engancharSesion, sesionEnganchada } = await import("./sesiones.ts");

const ID = "11111111-2222-3333-4444-555555555555";
const OTRA = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const linea = (d: Record<string, unknown>) => JSON.stringify(d);
const REGISTROS = [
  { type: "user", timestamp: "2026-10-20T10:00:00.000Z", cwd: "C:/p/caja", message: { role: "user", content: "Agrega el filtro por tienda." } },
  { type: "user", timestamp: "2026-10-20T10:00:01.000Z", isMeta: true, message: { content: "nota interna" } },
  { type: "user", timestamp: "2026-10-20T10:00:02.000Z", message: { content: "<command-name>/clear</command-name>" } },
  { type: "user", timestamp: "2026-10-20T10:00:03.000Z", origin: { kind: "peer" }, message: { content: "mensaje de otra sesión" } },
  { type: "assistant", timestamp: "2026-10-20T10:01:00.000Z", message: { content: [{ type: "thinking", thinking: "lo que pensó" }, { type: "text", text: "Lo agrego en Ventas." }, { type: "tool_use", name: "Edit", input: { file_path: "src/Ventas.cs", old_string: "secreto viejo", new_string: "secreto nuevo" } }] } },
  { type: "user", timestamp: "2026-10-20T10:01:30.000Z", message: { content: [{ type: "tool_result", content: "salida larga" }] } },
  { type: "assistant", timestamp: "2026-10-20T10:02:00.000Z", isSidechain: true, message: { content: [{ type: "text", text: "lo dijo un subagente" }] } },
  { type: "ai-title", aiTitle: "Filtro por tienda" },
  { type: "cost-state", totalCostUSD: 0.42 },
];

test("de una sesión van lo que él pidió, lo que Claude contestó y qué herramienta usó sobre qué; nada más", () => {
  assert.deepEqual(pasosDe(REGISTROS), [
    { ts: "2026-10-20T10:00:00.000Z", quien: "el", texto: "Agrega el filtro por tienda." },
    { ts: "2026-10-20T10:01:00.000Z", quien: "claude", texto: "Lo agrego en Ventas." },
    { ts: "2026-10-20T10:01:00.000Z", quien: "herramienta", texto: "Edit src/Ventas.cs" },
  ]);
  const r = resumenDeSesion(ID, REGISTROS, REGISTROS, new Date(Date.now() - 60_000), Date.now());
  assert.deepEqual([r.titulo, r.activa, r.deLaFabrica, r.cwd, r.costoUsd], ["Filtro por tienda", true, false, "C:/p/caja", 0.42]);
  assert.equal(resumenDeSesion(ID, [{ type: "user", message: { content: "/fabrica:correr F-001" } }], [], new Date(0), Date.now()).deLaFabrica, true);
  assert.equal(carpetaDeSesiones("C:\\proyectos\\caja", "/h/.claude"), path.join("/h/.claude", "projects", "C--proyectos-caja"));
});

test("las sesiones del proyecto se leen de la carpeta de Claude Code, la más reciente arriba; lo que no es una sesión no", async () => {
  const claude = mkdtempSync(path.join(os.tmpdir(), "claude-config-"));
  process.env.CLAUDE_CONFIG_DIR = claude;
  try {
    const raiz = path.join(os.tmpdir(), "un-proyecto");
    const dir = carpetaDeSesiones(raiz, claude);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${ID}.jsonl`), REGISTROS.map(linea).join("\n") + "\n");
    writeFileSync(path.join(dir, `${OTRA}.jsonl`), linea({ type: "user", timestamp: "2026-10-19T09:00:00.000Z", message: { content: "Otra cosa." } }) + "\n");
    writeFileSync(path.join(dir, "no-es-una-sesion.jsonl"), "{}\n");
    utimesSync(path.join(dir, `${OTRA}.jsonl`), new Date("2026-10-19T09:00:00Z"), new Date("2026-10-19T09:00:00Z"));
    const sesiones = await sesionesDelProyecto(raiz);
    assert.deepEqual(sesiones.map((s) => [s.id, s.titulo, s.activa]), [
      [ID, "Filtro por tienda", true],
      [OTRA, "Otra cosa.", false],
    ]);
    const leida = await leerSesion(raiz, ID, "2026-10-20T10:00:30.000Z");
    assert.deepEqual(leida?.pasos.map((p) => p.quien), ["claude", "herramienta"]);
    assert.equal(await leerSesion(raiz, "../../x"), null);

    // Engancharla vale para ese proyecto.
    engancharSesion(raiz, ID);
    assert.equal(sesionEnganchada(raiz), ID);
    assert.equal(sesionEnganchada("/otro"), null);
    engancharSesion(raiz, null);
    assert.equal(sesionEnganchada(raiz), null);

    // Sin la ruta de Claude Code no se retoma, y se dice cuál falta.
    delete process.env.COMPANIA_CLAUDE_CODE_BIN;
    await assert.rejects(retomarSesion(raiz, ID, "Sigue."), /COMPANIA_CLAUDE_CODE_BIN/);
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR;
  }
});

test("de la salida de Claude Code al retomar salen lo que dice, la copia si siguió en otra, el resultado y lo que costó", () => {
  const r = { sesion: ID, copia: null, estado: "corriendo" as const, inicio: "", lineas: [], resultado: null, costoUsd: null } as Parameters<typeof procesarSalidaDeRetoma>[0];
  procesarSalidaDeRetoma(r, linea({ type: "system", subtype: "init", session_id: OTRA }));
  procesarSalidaDeRetoma(r, linea({ type: "assistant", message: { content: [{ type: "text", text: "Listo, agregué la prueba." }, { type: "tool_use", name: "Bash", input: { command: "dotnet test" } }] } }));
  procesarSalidaDeRetoma(r, "no es json");
  procesarSalidaDeRetoma(r, linea({ type: "result", result: "Hecho.", total_cost_usd: 0.07, is_error: false }));
  assert.deepEqual(r, {
    sesion: ID,
    copia: OTRA,
    estado: "terminada",
    inicio: "",
    lineas: [
      { tipo: "texto", texto: "Listo, agregué la prueba." },
      { tipo: "herramienta", texto: "Bash dotnet test" },
    ],
    resultado: "Hecho.",
    costoUsd: 0.07,
  });
});
