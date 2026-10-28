# El escritor de la spec: con qué modelo y con qué especialidades

**Qué es.** Lo que sigue a la planta. El escritor de la spec (`fabrica/agents/spec-escritor.md`)
convierte el pedido de una tarea en una especificación que se puede comprobar. Este plan le da
tres cosas, **solo con Claude**:

1. **Cuatro especialidades**, para las tareas que tocan IA o datos personales:
   - guardarraíles;
   - datos y cumplimiento;
   - evaluación;
   - recursos y contratos.
2. **El modelo de Claude que escribe la spec**, elegido por línea y con la opción de cambiarlo
   en una tarea: Haiku, Sonnet, Opus o Fable.
3. **Las evaluaciones con rúbrica y conjunto de prueba**, que corren como un proceso aparte, no
   en cada verificación.

Además, **la Ley 21.719 queda en el cerebro de la fábrica como una habilidad propia**
(`ley-21719`). Es una sola para todas las líneas, y la pueden usar la spec y la revisión.

**Lo decidió él el 26 de octubre de 2026:**
- las cuatro especialidades son habilidades de la etapa spec, y cada línea las enciende o no;
- el modelo se elige por línea, y se puede cambiar en una tarea;
- las evaluaciones son un proceso aparte;
- **por ahora, solo Claude.** Codex y Gemini (Antigravity) quedan para después:
  - Los agentes trabajan con oficios, archivos Markdown planos en `fabrica/oficios/`, que vienen
    con el repositorio.
  - Primero se ve que sirvan igual sin importar el programa que los use. Después, que Codex y
    Antigravity los usen.
  - Así no se inventan agentes nuevos para cada IA.
- **la Ley 21.719 queda en el cerebro de la fábrica, como una habilidad,** no dentro de una
  especialidad de la spec.

**Cómo se prueba.**
- **App:** `npm test`, `npx tsc --noEmit` y `npm run lint`, desde `compania/`.
- **Mod:** `claude plugin test fabrica`, cuando se toca `fabrica/hooks/`.
- **Nada llama a un modelo en las pruebas.** Se prueba qué le llega a cada agente: su modelo,
  sus habilidades y el pedido entre « ».
- **`npm run fabrica:e2e` gasta:** se pregunta antes.
- **En el navegador, solo mirando:** nada se aprueba ni se corre en una revisión.
- **Cada pantalla nueva actualiza el lienzo:** la nota de estado, y un tablero si el diseño
  cambió.

**Convenciones que importan** (`compania/CLAUDE.md`):
- **Un id de línea desconocido es un error, nunca otra línea.** Lo que se elige desde una
  pantalla de varias líneas lleva su `linea`.
- **Una habilidad solo vale si el catálogo de la línea la nombra, y la escribe él.**
  - Las cuatro llegan como **propuestas**, que él aprueba en Memoria › Habilidades viendo sus
    archivos enteros.
  - Aprobarlas nunca pisa una habilidad que ya exista, y la aplicación no hace commit.
- **Las claves de una evaluación son del proyecto:** `COMPANIA_PROCESO_<LINEA>_<NOMBRE>` en
  `.env.local`, nunca las de la aplicación. Como en todo proceso, se guarda solo el nombre.
- **Un guardia va pegado a lo que protege, no en quien llama.**
- **Español neutro, sin voseo y con tildes.** Los identificadores y los datos guardados van sin
  tilde.

## Qué hay hoy y qué falta

| Lo que se pide | Hoy | Dónde |
|---|---|---|
| Escribir la spec con Claude | Sí | `fabrica/agents/spec-escritor.md` |
| Elegir su modelo | Sí, pero solo en la línea activa | `modelo_spec` en `factory/config.md`; Configuración › Fábrica (`fijarModeloDeRol`) |
| Elegirlo desde **Una línea**, en cualquier línea | **No** | — |
| Cambiar el modelo en una tarea | **No** | — |
| Habilidades en la etapa spec | Sí | El agente `fabrica-hab-spec`, con `skills:` |
| Las cuatro especialidades | **No** | — |
| Una habilidad de la Ley 21.719 | **No** | Hay un validador en Claude Code de este equipo (`ley21719-validator`), pero ninguna habilidad |
| Una habilidad para todas las líneas | Sí, sin estrenar | Una habilidad personal (`~/.claude/skills/`) vale en una línea si su catálogo la nombra |
| Saltarse la spec cuando el pedido ya es claro | Sí | Lo decide Jev (`decidir(T, "spec")`) |
| Un proceso que corre un comando | Sí | Paso `comando`, en `src/lib/fabrica/procesos/` |
| Un paso que mide un puntaje y lo compara con la vez anterior | **No** | — |
| Escribir la spec con Antigravity | Sí, apagado por línea | `escritor_spec: antigravity`. Este plan no lo toca: sigue como está |
| Escribirla con Codex | **No** | Queda para después |

## Decisiones de este plan

Las cuatro primeras y la novena son suyas. Las demás son mis recomendaciones: se pueden cambiar
sin rehacer nada.

1. **Las especialidades son habilidades por línea** (decisión suya). Una línea que no trabaja
   con IA no las enciende, y su spec queda como hoy.
2. **El modelo se elige por línea, y se puede cambiar en una tarea** (decisión suya).
3. **Las evaluaciones son un proceso aparte** (decisión suya).
   - La spec dice cómo se evalúa, y quien construye deja los archivos.
   - Correrlas lo hace un proceso, no la verificación de cada tarea: gastan y no dan siempre el
     mismo resultado.
4. **Solo Claude, por ahora** (decisión suya). Lo que hoy existe de Antigravity no se quita ni
   se amplía.
5. **El cambio en una tarea es solo suyo.**
   - Se guarda en el frontmatter de la tarea (`modelo_spec`).
   - Lo escribe la aplicación, por su clic. El texto de un issue no puede ponerlo, y el mod
     frena a un agente que intente escribir ese campo.
   - El campo se llama igual que en `config.md` para que, cuando lleguen otros escritores,
     sume `escritor_spec` a su lado sin cambiar nada.
6. **Con un cambio en la tarea o con habilidades de spec, la spec no se salta.**
   - Si él eligió el modelo, es porque quiere que se escriba.
   - Si la línea encendió las especialidades, es porque sus tareas las necesitan: Jev no puede
     saber si una tarea toca IA.
7. **Las especialidades no rellenan.**
   - Si su «cuándo» del catálogo no aplica a la tarea, no escriben nada: ni «N/A» ni una
     sección vacía.
   - En «Riesgos y notas», la spec dice cuáles aplicó.
8. **Las especialidades trabajan con sus oficios enteros** (decisión suya, 26 de octubre de
   2026).
   - Cada especialidad nombra a sus oficios (`oficios:` en su `SKILL.md`). Su texto dice solo
     cómo se aplica cada oficio antes de que exista el código, y lo nuevo que ninguno cubre.
   - Al lanzar una corrida, la aplicación le pasa al agente de spec el texto entero de cada
     oficio nombrado, tal como está en `fabrica/oficios/`: sus reglas, su método, su entrega y
     sus límites. **No se copia a ninguna habilidad ni se toca:** si un oficio cambia, la
     próxima corrida ya lleva el nuevo.
   - El agente de spec no puede llamar a otros agentes (en Claude Code, un subagente no lanza
     otros subagentes), y que los lea él de esa carpeta se podría negar por permisos en una
     corrida desatendida. Por eso los lleva la aplicación.
   - La spec que queda en el archivo de la tarea va técnica y neutra: la leen el constructor y
     los revisores. El resumen que devuelve el agente de spec, también.
   - Cuesta tokens en cada spec. Una línea con una sola especialidad lleva solo sus oficios.
9. **La Ley 21.719 es una habilidad del cerebro de la fábrica** (decisión suya).
   - Mi recomendación para el cómo: una sola, `ley-21719`, como habilidad personal
     (`~/.claude/skills/ley-21719/`). Vale en toda línea cuyo catálogo la nombre.
   - Así no hace falta un catálogo nuevo de la planta: es la regla que ya existe para las
     habilidades personales.
   - Cuando la ley o su reglamento cambien, se corrige en un lugar y vale para todas las
     líneas.
   - Cada línea decide en qué etapas la usa: lo normal es `spec` y `revision`.
10. **La spec sigue un SDD liviano** (decisión suya, 26 de octubre de 2026). Se escribe antes
    del código y es el contrato de las demás etapas: objetivo, alcance, fuera de alcance,
    criterios comprobables, archivos probables y riesgos, más las secciones de las
    especialidades que apliquen. No se separa en requisitos, diseño y tareas, ni los criterios
    van en EARS. Si la complejidad de los proyectos crece, se formaliza y se endurece; eso es
    otra decisión suya.

## Orden y por qué

1. **El modelo por línea.** Es casi todo lo que ya existe; falta poder elegirlo en cualquier
   línea, y que se vea.
2. **El cambio en una tarea.** Usa lo de la etapa 1.
3. **Las cuatro especialidades.** Empieza leyendo sus oficios.
4. **La Ley 21.719, en el cerebro.** Va después de las especialidades porque «Datos y
   cumplimiento» la nombra. Se puede escribir en paralelo con la etapa 3.
5. **Las evaluaciones, como proceso.** No depende de las etapas 1 a 4: se puede construir en
   paralelo con ellas.

Después, en otro plan: los agentes independientes del programa, y con ellos, Codex y
Antigravity.

## 1. El modelo de la spec, por línea

### Objetivo
Elegir el modelo de Claude que escribe la spec en cualquier línea, no solo en la activa, y verlo
en la pantalla de la línea.

### Criterios de aceptación
1. Una función de la aplicación fija `modelo_spec` en la línea que se le pide, resuelta con
   `lineaPorId`.
   - Una línea desconocida es un error y no toca ninguna otra.
   - Un modelo fuera de `inherit`, `haiku`, `sonnet`, `opus` y `fable` se rechaza.
2. En **Una línea**, una ficha dice con qué modelo se escribe la spec: el de la corrida, si es
   `inherit`. Desde ahí se puede cambiar.
3. Configuración › Fábrica sigue funcionando como hoy, sobre la línea activa.
4. El camino de la tarea y el informe de la corrida dicen con qué modelo se escribió cada spec.

### Archivos o zonas que toca
- `src/lib/fabrica/motor/proyecto.ts`: `fijarModeloDeRol` con `linea`.
- `src/app/api/fabrica/linea/route.ts`.
- `src/components/fabrica/linea.tsx`.
- `fabrica/hooks/register.tsx`: anotar el modelo en el evento de la spec.

### Pruebas
- La ruta, con su línea: un modelo inválido da 400, y una línea desconocida no escribe nada.
- Sin `linea`, se usa la línea activa, como hoy.

### Cómo quedó (26 de octubre de 2026)
- **La configuración leída** (`configDesde`) trae `modeloSpec`, con el mismo valor por defecto
  que el plugin: Opus. La regla vive en un solo lugar, `modeloDeRolDesde` (`src/lib/fabrica/modelos.ts`).
- **`PUT /api/fabrica/linea`** con `{ linea, modeloSpec }` llama a `ajustarLinea`, que usa
  `fijarModeloDeRol(..., linea)`. Configuración sigue igual, sobre la activa.
  - De paso, `fijarModeloDeRol` dejó de aceptar un rol como «constructor»: antes miraba con `in`.
- **En Una línea**, la ficha «La spec se escribe con» va primera, con un selector y una frase
  por modelo.
- **El mod**, al lanzar el agente de la spec (`Agent` o `Task`, reconocido con `rolDeAgente`),
  anota en `eventos.jsonl` un paso sin cambio de etapa: «spec con opus», o «spec con el modelo
  de la corrida». Un lanzamiento reintentado no se anota dos veces (`yaAnotado`). La nota se ve
  en «Su camino» y en los movimientos del informe de la corrida.
- **Verificado:**
  - las pruebas de la app y las del mod;
  - tipos y lint;
  - la pantalla de DoveCentral.NET10 en el navegador, solo mirando: dice Opus, porque su
    `config.md` no dice nada.
- **Verificado en la corrida real del 27 de octubre de 2026 (`npm run fabrica:corrida-real`):**
  «spec con sonnet» quedó en `eventos.jsonl` una vez por tarea.

## 2. El cambio en una tarea

### Objetivo
Para una tarea, él puede elegir otro modelo. Por ejemplo, Fable para un pedido grande y difuso.

### Criterios de aceptación
1. En **Nueva petición**, una opción plegada, «Con qué modelo se escribe la spec», ofrece «el
   de la línea» (el valor por defecto) y los cuatro de Claude.
2. En el panel de una tarea `pendiente`, o `necesita-humano` que vino de la spec, «Escribir la
   spec con…» guarda el cambio. Si la tarea esperaba sus respuestas, el cambio vale para la
   vuelta siguiente.
3. El cambio se guarda en el frontmatter (`modelo_spec`) mediante una función de la aplicación,
   que valida el modelo y la línea.
4. El mod:
   - usa el modelo de la tarea antes que el de la línea al lanzar la spec;
   - no deja que un agente escriba ese campo (el mismo guardia que hoy protege `estado`).
5. `pasarALinea` no copia ese campo desde un issue ni desde un borrador.
6. Una tarea con cambio no se salta la spec.

### Pruebas
- Las rutas, con la línea en la petición.
- El mod frena a un agente que edita `modelo_spec`.
- Lo que llega de un issue no trae el cambio.
- Con cambio, Jev no salta la spec.

### Cómo quedó (26 de octubre de 2026)
- **La tarea guarda `modelo_spec`** en su frontmatter.
  - Al crearla desde Nueva petición, solo si va directo a la cola: para un borrador, la petición
    lo rechaza.
  - Después, con `fijarModeloDeSpecDeTarea`, que tiene adentro su guardia:
    - solo vale en `pendiente`, o en `necesita-humano` que se detuvo desde pendiente o spec
      (`eligeModeloDeSpec`, en `planta/lectura.ts`, la misma regla que usa la pantalla);
    - no vale con la tarea tomada por una sesión;
    - deja una línea en la bitácora.
  - `null` vuelve al de la línea y quita el campo.
- **`POST /api/fabrica/linea`** con `accion: "modelo_spec"`. Escribe directo también en la
  activa: no sigue con nada. Mientras una corrida trabaja en esa línea, no se cambia.
- **El mod:**
  - `modelo_spec` está entre los campos que ni un agente ni el orquestador cambian con una
    edición, y una tarea nueva escrita con Write no puede nacer con él.
  - `tareaDesde` lo lee como `modeloSpec`, así que llega en `tareas` de `estado`.
  - `decidir(T, "spec")` con un modelo elegido no le pregunta a Jev: contesta que la escriba
    Claude con ese `model` (`specElegidaPorEl`).
  - `correr.md` dice que ese modelo vale también al retomar la tarea después de una respuesta.
- **`pasarALinea`** crea la tarea sin modelo: lo que llega de la Bandeja no lo trae.
- **En la pantalla:**
  - en Nueva petición, una opción plegada bajo «Directo a la cola», con «El de la línea (Opus)»;
  - en el panel de la tarea, «Escribir la spec con…» o, si se detuvo a preguntar, «Escribir la
    spec, la próxima vez, con…». Cambiarlo no borra lo que él estaba escribiendo.
  - La lista de modelos vive en un solo lugar (`MODELOS_DE_LA_SPEC`, en `piezas.tsx`).
- **Verificado:**
  - las pruebas de la app y las del mod;
  - tipos y lint;
  - Nueva petición en el navegador, solo mirando.
- **Sin verificar:**
  - el selector del panel con una tarea de verdad: DoveCentral.NET10 no tiene tareas;
  - una corrida que use el modelo elegido: gasta.

## 3. Las cuatro especialidades

### Objetivo
Cuatro habilidades para la etapa spec, que una línea enciende. Cada una agrega a la spec su
sección, y convierte en criterios de aceptación lo que se puede comprobar.

### Primero: lo que ya hacen sus oficios
Se leyeron el 26 de octubre de 2026. Esos oficios revisan código ya escrito; la spec trabaja
antes. Cada especialidad toma de sus oficios la lista de qué mirar y la disciplina de decidir
cada punto, convertidas en requisitos. Los oficios van enteros (decisión 8).

| Especialidad | Sus oficios | Qué toma de ellos |
|---|---|---|
| `spec-guardarrailes` | `casos-de-abuso`, `robustez` | Casos de abuso: quién interactúa, dónde deja de controlarse lo que entra, sus seis categorías (autorización, escalada, límites, económico, flujo, datos ajenos) y a quién perjudica. Robustez: las categorías de falla, una de cuatro estrategias por falla con su porqué, nunca silenciar un error, y cada defensa con una prueba que provoca su falla. |
| `spec-datos-y-contexto` | `auditoria-de-secretos`, `amenaza-interna` | Auditoría de secretos: un secreto nunca en el prompt, un registro ni un error; nada de datos reales donde van de prueba; no revelar infraestructura. Amenaza interna: lo que la IA tiene permiso para usar contra lo que necesita, el rastro del dato hasta donde termina escrito, y el modelo con su versión fijada. |
| `spec-evaluacion` | `pruebas` | Enumerar los casos antes, el caso de regresión que falla si vuelve, el estilo de las pruebas vecinas, nunca bajar el umbral para que pase, y decir qué queda sin cubrir. |
| `spec-contratos-y-recursos` | `contratos`, `consumo-de-recursos`, `pruebas-de-carga` | Contratos casi entero: las dos partes, el contrato implícito, las tres decisiones por campo, «hacer el mal», errores distinguibles, ejemplos y cómo evoluciona. Consumo de recursos: lo que crece sin tope, lo que se repite en bucle y lo que cuesta parado. Pruebas de carga: ningún tope sin cómo se mide, y nunca carga contra producción ni un proveedor. |

Nuevo, porque ninguno lo cubre: la inyección por texto ajeno, qué responde la IA sin contexto,
el mapa del flujo de los datos, qué entra al contexto antes de cada llamada, y la rúbrica que
no es de sí o no. La Ley 21.719 va aparte, en la etapa 4.

### Las cuatro

1. **`spec-guardarrailes`**, que suma la sección «Comportamiento de la IA».
   - **Límites del sistema:**
     - qué herramientas puede llamar el modelo (servidores MCP, FastMCP, APIs), con qué
       permisos y con qué tope;
     - qué sabe y qué no sabe;
     - qué hace cuando le preguntan fuera de eso.
   - **Casos extremos:**
     - intención maliciosa;
     - texto ajeno que trae instrucciones (inyección);
     - la red o el servicio caídos, y los tiempos de espera;
     - falta de contexto: qué responde en vez de inventar.
   - Cuándo, en el catálogo: «cuando la tarea llame a un modelo, cambie un prompt o le dé
     herramientas a un agente».
2. **`spec-datos-y-contexto`**, que suma la sección «Datos y contexto». Se llamaba
   `spec-datos-y-ley`; cambió cuando la ley pasó a su propia habilidad.
   - **El mapa del flujo**, por cada dato:
     - de dónde sale y a dónde va;
     - si se procesa en local o en la nube, y con qué proveedor;
     - si se guarda, cuánto tiempo y quién lo ve.
   - **Qué entra al contexto antes de cada llamada:** metadatos, historial y variables de
     estado.
   - **Que la ingesta o la generación no salte la prevención de pérdida de datos ni la
     auditoría.**
   - **La ley no la explica esta habilidad.** Si la línea tiene `ley-21719` en su etapa spec,
     el mapa del flujo es lo que esa habilidad revisa. Si no la tiene, la sección lo dice en
     «Riesgos y notas».
   - Cuándo: «cuando la tarea toque datos personales o los mande a un modelo».
3. **`spec-evaluacion`**, que suma la sección «Cómo se evalúa».
   - **La rúbrica:** dimensiones (calidad, tono, precisión), escala y umbral.
   - **El conjunto de prueba:**
     - dónde vive en el repositorio;
     - cuántos casos tiene;
     - cómo se agregan;
     - con datos inventados, nunca reales.
   - **Qué cuenta como regresión** y qué comando lo corre.
   - **Lo que se acepta en la tarea** es que los archivos y el comando existan. Correrlo es de
     la etapa 5.
   - Cuándo: «cuando la tarea cambie lo que responde un modelo, o el modelo mismo».
4. **`spec-contratos-y-recursos`**, que suma la sección «Recursos y contratos».
   - **Topes que se pueden medir:**
     - tokens de entrada y de salida;
     - latencia aceptable;
     - costo por llamada y por día;
     - si va en local o en la nube, y por qué.
   - **Los contratos con otros servicios:** esquemas JSON, gRPC y webhooks, con sus errores y
     su versión.
   - Cuándo: «cuando la tarea hable con otro servicio o llame a un modelo». Los contratos
     sirven también sin IA.

### Criterios de aceptación
1. Las cuatro viven en la aplicación como plantillas, cada una con su `SKILL.md`, en español
   neutro, y nombran a sus oficios en `oficios:`.
2. Al lanzar una corrida, el agente de spec con habilidades (`fabrica-hab-spec`) lleva, además,
   el texto entero de cada oficio que nombren sus habilidades, leído en ese momento de
   `fabrica/oficios/`. Un nombre con otra forma, o que no está en esa carpeta, no se lee y queda
   anotado.
3. En Memoria › Habilidades de una línea, «Proponer las especialidades de la spec» las deja
   como **propuestas**:
   - el archivo para `.claude/skills/<nombre>/` del proyecto;
   - su línea para el catálogo, con su «cuándo».

   Él las aprueba de a una viendo el texto entero. Aprobar nunca pisa una habilidad que ya
   exista, y no se hace commit.
4. El agente de spec, el de la fábrica, suma una regla:
   - una habilidad de su etapa se aplica solo si su «cuándo» vale para la tarea;
   - lo que se puede comprobar va a los criterios;
   - en «Riesgos y notas» se dice cuáles aplicó;
   - lo que escribe, en el archivo y en su resumen, va técnico y neutro.

   El tope de 3 a 10 criterios sigue: si salen más, la tarea se parte.
5. Una línea con habilidades de spec no se salta la spec.
6. La aprobación ya comprueba criterio por criterio, así que no cambia.

### Pruebas
- Las plantillas pasan el lector del catálogo y de las habilidades (`usosDelCatalogo`, huella).
- Proponerlas en una línea que ya tiene una con ese nombre no la pisa.
- Una línea sin especialidades no recibe nada nuevo y puede saltarse la spec como hoy.
- El agente de spec lleva el texto exacto de los archivos de sus oficios, y nada de uno que no
  está en la carpeta o con un nombre de otra forma (`../`, mayúsculas, espacios).

### Cómo quedó (26 de octubre de 2026)
- **Las plantillas** están en `fabrica/plantillas/especialidades/<nombre>/SKILL.md`, cada una
  con `oficios:` en su frontmatter. La lista y su «cuándo» viven en `ESPECIALIDADES`
  (`src/lib/fabrica/habilidades/formato.ts`).
- **Proponerlas:** en Memoria › Habilidades, la sección «Especialidades de la spec» dice cuáles
  tiene la línea y ofrece «Proponer las cuatro» (o las que faltan). `propuestasDeEspecialidades`
  escribe en el vault una propuesta por cada una, con su `SKILL.md` en `## Archivos`, sin tocar
  el repositorio. No propone la que ya existe, la que el catálogo nombra ni la que ya espera o
  se aprobó; una rechazada, sí. Aprobarla pasa por `aprobarHabilidad`, como cualquier otra.
- **Los oficios en la corrida:** `habilidadDesde` lee `oficios:` (`oficiosDe`, hasta seis, solo
  nombres con forma). Al lanzar, `textosDeOficios` lee cada archivo de `fabrica/oficios/`
  (`carpetaDeOficios`), y `conSusOficios` los suma enteros al prompt del agente de su etapa, con
  la regla de que mandan los límites del agente y de que lo escrito va técnico y neutro. Los que
  no están se nombran como faltantes.
- **El agente de spec** (`fabrica/agents/spec-escritor.md`) suma la regla de las habilidades de
  su etapa: solo si su «cuándo» aplica, su sección antes de los criterios, lo comprobable a los
  criterios y cuáles aplicó en «Riesgos y notas».
- **El mod:** con habilidades de spec en el catálogo, `decidir(T, "spec")` no le pregunta a Jev
  (`specConHabilidades`) y pide el agente de spec de Claude, también en una línea que escribía
  con Antigravity: Antigravity no recibe habilidades.
- **Verificado:**
  - las pruebas de la app y las del mod, tipos y lint;
  - que la aplicación encuentra la carpeta de los oficios;
  - la pestaña Habilidades de DoveCentral.NET10 en el navegador, solo mirando: dice «No la
    tiene» en las cuatro y ofrece «Proponer las cuatro». No se propuso nada.
- **Verificado en la corrida real del 27 de octubre de 2026 (`npm run fabrica:corrida-real`):** la
  spec de F-001 aplicó `spec-guardarrailes` y `spec-contratos-y-recursos`; la de F-002 dijo que no
  aplicaban.

## 4. La Ley 21.719, en el cerebro de la fábrica

### Objetivo
Una sola habilidad, `ley-21719`, que cualquier línea puede nombrar en su catálogo. En la spec
sirve para marcar riesgos. En la revisión sirve para comprobar lo construido contra ellos.

### Lo que dice la habilidad
- **Para qué se usa cada dato**, y que no se use más de lo necesario.
- **Consentimiento**, y cuándo hace falta.
- **Los derechos de las personas:** acceso, rectificación, supresión y oposición, y cómo los
  atiende el sistema.
- **Datos sensibles**, y lo que piden de más.
- **Transferencias fuera del país:** un modelo en la nube de otro país es una.
- **Seguridad y aviso de brechas**, y qué queda en la auditoría.
- **En la spec:** marca los riesgos sobre el mapa del flujo, y los que se pueden comprobar los
  vuelve criterios.
- **En la revisión:** si la corrida tiene el validador (`ley21719-validator`), lo usa sobre lo
  que cambió (backend en C#, frontend, DDL de SQL). Si no lo tiene, revisa a mano y lo dice.
- **Nunca certifica el cumplimiento:** marca riesgos y hallazgos, y decide una persona.

### Criterios de aceptación
1. La habilidad vive en la aplicación como plantilla (`SKILL.md`), en español neutro.
   - El texto de la ley se resume con sus palabras. No se copian artículos de una página.
   - Dice de qué versión de la ley y de qué fecha es, para saber cuándo revisarla.
2. En Memoria › Habilidades, «Proponer la habilidad de la Ley 21.719» la deja como propuesta,
   para `~/.claude/skills/ley-21719/`.
   - Él la aprueba viendo su texto entero.
   - Aprobarla nunca pisa una que ya exista con ese nombre.
3. En cada línea, «Usar la Ley 21.719» propone la línea del catálogo:
   `- [spec, revision] ley-21719: cuando la tarea toque datos personales.` Él la aprueba como
   cualquier línea del catálogo.
4. Antes de dar la etapa por hecha, se comprueba si una corrida lanzada por la aplicación ve
   el validador. Si no lo ve, la habilidad dice cómo revisar sin él, y el plan lo anota.

### Pruebas
- La plantilla pasa el lector de habilidades (huella).
- Proponerla con una que ya existe con ese nombre no la pisa.
- Una línea que no la nombra no la recibe.

### Cómo quedó (26 de octubre de 2026)
- **La plantilla** está en `fabrica/plantillas/cerebro/ley-21719/SKILL.md`. Se escribió con
  palabras propias a partir del texto de la Biblioteca del Congreso (leychile, idNorma 1209272):
  principios, bases de licitud, derechos y sus plazos (30 días corridos, prorrogables una vez;
  bloqueo en 2 días hábiles), datos sensibles, menores (bajo 14, y sensibles bajo 16), seguridad,
  vulneraciones, evaluación de impacto, decisiones automatizadas, transferencias y sanciones.
  Lo que no se pudo leer en el texto oficial (las condiciones exactas de una transferencia y los
  montos de multa salvo las 20.000 UTM de las gravísimas) no se afirma: pide revisarlo antes de
  citarlo.
- **Proponerla:** en la pestaña Habilidades de cualquier línea, la fila `ley-21719` ofrece
  «Proponerla en La planta». La propuesta va al vault de la planta (`propuestaDeLaLey`), nunca a
  la línea.
- **Aprobarla** en La planta la escribe como habilidad suya, en su carpeta de Claude Code
  (`skills/ley-21719/`), sin tocar ningún repositorio ni catálogo (`aprobarHabilidadSuya`,
  `escribirHabilidadSuya`). No pisa una suya que exista. **Como habilidad suya, Claude Code
  también la ofrece en sus sesiones**, no solo en la fábrica.
- **Usarla en una línea:** con la habilidad ya suya, la misma fila ofrece «Usarla en esta línea
  (spec y revisión)», que escribe su línea en el catálogo con la acción de siempre.
- **El validador, en una corrida:** `ley21719-validator` está configurado para todos sus
  proyectos, así que una corrida lo carga. **Pero los agentes de la fábrica tienen su lista de
  herramientas fija** (`tools:` en `fabrica/agents/`), y ninguno incluía las del validador.
- **El revisor de seguridad tiene el validador** (decisión suya, 27 de octubre de 2026). Lleva
  solo las tres herramientas que analizan código: `validate_csharp_backend`,
  `validate_frontend` y `validate_sql_ddl`. **No lleva `validate_sql_server_instance`**, que
  se conecta a una base de datos con una cadena de conexión. Llegan por dos caminos:
  - en el archivo del revisor de la fábrica (`fabrica/agents/revisor-seguridad.md`), con la
    regla de pasarles solo el texto de los archivos que cambiaron, nunca datos reales ni
    cadenas de conexión, y de comprobar en el código lo que digan;
  - al armar la corrida (`herramientasDelRol`, en `src/lib/fabrica/motor/agentes.ts`): el
    agente de seguridad que viaja con `--agents`, con habilidades o elegido de otro mod, las
    lleva sin que se toque su archivo. Uno sin lista de herramientas (todas) queda igual.
  - Los otros dos revisores no las tienen. La habilidad lo dice: el de seguridad avisa si no
    las tuvo; los demás revisan a mano sin decirlo.
- **Verificado:** las pruebas de la app (la propuesta, la aprobación en una carpeta de Claude
  Code de mentira y el uso en una línea), tipos y lint; la fila en la pestaña Habilidades de
  DoveCentral.NET10, solo mirando.
- **Sin verificar:** una spec o una revisión de verdad con la habilidad: gasta.

## 5. Las evaluaciones, como proceso

### Objetivo
Correr el conjunto de prueba de un proyecto cuando él lo pida, o cada semana si lo enciende, y
saber si empeoró respecto de la vez anterior. Sirve, por ejemplo, después de cambiar el modelo
en Ollama o la infraestructura.

### Criterios de aceptación
1. Un paso nuevo, `evaluacion`:
   - corre el comando del proyecto como un paso `comando`: sin shell, con tope y sin las claves
     de la aplicación;
   - lee su resultado de un archivo con forma fija, `{ "puntaje": 0..1, "casos": n, "fallidos": n }`;
   - lo compara con el `umbral` del paso y con la última ejecución de ese proceso (`tolerancia`).
2. Si el archivo no tiene esa forma, el paso falla y lo dice. Del archivo se toman solo esos
   números: ningún texto de lo que respondió un modelo.
3. El registro de cada ejecución guarda el puntaje. En «Sus procesos», la pantalla muestra los
   últimos puntajes de ese proceso.
4. Con `si falla: tarea`, una regresión deja un pedido en la Bandeja. Lo escribió una máquina,
   así que entra como de otra persona.
5. Una plantilla `factory/procesos/evaluacion.md` como borrador, con `cuando: a-mano`.
   - Correrlo solo cada semana es su decisión, como con cualquier proceso (`procesosSolos`).
6. Las claves que la evaluación necesite van como `COMPANIA_PROCESO_<LINEA>_<NOMBRE>`. Un modelo
   local (Ollama) no necesita ninguna.

### Archivos o zonas que toca
- `src/lib/fabrica/procesos/`: el formato (`TIPOS_DE_PASO`), la ejecución y el registro.
- `src/components/configuracion/fabrica.tsx`: «Sus procesos».

### Pruebas
- Con un comando de mentira que escribe el archivo: pasa, falla por el umbral y falla por la
  regresión.
- Un archivo con otra forma falla.
- El texto del resultado no entra a ninguna nota.

### Cómo quedó (27 de octubre de 2026)
- **El paso:** `- [evaluacion] node evals/correr.mjs {resultado} · umbral 0.8 · tolerancia 0.02 ·
  tope 30m · clave: NOMBRE · si falla: tarea`.
  - Corre como un `comando`: sin shell, con tope (30 minutos si no dice otro), sin las claves de
    la aplicación y con las suyas (`COMPANIA_PROCESO_<LINEA>_<NOMBRE>`).
  - No se deshace: mide, no cambia nada de afuera.
  - Va una sola por proceso, para saber con qué vez anterior se compara.
- **El resultado:** la aplicación le da al comando una ruta fuera del repositorio
  (`comun/fabrica/procesos/<linea>/`), como `{resultado}` y en `FABRICA_RESULTADO`.
  - Del archivo se toman solo `puntaje` (0 a 1), `casos` y `fallidos`; lo demás no se lee.
  - El archivo se borra al leerlo.
  - Si no tiene esa forma, o el comando no lo dejó, el paso falla y dice por qué.
- **El juicio** (`juzgarEvaluacion`):
  - falla si el puntaje queda bajo el `umbral`;
  - también falla si baja más que la `tolerancia` (0.02 si no la dice) respecto de la última vez
    que ese proceso midió uno, aunque esa vez no haya pasado. Así, un cambio que él acepta pasa a
    ser la nueva referencia en la corrida siguiente, y una baja lenta la ataja el umbral;
  - la nota la escribe el código, solo con números.
- **Lo que dijo el comando** (que puede ser lo que contestó un modelo) queda solo en el log, fuera
  del repositorio. No llega a la pantalla (salvo si el comando falló, para ver por qué), ni al
  registro, ni al pedido de la Bandeja, ni a ella.
- **Lo que se guarda:**
  - el registro del repositorio suma el puntaje a su línea (`puntaje 0.870 (35 de 40)`);
  - «Sus procesos» muestra los últimos diez puntajes de cada proceso con una evaluación, y
    marca los que no pasaron;
  - con `si falla: tarea`, una regresión deja en la Bandeja «Revisar por qué bajó la
    evaluación», como de otra persona.
- **La plantilla:** «Crear la evaluación» deja `factory/procesos/evaluacion.md` como borrador y
  `a-mano`. Correrla cada semana es cambiarla a `cada-semana` y encenderla en la configuración.
- **De paso:** dos ejecuciones del mismo proceso en el mismo segundo tenían el mismo id, y la
  segunda pisaba a la primera. Ahora la segunda toma el segundo siguiente (`idLibre`).
- **Verificado:** las pruebas del formato y del juicio, y las de la ruta con un comando de
  mentira:
  - pasa, falla por la regresión, falla por el umbral, falla con otra forma y falla sin
    resultado;
  - el texto de un modelo no llega a ningún archivo guardado, a la pantalla ni a ella.

  En Configuración se ve el botón, solo mirando: crearla habría escrito en DoveCentral.NET10.
- **Sin verificar:** una evaluación de verdad contra un modelo, y los puntajes en la pantalla con
  datos reales.

## Después: agentes independientes del programa, y otras IA

No es parte de este plan. Queda anotado para el siguiente, y se decide con él.

- **Los oficios, para cualquier IA.**
  - Los oficios ya son archivos planos (`fabrica/oficios/`), sin lo que es de Claude Code (el
    frontmatter, `tools:`, `model:`): solo sus reglas, sus límites y su forma de contestar.
  - Con eso, Claude, Codex o Gemini pueden recibir el mismo texto.
- **Codex y Antigravity como escritores de la spec,** cada uno con su modelo. Lo que se averiguó
  el 26 de octubre de 2026:
  - Hoy Antigravity recibe solo el pedido y las notas del proyecto: ni la memoria, ni las
    habilidades, ni la regla de comprobar lo citado en la rama de origen (`pedidoDeSpec`, en
    `fabrica/hooks/externos.ts`).
  - Codex hoy solo revisa código.
  - No se sabe todavía si aceptan un modelo ni cómo se les pasa: se mira en su ayuda antes de
    escribir código.
  - Siguen apagados por línea, porque mandan código del proyecto a OpenAI o a Google.

## Lo que este plan no hace

- **Un catálogo de habilidades de la planta.** La Ley 21.719 es la única habilidad para todas
  las líneas, y le alcanza con ser personal. Si después hay más, se ve.
- **Que la fábrica elija sola el modelo según la tarea.** Lo elige él.
- **Al construirse**, `compania/CLAUDE.md` suma una regla con lo que él decidió aquí: con qué
  modelo se escribe la spec, cómo se cambia y qué guardias tiene.
