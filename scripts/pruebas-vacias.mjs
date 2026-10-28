// Las pruebas como en un equipo que recién instaló la fábrica: sin ninguna variable, tampoco la
// clave de Jev de mentira que ponen las pruebas de siempre (ver src/pruebas/entorno.ts). Lo que
// prueba cómo contesta Jev se salta; lo demás tiene que pasar igual.
//
//   npm run test:vacio

import { spawnSync } from "node:child_process";

const r = spawnSync(process.execPath, ["--test", "src/**/*.test.ts"], { stdio: "inherit", env: { ...process.env, FABRICA_PRUEBAS: "vacio" } });
process.exit(r.status ?? 1);
