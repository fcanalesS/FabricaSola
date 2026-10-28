# Mejoras de la fábrica: integración automática, configuración por proyecto y robustez

**Proyecto.** La aplicación de compañía (`C:\proyectos\TableroZero\compania`), una app Next.js 16 con TypeScript que orquesta la fábrica de software. La fábrica en sí es el mod de Claude Code que vive en `compania/fabrica/` (hooks en `fabrica/hooks/*.ts|tsx`, comandos en `fabrica/commands/*.md`, agentes en `fabrica/agents/`). La app lanza Claude Code con `--plugin-dir compania/fabrica` (`src/lib/fabrica/motor/corridas.ts:449`), así que esa carpeta es la fuente de verdad. La copia instalada en `~/.claude/mods/fabrica` es más vieja y queda fuera de este plan.

**Origen de estas tareas.** Salen de las corridas del 19-10-2026 sobre el proyecto WolffWebNET10:
- cuatro tareas bloqueadas por no saber desde qué rama construir;
- revisiones de Codex contra un `main` local atrasado, con bloqueantes falsos;
- un conflicto entre dos tareas hechas en paralelo (F-010 y F-013);
- una primera corrida perdida porque el config se creó sin comandos;
- integración de ramas hecha a mano.

**Cómo se prueba.**
- App: `npm test` (`node --test "src/**/*.test.ts"`) y `npm run lint`, desde `compania/`.
- Mod: `claude plugin test fabrica`, según `fabrica/README.md`. Las pruebas del mod usan `claude-code/testing` (ver `fabrica/hooks/tareas.test.ts`).
- Cada lógica nueva va como función pura en `fabrica/hooks/tareas.ts` (o en `src/lib/fabrica/motor/*.ts` si es de la app), con su prueba. En `register.tsx` solo va lo que toca disco o procesos.

**Convenciones que importan** (`compania/CLAUDE.md` y `AGENTS.md`):
- Español neutro, sin voseo y con tildes en comentarios, interfaz, documentación y commits. Los identificadores y los datos guardados van sin tilde.
- El código no nombra a ningún personaje.
- No se leen ni se copian `.env.local`, `comun/` ni `personajes/<id>/memoria/`. Para probar se usan datos de prueba.
- Next.js 16 tiene cambios incompatibles: antes de tocar código de la app, leer la guía en `node_modules/next/dist/docs/`.
- El estado de una tarea solo cambia con `mcp__fabrica__mover`. La verificación solo la corre `mcp__fabrica__verificar`.
- **Nunca se hace `push`.** Este plan cambia una regla: la fábrica pasa a integrar sola en local (ver las tareas de integración). `fabrica/commands/correr.md:20` dice hoy «Nunca hagas merge ni push» y debe quedar como «Nunca hagas push; la integración local la hace el mod».

**Decisiones ya tomadas por el usuario** (no se reabren):
1. **Rama de origen.** La rama donde se inició el trabajo es la rama que está activa en el repo del proyecto cuando la tarea crea su worktree. El worktree sale de esa rama, en su estado de ese momento, y no de `rama_base`.
2. **Conflictos al integrar.** No se resuelven en la copia de trabajo del usuario. Antes de cerrar, el worktree trae la rama de origen. Si hay conflicto, la tarea vuelve a construcción como BLOQUEANTE, el constructor lo resuelve y se verifica otra vez. La integración final es siempre un fast-forward.
3. **Configuración por proyecto.** Los comandos de build, test y lint se reconocen solos para cada proyecto. Una factory/ nueva nunca queda con los comandos vacíos sin avisar.

## Detectar build, test y lint al crear la fábrica desde la app

### Objetivo
Que «Inicializar» en la configuración de la app deje `factory/config.md` con los comandos reales del proyecto elegido, en vez de vacíos.

### Criterios de aceptación
- `inicializarFabrica()` (`src/lib/fabrica/motor/proyecto.ts:204`) llama a una función pura nueva `detectarComandos(archivos, claudeMd)`. Recibe la lista de archivos de la raíz y de un nivel más abajo, y el texto del `CLAUDE.md` del proyecto si existe. Devuelve `{ build, test, lint, avisos[] }`.
- La detección sigue la tabla de `fabrica/commands/init.md` (sección «2. Detectar el proyecto»): `.sln/.slnx/.csproj`, `package.json`, `pyproject.toml/requirements.txt`, `Cargo.toml` y `go.mod`. Cada comando que devuelve existe en el proyecto (script de npm presente, sln presente, etc.).
- Si el `CLAUDE.md` del proyecto trae comandos en un bloque «Build, run, test, lint» o equivalente, esos mandan sobre la tabla. Con el `CLAUDE.md` de WolffWebNET10 sale `dotnet build WolffWeb.sln` y `dotnet test WolffWeb.Tests`.
- Detecta los proyectos de pruebas que **no** están en la solución. Si hay un `*.Tests.csproj` fuera del `.sln`, el comando de test apunta a ese proyecto y no a la solución, y queda un aviso que lo explica.
- `rama_base` se rellena con la rama actual del repo (`git branch --show-current`), no con `main` fijo.
- Si no se reconoce nada, los comandos quedan vacíos y `avisos` lo dice. La app muestra el aviso en vez del texto fijo de `src/components/configuracion/fabrica.tsx:156`.
- Pruebas con `node --test` para `detectarComandos` con al menos estos casos: proyecto .NET con tests fuera del sln, proyecto npm con y sin script de test, proyecto sin nada reconocible y `CLAUDE.md` con comandos propios.

### Archivos o zonas que toca
- `src/lib/fabrica/motor/proyecto.ts` y un archivo nuevo de lógica pura con su `.test.ts` en `src/lib/fabrica/motor/`.
- `src/components/configuracion/fabrica.tsx`, solo el mensaje tras inicializar.

### Fuera de alcance
- Cambiar `/fabrica:init` del mod.
- Detectar más lenguajes que los de la tabla.

## Mostrar y probar los comandos del proyecto en la configuración

### Objetivo
Que el usuario vea, para el proyecto elegido, qué build, test y lint va a usar la fábrica, y pueda probarlos antes de correr.

### Criterios de aceptación
- La sección de fábrica de la configuración muestra el nombre del proyecto activo y sus `build`, `test`, `lint` y `rama_base`, leídos de su `factory/config.md`.
- Los tres comandos se pueden editar ahí. Se guardan en el `factory/config.md` de **ese** proyecto, con el mismo formato de frontmatter plano, sin tocar el resto del archivo.
- Un botón «Probar comandos» corre los tres en la raíz del proyecto y muestra por cada uno ok o falló, junto con las últimas líneas de salida si falló.
- Al cambiar de proyecto se ven los comandos del nuevo proyecto. Nada queda en memoria de la app entre proyectos.

### Archivos o zonas que toca
- `src/components/configuracion/fabrica.tsx`, `src/app/api/fabrica/ajustes/route.ts` y `src/lib/fabrica/motor/proyecto.ts` (`fijarEnConfig`).

### Fuera de alcance
- Editar otras claves de `config.md` que no sean los tres comandos y `rama_base`.

## No dejar correr la fábrica sin comandos de verificación

### Objetivo
Evitar corridas que gastan agentes y terminan todas en `necesita-humano`, como la del 19-10-2026 a las 11:31.

### Criterios de aceptación
- Si `build`, `test` y `lint` están los tres vacíos en el `config.md` del proyecto, el botón para correr la fábrica queda deshabilitado. Un texto dice qué falta y lleva a la sección de comandos.
- La API que lanza la corrida responde un error con el mismo motivo, aunque la llamen sin pasar por la interfaz.

### Archivos o zonas que toca
- `src/app/api/fabrica/route.ts`, `src/lib/fabrica/motor/corridas.ts` y el componente que muestra el botón de correr.

### Fuera de alcance
- Validar que los comandos funcionen. Eso es de «Probar comandos».

## Permitir lint solo sobre lo que cambió la tarea

### Objetivo
Que el lint de verificación no falle por errores previos del proyecto. En WolffWebNET10 el JS legacy tiene unos 640 errores y hubo que fijar el lint a mano a una carpeta.

### Criterios de aceptación
- El comando de `lint` en `config.md` acepta el marcador `{archivos}`. Al verificar, `hVerificar` lo reemplaza por los archivos de la tarea (modificados y nuevos respecto de su base), filtrados por las extensiones de la clave nueva y opcional `lint_extensiones` (por ejemplo `.js,.ts`).
- Si no hay archivos que coincidan, el paso de lint se da por ok y el informe lo dice («sin archivos que lintear»).
- Las rutas se pasan entre comillas y funcionan en Windows PowerShell 5, que es donde corre `enShell` en Windows (`fabrica/hooks/tareas.ts:370`).
- Hay una prueba de la función pura que arma el comando con y sin archivos.

### Archivos o zonas que toca
- `fabrica/hooks/register.tsx` (`hVerificar`) y `fabrica/hooks/tareas.ts`, más la sección de `config.md` en `fabrica/README.md`.

### Fuera de alcance
- Hacer lo mismo con build o test.

## Guardar la rama de origen y crear el worktree desde ella

### Objetivo
Que cada tarea salga de la rama donde el usuario está trabajando, con lo que ya se integró antes, y que la tarea recuerde esa rama para integrarse al final.

### Criterios de aceptación
- Al pasar a `construccion` con `worktree`, `mcp__fabrica__mover` acepta un campo nuevo `rama_origen`. El frontmatter de la tarea lo guarda y no se pisa en vueltas de retrabajo.
- `fabrica/commands/correr.md` (sección «spec → construccion») dice:
  - obtener `RO = git -C <raíz> branch --show-current`;
  - crear el worktree con `git worktree add "<WT>" -b fabrica/<id> <RO>`;
  - pasar `rama_origen: RO` a `mover`.
- Si la raíz está en «detached HEAD» (no hay rama actual), la tarea va a `necesita-humano` con ese motivo y no se crea el worktree.
- `rama_base` del config solo se usa como respaldo para tareas viejas que no tienen `rama_origen`.
- Todas las comparaciones de la tarea contra su base usan `rama_origen` si existe: el diff para los revisores, `cambiosEn` (`fabrica/hooks/register.tsx:527-530`) y las decisiones de Jev.

### Archivos o zonas que toca
- `fabrica/hooks/register.tsx`, `fabrica/hooks/tareas.ts`, `fabrica/commands/correr.md`, `fabrica/docs/puente-orquestador.md` (campo nuevo del frontmatter) y `src/lib/fabrica/motor/formato.ts` y `tipos.ts`, para que la app lo lea.

### Fuera de alcance
- Cambiar tareas que ya están en `hecho`.

## Comparar contra el merge-base y no contra la rama local

### Objetivo
Que los revisores, Codex incluido, vean solo lo que cambió la tarea, aunque la rama local de base esté atrasada o haya avanzado.

### Criterios de aceptación
- Una función pura `baseDeComparacion(base)` devuelve la expresión a usar. El mod resuelve `git merge-base HEAD <base>` en el worktree y compara contra ese commit.
- `pedidoDeRevision` (`fabrica/hooks/externos.ts:61-64`) recibe el commit del merge-base, no el nombre de la rama. El texto pide `git diff <merge-base>`.
- `cambiosEn` usa el mismo merge-base.
- `fabrica/commands/correr.md` (sección «revision») pide el diff con `git -C "<WT>" diff $(git -C "<WT>" merge-base HEAD <base>)`.
- Hay una prueba que comprueba que el pedido a Codex contiene un hash y no el nombre de la rama.

### Archivos o zonas que toca
- `fabrica/hooks/externos.ts`, `fabrica/hooks/register.tsx`, `fabrica/commands/correr.md` y sus pruebas.

### Fuera de alcance
- Cambiar qué revisores se lanzan.

## Traer la rama de origen al worktree antes de aprobar

### Objetivo
Que los conflictos con lo que se integró mientras la tarea se construía se resuelvan dentro de la fábrica, y no en la copia de trabajo del usuario.

### Criterios de aceptación
- Después de una verificación en ok, y antes de pasar a `aprobacion`, el orquestador corre en el worktree `git merge --no-edit <rama_origen>`. Hay una herramienta nueva `mcp__fabrica__sincronizar(tarea)` que lo hace y anota el resultado en la bitácora.
- Si la rama de origen no tiene commits nuevos, no hace nada y la tarea sigue a aprobación.
- Si el merge entra limpio, la verificación se vuelve a correr sobre el resultado, y solo si queda en ok la tarea pasa a aprobación.
- Si hay conflicto, el merge **no** se aborta: los marcadores quedan en el worktree. La tarea vuelve a `construccion` con una nota que lista los archivos en conflicto. Esa lista también se escribe como BLOQUEANTE en `## Hallazgos de revisión`. La vuelta cuenta para `max_vueltas`.
- `fabrica/commands/correr.md` instruye al constructor, cuando vuelve por un conflicto, a resolverlo conservando la intención de las dos ramas. No hace commit; el commit lo hace el orquestador al cerrar.
- `mover` a `aprobacion` se rechaza si la tarea tiene un conflicto sin resolver (archivos con marcadores o un `MERGE_HEAD` pendiente en el worktree).

### Archivos o zonas que toca
- `fabrica/hooks/register.tsx` (herramienta nueva), `fabrica/hooks/tareas.ts` (regla de transición), `fabrica/commands/correr.md` y pruebas.

### Fuera de alcance
- Rebase. Se usa merge para no reescribir el historial de la tarea.

## Integrar automáticamente en la rama de origen al pasar a hecho

### Objetivo
Que cada tarea aprobada termine dentro de la rama donde empezó el trabajo, sin que el usuario integre a mano.

### Criterios de aceptación
- Cuando `mover(T, "hecho")` pasa la validación actual (`fabrica/hooks/tareas.ts:315`), el mod, antes de escribir el estado:
  1. Comprueba que la rama activa en la raíz sea `rama_origen`.
  2. Corre `git -C <raíz> merge --ff-only fabrica/<id>`.
- Si el fast-forward sale bien, la tarea queda en `hecho` con un campo nuevo `integrada: <hash>`. El toast dice «F-0xx integrada en <rama>».
- La tarea no se integra y va a `necesita-humano`, con una nota clara que se lee sola, en estos casos:
  - la raíz está en otra rama;
  - el fast-forward no es posible porque la rama de origen avanzó desde la sincronización. La nota dice que se vuelva a sincronizar;
  - git se niega porque los cambios sin commit del usuario tocan los mismos archivos. La nota los lista.
- **Nunca** se usa `--force`, `reset`, `stash` ni `checkout` sobre la copia de trabajo del usuario, y **nunca** se hace `push`. Los cambios sin commit del usuario quedan intactos.
- La clave nueva `integracion: auto | manual` en `config.md` vale `auto` por defecto. Con `manual` se mantiene el comportamiento de hoy.
- `fabrica/commands/correr.md` (sección «aprobacion» y «Reglas que no se negocian») se actualiza: el orquestador hace el commit en el worktree y `mover` integra. La regla 3 queda como «Nunca hagas push».
- Hay pruebas de la función pura que decide qué hacer (integrar, a humano por rama distinta, a humano por avance de la rama de origen, a humano por archivos sucios).

### Archivos o zonas que toca
- `fabrica/hooks/register.tsx` (`hMover`), `fabrica/hooks/tareas.ts`, `fabrica/commands/correr.md`, `fabrica/README.md`, `fabrica/docs/puente-orquestador.md` y, en la app, `src/lib/fabrica/motor/formato.ts`, `tipos.ts` y el tablero, para mostrar «integrada».

### Fuera de alcance
- Borrar la rama `fabrica/<id>` o su worktree tras integrar.
- `push` o PR.

## Declarar dependencias entre tareas

### Objetivo
Que una tarea que necesita a otra no arranque antes de tiempo ni pregunte «¿desde qué base construyo?».

### Criterios de aceptación
- El frontmatter de una tarea acepta `depende_de: F-009,F-007`. Se puede escribir al crearla, con `mcp__fabrica__nueva` y desde la app, y el documento de requerimientos lo admite como subsección `### Depende de`.
- `/fabrica:correr` no saca de `pendiente` una tarea cuyas dependencias no estén todas en `hecho` **e integradas**. En el cierre la muestra como «esperando a F-0xx».
- Una dependencia `descartada` deja la tarea en `necesita-humano` con ese motivo.
- Un ciclo de dependencias se detecta al crear o editar la tarea y se rechaza.
- `mcp__fabrica__estado` devuelve las dependencias, y el tablero de la app las muestra.

### Archivos o zonas que toca
- `fabrica/hooks/tareas.ts`, `fabrica/hooks/register.tsx`, `fabrica/commands/correr.md` y `nueva.md`, y en la app `src/lib/fabrica/requerimientos.ts` y el tablero.

### Fuera de alcance
- Deducir dependencias solas a partir del código.

## Avisar cuando dos tareas en paralelo tocan los mismos archivos

### Objetivo
Evitar choques como el de F-010 y F-013, que salieron del mismo commit y editaron el mismo controller y el mismo JS.

### Criterios de aceptación
- Antes de lanzar una ronda en paralelo, el orquestador compara las secciones «Archivos o zonas que toca» de las tareas candidatas. Si dos comparten un archivo, la de id mayor espera a que la otra quede integrada, y en el cierre se dice por qué.
- Al terminar la construcción de una tarea, `mcp__fabrica__estado` informa los archivos que cambió. Si otra tarea activa cambió alguno de ellos, se anota una advertencia en la bitácora de las dos.

### Archivos o zonas que toca
- `fabrica/commands/correr.md`, `fabrica/hooks/register.tsx` y `fabrica/hooks/tareas.ts`.

### Fuera de alcance
- Resolver el choque. Eso lo hace la sincronización con la rama de origen.

## Exigir la spec cuando la tarea depende de otras o reutiliza código

### Objetivo
Que Jev no se salte la spec en tareas donde el pedido cita piezas que quizás no existen en la base. En F-010 la spec citaba `MensajeErrorUsuario`, que solo estaba sin commit en la copia del usuario.

### Criterios de aceptación
- `decidirSpec` (en `fabrica/hooks/jev.ts`) devuelve «hay que hacerla», sin consultar a Jev, en dos casos:
  - la tarea tiene `depende_de`;
  - su pedido nombra métodos, clases o archivos existentes en «Archivos o zonas que toca» con la palabra «reutiliza» o «existente».
- El agente de spec recibe la instrucción de verificar cada símbolo o archivo citado con `git show <rama_origen>:<ruta>`, no contra la copia de trabajo. Si no existe en la base, devuelve `PEDIDO AMBIGUO`.
- Hay pruebas de las dos reglas nuevas de `decidirSpec`.

### Archivos o zonas que toca
- `fabrica/hooks/jev.ts`, `fabrica/agents/spec-escritor.md` y pruebas.

### Fuera de alcance
- Cambiar los umbrales medidos de Jev.

## Verificación opcional de scripts SQL

### Objetivo
Que los scripts SQL que produce la fábrica se comprueben al menos sintácticamente. En WolffWebNET10 se aprobaron 8 scripts que nunca se ejecutaron.

### Criterios de aceptación
- `config.md` acepta la clave opcional `sql` con un comando que recibe `{archivos}`, los `.sql` nuevos o modificados de la tarea (por ejemplo, `sqlcmd` con `SET PARSEONLY ON` contra una base de prueba).
- `hVerificar` lo corre después de lint, solo si hay archivos `.sql` en el cambio, y lo anota como un paso más del informe.
- Sin la clave `sql`, el informe de la tarea y el tablero muestran «SQL sin verificar: N archivos», en vez de no decir nada.
- Las credenciales nunca van en `config.md`. El comando las toma del entorno, y así lo documenta `fabrica/README.md`.

### Archivos o zonas que toca
- `fabrica/hooks/register.tsx` (`hVerificar`), `fabrica/README.md` y el tablero de la app.

### Fuera de alcance
- Ejecutar los scripts contra una base real.

## Corregir la sección Pruebas del informe de la corrida

### Objetivo
Que el informe no afirme pruebas que no se corrieron.

### Criterios de aceptación
- `src/lib/fabrica/motor/informes.ts:244` escribe «Las tareas que se verificaron en esta corrida corrieron sus pruebas unitarias» solo si en la corrida hubo al menos una verificación.
- Sin verificaciones, la sección dice «No se verificó ninguna tarea en esta corrida».
- Hay una prueba con una corrida sin verificaciones.

### Archivos o zonas que toca
- `src/lib/fabrica/motor/informes.ts` y su prueba.

### Fuera de alcance
- Otras secciones del informe.

## Evitar que dos orquestadores trabajen la misma tarea

### Objetivo
Que la app y una sesión de Claude Code no avancen ni hagan commit de la misma tarea a la vez.

### Criterios de aceptación
- `mover` registra en el frontmatter `tomada_por` (id de la sesión) y `tomada_hasta` (ahora + 30 min) al sacar una tarea de `pendiente`, y los renueva en cada movimiento.
- Mientras no venza, un `mover` desde otra sesión se rechaza con un mensaje que dice quién la tiene y hasta cuándo.
- `hecho`, `descartada` y `necesita-humano` liberan la tarea.
- El tablero muestra qué tareas están tomadas y por quién.

### Archivos o zonas que toca
- `fabrica/hooks/tareas.ts`, `fabrica/hooks/register.tsx`, `fabrica/docs/puente-orquestador.md` y el tablero.

### Fuera de alcance
- Bloqueos entre máquinas distintas.

## Convertir hallazgos MENORES en tareas de deuda

### Objetivo
Que los hallazgos menores de las revisiones no se pierdan dentro de cada tarea terminada.

### Criterios de aceptación
- El tablero tiene una vista «Deuda» que junta los MENORES de `## Hallazgos de revisión` de las tareas en `hecho`, con la tarea de origen y `ruta:línea`.
- Cada hallazgo tiene un botón «Crear tarea». Crea una tarea `pendiente` cuyo pedido cita el hallazgo y la tarea de origen.
- Un hallazgo convertido queda marcado y no se vuelve a ofrecer.

### Archivos o zonas que toca
- El tablero de la app, `src/lib/fabrica/` y `src/app/api/fabrica/`.

### Fuera de alcance
- Crear tareas automáticamente sin que el usuario lo pida.

## Reducir el ruido de verificación en los worktrees

### Objetivo
Quitar fricción que se repite en todas las tareas.

### Criterios de aceptación
- **`node_modules`:** si el proyecto tiene un `node_modules` en la raíz, al crear el worktree se crea un enlace (junction en Windows) al de la raíz, en vez de obligar a `npm install` en cada verificación. Si hay lockfile y cambió en la tarea, no se enlaza.
- **Finales de línea:** si el repo usa CRLF (por `core.autocrlf` o `.gitattributes`), el orquestador normaliza los archivos nuevos de la tarea antes del commit, y git no emite avisos LF→CRLF.
- **Servidores MCP:** la sección «Problemas» del informe dice qué servidor MCP no conectó. Si ningún agente de la corrida lo usó, sale como nota y no como problema.

### Archivos o zonas que toca
- `fabrica/commands/correr.md`, `fabrica/hooks/register.tsx` y `src/lib/fabrica/motor/informes.ts`.

### Fuera de alcance
- Cambiar la configuración de git del usuario.
