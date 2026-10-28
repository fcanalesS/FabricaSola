# La integración: sencilla sola, grande con su prueba

**Qué es.** Lo que sigue al aprobador (`Plan-Aprobador.md`). Una tarea aprobada se clasifica en
**sencilla** o **grande**:
- La sencilla entra sola a su rama, y de ahí a `main` con el PR que abre la fábrica, sin que
  nadie apriete un botón.
- La grande lo espera a él: le avisa, le dice qué probar a mano, y entra cuando él la aprueba.

El paso a producción queda fuera: se verá cuando la línea tenga su CI/CD.

**Lo decidió él el 27 de octubre de 2026:**
- **La sencilla se fusiona sola en `main`, con su PR** (el camino B). La idea es no detener la
  fábrica por un botón.
- **Jev decide si una tarea es sencilla**, para irlo ajustando con lo que salga, y el código pone
  un piso que Jev no puede bajar.
- **La grande lo espera:** le avisa, él la prueba a mano y aprueba que se integre con la rama.
- **El retrabajo lo hace un agente propio**, con los oficios Arreglo de raíz y Pruebas.
- **El agente de notas**, con el oficio Notas de versión y avisos, escribe lo que se lee sin
  haber mirado el código: el texto del PR que se fusiona solo y el aviso de la grande.
- **El revisor de código sigue donde está**, con el oficio Revisión de código.
- **Siguen tres revisores**, con la UX dentro del revisor de interfaz.

**De dónde sale.** Él pasó una definición del video de la AI Factory. Así queda cada punto:

| Su punto | Hoy | Con este plan |
|---|---|---|
| Cuatro revisores (seguridad, UX, UI y código) dan su visto bueno | Tres: código (con el oficio Revisión de código), seguridad (con el oficio Casos de abuso) e interfaz, que ya revisa la UI y la UX. | Tres. El revisor de interfaz nombra la UX en sus reglas. |
| El aprobador (Opus) mira si cumple los estándares del proyecto | **Ya existe.** Opus, con Comprobación de entrega y las fichas del vault. | Igual. |
| Otro agente dice si la tarea es sencilla o crítica | El agente de salida (con Plan de reversión y Compatibilidad hacia atrás) decide si producción pide su clic. | **Jev**, con un piso del código. El agente de salida deja de correr en cada tarea. |
| La sencilla va directo con un PR automático | La fábrica abre el PR y fusionarlo es su clic. | El paso `fusion` de un proceso lo fusiona solo, si todo lo que entra lo puede hacer. |
| La crítica se bloquea con hooks y pide revisión humana antes de `main` | Lo de la base y el `[nucleo]` piden su clic, pero para producción. | La grande no se integra sin su veredicto: el guardia está en `mover(T, "hecho")`. |

**Cómo se prueba.**
- **App:** `npm test`, `npx tsc --noEmit` y `npm run lint`, desde `compania/`.
- **Mod:** `claude plugin test fabrica`, cuando se toca `fabrica/hooks/`.
- **Nada llama a un modelo ni a Jev en las pruebas.** Se prueba qué le llega a cada uno, qué
  escribe el código en la tarea y qué argumentos recibiría `gh`.
- **`npm run fabrica:e2e` y `npm run fabrica:corrida-real` gastan:** se pregunta antes.
- **En el navegador, solo mirando.**
- **Cada pantalla nueva actualiza el lienzo.**

**Convenciones que importan** (`compania/CLAUDE.md`):
- **Un proceso de la fábrica lo corre el código, no un modelo.** La fusión es un paso de un
  proceso: la hace el código, con lo que ya dejaron escrito las tareas.
- **Un guardia va pegado a lo que protege, no en quien llama.** Que la grande no entre sin su
  veredicto lo mira `mover`; que el PR no se fusione con algo que no podía, el paso `fusion`.
- **La fábrica nunca empuja a `main` ni usa `--force`.** Este plan no lo cambia: la fusión la
  hace el servicio (GitHub o GitLab) con el PR, respetando la protección de la rama.
- **Español neutro, sin voseo y con tildes.**

## Qué hay hoy y qué falta

| Lo que se pide | Hoy | Dónde |
|---|---|---|
| Rechazar y volver a construcción | Sí | `mcp__fabrica__aprobar` y el retrabajo del mod |
| Reglas de lo crítico (la base y el `[nucleo]`) | Sí, para producción | `src/lib/fabrica/procesos/salida.ts` |
| Jev decide con el título y la lista de archivos, y aprende | Sí, para pruebas, seguridad, spec y modelo | `fabrica/hooks/jev.ts`, `aprendizaje.ts` |
| Una tarea que espera su veredicto, con el teléfono | Sí, con `aprobacion: externa` o `ambas` en toda la línea | `factory/veredictos/`, `src/lib/fabrica/aviso.ts` |
| El PR que abre el paso `push` | Sí, con un texto fijo | `src/lib/fabrica/procesos/correr.ts` |
| Clasificar una tarea en sencilla o grande | **No** | — |
| Que solo la grande espere su veredicto | **No** | — |
| Fusionar el PR | **No** | — |
| Un agente de retrabajo | **No**: corrige el mismo constructor | — |
| Un texto para el PR y para la prueba a mano | **No** | — |

## Decisiones de este plan

Las siete primeras son suyas. Las demás son mis recomendaciones.

1. **La sencilla se fusiona sola en `main` con su PR** (decisión suya).
2. **La clasifica Jev, con un piso del código** (decisión suya).
3. **La grande espera su prueba a mano y su veredicto**, sin frenar a las demás (decisión suya).
4. **Producción, para después**, con el CI/CD de cada línea (decisión suya). Lo que falta para
   eso está anotado al final de `Plan-Habilidades-y-Procesos.md`, con Hermes y lo de cargar
   menos de los oficios.
5. **Retrabajo con Arreglo de raíz y Pruebas** (decisión suya).
6. **El agente de notas para el PR y para el aviso** (decisión suya).
7. **El revisor de código donde está, y tres revisores** (decisión suya).
8. **El piso no nombra ningún lenguaje.** El código trae solo lo que es delicado en cualquier
   proyecto:
   - migraciones (`**/migrations/**`) y `.sql`;
   - el pipeline (`.github/workflows/**`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `Jenkinsfile`);
   - las dependencias y sus locks (`package.json`, `package-lock.json`, `*.csproj`,
     `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`).

   Lo propio de cada stack lo marca él en la ficha de la línea (`[nucleo]`). `schema.prisma` sale
   del código y queda como regla sugerida: la aplicación la propone al crear el vault de una
   línea que lo tiene, y él la aprueba en Memoria.
9. **También es grande, sin preguntarle a Jev:**
   - lo que coincide con una regla del piso o del `[nucleo]`;
   - lo que pasa de 400 líneas o 15 archivos (se cambia en `config.md`);
   - lo que necesitó dos vueltas de retrabajo o más;
   - lo que propone algo para la memoria.

   Y es sencilla por regla, sin Jev, lo que solo cambia documentación, textos, imágenes o estilos.
10. **Ante la duda, grande.** En las otras decisiones de Jev la duda hace gastar más; aquí hace
    que la tarea espere. Lo mismo sin clave, con `jev: no` o si Jev no contesta. Esperar no frena
    a las demás: solo a las que dependen de esa.
11. **A Jev le llega lo mismo que para pruebas y seguridad:** el título y la lista de archivos con
    sus líneas, nunca el código ni la spec. Si el título es ajeno (`titulo_ajeno`), solo el id.
12. **Jev aprende de una marca suya.** En una tarea que entró sola, «Debió esperarme» anota que Jev
    se equivocó y su umbral se aprieta (`aprendizaje.ts`, como las demás decisiones). Que él
    apruebe una grande sin cambios no cuenta como error de Jev: grande también puede ser por
    precaución.
13. **Sin pruebas no hay sencilla.** Si la verificación omitió las pruebas, la sencilla vuelve a
    verificarse con ellas antes de integrarse, sin preguntarle a nadie. Se salva lo que cambió
    solo documentación, textos o imágenes, que hoy tampoco las corre.
14. **El paso `fusion` es de un proceso, y lo escribe él.** Va después de `[ci]`. El proceso corre
    solo al integrar una tarea únicamente si él lo encendió en este equipo (`procesosSolos`),
    como hasta ahora.
    - **Fusiona solo si:** el PR es el que abrió el proceso; su último commit es el que pasó la
      integración continua, y la pasó en verde; y cada tarea del rango (`{anterior}..{commit}`)
      entró sencilla o con su veredicto.
    - **Nunca con `--admin`.** Si `main` pide una revisión o un check más, la fusión falla, el
      paso lo dice, y el pedido va a la Bandeja como cualquier proceso que falla.
    - Por defecto es una fusión con su commit (`--merge`). `squash` o `rebase`, si él lo escribe
      en el paso.
15. **Una grande no frena el proceso.** Como espera antes de integrarse en su rama, nunca está en
    el rango que se empuja. Lo que haya en el rango que no venga de una tarea lo integró él, y
    es suyo.
16. **El agente de notas escribe en la tarea, no en el repositorio.** Le quedan solo herramientas de lectura,
    y su texto lo registra el mod (`mcp__fabrica__anuncio`) en `## Para el PR` o en
    `## Para probar a mano`. El PR junta, con el código, lo de cada tarea del rango, con su id.
    Lo que habla en voz alta (el teléfono, ella) sigue diciendo solo el id y el título, nunca lo
    que escribió el agente de notas.
17. **El agente de salida deja de correr en cada tarea.** Su plantilla y sus reglas quedan para
    cuando llegue producción. Lo que `salida.ts` pide para producción sigue igual.
18. **El retrabajo es un agente aparte (`fabrica-retrabajo`), con los dos oficios dentro.** Es una sesión
    por vuelta, no dos, con el modelo de construcción de la tarea o de la línea, y Jev no lo
    abarata, como hoy. Lleva también las habilidades de construcción de la línea.
    - **Entra** cuando un revisor marcó un BLOQUEANTE o falló la verificación. Un conflicto al
      sincronizar lo sigue resolviendo el constructor: ahí no hay nada roto.
    - **Arreglo de raíz:** busca la causa y la arregla de raíz, pero solo dentro de lo que la spec dice
      que toca. Si la causa está fuera, no la arregla: lo escribe, y la tarea lo espera a él.
    - **Pruebas:** deja una prueba por cada BLOQUEANTE que se pueda probar. Corre solo lo que
      escribió: la suite entera la corre la verificación, y la última verificación cuenta como
      la de antes.
    - Planificar, simplificar y documentar no entran: el plan ya es la spec, simplificar agranda
      el diff, y documentar no es retrabajo.

## Orden y por qué

1. **El piso y la clasificación, sin Jev.** El código, solo: todo lo que no es claramente
   sencillo queda grande. Sirve aunque Jev nunca conteste.
2. **Jev clasifica, y aprende.** Usa lo de la etapa 1 como piso.
3. **La grande lo espera.** Con la clasificación hecha, el guardia de `mover` y su clic.
4. **El agente de notas.** Necesita saber si la tarea es sencilla o grande.
5. **El paso `fusion`.** Necesita la clasificación y el texto del agente de notas.
6. **El retrabajo con Arreglo de raíz y Pruebas.** No depende de las anteriores; va al final para no
   cambiar dos cosas de la corrida a la vez.
7. **La UX en el revisor de interfaz.** Un cambio chico de texto.

## 1. El piso y la clasificación, sin Jev

### Criterios de aceptación
1. `src/lib/fabrica/procesos/salida.ts` trae el piso de la decisión 8 (`LO_DELICADO`), sin
   `schema.prisma`. Producción sigue usando lo mismo que antes, menos Prisma.
2. Al crear el vault de una línea que tiene `schema.prisma`, la aplicación siembra la regla
   `[nucleo] **/schema.prisma — el esquema de Prisma` como propuesta.
3. El mod tiene su copia del piso (`fabrica/hooks/integracion.ts`), con los mismos casos de
   prueba que la aplicación.
4. `mcp__fabrica__decidir(T, "integracion")` contesta `sencilla` o `grande`, con el motivo, y lo
   guarda en la tarea (`integracion_clase: sencilla|grande`, `integracion_por: regla|jev|sin_jev`,
   `integracion_motivo`). Lo que solo cambia documentación, textos, imágenes o estilos es sencillo
   por regla. Sin Jev, lo demás que no cae en el piso es `grande`, con el motivo «sin Jev».
5. Los topes de la decisión 9 se leen de `config.md` (`grande_lineas`, `grande_archivos`), con
   400 y 15 por defecto.
6. En Una línea, cada tarea aprobada dice «Sencilla» o «Grande», y por qué.

### Pruebas
- El piso con rutas de varios stacks: un `.sql`, una migración de EF, un workflow de GitHub, un
  `.csproj`, un `go.mod`, y un `.css` que no cae.
- `[nucleo]` de la ficha pesa igual que el piso.
- Los topes, las vueltas y la propuesta para la memoria dan `grande`.
- Sin Jev, `grande`.

### Cómo quedó (27 de octubre de 2026)
- **El piso, en los dos lados:** `LO_DELICADO` en `src/lib/fabrica/procesos/salida.ts` y en
  `fabrica/hooks/integracion.ts`, con los mismos casos y el mismo largo (13 reglas). `LO_DE_LA_BASE`
  quedó con migraciones y `.sql`; producción sigue usándolo.
- **Prisma, como propuesta:** `loQueSeVe` (`memoria/sembrar.ts`) siembra
  la regla `[nucleo]` del esquema de Prisma (`**/schema.prisma`) cuando ve Prisma.
  Aprobada, la leen la integración y la salida a producción.
- **La clasificación:** `clasificar` y `grandePorElPiso` (`fabrica/hooks/integracion.ts`). La
  llama `mcp__fabrica__decidir(T, "integracion")` con la tarea en aprobación. Anota en la tarea y
  en su bitácora solo si el resultado cambió. Los tres campos son del mod: un agente no los escribe.
- **El orquestador** la pide al aprobarse una tarea (`correr.md`), antes de la salida. Todavía no
  cambia nada de lo que sigue.
- **Los topes** (`grande_lineas`, `grande_archivos`) están en el README.
- **En Una línea,** la tarea dice «Sencilla» o «Grande», con su motivo.
- **Verificado:** las pruebas del mod y de la aplicación, `tsc` y `lint`.

## 2. Jev clasifica, y aprende

### Criterios de aceptación
1. `PREGUNTA_DE_INTEGRACION` en `fabrica/hooks/jev.ts`: si el cambio es superficial (lo que se ve,
   textos, estilos) y no toca lógica, datos ni contratos. Le llegan el título y la lista de
   archivos con sus líneas.
2. Una decisión nueva en `aprendizaje.ts` (`integracion`), con su umbral medido con casos escritos
   a mano, como las demás.
3. En Una línea, una tarea que entró sola tiene «Debió esperarme». Anota un error de Jev y
   aprieta su umbral. Se puede quitar.
4. El informe de la corrida dice cuántas entraron solas y cuántas esperan.

### Pruebas
- Lo que le llega a Jev: el título y los archivos, nunca el código ni la spec. Con `titulo_ajeno`,
  solo el id.
- El umbral sube con «Debió esperarme» y no baja con una grande aprobada sin cambios.
- Jev no puede bajar el piso: una tarea con un `.sql` es grande aunque Jev diga sencilla.

### Cómo quedó (27 de octubre de 2026)
- **La pregunta:** `PREGUNTA_DE_INTEGRACION` (`fabrica/hooks/jev.ts`). `clasificar` la usa solo
  para lo que el piso y las reglas no decidieron, con sentido alto: entra sola si p llega al umbral.
  Sin respuesta, grande.
- **El umbral, 0,7, medido** con 27 cambios escritos a mano (`scripts/fabrica/casos-integracion.json`
  y `jev-integracion.mjs`, con lo medido al lado). Lo que tiene lógica quedó hasta 0,48, incluidas
  tres trampas con títulos que suenan a estilo; lo superficial, desde 0,85. Los 27 aciertan con
  cualquier umbral entre 0,5 y 0,85: 0,7 queda en medio, más cerca de lo seguro.
- **Lo que aprende:** cada clasificación de Jev queda en `factory/jev.jsonl`. «Debió esperarme»
  anota un error y el umbral sube por encima de lo que dijo Jev. Quitar la marca deja una línea
  `retira`, y ese error deja de contar (`sinLoRetirado`, en el mod y en la aplicación). Vale solo
  para lo que Jev dejó entrar sola: una regla no aprende.
- **En Una línea,** el botón está en la nota «Sencilla» de esas tareas, en cualquier línea: va a
  lo que aprende Jev, no a la tarea, así que no se cruza con una corrida.
- **El informe de la corrida** tiene «Sencillas y grandes» y, en «Para Jev», «entró sola» o
  «espera tu prueba».
- **Verificado:** las pruebas del mod y de la aplicación, `tsc` y `lint`. El medidor llamó a Jev
  con los 27 casos, y nada más salió.

## 3. La grande lo espera

### Criterios de aceptación
1. `mover(T, "hecho")` rechaza una tarea `grande` sin su veredicto aprobado, posterior a la
   entrada en aprobación. La regla vive en el mod, no en el orquestador.
2. El orquestador la deja en aprobación y sigue con las demás, como con `aprobacion: externa`.
3. El teléfono suena con el aviso de `veredicto` que ya existe: solo el id y el título.
4. En Una línea, la tarea grande muestra «Para probar a mano» y dos botones: «Probada, intégrala»
   y «Devuélvela», que pide el motivo y la manda a construcción.
5. Una sencilla que tiene que verificarse con sus pruebas (decisión 13) vuelve a verificación
   sola, sin aviso.

### Pruebas
- `mover` con una grande sin veredicto, con uno anterior a la aprobación y con uno vigente.
- Una sencilla no espera nada.
- Lo que dice el teléfono no trae nada escrito por un agente.

### Cómo quedó (27 de octubre de 2026)
- **El guardia:** `mover(T, "hecho")` (`fabrica/hooks/tareas.ts`) pide, para una grande, el
  veredicto «aprobada» de esta vuelta, con su motivo en el error. Si la línea ya pide un veredicto
  externo, manda ese. Y `hMover` clasifica la tarea antes si nadie lo hizo: saltarse el paso no
  deja pasar una grande.
- **El orquestador** (`correr.md`): `decidir(T, "integracion")` contesta SENCILLA, GRANDE o
  PRUEBAS FALLIDAS, y dice qué hacer con cada una. `estado` trae `aprobadaPorElAgente` e
  `integracion`, para que no vuelva a lanzar al aprobador mientras la grande espera.
- **Sin pruebas no hay sencilla:** cambió del plan. Volver a verificación habría pasado otra vez
  por sincronizar y por el aprobador (Opus). En vez de eso, `decidir(T, "integracion")` corre ahí
  mismo las pruebas que Jev había saltado, en el worktree y sin las claves de la fábrica. Si pasan,
  queda `pruebas: corridas` y se anota el acierto de Jev; si fallan, la verificación queda en
  «fallo» y la tarea vuelve a construcción.
- **Lo que te espera** (`teEspera`, en la aplicación): una grande que el agente ya aprobó y que tú
  no probaste. Sale en «Te esperan» y en el pie de su tarjeta («espera tu prueba»).
- **El teléfono** (`motivoParaLlamar`): suena con el aviso de `veredicto` de siempre cuando una
  tarea se clasifica grande, si la línea no pedía ya su veredicto (entonces sonó al llegar a
  aprobación). No lleva el motivo de la clasificación.
- **En Una línea:** «Espera que la pruebes a mano», con su motivo y su rama, y «Probada, intégrala»
  y «Devuélvela», que escriben el veredicto de siempre. El texto de «Para probar a mano» llega con
  el agente de notas, en la etapa 4.
- **Un arreglo de la etapa 2:** la expresión que leía «integración: sencilla|grande» en el informe
  tenía un carácter de control en vez de `\b`, y nunca coincidía. Ahora la lectura es una sola
  (`claseEnNota`, en `motor/formato.ts`) para el informe y el teléfono, con su prueba.
- **Verificado:** las pruebas del mod y de la aplicación, `tsc` y `lint`.

## 4. El agente de notas

### Criterios de aceptación
1. La plantilla `fabrica/plantillas/agentes/anuncio.md` (`fabrica-anuncio`), con
   `oficios: notas-de-version`, herramientas de solo lectura y `mcp__fabrica__anuncio`, en Sonnet.
2. La corrida lo lanza después de clasificar. Con una sencilla escribe `## Para el PR`: qué
   cambió, lo que rompe arriba y `ruta:línea`. Con una grande, `## Para probar a mano`: qué
   probar, en qué orden y qué sería un fallo.
3. `mcp__fabrica__anuncio` escribe solo esas dos secciones, con tope de largo.
4. El agente de salida ya no se lanza en cada tarea.

### Pruebas
- `mcp__fabrica__anuncio` no escribe en otra sección ni pasa el tope.
- La plantilla nombra el oficio Notas de versión y avisos, y su texto llega entero.
- `FABRICA_SALIDA` ya no lanza al agente de salida en la corrida.

### Cómo quedó (27 de octubre de 2026)
- **La plantilla** `fabrica/plantillas/agentes/anuncio.md`: Sonnet, `Read, Grep, Glob, Bash` y
  `mcp__fabrica__anuncio`, con el texto entero del oficio Notas de versión y avisos. El agente
  no tiene herramientas para escribir archivos. El texto va con lo que rompe primero, con
  `ruta:línea`, nunca copiado de un issue, y 30 líneas como mucho.
- **La herramienta** (`hAnuncio` y `anuncioEnLaTarea`, en el mod): solo la acepta de
  `fabrica-anuncio`, con la tarea aprobada y clasificada. La sección la decide la clase; quita los
  títulos que abrirían otra sección y recorta a 4000 caracteres.
- **La corrida** (`corridas.ts`) pasa al agente de notas siempre, con `FABRICA_ANUNCIO`, y `estado` trae
  `anuncio`. El agente de salida ya no viaja: su plantilla, su herramienta y sus reglas quedan
  para cuando llegue la CI/CD.
- **Al volver a construcción**, `mover` borra la clase y `hMover` las dos secciones del agente de notas: se
  escriben otra vez con lo de la nueva vuelta. Esto no estaba en el plan.
- **En Una línea**, «Para probar a mano» va primero, abierta mientras la grande espera, y «Para el
  PR» después del pedido. Las dos dicen que las escribió el agente de notas.
- **`corrida-real.mjs`** lleva al agente de notas en vez del agente de salida, y comprueba que escribió en la
  sección de la clase de cada tarea.
- **Verificado:** las pruebas del mod y de la aplicación, `tsc`, `lint` y la corrida real sin
  `--correr` (solo prepara).

## 5. El paso `fusion`

### Criterios de aceptación
1. `fusion` es un tipo de paso nuevo en `src/lib/fabrica/procesos/formato.ts`, con opción
   `merge`, `squash` o `rebase`. Va después de un `[ci]`; si no, el proceso tiene un problema.
2. Fusiona con `gh pr merge` o `glab mr merge`, por su ruta exacta (`COMPANIA_GH_BIN`,
   `COMPANIA_GLAB_BIN`), y nunca con `--admin`.
3. Antes de fusionar, el código comprueba las tres condiciones de la decisión 14. Si una falla, no
   fusiona y lo dice.
4. El cuerpo del PR lo arma el código con el `## Para el PR` de cada tarea del rango, con su id y
   con tope.
5. `CLAUDE.md` cambia la regla de los procesos: integrar en `main` lo hace el paso `fusion`
   cuando él lo escribe en el proceso y lo enciende; lo demás sigue siendo su clic.

### Pruebas
- Los argumentos de `gh` y `glab`, sin `--admin`.
- No fusiona con la CI en rojo, con otro commit en el PR ni con una grande sin veredicto en el
  rango.
- Un rechazo del servicio (protección de la rama) deja el pedido en la Bandeja.

### Cómo quedó (27 de octubre de 2026)
- **El formato** (`formato.ts`): `- [fusion] el PR en main · squash`, con `merge` (el de siempre),
  `squash` o `rebase`. Va después de un push que abre su PR y de un `[ci]` entre los dos; uno por
  proceso. Lo demás, un problema del proceso, que entonces no corre.
- **La lógica** (`procesos/fusion.ts`, pura): leer el PR con `gh pr view` o `glab mr view`, las
  condiciones (`porQueNoFusionar`), los argumentos y el cuerpo. La fusión ata el commit
  (`--match-head-commit` en GitHub, `--sha` en GitLab): si el PR avanzó, el servicio no la hace. Nunca
  `--admin`, `--auto` ni borrar la rama del proceso.
- **Las tareas que entran** (`tareasDelRango`, en `correr.ts`): integradas en el commit y no en la
  salida anterior, lo mismo que ya usaba la salida a producción. Una sin clase cuenta solo si él la
  aprobó: así una tarea vieja no entra sola.
- **El cuerpo del PR** dice si se fusiona solo y trae lo del agente de notas de cada tarea, con su id (sin el
  título si es ajeno), con las claves de este equipo tapadas y recortado a 60 000 caracteres. Si el
  PR ya estaba abierto, se pone al día. Con varias líneas, a `gh` le llega en un archivo, junto al
  log y fuera del repositorio: lanzado como `.cmd`, un argumento se corta en el primer salto de
  línea. Lo encontró la prueba.
- **Si el servicio la rechaza** (la rama pide una revisión o un check más), el paso falla y lo dice;
  con `· si falla: tarea`, deja el pedido en la Bandeja como cualquier paso. Una fusión hecha no se
  deshace sola: si algo falla después, el paso lo dice.
- **`CLAUDE.md`**: integrar en `main` es su clic, salvo con el paso `fusion` que él escribe; que
  arranque solo sigue siendo su interruptor.
- **Verificado:** las pruebas de la aplicación (con un `gh` de mentira: fusiona con todo sencillo,
  no con una grande sin probar, no si el PR avanzó, y dice lo que contesta el servicio si la rama
  protegida pide más), `tsc` y `lint`. No se probó contra GitHub ni GitLab de verdad.
- **Corregido con su `glab` 1.125, el mismo día:** `glab mr merge` deja la fusión programada por
  defecto si hay un pipeline corriendo (`--auto-merge`, verdadero), y eso iba contra «nunca
  `--auto`»: ahora va `--auto-merge=false`. El merge request nace con
  `--remove-source-branch=false`, porque si el proyecto borra la rama al fusionar se llevaría la de
  trabajo de la línea. Y el cuerpo de varias líneas va con `--description-file`, como en `gh`.

## 6. El retrabajo con Arreglo de raíz y Pruebas

### Criterios de aceptación
1. La plantilla `fabrica/plantillas/agentes/retrabajo.md` (`fabrica-retrabajo`), con
   `oficios: arreglo-de-raiz, pruebas`, las habilidades de construcción de la línea y
   el modelo de construcción de la tarea o de la línea.
2. `correr.md`: en una vuelta por BLOQUEANTE o por verificación fallida, se lanza
   `fabrica-retrabajo`; en un conflicto, el constructor.
3. El mod lo cuenta como de la etapa de construcción: la bitácora anota sus habilidades, y
   `frenaHabilidad` y `frenaMemoria` lo frenan igual.
4. Sus reglas: solo los BLOQUEANTES, la causa fuera de la spec va a él, y de las pruebas corre solo
   las que escribió.

### Pruebas
- La corrida lleva el agente con los dos oficios enteros y con las habilidades de construcción.
- `rolDeAgente("fabrica-retrabajo")` es construcción.
- Jev no le cambia el modelo.

### Cómo quedó (27 de octubre de 2026)
- **La plantilla** `fabrica/plantillas/agentes/retrabajo.md`: las herramientas del constructor, los
  textos enteros de Arreglo de raíz y Pruebas, y sin `model`: lo pone el orquestador con lo que diga
  `decidir(T, "construccion")`, que en el retrabajo no abarata y respeta el modelo elegido en la
  tarea. Su entrega dice `CAUSA FUERA DE LA TAREA:` o `SIN CAUSA:` cuando no arregla, y entonces
  la tarea va a él.
- **La corrida** (`corridas.ts`, `agenteDeRetrabajo`) lo pasa siempre, con `FABRICA_RETRABAJO`, y
  `estado` trae `retrabajo`. Lleva las habilidades de construcción de la línea (`skills:`), pero
  no los oficios de sus especialidades: pesa menos que el constructor con todo. Es lo 2 de
  «Cargar menos de los oficios», en el retrabajo.
- **El mod** (`fabrica/hooks/habilidades.ts`) lo cuenta como de construcción: `rolDeAgente` y
  `rolConHabilidades`, así que su bitácora anota sus habilidades y `frenaHabilidad` lo frena igual.
  `frenaMemoria` y `frenaHabilidades` valen para cualquier subagente. No es un candidato del rol:
  el orquestador lo lanza solo en una vuelta de retrabajo.
- **`correr.md`**: retrabajo por un BLOQUEANTE o por la verificación, el agente de retrabajo; por
  un conflicto, el constructor.
- **`corrida-real.mjs`** lo lleva también (no hubo retrabajo en la corrida del 27 de octubre, así
  que todavía no se vio trabajar).
- **Verificado:** las pruebas del mod y de la aplicación, `tsc` y `lint`.

## 7. La UX en el revisor de interfaz

### Criterios de aceptación
1. `fabrica/agents/revisor-ui.md` nombra la UX en sus reglas: el flujo, que se entienda qué pasó
   y qué hacer después, y los mensajes de error.
2. El README dice que su habilidad `ui-ux-pro-max` se puede nombrar en el catálogo de una línea
   para la etapa de revisión, y que es decisión suya.

### Pruebas
- El texto del agente, como hoy.

### Cómo quedó (27 de octubre de 2026)
- **`fabrica/agents/revisor-ui.md`** suma dos puntos antes de los estados: **el recorrido (UX)**
  —seguir la tarea como quien la usa, si llega, si hay pasos de más, si después de cada acción
  sabe qué pasó y qué hacer, si puede volver atrás sin perder lo hecho— y **los mensajes**, que
  dicen qué pasó y cómo seguir, sin códigos ni trazas. Un camino que deja al usuario sin saber si su
  acción funcionó es BLOQUEANTE. Su descripción lo dice también.
- **El README** dice que son tres revisores con la UX en el de interfaz, y cómo nombrar
  `ui-ux-pro-max` en el catálogo de una línea para la etapa de revisión, que es decisión suya. La
  reciben los tres revisores, que comparten la etapa.
- **Una prueba** lee el agente de verdad y comprueba que nombra la UX.
- **Verificado:** las pruebas de la aplicación y `lint`.

**Con esto termina el plan de integración.** Queda para después lo anotado al final de
`Plan-Habilidades-y-Procesos.md`: la configuración de CI/CD (con el agente de salida de vuelta),
Hermes y cargar menos de los oficios.

## Lo que encontró la corrida real (27 de octubre de 2026)

`npm run fabrica:corrida-real -- --correr --dejar`: dos tareas, 1,50 USD, unos 8 minutos, 6 de 7
comprobaciones.

- **Bien:** F-002, que toca `precios.js` (núcleo en la ficha), quedó grande por regla; F-001, grande
  «sin Jev» (el repositorio de prueba tiene `jev: no`). Las dos quedaron en aprobación esperando su
  prueba, ninguna se integró, y el orquestador siguió con F-002 mientras F-001 esperaba. El agente de
  notas escribió «Para probar a mano» en las dos: lo que rompe primero, pasos numerados, qué sería un
  fallo y `ruta:línea`. El agente de salida no corrió.
- **Mal: el orquestador lanzó los agentes de siempre** (`fabrica:spec-escritor`,
  `fabrica:constructor`, `fabrica:aprobador`) aunque la corrida traía `fabrica-hab-*` y `estado`
  los ponía primero: las especialidades y Comprobación de entrega no llegaron. **Arreglado:** el mod frena ese
  lanzamiento y dice cuál usar (`frenaSinHabilidades`, en `fabrica/hooks/habilidades.ts`), salvo
  el de retrabajo, que trae las suyas.
- **Arreglado también:** la sección del agente de notas quedaba debajo de `## Bitácora`; ahora va antes
  (`ponerSeccionAntesDeLaBitacora`).
- **Para tener en cuenta:** el agente de notas no corre nada, así que los valores que da como esperados son
  cálculos suyos. En F-002 dijo que `precioFinal(19.99)` da `18.99`, y en JavaScript da
  `18.990499999999997`. En F-001 lo dijo («No verificado»).
- **No se vio:** el retrabajo (ninguna tarea volvió a construcción) ni la fusión (el repositorio de
  prueba no tiene remoto).

**La segunda corrida** (1,96 USD, unos 11 minutos, 7 de 7): el orquestador lanzó los
`fabrica-hab-*` por su cuenta, así que el guardia no tuvo que frenar. **El retrabajo trabajó por
primera vez**: seguridad marcó un BLOQUEANTE en F-001 (el error de `JSON.parse` que iba como
`cause` filtraba un pedazo de la respuesta fuera del tope), `fabrica-retrabajo` corrigió la causa
y dejó una prueba que falla sin el arreglo, con Sonnet (el de la tarea), y la segunda vuelta de
revisión no tuvo bloqueantes. Después se arreglaron dos detalles: `## Hallazgos anteriores` va
antes de la bitácora, y `## Veredicto` anota cada veredicto (del aprobador y de la persona) en vez
de quedarse en «_(pendiente)_» (`anotarVeredicto`).
