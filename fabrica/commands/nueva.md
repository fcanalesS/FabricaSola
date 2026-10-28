---
description: "Fábrica: crea una tarea en la cola a partir de un pedido"
argument-hint: "\"<qué hay que hacer>\""
---

# Fábrica — tarea nueva

Pedido: $ARGUMENTS

1. Si el pedido está vacío, pregunta qué hay que hacer y no crees nada.
2. Si el pedido mezcla varias cosas independientes (dos funcionalidades, un bug y una mejora),
   propón partirlo en varias tareas y pregunta con AskUserQuestion antes de crear.
3. Crea cada tarea con la herramienta `mcp__fabrica__nueva` (cárgala con ToolSearch
   `select:mcp__fabrica__nueva` si no la tienes): `titulo` corto (lo que verá el tablero, ≤ 60
   caracteres) y `pedido` con el texto completo del usuario y cualquier contexto que haya dado en
   esta conversación (archivos, pantallas, ejemplos). No escribas tú el archivo.
   Si el usuario dice que la tarea necesita otra (que se use algo que otra tarea va a crear, o que
   vaya después de ella), pásalo en `depende_de` con sus ids (`F-009,F-007`): no arranca hasta que
   esas estén hechas e integradas. Si al partir un pedido una parte necesita a otra, créalas en
   orden y pon la dependencia. No inventes dependencias que el usuario no dio a entender. Si la
   herramienta dice que forman un ciclo, dilo y pregunta.
4. Si la herramienta dice que falta `factory/`, di que primero hay que correr `/fabrica:init`.
5. Termina con una línea por tarea creada (`F-00N — título`) y recuerda `/fabrica:correr`.

No empieces a construir nada: esto solo encola.
