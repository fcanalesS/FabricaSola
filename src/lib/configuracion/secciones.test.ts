import assert from "node:assert/strict";
import { test } from "node:test";
import { parteDeLaFabrica, seccionDe } from "./secciones.ts";

const conFabrica = ["equipo", "fabrica", "fuera", "gasto"];
const sinFabrica = ["equipo", "fuera", "gasto"];

test("se ve la sección que dice la dirección; sin una que exista, la primera", () => {
  assert.equal(seccionDe("gasto", conFabrica), "gasto");
  assert.equal(seccionDe("", conFabrica), "equipo");
  assert.equal(seccionDe("no-existe", conFabrica), "equipo");
  // Las partes de la fábrica, y el «#comandos» del tablero, abren la fábrica.
  assert.equal(seccionDe("fabrica-agentes", conFabrica), "fabrica");
  assert.equal(seccionDe("comandos", conFabrica), "fabrica");
  // En casa no hay fábrica: se ve la primera.
  assert.equal(seccionDe("fabrica-agentes", sinFabrica), "equipo");
});

test("de la fábrica se ve la parte que dice la dirección; «comandos» es del proyecto", () => {
  assert.equal(parteDeLaFabrica("fabrica-agentes"), "agentes");
  assert.equal(parteDeLaFabrica("fabrica-avisos"), "avisos");
  assert.equal(parteDeLaFabrica("comandos"), "proyecto");
  assert.equal(parteDeLaFabrica("fabrica"), "proyecto");
  assert.equal(parteDeLaFabrica("fabrica-inventada"), "proyecto");
});
