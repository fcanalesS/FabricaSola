# La planta: varias líneas a la vista, y después corriendo a la vez

**Qué es.** La parte de Zero 2.0 que todavía no está construida: las pantallas de la fábrica
con varias líneas. El diseño está en el lienzo «Zero 2.0 · Panel de la fábrica», página
«v2 · Varias líneas»: **La planta** (claro y oscuro), **Una línea · pos-tiendas** y
**Tareas · todas las líneas**. La Entrada, la Memoria y la Configuración de esa misma página ya
están hechas; este plan es lo que falta para que la fábrica se vea como en el lienzo.

**El orden lo decidió él el 26 de octubre de 2026: primero el lienzo, después el motor.** Las
pantallas se construyen leyendo lo que la fábrica ya guarda, sin cambiar cómo corre: hoy corre
una línea a la vez y las pantallas lo muestran tal cual. El cambio a la fábrica (varias líneas
corriendo a la vez, con puestos compartidos) va al final, en su propia etapa, cuando las
pantallas ya estén para mostrarlo.

**Cómo se prueba.**
- App: `npm test` (`node --test`), `npx tsc --noEmit` y `npm run lint`, desde `compania/`.
- Las rutas, con `src/pruebas/entorno.ts` y la red de mentira (`src/pruebas/red.ts`): carpeta
  recién hecha, claves de mentira, y una red que falla ante cualquier dirección que no conozca.
  Para varias líneas, dos repositorios desechables en esa carpeta, cada uno con su `factory/`.
- Mod: `claude plugin test fabrica`, solo si se toca `fabrica/hooks/` (la etapa 6).
- En el navegador, con sus líneas reales y **solo mirando**: nada se aprueba ni se corre en una
  revisión.
- Cada pantalla nueva actualiza también el lienzo (la nota de estado y, si cambió algo del
  diseño al construirla, su tablero «(construida)»).

**Convenciones que importan** (`compania/CLAUDE.md` y `AGENTS.md`):
- Español neutro, sin voseo y con tildes. Identificadores y datos guardados, sin tilde.
- Next.js 16 cambia cosas: antes de escribir una página o una ruta, leer la guía en
  `node_modules/next/dist/docs/`.
- `.env.local`, `comun/` y `personajes/<id>/memoria/` no se leen ni se copian.
- **Un id de línea desconocido es un error, nunca otra línea.** Toda acción desde una pantalla
  de varias líneas lleva su `linea`, y la función que escribe la resuelve con `lineaPorId`.
- **Un guardia va pegado a lo que protege, no en quien llama.**
- **El título de una tarea con `titulo_ajeno`** se muestra en la pantalla, pero lo que habla en
  voz alta (ella, el teléfono) dice solo su id. Igual que hoy.
- Una ruta nueva, o un guardia nuevo en una ruta, lleva su prueba.

## Qué hay hoy y qué falta

Hoy casi todo el motor mira **la línea activa** (`raiz()` en `src/lib/fabrica/motor/proyecto.ts`):
la instantánea del tablero (`instantanea`), responder una pregunta (`escribirRespuesta`), dar un
veredicto (`escribirVeredicto`), descartar, el vigía (`vigia.ts`) y la corrida (`iniciarCorrida`
en `corridas.ts`, «una corrida a la vez»). Lo que ya es por línea: `crearTareaEn`, la Entrada, la
Memoria, las habilidades, los procesos y `gastoDeHoy(proyecto)`.

| Lo que muestra el lienzo | ¿Existe el dato? | De dónde sale |
|---|---|---|
| Tareas por etapa de cada línea | Sí | `factory/tareas/*.md` de cada línea (`tareaDesde`) |
| «Te esperan»: preguntas y veredictos | Sí | `necesita-humano` sin respuesta; `aprobacion` sin veredicto, si la línea pide el suyo |
| Hechas hoy | Sí | El evento que la pasó a `hecho` en `eventos.jsonl`, con su hora |
| «A la primera» (7 días) | Sí | Hechas en 7 días con `vueltas: 0` |
| USD de hoy por línea | Sí | `gastoDeHoy(raiz)` |
| Corridas de hoy | Sí | `comun/fabrica/corridas/*.json`, por `meta.proyecto` |
| De dónde entró cada tarea | Sí | `origen_entrada` (GitHub, GitLab, formulario) u `origen_hallazgo` (deuda) |
| Stack de la línea | En parte | La ficha de su memoria, si la tiene; si no, nada |
| Puestos ocupados (agente, minutos) | En parte | `actividad` de la corrida en curso; hay **una** sola corrida |
| Línea «En pausa» | No | Etapa 5 |
| Línea «Detenida» (la rama no compila) | No | Fuera de este plan |
| Varias líneas corriendo a la vez | No | Etapa 6 |
| Puestos compartidos en la planta | No | Etapa 6 (cada línea tiene hoy su `paralelo_max`, de 1 a 6) |
| Tope de gasto por línea y de la planta | No | Etapa 6 (hoy hay un tope, y se aplica al proyecto que corre) |

## Decisiones ya tomadas por él

El 26 de octubre de 2026 eligió las cinco recomendadas. No se reabren.

1. **Ella no va en la planta, por ahora.** La planta es una página aparte (`/fabrica`), sin el
   modelo. En el lugar del lienzo donde está ella va una tarjeta con lo último que dijo de la
   fábrica y «Volver con ella». Ella sigue en `/`, con el tablero de la línea activa. Llevarla a
   la planta se decide después, cuando la página exista.
   *Descartado:* que la planta reemplace a la columna de la fábrica en `/`, con ella a la
   izquierda. Habría movido la página principal de ella y todo lo que cuelga de ella.
2. **Los puestos se reservan al lanzar.** Una corrida toma `min(su máximo, puestos libres)` al
   empezar y los suelta al terminar. Lo decide el código y le llega al mod con una variable que
   manda sobre `paralelo_max`. Un puesto reservado y sin trabajo no se presta a otra línea.
   *Descartado:* pedirlos etapa por etapa con un guardia en el mod.
3. **Pausar no corta lo que corre.** La etapa en curso termina, la línea no toma otra tarea y
   no se lanza otra corrida. «Detener» sigue siendo cortar.
4. **Hay un tope del día por línea y otro de la planta.** El tope de hoy pasa a ser por línea
   (ya se mide así: «hoy van X en este proyecto»). Si llega cualquiera de los dos, esa línea, o
   todas, se pausa sola.
5. **La línea activa se queda** para la columna de ella y la Configuración («la que se mira»).
   Las pantallas nuevas no la usan: cada acción lleva su línea.

## Cómo quedó (26 de octubre de 2026)

**Hechas, del 1 al 4: las pantallas del lienzo.** El motor no cambió: sigue corriendo una línea a
la vez. Lo que cambió respecto de este plan:

- **La lectura** vive en `src/lib/fabrica/planta/`: `lectura.ts` (lógica pura, con sus pruebas),
  `disco.ts` (`leerLaPlanta`), `ella.ts` (lo que ella ya dijo, de su base, solo para mostrarlo) y
  `acciones.ts` (lo que se hace con una tarea de una línea). `instantanea()` quedó como
  `instantaneaDe(raiz)`, y la de la activa no cambió.
- **Las corridas de hoy** salen de `corridasDelDia` (en `corridas.ts`), que lee solo las metas.
  El gasto de cada línea es la suma de sus corridas de hoy.
- **Dos rutas**, fuera de `atenderEnLaFabrica` (como la Entrada y la Memoria):
  `GET /api/fabrica/planta` (solo lee; con `personaje`, también lo que ella dijo) y
  `/api/fabrica/linea` (`GET` lee una tarea y, con `cambios=1`, su diff; `POST` contesta,
  aprueba, rechaza o descarta).
- **En la línea activa**, la acción va por `hacerEnLaFabrica`, como desde la columna: después del
  veredicto, la fábrica sigue sola. **En otra línea**, queda escrita en su `factory/` y la tarea
  sigue cuando corra esa línea, y la nota lo dice.
- **«De dónde entró»**: una tarea de un documento de requerimientos se reconoce por la marca que
  deja `crearTareas` en su pedido (`documento`, en `tareaDesde`). La que no tiene origen dice «A
  mano».
- **Las páginas** son `/fabrica` (la planta), `/fabrica/lineas/<id>` y `/fabrica/tareas`, con
  el menú lateral en `src/components/fabrica/marco.tsx`, que ahora usan también la Bandeja, la
  petición (que acepta `?linea=`), Fuentes y la Memoria. Se llega desde la columna de ella («La
  planta») y desde Configuración › Fábrica › Tareas.
- **Las pestañas de una línea** son Cola, Memoria, Entradas y Ajustes; las tres últimas llevan a
  sus pantallas. Requerimientos, Historial y Deuda siguen en la columna y en Configuración, solo
  para la activa.
- `src/components/entrada/cabecera.tsx` quedó sin uso: borrarlo pide su validación (la guardia
  del mod).

**Pendiente:** el motor, del 5 al 7.

## Orden y por qué

```
Lienzo:  1 Leer todas las líneas → 2 La planta → 3 Una línea → 4 Tareas de todas
Motor:   5 Pausar → 6 Varias líneas corriendo a la vez → 7 Ella y el teléfono con varias líneas
```

1. **Leer todas las líneas.** Las tres pantallas leen lo mismo. Sin esto, cada una repetiría la
   lectura. No cambia nada de lo que se ve hoy.
2. **La planta.** Es la pantalla de entrada, y la que más dice con solo leer.
3. **Una línea.** Es la primera que actúa (responder, dar un veredicto, nueva tarea aquí). Por
   eso las funciones de escribir pasan a recibir la línea.
4. **Tareas de todas las líneas.** Solo lee, y reusa las tarjetas de la etapa 3.
5. **Pausar.** Es el primer cambio al motor, y el más chico: un ajuste que la corrida mira
   antes de lanzar.
6. **Varias líneas a la vez.** Es el cambio grande: varias corridas, puestos y topes. Va al
   final porque las pantallas ya muestran por línea lo que corre.
7. **Ella y el teléfono.** El vigía y lo que ella cuenta miran hoy la línea activa. Con varias
   corriendo, tienen que mirar todas.

## 1. Leer todas las líneas

### Objetivo
Una sola lectura de la planta que usen las tres pantallas: cada línea con sus tareas, lo que le
espera a él, lo hecho hoy, su gasto y sus corridas.

### Criterios de aceptación
- `instantanea()` pasa a ser `instantaneaDe(raiz)`; la de hoy queda como
  `instantanea = () => raiz().then(r => r && instantaneaDe(r))`, sin cambiar su respuesta.
- `src/lib/fabrica/planta/lectura.ts` (lógica pura, con sus pruebas):
  - `etapaDe(tarea)`: la columna del lienzo para cada estado. `pendiente` → Pendiente; `spec`
    → Spec; `construccion` → Construcción (una vuelta de retrabajo también, con «2.ª
    vuelta»); `revision` → Revisión; `verificacion` → Verificación; `aprobacion` → Aprobación;
    `hecho` de hoy → Hechas hoy; `necesita-humano` → la etapa de la que vino (su último evento),
    marcada «te espera»; `descartada` no se muestra. Los estados salen de `ESTADOS`, en
    `motor/tipos.ts`.
  - `teEspera(tarea, config)`: una pregunta sin respuesta, o un veredicto que la línea le
    pide a él y no está.
  - `numerosDeLinea(tareas, eventos, ahora)`: abiertas, te esperan, hechas hoy y «a la
    primera» de los últimos 7 días (hechas con `vueltas: 0` sobre hechas; sin hechas, «—»).
  - `numerosDeLaPlanta(lineas)`: la suma, y la espera más vieja.
- `src/lib/fabrica/planta/disco.ts`: `leerLaPlanta()` lee cada línea **por separado**. Si una
  falla (carpeta que ya no existe, sin `factory/`), esa línea va con su error y las demás
  siguen. Las corridas de hoy salen de `comun/fabrica/corridas/` por `meta.proyecto`, con
  `mismaRaiz`.
- `GET /api/fabrica/planta` devuelve esa vista. Solo lee: va en la lista de rutas de solo
  lectura de las pruebas.

### Archivos o zonas que toca
- `src/lib/fabrica/motor/proyecto.ts` (`instantaneaDe`), `src/lib/fabrica/planta/` (nuevo),
  `src/app/api/fabrica/planta/route.ts` y su prueba.

### Pruebas
- Dos líneas desechables. Las tareas de una no aparecen en la otra, aunque tengan el mismo id
  (`F-012` de aquí no es `F-012` de otra).
- Una línea sin `factory/`, o con su carpeta borrada, sale con su error y no tapa a la otra.
- «A la primera»: una hecha con una vuelta no cuenta; una de hace 8 días tampoco.
- La instantánea de la línea activa sale igual que antes (las pruebas de hoy no cambian).
- Ningún pedido sale a la red.

### Fuera de alcance
- Puestos y estado «corriendo» por línea más allá de la única corrida de hoy (etapa 6).

## 2. La planta

### Objetivo
La página `/fabrica` como en el lienzo, con el menú lateral de la v2.

### Depende de
- Leer todas las líneas.

### Criterios de aceptación
- **El menú lateral** de la v2 (Fábrica: La planta, Líneas, Tareas · Entrada: Bandeja,
  Fuentes · Memoria · Configuración, y «Volver con ella»). Lo comparten las páginas de la
  fábrica que ya existen (`/fabrica/bandeja`, `/fuentes`, `/peticion`, `/memoria`), que hoy
  traen su propia cabecera. En una pantalla angosta se pliega.
- **Cabecera:** «La planta», «Al día · leído hace N s» (se vuelve a leer cada pocos segundos
  mientras la pestaña se ve), «Nueva tarea» (lleva a `/fabrica/peticion`). «Correr todas» y
  «Pausar la planta» se ven apagados, con «Llega con la etapa 6» o «con la 5».
- **Los cuatro números:** líneas corriendo de N, te esperan (con la más vieja), hechas hoy y
  «a la primera».
- **Cada línea, hoy:** la tabla del lienzo (estado, abiertas, te esperan, hechas hoy, a la
  primera, USD hoy).
- **Te esperan:** las tarjetas de pregunta y de veredicto, con «Abrir la tarea», que lleva a
  la línea (etapa 3). Responder desde aquí llega en la etapa 3.
- **Corridas de hoy:** línea, estado, tareas, cuándo empezó, cuánto duró y USD.
- **Puestos de trabajo:** con una sola corrida, los agentes que trabajan ahora (de su
  `actividad`), y el resto, libres. Se muestra el `paralelo_max` de la línea que corre, no un
  total de la planta, hasta la etapa 6.
- **Líneas de producción:** cada una con su barra de etapas, sus entradas (las fuentes que
  apuntan a ella) y su rama de trabajo. «Agregar una línea» lleva a Configuración.
- **Ella no está en la página** (decisión 1): en su lugar, una tarjeta con lo último que dijo
  de la fábrica y «Volver con ella».
- Claro y oscuro con los colores del personaje, como las otras páginas de la fábrica.
- Estado vacío: sin líneas, una sola tarjeta que lleva a agregar la primera.

### Archivos o zonas que toca
- `src/app/fabrica/page.tsx` (nuevo), un componente de menú en `src/components/fabrica/`, las
  cuatro páginas que hoy traen su cabecera, y los componentes de la planta.

### Pruebas
- La lógica de la vista (qué número va en cada tarjeta, el orden de «Te esperan» del más viejo
  al más nuevo) va en `planta/lectura.ts`, con sus pruebas.
- En el navegador, con sus líneas, solo mirando: claro, oscuro y angosto.

### Fuera de alcance
- Correr, pausar o detener desde aquí (etapas 5 y 6).

## 3. Una línea

### Objetivo
La página `/fabrica/lineas/<id>` como en el lienzo: la cola de esa línea en kanban, sus fichas
y lo que se puede hacer con sus tareas, sin que tenga que ser la línea activa.

### Depende de
- La planta (el menú). Por la decisión 5, la página no usa la línea activa.

### Criterios de aceptación
- `escribirRespuesta`, `escribirVeredicto`, `descartarTarea` y `seccionesDeLaTarea` reciben la
  línea; las rutas de hoy pasan la activa, y no cambian lo que hacen. Un id de línea
  desconocido es un error, sin escribir nada.
- `/fabrica/lineas` sin id lleva a la primera línea (o a la activa, si la hay).
- **Cabecera:** el camino (La planta › Líneas › nombre), las otras líneas para cambiar con un
  clic, su carpeta, su stack (si su memoria lo dice) y su rama de trabajo. «Nueva tarea aquí»
  abre la petición con la línea elegida. «Pausar esta línea», apagado hasta la etapa 5.
- **Las cuatro fichas:** verificación (sus comandos, y cuándo se probaron), puestos y tope
  (su `paralelo_max` y, desde la etapa 6, su tope), quién aprueba, y sus entradas. Cada enlace
  lleva a donde eso se cambia hoy (Configuración, Fuentes).
- **Pestañas:** Cola (el kanban), Requerimientos, Entradas, Ajustes, Historial y Deuda. Las
  que ya existen en la columna o en Configuración se reusan para esa línea. La que todavía
  solo sabe de la línea activa lleva a Configuración y no se finge.
- **El kanban:** siete columnas como en el lienzo, cada tarjeta con id, título, de dónde
  entró y su pie (el agente que la trabaja, «te preguntó hace N», «2.ª vuelta», «integrada hoy
  10:02»). Abrir una tarjeta muestra la tarea con su pregunta, su veredicto y sus cambios,
  como hoy en la columna. Responder y dar el veredicto se hacen ahí.
- La nota del lienzo: «Las tareas se numeran por línea: F-012 de aquí no es F-012 de otra».

### Archivos o zonas que toca
- `src/lib/fabrica/motor/proyecto.ts` y `rutas.ts` (la línea en las acciones),
  `src/app/fabrica/lineas/[id]/page.tsx`, y los componentes del kanban y de la tarea, sacados
  de `src/components/columna/fabrica.tsx` para que la columna y la página usen los mismos.

### Pruebas
- Responder una pregunta de la línea B con la activa en A escribe en B y no toca A.
- Línea desconocida → 404 en la página y 400 en la acción, sin escribir nada.
- La columna de ella sigue funcionando igual con la línea activa (sus pruebas no cambian).

### Fuera de alcance
- Mover las pestañas que hoy solo existen para la activa a cualquier línea, si son grandes:
  cada una que se mueva va como tarea aparte.

## 4. Tareas de todas las líneas

### Objetivo
La página `/fabrica/tareas`: todas las tareas abiertas de la planta, como en el lienzo.

### Depende de
- Una línea (sus tarjetas).

### Criterios de aceptación
- Cabecera con «N abiertas, M te esperan».
- **Agrupar por:** línea y etapa (la grilla del lienzo: una fila por línea, una columna por
  etapa), solo etapa (el kanban de todas juntas), o lista.
- **Filtros:** buscar por id, título, issue o rama; línea; de dónde entró (GitHub, GitLab,
  formulario, documento, deuda); y «solo las que te esperan». Los filtros quedan en la
  dirección de la página, para volver a ellos.
- Cada tarjeta lleva a su tarea en Una línea. Una línea pausada o con error se ve en su fila.

### Archivos o zonas que toca
- `src/app/fabrica/tareas/page.tsx` y su componente; el filtro, en `planta/lectura.ts`.

### Pruebas
- El filtro: por línea, por origen, por texto (sin importar tildes ni mayúsculas) y «te
  esperan», con tareas de dos líneas.

## 5. Pausar una línea, o la planta

### Objetivo
Que él pueda pausar una línea o la planta entera, como en el lienzo.

### Depende de
- La planta y Una línea.

### Criterios de aceptación
- Ajustes: `lineasEnPausa: string[]` y `plantaEnPausa: boolean`, en este equipo. Un id
  desconocido es un error.
- **El guardia va en `iniciarCorrida`:** con la línea o la planta en pausa no se lanza, diga
  quien diga (un clic, ella, el vigía, lo por retomar).
- Lo que ya corre no se corta (decisión 3): la etapa en curso termina y la línea no toma
  otra tarea. El mod lo sabe por un archivo de pausa que lee antes de tomar la siguiente.
- Los botones de la planta y de la línea se encienden. Ella lo cuenta al pausar y al
  reanudar.

### Pruebas
- Con la línea en pausa, `correr` no lanza nada y lo dice. Al reanudarla, sí.
- Lo por retomar de una línea en pausa queda esperando y no se pierde.

## 6. Varias líneas corriendo a la vez

### Objetivo
Que la fábrica trabaje varias líneas al mismo tiempo, con los puestos compartidos en la planta
y un máximo por línea (decisión 4 de la Entrada).

### Depende de
- Pausar. Las decisiones 2 y 4.

### Criterios de aceptación
- `corridas.ts` guarda la corrida en curso **por línea** (`mem` deja de ser una sola). «Ya hay
  una corrida en marcha» pasa a ser «en esta línea». `corridaActual()` sigue dando la de la
  línea activa, para la columna.
- **Puestos:** el total de la planta va en los ajustes (por omisión, 4) y cada línea mantiene
  su `paralelo_max`. Se reservan al lanzar (decisión 2): la corrida toma `min(su máximo,
  puestos libres)` y los suelta al terminar. Sin puestos libres, no se lanza y lo dice. Lo que
  la corrida recibe lo decide el código, nunca el orquestador.
- **Topes** (decisión 4): el del día, por línea, y uno de la planta. Llegar a cualquiera pausa
  (etapa 5) esa línea o todas; no borra nada.
- **«Correr todas»:** una corrida por cada línea con algo pendiente, sin pausa y con config
  válida, hasta llenar los puestos. Las que no entran se dicen, con su motivo.
- Dos corridas de líneas distintas no comparten nada en disco: cada una tiene su raíz, sus
  worktrees y su archivo en `comun/fabrica/corridas/`.
- La pantalla de la planta muestra los puestos de verdad y el estado «Corriendo» de cada
  línea.

### Archivos o zonas que toca
- `src/lib/fabrica/motor/corridas.ts`, `proyecto.ts` y `rutas.ts`, y donde el mod lee
  `paralelo_max` (`fabrica/hooks/tareas.ts`), para que la variable de los puestos mande.
- `fabrica/docs/puente-orquestador.md`: la variable de los puestos.

### Pruebas
- Con Claude Code de mentira (un programa que escribe una salida fija), dos líneas corren a la
  vez y cada una escribe solo en la suya.
- Puestos: con 4 en total y líneas de 2, 2 y 2, las dos primeras toman 2 cada una y la
  tercera no se lanza hasta que una termine.
- Una línea al tope se pausa sola y la otra sigue.
- `npm run fabrica:e2e` con dos líneas, **solo si él lo aprueba** (gasta).

### Fuera de alcance
- Una línea «Detenida» porque su rama de trabajo no compila (el lienzo lo muestra). Saberlo
  pide correr el build de la rama antes de cada corrida. Va en otro plan si lo quiere.

## 7. Ella y el teléfono con varias líneas

### Objetivo
Que el vigía, lo que ella cuenta y el teléfono sepan de todas las líneas, no solo de la
activa.

### Depende de
- Varias líneas a la vez.

### Criterios de aceptación
- El vigía (`vigia.ts`) lee los eventos nuevos de cada línea, con su propio punto de lectura
  por línea. Al agregar una línea, lo que ya tenía no llama a nadie.
- Lo que ella cuenta de la fábrica (`comentar.ts`) dice de qué línea es: «en pos-tiendas, F-009
  espera tu veredicto». Si una línea se pausa sola por su tope, lo cuenta una vez.
- El teléfono dice la línea y el id. Con `titulo_ajeno`, solo el id, como hoy.

### Pruebas
- Un evento en la línea B, con la activa en A, llama y dice B.
- Las pruebas de hoy del vigía y del teléfono siguen pasando con una sola línea.

## Lo que este plan no hace

- Llevar a ella a la planta (decisión 1: se decide cuando la página exista).
- El control remoto del iPhone y el iPad (página «Control remoto» del lienzo): es otra entrada
  a lo mismo y va en su propio plan, cuando la planta exista.
- Jira o Taiga en «De dónde entró»: llegan con su lector (plan de la Entrada).
- La línea «Detenida» por una rama que no compila.
