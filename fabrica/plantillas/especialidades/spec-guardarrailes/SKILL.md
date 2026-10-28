---
name: spec-guardarrailes
description: Para la etapa spec, cuando la tarea llama a un modelo de IA, cambia un prompt o le da herramientas a un agente. Agrega a la spec la sección «Comportamiento de la IA» (límites, herramientas, mala fe, fallas y falta de contexto) y vuelve criterios lo que se puede comprobar.
nikkes: crow-abuso, noah-robustez
---

# Guardarraíles de la IA, en la spec

Esta habilidad es de la etapa spec. Úsala solo si la tarea llama a un modelo de IA, cambia un
prompt, o le da herramientas (servidores MCP, FastMCP, APIs) a un agente. Si no es así, no
escribas nada de esto: ni la sección vacía ni «no aplica».

## Con quiénes trabajas

Llegan contigo, con sus archivos enteros, **Crow** (`crow-abuso`) y **Noah** (`noah-robustez`).
Ellas revisan código ya escrito; tú escribes antes de que exista. Lo que ellas buscarían en el
código, tú lo pides como requisito.

- **De Crow:** antes que nada, quién interactúa con la IA (alguien sin cuenta, alguien con
  cuenta, el autor de un issue, el texto de una página o de un documento). Dónde deja de
  controlarse lo que entra: aquí, lo que entra al contexto del modelo. Sus seis categorías,
  aplicadas a la IA, y a quién perjudica cada caso.
- **De Noah:** las categorías de falla, y para cada una, una de sus cuatro estrategias con su
  porqué. Nunca silenciar un error. Y su «rompe lo que arreglaste», que aquí es un criterio: cada
  defensa tiene una prueba que provoca la falla que evita.

## Lo que agregas a la spec

Dentro de `## Spec`, después de «Fuera de alcance» y antes de «Criterios de aceptación», la
sección **Comportamiento de la IA**, con estas partes. Escribe solo las que la tarea toca.

1. **Quién le habla y qué entra al modelo.** Cada fuente de texto que llega al contexto, y si es
   de confianza. El texto ajeno (de un issue, una página, un documento, otra persona) entra como
   cita y nunca como orden.
2. **Herramientas.** Qué herramientas puede llamar el modelo, con qué permiso y con qué tope.
   El permiso es el justo para la tarea, no el que había a mano.
3. **Lo que sabe y lo que no.** Los bordes de su conocimiento, y qué hace cuando le preguntan
   fuera de ellos.
4. **Mala fe**, con las categorías de Crow:
   - autorización: si una llamada del modelo puede pedir el recurso de otra persona. La
     comprobación va en el servidor, no en el prompt;
   - escalada: si el modelo puede darse un permiso o una herramienta que no tiene;
   - límites: qué pasa si lo hacen mil veces;
   - económico: si alguien puede hacer gastar tokens o llamadas sin tope;
   - flujo: si se puede saltar una confirmación;
   - datos ajenos: qué podría ver o repetir de otras personas;
   - inyección: texto ajeno que trae instrucciones para el modelo.
5. **Fallas**, con las categorías de Noah: entrada ausente o malformada, el servicio del modelo
   caído o lento, una respuesta a medias o fuera del formato pedido, una operación cortada a la
   mitad, dos ejecuciones a la vez. Para cada una, la estrategia (fallar ruidoso, reintentar con
   tope y espera creciente solo si se puede repetir sin efectos, degradar a un valor por defecto,
   o propagar) y por qué esa.
6. **Sin contexto suficiente.** Qué responde en vez de inventar: decir que no sabe, pedir el
   dato que falta o citar de dónde sacó lo que dice.

## Lo que va a los criterios

Lo que se puede comprobar leyendo el código o corriendo algo va a «Criterios de aceptación»,
dentro del tope de diez. Por ejemplo: «una petición con el id de otra persona devuelve 403, y hay
una prueba que lo provoca»; «si el modelo no contesta en 30 s, la pantalla dice que no pudo y no
se guarda nada». Lo que no se puede comprobar queda en la sección, sin criterio.

## Lo que no haces

- No diseñas la implementación: dices qué tiene que pasar, no cómo escribirlo.
- No escribes ataques ni pruebas contra nada: Crow tampoco lo haría.
- Si la tarea toca datos personales, eso es de `spec-datos-y-contexto` y de `ley-21719`, si la
  línea las tiene.
