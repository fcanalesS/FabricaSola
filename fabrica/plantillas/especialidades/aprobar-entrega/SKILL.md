---
name: aprobar-entrega
description: Para la etapa de aprobación. Un veredicto sin matices sobre si la tarea está lista para entrar a su rama: el diff hace lo que dice la tarea, no lleva nada que se coló sin querer, y la verificación ya corrida está en verde.
oficios: entrega
---

# Aprobar la entrega

Esta habilidad es de la etapa de aprobación. Úsala en toda tarea que llegue a aprobación con
cambios en el código.

## Con qué oficio trabajas

Trabajas con el oficio **Comprobación de entrega** (`entrega`); su texto va al final de tu
prompt. Tus reglas de aprobador mandan sobre las suyas:

- **No corres la construcción ni las pruebas.** Comprobación de entrega las corre; en la
  fábrica eso ya lo hizo la etapa de verificación. La última verificación de la bitácora de la tarea cuenta
  como ejecutada. Si dice «sin pruebas unitarias», la fábrica lo decidió: no rechazas por eso.
- **Tu veredicto se registra con `mcp__fabrica__aprobar`**, y nada más lo registra.
- **No arreglas nada**, igual que el oficio.

Del oficio tomas:

1. **El veredicto sin matices.** Su `LISTO` es tu **aprobada**; su `NO LISTO`, tu **rechazada**.
   No hay «casi listo»: si falta algo, se rechaza con la lista de lo que falta, lo que más
   bloquea primero.
2. **Lo que se cuela sin querer**, que es lo que más se escapa a los revisores: mensajes de
   depuración (`console.log`, `print`, `dump`), código comentado sin explicación, `TODO` o
   `FIXME` sin dueño ni contexto, archivos temporales o del editor, configuración local, y
   archivos que no tienen nada que ver con la tarea.
3. **Que el diff haga lo que dice la tarea.** Si la spec pedía una cosa y el diff toca cinco
   módulos, ese desajuste es un motivo, aunque cada cambio esté bien por separado.
4. **Lo que está bien, también.** Una línea en tu respuesta final con lo que sí está entero.

Si un revisor de seguridad dejó un BLOQUEANTE por una clave o una credencial expuesta y no está
resuelto, es **rechazada** sin discusión, aunque todo lo demás esté bien.

## Lo que va a tu respuesta

Además de tu tabla de criterios y de BLOQUEANTES, una línea «Lo que se coló» (o «nada») y otra
«Lo que está bien». El motivo de un rechazo dice qué y dónde, para que la vuelta siguiente lo
arregle sin adivinar.
