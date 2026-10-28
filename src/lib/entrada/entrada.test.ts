import assert from "node:assert/strict";
import { test } from "node:test";
import { abrirBaseDeDatos } from "../datos.ts";
import { elemento, elementos, guardarBorrador, ignorarCambio, loAgregado, marcarPasado, recibirIssue, TEXTO_MAX, type IssueLeido } from "./bandeja.ts";
import { agregarFuente, datosDeFuente, esVariableDeFuente, estadoDe, reposDesde, servidorDesde, tokenDe, variablesDeFuente, vistaDeFuente, type DatosDeFuente } from "./fuentes.ts";
import { leTocaLeer } from "./lector.ts";
import { pedidoDeLaPeticion, peticionDesde } from "./peticion.ts";
import { issuesDeGitHub, issuesDeGitLab } from "./proveedores.ts";

const LINEAS = ["pos-tiendas", "saludos"];

test("la petición revisa cada campo y dice cuál está mal", () => {
  const mal = peticionDesde({ linea: "POS Tiendas", titulo: "x".repeat(81), que: "  ", criterios: ["a"], dependeDe: ["F-1", "rm -rf"] });
  assert.ok("errores" in mal);
  assert.deepEqual(Object.keys(mal.errores).sort(), ["dependeDe", "linea", "que", "titulo"]);
  assert.ok("errores" in peticionDesde({ linea: "pos", titulo: "a", que: "b", destino: "otro" }));
  assert.ok("errores" in peticionDesde({ linea: "pos", titulo: "a", que: "b", criterios: Array.from({ length: 21 }, () => "c") }));

  const bien = peticionDesde({ linea: "pos-tiendas", titulo: "  Exportar\n el stock  ", que: "Que baje el stock.\r\n\u0007Para el conteo.", criterios: ["Hay un botón.", "", "Trae solo su tienda."], dependeDe: ["f-004", "F-004"] });
  assert.ok("peticion" in bien);
  assert.equal(bien.peticion.titulo, "Exportar el stock");
  assert.equal(bien.peticion.que, "Que baje el stock.\nPara el conteo.");
  assert.deepEqual(bien.peticion.criterios, ["Hay un botón.", "Trae solo su tienda."]);
  assert.deepEqual(bien.peticion.dependeDe, ["F-004"]);
  assert.equal(bien.peticion.destino, "cola");
});

test("el pedido de la petición lleva sus secciones, y un título suyo no corta la sección Pedido", () => {
  const pedido = pedidoDeLaPeticion({ que: "## Contexto\nEl conteo de fin de mes.", criterios: ["# Hay un botón", "Trae solo su tienda."], fueraDeAlcance: "Excel.", archivos: "" });
  assert.doesNotMatch(pedido, /^## /m);
  assert.match(pedido, /^#### Contexto$/m);
  assert.match(pedido, /### Criterios de aceptación\n\n1\. Hay un botón\n2\. Trae solo su tienda\./);
  assert.match(pedido, /### Fuera de alcance\n\nExcel\./);
  assert.doesNotMatch(pedido, /Archivos o zonas/);
});

test("una fuente solo puede usar una variable FACTORIA_FUENTE_…_TOKEN: nunca una clave de IA", () => {
  assert.equal(esVariableDeFuente("FACTORIA_FUENTE_GITHUB_TOKEN"), true);
  assert.equal(esVariableDeFuente("FACTORIA_FUENTE_GITLAB_EMPRESA_TOKEN"), true);
  for (const otra of ["FACTORIA_CLAUDE_API_KEY", "ANTHROPIC_API_KEY", "FACTORIA_FUENTE__TOKEN", "FACTORIA_FUENTE_github_TOKEN", "FACTORIA_FUENTE_X_TOKEN_Y", "TYPESAFE_AI_KEY"]) {
    assert.equal(esVariableDeFuente(otra), false, otra);
    assert.throws(() => datosDeFuente({ proveedor: "github", nombre: "X", variable: otra, etiqueta: "fabrica", repos: [] }, LINEAS), /FACTORIA_FUENTE_<NOMBRE>_TOKEN/);
  }
  // Aunque alguien cambie la fila a mano, `tokenDe` no lee otra clave.
  assert.equal(tokenDe({ variable: "FACTORIA_CLAUDE_API_KEY" }, { FACTORIA_CLAUDE_API_KEY: "sk-de-mentira" }), null);
  assert.equal(tokenDe({ variable: "FACTORIA_FUENTE_GITHUB_TOKEN" }, { FACTORIA_FUENTE_GITHUB_TOKEN: " gh-de-mentira " }), "gh-de-mentira");
  // De las variables se dan los nombres, nunca los valores, y solo las de fuente.
  assert.deepEqual(variablesDeFuente({ FACTORIA_FUENTE_B_TOKEN: "x", FACTORIA_FUENTE_A_TOKEN: "y", FACTORIA_FUENTE_VACIA_TOKEN: " ", FACTORIA_CLAUDE_API_KEY: "z" }), ["FACTORIA_FUENTE_A_TOKEN", "FACTORIA_FUENTE_B_TOKEN"]);
});

test("un servidor propio va por https, sin usuario ni clave en la dirección", () => {
  assert.equal(servidorDesde("https://gitlab.empresa.cl/"), "https://gitlab.empresa.cl");
  assert.equal(servidorDesde("https://git.empresa.cl/gitlab"), "https://git.empresa.cl/gitlab");
  assert.throws(() => servidorDesde("http://gitlab.empresa.cl"), /https/);
  assert.throws(() => servidorDesde("https://yo:clave@gitlab.empresa.cl"), /usuario ni clave/);
  assert.throws(() => servidorDesde("https://gitlab.empresa.cl/?x=1"), /sin «\?»/);
  assert.throws(() => servidorDesde("no es una dirección"), /no es válida/);
});

test("los repositorios van a una línea que existe, una sola vez cada uno", () => {
  assert.deepEqual(reposDesde("github", [{ repo: "/fcanalesS/pos-tiendas/", linea: "pos-tiendas" }], LINEAS), [{ repo: "fcanalesS/pos-tiendas", linea: "pos-tiendas" }]);
  assert.deepEqual(reposDesde("gitlab", [{ repo: "atalaya/sub/hud", linea: "saludos" }], LINEAS), [{ repo: "atalaya/sub/hud", linea: "saludos" }]);
  assert.throws(() => reposDesde("github", [{ repo: "a/b/c", linea: "saludos" }], LINEAS), /no es un repositorio/);
  assert.throws(() => reposDesde("github", [{ repo: "../x", linea: "saludos" }], LINEAS), /no es un repositorio/);
  assert.throws(() => reposDesde("github", [{ repo: "a/b", linea: "otra" }], LINEAS), /No hay ninguna línea/);
  assert.throws(() => reposDesde("github", [{ repo: "a/b", linea: "saludos" }, { repo: "A/B", linea: "saludos" }], LINEAS), /dos veces/);
});

test("la vista de una fuente dice si el token está, sin traerlo, y una sin token no lee", () => {
  const db = abrirBaseDeDatos(":memory:");
  const datos: DatosDeFuente = { proveedor: "github", servidor: null, nombre: "GitHub", variable: "FACTORIA_FUENTE_GITHUB_TOKEN", regla: "suyos", etiqueta: "fabrica", cadaMin: 5, repos: [] };
  const f = agregarFuente(db, datos);
  assert.throws(() => agregarFuente(db, { ...datos, nombre: "Otra" }), /ya la usa otra conexión/);
  const conToken = { FACTORIA_FUENTE_GITHUB_TOKEN: "gh-de-mentira" };
  const vista = vistaDeFuente(f, conToken);
  assert.equal(vista.tieneToken, true);
  assert.doesNotMatch(JSON.stringify(vista), /gh-de-mentira/);
  assert.equal(estadoDe(f, {}), "falta_token");
  assert.equal(estadoDe({ ...f, encendida: false }, conToken), "apagada");
  assert.equal(leTocaLeer({ ...f, estado: "rechazado" }, Date.now(), true), false);
  assert.equal(leTocaLeer({ ...f, leida: 1_000, cadaMin: 5 }, 1_000 + 4 * 60_000), false);
  assert.equal(leTocaLeer({ ...f, leida: 1_000, cadaMin: 5 }, 1_000 + 5 * 60_000), true);
  assert.equal(leTocaLeer({ ...f, leida: 1_000, cadaMin: 0 }, 1_000 + 999 * 60_000), false);
});

test("de GitHub se leen los issues y no los pull requests; de GitLab, por su iid", () => {
  const gh = issuesDeGitHub(
    [
      { number: 132, title: "Ticket promedio", body: "Por cajero.", user: { login: "fcanalesS" }, labels: [{ name: "fabrica" }, "reportes"], created_at: "c", updated_at: "u" },
      { number: 133, title: "Un PR", body: "", user: { login: "x" }, labels: [], pull_request: {} },
      { title: "sin número" },
    ],
    "fcanalesS/pos-tiendas",
  );
  assert.deepEqual(gh, [{ ref: "fcanalesS/pos-tiendas#132", repo: "fcanalesS/pos-tiendas", titulo: "Ticket promedio", texto: "Por cajero.", autor: "fcanalesS", etiquetas: ["fabrica", "reportes"], creado: "c", cambiado: "u" }]);
  const gl = issuesDeGitLab([{ iid: 47, title: "Brújula", description: null, author: { username: "jvaldes" }, labels: ["fabrica", 3] }], "atalaya/hud");
  assert.deepEqual(gl.map((i) => [i.ref, i.texto, i.autor, i.etiquetas]), [["atalaya/hud#47", "", "jvaldes", ["fabrica"]]]);
  assert.deepEqual(issuesDeGitHub({ message: "Bad credentials" }, "a/b"), []);
});

const issue = (cambios: Partial<IssueLeido> = {}): IssueLeido => ({ ref: "a/b#1", repo: "a/b", titulo: "Algo", texto: "Primera línea.", autor: "fcanalesS", etiquetas: ["fabrica"], creado: "c", cambiado: "u", ...cambios });

test("la Bandeja: un issue entra una vez; si cambia antes de pasar se actualiza, y después vuelve como cambio", () => {
  const db = abrirBaseDeDatos(":memory:");
  assert.equal(recibirIssue(db, 1, issue(), { linea: "pos-tiendas", esSuyo: true, ahora: 1 }), "nuevo");
  assert.equal(recibirIssue(db, 1, issue(), { linea: "pos-tiendas", esSuyo: true, ahora: 2 }), "igual");
  assert.equal(recibirIssue(db, 1, issue({ texto: "Primera línea, corregida." }), { linea: "pos-tiendas", esSuyo: true, ahora: 3 }), "actualizado");
  const [e] = elementos(db);
  assert.equal(e!.estado, "nuevo");
  marcarPasado(db, e!.id, { tarea: "F-001", linea: "pos-tiendas" });
  assert.equal(recibirIssue(db, 1, issue({ texto: "Primera línea, corregida.\nTambién el código de la tienda." }), { linea: "pos-tiendas", esSuyo: true, ahora: 4 }), "cambio");
  const cambiado = elemento(db, e!.id)!;
  assert.equal(cambiado.estado, "cambio");
  assert.equal(loAgregado(cambiado.textoPasado!, cambiado.texto), "También el código de la tienda.");
  ignorarCambio(db, e!.id);
  assert.equal(elemento(db, e!.id)!.estado, "pasado");
  // El mismo número en otra fuente es otro elemento.
  assert.equal(recibirIssue(db, 2, issue(), { linea: "saludos", esSuyo: false, ahora: 5 }), "nuevo");
  // Un issue enorme entra recortado.
  recibirIssue(db, 1, issue({ ref: "a/b#2", texto: "x".repeat(TEXTO_MAX + 500) }), { linea: "pos-tiendas", esSuyo: true, ahora: 6 });
  assert.ok(elementos(db).find((x) => x.ref === "a/b#2")!.texto.length <= TEXTO_MAX + 1);
  // Un borrador del formulario es suyo y no tiene fuente.
  const b = elemento(db, guardarBorrador(db, { linea: "saludos", titulo: "Borrador", pedido: "Algo.", ahora: 7 }))!;
  assert.deepEqual([b.fuente, b.esSuyo, b.estado], [null, true, "nuevo"]);
});
