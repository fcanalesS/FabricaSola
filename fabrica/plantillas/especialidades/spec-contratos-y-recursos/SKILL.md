---
name: spec-contratos-y-recursos
description: Para la etapa spec, cuando la tarea habla con otro servicio o llama a un modelo de IA. Agrega a la spec la sección «Contratos y recursos» (la forma exacta de lo que viaja, sus errores, y topes medibles de tokens, latencia y costo) y vuelve criterios lo que se puede comprobar.
oficios: contratos, consumo-de-recursos, pruebas-de-carga
---

# Contratos y recursos, en la spec

Esta habilidad es de la etapa spec. Úsala solo si la tarea habla con otro servicio (una API, un
webhook, otra base de datos, un servicio gRPC, una interfaz física) o llama a un modelo de IA. Si
no es así, no escribas nada de esto: ni la sección vacía ni «no aplica».

## Con qué oficios trabajas

Trabajas con los oficios **Contratos de datos y API** (`contratos`), **Consumo de recursos**
(`consumo-de-recursos`) y **Pruebas de carga** (`pruebas-de-carga`); su texto va al final de tu
prompt.

- **De Contratos de datos y API, casi todo su método:** nombrar las dos partes; buscar el contrato que el código ya
  tiene escrito a trozos antes de inventar uno; los datos antes que las operaciones; por cada
  campo, sus tres decisiones (tipo, si puede faltar y por qué, qué pasa si llega mal); «hacer el
  mal» sobre el papel (vacío, 10.000 caracteres, negativo, la fecha de 1900, el id de otra
  persona, la misma llamada dos veces) y volver cada maldad una regla; errores que se distinguen
  entre sí; un ejemplo completo por operación; cómo evoluciona. Y su regla: ningún campo se llama
  `data`, `info`, `value`, `result` ni `obj`.
- **De Consumo de recursos:** lo que crece sin tope, lo que se repite en bucle y lo que cuesta dinero
  estando parado. Distinguir lo caro de lo que crece, y cada tope con su unidad.
- **De Pruebas de carga:** ningún tope sin decir cómo se mide, y nunca pedir carga contra producción ni
  contra un servicio de otro.

## Lo que agregas a la spec

Dentro de `## Spec`, después de «Fuera de alcance» y antes de «Criterios de aceptación», la
sección **Contratos y recursos**, con estas partes. Escribe solo las que la tarea toca.

1. **El contrato**, por cada cosa que viaja entre dos partes:
   - quién llama y quién responde;
   - sus campos, en una tabla: campo, tipo, ¿puede faltar? (y por qué), si llega mal;
   - un ejemplo completo de petición y respuesta, con valores inventados;
   - los errores: situación, código y cuerpo, y si quien llama distingue «no existe», «no tienes
     permiso» y «lo mandaste mal»;
   - qué se puede agregar después sin romper, y qué no se toca.
   Si el contrato ya existe y la tarea lo cambia, di arriba qué le falla a quien no toque nada.
2. **Lo que devuelve el modelo, como contrato**, si hay uno: su esquema (JSON Schema o el que use
   el proyecto) y qué pasa si responde fuera de él.
3. **Recursos**, cada uno con su unidad y cómo se mide:
   - tokens de entrada y de salida por llamada;
   - latencia aceptable (por ejemplo, p95 medido en local con un número de peticiones dicho);
   - costo por llamada y por día, y el tope que corta;
   - si la inferencia va en local o en la nube, y por qué;
   - lo que podría crecer sin tope (el historial en el contexto, una caché) y su límite;
   - lo que no debe repetirse en bucle (una llamada al modelo por fila).
4. **Las decisiones de IA**, si la tarea llama a un modelo. El constructor las da por tomadas
   (la habilidad `construir-con-ia` no las decide), así que cada una que la tarea toque queda
   escrita:
   - **qué modelo hace qué:** si hay más de uno, cuál recibe cada parte del trabajo y por qué
     (por ejemplo, el código a uno local y el lenguaje natural difícil a uno en la nube);
   - **la estrategia de contexto:** qué entra al prompt (historial, memoria, documentos), cuánto
     como mucho y qué se recorta primero;
   - **la fragmentación**, si hay RAG: cómo se cortan los documentos (por tamaño, por sección),
     cuánto se solapan y cuántos fragmentos entran por consulta;
   - **el respaldo:** si se pasa de un modelo a otro cuando uno falla o tarda, cuándo (el tope de
     tiempo o de errores), a cuál, y qué no puede salir nunca a la nube.

## Lo que va a los criterios

Lo que se puede comprobar va a «Criterios de aceptación», dentro del tope de diez. Por ejemplo:
«un campo `cantidad` negativo devuelve 400 con `{ "error": "cantidad_negativa" }`»; «el historial
que entra al prompt se corta en los últimos 20 mensajes»; «hay un tope de 200 llamadas al modelo
por día y, al llegar, la pantalla lo dice». Lo que no se puede comprobar queda en la sección.

## Lo que no haces

- No implementas el contrato ni eliges con qué se construye.
- No pides pruebas de carga contra producción ni contra un proveedor: si un número no se puede
  medir en local o en pruebas, se dice que no se puede, en vez de estimarlo.
- No inventas un tope que nadie dijo: si el pedido no lo trae y cambia lo que se construye, es
  una pregunta (`PEDIDO AMBIGUO`).
