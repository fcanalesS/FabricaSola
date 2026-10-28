---
name: spec-evaluacion
description: Para la etapa spec, cuando la tarea cambia lo que responde un modelo de IA, o el modelo mismo. Agrega a la spec la sección «Cómo se evalúa» (rúbrica, conjunto de prueba y qué cuenta como regresión) y pide como criterio que sus archivos y su comando existan.
oficios: pruebas
---

# Cómo se evalúa, en la spec

Esta habilidad es de la etapa spec. Úsala solo si la tarea cambia lo que responde un modelo de
IA (su prompt, su contexto, sus herramientas) o el modelo mismo (otro modelo, otra versión, otro
servidor). Si no es así, no escribas nada de esto: ni la sección vacía ni «no aplica».

## Con qué oficio trabajas

Trabajas con el oficio **Pruebas** (`pruebas`); su texto va al final de tu prompt. Ese oficio
escribe y corre pruebas sobre código ya escrito; tú dejas dicho, antes, cómo se va a juzgar lo
que responda el modelo.

- **De Pruebas:** enumerar los casos antes de escribirlos (el camino normal, los límites, la
  entrada inválida y el caso que motivó la tarea). Un caso de regresión que falla si la regresión
  vuelve. Seguir el estilo de las pruebas que el proyecto ya tiene. Nunca bajar el umbral para
  que pase: es su «nunca desactivar una prueba que falla». Y decir qué queda sin cubrir.

## Lo que agregas a la spec

Dentro de `## Spec`, después de «Fuera de alcance» y antes de «Criterios de aceptación», la
sección **Cómo se evalúa**, con estas partes.

1. **La rúbrica.** Lo que responde un modelo no es correcto o incorrecto: se califica.
   - Las dimensiones que importan para esta tarea (por ejemplo: precisión, tono, que no invente,
     que siga el formato).
   - La escala de cada una, con un ejemplo corto de cada nivel, inventado.
   - Quién califica: una persona, un modelo o una regla del código. Lo que una regla puede
     comprobar lo comprueba una regla.
   - El umbral para darla por buena.
2. **El conjunto de prueba.**
   - Dónde vive en el repositorio y con qué forma, siguiendo cómo el proyecto guarda sus
     pruebas.
   - Cuántos casos, cuáles (normal, límites, inválidos, el que motivó la tarea) y cómo se
     agregan después.
   - Con datos inventados, nunca reales.
3. **Qué cuenta como regresión.** Cuánto puede bajar el puntaje respecto de la vez anterior
   antes de que sea una falla, y con qué modelo y versión se compara.
4. **El comando que la corre** y lo que deja: un archivo con el puntaje, los casos y los
   fallidos, para que un proceso de la fábrica lo pueda leer.
5. **Lo que queda sin cubrir**, y por qué.

## Lo que va a los criterios

En esta tarea se acepta que los archivos y el comando existan, no que el puntaje pase: correr
la evaluación gasta y no da siempre lo mismo, y lo hace un proceso aparte. Por ejemplo: «existe
el conjunto con al menos doce casos, todos inventados, y el comando escribe su resultado con
puntaje, casos y fallidos». Si una regla del código puede comprobar algo (el formato de la
respuesta, que no venga vacía), eso sí puede ser una prueba normal de la tarea.

## Lo que no haces

- No corres la evaluación ni inventas un puntaje.
- No pones datos reales en el conjunto de prueba, ni para un ejemplo.
- No eliges el modelo de la tarea: lo dice el pedido o lo decide una persona.
