# Puente para un orquestador externo

Este es el contrato para conectar a la fábrica un orquestador que vive fuera de Claude Code
(por ejemplo una app con un modelo Live2D). Permite que ese orquestador **vea** la fábrica en
vivo, **encole** tareas y **dé su veredicto** sobre las que llegan a aprobación.

Todo pasa por archivos de `factory/` en la raíz del proyecto y, opcionalmente, por un POST HTTP.
No hace falta que el orquestador hable con Claude ni conozca el modelo.

## Lo que puede leer

| Archivo | Qué es |
|---|---|
| `factory/config.md` | Comandos, rama base, `aprobacion`, `puente_url`. Frontmatter plano `clave: valor`. |
| `factory/tareas/<id>-<slug>.md` | Una tarea. Frontmatter con el estado; cuerpo con Pedido, Spec, Hallazgos, Veredicto, Para la memoria, Bitácora. |
| `factory/eventos.jsonl` | Un movimiento por línea, en orden. Solo se añade, nunca se reescribe. |

### Frontmatter de una tarea

```yaml
id: F-001
titulo: Exportar clientes a CSV
estado: revision          # pendiente | spec | construccion | revision | verificacion |
                          # aprobacion | necesita-humano | hecho | descartada
vueltas: 1                # vueltas de retrabajo hechas
verificacion: pendiente   # pendiente | ok | fallo
aprobacion_agente: pendiente   # pendiente | aprobada | rechazada
rama: fabrica/F-001
worktree: C:/proyectos/MiRepo-fabrica/F-001
motivo: ""                # por qué espera a un humano, si espera
creada: 2026-10-16T12:00:00.000Z
actualizada: 2026-10-16T12:20:00.000Z
en_aprobacion_desde: ...  # solo una vez que entró en aprobación
depende_de: F-009,F-007   # opcional: no arranca hasta que esas estén hechas e integradas
origen_entrada: github:dueno/repo#132   # opcional: por dónde entró (formulario, o el issue); se escribe al crearla
titulo_ajeno: si          # opcional: el título lo escribió otra persona; lo que habla en voz alta dice solo el id
rama_origen: desarrollo   # la rama de trabajo de config, o la activa en la raíz, al crear el worktree; no se pisa; nunca main ni master
sincronizada: ...         # cuándo trajo la rama de origen por última vez; se borra al volver a construcción
conflicto: a.cs,b.js      # los archivos del último conflicto al sincronizar, si lo hubo
integrada: 3f2a9c1e...    # el commit de la rama de origen después del fast-forward, al pasar a hecho
tomada_por: <sesión>      # la sesión de Claude Code que la trabaja…
tomada_hasta: ...         # …y hasta cuándo; se renueva con cada movimiento
sql_sin_verificar: 2      # los .sql de la tarea que no verificó nadie (config sin `sql`)
bloqueo: rama             # por qué no se integró, si es mecánico: rama | sucios | avanzo
```

`depende_de`, `origen_entrada` y `titulo_ajeno` se escriben al crear la tarea y no cambian después;
el resto de esos campos los escribe solo el mod.

### Una línea de `eventos.jsonl`

```json
{"ts":"2026-10-16T12:20:00.000Z","tarea":"F-001","de":"revision","a":"verificacion","agente":"orquestador","nota":"sin bloqueantes"}
```

- `de` es `null` cuando la tarea se crea.
- `de` igual a `a` es un evento dentro de la misma etapa: el resultado de una verificación
  (`agente: "fabrica"`) o el veredicto del aprobador (`agente: "fabrica:aprobador"`).
- Los eventos que más interesan para reaccionar:
  - `a: "necesita-humano"` → hay que llamar la atención del usuario; `nota` dice por qué.
  - `a: "aprobacion"` → si `aprobacion` en config es `externa` o `ambas`, **te toca revisar**.
  - `a: "hecho"` → la tarea terminó. Con `integracion: auto` ya está integrada en su rama de
    origen (`integrada` en el frontmatter); con `manual`, su rama queda para que el usuario la integre.

## Lo que puede escribir

### Veredicto sobre una tarea en aprobación

Con `aprobacion: externa` o `ambas` en `factory/config.md`, ninguna tarea se da por hecha sin
un veredicto externo. El orquestador lo deja en:

`factory/veredictos/<id>.json`

```json
{
  "tarea": "F-001",
  "veredicto": "aprobada",
  "motivo": "Los cinco criterios se cumplen; probé la exportación con 3 clientes.",
  "por": "live2d",
  "fecha": "2026-10-16T12:31:00.000Z"
}
```

- `veredicto`: `aprobada` o `rechazada`. Cualquier otro valor se ignora.
- `motivo`: si es `rechazada`, **qué** falla y **dónde**. Ese texto llega tal cual al agente que
  construye en la siguiente vuelta.
- Solo cuenta un veredicto **escrito después** de que la tarea entró en aprobación (se compara la
  fecha de modificación del archivo con `en_aprobacion_desde`). Al volver a aprobación tras un
  retrabajo, hay que escribir el archivo otra vez; el viejo no vale.
- Al aparecer un veredicto, la sesión de Claude muestra un aviso y sugiere `/fabrica:correr <id>`.

Para revisar, el orquestador tiene lo mismo que el aprobador interno: la `## Spec` de la tarea
(criterios de aceptación numerados), `## Hallazgos de revisión` y el worktree de la rama
(`git -C <worktree> diff $(git -C <worktree> merge-base HEAD <rama_origen>)`, o `rama_base` si la
tarea no tiene `rama_origen`).

### Respuesta a una tarea que espera a un humano

Con la tarea en `necesita-humano`, la pregunta está en su `motivo`. La respuesta va en
`factory/respuestas/<id>.json`:

```json
{ "tarea": "F-001", "texto": "(1) usa el .venv si existe. (2) 30 segundos.", "por": "live2d",
  "fecha": "2026-10-16T19:22:05.610Z", "pregunta": "<el motivo que contesta>" }
```

- Solo cuenta si `fecha` es posterior al `actualizada` de la tarea: una respuesta a un bloqueo
  anterior ya se usó. Si la fábrica vuelve a preguntar (`necesita-humano → necesita-humano`), hay
  que escribir el archivo de nuevo.
- Conviene copiar la respuesta también en la tarea, en una sección `## Respuesta del humano` (antes
  de `## Bitácora`), para que los agentes la lean. El orquestador web lo hace solo.
- La tarea no se mueve hasta la próxima `/fabrica:correr`, que la retoma en la etapa donde se
  bloqueó. Una guarda de otro plugin que exige la firma del dueño no se salta con una respuesta.

### Encolar una tarea

Crear `factory/tareas/F-<n>-<slug>.md` con `estado: pendiente` y una sección `## Pedido`. Un
archivo nuevo que nazca en otro estado lo rechaza la guarda cuando lo escribe Claude; desde fuera
no hay guarda, así que **respeta tú esa regla**. El id tiene que ser el siguiente libre (`F-` y
tres dígitos). Plantilla mínima:

```markdown
---
id: F-007
titulo: Botón de reimprimir boleta
estado: pendiente
vueltas: 0
verificacion: pendiente
aprobacion_agente: pendiente
rama: fabrica/F-007
worktree: ""
motivo: ""
creada: 2026-10-16T13:00:00.000Z
actualizada: 2026-10-16T13:00:00.000Z
---

## Pedido

Lo que hay que hacer, con todo el contexto.

## Bitácora

- 2026-10-16T13:00:00.000Z · creada por live2d
```

### Lo que NO debe escribir

La memoria (`factory/memoria/`) la escribe una persona: un orquestador externo propone (como un
agente), no escribe reglas ni decisiones. El mod frena a cualquier subagente que lo intente con Edit
o Write. Para proponer, agrega un `### Título` con sus `- clave: valor` a la sección
`## Para la memoria` de la tarea antes de que pase a `hecho` (el formato está en el README del
plugin): al terminarla, el mod la deja en `factory/memoria/propuestas/` y anota la tarea en
`factory/memoria/bitacora/`.

El estado (`estado`, `vueltas`, `verificacion`, `aprobacion_agente`, `en_aprobacion_desde`,
`rama_origen`, `sincronizada`, `conflicto`, `integrada`, `tomada_por`, `tomada_hasta`,
`sql_sin_verificar`) de una tarea existente. Esos campos los cambia solo el mod, para que el
registro sea fiable. Hay dos excepciones, las dos de la aplicación de compañía:

- Al terminar una corrida suya que se detuvo o se cayó, suelta `tomada_por` y `tomada_hasta` de
  las tareas que tenía esa sesión, que no alcanzó a soltarlas.
- Cuando el usuario descarta con un clic una tarea en `pendiente`, `spec` o `construccion` (las
  etapas desde las que el mod deja pasar a `descartada`), sin una corrida en marcha y sin que la
  tenga tomada ninguna sesión, la pasa a `descartada`. Cambia solo `estado` y `actualizada`, deja
  la línea en `## Bitácora` y el movimiento en `eventos.jsonl` con el usuario como agente. Su
  worktree y su rama quedan como estaban. Lo decidió el usuario el 20 de octubre de 2026.

Si el orquestador quiere pedir algo más ("pausa F-003", "reabre F-002"), que se lo diga al
usuario: él decide en la sesión de Claude.

## Recibir los eventos por HTTP

Con `puente_url: http://127.0.0.1:<puerto>/<ruta>` en `factory/config.md`, el mod envía un POST
por cada línea que añade a `eventos.jsonl`:

```http
POST /<ruta>
content-type: application/json

{"tipo":"fabrica.evento","proyecto":"C:/proyectos/MiRepo","ts":"...","tarea":"F-001","de":"revision","a":"verificacion","agente":"orquestador","nota":"..."}
```

- Se envía y se olvida: si el orquestador no contesta, la fábrica sigue igual.
- Solo `http`/`https`. Para algo local usa `127.0.0.1`.
- Si se pierde un POST, `eventos.jsonl` tiene todo: al arrancar, el orquestador debería leer ese
  archivo y quedarse con lo que no había visto.

## Resumen del ciclo con aprobación externa

```
pendiente → spec → construccion → revision → verificacion → aprobacion ──► hecho
                        ▲              │            │            │
                        └──────────────┴────────────┴── retrabajo (cuenta vueltas)
                                                                 │
                         orquestador externo: lee la tarea, escribe veredictos/<id>.json
```
