@AGENTS.md

## Qué es esto

La fábrica de software, como programa para compartir: la planta, las líneas, las tareas, la
Entrada, la memoria, las habilidades y los procesos, con el plugin `fabrica/`. No usa la API de
Claude: todo corre con la sesión de Claude Code de quien la usa. `README.md` dice cómo levantarla
y qué hay en cada carpeta.

Es un proyecto independiente: no depende de otro repositorio ni se sincroniza con ninguno.

## Reglas del proyecto

- **Todo en español neutro, sin voseo y con tildes**: comentarios, interfaz, documentación y
  mensajes de commit. Los identificadores y los datos guardados van sin tilde. La interfaz le
  habla a quien la usa, de tú.
- **Todo corre con la sesión de Claude Code de quien la usa.** No se usa la API de Claude ni una
  clave suya. Lo que necesite algo más (Jev, `gh`, `glab`, un token, el teléfono) queda apagado,
  con un mensaje que dice qué falta, hasta que se agregue su variable.
- **Claude Code se busca en el PATH si falta `FACTORIA_CLAUDE_CODE_BIN`** (`src/lib/fabrica/motor/claude-code.ts`),
  una vez al arrancar y solo en carpetas absolutas. Es la única diferencia con la aplicación de
  origen, donde va solo por su ruta exacta: `gh`, `glab`, Codex y Antigravity siguen por la suya.
  Las pruebas no miran el PATH de quien las corre (`fijarClaudeEnElPath(null)`, en
  `src/pruebas/entorno.ts`).
- **El plugin se instala desde este repositorio** (`.claude-plugin/marketplace.json`, `fabrica@factoria`),
  y una corrida apaga esa copia (`PLUGIN_INSTALADO`, en `corridas.ts`): corre la de `fabrica/`.
  Si cambia el nombre del marketplace, cambia también ahí y en `scripts/fabrica/`.
- **`.env.local` no se lee ni se copia.** Si hace falta saber qué hay, se pregunta por el nombre
  de la variable.
- **`datos/` no entra al repositorio.** Es lo de cada equipo.
- **Un guardia va pegado a lo que protege, no en quien llama.**
- **Las rutas se prueban sin red** (`src/pruebas/`): cada archivo de pruebas corre en una carpeta
  recién hecha, con claves de mentira y una red de mentira que falla ante cualquier dirección que
  no conozca. Una ruta nueva, o un guardia nuevo en una ruta, lleva su prueba. Tienen que pasar
  también con `npm run test:vacio`: lo que prueba cómo contesta Jev se salta con
  `conElEntornoVacio`.
- **Nada se cae por lo que falta.** Lo opcional se mira antes de usarlo y dice qué agregar: un
  proceso avisa qué pasos no van a poder (`loQueNoVaAPoder`), no se enciende solo con algo
  faltando, y el vigía lo registra en vez de lanzarlo. Una página que falla muestra `error.tsx`.
- **Una página que lee datos llama a `connection()`**: sin eso, `next build` la deja fija con lo
  que había al compilar.
- **Las referencias de una tarea viven fuera del repositorio, y los agentes leen una copia**
  (`src/lib/fabrica/referencias/`, en `datos/referencias/`).
  - Se aceptan imágenes, PDF, texto, Word y Excel. El tipo se mira por los bytes, y Word y Excel
    se pasan a texto en el equipo, sin dependencias.
  - Un link lo lee la aplicación una vez (`leerPagina`): solo `https`, nunca hacia una dirección
    privada, de Tailscale o del equipo, tampoco por una redirección. Los agentes no abren internet.
  - El texto de un documento o de una página pasa por `traeInstrucciones`. Si le habla a un
    asistente, o nadie lo pudo revisar, no se guarda ni llega a los agentes.
  - A los agentes les llegan como cita (`INDICE.md`), sin direcciones web. Nadie de la corrida
    escribe esa carpeta (`frenaReferencias`), y se cambian solo mientras la tarea está pendiente.
- Las reglas de la fábrica (la Entrada solo lee, nada pasa a una línea sin su clic, la memoria de
  la fábrica la escribe la persona, los procesos los corre el código, la fusión, producción con su
  clic, los tokens solo se nombran) están en los comentarios de cada módulo y en
  `fabrica/README.md`.

## Comandos

```bash
npm run dev               # Next 16, solo en 127.0.0.1
npm test                  # lógica pura y rutas, con `node --test`; sin red
npm run test:vacio        # las mismas sin ninguna variable, tampoco la clave de Jev de mentira
npm run fabrica:e2e       # la fábrica de punta a punta con git de verdad en un repo desechable. Gasta: pregunta antes
npm run fabrica:corrida-real   # una corrida de verdad con sus agentes. Con -- --correr gasta: pregunta antes
npx tsc --noEmit
npm run lint
```
