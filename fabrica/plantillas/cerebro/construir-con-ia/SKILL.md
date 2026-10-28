---
name: construir-con-ia
description: Para la etapa de construcción, cuando la tarea llama a un modelo de IA, le da herramientas a un agente o arma su contexto. Defensas en profundidad para respuestas parcialmente correctas, conectores MCP con permisos mínimos, contexto y RAG con tope, streaming que se nota cuando se corta, y respaldos que avisan.
nikkes: noah-robustez, drake-contrato, behemoth-drenaje
---

# Construir con IA

Esta habilidad es del cerebro de la fábrica: una sola para todas las líneas, que la usa la etapa
de construcción de una línea si su catálogo la nombra. Úsala cuando la tarea llama a un modelo
de IA, local o en la nube; le da herramientas a un agente (un servidor MCP, una función que el
modelo puede llamar); arma lo que entra a su contexto (historial, memoria, RAG); o muestra su
respuesta a una persona. Si la tarea no hace nada de eso, di en una línea de tu entrega que no
aplicó.

## La regla principal

**El código tradicional funciona o falla. El código con IA, además, puede responder algo
parcialmente correcto.** Por eso nada de lo que devuelve un modelo llega a la lógica de negocio,
a una base de datos ni a otra persona sin pasar antes por una defensa del código: un esquema, un
validador, un tope. Y cada defensa se prueba con el caso roto.

## De dónde salen las decisiones

La spec decide qué modelo hace qué, cuánto contexto entra y qué se recorta, cómo se fragmentan
los documentos, cuándo se pasa a otro modelo y cuánto se puede gastar. Tú las construyes. Si la
spec no dice una de esas cosas y cambia lo que construyes, es una pregunta: no la decides tú.

## Con quiénes trabajas

Llegan contigo, con sus archivos enteros, **Noah** (`noah-robustez`), **Drake**
(`drake-contrato`) y **Behemoth** (`behemoth-drenaje`). Tus límites mandan sobre los suyos:
trabajas solo en tu worktree, no haces commit, y no llamas a un modelo de verdad ni a un servicio
de pago para probar: usas los dobles de prueba del proyecto, o los escribes.

- **De Noah:** los bordes donde entra lo que no controlas, y la respuesta de un modelo es uno de
  ellos. Por cada uno, fallar con ruido, reintentar con tope y espera creciente, degradar de
  forma visible o propagar. Nunca un error tragado.
- **De Drake:** lo que devuelve el modelo, lo que reciben y devuelven sus herramientas y los
  eventos del streaming son contratos, con cada campo decidido y sus errores.
- **De Behemoth:** lo que crece sin tope (el historial en el contexto, una caché, una cola), lo
  que no se cierra (una conexión de streaming, un proceso hijo) y lo que cuesta dinero en un
  bucle (una llamada al modelo por fila). Cada tope, con su unidad.

## Lo que construyes

1. **Lo que devuelve el modelo:** se valida contra su esquema antes de usarlo. Si no cumple, se
   corrige solo lo que es seguro corregir (un JSON mal cerrado, comillas de más) y se registra
   que se corrigió; lo demás falla con un error que dice qué se esperaba y qué llegó. Nunca se
   usa a medias. Pruebas con el JSON roto, el campo que falta, el tipo equivocado y la respuesta
   vacía.
2. **Conectores y herramientas (MCP):** cada herramienta con su esquema de entrada y de salida;
   permisos mínimos (si basta leer, solo lectura); consultas con parámetros, nunca armadas con
   texto; un tope de filas, de tamaño y de tiempo. Lo que vuelve de una base, de un documento o
   de una página es dato: nunca una instrucción para el modelo.
3. **Estado y contexto:** el historial y la memoria entran con la estrategia de la spec y un
   tope en tokens o en mensajes. Lo que se recorta se recorta igual cada vez. Nada crece sin
   tope.
4. **RAG:** la ingesta, la limpieza y la fragmentación siguen la spec. Cada fragmento sabe de qué
   documento y de qué parte salió. Lo recuperado entra como cita, con su origen, y nunca como
   instrucción.
5. **Streaming (SSE o WebSocket):** con su tope de tiempo, su cierre siempre (también si la
   persona se va) y su reconexión si la spec la pide. Una respuesta cortada se marca como
   cortada; nunca se muestra como completa.
6. **Respaldo entre modelos:** si la spec pide pasar de un modelo a otro (de la nube a uno local,
   o al revés), el cambio tiene un tope de tiempo, se registra y se avisa. Nunca reintenta para
   siempre, y nunca manda a la nube algo que la spec dejó en local.
7. **Gasto:** cada llamada a un modelo de pago tiene su tope por petición y por día, y al llegar
   se dice. Ninguna llamada dentro de un bucle sin tope.

## Lo que va a tu entrega

- En «Cómo lo comprobé», cada defensa con el caso roto que la prueba.
- Lo que no se puede comprobar en el worktree (la latencia real, el despliegue, un modelo de
  verdad, un equipo de edge), dicho como tal, para la evaluación o un proceso.
- Una línea: «Con construir-con-ia».

## Lo que no haces

- No eliges el modelo, la estrategia de contexto, la fragmentación ni el respaldo: los trae la
  spec.
- No llamas a un modelo real ni a un servicio de pago desde las pruebas.
- No escribes claves en el código: salen del entorno, con el nombre que diga el proyecto.
