import assert from "node:assert/strict";
import { test } from "node:test";
import { leerProceso, pasosSinDeshacer, plantillaDeProceso, revisarProceso, saludDe, segundosDe } from "./formato.ts";

const PUBLICAR = `---
id: publicar
nombre: Publicar en prueba y en producción
cuando: al-integrar        # al-integrar | a-mano | cada-dia | cada-semana
rama: desarrollo
---

# Publicar

Lo que pasa después de integrar.

- [push] y PR contra main
- [ci] la integración continua del commit · tope 30m
- [comando] docker build -t pos:{commit} . · deshacer: —
- [comando] ./desplegar.sh prueba {commit} · deshacer: ./desplegar.sh prueba {anterior}
- [salud] GET https://prueba.pos.local/salud → 200 · tope 2m
- [aprobacion] producción
- [comando] ./desplegar.sh produccion {commit} · tope 10m · deshacer: ./desplegar.sh produccion {anterior}
- [salud] HEAD https://pos.local/salud -> 204 · tope 2m · si falla: tarea
`;

test("un proceso se lee paso por paso, con sus opciones y la línea de cada uno; el comentario del frontmatter no cuenta", () => {
  const p = leerProceso(PUBLICAR);
  assert.deepEqual([p.id, p.nombre, p.cuando, p.rama, p.borrador], ["publicar", "Publicar en prueba y en producción", "al-integrar", "desarrollo", false]);
  assert.deepEqual(
    p.pasos.map((x) => [x.linea, x.tipo, x.tope, x.deshacer, x.siFalla]),
    [
      [12, "push", null, null, null],
      [13, "ci", 1800, null, null],
      [14, "comando", null, "", null],
      [15, "comando", null, "./desplegar.sh prueba {anterior}", null],
      [16, "salud", 120, null, null],
      [17, "aprobacion", null, null, null],
      [18, "comando", 600, "./desplegar.sh produccion {anterior}", null],
      [19, "salud", 120, null, "tarea"],
    ],
  );
  assert.equal(p.pasos[0]!.prContra, "main");
  assert.equal(p.pasos[2]!.texto, "docker build -t pos:{commit} .");
  assert.deepEqual(p.pasos[7]!.salud, { metodo: "HEAD", url: "https://pos.local/salud", codigo: 204 });
  assert.deepEqual(p.malas, []);
  assert.deepEqual(revisarProceso(PUBLICAR, "publicar.md"), []);
  // El docker build dice que no se deshace: con él, producción no puede salir sola.
  assert.deepEqual(pasosSinDeshacer(p), [14]);
});

test("lo que no cumple se dice con su línea: tipos, opciones, shell, marcas, deshacer y salud", () => {
  const malo = `---
id: publicar
nombre: Malo
cuando: a-mano
rama: desarrollo
---

- [desplegar] todo
- [comando] npm run build && npm run deploy · deshacer: —
- [comando] ./subir.sh {version}
- [comando] ./ok.sh · tope 3 dias · deshacer: ./ok.sh --atras
- [salud] https://pos.local/salud
- [ci] la integración · deshacer: nada
- [aprobacion]
- [comando] echo $HOME · deshacer: —
- [salud] GET ftp://pos.local → 200
- [push] la rama · tope 1m
- [ci] espera · si falla: reintentar
- una línea que no es un paso
`;
  const q = revisarProceso(malo, "publicar.md").map((x) => `${x.linea}: ${x.que}`);
  const tiene = (linea: number, texto: RegExp) => assert.ok(q.some((x) => x.startsWith(`${linea}: `) && texto.test(x)), `${linea} ${texto}\n${q.join("\n")}`);
  tiene(8, /«desplegar» no es un tipo de paso/);
  tiene(9, /algo de una shell/);
  tiene(10, /usa \{version\}, que el código no pone/);
  tiene(10, /declara cómo se deshace/);
  tiene(11, /no es un tope/);
  tiene(12, /GET https:\/\/… → 200/);
  tiene(13, /«deshacer» no va en un paso ci/);
  tiene(14, /Di qué se aprueba/);
  tiene(15, /algo de una shell/);
  tiene(16, /http:\/\/ o https:\/\//);
  tiene(17, /no lleva tope/);
  tiene(18, /«si falla: reintentar» no vale/);
  tiene(19, /No es un paso/);
});

test("el frontmatter: id igual al archivo, cuándo conocido, y nunca una rama protegida", () => {
  const con = (fm: string, pasos = "- [push] y PR contra main") => `---\n${fm}\n---\n\n${pasos}\n`;
  const que = (t: string, archivo = "publicar.md") => revisarProceso(t, archivo).map((x) => x.que);
  assert.match(que(con("id: publicar\nnombre: X\ncuando: a-mano\nrama: desarrollo"), "otro.md").join(), /el archivo se llama otro\.md/);
  assert.match(que(con("id: Publicar_1\nnombre: X\ncuando: a-mano\nrama: d")).join(), /va en minúsculas/);
  assert.match(que(con("id: publicar\nnombre: X\ncuando: siempre\nrama: d")).join(), /«cuando: siempre» no vale/);
  assert.match(que(con("id: publicar\nnombre: X\ncuando: a-mano\nrama: main")).join(), /no puede ser main/);
  assert.match(que(con("id: publicar\nnombre: X\ncuando: a-mano\nrama: Master")).join(), /no puede ser Master/);
  assert.match(que(con("id: publicar\nnombre: X\ncuando: a-mano")).join(), /Tiene un push y no dice qué rama/);
  // Sin push, la rama no hace falta.
  assert.deepEqual(que(con("id: vigia\nnombre: Vigía\ncuando: cada-dia", "- [comando] npm audit · deshacer: —"), "vigia.md"), []);
  assert.match(que(con("id: publicar\nnombre: X\ncuando: a-mano\nrama: d", "Sin pasos.")).join(), /No tiene pasos/);
  assert.match(que("- [push] y PR\n", "publicar.md").join(), /Le falta el frontmatter/);
  assert.match(que(con("id: publicar\nnombre: X\ncuando: a-mano\nrama: d").replaceAll("\n", "\r\n")).join(), /CRLF/);
});

test("la plantilla nace como borrador y cumple su propio formato", () => {
  const t = plantillaDeProceso({ nombreDeLinea: "pos-tiendas", rama: "desarrollo" });
  const p = leerProceso(t);
  assert.deepEqual([p.id, p.cuando, p.rama, p.borrador], ["publicar", "a-mano", "desarrollo", true]);
  assert.deepEqual(revisarProceso(t, "publicar.md"), []);
  assert.deepEqual(
    p.pasos.map((x) => x.tipo),
    ["push", "ci", "comando", "salud", "aprobacion", "comando", "salud"],
  );
  assert.deepEqual(pasosSinDeshacer(p), []);
});

test("los topes y la salud tienen su forma", () => {
  assert.deepEqual(["30s", "2m", "1h", "10 m", "2d", "", "m"].map(segundosDe), [30, 120, 3600, 600, null, null, null]);
  assert.deepEqual(saludDe("GET http://localhost:3000/salud → 200"), { metodo: "GET", url: "http://localhost:3000/salud", codigo: 200 });
  assert.equal(saludDe("POST https://x → 200"), null);
  assert.equal(saludDe("GET https://x → ok"), null);
});
