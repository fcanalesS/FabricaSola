# La memoria de la fábrica: un vault de archivos Markdown

**Qué es.** El contexto que la fábrica no puede olvidar de cada proyecto: las decisiones de
arquitectura, el stack, lo que no se usa y por qué. Si en un proyecto se decidió PostgreSQL, una
corrección pedida meses después tiene que seguir sabiéndolo, y no proponer cambios para otra base.
Cada línea consulta su memoria antes de trabajar.

**Cómo es.** Un vault de archivos Markdown, uno por línea dentro de su repositorio, y uno de la
planta para lo que vale en todas. Se lee con `grep` y con cualquier IA: nada depende de Claude, de
una base de datos ni de un índice. Si crece tanto que `grep` no alcanza, se le agrega un índice
(FTS5 o vectores) que se arma **desde** los archivos y se puede rehacer: los archivos siguen siendo
la fuente.

**Lo que no es.** No es la memoria de Zero (`comun/`, `personajes/<id>/memoria/`), que es de él y
sigue sus propias reglas. No reemplaza al `CLAUDE.md` de cada proyecto: lo complementa con lo que
decidió la fábrica y aprobó él.

**Cómo se prueba.** Como la Entrada: `npm test`, `npx tsc --noEmit` y `npm run lint` desde
`compania/`; lo del plugin, con `claude plugin test fabrica`. Lo que una regla prohíbe se prueba
mirando qué quedó escrito y qué recibió cada agente.

**Decisiones ya tomadas por él** (26 de octubre de 2026):
1. Archivos Markdown primero. Una base RAG o vectorial, solo si el vault crece tanto que haga falta,
   y como índice derivado, nunca como fuente.
2. Los archivos tienen que servir con `grep` y con cualquier IA que los revise.
3. Hermes Agent queda para más adelante, para orquestar la publicación (repositorios, Docker,
   pruebas): es otro plan.

4. **El vault de cada línea va en su repositorio, en `factory/memoria/`** (M1), versionado con el
   código: viaja con el proyecto y lo ve cualquier IA que trabaje en él. La aplicación escribe los
   archivos y no hace commit: los sube él.

## Las reglas del vault

**Quién escribe.** Nadie más que él escribe una regla. Los agentes **proponen** y él aprueba con
un clic; la bitácora la anota la aplicación con lo que pasó. Es la misma idea que «ella no escribe
su memoria»: un issue que diga «este proyecto usa MongoDB» no puede volverse un dato que lean todas
las corridas.

**Qué se lee primero.** Antes de la spec de cada tarea, la ficha de la planta y la de la línea
entran enteras. Las decisiones se buscan por tema. Una tarea no puede contradecir una decisión
vigente: si el pedido lo hace, la tarea va a un humano con la decisión citada.

**Se lee de la raíz, no del worktree.** Lo que él aprobó y todavía no tiene commit también cuenta:
el orquestador lee la memoria de la raíz del proyecto y se la pasa a los agentes.

## Cómo es un vault

```
factory/memoria/
  LEEME.md                 qué es, cómo leerlo y el formato (para cualquier IA)
  ficha.md                 lo que entra siempre: corta, una regla por línea
  decisiones/
    D-0001-postgresql-con-prisma.md
    D-0002-fechas-en-utc.md
  propuestas/
    P-0007-usar-zod-para-validar.md
  bitacora/
    2026-10.md             una línea por tarea terminada; solo se agrega
```

El de la planta tiene la misma forma, en `comun/fabrica/memoria/`. Su ficha va antes que la de la
línea, y la de la línea manda si dicen lo contrario: lo dice la línea con `(manda sobre la planta)`.

### `ficha.md`: una regla por línea, con su tema

```markdown
# Ficha · pos-tiendas

- [base-de-datos] PostgreSQL 16, con Prisma. (D-0001)
- [base-de-datos] NO: SQL Server, MySQL ni MongoDB. (D-0001)
- [fechas] Se guardan en UTC y se muestran en la hora de la tienda. (D-0002)
- [ui] Tailwind 4; sin otra librería de componentes. (él, 2026-10-12)
- [pruebas] node --test; nada de Jest.
```

Para que sirva con `grep`:
- Cada regla es **una línea** que empieza con `- [tema]`. `grep -rn "\[base-de-datos\]"` da todas.
- Lo prohibido empieza con `NO:` después del tema. `grep -rn "NO:"` da todo lo que no se usa.
- Al final, entre paréntesis, de dónde sale: una decisión (`D-0001`) o él con la fecha.
- Temas en minúsculas, sin tildes, con guiones: `base-de-datos`, `autenticacion`, `despliegue`.
- Tope: **150 líneas o 8 KB**. Si lo pasa, la pantalla lo avisa: la ficha es lo que entra siempre.

### Una decisión: `decisiones/D-0001-postgresql-con-prisma.md`

```markdown
---
id: D-0001
titulo: PostgreSQL 16 con Prisma
estado: vigente
fecha: 2026-10-26
temas: base-de-datos, orm
origen: F-014
aprobo: él
reemplaza:
reemplazada_por:
---

## Decisión

La base de datos es PostgreSQL 16 y se accede con Prisma.

## Por qué

El hosting de la empresa ya la tiene, y las otras apps la usan.

## Qué se descartó

- SQL Server: licencia por núcleo.
- MongoDB: los reportes necesitan joins.

## Qué implica

- Las migraciones van con `prisma migrate`, nunca a mano.
```

- **Frontmatter plano**, `clave: valor`, una por línea: el mismo que las tareas. Se lee con `grep`
  (`grep -rl "^estado: vigente" decisiones/`) y sin librerías.
- `estado`: `vigente`, `reemplazada` (con `reemplazada_por`) o `rechazada`. Una decisión no se
  borra: se reemplaza, y queda la historia.
- `temas`: los mismos de la ficha, separados por coma.
- Secciones fijas `##`, siempre con el mismo nombre: una IA las encuentra sin adivinar.

### Una propuesta: `propuestas/P-0007-usar-zod-para-validar.md`

Igual que una decisión, con `estado: propuesta`, `propone: fabrica:constructor` y la tarea de
donde salió. Al aprobarla pasa a `decisiones/` con el siguiente `D-`, y su regla entra a la ficha.
Al rechazarla queda con `estado: rechazada` y el motivo: así no se vuelve a proponer lo mismo.

### `bitacora/2026-10.md`: lo que pasó

```markdown
- 2026-10-26 · F-014 · Exportar ventas a CSV · hecha · toca: src/reportes/ventas.ts · decisiones: D-0001
```

Una línea por tarea terminada, que solo se agrega. Es un hecho, no una regla: no entra siempre a
las tareas, pero se puede buscar («¿ya se hizo algo con los reportes?»).

### Formato común

UTF-8 y saltos LF; líneas de hasta 200 caracteres; nombres de archivo en minúsculas, sin tildes y
con guiones; ids estables (`D-0001`, `P-0007`) que no se reusan; enlaces relativos; sin HTML ni
tablas largas. `LEEME.md` explica todo esto en una página, para la IA que llegue sin contexto.

## Orden

```
Formato y lector → Crear el vault → La memoria entra a cada tarea → Guardia → Propuestas y bitácora → Pantalla Memoria
                                                                                         Índice (solo si hace falta)
```

1. **Formato y lector.** La lógica pura que lee y valida el vault, y busca en él. Todo lo demás la usa.
2. **Crear el vault de una línea**, con su `LEEME.md` y una ficha sembrada con lo que ya se sabe del
   proyecto, como propuestas.
3. **La memoria entra a cada tarea**: el orquestador y los agentes.
4. **Guardia**: ningún subagente escribe en el vault.
5. **Propuestas y bitácora**: lo que proponen los agentes y lo que pasó, al terminar una tarea.
6. **Pantalla Memoria**: ver, buscar, aprobar y corregir.
7. **Índice**, solo si el vault crece tanto que `grep` no alcanza.

## Formato y lector del vault

**Hecho el 26 de octubre de 2026.** `src/lib/fabrica/memoria/formato.ts` y
`plantillas.ts`, con 9 pruebas en `memoria.test.ts`. Al escribir una decisión, un `##` dentro de una
sección baja de nivel para no inventar otra sección.

### Objetivo
Leer, validar y buscar en un vault con lógica pura, para la aplicación y para las pruebas.

### Criterios de aceptación
- `src/lib/fabrica/memoria/formato.ts`: lee la ficha (reglas con tema, si es `NO:` y de dónde
  sale), una decisión o una propuesta (frontmatter y secciones) y una línea de bitácora.
- `revisarVault(archivos)`: lo que no cumple el formato, con archivo y línea: una regla sin tema,
  un frontmatter sin `id` o con `estado` desconocido, un id repetido, una regla que cita una
  decisión que no existe o que está reemplazada, una ficha que pasa el tope.
- `buscar(vault, texto, { temas })`: por palabra (sin tildes ni mayúsculas) y por tema, como
  haría `grep`; devuelve archivo, línea y el texto de la línea.
- `contradice(ficha, texto)`: si un texto nombra algo que la ficha prohíbe (`NO:`). Es la base de
  la guardia de la spec; no reemplaza el juicio del agente.
- Las plantillas de `LEEME.md`, `ficha.md`, decisión y propuesta, en un solo lugar.

### Archivos o zonas que toca
- Carpeta nueva `src/lib/fabrica/memoria/` (`formato.ts`, `plantillas.ts`) y sus pruebas.

### Pruebas
- Una ficha bien escrita se lee regla por regla; las mal escritas salen en `revisarVault` con su
  línea.
- Una regla que cita una decisión reemplazada se marca.
- `buscar` encuentra `PostgreSQL` escribiendo `postgresql` y por el tema `base-de-datos`.
- `contradice` ve «migrar a MongoDB» contra `NO: … MongoDB`, y no ve «MongoDB» en una línea que
  no lo prohíbe.

### Fuera de alcance
- Escribir en el vault: es de las etapas que siguen.

## Crear el vault de una línea

**Hecho el 26 de octubre de 2026.** `src/lib/fabrica/memoria/sembrar.ts` (lo
que se ve en los manifiestos, lógica pura) y `vault.ts` (crear en disco y resumir). Se crea al
inicializar la `factory/` y con «Crear la memoria» en Configuración › Fábrica › Proyecto, que
también dice cuántas reglas, decisiones y propuestas tiene. Las propuestas llevan la clave `regla`:
la línea que entraría a la ficha. La versión de una base de datos es la de su driver
(«PostgreSQL (pg 8.11.3)»), no la del servidor.

### Objetivo
Que cada línea tenga su vault, con lo que ya se sabe del proyecto sembrado como propuestas.

### Depende de
- Formato y lector del vault

### Criterios de aceptación
- En `factory/memoria/` del repositorio de la línea (decisión 4).
- «Crear la memoria» (en la pantalla de la línea y al inicializar la fábrica) escribe `LEEME.md`,
  una `ficha.md` vacía con su título y las carpetas. No pisa un vault que ya existe.
- Siembra **propuestas**, no reglas, con lo que la aplicación ya detecta: el stack y los comandos
  (`detectarComandos`), las dependencias que dicen la base de datos o el ORM (`pg`, `prisma`,
  `mssql`, `Microsoft.EntityFrameworkCore.SqlServer`…) y el framework. Él las aprueba o las borra.
- El vault de la planta se crea igual, en `comun/fabrica/memoria/`, sin siembra.

### Archivos o zonas que toca
- `src/lib/fabrica/memoria/` (crear y sembrar), `src/lib/fabrica/motor/proyecto.ts`
  (`inicializarFabrica`) y `src/lib/fabrica/motor/comandos.ts` (lo detectado).

### Pruebas
- Crear dos veces no pisa nada.
- Un proyecto con `prisma` y `pg` en `package.json` siembra una propuesta de PostgreSQL con
  Prisma; uno .NET con el paquete de SQL Server, una de SQL Server. Ninguna entra a la ficha sola.

### Fuera de alcance
- Leer el código para deducir decisiones: lo sembrado sale solo de lo que se ve en los archivos
  de configuración.

## La memoria entra a cada tarea

**Hecho el 26 de octubre de 2026.** En el plugin, `fabrica/hooks/memoria.ts`
(lógica pura, con 4 pruebas): `estado` trae `memoria.paraLosAgentes`, al pasar a spec la sospecha
queda en la bitácora, y con una sospecha la spec no se salta. La aplicación le pasa a cada corrida
`FABRICA_MEMORIA_PLANTA`. `correr.md` (regla 7) y los agentes de spec, construcción, revisión de
código y aprobación leen la memoria. `npm run fabrica:e2e` suma el paso «la memoria entra a la
tarea», y el 26 de octubre pasaron sus 28 comprobaciones con sesiones de verdad en Haiku.

### Objetivo
Que ninguna línea trabaje sin consultar su memoria, y que una tarea no contradiga una decisión
vigente.

### Depende de
- Crear el vault de una línea

### Criterios de aceptación
- `mcp__fabrica__estado` devuelve, por línea, la ruta del vault **en la raíz** y el texto de las
  dos fichas (planta y línea), ya leídas: lo aprobado sin commit también cuenta.
- `fabrica/commands/correr.md`: a la spec, al constructor, a los revisores y al aprobador se les
  pasan las dos fichas enteras, junto a las notas de `config.md`, y la ruta del vault con la
  instrucción de buscar las decisiones de los temas que toca la tarea (`grep -rln "temas:.*<tema>"`).
- `fabrica/agents/spec-escritor.md`: antes de escribir, lee las fichas y las decisiones de los
  temas del pedido. Si el pedido contradice una decisión vigente, devuelve `PEDIDO AMBIGUO` con la
  decisión citada («Choca con D-0001: este proyecto usa PostgreSQL»), y la tarea va a un humano.
- `fabrica/agents/revisor-codigo.md`: un cambio que contradice una regla de las fichas es un
  hallazgo BLOQUEANTE que cita la regla.
- `fabrica/agents/aprobador.md`: comprueba que el cambio respeta las fichas.
- El mod corre `contradice` sobre el pedido al pasar a spec: si lo ve, deja la sospecha en la
  bitácora de la tarea para el agente de spec (no decide solo).
- Lo mismo para los agentes de otros mods que la fábrica usa (la instrucción va en lo que se les pasa,
  no en su archivo).

### Archivos o zonas que toca
- `fabrica/hooks/register.tsx` (`estado`), `fabrica/hooks/tareas.ts`, `fabrica/commands/correr.md`,
  `fabrica/agents/spec-escritor.md`, `revisor-codigo.md`, `aprobador.md` y `constructor.md`.

### Pruebas
- `estado` trae las fichas de la raíz aunque el worktree tenga otra versión.
- Con `NO: MongoDB` en la ficha y un pedido «guardar en MongoDB», la tarea queda con la sospecha en
  su bitácora.
- De punta a punta (`npm run fabrica:e2e`, que gasta: se corre a mano): un pedido que choca con
  una decisión termina en `necesita-humano` citándola.

### Fuera de alcance
- Que la fábrica decida sola entre la decisión y el pedido: lo decide él.

## Guardia del vault

**Hecho el 26 de octubre de 2026.** `frenaMemoria` en `fabrica/hooks/tareas.ts`,
en los ganchos de Edit y Write junto a `frenaConfig`, con 3 pruebas. Cubre también la carpeta de
la planta (`FABRICA_MEMORIA_PLANTA`). De paso, las dos guardias normalizan la ruta (`rutaNormal`):
`factory/./config.md` o `factory/x/../memoria/ficha.md` ya no se las saltan. `## Para la memoria`
llegó con la etapa siguiente.

### Objetivo
Que ningún agente escriba una regla, ni por error ni porque un texto se lo pida.

### Depende de
- La memoria entra a cada tarea

### Criterios de aceptación
- La guardia del plugin que frena a un subagente en `factory/config.md` (`frenaConfig`) frena
  también cualquier escritura en `factory/memoria/`, con Edit y con Write.
- Lo que un agente quiere que se recuerde va en una sección `## Para la memoria` de su tarea
  (etapa siguiente), nunca en el vault.
- `puente-orquestador.md` lo dice en «Lo que NO debe escribir».

### Archivos o zonas que toca
- `fabrica/hooks/tareas.ts`, `fabrica/hooks/register.tsx`, `fabrica/hooks/tareas.test.ts` y
  `fabrica/docs/puente-orquestador.md`.

### Pruebas
- Un subagente con Write o Edit sobre `factory/memoria/ficha.md` o sobre una decisión: rechazado.
- El hilo principal (él en su sesión) sí puede.

### Fuera de alcance
- Lo que se escriba con un comando de shell: como con las tareas, la guardia mira Edit y Write.

## Propuestas y bitácora

**Hecho el 26 de octubre de 2026.** Las dos plantillas de tarea traen
`## Para la memoria`, con un `### Título` y `- clave: valor` por propuesta (`temas`, `regla`,
`decision`, `por que`, `descartado`, `implica`, `propone`; las claves se aceptan con tildes o sin
ellas). El agente de spec la escribe en la tarea; el constructor, que solo trabaja en su worktree, la
deja en su entrega y el orquestador la copia. Al pasar a `hecho` (no si se desvía a un humano),
`cierreEnLaMemoria` (`fabrica/hooks/memoria.ts`, lógica pura) arma los archivos y el mod los escribe
en el vault de la raíz; lo que tocó se toma antes de integrar, porque después el diff queda vacío.
Además de lo pedido: no se repite una que ya está en el vault en cualquier estado (no solo
rechazada); no se propone una sin temas o sin decisión; con el pedido de un issue, no pasa la que
repite ocho palabras seguidas de él; con `titulo_ajeno`, la bitácora dice «(título de un issue)»;
las líneas largas se cortan para que ninguna pase de 200. Lo que no se propuso, y por qué, queda en
la bitácora de la tarea. 9 pruebas en el plugin (110 en total), y una en la aplicación que pasa por
`revisarVault` una propuesta y una línea iguales a las del plugin.

### Objetivo
Que lo que la fábrica aprende de una tarea llegue a él como propuesta, y que quede registro de lo
que pasó.

### Depende de
- Guardia del vault

### Criterios de aceptación
- La plantilla de tarea suma `## Para la memoria`: el constructor y el agente de spec anotan ahí,
  con el formato de una propuesta, lo que decidieron y debería recordarse («usé Zod para validar
  porque…»). Solo decisiones que se puedan reutilizar, no detalles de la tarea.
- Al pasar a `hecho`, el mod copia cada una a `factory/memoria/propuestas/P-NNNN-<slug>.md` con
  `estado: propuesta`, `propone` y la tarea, y agrega la línea de la bitácora del mes. Las dos cosas
  van en la **raíz**, no en la rama de la tarea.
- Una propuesta igual a una rechazada (mismo título o mismos temas y regla) no se vuelve a crear.
- El texto de un issue nunca va a una propuesta: la sección la escriben los agentes, y lo que
  proponen pasa por él.

### Archivos o zonas que toca
- `fabrica/hooks/register.tsx` (`mover` a `hecho`), `fabrica/hooks/tareas.ts`,
  `src/lib/fabrica/motor/formato.ts` (plantilla), `fabrica/agents/constructor.md` y
  `spec-escritor.md`.

### Pruebas
- Una tarea con dos propuestas, al pasar a `hecho`, deja dos archivos en `propuestas/` y una línea
  en la bitácora; sin la sección, solo la línea.
- Una propuesta igual a una rechazada no se crea.

### Fuera de alcance
- Que una propuesta entre sola a la ficha.

## Pantalla Memoria

**Hecho el 26 de octubre de 2026.** `/fabrica/memoria` (solo en el trabajo,
como la Entrada): la planta y cada línea, con pestañas Propuestas, Ficha, Decisiones, Bitácora y
Buscar. Los cambios son lógica pura en `src/lib/fabrica/memoria/cambiar.ts` (aprobar, rechazar con
motivo, editar una propuesta, reemplazar una decisión, guardar la ficha); `pantalla.ts` arma la vista
y revisa lo que llega del navegador; `vault.ts` escribe solo la ficha, `decisiones/` y `propuestas/`,
con las rutas sacadas del vault leído, nunca del navegador. La regla entra a la ficha con el primer
tema de la propuesta, junto a las de su tema. Una propuesta con `reemplaza` deja la vieja reemplazada
al aprobarse. La ficha que él escribe se rechaza si una línea no es una regla o pasa de 200; el tope
de la ficha y las citas a decisiones que no están vigentes se avisan, no se frenan. La pantalla dice
cuántos archivos del vault siguen sin commit (con `git status`; la planta vive fuera de un
repositorio). El id de la planta es `_planta`, que ninguna línea puede tener. Configuración enlaza a
la pantalla. 8 pruebas puras y 7 de la ruta (`/api/fabrica/memoria`), que miran que nada sale a la
red. Vista en el navegador solo vacía: los vaults con datos se probaron con las pruebas.

### Objetivo
Que él vea, busque, apruebe y corrija la memoria de cada línea y de la planta.

### Depende de
- Propuestas y bitácora

### Criterios de aceptación
- Página `/fabrica/memoria` (y una pestaña «Memoria» en la línea, cuando exista la pantalla de
  líneas): elegir línea o planta; la ficha, editable por él; las decisiones vigentes y las
  reemplazadas; las propuestas para aprobar, editar o rechazar con un motivo; y un buscador sobre
  todo el vault (`buscar`).
- Aprobar una propuesta escribe la decisión con el siguiente `D-`, agrega su regla a la ficha y
  deja la propuesta como aprobada. Reemplazar una decisión deja la vieja `reemplazada` con el enlace.
- Avisa lo que `revisarVault` encuentra y cuando la ficha pasa su tope.
- La aplicación escribe los archivos y **no hace commit**: quedan como cambios del repositorio para
  que él los revise y los suba. La pantalla lo recuerda si hay cambios sin commit en el vault.
- Ruta nueva en `/api/fabrica/memoria`, con su prueba.

### Archivos o zonas que toca
- `src/lib/fabrica/memoria/`, `src/app/api/fabrica/memoria/`, `src/app/fabrica/memoria/` y
  `src/components/memoria-fabrica/` (el nombre `memoria` ya es el de Zero).

### Pruebas
- Aprobar escribe la decisión y la línea de la ficha; rechazar no toca la ficha.
- Reemplazar deja las dos decisiones enlazadas y la ficha con la nueva.
- Nada de esto llega a ningún modelo: la red de mentira no registra pedidos.

### Fuera de alcance
- Que Zero proponga reglas conversando («este proyecto usa Postgres»): va después, como otra puerta
  de propuestas, y con la regla de que solo vale un mensaje que él escribió.

## Índice (solo si hace falta)

### Objetivo
Buscar rápido cuando el vault sea grande, sin cambiar dónde vive.

### Cuándo
Si una ficha no cabe en su tope aunque se resuma, si las decisiones de una línea pasan de unas 300,
o si `buscar` tarda o trae demasiado. Hasta entonces, no se hace.

### Cómo
Primero SQLite FTS5 (ya viene en el Node de este equipo), y vectores con `sqlite-vec` y un modelo
de embeddings local solo si FTS5 se queda corto. Siempre armado desde los archivos y rehecho cuando
cambian: si se pierde, no se pierde nada.

## Más adelante: alertas de vulnerabilidades

Lo pidió él el 26 de octubre de 2026, para después. La memoria ya anota las versiones que se ven
(Node, .NET, los paquetes con su versión): con eso, un vigía podría consultar cada tanto una base
pública de vulnerabilidades (OSV.dev, los avisos de GitHub, `npm audit`, `dotnet list package
--vulnerable`) y, si una versión tiene un CVE, dejar en la Bandeja una petición de actualizarla. La
fábrica la haría como cualquier tarea: spec, construcción, sus pruebas, verificación y su
aprobación. Lo que sale hacia esa base son nombres y versiones de paquetes, no código: es una
decisión suya. Va con el plan de la publicación (Hermes), no con este.

## Al terminar

**Hecho el 26 de octubre de 2026.** La regla está en `compania/CLAUDE.md` («La memoria de la
fábrica son archivos Markdown, y las reglas las escribe él»). `fabrica/README.md` explica qué es el
vault, cómo se busca con grep, quién escribe qué y cómo lo usa la fábrica; el README de la
aplicación la nombra, y el `LEEME.md` de cada vault nuevo dice de dónde salen las propuestas y que
la ficha del proyecto manda sobre la de la planta. Con esto la memoria queda cerrada; el índice
espera a que haga falta. Lo que no cubre todavía: el e2e no termina una tarea con propuestas.

- Una regla nueva en `compania/CLAUDE.md`: la memoria de la fábrica son archivos Markdown en un
  vault por línea y uno de la planta; solo él escribe reglas, los agentes proponen; se lee de la
  raíz antes de cada tarea; una tarea no contradice una decisión vigente sin que él lo decida.
- `fabrica/README.md`: qué es el vault y cómo se lee.
