# El constructor (el builder): con qué modelo y con qué especialidades

**Qué es.** Lo que sigue al escritor de la spec. El constructor (`fabrica/agents/constructor.md`)
construye lo que dice la spec de una tarea, en su worktree. Este plan le da tres cosas, **solo con
Claude**:

1. **Tres especialidades por línea**, que cada línea enciende o no:
   - **código** (`construir-codigo`);
   - **seguridad** (`construir-seguridad`);
   - **interfaz** (`construir-interfaz`): la UI y la UX en una sola.
2. **Lo de IA como habilidad del cerebro** (`construir-con-ia`): una sola para toda la fábrica,
   como la Ley 21.719, que cada línea usa si su catálogo la nombra.
3. **El modelo de Claude que construye**, elegido por línea y con la opción de cambiarlo en una
   tarea: Haiku, Sonnet, Opus o Fable.

Cada especialidad trabaja con **sus Nikkes enteras**, lore incluido, como las de la spec: la
corrida le pasa al constructor el archivo de cada una, sin copiarlo ni tocarlo
(Plan-Spec, decisión 8).

**Lo decidió él el 27 de octubre de 2026:**
- código, seguridad e interfaz son especialidades por línea;
- lo de IA va en el cerebro de la fábrica, como habilidad;
- el modelo se elige por línea, y se puede cambiar en una tarea;
- **por ahora, solo Claude.** Codex y otras IA quedan para cuando los agentes nikke sirvan a
  cualquier programa (el «Después» de Plan-Spec).

**De dónde sale.** Él pasó una descripción del builder en cuatro áreas: herramientas y agentes,
contexto y RAG, integración con streaming, y resiliencia. La mitad es trabajo del constructor. La
otra mitad le toca a otra etapa de la fábrica, que ya existe:

| Del texto | Dónde va | Por qué |
|---|---|---|
| Conectores MCP que exponen bases y APIs internas | **Constructor** (IA y seguridad) | Es escribir código con criterio: permisos mínimos, consultas con parámetros. |
| Validar lo que devuelve un modelo antes de que llegue a la lógica | **Constructor** (IA) | Es el centro del puesto. |
| SSE y WebSockets hacia Next.js o WPF | **Constructor** (IA e interfaz) | Se construye. |
| Estado entre turnos y el límite de tokens | La estrategia, en la **spec**; el código, en el **constructor** | Cuánto contexto y qué se recorta es una decisión. |
| La tubería de RAG (ingesta, limpieza, fragmentación) | El código, en el **constructor** | Cómo se fragmenta lo decide la spec. |
| Qué modelo hace qué (enrutamiento entre agentes) | **Spec** | Es arquitectura. La cubre `spec-contratos-y-recursos`. |
| Respaldo entre un modelo de afuera y uno local | Lo decide la **spec**; el respaldo en código, el **constructor** | Docker y Nginx son despliegue: un proceso, no una tarea. |
| Que el contexto llegue en milisegundos | **Proceso** | Se mide, no se construye: la evaluación o una prueba de carga. |
| Edge y microcontroladores | **Fuera de este plan** | Es otro oficio, y el constructor no lo puede comprobar desde un worktree. |

La última frase de su texto queda como la regla principal de lo de IA: el código con IA necesita
defensas en profundidad, porque una respuesta puede ser **parcialmente correcta**.

**Cómo se prueba.**
- **App:** `npm test`, `npx tsc --noEmit` y `npm run lint`, desde `compania/`.
- **Mod:** `claude plugin test fabrica`, cuando se toca `fabrica/hooks/`.
- **Nada llama a un modelo en las pruebas.** Se prueba qué le llega al constructor: su modelo,
  sus habilidades y sus Nikkes.
- **`npm run fabrica:e2e` gasta:** se pregunta antes.
- **En el navegador, solo mirando:** nada se aprueba ni se corre en una revisión.
- **Cada pantalla nueva actualiza el lienzo:** la nota de estado, y un tablero si el diseño
  cambió.

**Convenciones que importan** (`compania/CLAUDE.md`):
- **Un id de línea desconocido es un error, nunca otra línea.**
- **Una habilidad solo vale si el catálogo de la línea la nombra, y la escribe él.** Las tres
  especialidades llegan como propuestas a Memoria › Habilidades; la de IA, como propuesta en La
  planta. Él las aprueba viendo sus archivos enteros. Aprobar nunca pisa una que exista, y la
  aplicación no hace commit.
- **Un guardia va pegado a lo que protege, no en quien llama.**
- **Español neutro, sin voseo y con tildes.** Los identificadores y los datos guardados van sin
  tilde.

## Qué hay hoy y qué falta

| Lo que se pide | Hoy | Dónde |
|---|---|---|
| Construir con Claude, en un worktree | Sí | `fabrica/agents/constructor.md`; en `auto`, Centi si la corrida carga nikke |
| El modelo de la construcción por línea | Sí, pero solo en Configuración › Fábrica | `modelo_construccion` en `factory/config.md` (`inherit` por defecto) |
| Elegirlo desde **Una línea** | **No** | — |
| Cambiarlo en una tarea | **No** | — |
| Que Jev abarate el modelo en las tareas simples | Sí | `decidir(T, "construccion")`: baja a Sonnet si Jev ve la tarea simple |
| Habilidades en la etapa de construcción | Sí | El agente `fabrica-hab-construccion`, con `skills:` |
| Las Nikkes de una habilidad, enteras, en su agente | Sí, para cualquier etapa | `conSusNikkes` y `agentesConHabilidades` (`motor/agentes.ts`) |
| Las tres especialidades del constructor | **No** | — |
| Una habilidad del cerebro para lo de IA | **No** | Existe el camino, estrenado con `ley-21719` |
| La memoria de la planta y de la línea en el constructor | Sí | Las dos fichas entran enteras a cada agente |

## Decisiones de este plan

Las cuatro primeras son suyas. Las demás son mis recomendaciones: se pueden cambiar sin rehacer
nada.

1. **Código, seguridad e interfaz son especialidades por línea** (decisión suya). Una línea que
   no tiene pantallas no enciende interfaz.
2. **Lo de IA va en el cerebro** (decisión suya): `construir-con-ia`, una habilidad suya
   (`~/.claude/skills/`), por el mismo camino que `ley-21719`. Se corrige en un lugar y vale
   para todas las líneas que la nombren. Una línea que no trabaja con IA no la carga.
3. **El modelo se elige por línea, y se puede cambiar en una tarea** (decisión suya).
4. **Solo Claude, por ahora** (decisión suya).
5. **La UI y la UX van juntas en el constructor, y las decisiones de UX son de la spec.** Quien
   construye una pantalla hace las dos cosas a la vez. Qué estados hay mientras la IA tarda,
   qué ve la persona con una respuesta a medias y cómo cancela, lo dice la spec. Si la spec no
   lo dice, el constructor sigue lo que ya hacen las pantallas del proyecto y lo anota en su
   entrega. No es una ambigüedad que lo detenga.
6. **Ninguna Nikke hace interfaz.** La especialidad de interfaz trabaja con las que miran
   mensajes y consistencia, y recomienda nombrar sus habilidades de diseño en el catálogo
   (`ui-ux-pro-max`, `emil-design-eng`, `design-system`). No las carga sola: el catálogo manda.
7. **Las Nikkes que solo leen revisan antes de entregar.** Crow, Modernia y Velvet no editan.
   En el constructor son una revisión de lo que él mismo escribió, antes de la entrega. No
   reemplazan al revisor de seguridad, que mira después.
8. **El modelo que él elige en una tarea manda sobre Jev.** Si él eligió un modelo para la
   construcción de esa tarea, Jev no lo abarata, y vale también en cada vuelta de retrabajo.
   Sin elección en la tarea, todo sigue como hoy: el de la línea, y Jev abarata las tareas
   simples.
9. **Una Nikke no se carga dos veces.** Si el constructor es Centi (en `auto`, con nikke
   cargado) y una habilidad nombra a Centi, su archivo no se repite en el prompt.
10. **El constructor sigue sin decidir el enfoque.** Maxwell, Laplace, Jackal, Viper y Neon no
    entran: diseñar es de la spec, un prototipo no pasa al proyecto, la carga y el despliegue
    van en procesos, y elegir una librería es de la spec.

## Las Nikkes de cada especialidad

| Especialidad | Nikkes | Qué toma de cada una |
|---|---|---|
| `construir-codigo` | centi-implementacion, ade-convenciones, drake-contrato, noah-robustez, rapunzel-pruebas | **Centi:** construir lo pedido al pie de la letra y parar ante dos lecturas; es su voz. **Ade:** el código nuevo, igual al de la casa, con el precedente citado. **Drake:** la forma de lo que viaja, cada campo con tipo, si falta y qué pasa si llega mal, y los errores como parte del contrato. **Noah:** los bordes, las cuatro respuestas a un fallo, nunca tragarse un error, y probar cada defensa rompiéndola. **Rapunzel:** las pruebas del cambio, la suite antes y después, sin borrar una que falle. |
| `construir-seguridad` | crow-abuso, modernia-interna, velvet-auditoria | **Crow:** antes de entregar, quién es el atacante de lo que construyó, autorización en el servidor, límites y gasto. **Modernia:** los permisos de más (un token, un conector MCP, una cuenta de servicio) y lo que se descarga al construir. **Velvet:** ninguna clave ni dato real en el código, en un ejemplo ni en un conjunto de prueba. |
| `construir-interfaz` | ade-convenciones, modernia-recien-llegada, liberalio-ruido | **Ade:** la pantalla igual a las que ya hay. **Modernia recién llegada:** nombres, mensajes de error y trampas, vistos por quien llega nuevo. **Liberalio:** un mensaje dice qué pasó y qué hacer, y ningún fallo queda en silencio (un streaming cortado, un respaldo que no avisa). |
| `construir-con-ia` (cerebro) | noah-robustez, drake-contrato, behemoth-drenaje | **Noah:** el validador de lo que devuelve el modelo, los reintentos con tope y el respaldo. **Drake:** el esquema de las herramientas MCP, el JSON que se le exige al modelo y los eventos del streaming. **Behemoth:** el gasto que no se ve, como un contexto que crece sin tope, una conexión de streaming que no se cierra o una llamada de pago dentro de un bucle. |

**Cuesta.** Con las cuatro encendidas son 11 archivos distintos, unos 81 KB: cerca de 23 mil
tokens más por construcción, y otra vez en cada vuelta de retrabajo. Solo código son 5, unos
34 KB. La pantalla lo dice al encender cada una.

**Cómo se controla.**
- Esos tokens van al principio del prompt del agente, que no cambia durante la corrida, y por
  eso entran en la caché. Pero un agente relee su prompt en cada vuelta de su trabajo: el costo
  real se multiplica por las vueltas, no por las tareas.
- Las corridas usan su suscripción de Claude Code, así que lo que se gasta es el límite de uso,
  no dinero de la API.
- Con la spec (sus cuatro especialidades, unos 16 mil tokens) y el constructor con todo
  encendido, una tarea suma cerca de 40 mil tokens de prompt antes de hacer nada.
- Por eso se encienden por línea, y solo las que la línea necesita. **Antes de encender las
  cuatro en una línea, se mide una corrida con solo `construir-codigo`** en el informe de
  corridas, y se compara con una sin especialidades.
- Si pesa demasiado, las formas de cargar menos están en «Cargar menos de las Nikkes», al final
  de `Plan-Habilidades-y-Procesos.md`. La que más ahorra sin cambiar cómo trabaja el agente es
  pasar solo el oficio de cada Nikke y el lore de una sola voz: la mitad de esos 81 KB es lore.
  Cambia la decisión 8 de Plan-Spec, así que es una decisión suya.

## Orden y por qué

1. **El modelo por línea.** Casi todo existe; falta elegirlo en cualquier línea, y que se vea.
2. **El cambio en una tarea.** Usa lo de la etapa 1, y toca la decisión de Jev.
3. **Las tres especialidades por línea.** Usa lo que ya hicimos para la spec.
4. **Lo de IA, en el cerebro.** Va después porque reusa el camino de la etapa 3 y el de
   `ley-21719`. Se puede escribir en paralelo con la etapa 3.

## 1. El modelo del constructor, por línea

### Objetivo
Que en **Una línea** se vea y se cambie con qué modelo construye, como ya se hace con la spec.

### Criterios de aceptación
1. La ficha de la línea muestra el modelo de construcción junto al de la spec: Haiku, Sonnet,
   Opus, Fable o «el de la corrida».
2. Cambiarlo escribe `modelo_construccion` en el `factory/config.md` de **esa** línea
   (`fijarModeloDeRol`, con su `linea`), no en la activa.
3. Mientras una corrida trabaja en esa línea, no se cambia: lo dice y no escribe nada.
4. Un valor que no es un modelo de Claude se rechaza.
5. La ficha dice que Jev puede abaratar las tareas simples a Sonnet, para que no sorprenda.

### Archivos o zonas que toca
- `src/lib/fabrica/planta/` (la acción y lo que se lee de la línea).
- `src/components/fabrica/linea.tsx` (la ficha, junto a la de la spec).

### Pruebas
- Cambiarlo en una línea que no es la activa escribe en la suya.
- Con una corrida en esa línea, no cambia.
- Un modelo desconocido se rechaza.

### Cómo quedó (27 de octubre de 2026)
- **La ficha:** en Una línea, «Se construye con» va al lado de «La spec se escribe con». Las dos
  son el mismo componente (`FichaDelModelo`, en `linea.tsx`). Los modelos y lo que se dice de
  cada uno están en `MODELOS_DE_LA_CONSTRUCCION` (`piezas.tsx`). Si no se elige ninguno, usa el
  de la corrida, igual que el plugin. Las seis fichas quedan en tres columnas, y en una pantalla
  ancha en seis.
- **El ajuste:** `PUT /api/fabrica/linea` acepta `modeloConstruccion` o `modeloSpec`, uno por vez
  (`ajusteDeLinea`), y escribe `modelo_construccion` en el `config.md` de esa línea
  (`fijarModeloDeRol`).
- **Jev:** la nota del cambio dice que en las tareas simples Jev puede usar Sonnet, salvo que
  el modelo elegido ya sea Sonnet o Haiku.
- **Lo que cambió del criterio 3:** no se bloquea con una corrida en marcha, igual que el modelo
  de la spec. La corrida lee el modelo cada vez que decide una construcción
  (`decidir(T, "construccion")`), así que el cambio vale desde la tarea siguiente, y la que ya
  está construyendo sigue con el suyo.
- **Verificado:**
  - las pruebas de la ruta: se fija en una línea que no es la activa, no toca el de la spec, la
    nota es la correcta, la planta trae los dos modelos, y un modelo desconocido o los dos
    juntos se rechazan;
  - en el navegador, la ficha en DoveCentral.NET10, solo mirando, a 800 y a 1700 de ancho.

## 2. El cambio en una tarea

### Objetivo
Que él pueda construir una tarea con otro modelo, sin cambiar el de la línea.

### Criterios de aceptación
1. La tarea guarda su elección en su frontmatter: `modelo_construccion`, el mismo nombre que en
   `config.md`.
   - La escribe la aplicación, por su clic, mientras la tarea no está tomada por una corrida.
   - El texto de un issue no puede ponerlo, y el mod frena a un agente que intente escribir ese
     campo (`DEL_USUARIO`).
2. Con una elección en la tarea, `decidir(T, "construccion")` contesta ese modelo **sin
   preguntarle a Jev** y sin abaratar, y lo deja en la bitácora de la tarea una vez.
3. Vale en cada vuelta de retrabajo, no solo la primera.
4. En el panel de la tarea, el selector está junto al de la spec. En una petición de la
   Entrada, en el mismo `<details>` plegado.

### Archivos o zonas que toca
- `src/lib/fabrica/motor/` (tipos, formato y `proyecto.ts`, como `modeloSpec`).
- `src/lib/fabrica/planta/` y `src/lib/entrada/` (la acción y la petición).
- `fabrica/hooks/` (`tareas.ts`, `register.tsx`, la decisión de construcción) y
  `fabrica/commands/correr.md` («Con qué modelo»).

### Pruebas
- Con el modelo elegido en la tarea, la decisión de construcción no le pregunta a Jev y lo
  devuelve, también en la segunda vuelta.
- Sin elección, sigue como hoy.
- Un agente que intenta escribir `modelo_construccion` queda frenado.

### Cómo quedó (27 de octubre de 2026)
- **En la tarea:** `modelo_construccion` en su frontmatter. Lo escribe
  `fijarModeloDeConstruccionDeTarea`, que comparte la guardia con el de la spec
  (`fijarModeloDeTarea`, en `motor/proyecto.ts`): un modelo de Claude o `null` (vuelve al de la
  línea), no con la tarea tomada por una sesión, y una línea en su bitácora.
- **Cuándo se elige:** mientras la tarea pueda volver a construirse
  (`eligeModeloDeConstruccion`): en cualquier estado, salvo hecha o descartada. Incluye
  revisión y aprobación, porque desde ahí puede volver a construcción.
- **En la línea:** la acción `modelo_construccion` de `POST /api/fabrica/linea`. Escribe en esa
  línea, sea o no la activa, y no con una corrida trabajando en ella.
- **En el panel de la tarea:** «Construir con» (o «Construir, la próxima vez, con» si ya pasó
  por la spec), debajo del selector de la spec. Las dos son el mismo componente
  (`ModeloDeLaTarea`).
- **En la petición:** el `<details>` plegado se llama ahora «Con qué modelos se hace» y tiene
  los dos selectores. Un borrador para la Bandeja no lleva ninguno.
- **En el mod:**
  - `decidir(T, "construccion")` con el campo contesta ese modelo, sin preguntarle a Jev ni
    abaratarlo (`construccionElegidaPorEl`);
  - deja en el camino de la tarea «construcción con opus: lo eligió él para esta tarea», una
    vez por vuelta;
  - `modelo_construccion` está con `modelo_spec` en `DEL_USUARIO`: un agente que lo edite queda
    frenado, y una tarea nueva no nace con él;
  - `correr.md` lo dice en «Con qué modelo».
- **De paso:** «El de la línea (El de la corrida)» se leía raro. La opción ahora dice «El de la
  línea (el de la corrida)», en la petición y en el panel (`opcionDeLaLinea`).
- **Verificado:**
  - las pruebas de la ruta de la línea: se elige en revisión y en aprobación, no en una
    descartada, no toca el de la spec, y la tarjeta lo muestra;
  - las de la petición: los dos modelos por separado, y no en un borrador;
  - las del mod: la decisión con y sin elección, y la guardia del campo;
  - en el navegador, la petición con sus dos selectores, sin enviarla. El panel de una tarea no
    se vio, porque DoveCentral.NET10 no tiene tareas.
- **Verificado en la corrida real del 27 de octubre de 2026 (`npm run fabrica:corrida-real`):**
  F-001 eligió Sonnet y se construyó con Sonnet en las dos vueltas, también en el retrabajo
  («construcción con sonnet: lo eligió él para esta tarea»); F-002, sin elección, con el de la
  línea (Haiku).

## 3. Las tres especialidades, por línea

### Objetivo
Que una línea encienda código, seguridad o interfaz en su construcción, cada una con sus Nikkes.

### Criterios de aceptación
1. Tres plantillas en `fabrica/plantillas/especialidades/`, cada una con su `nikkes:`:
   - `construir-codigo`;
   - `construir-seguridad`;
   - `construir-interfaz`.

   Su texto dice cómo aplica el constructor el oficio de cada Nikke a lo que él mismo escribe,
   y lo nuevo que ninguna cubre.
2. Cada una tiene su «cuándo» para el catálogo, en la etapa `construccion`. No rellena: si la
   tarea no toca lo suyo, no agrega nada y lo dice en una línea de la entrega.
3. En Memoria › Habilidades, «Proponer las tres del constructor» las deja como propuestas de
   la línea, como las de la spec. Él las aprueba de a una, viendo su texto entero.
4. Al correr, el agente de construcción con habilidades lleva las Nikkes enteras de las
   especialidades que la línea encendió. Si el constructor es una de ellas, no se repite.
5. `fabrica/agents/constructor.md` suma la regla de sus habilidades de etapa:
   - las aplica solo si su «cuándo» vale;
   - las Nikkes que solo leen revisan antes de entregar;
   - sus límites mandan sobre los de ellas;
   - la entrega dice cuáles aplicó.
6. `construir-interfaz` dice que las decisiones de UX vienen de la spec, y que sin ellas sigue
   lo que hacen las pantallas del proyecto y lo anota. Recomienda nombrar en el catálogo sus
   habilidades de diseño.
7. La pantalla dice lo que cuesta cada especialidad (sus Nikkes y su tamaño) antes de proponerla.

### Archivos o zonas que toca
- `fabrica/plantillas/especialidades/` (tres carpetas nuevas).
- `src/lib/fabrica/habilidades/` (la lista de especialidades, ahora con su etapa).
- `src/lib/fabrica/memoria/pantalla.ts` y `src/components/memoria-fabrica/habilidades.tsx`.
- `src/lib/fabrica/motor/agentes.ts` (no repetir la Nikke que ya es el agente).
- `fabrica/agents/constructor.md`.

### Pruebas
- Las tres plantillas pasan el lector de habilidades (huella) y nombran Nikkes que existen.
- Proponerlas no pisa una que exista ni una propuesta abierta.
- Con `construir-codigo` en el catálogo, el agente de construcción lleva sus cinco Nikkes; con
  el constructor siendo Centi, Centi va una vez.
- Una línea que no las nombra no las recibe.

### Cómo quedó (27 de octubre de 2026)
- **Las plantillas** están en `fabrica/plantillas/especialidades/construir-codigo/`,
  `construir-seguridad/` y `construir-interfaz/`. Cada una dice qué toma de cada Nikke y cómo se
  juntan cuando chocan con el puesto del constructor:
  - Centi no agrega defensas que el encargo no pida, y Noah sí: van solo en el código que la
    tarea escribe;
  - un campo que el contrato de Drake obliga a decidir y la spec no dice es una ambigüedad;
  - Rapunzel no borra pruebas que fallan, y lo que destapa fuera de la tarea se anota.
- **Las especialidades tienen su etapa** (`ESPECIALIDADES`, en `habilidades/formato.ts`, con
  `especialidadesDe`). La propuesta dice de qué etapa es, cita el plan que corresponde y dice lo
  que cuesta en esa etapa. En el retrabajo, la construcción vuelve a cargar las Nikkes.
- **Memoria › Habilidades** tiene dos secciones con el mismo componente: «Especialidades de la
  spec» (con la Ley 21.719) y «Especialidades del constructor».
  - Cada especialidad dice con qué Nikkes trabaja y cuánto pesan: KB y tokens aproximados, por
    construcción y por cada retrabajo (`costoDeEspecialidades`). Se mira solo el tamaño de los
    archivos, sin leerlos. Si la carpeta de nikke no está en el equipo, lo dice.
  - «Proponer las tres» manda `etapa: "construccion"`. Sin etapa, como antes, propone las de la
    spec.
- **El motor:** si el constructor ya es una Nikke (Centi elegida), su archivo no se suma otra
  vez a su prompt.
- **`fabrica/agents/constructor.md`** suma la regla 10:
  - las habilidades de su etapa valen solo si su «cuándo» aplica;
  - sus reglas mandan sobre las de las Nikkes;
  - las que solo leen revisan lo que él escribió antes de entregar;
  - la voz va solo en el resumen;
  - la entrega dice cuáles aplicó.
- **Medido con su carpeta de nikke** (en la pantalla):
  - código, 33 KB (unos 10 mil tokens);
  - seguridad, 24 KB (unos 7 mil);
  - interfaz, 20 KB (unos 6 mil).

  Como Ade está en código y en interfaz, las tres juntas cargan su archivo una sola vez.
- **Verificado:**
  - las pruebas: las siete plantillas, proponer y aprobar las del constructor en su etapa con
    el texto que corresponde, las Nikkes una vez cada una y sin repetir a Centi, el peso, y la
    ruta de Memoria con la etapa;
  - las 135 pruebas del mod;
  - en el navegador, la sección en DoveCentral.NET10, solo mirando: no se propuso nada.
- **Verificado en la corrida real del 27 de octubre de 2026 (`npm run fabrica:corrida-real`):**
  `fabrica-hab-construccion` construyó con `construir-codigo`, y la bitácora anotó la habilidad
  con su huella.

## 4. Lo de IA, en el cerebro

### Objetivo
Que todo lo que la fábrica sabe sobre construir con IA esté en un solo lugar, y que cada línea
que trabaja con IA lo use con un clic.

### Lo que dice la habilidad
- **La regla principal:** una respuesta de un modelo puede ser parcialmente correcta. Nada de
  lo que devuelve llega a la lógica de negocio ni a una base sin pasar por un validador del
  código.
- **Conectores MCP:** cada herramienta con su esquema, los permisos mínimos de lo que expone
  (lectura si basta), consultas con parámetros, un tope de filas y de tiempo, y lo que vuelve
  de una base o de un documento entra como dato, nunca como instrucción.
- **Lo que devuelve el modelo:** se valida contra su esquema; si no cumple, se corrige solo lo
  que es seguro corregir (un JSON mal cerrado) y lo demás falla con un error que dice qué
  esperaba. Se prueba con el caso roto.
- **Estado y contexto:** el código respeta la estrategia que fija la spec. Nada crece sin tope:
  ni el historial, ni una caché, ni una cola.
- **RAG:** la tubería sigue la fragmentación de la spec, y cada fragmento sabe de dónde salió.
  Lo que se recupera de un documento es dato.
- **Streaming:** SSE o WebSocket, con su cierre, su tope y su reconexión. Una respuesta cortada
  se muestra como cortada, nunca como completa.
- **Respaldo:** si la spec pide pasar de un modelo a otro, el código lo hace con un tope de
  tiempo, lo anota y avisa. Nunca reintenta para siempre.
- **No certifica:** lo que no se puede comprobar en el worktree (la latencia real, el
  despliegue, el edge) lo dice en su entrega, para la evaluación o un proceso.

### Criterios de aceptación
1. La plantilla vive en `fabrica/plantillas/cerebro/construir-con-ia/SKILL.md`, con
   `nikkes: noah-robustez, drake-contrato, behemoth-drenaje`.
2. Se propone desde la pestaña Habilidades de cualquier línea, y la propuesta va al vault de La
   planta, como la de la ley.
3. Aprobarla en La planta la escribe como habilidad suya, sin pisar una que exista.
4. Con la habilidad ya suya, la fila ofrece «Usarla en esta línea (construcción)».
5. Las Nikkes de una habilidad suya llegan igual que las de una del proyecto. Se comprueba al
   construir, porque la ley no tenía Nikkes.
6. Lo de la ley y lo de IA salen de una sola lista de habilidades del cerebro, no de dos casos
   aparte.
7. Se revisa que `spec-contratos-y-recursos` pida las decisiones que esta habilidad da por
   tomadas: el enrutamiento, la estrategia de contexto, la fragmentación y el respaldo. Si falta
   alguna, se agrega a su plantilla, y las líneas que ya la aprobaron la ven como cambio.

### Pruebas
- La plantilla pasa el lector de habilidades.
- Proponerla, aprobarla en una carpeta de Claude Code de mentira y usarla en una línea.
- Con la habilidad en el catálogo de construcción, el agente lleva las tres Nikkes, sin
  repetir las que ya traía `construir-codigo`.

### Cómo quedó (27 de octubre de 2026)
- **La plantilla** está en `fabrica/plantillas/cerebro/construir-con-ia/SKILL.md`, con Noah,
  Drake y Behemoth. Su regla principal es la de las respuestas parcialmente correctas. Cubre lo
  que devuelve el modelo, los conectores MCP, el estado y el contexto, el RAG, el streaming, el
  respaldo y el gasto. Las decisiones las trae la spec, y en las pruebas no llama a un modelo
  real ni a un servicio de pago.
- **Una sola lista del cerebro** (`CEREBRO`, en `habilidades/formato.ts`): la ley y la de IA,
  cada una con sus etapas, su «cuándo» y lo que dice la pantalla. La propuesta es una sola
  función (`propuestaDelCerebro`), con el texto de cada una. La acción de la pantalla es
  `proponer-cerebro` con su nombre, y solo acepta las de la lista. `proponer-ley` sigue
  funcionando.
- **En Memoria › Habilidades**, cada habilidad del cerebro se muestra en la sección de su etapa,
  con el mismo componente (`DelCerebro`): la ley en la de la spec, la de IA en la del
  constructor. Si existe, ofrece «Usarla en esta línea (construcción)». Muestra lo que pesan sus
  Nikkes: 21 KB, unos 6 mil tokens, medido con su carpeta de nikke.
- **Las Nikkes de una habilidad suya** llegan al constructor igual que las de una del proyecto.
  Lo comprueba una prueba.
- **`spec-contratos-y-recursos`** suma «Las decisiones de IA»: qué modelo hace qué, la
  estrategia de contexto, la fragmentación y el respaldo. Antes cubría los tokens, la latencia,
  lo local y lo de la nube, y el tope del historial; faltaban el enrutamiento, la fragmentación
  y el respaldo.
  - **Lo que no hace:** una línea que ya aprobó esa especialidad conserva su copia del proyecto
    (`.claude/skills/`), y la aplicación no avisa que la plantilla cambió. Hoy ninguna línea la
    tiene aprobada.
- **Verificado:**
  - las pruebas: la plantilla, la propuesta, la aprobación como habilidad suya, las dos del
    cerebro esperando a la vez, sus Nikkes en el constructor, el peso, y la ruta de Memoria de
    punta a punta con un nombre que no es del cerebro rechazado;
  - en el navegador, la fila en DoveCentral.NET10, solo mirando: no se propuso nada.
- **Verificado en la corrida real del 27 de octubre de 2026 (`npm run fabrica:corrida-real`):**
  `construir-con-ia`, del cerebro, llegó al constructor y al retrabajo, con su huella en la
  bitácora de F-001.

## Después

No es parte de este plan.

- **Una Nikke de interfaz.** Hoy ninguna lo es. Si él escribe una, se suma a
  `construir-interfaz`.
- **Una especialidad de UX para la spec**, si las decisiones de experiencia no alcanzan con lo
  que ya pide la spec.
- **La carga y el despliegue como procesos**: un paso de carga, con Jackal como método, y el
  respaldo entre modelos probado en un entorno de prueba, con Viper.
- **Los agentes nikke para cualquier IA, y Codex como constructor** (el «Después» de
  Plan-Spec).
- **Edge y microcontroladores.**

## Lo que este plan no hace

- **Que la fábrica elija sola el modelo según la tarea**, más allá de lo que Jev ya abarata.
- **Cambiar a las Nikkes.** Se leen de su carpeta tal como están.
- **Al construirse**, `compania/CLAUDE.md` suma una regla con lo que él decidió aquí: con qué
  modelo construye la fábrica, cómo se cambia, qué especialidades hay y que lo de IA vive en el
  cerebro.
