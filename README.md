# La fábrica

Una fábrica de software con Claude Code. Cada **línea** es un repositorio con git y su cola de
tareas; la **planta** las muestra todas a la vez. Cada tarea pasa por spec, construcción,
revisión, verificación y aprobación, con agentes de Claude Code que corren en este equipo con tu
sesión (tu suscripción), en worktrees aparte. Nada se integra a la rama principal sin que lo
decidas tú, salvo lo que tú mismo dejes integrarse solo.

## Lo que necesitas

- **Node 22.18 o más nuevo.** Usa `node:sqlite`, y las pruebas cargan TypeScript sin compilar.
  Con `node --version` lo ves.
- **git.**
- **Claude Code, con tu sesión iniciada.** Las corridas usan tu suscripción, no una clave de la
  API. Si `claude` no te abre una sesión en la terminal, inicia sesión con `claude auth login`.

Ninguna variable de entorno hace falta para empezar. El repositorio es privado: para clonarlo,
tu cuenta de GitHub necesita acceso.

## Instalarla

```bash
git clone https://github.com/fcanalesS/FabricaSola.git fabrica
cd fabrica
npm ci
npm run dev
```

`npm ci` instala exactamente las versiones de `package-lock.json`, el que está en el repositorio:
todos los equipos corren lo mismo. Para subir una dependencia, `npm install <paquete>@<versión>`,
y el lock cambiado entra con el commit.

Abre <http://127.0.0.1:3000>. La aplicación escucha solo en este equipo: nadie más en tu red la ve.

Levántala desde una terminal donde `claude` funcione. La fábrica usa ese Claude Code, el del PATH.
Si quieres otro, pon su ruta en `COMPANIA_CLAUDE_CODE_BIN`, en un archivo `.env.local` en esta
carpeta (copia `.env.example`), y reinicia.

## Los primeros pasos

1. **Este equipo** (en el menú): mira que Claude Code, tu sesión y git digan «Lista». Lo demás es
   opcional, y ahí dice qué agrega cada cosa y cómo ponerla.
2. **Configuración:** escribe la carpeta de un repositorio tuyo (o **Buscar la carpeta**), **Usar
   este proyecto** y después **Crear factory/ básica**. La fábrica reconoce los comandos de build,
   test y lint del proyecto: revísalos y pruébalos ahí mismo. Sin ninguno, cada tarea termina
   esperándote.
3. **Nueva petición:** escribe lo que quieres, en palabras, y **Crear la tarea**.
4. **Líneas**, en tu proyecto: **Correr la cola**. La tarea avanza por las etapas en la misma
   pantalla. Si un agente pregunta algo, o la aprobación es tuya, la tarjeta dice «Te espera», y
   la planta la junta con las demás en «Te esperan».

## Lo que hay que saber antes

- **Gasta de tu suscripción.** Cada tarea pasa por cinco a siete agentes. En Configuración puedes
  poner un tope por día: al llegar, la corrida se detiene y no se lanza otra.
- **Nunca hace push por su cuenta.** Cada tarea se integra en tu rama de trabajo, en este equipo.
  Empujar, abrir un PR o desplegar lo hacen solo los procesos que tú escribas en `factory/procesos/`,
  y producción espera tu clic.
- **Corre una línea a la vez.** Correr otra espera a que termine la que está corriendo.
- **Una tarea ambigua se detiene y pregunta.** Es a propósito: contesta en su tarjeta y sigue.
- **Cada etapa la hace un agente, y puedes usar el tuyo.** En Configuración › Agentes y modelos,
  **Personalizar** copia el agente de la fábrica de esa etapa a `.claude/agents/` de tu proyecto
  y lo edita ahí mismo. Parte siempre del de la fábrica, porque cada etapa tiene que dejar algo
  que la siguiente lee (la spec, los hallazgos, el veredicto). Vale desde la próxima corrida, y
  la aplicación no hace commit. **Volver al de la fábrica** no borra tu copia.
- **Lo de este equipo queda en `datos/`** (tus líneas, las corridas, los registros), fuera del
  repositorio. Las tareas y la memoria de cada proyecto quedan en su `factory/`, en su repositorio.

## Lo que se agrega después

Todo es opcional, y **Este equipo** dice qué falta y qué permite. Van en `.env.local`;
`.env.example` las explica una por una. Después de cambiarlo, reinicia la aplicación.

| Qué | Para qué |
| --- | --- |
| `gh` o `glab` (`COMPANIA_GH_BIN`, `COMPANIA_GLAB_BIN`) | Que un proceso abra el PR, espere la integración continua y fusione |
| Jev (`TYPESAFE_AI_KEY`) | Gastar menos: decide qué pruebas y revisores necesita cada tarea, y revisa los issues de otras personas |
| Un token por fuente (`COMPANIA_FUENTE_<NOMBRE>_TOKEN`) | Traer issues de GitHub o GitLab a la Bandeja, en solo lectura |
| Telnyx (`COMPANIA_TELNYX_…`, `COMPANIA_TELEFONO`) | Que la fábrica te llame cuando una tarea te espera |
| Codex o Antigravity (`COMPANIA_CODEX_BIN`, `COMPANIA_ANTIGRAVITY_BIN`) | Que revisen el código o escriban la spec con su propia suscripción |
| Un modelo Live2D y el Core de Cubism, en `public/live2d/` (no en `.env.local`) | Que la portada muestre el modelo que elijas dentro de su anillo. Sin modelo, queda la vista simple. Qué poner y dónde: `public/live2d/LEEME.md` |

Las variables se llaman `COMPANIA_…` porque el código viene de otra aplicación y sigue igual en
las dos.

## Si algo falla

- **Este equipo** dice si falta algo.
- Una página que falla muestra un código: búscalo en la terminal donde corre la aplicación.
- Un proceso dice antes de correr qué pasos no van a poder en este equipo.

## El plugin

Las corridas usan el plugin de Claude Code que está en `fabrica/`, y lo cargan solas. Si quieres
usarlo también en tus sesiones de Claude Code (`/fabrica:correr` a mano, el tablero), se instala
desde este repositorio: ver «Instalar» en [fabrica/README.md](fabrica/README.md).

## Para desarrollar

```bash
npm test             # las pruebas, con el corredor de Node: sin red y sin claves de verdad
npm run test:vacio   # las mismas, como en un equipo sin ninguna variable (tampoco Jev)
npx tsc --noEmit     # la primera vez, después de npm run dev (o npx next typegen): usa los tipos de las rutas
npm run lint
```

`npm ci` puede avisar que `unrs-resolver` trae un script de instalación sin aprobar: es del
lint, y la aplicación y las pruebas corren igual sin él.

`npm run fabrica:e2e` y `npm run fabrica:corrida-real` corren la fábrica de punta a punta con
sesiones de verdad de Claude Code en un repositorio desechable: gastan.

## Qué hay

| Dónde | Qué es |
| --- | --- |
| `src/app/page.tsx` | La portada: cómo está la planta en una mirada, sobre anillos de pantalla, y por dónde seguir |
| `public/live2d/`, `src/lib/portada/` y `src/components/portada/` | El modelo Live2D opcional de la portada: dónde se pone, cómo se encuentra y cómo se dibuja |
| `src/app/fabrica/` | Las pantallas: la planta, las líneas, las tareas, la Bandeja, la nueva petición, las fuentes, la memoria y este equipo |
| `src/app/configuracion/` | La configuración: las líneas, los agentes y sus modelos, el gasto, los procesos y los avisos |
| `src/app/api/fabrica/` | Las rutas que usan esas pantallas |
| `src/lib/fabrica/motor/` | El motor: lee el `factory/` de cada línea, lanza las corridas con Claude Code y lleva el vigía |
| `src/lib/fabrica/procesos/` | Los procesos: comandos, salud, push con su PR, integración continua, fusión, producción, el vigía de vulnerabilidades y la evaluación |
| `src/lib/fabrica/memoria/` | La memoria de la fábrica: el vault de cada línea (`factory/memoria/`, en su repositorio) y el de la planta (`datos/memoria/`) |
| `src/lib/fabrica/habilidades/` | Las habilidades y especialidades de cada línea |
| `src/lib/entrada/` | La Entrada: el formulario de petición, la Bandeja y las fuentes (GitHub y GitLab, en solo lectura) |
| `src/lib/fabrica/equipo.ts` | «Este equipo»: qué piezas tiene este equipo, qué permite cada una y qué agregar |
| `src/lib/datos.ts` | La carpeta `datos/` de este equipo y su base SQLite |
| `src/proxy.ts` y `src/lib/servidor/` | El guardia de quién puede llamar a las rutas |
| `src/pruebas/` | Las pruebas de las rutas: una carpeta aparte, claves de mentira y una red de mentira que anota qué le llegó a quién |
| `fabrica/` | El plugin de Claude Code que usan las corridas: sus agentes, sus comandos y el mod que cuida cada paso |
| `datos/` | Lo de este equipo: ajustes, corridas, registros de los procesos y el vault de la planta. No entra al repositorio |

Los documentos de `fabrica/docs/` son los planes con que se construyó la fábrica en la aplicación
de origen: cuentan por qué es como es, y todavía hablan de ella.
