// Mide si Jev reconoce un cambio superficial, el que una tarea aprobada puede integrar sin que él
// lo pruebe a mano (fabrica/docs/Plan-Integracion.md, etapa 2). Usa los casos escritos a mano de
// scripts/fabrica/casos-integracion.json y le hace a Jev la misma pregunta que el mod, con lo mismo:
// el título y los archivos con sus líneas, nunca código.
//
//   node --env-file-if-exists=.env.local scripts/fabrica/jev-integracion.mjs
//
// Para cada umbral cuenta lo que entraría sola sin deber (lo grave) y lo que esperaría sin
// necesidad. El mejor es el que no deja entrar nada que no debía, y con eso, el que más acierta.
// Guarda lo medido en scripts/fabrica/jev-integracion-<fecha>.json. Cuesta casi nada: Jev cobra
// solo la entrada. No llama a Claude.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { estadoParaJev, PREGUNTA_DE_INTEGRACION, UMBRALES } from "../../fabrica/hooks/jev.ts";
import { jevDisponible, preguntarJev } from "../../src/lib/jev/cliente.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
if (!jevDisponible()) {
  console.error("Jev no está disponible: falta TYPESAFE_AI_KEY (pásala con --env-file-if-exists=.env.local).");
  process.exit(1);
}
const { casos } = JSON.parse(readFileSync(join(AQUI, "casos-integracion.json"), "utf8"));
const ESPERA_MS = 8_000;

async function peso(c) {
  const cambios = c.archivos.map(([ruta, agregadas, quitadas]) => ({ ruta, agregadas, quitadas }));
  const r = await preguntarJev(estadoParaJev(c.titulo, cambios), { integracion: PREGUNTA_DE_INTEGRACION }, ESPERA_MS);
  return typeof r?.integracion?.noul === "number" ? r.integracion.noul : null;
}

const filas = [];
for (let i = 0; i < casos.length; i += 4) filas.push(...(await Promise.all(casos.slice(i, i + 4).map(async (c) => ({ ...c, p: await peso(c) })))));

const actual = UMBRALES.integracion;
console.log(`\n== Cambio superficial (hoy: ${actual}) ==`);
for (const f of [...filas].sort((a, b) => (a.p ?? -1) - (b.p ?? -1)))
  console.log(`  ${f.p === null ? " sin " : f.p.toFixed(2)}  ${f.superficial ? "superficial" : "con lógica "}${f.trampa ? " (trampa)" : ""}  ${f.titulo}`);

const UMBRALES_A_PROBAR = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
console.log("  umbral  aciertos  entra sin deber  espera sin necesidad");
const porUmbral = UMBRALES_A_PROBAR.map((u) => {
  const sola = (f) => f.p !== null && f.p >= u;
  const entraSinDeber = filas.filter((f) => !f.superficial && sola(f)).length;
  const esperaDeMas = filas.filter((f) => f.superficial && !sola(f)).length;
  return { umbral: u, aciertos: filas.length - entraSinDeber - esperaDeMas, entraSinDeber, esperaDeMas };
});
for (const x of porUmbral)
  console.log(`  ${x.umbral.toFixed(2)}    ${String(x.aciertos).padStart(2)}/${filas.length}     ${x.entraSinDeber}                ${x.esperaDeMas}${x.umbral === actual ? "   ← hoy" : ""}`);
const mejor = [...porUmbral].sort((a, b) => a.entraSinDeber - b.entraSinDeber || b.aciertos - a.aciertos || b.umbral - a.umbral)[0];
console.log(`  → mejor: ${mejor.umbral} (${mejor.aciertos} de ${filas.length}; ${mejor.entraSinDeber} entran sin deber, ${mejor.esperaDeMas} esperan sin necesidad)`);

const archivo = join(AQUI, `jev-integracion-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(archivo, JSON.stringify({ medido: new Date().toISOString(), actual, filas, porUmbral, mejor }, null, 2) + "\n");
console.log(`\nGuardado en ${archivo}`);
