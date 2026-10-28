# El aprobador y la salida a producción

**Qué es.** Lo que sigue al constructor. El aprobador (`fabrica/agents/aprobador.md`) da el último
juicio sobre una tarea: si cumple lo que pidió la spec, con los hallazgos de los revisores
resueltos y la verificación en verde. Este plan le da tres cosas, **solo con Claude**:

1. **Opus por defecto**, elegible por línea como la spec y la construcción.
2. **El oficio Comprobación de entrega** (`entrega`), con su texto entero, como especialidad de
   la etapa de aprobación.
3. **La decisión de salida a producción**: primero, reglas del código; después, un agente con
   los oficios **Plan de reversión** (`plan-de-reversion`) y **Compatibilidad hacia atrás**
   (`compatibilidad`) que **solo puede endurecer**, es decir, pedir tu clic donde el proceso no
   lo pedía.

**Lo decidió él el 27 de octubre de 2026:**
- el aprobador, en la familia Claude, con Opus;
- tres revisores (código, seguridad, e interfaz con la UI y la UX juntas), como en el constructor;
- el retrabajo tiene tope de vueltas: «hasta que todo esté bien» sin tope gasta sin terminar;
- la salida a producción: reglas del código primero, y un agente con los oficios Plan de
  reversión y Compatibilidad hacia atrás que solo endurece;
- **nada de otro mod pide una firma dentro de una corrida.** Lo que espera una firma suya
  frenaría la fábrica; por eso las corridas no cargan ningún mod de `CLAUDE_CODE_PLUGIN_DIRS`.

**De dónde sale.** Él pasó una definición en tres puntos. Así queda cada uno:

| Su punto | Hoy | Con este plan |
|---|---|---|
| Recibe lo de los revisores; si hay un error, rechaza y el builder corrige | **Ya existe.** Un BLOQUEANTE de revisión vuelve a construcción. El aprobador revisa cada criterio y cada BLOQUEANTE de cualquier vuelta, y el mod no deja aprobar con uno abierto. Hay un tope (`max_vueltas`, 3 por defecto) y después la tarea lo espera a él. | Igual, con el tope a la vista en Una línea. |
| Cuatro revisores: seguridad, UX, UI y código | Tres: código, seguridad e interfaz (UI y UX). | Tres. Separar UI y UX suma una revisión por tarea sobre el mismo diff. |
| Lo juzga Opus, contra los estándares del brain | El modelo de aprobación es el de la corrida. Las fichas de la planta y de la línea ya entran, y lo que va contra un `NO:` o una decisión vigente se rechaza. | Opus por defecto, por línea. Las fichas, igual. |
| Otro agente decide si va directo a producción o pide revisión; en lo crítico, bloquea | Producción sin su clic es una decisión suya, por proceso, y el código la permite solo si se cumplen condiciones (`porQueNoSinClic`). | Reglas del código y un agente que **solo puede pedir su clic**, nunca quitarlo. |

**Cómo se prueba.**
- **App:** `npm test`, `npx tsc --noEmit` y `npm run lint`, desde `compania/`.
- **Mod:** `claude plugin test fabrica`, cuando se toca `fabrica/hooks/`.
- **Nada llama a un modelo en las pruebas.** Se prueba qué le llega a cada agente, qué escribe el
  código en la tarea y qué hace el paso de producción.
- **`npm run fabrica:e2e` gasta:** se pregunta antes.
- **En el navegador, solo mirando.**
- **Cada pantalla nueva actualiza el lienzo.**

**Convenciones que importan** (`compania/CLAUDE.md`):
- **Un proceso de la fábrica lo corre el código, no un modelo.** Producción sin su clic es una
  decisión suya, por proceso, con condiciones que mira el código. Este plan no la afloja: solo
  agrega razones para pedir el clic.
- **Una habilidad solo vale si el catálogo de la línea la nombra, y la escribe él.**
- **Un guardia va pegado a lo que protege, no en quien llama.**
- **Español neutro, sin voseo y con tildes.**

## Qué hay hoy y qué falta

| Lo que se pide | Hoy | Dónde |
|---|---|---|
| Rechazar y volver a construcción | Sí | `mcp__fabrica__aprobar` y el retrabajo del mod |
| No aprobar con un BLOQUEANTE abierto | Sí | `hAprobar`, en `fabrica/hooks/register.tsx` |
| Tope de vueltas | Sí, en `config.md` (`max_vueltas`), sin verse en Una línea | `fabrica/hooks/tareas.ts` |
| Las fichas del brain en el aprobador | Sí | Entran enteras a cada agente |
| El modelo de la aprobación por línea | Existe (`modelo_aprobacion`), por defecto el de la corrida | `ROLES_CON_MODELO` |
| Elegirlo desde Una línea | **No** | — |
| Comprobación de entrega en el aprobador | **No** | — |
| Especialidades en la etapa de aprobación | **No** | Hoy solo spec y construcción |
| Que una tarea crítica pida su clic aunque el proceso no lo pida | **No** | — |
| Marcar el núcleo del negocio | **No** | — |
| Que nada de otro mod pida una firma en una corrida | Sí: la corrida no carga ningún mod de `CLAUDE_CODE_PLUGIN_DIRS` | — |

## Decisiones de este plan

Las cinco primeras son suyas. Las demás son mis recomendaciones.

1. **Opus por defecto en la aprobación, elegible por línea, solo Claude** (decisión suya). Sin
   cambio por tarea: el aprobador juzga, no construye, y una tarea difícil ya tiene su modelo
   en la spec y en la construcción.
2. **Tres revisores** (decisión suya).
3. **Tope de vueltas** (decisión suya). El que ya existe, a la vista.
4. **Salida: reglas del código primero, y un agente que solo endurece** (decisión suya).
5. **Nada de otro mod pide una firma en una corrida** (decisión suya). Una guarda que espera una
   firma dejaría a la corrida esperando a alguien.
   - Las corridas no cargan ningún mod de `CLAUDE_CODE_PLUGIN_DIRS`.
   - Si él elige para una etapa el agente de uno de esos mods, ese agente viaja con `--agents`,
     sin las guardas de su mod.
   - Los oficios son texto: llegan enteros y no traen herramientas propias. La entrega va en
     texto, y los veredictos se registran con las herramientas de la fábrica.
6. **Comprobación de entrega entra como especialidad de la etapa de aprobación**
   (`aprobar-entrega`), por línea, como las del constructor: se ve lo que pesa y él la enciende.
   - **Se resuelve un choque:** el oficio Comprobación de entrega corre la construcción y las
     pruebas. En la fábrica eso lo hace la verificación, y el aprobador no vuelve a correrlas:
     la última verificación de la bitácora cuenta como ejecutada.
   - Toma de ese oficio: el veredicto sin matices (`LISTO` o `NO LISTO` es aprobada o
     rechazada), lo accidental en el diff, y que el diff haga lo que dice la tarea.
7. **La calidad del diseño no entra.** Juzgarla es subjetivo, y rechazar por eso manda al
   constructor sin nada en la spec que le diga qué cambiar.
8. **El núcleo del negocio lo marca él, en la ficha de la línea**, con reglas del tema `nucleo`:
   `- [nucleo] db/servidor/** — el esquema de la base`. Es el formato de siempre, y la ficha
   solo la escribe él.
9. **Las reglas del código pueden más que el agente.** Si una regla marca la tarea, el agente
   no la desmarca. El agente solo puede marcar más.
10. **El agente de salida corre solo cuando cambia algo.** Si la línea no tiene ningún proceso
    con producción sin su clic, su clic ya se pide siempre, y el agente no se lanza. Usa
    Sonnet: clasifica y escribe un plan de vuelta, no juzga.
11. **Lo que decide queda en la tarea, y lo respeta el código del proceso.** El paso
    `aprobacion` de un proceso pide su clic, aunque él lo haya quitado, si alguna tarea que
    entra en ese commit quedó marcada.

## Orden y por qué

1. **El modelo del aprobador y el tope a la vista.** Casi todo existe.
2. **Comprobación de entrega en el aprobador.**
3. **Las reglas de la salida.** El código, sin modelo: sirve aunque nunca se encienda el agente.
4. **El agente de salida.** Usa lo de la etapa 3.

## 1. El modelo del aprobador, y el tope a la vista

### Criterios de aceptación
1. Sin `modelo_aprobacion` en `config.md`, la aprobación usa **Opus**, igual en la aplicación
   (`modeloDeRolDesde`) y en el mod (`POR_DEFECTO`).
   - Una línea que ya decía otro modelo sigue con el suyo.
   - **Cuesta:** las líneas sin el campo pasan de el de la corrida a Opus. La nota del cambio lo
     dice.
2. En Una línea, «Se aprueba con», como la ficha de la spec y la de la construcción
   (`FichaDelModelo`), con su línea.
3. La ficha «Quién aprueba» dice el tope: «Hasta 3 vueltas de retrabajo; después te espera».

### Pruebas
- Sin el campo, Opus en los dos lados; con el campo, el suyo.
- Cambiarlo en una línea que no es la activa escribe en la suya.

### Cómo quedó (27 de octubre de 2026)
- **Opus por defecto:** `modeloDeRolDesde` (app) y `POR_DEFECTO` (mod) dan Opus a la
  aprobación sin `modelo_aprobacion`. DoveCentral.NET10 no lo tenía, así que desde ahora
  aprueba con Opus.
- **En Una línea:** «Se aprueba con», la tercera `FichaDelModelo`, con los modelos y lo que se
  dice de cada uno en `MODELOS_DE_LA_APROBACION` (`piezas.tsx`). Las siete fichas quedan en
  cuatro columnas en una pantalla ancha.
- **El ajuste:** `PUT /api/fabrica/linea` acepta `modeloSpec`, `modeloConstruccion` o
  `modeloAprobacion`, uno por vez. Ahora es un solo caso para los tres (`MODELOS_DE_LINEA`, en
  `planta/acciones.ts`), no uno por modelo.
- **El tope:** la ficha «Quién aprueba» termina con «Hasta 3 vueltas de retrabajo; después te
  espera», con el `max_vueltas` de esa línea.
- **Verificado:**
  - las pruebas: Opus por defecto en los dos lados, el cambio en una línea que no es la activa,
    la planta con los tres modelos y el tope, y un modelo desconocido o dos a la vez
    rechazados;
  - las 135 del mod;
  - en el navegador, las fichas en DoveCentral.NET10, solo mirando.

## 2. Comprobación de entrega en el aprobador

### Criterios de aceptación
1. Las especialidades tienen la etapa `aprobacion` además de `spec` y `construccion`.
2. La plantilla `fabrica/plantillas/especialidades/aprobar-entrega/SKILL.md`, con
   `oficios: entrega`:
   - qué toma de Comprobación de entrega (decisión 6) y el choque resuelto con la verificación;
   - no corre la construcción ni las pruebas;
   - su veredicto se registra con `mcp__fabrica__aprobar`.
3. En Memoria › Habilidades, «Especialidades del aprobador», con lo que pesa y «Proponerla».
4. `fabrica/agents/aprobador.md` suma la regla de las habilidades de su etapa, como el
   constructor.
5. Ningún agente de una corrida queda esperando una firma: la corrida no carga ningún mod de
   `CLAUDE_CODE_PLUGIN_DIRS` (decisión 5).

### Pruebas
- La plantilla se lee con su oficio y se propone en la etapa de aprobación.
- El aprobador con la especialidad lleva el texto de Comprobación de entrega.

### Cómo quedó (27 de octubre de 2026)
- **Sin firmas en una corrida:** las corridas no cargan ningún mod de `CLAUDE_CODE_PLUGIN_DIRS`.
  Un agente de uno de esos mods, si él lo elige para una etapa, viaja con `--agents`, sin las
  guardas de su mod. No hace falta un freno a sus herramientas.
- **La regla común de los oficios** (`conSusOficios`) dice, para todas las etapas, que mandan los
  límites del agente y que lo que escribe en la tarea va técnico y neutro.
- **La plantilla** `fabrica/plantillas/especialidades/aprobar-entrega/SKILL.md`, con el oficio
  Comprobación de entrega:
  - no corre la construcción ni las pruebas (vale la verificación de la bitácora);
  - registra con `mcp__fabrica__aprobar`;
  - LISTO es aprobada y NO LISTO es rechazada;
  - busca lo que se coló, comprueba que el diff haga lo que dice la tarea, y anota lo que está
    bien;
  - una clave expuesta sin resolver es rechazada sin discusión.
- **La etapa de aprobación tiene especialidades** (`ETAPAS_CON_ESPECIALIDADES`). En Memoria ›
  Habilidades está «Especialidades del aprobador», con lo que pesa por aprobación.
- **`fabrica/agents/aprobador.md`** suma la regla 6: las habilidades de su etapa, y sus reglas
  sobre las de los oficios.
- **Verificado:**
  - las pruebas: la plantilla, su propuesta y aprobación en la etapa de aprobación, el
    aprobador que lleva Comprobación de entrega con la regla;
  - en el navegador, la sección en DoveCentral.NET10, solo mirando.

## 3. Las reglas de la salida

### Objetivo
Que una tarea que toca la base de datos o el núcleo del negocio nunca pase sola a producción,
sin preguntarle a ningún modelo.

### Criterios de aceptación
1. Al aprobarse una tarea, el código mira sus archivos cambiados (el diff contra su rama de
   origen) y la marca **`salida: tu-clic`** si toca:
   - migraciones, `.sql` o esquemas (una lista fija en el código, por ejemplo
     `**/migrations/**`, `**/Migrations/**`, `*.sql`, `schema.prisma`);
   - una ruta que la ficha de la línea marca como núcleo (`- [nucleo] patrón — por qué`).
2. Con el motivo en una línea, en `salida_motivo`: «toca `db/servidor/tablas.sql` (núcleo: el
   esquema de la base)».
3. Los dos campos son del mod: ni un agente ni el orquestador los escriben con una edición.
4. El paso `aprobacion` de un proceso pide su clic, **aunque él lo haya quitado**, si alguna
   tarea integrada entre `{anterior}` y `{commit}` dice `salida: tu-clic`. Lo dice en la nota:
   «F-014 toca el núcleo: espera tu clic».
5. En la tarjeta de la tarea y en su panel se ve: «Pide tu clic para producción», con el motivo.

### Pruebas
- Un cambio en un `.sql`, en una migración o en una ruta del núcleo marca la tarea; uno en otra
  parte no.
- Un proceso sin clic, con una tarea marcada en su commit, espera el clic igual; sin ella, pasa
  como hoy.
- Un agente que intenta escribir `salida` queda frenado.

### Cómo quedó (27 de octubre de 2026)
- **Un cambio respecto de los criterios 1 a 3:** la regla no marca cada tarea al aprobarla. La
  mira el paso de producción, sobre lo que cambió desde la última salida de ese proceso
  (`git diff {anterior}..{commit}`). Así no se escapa nada: ni una tarea que él aprobó desde la
  aplicación sin pasar por el aprobador, ni un commit hecho a mano, ni una tarea integrada por
  fuera. Por eso no hay campo `salida` en la tarea todavía. Llega con la etapa 4, para lo que
  marque el agente.
- **Las reglas** (`src/lib/fabrica/procesos/salida.ts`, lógica pura):
  - lo de la base, fijo en el código (`LO_DE_LA_BASE`): `**/migrations/**`, `**/*.sql`,
    `**/schema.prisma`, sin importar mayúsculas (Prisma salió del código el 27 de octubre de
    2026, con el plan de integración: ahora es una regla `[nucleo]` que se propone);
  - el núcleo, de la ficha de la línea (`nucleoDeLaFicha`): reglas del tema `nucleo`, con el
    patrón primero y el porqué después de una raya. Un patrón sin comodines es esa carpeta o
    ese archivo;
  - `coincide` arma la expresión carácter por carácter: un patrón no puede colar otra cosa.
- **En el paso `aprobacion`** (`esperarSuClic`, en `correr.ts`):
  - con su clic quitado, lo crítico es una razón más para no pasar solo, junto a las de
    `porQueNoSinClic`;
  - sin una salida anterior, o si git no puede comparar, tampoco pasa solo: no se sabe qué
    cambió;
  - con su clic puesto, la nota también dice lo crítico, para que lo vea antes de aprobar;
  - la nota nombra hasta cinco archivos con su porqué y cuenta los demás.
- **Criterio 5, a medias:** se ve en la espera del proceso (Configuración › Sus procesos, y ella
  lo cuenta con esa nota), no en la tarjeta de cada tarea. La tarjeta llega con la etapa 4.
- **Verificado:**
  - las pruebas de las reglas: los patrones, la ficha, el orden, la nota;
  - las de punta a punta, con git de verdad: con el clic quitado, un cambio cualquiera pasa
    solo, un `.sql` espera con su nota y una ruta del núcleo también; con el clic puesto, la
    nota lo dice, y la primera vez no agrega nada.

## 4. El agente de salida

### Objetivo
Que lo que las reglas no ven (un cambio de comportamiento en el corazón del negocio, una
ruptura de contrato, algo que no se puede deshacer) también pida su clic.

### Criterios de aceptación
1. Un agente nuevo de la fábrica, `fabrica/agents/salida.md`, con Sonnet, solo lectura, con
   `oficios: plan-de-reversion, compatibilidad` en su frontmatter. La corrida le pasa sus
   textos enteros, como a los agentes con habilidades.
2. Se lanza después de que el aprobador aprueba, **solo** si:
   - la tarea no quedó ya marcada por las reglas;
   - la línea tiene algún proceso con producción sin su clic en este equipo (la aplicación se
     lo dice a la corrida al lanzarla).
3. Toma de Plan de reversión: lo que no se puede deshacer, dónde iría un interruptor y la señal
   de retirada. Toma de Compatibilidad hacia atrás: qué se rompe para quien ya depende del
   código (columnas, contratos, valores por defecto, configuración).
4. Registra su decisión con una herramienta del mod (`mcp__fabrica__salida`) que solo acepta
   **`tu-clic`** (con motivo y plan de vuelta) o **`sin-objecion`**. Con `sin-objecion` no
   cambia nada: el proceso decide como siempre.
5. El plan de vuelta queda en la tarea (`## Plan de vuelta`), y el paso de producción lo muestra
   junto a su clic.

### Pruebas
- En una línea sin procesos sin clic, el agente no se lanza.
- Con una tarea ya marcada por las reglas, tampoco.
- `mcp__fabrica__salida` con `tu-clic` marca la tarea; con `sin-objecion` no la desmarca si las
  reglas la marcaron; con otra cosa, se rechaza.
- El agente lleva los textos de Plan de reversión y de Compatibilidad hacia atrás.

### Cómo quedó (27 de octubre de 2026)
- **El agente** está en `fabrica/plantillas/agentes/salida.md`, no en `fabrica/agents/`: desde
  ahí aparecería entre los agentes que se eligen para una etapa. Usa Sonnet, solo lee, y trae
  `oficios: plan-de-reversion, compatibilidad`. Su método:
  - lo que no vuelve (Plan de reversión);
  - lo que se rompe para quien ya depende (Compatibilidad hacia atrás);
  - el corazón del negocio aunque la ficha no lo marque;
  - en la duda, `tu-clic`.
- **Cuándo viaja:** la aplicación lo arma al lanzar la corrida (`agenteDeSalida`, en
  `motor/agentes.ts`, con los textos enteros de sus oficios) **solo** si la línea tiene algún
  proceso con su clic quitado. Entonces lo pasa como `fabrica-salida` y pone
  `FABRICA_SALIDA=1`. `mcp__fabrica__estado` trae `salida: "fabrica-salida"` (o `null`), y
  `correr.md` dice que se lance después de una aprobación, sin frenar la tarea.
- **Lo que registra** (`mcp__fabrica__salida`, `salidaEnLaTarea` en `fabrica/hooks/tareas.ts`):
  - solo del agente `fabrica-salida`, y solo sobre una tarea aprobada;
  - `tu-clic` exige motivo y plan: deja `salida`, `salida_motivo` y la sección `## Plan de
    vuelta`;
  - `sin-objecion` nunca desmarca;
  - los dos campos son del mod: ningún agente los edita.
- **El paso de producción** suma a lo de la etapa 3 las tareas marcadas que entran en ese commit:
  integradas en él y no en la salida anterior (`git merge-base --is-ancestor`). Con su clic
  quitado, no pasa solo; con su clic puesto, la nota lo dice: «Una tarea pide tu clic para
  producción: F-001 (…). Su plan de vuelta está en la tarea.».
- **A la vista:** la tarjeta de una tarea hecha dice «pide tu clic para producción», y su panel
  muestra el motivo y dónde está el plan de vuelta. Esto termina el criterio 5 de la etapa 3.
- **Se deja como está:** `fabrica/agents/` no tiene el agente, y por eso el plugin solo no lo
  conoce. En una corrida a mano, sin la aplicación, no se lanza.
- **Verificado:**
  - las pruebas del mod (142): la decisión, que `sin-objecion` no desmarque, que exija motivo y
    plan, la tarea aprobada, y la guardia de los campos;
  - las de la aplicación: el agente con sus dos oficios y su herramienta, que no aparezca entre
    los que se eligen, la nota, la tarjeta, y el paso de producción con git de verdad (una tarea
    marcada espera su clic y después no vuelve a contar);
  - no se vio en el navegador: DoveCentral.NET10 no tiene tareas que mostrar.
- **Verificado en la corrida real del 27 de octubre de 2026 (`npm run fabrica:corrida-real`), la
  primera:** el agente marcó F-002 (toca el núcleo) con `tu-clic` y su plan de vuelta, y F-001 con
  `sin-objecion`. Desde el plan de integración ya no corre en cada tarea: vuelve con la CI/CD.

## Lo que este plan no hace

- **Separar el revisor de UI y el de UX.** Si después hace falta, es otra decisión suya.
- **Cambiar el modelo del aprobador en una tarea.**
- **Que un agente quite su clic para producción.** Eso sigue siendo suyo, por proceso, y con las
  condiciones del código.
- **Cargar un mod de `CLAUDE_CODE_PLUGIN_DIRS` en una corrida.**
- **Al construirse**, `compania/CLAUDE.md` suma una regla con lo que él decidió aquí.
