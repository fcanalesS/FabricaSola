# Fábrica

Una fábrica de software para Claude Code, como plugin de usuario que sirve para cualquier proyecto.
Cada tarea pasa por una cadena fija de agentes:

```
pedido → spec → construcción → revisión (código · seguridad · UI/UX) → verificación → sincronización → aprobación → integrada
                  ▲              │                                       │              │                │
                  └──────────────┴───────────────────────────────────────┴──────────────┴────────────────┘ retrabajo (máx. N vueltas,
                                                                                                           luego a un humano)
```

Trae sus propios agentes para cada etapa, así que funciona sin nada más instalado. Si tienes
`nikke`, usa los suyos donde los hay (construir y revisar). Cada etapa es un rol configurable.

## Lo que no hace (léelo primero)

- **Nunca hace push.** Cada tarea sale de la rama en que estás trabajando y, al terminar, se
  integra en ella **en local** con un fast-forward (`integracion: auto`). Si no se puede sin tocar
  tu copia de trabajo, no lo fuerza: la tarea te espera con el motivo. Con `integracion: manual`,
  deja la rama `fabrica/<id>` y la integras tú.
- **Sin pruebas en el proyecto, la verificación solo compila.** `/fabrica:init` lo avisa. La
  revisión de los agentes ayuda, pero no reemplaza a las pruebas.
- **Las tareas ambiguas se detienen.** Si el pedido no alcanza para especificar o el constructor
  pregunta, la tarea queda en "espera a un humano" con la pregunta. Es a propósito. Se contesta
  desde el orquestador web (o escribiendo `factory/respuestas/<id>.json`), y `/fabrica:correr` la
  retoma en la etapa donde se bloqueó; si la respuesta no alcanza, vuelve a preguntar.
- **Una guarda que pide la firma del dueño no se salta con una respuesta escrita.** Si otro plugin
  (por ejemplo nikke) bloquea una acción hasta que tú autorices, la tarea espera hasta que lo
  hagas en una sesión de Claude Code. Las corridas del orquestador web van sin nikke por eso.
- **Cuesta tokens.** Una tarea pasa por 5–7 agentes; los revisores van en Sonnet para abaratar, y el
  modelo de cada rol se elige en config (ver «El modelo de cada rol»).
- **Sin git, no hay paralelo:** las tareas corren de una en una en la carpeta del proyecto.
- El tablero se refresca cada 4 s leyendo `factory/`; con cientos de tareas convendría archivar
  las hechas.
- La guarda que impide editar el estado a mano mira las herramientas Edit y Write de Claude. Un
  comando de shell, u otro programa, podría cambiar el archivo igual: `mover` sigue validando
  cada transición, pero lo que se escriba por fuera no queda en la bitácora.
- **Los agentes se leen al empezar la sesión.** Una copia editable nueva, o un cambio en una, vale
  desde la próxima sesión de Claude Code.
- **Los agentes por defecto no tienen personalidad ni contexto propio** del proyecto: siguen las
  reglas de la cadena (alcance estricto, BLOQUEANTE/MENOR) y lo que diga `CLAUDE.md`. Para
  afinarlos a tu proyecto, crea una copia editable.

## Uso

En cualquier proyecto:

```
/fabrica:init                          detecta build/test/lint y crea factory/
/fabrica:nueva "exportar clientes a CSV desde el mantenedor"
/fabrica:correr                        procesa la cola (en paralelo si hay git)
/fabrica:correr F-002                  solo esa tarea
/fabrica:agentes                       qué agente hace cada etapa
/fabrica:agentes copiar construccion   copia editable del constructor en .claude/agents
/tablero                               tablero en vivo
```

La línea de estado bajo el prompt muestra el resumen (`fábrica · 2 en curso · ⚠ 1 esperan humano`)
y aparece un aviso cuando una tarea necesita a alguien o termina.

## Qué hay en factory/

```
factory/
  config.md          comandos, rama base, max_vueltas, paralelo_max, ui, aprobacion, puente_url
  tareas/F-001-*.md  una tarea por archivo: frontmatter (estado) + Pedido, Spec, Hallazgos, Bitácora
  eventos.jsonl      cada movimiento, una línea JSON
  veredictos/        veredictos de un orquestador externo (opcional)
  memoria/           lo que el proyecto ya decidió (opcional; ver «La memoria del proyecto»)
  habilidades.md     qué habilidad de Claude Code usa cada etapa, y cuándo (opcional; lo escribe una persona)
  procesos/          cómo se publica, paso a paso (opcional; lo escribe una persona; todavía no corre)
```

Los worktrees van fuera del repo, en `../<repo>-fabrica/<id>`.

## La memoria del proyecto

Lo que la fábrica no puede olvidar de un proyecto: su stack, sus decisiones de arquitectura y lo
que no se usa. Así una corrección de dentro de un año sigue sabiendo que el proyecto usa
PostgreSQL y no propone otra base de datos.

### Qué es el vault

Archivos Markdown, sin base de datos ni índice: se leen con `grep` y con cualquier IA. Hay uno por
proyecto, en su repositorio (`factory/memoria/`, versionado con el código), y uno de la planta, que
vale en todos los proyectos y vive en este equipo (`datos/memoria/` de la aplicación, que lo pasa a
cada corrida como `FABRICA_MEMORIA_PLANTA`). Si los dos dicen algo distinto,
manda el del proyecto.

```
factory/memoria/
  LEEME.md                  el formato en una página, para la IA que llegue sin contexto
  ficha.md                  lo que entra siempre: una regla por línea, «- [tema] Texto. (D-0001)»;
                            lo prohibido, «- [tema] NO: …». Hasta 150 líneas u 8 KB
  decisiones/D-NNNN-*.md    una decisión por archivo, con su porqué. No se borra: se reemplaza
  propuestas/P-NNNN-*.md    lo que propuso un agente, hasta que una persona lo aprueba o lo rechaza
  bitacora/AAAA-MM.md       una línea por tarea terminada: qué tocó y qué decisiones aplicó
```

Decisiones y propuestas tienen frontmatter plano (`id`, `titulo`, `estado`, `fecha`, `temas`,
`origen`…) y las secciones fijas `## Decisión`, `## Por qué`, `## Qué se descartó` y
`## Qué implica`. Para buscar:

```bash
grep -n "\[base-de-datos\]" factory/memoria/ficha.md              # las reglas de un tema
grep -n "NO:" factory/memoria/ficha.md                             # lo que no se usa
grep -rl "^temas:.*base-de-datos" factory/memoria/decisiones/      # las decisiones de un tema
grep -rl "^estado: vigente" factory/memoria/decisiones/            # las que valen hoy
grep -rl "^estado: propuesta" factory/memoria/propuestas/          # lo que espera a una persona
```

### Quién escribe qué

- **La aplicación lo crea** (Configuración, o al crear la `factory/`), con lo que dicen
  los manifiestos del proyecto (base de datos con su driver, framework, versiones) **como
  propuestas**: la ficha nace vacía.
- **Solo una persona escribe reglas.** En la pantalla Memoria de la aplicación (`/fabrica/memoria`)
  aprueba una propuesta (la decisión con el siguiente `D-`, su regla en la ficha y la propuesta como
  aprobada), la rechaza con un motivo, la corrige, reemplaza una decisión (la vieja queda
  `reemplazada`, enlazada a la nueva) o edita la ficha a mano. La aplicación escribe los archivos y
  no hace commit: lo hace él.
- **Los agentes proponen, y el mod anota.** Las propuestas salen de la tarea, y la bitácora la
  escribe el mod al terminarla (abajo).

### Cómo la usa la fábrica

Si el proyecto tiene `factory/memoria/`, la fábrica no trabaja sin consultarla:

- `mcp__fabrica__estado` trae `memoria.paraLosAgentes`: la ficha del proyecto y, si la corrida trae
  `FABRICA_MEMORIA_PLANTA` (la carpeta del vault de la planta), la de la planta, enteras y leídas
  **de la raíz**. Lo aprobado y todavía sin commit también cuenta.
- El orquestador se lo pasa a la spec, al constructor, a los revisores y al aprobador. Una tarea no
  contradice una regla ni una decisión vigente: si el pedido lo pide, va a un humano con la regla
  citada; si el código lo hace, es un BLOQUEANTE.
- Al pasar a spec, si el pedido nombra algo que una ficha prohíbe (`- [tema] NO: …`), la sospecha
  queda en la bitácora de la tarea, y la spec no se salta aunque Jev diga que el pedido ya es una.
- Los agentes no escriben en el vault: lo que debería recordarse lo proponen, y decide una persona.
  El mod frena a cualquier subagente que use Edit o Write en `factory/memoria/` (o en la carpeta de
  la planta), igual que con `config.md`, aunque escriba la ruta de otra forma (`./`, `..`).
- Lo que proponen va en la sección `## Para la memoria` de la tarea: un `### Título` por propuesta,
  con `- temas:`, `- regla:`, `- decision:`, `- por que:`, `- descartado:`, `- implica:` y
  `- propone:`. El agente de spec la escribe ahí; lo del constructor lo copia el orquestador.
- Al pasar a `hecho` (no si se desvía a un humano), el mod escribe en el vault **de la raíz**, no en
  la rama de la tarea: cada propuesta como `propuestas/P-NNNN-<titulo>.md` con `estado: propuesta`,
  y la línea de la tarea en `bitacora/AAAA-MM.md` (los archivos que tocó y las decisiones que cita).
  No crea una propuesta que ya está en el vault (mismo título, o mismos temas y regla, también si
  fue rechazada), ni una sin temas o sin decisión, ni una que copie el texto del pedido cuando el
  pedido vino de un issue. Lo que no propuso, y por qué, queda en la bitácora de la tarea.

## Las habilidades de la línea

`factory/habilidades.md` dice qué habilidad de Claude Code (`SKILL.md`, del proyecto en
`.claude/skills/` o de la persona) usa cada etapa, y cuándo: `- [construccion] wolff-db: antes de
escribir SQL contra wolff.`. Sin una línea ahí, la fábrica no usa una habilidad aunque exista. Lo
crea la aplicación con la memoria y lo escribe una persona.

- Las corridas que lanza la aplicación le dan a cada etapa con habilidades un agente con ellas ya
  cargadas (`skills:` en `--agents`), con el nombre `fabrica-hab-<rol>`: una copia del agente que
  la etapa usaría. `mcp__fabrica__estado` lo pone primero en `roles`, y el orquestador usa el
  primero que exista. Si el orquestador lanza el de siempre teniendo ese, el mod lo frena
  (`frenaSinHabilidades`) y le dice cuál usar: en la corrida real del 27 de octubre de 2026 lanzó
  los de siempre, y las especialidades no llegaron. En una corrida lanzada a mano ese agente no
  existe: la etapa usa el de siempre, sin las habilidades cargadas.
- `mcp__fabrica__estado` trae `habilidades.paraLosAgentes` (qué usa cada etapa y cuándo), que el
  orquestador le pasa a cada agente con la memoria.
- Un agente de una etapa que invoca con `Skill` una habilidad que su etapa no tiene en el
  catálogo: el mod lo frena. Los agentes de la fábrica no traen `Skill`; esto cubre a los de otros
  plugins o del proyecto.
- **Registro.** La aplicación pasa a la corrida, en `FABRICA_HABILIDADES`, la huella de cada
  `SKILL.md` al empezar (FNV-1a de su contenido: sirve también para las que no están en un
  repositorio). Cuando el orquestador lanza un `fabrica-hab-<rol>`, el mod anota en la bitácora de
  su tarea `habilidades (etapa): nombre@huella (suya | del proyecto)`, y si alguna cambió desde que
  empezó la corrida. La línea del mes en `bitacora/` suma `habilidades: a, b`. El informe de
  rendimiento dice, por habilidad, en cuántas tareas la trajo un agente y cuántas volvieron a
  construcción después.
- **Guardia.** Ningún subagente escribe `factory/habilidades.md` ni `.claude/skills/` (el mod lo
  frena con Edit y Write, como la memoria y `config.md`); el hilo principal sí.
- **Habilidades que proponen los agentes.** Un agente que hizo a mano algo que se repite puede
  proponer una habilidad en `## Para la memoria`: `- habilidad: nombre`, `- etapas:`, `- cuando:` y
  cada archivo como `- skill:` (el `SKILL.md`) o `- archivo: ruta`, con su texto debajo con
  sangría. Al pasar a `hecho`, el mod la deja en `propuestas/` como las demás, con `habilidad`,
  `etapas` y `cuando` en el frontmatter y los archivos en `## Archivos`. No la crea si su nombre ya
  es una habilidad del proyecto o ya se propuso, ni si le falta el `SKILL.md`, su `description` o
  una etapa válida, ni si copia el texto del issue de donde vino el pedido.
- **Pantalla.** En la aplicación, la pantalla Memoria tiene la pestaña Habilidades:
  lo que usa cada etapa, las que existen y no se usan (para asignarlas a una etapa), en cuántas
  tareas de la bitácora estuvo cada una, y el catálogo para escribirlo a mano. Una propuesta de
  habilidad se ve con sus archivos enteros; si trae scripts (lo que no es `.md` ni `.txt`), no se
  aprueba sin marcar que se leyeron. Aprobarla escribe `.claude/skills/<nombre>/` y su línea en el
  catálogo, sin commit; nunca encima de una habilidad que exista, del proyecto o de la persona.

## Los procesos de la línea

`factory/procesos/<id>.md` dice cómo se publica lo que la fábrica termina, paso a paso. Los corre
el código de la aplicación, con un clic de la persona (o solo al integrar, si lo
encendió), no un modelo. Corren los `comando`, los `salud`, el `push` con su PR, el `ci`, el
`aprobacion` (que espera el clic de la persona), el `vulnerabilidades` y el `evaluacion`; un `tarea` suelto todavía
no: al llegar a uno, el proceso se detiene ahí. La fábrica sigue sin empujar a `main`.

```markdown
---
id: publicar                 # el mismo nombre del archivo
nombre: Publicar en prueba y en producción
cuando: a-mano               # a-mano | al-integrar | cada-dia | cada-semana
rama: desarrollo             # la que empuja; nunca main ni master
borrador: si                 # mientras esté, no corre
---

- [push] y PR contra main
- [ci] la integración continua del commit · tope 30m
- [comando] ./scripts/desplegar.sh prueba {commit} · deshacer: ./scripts/desplegar.sh prueba {anterior}
- [salud] GET https://prueba.pos.local/salud → 200 · tope 2m
- [aprobacion] producción
- [comando] ./scripts/desplegar.sh produccion {commit} · deshacer: ./scripts/desplegar.sh produccion {anterior}
- [salud] GET https://pos.local/salud → 200 · tope 2m · si falla: tarea
```

- Tipos: `push`, `ci`, `comando`, `salud`, `aprobacion` (espera el clic de la persona),
  `vulnerabilidades` (el vigía), `evaluacion` (mide un puntaje) y `tarea` (deja un pedido en la
  Bandeja; todavía no corre suelto). Opciones: `tope 30s|2m|1h`, `deshacer: comando`,
  `clave: NOMBRE`, `si falla: deshacer|tarea` y, en una evaluación, `umbral 0.8` y
  `tolerancia 0.02`.
- Un `comando` declara siempre cómo se deshace; `deshacer: —` dice que no cambia nada de afuera, y
  con un paso así producción nunca sale sola. Corre sin shell: nada de `|`, `&&`, `;`, `>` ni `$`
  (eso va en un script del repositorio). El código pone `{commit}`, `{anterior}` y `{rama}`.
- La aplicación los muestra en Configuración, con lo que no cumple y su línea, y crea
  `publicar.md` desde una plantilla, como borrador.
- **Correrlos.** «Correrlo ahora», en Configuración. Antes de empezar se revisa todo, y si algo
  falta no corre nada: que no haya otra ejecución ni una corrida en esa línea, que la raíz no tenga
  cambios sin commit fuera de `factory/`, que el proceso tenga commit y esté igual que en él (corre
  lo que tiene commit), que no sea un borrador ni tenga problemas, que la raíz esté en su `rama` y
  que estén sus claves.
- Los pasos corren en orden, en la raíz, con su tope (10 minutos un comando y 1 minuto la salud,
  si no dicen otro). Un comando corre sin shell y sin las claves de la aplicación; en Windows, un
  `.cmd` o `.bat` va con `cmd /c`, un `.ps1` con PowerShell y un `.sh` con el `sh` del PATH. La
  salud se pide cada 5 segundos hasta que contesta lo esperado o pasa su tope.
- **Si un paso falla**, se corren los `deshacer` de los comandos ya hechos, del último al primero.
  `{anterior}` es el commit de la última vez que el proceso terminó bien; sin una, el `deshacer`
  que lo usa no corre, y se dice. Detenerlo a mano corta el paso que corre y deja lo hecho como
  está.
- **Push.** Empuja a `origin` el commit con que empezó el proceso, a su `rama`
  (`git push <commit>:refs/heads/<rama>`): solo esa rama, nunca `main`, `master` ni otra protegida,
  y nunca con `--force`. Usa las credenciales de git de este equipo, sin pedir nada en una
  terminal. Si el remoto tiene commits que la raíz no tiene, no se fuerza: el paso falla y dice que
  hay que traerlos. Un push hecho no se deshace si después algo falla.
- **PR.** `- [push] y PR contra main` abre además el PR (GitHub, con `gh`) o el merge request
  (GitLab, con `glab`, si el remoto es de un GitLab), lanzados por su ruta exacta
  (`COMPANIA_GH_BIN`, `COMPANIA_GLAB_BIN` en el `.env.local` de la aplicación) y con su propio
  inicio de sesión. El título y el texto los arma el código: en el texto va lo que escribió Label
  («Para el PR») de cada tarea que entra, con su id. Sin la ruta, empuja igual y dice que el PR no
  se abrió; si ya había uno abierto para esa rama, lo dice, pone al día su texto y sigue.
  Integrarlo es de una persona, salvo con el paso `fusion`.
- **Fusión.** `- [fusion] el PR en main · squash` (o `merge`, el de siempre, o `rebase`), después
  del push que abre el PR y del `[ci]`, lo fusiona solo (`procesos/fusion.ts`). Lo hace el
  servicio, con `gh pr merge` o `glab mr merge`, nunca con `--admin` y con el commit atado: si el PR
  avanzó desde que pasó la integración continua, no se fusiona. Antes se mira que el PR sea el de la
  rama del proceso contra esa base y esté abierto, y que cada tarea que entra (`{anterior}..{commit}`)
  haya sido sencilla, o grande y probada por la persona. Si la rama pide una revisión o un check
  más, eso manda: el paso falla y lo dice. Una fusión hecha no se deshace sola. En GitLab va con
  `--auto-merge=false` (`glab` la deja programada por defecto si hay un pipeline corriendo), y el
  merge request nace con `--remove-source-branch=false`: la rama del proceso es la de trabajo de la
  línea y no se borra al fusionar, aunque el proyecto lo haga por defecto. En GitHub no hay cómo
  pedirlo por PR: si el repositorio borra las ramas al fusionar, desactívalo.
- **La CI después de la fusión.** Un `- [ci] …` puesto después de `[fusion]` espera el pipeline
  del commit que quedó en la base al fusionar (el de la fusión, el aplastado o, sin commit propio,
  el último del PR), no el del commit empujado. Donde `main` despliega, como en GitLab, es el que
  dice si producción salió bien. Si el servicio no dijo qué commit quedó, ese paso falla y lo dice.
- **Integración continua.** `- [ci] … · tope 30m` espera el resultado del commit que se empujó: lo
  lee (solo lee) con la misma herramienta del PR, cada 15 segundos. En GitHub, los check runs del
  commit (falla si alguno termina mal); en GitLab, su último pipeline. Sin la ruta de la
  herramienta, el paso falla y lo dice. Si en dos minutos no aparece ninguna para el commit, el
  proyecto no la tiene, y se dice.
- **Pedido a la Bandeja.** Un paso con `· si falla: tarea` que falla deja en la Bandeja de la
  aplicación el pedido de arreglarlo: qué falló, lo que dijo la aplicación y las últimas líneas de
  lo que dijo el paso, con las claves tapadas. Es texto de una máquina: entra como de otra persona,
  y al pasarlo a una línea se revisa como un issue ajeno. Mientras haya uno abierto de ese
  proceso, no se deja otro.
- **Al integrar.** Un proceso con `cuando: al-integrar` arranca solo cuando una tarea de la línea
  pasa a `hecho` e integra, si la persona lo encendió en la configuración de este equipo (el
  archivo solo no alcanza). Lo mira el vigía de la aplicación cada 15 segundos; espera a que no haya
  una corrida en esa línea, y lo integrado antes de encenderlo no cuenta. Si no puede arrancar (la
  raíz con cambios, por ejemplo), queda como una ejecución que falló antes de empezar, con su
  motivo.
- **Producción, con su clic.** `- [aprobacion] producción` detiene el proceso hasta que la persona
  lo aprueba o no en la configuración de la aplicación (hasta 12 horas; después, no aprobado). La
  aplicación lo avisa, y el teléfono suena si se pidió. Al aprobar, la raíz tiene que seguir en el
  commit con que empezó: producción recibe lo mismo que pasó por prueba. Sin su clic, lo hecho
  hasta ahí queda como está. Si después de producción una comprobación de salud falla, se
  deshace todo lo hecho, del último al primero.
- **Sin su clic.** Por proceso y en ese equipo, la persona puede quitar el clic. Solo se puede, y
  solo vale cada vez que corre, si: el proceso tiene un paso `aprobacion`, cada `comando` se puede
  deshacer (ninguno con `deshacer: —`), hay un `salud` después de producción, y esa misma versión
  del proceso (su huella) ya llegó hasta producción con su clic al menos una vez. Si deja de
  cumplir, vuelve a esperar el clic y dice por qué.
- **Lo que siempre pide su clic.** Aunque lo haya quitado, el paso `aprobacion` espera a la
  persona si desde la última salida del proceso (`{anterior}..{commit}`) cambió algo de la base
  de datos (`**/migrations/**`, `**/*.sql`) o del núcleo que ella marca en la
  ficha de la línea, con reglas del tema `nucleo`: `- [nucleo] src/Ventas/** — el corazón del
  negocio`. Lo de un stack, como el esquema de Prisma, va en el núcleo: la aplicación lo propone
  al crear la memoria de la línea. Sin una salida anterior con qué comparar, también. La nota dice qué archivos y por
  qué. Lo decide el código, sin ningún modelo.
- **El agente de salida** (hoy no corre: desde el 27 de octubre de 2026 la aplicación no lo pasa a
  la corrida, y vuelve cuando cada línea tenga su CI/CD; ver el final de
  `docs/Plan-Habilidades-y-Procesos.md`). Cuando corría, si una línea tenía un proceso con su clic
  quitado, la aplicación le pasaba a la corrida `fabrica-salida` (Sonnet, con Viper y Marian). Después de cada aprobación
  mira lo que las reglas no ven (lo que no se puede deshacer, lo que se rompe para quien ya
  depende del código) y lo registra con `mcp__fabrica__salida`: `tu-clic`, con motivo y plan de
  vuelta, o `sin-objecion`. Solo endurece: una tarea marcada que entra en el commit hace que el
  paso `aprobacion` espere a la persona, y nada la desmarca.
- **Cada día o cada semana.** Un proceso con `cuando: cada-dia` o `cada-semana` corre solo si la
  persona lo encendió en la configuración de este equipo (el mismo interruptor «Que arranque
  solo»). Lo mira el vigía de la aplicación, que corre en el servidor mientras la aplicación está
  abierta: si la última vez que corrió (o que intentó) fue hace más de un día o una semana, lo
  corre, de a uno y sin una corrida en esa línea.
- **Vigía de vulnerabilidades.** `- [vulnerabilidades] los paquetes del proyecto · si falla: tarea`
  lee las versiones exactas de los paquetes (el `package-lock.json`, los `.csproj` y los
  `requirements.txt` con `==`, en la raíz y en sus carpetas de primer nivel) y las pregunta a
  OSV.dev. Solo salen nombres, ecosistemas y versiones de paquetes públicos; los de un registro
  privado, de git o de un archivo no salen. Si alguno tiene una vulnerabilidad conocida, el paso
  falla con la lista, y el pedido de actualizarlos queda en la Bandeja. La configuración crea
  `vigia.md` desde una plantilla (una vez al día); corre solo cuando se lo enciende.
- **Evaluación.** `- [evaluacion] node evals/correr.mjs {resultado} · umbral 0.8 · tolerancia 0.02
  · si falla: tarea` corre el conjunto de prueba del proyecto como un `comando`. El comando escribe
  `{ "puntaje": 0..1, "casos": n, "fallidos": n }` en `{resultado}` (la misma ruta va en
  `FABRICA_RESULTADO`), fuera del repositorio. Solo se toman esos tres números, y el archivo se
  borra. Falla si el puntaje queda bajo el umbral, o si baja más que la tolerancia respecto de la
  última vez que el proceso midió uno. El puntaje va al registro, y la configuración muestra los
  últimos. Lo que dijo el comando queda solo en el log. Una por proceso; la configuración crea
  `evaluacion.md` desde una plantilla, como borrador y a mano.
- **Claves.** Un comando que necesita una la nombra: `· clave: DEPLOY_TOKEN`. Le llega como
  `DEPLOY_TOKEN`, con el valor de `COMPANIA_PROCESO_<LINEA>_DEPLOY_TOKEN` en el `.env.local` de la
  aplicación, y solo a ese paso. Todo lo que se guarda va con las claves tapadas.
- **Registro.** Una línea por vez que corrió en `factory/procesos/registro/AAAA-MM.md`, en el
  repositorio: fecha, proceso, commit entero, cómo terminó y dónde falló. Nada de lo que dijeron
  los comandos: eso va entero a `datos/procesos/<linea>/<id>.log`, fuera del repositorio.
- **Guardia.** Ningún subagente escribe en `factory/procesos/` (el mod lo frena con Edit y Write);
  el hilo principal sí.

## config.md

El frontmatter de `factory/config.md` es plano, una clave por línea. La configuración de la
aplicación lo edita sin tocar el resto: comandos, rama base, reglas (quién aprueba,
integración, vueltas, UI, Jev, lint por archivos, `sql`, worktrees), agentes, paralelo, modelos y
las notas para los agentes. A mano sigue valiendo. Las que más importan:

```
build: dotnet build WolffWeb.sln
test: dotnet test WolffWeb.Tests
lint: npx eslint {archivos}       # {archivos}: solo lo que cambió la tarea
lint_extensiones: .js,.ts         # opcional: qué archivos lintea {archivos}
sql: sqlcmd -S . -d prueba -b -i {archivos}   # opcional: revisa los .sql de la tarea
integracion: auto                 # auto (por defecto) o manual
grande_lineas: 400                # opcional: desde cuántas líneas cambiadas una tarea es grande
grande_archivos: 15               # opcional: y desde cuántos archivos
rama_trabajo: developer/fcanales  # opcional: de ahí salen las tareas y ahí se integran; nunca main ni master
rama_base: main                   # respaldo para las tareas que no tienen rama de origen
```

- **`{archivos}` en `lint`.** Al verificar, el mod lo reemplaza por los archivos que la tarea
  cambió o creó (respecto del punto donde se separó de su rama), filtrados por `lint_extensiones`,
  cada uno entre comillas simples (valen en PowerShell 5 y en sh). Si no queda ninguno, el lint se
  da por ok y el informe dice «sin archivos que lintear». Sirve cuando el proyecto ya tiene errores
  de lint previos que no son de la tarea. Sin el marcador, el comando corre tal cual.
- **`sql`.** Si la tarea trae `.sql` nuevos o cambiados, corre después del lint con `{archivos}`
  reemplazado por ellos (por ejemplo, `sqlcmd` con `SET PARSEONLY ON` contra una base de prueba).
  **Las credenciales nunca van en config.md**: el comando las toma del entorno (`SQLCMDUSER`,
  `SQLCMDPASSWORD`, o la autenticación de Windows con `-E`). Sin la clave, la verificación y el
  tablero dicen «SQL sin verificar: N archivos».
- **`integracion`.** Ver «Ramas e integración».
- **`grande_lineas` y `grande_archivos`.** Una tarea aprobada es **sencilla** o **grande**
  (`mcp__fabrica__decidir(T, "integracion")`, fabrica/docs/Plan-Integracion.md). Es grande, sin
  preguntarle a nadie, si toca lo delicado de cualquier proyecto (migraciones, `.sql`, el
  pipeline, las dependencias) o lo que la ficha marca con `[nucleo]`, si pasa de estos topes, si
  necesitó dos vueltas de retrabajo o si propone algo para la memoria. Si solo cambia
  documentación, textos, imágenes o estilos, es sencilla. Lo demás lo decide Jev (ver «Lo que
  decide Jev»); sin Jev, queda grande: ante la duda, espera tu prueba. Queda anotado en la tarea y
  se ve en Una línea.

  **La grande te espera.** Ya aprobada por el agente, no pasa a hecha sin tu veredicto de esa
  vuelta: el mod lo rechaza (`mover`), y si nadie la clasificó, la clasifica él antes. La corrida
  la deja en aprobación y sigue con las demás. Te llama el teléfono (si llamar sola está
  encendido), y en Una línea la pruebas en su rama y eliges «Probada, intégrala» o «Devuélvela»,
  con lo que falló. Una sencilla cuyas pruebas había saltado Jev las corre antes de integrarse; si
  fallan, vuelve a construcción.

  **Label escribe lo que se lee.** Con cada tarea clasificada, la corrida lanza `fabrica-anuncio`
  (Sonnet, con el archivo entero de Label): en una sencilla deja `## Para el PR`, el registro de un
  cambio que nadie revisó; en una grande, `## Para probar a mano`, qué probar y qué sería un fallo.
  Solo lee: su texto lo registra el mod con `mcp__fabrica__anuncio`, que decide la sección por la
  clase y no toca nada más. Se ve en Una línea, nunca en voz alta. Si la tarea vuelve a
  construcción, su clase y lo de Label se borran, y se escriben otra vez al aprobarse.

  **El retrabajo lo hacen Snow White y Rapunzel.** Cuando una tarea vuelve a construcción por un
  BLOQUEANTE de los revisores o porque falló la verificación, la corrida lanza `fabrica-retrabajo`
  en vez del constructor: con los archivos enteros de las dos, las habilidades de construcción de
  la línea (sin las Nikkes de sus especialidades) y el modelo que diga `decidir(T, "construccion")`.
  Snow White busca la causa y la arregla de raíz, pero solo dentro de lo que la spec dice que toca:
  si está fuera, para con `CAUSA FUERA DE LA TAREA:` y la tarea te espera. Rapunzel deja una prueba
  por cada BLOQUEANTE que se pueda probar y corre solo las suyas; la suite la corre la verificación.
  Un conflicto al sincronizar lo sigue resolviendo el constructor: ahí no hay nada roto.

## Ramas e integración

- **Rama de origen.** Al entrar a construcción, el worktree sale de la rama de trabajo
  (`rama_trabajo` de config, que se elige desde la aplicación) o, sin ella, de la que
  está activa en la raíz en ese momento (`rama_origen` en la tarea), con lo que ya se integró antes.
  No se pisa en el retrabajo. `rama_base` queda solo para las tareas de antes que no la tienen. Si
  la raíz está en «detached HEAD», la tarea espera a un humano.
- **Nunca en `main` ni en `master`.** De esas ramas no sale ninguna tarea y en ellas no se integra
  nada: la tarea va a un humano con el motivo. Sin worktree, tampoco se trabaja si la raíz está en
  una de ellas. Lo que llega a `main` lo lleva el usuario.
- **Para integrar, la raíz tiene que estar en la rama de origen.** La integración es un `merge
  --ff-only` en la raíz: si el usuario está en otra rama, la tarea espera y la próxima corrida lo
  reintenta.
- **Comparar contra el merge-base.** Los revisores (Codex incluido), las decisiones de Jev y la
  verificación miran el diff contra el commit donde la tarea se separó de su rama, no contra la
  rama local: así ven solo lo de la tarea aunque la rama esté atrasada o haya avanzado.
- **Sincronizar antes de aprobar.** Con la verificación en ok, `mcp__fabrica__sincronizar` hace el
  commit del worktree y trae la rama de origen (`git merge`, nunca rebase). Si entra limpio, se
  verifica de nuevo. Si hay conflicto, los marcadores quedan en el worktree, el conflicto queda como
  BLOQUEANTE y la tarea vuelve a construcción (la vuelta cuenta). No pasa a aprobación sin
  sincronizar ni con un conflicto sin resolver.
- **Integrar al pasar a hecho.** Con `integracion: auto`, `mover(T, "hecho")` comprueba que la raíz
  esté en la rama de origen y corre `git merge --ff-only fabrica/<id>`; anota el commit en
  `integrada`. Nunca usa `--force`, `reset`, `stash` ni `checkout` sobre tu copia de trabajo, y
  nunca hace push. Si la raíz está en otra rama, si la rama de origen avanzó desde la
  sincronización o si tus cambios sin commit tocan los mismos archivos, la tarea va a
  `necesita-humano` con una nota que lo explica. La rama y el worktree no se borran. Como es algo
  mecánico, queda anotado (`bloqueo`), y la corrida siguiente la retoma sola si ya se resolvió:
  integra con los veredictos que tenía, o, si la rama avanzó, la vuelve a sincronizar.
- **Dependencias.** `depende_de: F-009,F-007` en una tarea (con `mcp__fabrica__nueva`, desde la
  aplicación, o `### Depende de` en un documento de requerimientos) la deja en cola hasta que esas
  estén hechas e integradas. Una dependencia descartada la manda a un humano; un ciclo se rechaza.
- **Choques.** Si dos tareas en cola dicen tocar los mismos archivos («Archivos o zonas que toca»),
  la de id mayor espera a que la otra quede integrada. Si dos tareas activas cambiaron los mismos
  archivos, la bitácora de las dos lo avisa.
- **Una sesión por tarea.** La sesión que saca una tarea de la cola la toma media hora
  (`tomada_por`, `tomada_hasta`), y la renueva con cada movimiento. Mientras no venza, otra sesión
  no la mueve. Al terminarla, descartarla o mandarla a un humano, queda libre, y también cuando
  esa sesión se cierra (si se cae sin cerrarse, al vencer).
- **node_modules.** Si la raíz tiene `node_modules` y git lo ignora, el worktree lo enlaza
  (junction en Windows) en vez de instalar en cada verificación. Si la tarea cambia el lockfile, el
  enlace se quita.
- **Finales de línea.** Si el repo usa CRLF (`core.autocrlf` o `.gitattributes`), los archivos
  nuevos de texto pasan a CRLF antes del commit, y git no avisa LF→CRLF. Tu configuración de git no
  se toca.

## Quién hace cada etapa

Cada etapa es un **rol** con su clave en `factory/config.md`. Con `auto` (el valor por defecto)
se usa el primer agente de la lista que esté instalado:

| Rol | Clave | `auto` prueba, en orden |
|---|---|---|
| Spec | `agente_spec` | `fabrica:spec-escritor` |
| Construcción | `agente_construccion` | `nikke:centi-implementacion` → `fabrica:constructor` |
| Revisión de código | `agente_revision_codigo` | `nikke:anis-revision` → `fabrica:revisor-codigo` |
| Revisión de seguridad | `agente_revision_seguridad` | `nikke:crow-abuso` → `fabrica:revisor-seguridad` |
| Revisión UI/UX | `agente_ui` | `fabrica:revisor-ui` (solo si el diff toca vistas o estilos, con `ui: auto`) |
| Aprobación | `agente_aprobacion` | `fabrica:aprobador` (y/o un orquestador externo: `aprobacion` en config) |

La verificación no es un agente: la hace el mod con `mcp__fabrica__verificar`, que corre los
comandos de config.

**La UX va con la interfaz.** Son tres revisores, no cuatro (lo decidió él el 27 de octubre de
2026): el de interfaz revisa también el recorrido de quien usa la tarea y sus mensajes. Ninguna
Nikke cubre la experiencia de quien usa el producto. Si una línea quiere más, su catálogo puede
nombrar una habilidad para la etapa de revisión, como la suya `ui-ux-pro-max`
(`- [revision] ui-ux-pro-max: al revisar una pantalla o un flujo.`). Es una habilidad personal: la
usa solo la línea cuyo catálogo la nombra, y nombrarla es decisión suya. La reciben los tres
revisores, que comparten la etapa.

**Usar otro agente:** pon su nombre en la clave (`agente_construccion: mi-constructor`), o
elígelo en la configuración de la aplicación, que lista los agentes de este equipo y deja fijar
cuántas tareas van a la vez (`paralelo_max`). El de fábrica queda detrás como red si ese no
existe. Las corridas de la aplicación no cargan nikke (sus guardas piden una firma que nadie da
sin interfaz): si eliges uno de sus agentes, la corrida lo recibe con `--agents`, con su nombre
sin el del plugin (`centi-implementacion`), y el mod lo busca también así.

**Personalizar uno de fábrica:** `/fabrica:agentes copiar <rol>` copia su `.md` a
`.claude/agents/fabrica-<nombre>.md` del proyecto (o a `~/.claude/agents/` con `usuario`) y deja
el rol apuntando a la copia. La del proyecto viaja con el repositorio, así que todo el equipo usa
los mismos. En la aplicación, Configuración › Agentes y modelos hace lo mismo con
**Personalizar** (siempre en el proyecto) y además la edita: su descripción y sus instrucciones.
Su nombre, sus herramientas y su modelo los pone la fábrica, y la aplicación no hace commit.
`/fabrica:agentes restaurar <rol>` vuelve el rol a `auto` (la copia no se borra), como «Volver al
de la fábrica» en la aplicación. Claude Code lee los agentes al empezar la sesión: un cambio vale
desde la próxima corrida.

## El modelo de cada rol

En `factory/config.md`, `modelo_spec`, `modelo_construccion`, `modelo_revision` y
`modelo_aprobacion` valen `inherit` (el de la corrida), `haiku`, `sonnet`, `opus` o `fable`. Por
defecto, la spec va en Opus, los revisores en Sonnet y el resto con el de la corrida. La spec solo
se escribe para pedidos vagos: probada con Fable en un clon de Atalaya, hizo las mismas preguntas
que Sonnet y Opus por bastante más (unos 0,90 USD por spec), así que Fable conviene elegirlo a mano
para un pedido grande y difuso, no dejarlo fijo. En construcción, si Jev ve
que la tarea es simple, se usa Sonnet salvo que config ya pida uno más barato; en retrabajo, el de
config. El modelo del orquestador (el que reparte) es el de la corrida: en el orquestador web,
`FABRICA_MODELO` o su configuración.

## Codex y Antigravity

La fábrica puede usar otros agentes, con su suscripción: **Codex** (OpenAI) para revisar el
código y **Antigravity** (Google) para escribir la spec. Los corre el mod sin interfaz, en segundo plano y sin que
puedan editar: Codex en su sandbox de solo lectura, Antigravity en modo plan con su sandbox de
terminal. La fábrica corre desatendida, así que el tiempo no apura: cada llamada espera hasta 4
minutos y, si no terminaron, responde «EN CURSO» y el orquestador vuelve a llamar en la ronda
siguiente. El único tope es de una hora, para que nada quede colgado. Los arranca un `node` aparte,
desligado del mod, que deja su salida en `.git/fabrica/trabajos/`: si la corrida se corta, el
agente termina igual y la siguiente recoge lo que dejó. Hace falta `node` en el PATH.

Cada uno se lanza por **su ruta exacta**, nunca buscándolo en el PATH: `FABRICA_CODEX_BIN` y
`FABRICA_ANTIGRAVITY_BIN`, que la aplicación pasa a la corrida desde `COMPANIA_CODEX_BIN` y
`COMPANIA_ANTIGRAVITY_BIN`. El `.cmd` de Codex en Windows se lanza con `cmd /c`; Antigravity tiene
que ser su ejecutable, porque el pedido le llega como argumento y no puede pasar por `cmd`. Sin su
ruta, o si fallan, entra el agente de Claude, y queda anotado.

**Vienen apagados**, porque mandan código del proyecto a OpenAI o a Google. Se encienden por
proyecto en `factory/config.md`:

```
revisor_codigo: codex     # claude (por defecto), codex, o ambos
escritor_spec: antigravity  # claude (por defecto) o antigravity
```

Probados en un clon de Atalaya: Codex encontró un error plantado en 22 s (BLOQUEANTE, con la
línea); Antigravity escribió la spec de un pedido vago en unos 6 min, con las mismas preguntas
que Fable. El informe de la corrida dice qué hizo cada uno, cuánto tardó y sus tokens.

## Lo que decide Jev

Con `TYPESAFE_AI_KEY` en el entorno (y sin `jev: no` en config), el mod le pregunta a Jev, de
TypeSafe AI, dónde no hace falta gastar. Jev contesta sí o no con una probabilidad, en menos de
un segundo y por muy poco.

- **Las pruebas unitarias**, al verificar. Build y lint se corren siempre. Si solo cambió
  documentación, textos o imágenes, las pruebas no se corren; si la verificación anterior falló,
  se corren siempre; en lo demás decide Jev. Una tarea verificada sin pruebas sigue normalmente
  (`OK SIN PRUEBAS`), queda con `pruebas: omitidas`, y el informe de la corrida dice que falta
  ejecutarlas.
- **Los revisores**, con `mcp__fabrica__decidir(T, "revision")`. Código, salvo que solo cambien
  documentación o estilos; seguridad, siempre que el cambio toque algo sensible por su nombre, y en
  lo demás si Jev ve que puede abrir un problema; UI, con la regla de `ui` de config.
- **La spec**, con `decidir(T, "spec")`: si el pedido ya dice qué hacer, con criterios que se
  pueden comprobar, el mod lo deja como spec y no se lanza el agente de spec.
- **El modelo de construcción**, con `decidir(T, "construccion")`: si la tarea es chica y
  acotada, se construye con Sonnet; en una vuelta de retrabajo, siempre con el de la corrida.
- **Si una tarea aprobada es sencilla**, con `decidir(T, "integracion")`, después del piso del
  código (ver `grande_lineas`): si el cambio es superficial, puede entrar sola. Le llegan el título
  y los archivos con sus líneas, nunca el código; con un título ajeno, solo el id. Aprende de ti:
  en Una línea, una tarea que Jev dejó entrar sola tiene «Debió esperarme», que cuenta como un
  error y aprieta su umbral. Se puede quitar, y deja de contar.

Ante la duda se gasta: sin clave, si Jev no contesta o si no lo ve claro, se corre y se lanza todo.
Para pruebas, seguridad y revisores, a Jev le llegan el título de la tarea y la lista de archivos
cambiados con sus líneas, nunca el código. Para la spec y el modelo le llega también **el pedido
y la spec**: si eso no puede salir del equipo, pon `jev: no` en config.

**Los umbrales están medidos** (`orquestador/scripts/jev/`: los casos, el medidor y lo medido):
pruebas 0,15, seguridad 0,3, spec 0,5, modelo 0,6 e integración 0,7 (esta, con 27 cambios
escritos a mano en `scripts/fabrica/casos-integracion.json`, medidos con
`node --env-file-if-exists=.env.local scripts/fabrica/jev-integracion.mjs`). Son 40 casos escritos a mano: corrige sus
etiquetas y vuelve a medir con `node --env-file=.env.local scripts/jev/medir.mjs`.

**Y aprenden.** Jev no acepta retroalimentación, así que lo que se ajusta son los umbrales. Cada
decisión de Jev queda en `factory/jev.jsonl` y se le anota el resultado cuando se sabe: la spec
saltada acierta si la construcción no tuvo que preguntar; el modelo barato, si la tarea llegó a
aprobación sin retrabajo; las pruebas saltadas, si después se corren y pasan. Además, una de cada
`jev_control` veces (4 por defecto; 0 lo apaga) que Jev diría que las pruebas o la revisión de
seguridad no hacen falta, se hacen igual, para saber si acertó. Con cada error, el umbral de esa
decisión se aprieta lo justo para no repetirlo; nunca se suelta solo. El informe de cada corrida
trae una sección «Para Jev» con sus aciertos, sus errores y los umbrales.

## Lo que decide el mod y no el modelo

- Qué transiciones de estado valen, en `hooks/tareas.ts`. Por ejemplo, no se pasa de revisión a
  verificación con un BLOQUEANTE en los hallazgos, ni a aprobación sin verificación ok, ni a
  hecho sin los veredictos que pide config.
- Contar las vueltas de retrabajo y mandar la tarea a un humano al pasar `max_vueltas`.
- Correr build, test, lint y sql y anotar el resultado.
- Sincronizar con la rama de origen e integrar con fast-forward; decidir cuándo no se puede.
- Que una tarea no arranque antes que sus dependencias ni que la mueva otra sesión.
- Aceptar el veredicto de aprobación solo si viene del agente que tiene ese rol.
- Impedir que se edite a mano `estado`, `vueltas`, `verificacion` o el veredicto.
- Impedir que un subagente cambie `factory/config.md`: sus comandos son lo que verifica cada
  tarea. Con Edit y Write; un comando de shell podría igual, como con las tareas.
- Impedir que un subagente escriba en la memoria (`factory/memoria/` y la carpeta de la planta).
  Mismo alcance: Edit y Write.

## Conectar un orquestador externo (Live2D u otro)

Ver [docs/puente-orquestador.md](docs/puente-orquestador.md): qué archivos leer, cómo dejar un
veredicto, cómo encolar tareas y cómo recibir cada evento por HTTP.

## Instalar

**Con la aplicación no hace falta instalarlo.** Las corridas que lanza la aplicación de este
repositorio (`npm run dev`) cargan esta carpeta solas. Instálalo solo si quieres usarlo también
en tus sesiones de Claude Code: `/fabrica:correr` a mano, `/tablero` y la línea de estado.

1. En el bloque `env` de `~/.claude/settings.json`, `"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"`.
   El tablero, la línea de estado y las herramientas `mcp__fabrica__*` son hooks de función (un
   mod): sin eso cargan los comandos y los agentes, pero no el mod, y la cadena no puede mover
   ninguna tarea.
2. Agrega el marketplace de este repositorio y el plugin. Desde una terminal:

   ```
   claude plugin marketplace add fcanalesS/FabricaSola
   claude plugin install fabrica@factoria
   ```

   O, con el repositorio ya clonado, `claude plugin marketplace add <su carpeta>`. El repositorio
   es privado: desde GitHub, tu cuenta necesita acceso.

   En la app de escritorio, donde `/plugin` no corre: **+** junto al prompt → Plugins → Add
   marketplace → Add plugin.
3. Reinicia Claude Code.

Una corrida de la aplicación apaga la copia instalada (`enabledPlugins` en sus `--settings`):
corre la de la aplicación, y así no hay dos copias del mismo mod. Para usar una copia de trabajo
en vez de la instalada, nómbrala en `CLAUDE_CODE_PLUGIN_DIRS`, en ese mismo bloque `env`.

### Sin la aplicación

El plugin hace la misma cadena con sus agentes de siempre. Lo que solo trae una corrida de la
aplicación, y sin ella no está:

- el agente de cada etapa con sus habilidades ya cargadas (`fabrica-hab-<rol>`): sin él, la etapa
  usa su agente de siempre y el catálogo `factory/habilidades.md` no se aplica;
- Label (`fabrica-anuncio`), el retrabajo (`fabrica-retrabajo`) y el agente de salida: sin ellos
  no se escribe lo que se lee de cada tarea aprobada, y el retrabajo lo hace el constructor;
- el vault de la planta (`FABRICA_MEMORIA_PLANTA`): la memoria de cada proyecto
  (`factory/memoria/`) sí se lee;
- Codex y Antigravity (`FABRICA_CODEX_BIN`, `FABRICA_ANTIGRAVITY_BIN`): sus etapas las hace Claude.

Jev funciona igual si `TYPESAFE_AI_KEY` está en el entorno de Claude Code.

## Desarrollo

```
claude plugin validate fabrica
claude plugin test fabrica
```

Las pruebas del mod no tienen git ni procesos. Lo que toca git (rama de origen, sincronizar,
integrar) se prueba de punta a punta con `npm run fabrica:e2e` desde la aplicación: arma un repo
desechable en la carpeta temporal y lo recorre con sesiones reales de Claude Code en Haiku. Gasta
algo de la suscripción: se corre a mano, no en cada `npm test`.
