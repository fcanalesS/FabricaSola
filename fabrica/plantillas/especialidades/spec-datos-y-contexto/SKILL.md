---
name: spec-datos-y-contexto
description: Para la etapa spec, cuando la tarea toca datos personales o los manda a un modelo. Agrega a la spec la sección «Datos y contexto» (el mapa del flujo de cada dato, qué entra al contexto del modelo, secretos y permisos) y vuelve criterios lo que se puede comprobar.
oficios: auditoria-de-secretos, amenaza-interna
---

# Datos y contexto, en la spec

Esta habilidad es de la etapa spec. Úsala solo si la tarea toca datos personales, o manda datos
del sistema a un modelo de IA. Si no es así, no escribas nada de esto: ni la sección vacía ni
«no aplica».

## Con qué oficios trabajas

Trabajas con los oficios **Auditoría de secretos** (`auditoria-de-secretos`) y **Amenaza interna
y cadena de suministro** (`amenaza-interna`); su texto va al final de tu prompt. Esos oficios
revisan lo que ya está en un repositorio; tú escribes antes de que exista. Lo que ellos
encontrarían expuesto, tú lo dejas prohibido en la spec.

- **De Auditoría de secretos:** un secreto nunca va en el prompt, en un registro ni en un mensaje de error, y se
  dice dónde vive (una variable de entorno). Nada de datos reales donde van datos de prueba. Nada
  que revele la infraestructura (direcciones internas, nombres de servidores) en lo que viaja al
  modelo.
- **De Amenaza interna y cadena de suministro:** el inventario de lo que la IA tiene permiso para usar, contra lo que necesita
  de verdad. El rastro de cada dato hasta donde termina escrito. Y «puede cambiar bajo tus pies»:
  el modelo va con su versión fijada, no con `latest`.

## Lo que agregas a la spec

Dentro de `## Spec`, después de «Fuera de alcance» y antes de «Criterios de aceptación», la
sección **Datos y contexto**, con estas partes. Escribe solo las que la tarea toca.

1. **El mapa del flujo**, una fila por dato:

   | Dato | De dónde sale | A dónde va | Local o nube (proveedor) | ¿Se guarda? ¿Cuánto? | Quién lo ve |
   |---|---|---|---|---|---|

   Sigue cada dato también a donde termina sin que nadie lo pida: registros, telemetría,
   prompts guardados, la caché del proveedor, mensajes de error.
2. **Qué entra al contexto antes de cada llamada.** Los metadatos, el historial y las variables
   de estado que se inyectan, cuánto de cada uno (con tope) y por qué cada uno hace falta. Lo que
   no hace falta, no entra.
3. **Secretos y permisos.** Qué claves o tokens usa la tarea, dónde viven y qué permiso necesitan
   de verdad. Ninguno entra al prompt.
4. **Lo que no se puede saltar.** Que la ingesta o la generación del modelo no esquive la
   prevención de pérdida de datos ni la auditoría que el sistema ya tiene: dónde quedaría
   registrado lo que pasó y quién lo puede revisar.
5. **El modelo y su versión**, fijada.

La ley no la explica esta habilidad. Si la línea tiene `ley-21719`, esa habilidad revisa este
mapa. Si no la tiene y la tarea toca datos personales, dilo en «Riesgos y notas».

## Lo que va a los criterios

Lo que se puede comprobar va a «Criterios de aceptación», dentro del tope de diez. Por ejemplo:
«el prompt no lleva el RUT ni el correo del cliente: se reemplazan por su id»; «el registro de la
llamada guarda la tarea y la hora, nunca el texto enviado». Lo que no se puede comprobar queda en
la sección, sin criterio.

## Lo que no haces

- No certificas que algo cumple una ley: marcas riesgos y decide una persona.
- No copias datos reales para dar ejemplos: los ejemplos de la spec son inventados.
- No pruebas ninguna credencial ni miras ninguna fuera del repositorio.
