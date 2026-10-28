import assert from "node:assert/strict";
import { test } from "node:test";
import { NOTAS_MAX, reglasDesde, revisarNotas, revisarReglas } from "./reglas.ts";

test("las reglas se leen con los mismos valores por defecto que el plugin, y lo que no vale queda en el suyo", () => {
  assert.deepEqual(reglasDesde({}), { aprobacion: "agente", integracion: "auto", max_vueltas: "3", ui: "auto", jev: "auto", jev_control: "4", lint_extensiones: "", sql: "", worktrees: "" });
  const r = reglasDesde({ aprobacion: "ambas", integracion: "manual", max_vueltas: "99", ui: "a veces", jev: "no", jev_control: "-3", lint_extensiones: " .js,.ts ", worktrees: "../x-fabrica" });
  assert.deepEqual([r.aprobacion, r.integracion, r.max_vueltas, r.ui, r.jev, r.jev_control, r.lint_extensiones, r.worktrees], ["ambas", "manual", "10", "auto", "no", "0", ".js,.ts", "../x-fabrica"]);
});

test("solo pasan reglas conocidas, con sus valores; y las credenciales no van en el comando de los .sql", () => {
  assert.deepEqual(revisarReglas({ aprobacion: "agente", max_vueltas: 5, sql: " sqlcmd -S . -d prueba -E -b -i {archivos} " }), {
    reglas: { aprobacion: "agente", max_vueltas: "5", sql: "sqlcmd -S . -d prueba -E -b -i {archivos}" },
  });
  for (const malo of [
    { aprobacion: "nadie" },
    { max_vueltas: 0 },
    { max_vueltas: 2.5 },
    { jev_control: 51 },
    { build: "exit 0" },
    { paralelo_max: 3 },
    { worktrees: "../x\nrm -rf /" },
    { sql: "sqlcmd -S . -U sa -P secreto -i {archivos}" },
    { sql: "sqlcmd -S . -Q \"Server=.;User Id=sa;Password=x\"" },
    { ui: null },
  ]) {
    assert.ok("error" in revisarReglas(malo), JSON.stringify(malo));
  }
});

test("las notas son texto y tienen tope", () => {
  assert.deepEqual(revisarNotas("  Las vistas van en Views/.\r\n---\nNo tocar Legacy/.  "), { notas: "Las vistas van en Views/.\n---\nNo tocar Legacy/." });
  assert.ok("error" in revisarNotas(7));
  assert.ok("error" in revisarNotas("x".repeat(NOTAS_MAX + 1)));
});
