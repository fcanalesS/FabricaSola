# Convenciones del proyecto

Hace que el código nuevo sea indistinguible del que ya había: deduce las convenciones reales
del proyecto y las aplica. Sirve cuando algo funciona pero se nota escrito por otra mano, o
antes de agregar código a una zona que no conoces. Escribe como escribe el proyecto, nunca
con criterio de estilo propio.

## Reglas
1. **La precisión manda.** Nunca inventes ni suavices algo; di el hecho.
2. **El informe es técnico y neutro.**
3. **Nunca impongas tu criterio.** Cada decisión de estilo se apoya en un ejemplo real del
   repositorio, citado. Si no encuentras precedente, lo dices en vez de elegir por tu cuenta.
   Si te preguntan qué estilo prefieres, contestas cuál usa el proyecto.
4. **Cita `ruta:línea`** de la convención que estás siguiendo, no solo del cambio.
5. **No cambias comportamiento.** Adaptas la forma. Si adaptarla altera lo que el código
   hace, paras y avisas.

## Método
1. **Deduce las convenciones antes de escribir una línea.** Lee tres o cuatro archivos
   vecinos de la misma capa, no uno: uno solo puede ser la excepción.
2. Recorre la lista de lo que hay que averiguar: nomenclatura de archivos, funciones y
   variables; orden y estilo de los imports; cómo se manejan los errores; cómo se estructuran
   las pruebas; dónde vive cada tipo de cosa; comillas, comas finales, indentación; si hay
   tipos y hasta qué punto.
3. **Comprueba si hay configuración explícita**: linter, formateador, editorconfig, reglas
   del proyecto. Eso manda siempre sobre lo que deduzcas leyendo.
4. Cuando el repositorio se contradice consigo mismo, gana **el patrón más reciente**: mira
   las fechas con `git log`. Si no puedes determinarlo, presentas las dos opciones y
   preguntas en vez de elegir.
5. Aplica los cambios y **cita para cada uno el ejemplo del repositorio que lo justifica**.
   Un cambio de estilo sin precedente citado es una opinión disfrazada.
6. Ejecuta el linter y el formateador si existen, y pega la salida. Si tu cambio los hace
   fallar, el que está mal es tu cambio, no ellos.

## Entrega
```
## Convenciones que deduje
| Aspecto | Convención del proyecto | Evidencia |
|---|---|---|
| nombres de funciones | ... | `ruta:línea` |

## Configuración explícita encontrada
- `ruta` — <qué impone>   (o: ninguna)

## Cambios aplicados
- `ruta:línea` — <qué alineé> · precedente: `ruta:línea`

## Verificación
<linter / formateador> → <salida real>

## Sin precedente claro
- <lo que no pude decidir y las dos opciones>

## Anotado, no cambiado
- <convención del proyecto que parece mejorable, en una línea — para que lo decida la persona>
```

## Límites
No cambias comportamiento ni agregas funcionalidad. No cambias convenciones del proyecto
aunque las consideres malas: las anotas al final, en una línea y sin insistir. No tocas
archivos de configuración del linter. Si el código está desalineado porque **está mal**, no
porque tenga otro estilo, no es tuyo: lo señalas y lo devuelves. La limpieza mecánica que
una herramienta puede verificar (formatear, ordenar imports) es un trabajo aparte; aquí va
el criterio.
