import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { pedir, red } from "../../../../pruebas/entorno.ts";

// La fábrica copia sus agentes de `fabrica/agents/` en la carpeta de trabajo, que en las pruebas es
// una recién hecha: se ponen ahí los del repositorio.
const AGENTES_DE_LA_FABRICA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "fabrica", "agents");
cpSync(AGENTES_DE_LA_FABRICA, path.join(process.cwd(), "fabrica", "agents"), { recursive: true });

const { GET, POST } = await import("./route.ts");
const { elegirProyecto } = await import("../../../../lib/fabrica/motor/proyecto.ts");
const { partir } = await import("../../../../lib/fabrica/motor/formato.ts");
const { usarFabricaDePrueba } = await import("../../../../lib/fabrica/cliente.ts");
// Con el motor de verdad: lo que se prueba es el archivo que escribe, en un proyecto desechable.
usarFabricaDePrueba(null);

beforeEach(() => {
  red.reiniciar();
});
afterEach(async () => {
  await red.calma();
});

const URL_AJUSTES = "http://127.0.0.1:3000/api/fabrica/ajustes";
const hacer = async (cuerpo: unknown) => {
  const r = await pedir(POST, cuerpo, URL_AJUSTES);
  return { estado: r.status, ...((await r.json()) as { error?: string; personalizado?: { creado: boolean; nombre: string }; ajustes?: { agentes?: { porRol: Record<string, string> } } }) };
};
const leerPropio = async (rol: string) => {
  const r = await pedir(GET, undefined, `${URL_AJUSTES}?agente=${rol}`);
  return { estado: r.status, ...((await r.json()) as { error?: string; agente?: { nombre: string; descripcion: string; instrucciones: string } | null }) };
};
const nadaSalio = () => red.aClaude.length === 0 && red.aJev.length === 0 && red.aServicios.length === 0 && red.aOtros.length === 0;

let n = 0;
async function proyecto() {
  const raiz = path.join(mkdtempSync(path.join(os.tmpdir(), "agentes-")), `caja-${++n}`);
  mkdirSync(path.join(raiz, "factory", "tareas"), { recursive: true });
  writeFileSync(path.join(raiz, "factory", "config.md"), "---\nbuild: npm run build\nagente_spec: auto\n---\n\nNotas.\n");
  await elegirProyecto(raiz);
  return raiz;
}
const copiaDe = (raiz: string, nombre: string) => path.join(raiz, ".claude", "agents", `${nombre}.md`);
const configDe = (raiz: string) => partir(readFileSync(path.join(raiz, "factory", "config.md"), "utf8"));

test("personalizar una etapa copia el agente de la fábrica al proyecto, lo pone en la etapa y no pisa uno que exista", async () => {
  const raiz = await proyecto();
  // Antes de personalizar no hay nada que editar.
  assert.deepEqual(await leerPropio("spec"), { estado: 200, agente: null });

  const r = await hacer({ ajuste: "personalizar_agente", rol: "spec" });
  assert.equal(r.estado, 200);
  assert.deepEqual(r.personalizado, { creado: true, nombre: "fabrica-spec-escritor" });
  assert.equal(r.ajustes?.agentes?.porRol.spec, "fabrica-spec-escritor");
  assert.equal(configDe(raiz).datos.agente_spec, "fabrica-spec-escritor");
  // El resto de config.md queda igual.
  assert.equal(configDe(raiz).datos.build, "npm run build");
  assert.equal(configDe(raiz).cuerpo.trim(), "Notas.");

  // La copia es la de la fábrica con otro nombre: mismas herramientas y mismas instrucciones.
  const original = partir(readFileSync(path.join(AGENTES_DE_LA_FABRICA, "spec-escritor.md"), "utf8"));
  const copia = partir(readFileSync(copiaDe(raiz, "fabrica-spec-escritor"), "utf8"));
  assert.equal(copia.datos.name, "fabrica-spec-escritor");
  assert.equal(copia.datos.tools, original.datos.tools);
  assert.equal(copia.cuerpo.trim(), original.cuerpo.trim());

  // Se puede leer para editarla.
  const leido = await leerPropio("spec");
  assert.equal(leido.agente?.nombre, "fabrica-spec-escritor");
  assert.equal(leido.agente?.instrucciones, original.cuerpo.trim());

  // Otra vez: no la pisa, solo la vuelve a elegir.
  writeFileSync(copiaDe(raiz, "fabrica-spec-escritor"), "---\nname: fabrica-spec-escritor\ndescription: La mía\n---\n\nMis reglas.\n");
  await hacer({ ajuste: "agente_de_rol", rol: "spec", valor: "auto" });
  const otra = await hacer({ ajuste: "personalizar_agente", rol: "spec" });
  assert.deepEqual(otra.personalizado, { creado: false, nombre: "fabrica-spec-escritor" });
  assert.equal(configDe(raiz).datos.agente_spec, "fabrica-spec-escritor");
  assert.match(readFileSync(copiaDe(raiz, "fabrica-spec-escritor"), "utf8"), /Mis reglas\./);
  assert.ok(nadaSalio());
});

test("guardar el agente propio cambia su descripción y sus instrucciones, y nunca su nombre ni sus herramientas", async () => {
  const raiz = await proyecto();
  // Sin personalizarla antes, no hay qué guardar.
  const sinCopia = await hacer({ ajuste: "agente_propio", rol: "aprobacion", descripcion: "Aprueba", instrucciones: "Reglas" });
  assert.equal(sinCopia.estado, 409);
  assert.match(sinCopia.error ?? "", /primero personalízala/);

  await hacer({ ajuste: "personalizar_agente", rol: "aprobacion" });
  const antes = partir(readFileSync(copiaDe(raiz, "fabrica-aprobador"), "utf8"));
  const guardado = await hacer({ ajuste: "agente_propio", rol: "aprobacion", descripcion: "Fábrica: aprueba\ncon criterio: el nuestro", instrucciones: "# Aprobador\r\n\r\nRevisa los criterios.\n", name: "otro", tools: "Bash" });
  assert.equal(guardado.estado, 200);
  const despues = partir(readFileSync(copiaDe(raiz, "fabrica-aprobador"), "utf8"));
  assert.equal(despues.datos.name, "fabrica-aprobador");
  assert.equal(despues.datos.tools, antes.datos.tools);
  assert.equal(despues.datos.model, antes.datos.model);
  // En una línea, y con los dos puntos dentro de su comilla.
  assert.equal(despues.datos.description, "Fábrica: aprueba con criterio: el nuestro");
  assert.equal(despues.cuerpo.trim(), "# Aprobador\n\nRevisa los criterios.");

  // Lo que no vale no se escribe.
  for (const malo of [
    { descripcion: "", instrucciones: "Algo" },
    { descripcion: "Algo", instrucciones: "   " },
    { descripcion: "x".repeat(501), instrucciones: "Algo" },
    { descripcion: "Algo", instrucciones: "Con un \u0007 adentro" },
    { descripcion: "Algo", instrucciones: "x".repeat(64 * 1024 + 1) },
  ]) assert.equal((await hacer({ ajuste: "agente_propio", rol: "aprobacion", ...malo })).estado, 400, JSON.stringify(malo).slice(0, 80));
  assert.equal(partir(readFileSync(copiaDe(raiz, "fabrica-aprobador"), "utf8")).cuerpo.trim(), "# Aprobador\n\nRevisa los criterios.");
  assert.ok(nadaSalio());
});

test("una etapa que no existe no crea ni lee nada, y la copia no se escribe a través de un enlace", async () => {
  const raiz = await proyecto();
  assert.equal((await hacer({ ajuste: "personalizar_agente", rol: "../secreto" })).estado, 400);
  assert.equal((await leerPropio("../secreto")).estado, 400);
  assert.ok(!existsSync(path.join(raiz, ".claude")));

  // Un enlace en lugar del archivo: no se lee ni se escribe a través de él.
  const afuera = path.join(mkdtempSync(path.join(os.tmpdir(), "afuera-")), "otro.md");
  writeFileSync(afuera, "---\nname: otro\n---\n\nDe otro lado.\n");
  mkdirSync(path.join(raiz, ".claude", "agents"), { recursive: true });
  let hayEnlace = true;
  try {
    symlinkSync(afuera, copiaDe(raiz, "fabrica-constructor"));
  } catch {
    hayEnlace = false; // En Windows sin permiso para enlaces, esta parte no se puede probar.
  }
  if (hayEnlace) {
    assert.equal((await hacer({ ajuste: "personalizar_agente", rol: "construccion" })).estado, 409);
    assert.equal((await hacer({ ajuste: "agente_propio", rol: "construccion", descripcion: "x", instrucciones: "y" })).estado, 409);
    assert.equal((await leerPropio("construccion")).estado, 409);
    assert.match(readFileSync(afuera, "utf8"), /De otro lado\./);
  }
  assert.ok(nadaSalio());
});
