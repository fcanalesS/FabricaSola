# Listado de mejoras de la fábrica

Recogido el 19-10-2026, a partir de las corridas sobre WolffWebNET10. El detalle de cada punto, con criterios de aceptación y archivos, está en `Plan-MejorasFabrica.md`.

**Decisiones ya tomadas:**
- Los worktrees salen de la rama de origen, la rama activa al iniciar la tarea.
- Los conflictos los resuelve el constructor dentro del worktree.
- Al terminar, la tarea se integra sola con fast-forward. Nunca se hace push.
- Los comandos de build, test y lint se reconocen por proyecto.

## Configuración por proyecto

| # | Mejora | Problema que resuelve | Dónde |
|---|---|---|---|
| 1 | Detectar build, test y lint al crear la fábrica desde la app, usando la tabla de `/fabrica:init` y el `CLAUDE.md` del proyecto | La app crea `config.md` con los comandos vacíos, y la primera corrida no sirvió para nada | `src/lib/fabrica/motor/proyecto.ts:204-240` |
| 2 | Ver, editar y probar los comandos del proyecto activo en la configuración («Probar comandos») | Los comandos se rellenaban a mano y sin probar | `src/components/configuracion/fabrica.tsx`, `api/fabrica/ajustes` |
| 3 | Deshabilitar «Correr» si no hay comandos de verificación | Corridas que gastan agentes y terminan todas en `necesita-humano` | `api/fabrica/route.ts`, `motor/corridas.ts` |
| 4 | Lint solo sobre lo que cambió la tarea (`{archivos}` + `lint_extensiones`) | El lint de todo el proyecto falla por errores previos (unos 640 en WolffWeb) | `hooks/register.tsx` (`hVerificar`) |

## Ramas e integración

| # | Mejora | Problema que resuelve | Dónde |
|---|---|---|---|
| 5 | Guardar `rama_origen` y crear el worktree desde ella | Tareas bloqueadas preguntando «¿desde qué base construyo?» (F-010 a F-014) | `commands/correr.md`, `hooks/register.tsx`, `hooks/tareas.ts` |
| 6 | Comparar contra el merge-base y no contra la rama local | Codex revisó unos 2585 archivos contra un `main` atrasado y marcó bloqueantes falsos | `hooks/externos.ts:61-64`, `hooks/register.tsx:527-530` |
| 7 | Traer la rama de origen al worktree antes de aprobar y devolver los conflictos al constructor | Los conflictos aparecían recién al integrar a mano (F-010 con F-013) | herramienta nueva `sincronizar`, `commands/correr.md` |
| 8 | **Integrar automáticamente en la rama de origen al pasar a `hecho`** (`merge --ff-only`, sin push, sin tocar cambios sin commit) | La integración se hacía a mano | `hooks/register.tsx` (`hMover`), `hooks/tareas.ts:315` |
| 9 | Dependencias entre tareas (`depende_de`) | Tareas que arrancan antes que aquello de lo que dependen | `hooks/tareas.ts`, `commands/correr.md`, `nueva.md` |
| 10 | Avisar o serializar cuando dos tareas en paralelo tocan los mismos archivos | F-010 y F-013 chocaron en el controller y en el JS | `commands/correr.md`, `hooks/register.tsx` |

## Calidad de lo que se construye

| # | Mejora | Problema que resuelve | Dónde |
|---|---|---|---|
| 11 | Spec obligatoria si la tarea depende de otras o reutiliza código, comprobando cada cita en la base | Jev se saltó todas las specs, y F-010 citaba `MensajeErrorUsuario`, que no existía en la base | `hooks/jev.ts`, `agents/spec-escritor.md` |
| 12 | Paso opcional `sql` en la verificación, o la marca «SQL sin verificar: N» | 8 scripts aprobados sin parsear ni ejecutar nunca | `hooks/register.tsx` (`hVerificar`) |
| 13 | Vista «Deuda» con los hallazgos MENORES y un botón para crear una tarea de cada uno | Los menores se pierden dentro de cada tarea (`ex.Message`, TOCTOU, contraste…) | tablero de la app |

## Operación y ruido

| # | Mejora | Problema que resuelve | Dónde |
|---|---|---|---|
| 14 | Bloqueo por tarea (`tomada_por`, `tomada_hasta`) | La app y una sesión de Claude Code trabajaron las mismas tareas | `hooks/tareas.ts`, `hooks/register.tsx` |
| 15 | Que el informe diga «corrieron sus pruebas» solo si hubo verificaciones | Corridas con 0 tareas movidas afirmaban que se corrieron pruebas | `src/lib/fabrica/motor/informes.ts:244` |
| 16 | Enlazar `node_modules` de la raíz en los worktrees | `npm install` en cada verificación | `commands/correr.md` |
| 17 | Normalizar finales de línea (CRLF) antes del commit | Avisos LF→CRLF en cada commit | `commands/correr.md` |
| 18 | Decir qué servidor MCP no conectó y si alguien lo usó | «1 servidor MCP no conectó» en todos los informes | `motor/informes.ts` |

## Orden sugerido

1. Del 1 al 3: configuración por proyecto.
2. 5, 6, 7 y 8: rama de origen e integración automática.
3. 9 y 10: dependencias y choques.
4. El resto según haga falta.
