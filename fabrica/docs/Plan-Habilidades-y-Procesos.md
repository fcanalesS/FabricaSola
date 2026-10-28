# Habilidades y procesos: el resto del cerebro de la fábrica

**Qué es.** Las otras dos partes del cerebro, como las pidió él el 26 de octubre de 2026 (la
memoria ya está: `Plan-Memoria.md`):

- **Habilidades:** «capacidades definidas para que el agente ejecute tareas de forma repetible y
  auditable». Que cada vez que la fábrica haga algo que ya sabe hacer (una migración contra la base
  de un proyecto, una vista con el patrón de la casa) lo haga igual, y que después se pueda ver qué
  habilidad usó, en qué versión, y si sirvió.
- **Procesos:** «delegar el desarrollo a sistemas automatizados que pueden llevar aplicaciones a
  producción de manera autónoma». Que lo que hoy termina en `hecho` (integrado en local, sin push)
  pueda seguir solo: empujar, esperar la integración continua, construir, desplegar en un entorno
  de prueba, comprobar que responde y, con las condiciones que él fije, llegar a producción.

**Cómo es.** Igual que la memoria: archivos Markdown en el repositorio de cada línea, que se leen
con `grep` y con cualquier IA, y que escribe él. Los agentes proponen; él aprueba con un clic.

**Lo que ya hay y se aprovecha.**
- Claude Code ya tiene habilidades en un estándar abierto (`SKILL.md`), por proyecto en
  `.claude/skills/` y personales en `~/.claude/skills/`. Él ya tiene varias, una por base de datos
  de sus proyectos (wolff-db, pos-wolff-db, ditab-db, minifiero-bd) y una de vistas (ditab-view).
  Hoy la fábrica solo las nombra: `init` sugiere anotarlas en las notas de `config.md` y el agente de
  spec «las nombra en la spec». **Ningún agente de la fábrica puede usarlas**: sus `tools` no
  incluyen `Skill`, y nadie registra cuál se usó.
- La cadena de la fábrica ya es un proceso (spec → construcción → revisión → verificación →
  aprobación → integración en local), con guardias probadas. Lo que falta es lo que viene después
  de `hecho`, y lo que corre sin una tarea (cada cierto tiempo).

**Cómo se prueba.** Como la memoria: `npm test`, `npx tsc --noEmit` y `npm run lint` desde
`compania/`; lo del plugin, con `claude plugin test fabrica`. Los procesos, además, con un
repositorio desechable y comandos de mentira (como `npm run fabrica:e2e`, que gasta: se pregunta
antes). Nada de un proceso se prueba contra un servidor de verdad.

## Lo que tiene que decidir él

Cada una cambia una regla del proyecto o de la fábrica. Va con mi recomendación; nada de esto se
construye antes de su respuesta.

**Respondidas.** El 26 de octubre de 2026 aceptó las ocho recomendaciones: las 1 a 3 antes de H1, y
las 4 a 8 después de H4, sin cambios. Las reglas que salen de ellas están en `compania/CLAUDE.md`
(«Un proceso de la fábrica lo corre el código»).

**Habilidades**

1. **Dónde viven las de la fábrica.** Recomiendo: las de un proyecto, en su repositorio
   (`.claude/skills/`), versionadas con el código, que es lo que las hace auditables. Las suyas
   personales (`~/.claude/skills/`, como wolff-db) se pueden usar en una corrida **solo si el
   catálogo de la línea las nombra**, y queda anotada la huella de su contenido al usarlas, porque
   no están en ningún repositorio. La alternativa es copiarlas al repositorio de cada proyecto.
2. **Quién escribe una habilidad.** Recomiendo lo mismo que la memoria: solo él. Los agentes
   proponen (por ejemplo, después de resolver tres veces lo mismo), y él aprueba. Una habilidad es
   una instrucción que los agentes siguen, así que el riesgo es mayor que el de una regla: nunca
   sale del texto de un issue.
3. **Habilidades con scripts.** El estándar permite que una habilidad traiga scripts. Recomiendo:
   sí, pero el script se ve entero en la propuesta antes de aprobarla, y corre con los mismos
   permisos que el agente.

**Procesos**

4. **Push.** Hoy la fábrica nunca hace push. Llevar algo a producción lo necesita. Recomiendo: la
   fábrica empuja **su rama de trabajo** (nunca `main`, `master` ni otra protegida, nunca con
   `--force`) y abre un pedido de integración (PR o merge request). Integrar en `main` sigue
   siendo un clic suyo, en el servicio o desde la aplicación.
5. **Con qué credenciales.** El push, con las credenciales de git de este equipo (las que ya usa
   él). Abrir el PR y leer la integración continua, con `gh` o `glab` lanzados por su ruta exacta
   (`COMPANIA_GH_BIN`, `COMPANIA_GLAB_BIN`), con su propio inicio de sesión. Los tokens de la Entrada
   siguen siendo de solo lectura: no se usan para escribir.
6. **Producción.** Él pidió «de manera autónoma». Recomiendo llegar en dos pasos: primero, el
   entorno de prueba solo y producción con su clic; después, por línea, producción sola **si** el
   proceso pasó entero en el entorno de prueba, la comprobación de salud responde y el paso de
   producción tiene cómo deshacerse. Quitar el clic es una decisión suya por línea, no un cambio de
   código.
7. **Quién corre los pasos.** Recomiendo: el código, no un modelo. Un paso de un proceso es un
   comando o una espera, y tiene que dar lo mismo cada vez. Un modelo entra solo cuando algo falla:
   para leer el error y proponer la tarea que lo arregla, que pasa por la Bandeja como cualquier
   pedido. Hermes queda como otra forma de correr los mismos procesos, más adelante (ver al final).
8. **Las claves del despliegue.** Recomiendo que el despliegue use la integración continua que el
   proyecto ya tenga (GitHub Actions, GitLab CI): ahí están sus claves, y la fábrica solo dispara y
   mira. Si un paso tiene que correr en este equipo y necesita una clave, va en `.env.local` como
   `COMPANIA_PROCESO_<LINEA>_<NOMBRE>`, la aplicación guarda solo el nombre, y llega como variable
   de entorno solo a ese paso. Nunca se imprime ni queda en el registro.

## Las reglas de las habilidades

**Qué es una habilidad de la fábrica.** Un `SKILL.md` del estándar de Claude Code, más una línea en
el catálogo de la línea que dice **quién** la usa y **cuándo**. Sin esa línea, la fábrica no la usa
aunque exista: así se sabe siempre qué instrucciones siguió cada agente.

**El catálogo: `factory/habilidades.md`.** Una línea por uso, como la ficha:

```markdown
# Habilidades · pos-tiendas

- [construccion] wolff-db: antes de escribir SQL contra la base wolff.
- [spec] wolff-db: para comprobar que las tablas que nombra el pedido existen.
- [construccion, revision] ditab-view: al crear o revisar una vista de Ditab.
```

Entre corchetes, las etapas que la usan; después, el nombre de la habilidad y cuándo aplica. Se lee
con `grep -n "\[construccion" factory/habilidades.md`. Lo escribe él (la aplicación, desde su
pantalla); un subagente no lo toca, igual que `config.md` y la memoria.

**Cada agente recibe las suyas.** Al lanzar una etapa, el orquestador le pasa al agente las
habilidades de su etapa, con el cuándo de cada una, junto a la memoria. El agente las usa; no busca
otras.

**Auditable.** Cada vez que un agente usa una habilidad, el mod anota en la bitácora de la tarea
cuál, en qué etapa y con qué versión: el commit del repositorio si es del proyecto, o la huella de
su contenido si es personal. La línea de la bitácora del mes (la de la memoria) suma
`habilidades: wolff-db`. Con eso, el informe de rendimiento que ya existe puede decir qué
habilidades acompañan a las tareas que salen a la primera y cuáles a las que vuelven.

**Repetible.** Una habilidad no cambia en medio de una corrida: la corrida usa la versión que había
al empezar. Si él cambia una habilidad, vale desde la corrida siguiente (como la biblia de ella con
una conversación abierta).

## Las reglas de los procesos

**Qué es un proceso.** Una lista de pasos, en un archivo del repositorio de la línea, que se corre
igual cada vez. Cada paso es de un tipo conocido; no hay pasos «libres» que interprete un modelo.

**`factory/procesos/<id>.md`.** Frontmatter plano y una línea por paso:

```markdown
---
id: publicar
nombre: Publicar en prueba y en producción
cuando: al-integrar        # al-integrar | a-mano | cada-dia | cada-semana
rama: desarrollo           # la rama que publica; nunca una protegida para el push
---

- [push] la rama de trabajo, y abre el PR contra main
- [ci] espera la integración continua del commit · tope 30m
- [comando] docker build -t pos:{commit} . · deshacer: —
- [comando] ./desplegar.sh prueba {commit} · deshacer: ./desplegar.sh prueba {anterior}
- [salud] GET https://prueba.pos.local/salud → 200 · tope 2m
- [aprobacion] producción
- [comando] ./desplegar.sh produccion {commit} · deshacer: ./desplegar.sh produccion {anterior}
- [salud] GET https://pos.local/salud → 200 · tope 2m · si falla: deshacer
```

Tipos: `push`, `ci`, `comando`, `salud`, `aprobacion` y `tarea` (deja en la Bandeja un pedido con
lo que falló). `{commit}` y `{anterior}` los pone el código. Un paso que cambia algo de afuera
declara su `deshacer`; sin él, un proceso no puede llegar a producción solo.

**Los corre el código.** El motor de la aplicación corre los pasos uno por uno, como hoy corre las
corridas: sin shell, con tope de tiempo, con su salida guardada en `comun/fabrica/procesos/` (fuera
del repositorio: puede traer datos del entorno) y con las claves tapadas. Si un paso falla, corre
los `deshacer` de lo que ya cambió, avisa (ella lo cuenta, y el teléfono suena si él lo pidió) y,
si el proceso lo dice, deja en la Bandeja el pedido de arreglarlo.

**Registro.** Una línea por vez que corrió, en el repositorio, en `factory/procesos/registro/
AAAA-MM.md`, con el mismo formato que la bitácora: fecha, proceso, commit, resultado y el paso que
falló. Se busca con `grep` igual que la memoria.

**Guardias, pegadas a lo que protegen.**
- Un subagente no escribe en `factory/procesos/` ni en `factory/habilidades.md` (el mod lo frena,
  como con `config.md` y la memoria).
- El proceso se lee de la rama de trabajo con commit, no del worktree de una tarea: una tarea no
  puede cambiar lo que corre cuando se publica. Si el diff de una tarea toca `factory/procesos/`, la
  tarea va a él.
- Nunca `push --force`, nunca a una rama protegida, nunca un proceso armado con texto de un issue
  ni de un agente.
- Producción: con su clic (en la aplicación, o un mensaje suyo escrito y confirmado en el siguiente,
  como correr una corrida; nunca por el micrófono abierto), salvo que él haya quitado el clic en
  esa línea.

## Orden

Habilidades primero: son más chicas, se apoyan en lo que dejó la memoria y no cambian ninguna regla
de seguridad. Los procesos, ahora que él respondió las decisiones 4 a 8.

1. **H1 · El catálogo y su lector**: `factory/habilidades.md`, su formato y qué habilidades existen
   para cada línea.
2. **H2 · Los agentes las usan**: cada etapa recibe las suyas y puede invocarlas.
3. **H3 · Registro y guardia**: qué se usó, en qué versión, y nadie más que él escribe el catálogo.
4. **H4 · Pantalla y propuestas**: él ve, asigna y aprueba; los agentes proponen habilidades nuevas.
5. **P1 · El formato de un proceso y su lector**, sin correr nada.
6. **P2 · Correr pasos locales**: `comando` y `salud`, con registro y `deshacer`, sin push.
7. **P3 · Push y PR**, con las guardias de la decisión 4.
8. **P4 · Esperar la integración continua y el entorno de prueba.**
9. **P5 · Producción**: con su clic primero; sola por línea, si él lo decide.
10. **P6 · Procesos que corren solos cada cierto tiempo**: el primero, el vigía de vulnerabilidades
    (`Plan-Memoria.md`, «Más adelante»).

## H1 · El catálogo y su lector

**Hecho el 26 de octubre de 2026**. Él aceptó ese día las recomendaciones 1 a
3. `src/lib/fabrica/habilidades/formato.ts` (puro: leer, revisar, qué recibe cada etapa, el
catálogo nuevo) y `disco.ts` (qué habilidades existen y crear el catálogo). Las suyas se buscan en
su carpeta de Claude Code (`CLAUDE_CONFIG_DIR` o `~/.claude`), como Claude Code; si una suya se
llama igual que una del proyecto, vale la suya. Bajo `## Sin asignar` van las del proyecto que
ninguna etapa usa; las suyas no, porque son de todos sus proyectos. El catálogo nace con la memoria
de la línea (`crearMemoriaDeLinea`) y no pisa uno que exista. Los ajustes traen su resumen
(usos, del proyecto sin usar, problemas y qué recibe cada etapa) y Configuración lo muestra junto a
la memoria. En las pruebas, `CLAUDE_CONFIG_DIR` apunta a una carpeta vacía: ninguna lee sus
habilidades de verdad. 5 pruebas puras y una del motor.

### Objetivo
Que cada línea diga qué habilidades usa la fábrica, en qué etapa y cuándo, en un archivo que se lee
con `grep`.

### Criterios de aceptación
- Formato de `factory/habilidades.md`: un título y una línea por uso, `- [etapa, etapa] nombre:
  cuándo.` Las etapas son las de la fábrica (`spec`, `construccion`, `revision`, `aprobacion`).
- Lector y revisor puros, como los de la memoria: qué líneas no cumplen, qué habilidad nombrada no
  existe (ni en el proyecto ni entre las suyas), qué etapa no es de la fábrica.
- Qué habilidades hay: las del proyecto (`.claude/skills/*/SKILL.md`) y las suyas, si la decisión 1
  lo permite. De las suyas se lee solo el nombre y la descripción del frontmatter, para nombrarlas;
  su contenido no sale de este equipo ni se copia.
- Al crear la `factory/` o la memoria de una línea, si el proyecto ya tiene habilidades, el catálogo
  nace con ellas **comentadas como propuesta**: no se asigna ninguna sin él.

### Archivos o zonas que toca
- `src/lib/fabrica/habilidades/` (nuevo: formato, lector, revisor), `src/lib/fabrica/motor/rutas.ts`
  (el resumen en los ajustes).

### Pruebas
- Un catálogo sano no tiene problemas; uno con una etapa inventada o una habilidad que no existe
  dice cuál y en qué línea.
- Lo que la plantilla escribe pasa su propia revisión.

### Fuera de alcance
- Que los agentes las usen (H2).

## H2 · Los agentes las usan

**Hecho el 26 de octubre de 2026**. Antes, una corrida corta en Haiku en un
proyecto desechable (unos 4 centavos), con una habilidad que sabe una «palabra de control»:
- Un agente pasado con `--agents` y `skills: ["marca-secreta"]`, sin `Skill` en sus `tools`, la
  supo; el mismo sin `skills:` contestó que no la sabía. Lo inyectado llega, y es lo que cambia.
- Un agente de plugin con `skills:` en su frontmatter, también.
- Un agente con `Skill` que la invoca solo manda `{"skill": "marca-secreta"}`.
- (De paso: una herramienta que no existe en `tools`, como `TodoWrite`, deja al agente sin
  herramientas y Claude Code se niega a lanzarlo.)

Cómo quedó: la aplicación resuelve qué agente usaría cada rol (`agenteDelRol`, como el plugin: el
elegido o, en `auto`, el preferido que la corrida tenga, y si no el de la fábrica) y, para cada rol
cuya etapa tiene habilidades, manda con `--agents` una copia con `skills:` y el nombre
`fabrica-hab-<rol>` (`agentesConHabilidades`, en `motor/agentes.ts`). El plugin
(`fabrica/hooks/habilidades.ts`) pone ese nombre primero en `roles` (`candidatosDeLaCorrida`), lo
acepta como aprobador, pasa `habilidades.paraLosAgentes` y frena con `Skill` lo que no es de la
etapa. `correr.md` suma la regla 8. En una corrida lanzada a mano no hay inyección: la etapa usa su
agente de siempre, sin las habilidades cargadas (le llega solo el texto del catálogo). 4 pruebas
nuevas en el plugin (114) y 2 en el motor.

### Objetivo
Que cada agente de la fábrica reciba las habilidades de su etapa y las pueda usar, y ninguna otra.

### Cómo (según la documentación de Claude Code, consultada el 26 de octubre de 2026)
Un subagente tiene en su frontmatter el campo `skills:`, que **inyecta el contenido entero** de
cada habilidad al empezar. Es lo repetible: el agente no elige si la lee. La herramienta `Skill` en
sus `tools` es otra cosa: deja que el agente invoque habilidades por su cuenta. Los agentes de la
fábrica son de un plugin y no cambian por proyecto, pero la aplicación ya le pasa a cada corrida
agentes armados aparte (`--agents`, hoy para los de nikke): ahí puede ir, por etapa, el `skills:`
que dice el catálogo de esa línea.

### Criterios de aceptación
- Al lanzar una corrida, la aplicación arma la definición de cada agente de la fábrica con el
  `skills:` de su etapa, según el catálogo de la línea. Sin catálogo, los agentes van como hoy.
- Los agentes **no** llevan `Skill` en sus `tools`: no invocan habilidades fuera del catálogo. Si
  alguno lo necesitara, el mod frena la invocación de una habilidad que su etapa no tiene, con un
  mensaje que dice cuáles tiene.
- `mcp__fabrica__estado` trae `habilidades.paraLosAgentes` (por etapa, cuáles y cuándo), y
  `correr.md` se lo pasa a cada agente con la memoria, para que sepa por qué las tiene.
- Una habilidad con `disable-model-invocation: true` no se puede inyectar: el revisor del catálogo
  lo dice (H1).
- Las copias editables de los agentes (`/fabrica:agentes copiar`) reciben lo mismo.

### Archivos o zonas que toca
- `src/lib/fabrica/motor/corridas.ts` y `agentes.ts` (los agentes de la corrida, con su
  `skills:`), `fabrica/commands/correr.md`, `fabrica/hooks/register.tsx`,
  `fabrica/hooks/habilidades.ts` (nuevo, lógica pura).

### Pruebas
- Con un catálogo, cada etapa recibe solo las suyas.
- Un agente de construcción que pide una habilidad de revisión: frenado.
- Sin catálogo, la fábrica trabaja igual que hoy.

### Fuera de alcance
- Elegir habilidades con un modelo. Las asigna el catálogo, que escribe él: así es repetible.

## H3 · Registro y guardia

**Hecho el 26 de octubre de 2026**. Cambió una cosa del plan: la versión es
la huella del contenido del `SKILL.md` (FNV-1a de 32 bits, la misma cuenta en la aplicación y en el
plugin), no el commit, porque así vale igual para las suyas, que no están en un repositorio, y para
cambios sin commit. Y se anota al lanzar cada agente (el gancho de la herramienta `Agent`, que trae
el tipo y el pedido con el id de la tarea), no con `SubagentStart`, que no dice la tarea. La
aplicación pasa las huellas en `FABRICA_HABILIDADES` y las guarda en la corrida (sin rutas) para el
informe; el mod escribe las tareas en fila, porque los agentes de una ronda se lanzan juntos.
`frenaHabilidades` cubre `factory/habilidades.md` y `.claude/skills/`. El informe de rendimiento
tiene «Con qué habilidades», y la bitácora de la pantalla Memoria dice «Con …». 6 pruebas nuevas en
el plugin (120) y 3 en la aplicación.

### Objetivo
Que se sepa qué habilidad usó cada tarea, en qué versión, y que solo él cambie el catálogo y las
habilidades del proyecto.

### Criterios de aceptación
- Al empezar la corrida, la aplicación anota la versión de cada habilidad del catálogo (el commit
  del archivo si es del proyecto; la huella de su contenido si es suya). Al arrancar cada agente
  (el gancho `SubagentStart`, que trae su tipo), el mod anota en la bitácora de la tarea qué
  habilidades recibió, en qué etapa y con qué versión. Las inyectadas no pasan por la herramienta
  `Skill`: por eso se anotan al arrancar, no al usarlas.
- Si una habilidad cambió en medio de la corrida, se anota: la tarea pudo usar otra versión.
- La línea de la bitácora del mes suma `habilidades: a, b` (el lector de la memoria la acepta).
- Un subagente no escribe `factory/habilidades.md` ni `.claude/skills/` (el mod lo frena, como con
  la memoria).
- El informe de rendimiento muestra, por habilidad, cuántas tareas la usaron y cuántas volvieron.

### Archivos o zonas que toca
- `fabrica/hooks/register.tsx`, `fabrica/hooks/tareas.ts` (la guardia),
  `src/lib/fabrica/memoria/formato.ts` (la bitácora), `src/lib/fabrica/motor/informes.ts`.

### Pruebas
- Una tarea que usó una habilidad la tiene en su bitácora con su versión.
- Un subagente con Edit sobre `.claude/skills/x/SKILL.md`: frenado; el hilo principal, no.

## H4 · Pantalla y propuestas

**Hecho el 26 de octubre de 2026.** Cómo quedó:

- La propuesta de una habilidad va en `## Para la memoria` como las otras, con `- habilidad:`,
  `- etapas:`, `- cuando:` y cada archivo como `- skill:` o `- archivo: ruta`, con su texto debajo
  con sangría. En el vault, sus archivos van en `## Archivos` con cuatro espacios de sangría: así un
  `## ` del `SKILL.md` no corta la sección, y las líneas de código no tienen el tope de 200.
- No es una decisión: aprobarla no crea un `D-`. Escribe `.claude/skills/<nombre>/` y su línea en
  el catálogo (o el catálogo, si la línea no tenía), y deja la propuesta aprobada. No se edita desde
  la pantalla: se aprueba y se corrige en el repositorio, o se rechaza con su motivo.
- «Scripts» son los archivos que no son `.md` ni `.txt`. Con scripts, la ruta no aprueba sin
  `leyoLosScripts`, que la pantalla manda solo si él marcó que los leyó.
- No pisa una habilidad que exista, del proyecto o suya (la suya mandaría y la nueva no se usaría
  nunca). El mod tampoco propone una que ya esté en `.claude/skills/` o en otra propuesta.
- La pestaña Habilidades cuenta los usos desde la bitácora del vault (`habilidades:` en cada
  línea), no desde los eventos: es lo que queda en el repositorio.

### Objetivo
Que él vea las habilidades de cada línea, las asigne a etapas y apruebe las que proponen los
agentes.

### Criterios de aceptación
- Una pestaña «Habilidades» en la pantalla Memoria: el catálogo de la línea, editable; las
  habilidades que existen y no se usan; cuánto se usó cada una.
- Un agente propone una habilidad en `## Para la memoria` con `- habilidad: <nombre>` y el texto
  del `SKILL.md` en la propuesta. Al aprobarla, la aplicación escribe
  `.claude/skills/<nombre>/SKILL.md` en el repositorio y su línea en el catálogo. Sin commit.
- Una propuesta de habilidad que trae scripts los muestra enteros antes de aprobarla.
- Una propuesta de una tarea que vino de un issue no puede copiar su texto (la misma guardia de la
  memoria).

### Archivos o zonas que toca
- `src/lib/fabrica/memoria/cambiar.ts` (aprobar una habilidad), `src/components/memoria-fabrica/`,
  `fabrica/hooks/memoria.ts` (leer `habilidad`).

### Pruebas
- Aprobar escribe el `SKILL.md` y la línea del catálogo; rechazar no escribe nada.
- Nada sale a un modelo.

## P1 · El formato de un proceso y su lector

**Hecho el 26 de octubre de 2026.** `src/lib/fabrica/procesos/formato.ts`
(lector, revisor y plantilla, puros) y `disco.ts` (leer los de una línea y crear desde la
plantilla). Cómo quedó, y lo que se agregó al plan:

- `- [push] y PR contra main`: la rama base del PR sale de «PR contra»; sin eso, el push no abre
  PR. La rama que se empuja es la del frontmatter, y hace falta solo si hay un push.
- `deshacer: —` (o `-`, `nada`, `no`) dice que el comando no cambia nada de afuera. Es distinto de
  no decir nada, que es un problema. Con un paso así, producción no puede salir sola.
- Un comando corre sin shell: `|`, `&`, `;`, `<`, `>`, `` ` ``, `$(` y `$VAR` son un problema. Las
  marcas que pone el código son `{commit}`, `{anterior}` y `{rama}`; otra es un problema.
- `borrador: si` es nuevo: la plantilla nace así, con comandos de ejemplo, para que no corra hasta
  que él los cambie (P2 no corre un borrador).
- La pantalla de la línea es su parte en Configuración («Sus procesos»): cada proceso con sus
  pasos, lo que no cumple con su línea, y «Crear desde la plantilla», que no pisa `publicar.md`.
- La guardia del mod (`frenaProcesos`) ya está: ningún subagente escribe en `factory/procesos/`.

### Objetivo
Que cada línea pueda describir cómo se publica, en un archivo que se lee con `grep`, sin correr
nada todavía.

### Criterios de aceptación
- Formato de `factory/procesos/<id>.md` (frontmatter y una línea por paso), con los tipos de arriba.
- Lector y revisor puros: tipos desconocidos, un paso que cambia algo sin `deshacer`, una rama
  protegida en `rama`, un `cuando` que no existe.
- La pantalla de la línea muestra sus procesos y lo que no cumplen. Él los escribe a mano o desde
  una plantilla.

### Fuera de alcance
- Correrlos.

## P2 · Correr pasos locales

**Hecho el 26 de octubre de 2026.** `src/lib/fabrica/procesos/ejecucion.ts`
(lo puro: partir un comando, las marcas, tapar claves, el registro), `correr.ts` (el motor) y la
ruta `/api/fabrica/procesos`. Cómo quedó, y lo que se agregó al plan:

- Corre lo que tiene commit: el texto del proceso sale de `git show HEAD:`, y si el archivo tiene
  cambios sin commit, no corre. La raíz sin cambios se mira fuera de `factory/`, porque ahí
  escriben las tareas y el registro.
- Al llegar a un paso que todavía no corre (`push`, `ci`, `aprobacion`, `tarea`), se detiene sin
  deshacer nada: el resultado es «llegó», y para `{anterior}` cuenta como terminado.
- `clave: NOMBRE` es nuevo en el formato: así un comando declara qué clave recibe, y le llega con
  ese nombre. Una que falta frena antes de empezar, diciendo solo el nombre de la variable.
- El entorno de un comando es el de la aplicación sin sus claves (`entornoDelProyecto`, el mismo
  de los comandos del proyecto) más las que nombra.
- Sin shell de verdad: el comando se parte en argumentos con comillas, y las marcas van dentro de
  cada uno. En Windows, un `.cmd` o `.bat` va con `cmd /c` y no acepta argumentos que cmd
  interpretaría (`"`, `%`, `^`, `&`, `|`, `<`, `>`, `!`).
- La salud se reintenta cada 5 segundos hasta su tope, sin seguir redirecciones.
- `si falla: tarea` se lee, pero todavía no deja el pedido en la Bandeja: eso llega con P4.
- Detenerlo a mano no deshace: deja lo hecho y lo dice. Una ejecución que quedó «corriendo» al
  cerrarse la aplicación se da por detenida al leerla.
- Ella lo cuenta como la corrida: una vez, si terminó hace menos de dos horas (`fabrica_procesos`,
  en su base), con cada paso y lo que dijo el código, nunca con lo que dijeron los comandos.

### Objetivo
Correr un proceso hasta donde no toca nada de afuera de este equipo: `comando` y `salud`.

### Criterios de aceptación
- El motor corre los pasos en orden, sin shell, con tope por paso, en la raíz de la línea con la
  rama de trabajo al día (si la raíz tiene cambios sin commit, no corre: avisa).
- Si un paso falla, corre los `deshacer` de lo ya hecho, en orden inverso, y lo dice.
- Registro en el repositorio y salida completa en `comun/`, con las variables
  `COMPANIA_PROCESO_*` tapadas.
- Se corre a mano, con su clic. Ella cuenta cómo terminó.
- No corre un proceso que tenga problemas de formato ni uno con `borrador: si`.

### Pruebas
- Con comandos de mentira: uno que falla en el tercer paso deshace el segundo y el primero.
- Una clave pasada a un paso no aparece en el registro ni en la salida guardada.

## P3 · Push y PR

Sale de las decisiones 4 y 5, aceptadas el 26 de octubre de 2026.

**Hecho el 26 de octubre de 2026.** En `correr.ts` (`empujar`) y
`ejecucion.ts` (lo puro: qué herramienta, sus argumentos, qué dijo git). Cómo quedó:

- Empuja el commit con que empezó el proceso, no lo que haya en la raíz al llegar al paso:
  `git push --porcelain origin <commit>:refs/heads/<rama>`, con `GIT_TERMINAL_PROMPT=0` para que no
  se quede esperando una contraseña. El remoto es siempre `origin`. La guardia de la rama protegida
  está también aquí, aunque el revisor ya no deja correr un proceso así.
- «Sin la variable, el paso queda apagado»: se leyó como que el PR no se abre y el push sí, y el
  paso dice por qué. Si ya había un PR abierto para esa rama, el paso sale bien y lo dice.
- gh o glab: glab si la dirección del remoto dice «gitlab»; si no, gh (también para un GitHub
  propio, que gh resuelve con su configuración).
- Un `.cmd` de Windows (como puede ser gh) va con `cmd /d /s /c` y la línea entera entre comillas,
  con los argumentos tal cual: así una ruta con espacios o un título con espacios no se parten.
- El revisor suma un problema: un PR contra la misma rama que se empuja.
- Si después del push algo falla, el push queda «no se deshace»: la rama ya está en el remoto.

### Criterios de aceptación
- `push` empuja solo la rama del proceso, sin `--force`, y nunca una protegida (la misma lista de
  la fábrica).
- Abre el PR o merge request con `gh` o `glab` por su ruta exacta; sin la variable, el paso queda
  apagado y lo dice.
- Un push rechazado (la rama remota avanzó) no se fuerza: el proceso para y lo dice.

### Pruebas
- Contra un remoto desechable (un repositorio `--bare` en una carpeta temporal): empuja la rama;
  con `main` como rama, no empuja nada.

## P4 · Integración continua y entorno de prueba

**Hecho el 26 de octubre de 2026.** Cómo quedó:

- `ci` lee con `gh api repos/{owner}/{repo}/commits/<commit>/check-runs` (GitHub) o `glab api
  projects/:id/pipelines?sha=<commit>` (GitLab, su último pipeline), cada 15 segundos hasta su
  tope (30 minutos si no dice otro). Sin la ruta de la herramienta, falla: lo que sigue no puede
  dar la integración por buena. Si en dos minutos no aparece nada para el commit, falla diciendo
  que el proyecto no la tiene o que el commit no llegó. Tres lecturas seguidas que no se entienden
  también lo hacen fallar: es la herramienta, no la integración.
- El pedido a la Bandeja sale de `si falla: tarea` en el paso que falló (el paso `[tarea]` suelto
  sigue sin correr). Va sin fuente y **no suyo** (`es_suyo = 0`): `pasarALinea` ya no trata todo lo
  que no tiene fuente como un borrador suyo, así que pasa por `traeInstrucciones` como un issue
  ajeno. Un solo pedido abierto por proceso.
- `al-integrar` lo mira el vigía de la aplicación (el mismo que llama por teléfono), cada 15
  segundos, en todas las líneas. Una tarea nueva en `hecho` con `integrada` pone en fila los
  procesos encendidos de esa línea, que corren de a uno cuando no hay otra ejecución ni una corrida
  en esa línea. Encenderlo es por proceso y en este equipo (`procesosSolos` en los ajustes), solo
  para uno que dice `cuando: al-integrar`, y olvida lo integrado antes. Lo que no puede arrancar
  queda como una ejecución que falló antes de empezar.
- Cada ejecución dice cómo arrancó (`origen`): ella no dice «con un clic» cuando arrancó sola.
- El paso `ci` ya corre, así que las pruebas de P2 y P3 se detienen ahora en un `[aprobacion]`.

### Criterios de aceptación
- `ci` espera el resultado del commit en el servicio (leyendo, con el mismo `gh`/`glab`), con tope.
- `al-integrar`: el proceso arranca solo cuando una tarea pasa a `hecho` e integra, si él lo
  encendió para esa línea.
- Lo que falla puede dejar un pedido en la Bandeja con el error (texto de una máquina: entra como
  cita y pasa por la misma revisión que un issue de otra persona).

## P5 · Producción

Sale de la decisión 6, aceptada el 26 de octubre de 2026.

**Hecho el 26 de octubre de 2026**, salvo el mensaje confirmado (ver abajo).
Cómo quedó:

- El paso `aprobacion` deja la ejecución «esperando» y espera su respuesta en la configuración:
  aprobar, no aprobar o detener. Hasta 12 horas; después, no aprobado. Mientras espera, no corre
  otro proceso. Si la aplicación se cierra, se da por detenida al volver a leerla.
- **Mensaje suyo confirmado: no está.** Aprobar producción conversando necesita una pregunta nueva
  para Jev (como «correr», en `ordenes.ts`) y medir sus umbrales con `npm run jev:umbrales`, que
  gasta créditos. Queda para cuando él lo decida; hoy se aprueba con el clic.
- Al aprobar, se mira otra vez la raíz: tiene que seguir en el commit con que empezó y sin cambios
  fuera de `factory/`. Si no, el paso falla y se deshace lo hecho.
- No aprobarlo (o que se acabe la espera) deja lo hecho hasta ahí como está, sin deshacer: el
  entorno de prueba queda con lo que se probó. El registro dice «sin su clic».
- Ella lo avisa con una noticia aparte (`<id>:espera` en `fabrica_procesos`), y después cuenta
  cómo terminó. El teléfono suena si `llamarSola` está encendido, con un aviso nuevo
  (`produccion`, frase opcional del personaje con `{proceso}`).
- Quitar el clic es por proceso (no por toda la línea), en este equipo (`procesosSinClic`). Las
  condiciones (`porQueNoSinClic`) suman dos a las del plan: el proceso tiene un paso `aprobacion`,
  y hay un `salud` después de producción (sin él no hay cuándo deshacer). «Pasó entero en el
  entorno de prueba» se lee como: esta misma versión del proceso (la huella de su texto con
  commit) llegó al paso `aprobacion` al menos una vez. Se miran al quitarlo y cada vez que corre.
- La salud que falla después de producción ya deshacía todo desde P2; la prueba lo comprueba con
  producción.
- Las pruebas de P2 y P3 que se detenían en un `aprobacion` ahora se detienen en un `[tarea]`
  suelto, que sigue sin correr.

### Criterios de aceptación
- `aprobacion` detiene el proceso hasta su clic, o un mensaje suyo confirmado. Ella lo avisa; el
  teléfono suena si él lo pidió.
- Por línea, él puede quitar ese clic. La aplicación solo lo permite si todos los pasos que cambian
  algo tienen `deshacer` y el proceso pasó entero en el entorno de prueba al menos una vez.
- Una comprobación de salud que falla después de producción deshace solo, y lo dice.

## P6 · Procesos que corren solos

**Hecho el 26 de octubre de 2026.** Él aceptó ese día que el vigía mande a
OSV.dev nombres y versiones de paquetes, nada de código. Cómo quedó:

- `cada-dia` y `cada-semana` los corre el vigía de la aplicación (`arrancarLosPeriodicos`), el mismo
  que arranca lo que va al integrar, si él lo encendió con el mismo interruptor. «Con ella despierta
  o con él trabajando, como la Entrada» se leyó como la Entrada de verdad: corre en el servidor,
  mientras la aplicación está abierta en el modo trabajo, sin mirar si ella duerme.
- Cada cuánto se mide desde la última ejecución de ese proceso (también la que no pudo arrancar),
  así un día con la raíz sucia no lo deja intentando cada 15 segundos.
- El vigía es un tipo de paso nuevo, `vulnerabilidades`, en `vulnerabilidades.ts`: así usa el
  registro, el aviso de ella y el pedido a la Bandeja que ya existían. Solo OSV.dev (su
  `querybatch`), no `npm audit` ni `dotnet list package --vulnerable`: esos mandan más de lo que él
  aceptó (el árbol entero a npm) o necesitan restaurar el proyecto.
- No lee la memoria sino los archivos de bloqueo: la memoria anota rangos (`^8.11.3`), y OSV.dev
  necesita la versión exacta. Un paquete de un registro privado, de git o de un archivo no sale.
- De OSV.dev se toman solo los ids (`GHSA-…`, `PYSEC-…`), con su dirección en osv.dev; el resumen
  que trae lo escribió otra persona y no entra al pedido.
- La plantilla `vigia.md` nace lista (no es un borrador), una vez al día y con `si falla: tarea`.

### Criterios de aceptación
- `cuando: cada-dia` o `cada-semana` los corre el latido de la aplicación, solo con ella despierta
  o con él trabajando (como la Entrada).
- El primero: el vigía de vulnerabilidades. Lee las versiones que ya anota la memoria, consulta una
  base pública (OSV.dev, `npm audit`, `dotnet list package --vulnerable`) y, si una tiene un CVE,
  deja en la Bandeja el pedido de actualizarla. Lo que sale hacia esa base son nombres y versiones
  de paquetes, no código: es una decisión suya, que se le pregunta antes de esta etapa.

## Hermes, más adelante

Hermes Agent queda como otra forma de **correr** los mismos procesos (él lo pensó para orquestar la
publicación: repositorios, Docker, pruebas), no como otro cerebro. Si se suma, lee
`factory/procesos/` y escribe en el mismo registro, con un contrato como el de
`puente-orquestador.md`. Antes hay que resolver lo que se vio el 26 de octubre: gasta créditos de una
API (no la suscripción), escribe su propia memoria y sus propias habilidades (habría que apagarlo) y
sería un segundo orquestador. Hasta entonces, los procesos los corre el motor de la aplicación.

**El 27 de octubre de 2026 él lo vio innecesario para publicar:** la CI/CD la hace GitLab, y la
fábrica la sigue con `[ci]`, también después de la fusión. Hermes queda, si acaso, para
reportería automatizada.

## Cargar menos de las Nikkes, más adelante

Lo anotó él el 27 de octubre de 2026, antes de empezar el plan del constructor. Hoy una
especialidad pasa al agente el archivo entero de cada una de sus Nikkes, siempre que la línea la
nombra (Plan-Spec, decisión 8). Con todo encendido son unos 16 mil tokens en la spec y unos 23
mil en la construcción. **Un agente relee ese prompt en cada vuelta de su trabajo**, y la
construcción además en cada retrabajo. La caché lo abarata, pero cuenta para el límite de su
suscripción.

Medido el 27 de octubre en las 11 Nikkes del constructor: **de 81 KB, 41 KB son su oficio**
(reglas, método, entrega y límites) y **40 KB son lore** (quién es, su voz, su escuadrón). El
lore se usa en dos líneas: la de apertura y la de cierre.

Las formas de cargar menos, de la más simple a la que más ahorra. Cada una se mide antes y
después en el informe de corridas, con la misma tarea:

1. **El lore de una sola voz.** El oficio de cada Nikke va siempre; el lore, solo de la Nikke
   que abre y cierra el resumen: la primera de la habilidad, o el agente mismo si es una Nikke.
   El archivo no se toca: la aplicación lo parte al leerlo, en `## Reglas que no puedes
   romper`; si un archivo no tiene ese título, va entero. **Ahorra cerca de la mitad.** Cambia
   su decisión de pasar el lore entero de cada una, así que es una decisión suya.
2. **Solo las especialidades que aplican a la tarea.** Hoy una especialidad encendida carga sus
   Nikkes aunque su «cuándo» no aplique, y entonces el agente no las usa. Jev ya lee el pedido
   para decidir la spec y el modelo. En esa misma pregunta diría qué especialidades aplican
   (IA, datos personales, interfaz, seguridad), y la corrida pasaría solo las Nikkes de esas.
   Si Jev no contesta o duda, van todas, como hoy. **Ahorra según la tarea:** en una que no
   toca IA ni interfaz, casi todo.
3. **Menos en el retrabajo.** Una vuelta de retrabajo corrige solo los hallazgos bloqueantes.
   Lleva el oficio de las Nikkes del tipo de hallazgo (uno de seguridad, las de seguridad), no
   todas. **Ahorra en cada vuelta** después de la primera.
4. **A pedido, con una herramienta del mod.** En vez del texto, el agente recibe la lista de
   sus Nikkes con una línea cada una, y pide el oficio de la que necesita con una herramienta
   del mod (`mcp__fabrica__nikke`, solo lectura, que lee de la carpeta de nikke). Es lo que más
   ahorra, pero tiene un riesgo: si el agente no la pide, trabaja sin el método. La lista tiene
   que decir cuándo pedir cada una. Leer directo de esa carpeta se descartó en Plan-Spec,
   porque una corrida sin nadie mirando podría tener ese permiso negado; con la herramienta, lo
   lee el mod.

**Lo que no cambia en ninguna:**
- las Nikkes no se copian ni se editan;
- el orden de los textos es fijo dentro de una corrida, para que el principio del prompt sea
  el mismo de tarea en tarea y entre en la caché;
- se mide antes de decidir.

**Recomendación:** medir primero una corrida con solo `construir-codigo`. Si pesa, empezar por
la 1 y la 2, que no cambian cómo trabaja el agente.

## La configuración de CI/CD, más adelante

Lo pidió él el 27 de octubre de 2026, con el plan de integración (`Plan-Integracion.md`): una
tarea sencilla se fusiona sola en `main` con su PR, y **el paso a producción se ve cuando cada
línea tenga su CI/CD**. Hasta entonces, producción sigue como está: su clic, salvo que él lo quite
en un proceso que cumple las condiciones.

**Lo que ya hay** y la CI/CD usaría: el paso `push` con su PR, el paso `ci` que espera la
integración continua con `gh` o `glab`, la `salud` después de desplegar, el clic para producción
(`aprobacion`) con lo que siempre lo pide (`salida.ts`: la base y el `[nucleo]`), y el agente de
salida con Viper y Marian, que hoy no corre en cada tarea y vuelve con esto.

**Donde `main` ya despliega.** Él lo probó el 27 de octubre de 2026 en un proyecto aparte, en
GitLab: un MR fusionado en `main`, hecho afuera, pasa a producción por la CI/CD del proyecto. En
una línea así, **el paso `fusion` es el paso a producción**: lo que la fábrica fusiona solo, sale.
Lo que lo frena es lo de la integración: solo entra solo lo sencillo; lo delicado (la base, el
pipeline, las dependencias, el `[nucleo]`) es siempre grande y espera su prueba, y lo grande no se
fusiona sin su veredicto. Si en esa línea él quiere su clic también para lo sencillo, basta con no
escribir el paso `fusion` en su proceso: el PR queda abierto para que lo fusione él.

**Lo que falta**, por línea:
1. **El pipeline del proyecto.** Su archivo (`.github/workflows/`, `.gitlab-ci.yml`, …) es de lo
   delicado: una tarea que lo toca es grande y él la prueba. Se puede pedir a la fábrica como una
   tarea más, con plantillas por plataforma (GitHub Actions, GitLab CI) que la aplicación propone y
   él aprueba, como las de la memoria.
2. **Los entornos.** Cuáles hay (prueba, `qa1`, producción) y qué rama o qué etiqueta despliega
   cada uno. Un proceso por entorno, con sus pasos.
3. **Quién despliega.** La CI del proyecto, con sus claves (la fábrica solo espera y mira la
   salud), o un comando de la línea con la clave en `.env.local`
   (`COMPANIA_PROCESO_<LINEA>_<NOMBRE>`). Recomendación: la CI, para que las claves no pasen por
   este equipo.
4. **El agente de salida, de vuelta**, antes de producción y no en cada tarea: decide si un cambio
   pide su clic aunque él lo haya quitado, con su plan para volver atrás.

**Las decisiones que son suyas:** qué entornos tiene cada línea, si producción puede ir sin su
clic en alguna, y si la fábrica escribe en la CI de un proyecto (hoy solo la lee). Va con Hermes,
arriba, si él termina corriendo estos procesos.

## Lo que dice la documentación y lo que hay que probar

Consultado en la documentación de Claude Code el 26 de octubre de 2026 (subagentes, habilidades,
ganchos y modo sin interfaz):

- **Documentado:** `skills:` en un subagente inyecta el contenido entero al empezar; sin `Skill` en
  `tools`, el agente no invoca otras. Una corrida `claude -p` sin `--bare` ve las habilidades del
  proyecto, las suyas personales y las de los plugins. Los ganchos de un plugin corren también
  dentro de los subagentes y reciben su tipo (`agent_type`); `SubagentStart` se puede filtrar por
  `fabrica:constructor`.
- **No documentado, y probado el 26 de octubre de 2026** con una corrida corta (ver H2): `skills:`
  funciona en agentes pasados con `--agents` y en los de un plugin; lo inyectado llega aunque el
  agente no tenga `Skill`; y la herramienta `Skill` recibe el nombre en el campo `skill`.
