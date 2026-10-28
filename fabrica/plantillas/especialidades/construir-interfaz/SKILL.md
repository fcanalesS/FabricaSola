---
name: construir-interfaz
description: Para la etapa de construcción, cuando la tarea cambia lo que ve o usa una persona. Pantallas iguales a las que ya hay, con sus estados de carga, vacío, error y espera, mensajes que dicen qué pasó y qué hacer, y ningún fallo en silencio.
oficios: convenciones, mirada-sin-contexto, ruido-y-registros
---

# Interfaz, en la construcción

Esta habilidad es de la etapa de construcción. Úsala cuando la tarea cambia lo que ve o usa una
persona: una pantalla, un formulario, un mensaje, un flujo, un correo o un texto que se muestra.
Es la UI y la UX juntas. Si la tarea no toca nada de eso, di en una línea de tu entrega que no
aplicó.

## De dónde salen las decisiones

**Las decisiones de experiencia las toma la spec:** qué estados hay, qué ve la persona mientras
algo tarda o si sale mal, cómo cancela, qué dice cada mensaje. Tú las construyes.

Si la spec no las dice, **no es una ambigüedad que te detenga**: sigues lo que ya hacen las
pantallas del proyecto en un caso parecido, y lo anotas en tu entrega («Interfaz: la spec no
decía X; seguí lo de `ruta`»). Si no hay ningún caso parecido y la decisión cambia lo que la
persona puede hacer, entonces sí es una pregunta.

## Con qué oficios trabajas

Trabajas con los oficios **Convenciones del proyecto** (`convenciones`), **Mirada sin
contexto** (`mirada-sin-contexto`) y **Ruido y registros** (`ruido-y-registros`); su texto va al
final de tu prompt. Tus límites mandan sobre los suyos: trabajas solo en tu worktree, y lo que
la spec no pide no lo haces.

- **De Convenciones del proyecto, que no se note otra mano:** la pantalla nueva se arma con los componentes, los
  colores, los espacios y los textos de las que ya hay. Lees tres o cuatro pantallas vecinas
  antes de empezar, y cada decisión visual tiene su precedente. El sistema de diseño del
  proyecto (sus tokens, sus componentes, su guía) manda sobre tu gusto.
- **De Mirada sin contexto, quien llega sin contexto:** cada nombre, botón y etiqueta dice qué hace sin
  tener que probarlo; cada mensaje de error dice qué pasó, qué se esperaba y qué hacer ahora;
  no hay trampas (dos botones parecidos que hacen cosas distintas, un orden que no es el
  natural, un paso que hay que adivinar).
- **De Ruido y registros, ni ruido ni silencio:** un aviso solo si la persona puede hacer algo con él;
  ningún fallo queda en silencio. Una respuesta cortada se muestra como cortada, nunca como
  completa; un respaldo que entra en juego se nota; una espera larga dice que está esperando.

## Lo que haces

1. **Los estados:** cargando, vacío, error y, si algo tarda (una IA, otro servicio), la espera
   con lo que va llegando y la forma de cancelar. Cada uno, como lo hacen las pantallas que ya
   hay.
2. **Lo accesible:** cada control con su etiqueta visible, el foco que se ve y sigue un orden
   natural, el contraste de los colores del proyecto, y nada que dependa solo del color o del
   mouse.
3. **Los textos:** en el idioma y el tono del proyecto, cortos, con lo que la persona necesita.
4. **Comprobarlo:** si el proyecto tiene cómo verlo (un servidor de desarrollo, una prueba de
   la vista), lo usas y dices qué miraste.

Si la línea nombra además habilidades de diseño en su catálogo, úsalas para lo visual. Esta
manda en la consistencia con lo que ya hay.

## Lo que va a tu entrega

- «Interfaz:» con lo que la spec no decía y de qué pantalla lo seguiste.
- Una línea: «Con construir-interfaz».

## Lo que no haces

- No rediseñas pantallas que la tarea no toca, ni cambias el sistema de diseño.
- No inventas un estado o un flujo nuevo que cambie lo que la persona puede hacer: eso lo
  decide la spec.
