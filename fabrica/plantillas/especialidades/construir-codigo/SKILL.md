---
name: construir-codigo
description: Para la etapa de construcción, cuando la tarea cambia o agrega código. Construir lo que dice la spec con la forma de la casa, contratos con sus errores, defensas que se prueban rompiéndolas y las pruebas del cambio, antes de entregar.
nikkes: centi-implementacion, ade-convenciones, drake-contrato, noah-robustez, rapunzel-pruebas
---

# Código, en la construcción

Esta habilidad es de la etapa de construcción. Úsala cuando la tarea cambia o agrega código del
proyecto, que es casi siempre. Si la tarea solo toca documentación o configuración, di en una
línea de tu entrega que no aplicó, y sigue como siempre.

## Con quiénes trabajas

Llegan contigo, con sus archivos enteros, **Centi** (`centi-implementacion`), **Ade**
(`ade-convenciones`), **Drake** (`drake-contrato`), **Noah** (`noah-robustez`) y **Rapunzel**
(`rapunzel-pruebas`). Tus límites mandan sobre los de ellas: trabajas solo en tu worktree, no
haces commit, y lo que la spec no pide no lo haces.

- **De Centi, el puesto:** construir exactamente lo que dice la spec; repetirla en dos listas
  (lo que vas a construir y lo que no vas a tocar) antes de empezar; parar ante dos lecturas y
  escribirlas, en vez de elegir; ejecutar cada pieza al terminarla y pegar su salida. Es la
  misma regla que ya tienes: con ella, nada de lo que entregas es algo que nadie pidió.
- **De Ade, la forma de la casa:** antes de escribir, leer tres o cuatro archivos vecinos de la
  misma capa, no uno; la configuración explícita (linter, formateador, reglas del proyecto)
  manda sobre lo que deduzcas; si el proyecto se contradice, gana el patrón más reciente. Cada
  decisión de estilo, con el precedente que la justifica. Lo que te parezca mejorable de la
  casa no lo cambias: lo anotas.
- **De Drake, lo que viaja:** si la tarea hace que dos partes se hablen (una API, un evento, un
  archivo que lee otro programa, lo que devuelve un modelo), cada campo con su tipo, si puede
  faltar y qué pasa si llega mal; los errores son parte del contrato y se distinguen entre sí
  («no existe», «no tienes permiso», «lo mandaste mal»). Ningún campo se llama `data`, `info`,
  `value`, `result` ni `obj`. Si la spec ya trae el contrato, lo sigues al pie de la letra.
- **De Noah, las defensas:** en el código que escribes tú, los bordes por donde entra lo que no
  controlas (la entrada de una persona, la respuesta de otro servicio, un archivo, una variable
  de entorno). Por cada uno, una de cuatro respuestas, con su porqué en media línea: fallar
  rápido y con ruido, reintentar con tope y espera creciente (solo lo que se puede repetir sin
  efectos), degradar a un valor por defecto que se nota, o propagar. **Nunca un error tragado.**
  Y cada defensa se prueba provocando el fallo que evita.
- **De Rapunzel, las pruebas:** correr la suite antes de tocar nada y anotar qué ya fallaba;
  escribir los casos del cambio con el estilo de las pruebas vecinas (el camino normal, los
  límites, la entrada inválida y el caso que motivó la tarea); pegar la salida real. Una prueba
  que falla no se borra ni se desactiva para que la suite pase.

## Cómo se juntan

- Las defensas de Noah van **en lo que la tarea toca**. Endurecer código que la spec no
  menciona es ampliar el alcance: va a «Visto de paso y NO tocado».
- Si el contrato de Drake obliga a decidir algo que la spec no dice (un campo opcional, un
  código de error), es una ambigüedad: paras, como dice Centi.
- Las pruebas de Rapunzel cubren el código que escribiste y sus defensas. Si una prueba destapa
  un fallo que ya existía fuera de la tarea, lo anotas y no lo arreglas.

## Lo que va a tu entrega

- En «Cómo lo comprobé», la suite antes y después, y cada defensa con el fallo que provocaste.
- Una línea: «Con construir-codigo» (y las demás especialidades que aplicaste).

## Lo que no haces

- No decides el enfoque ni eliges una librería nueva: eso lo trae la spec. Si hace falta una
  dependencia que la spec no nombra, es una pregunta.
- No refactorizas ni limpias código que funciona y que la tarea no toca.
- No escribes en el lore de nadie: la voz de las Nikkes va solo al abrir y al cerrar tu resumen
  final. Lo que escribes en el archivo de la tarea va técnico y neutro.
