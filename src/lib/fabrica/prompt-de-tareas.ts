/**
 * El prompt para pedirle a una IA (Claude u otra) el documento de
 * requerimientos que la fábrica corta en tareas. Se descarga como .md desde
 * la configuración: él lo pega junto a su idea, y lo que vuelve se adjunta en
 * Requerimientos. Lo pidió él el 17 de octubre de 2026. Es lógica pura, y
 * sirve en la página.
 *
 * Lo que pide calza con cómo se corta el documento (`motor/requerimientos.ts`):
 * una tarea por cada `## `, con lo de antes de la primera como contexto de
 * todas, y títulos de hasta 80 caracteres. Si eso cambia, cambia aquí: la
 * prueba corta el ejemplo de este prompt.
 */

/** El documento de ejemplo que va dentro del prompt. */
export const EJEMPLO_DE_REQUERIMIENTOS = `# Reportes de ventas

Proyecto: el POS de las tiendas (Next.js y PostgreSQL). Las pruebas se corren con \`npm test\`.
Convenciones: el código y la interfaz en español; cada endpoint nuevo lleva su prueba.

## Exportar las ventas del día a CSV

### Objetivo
Que el encargado de tienda pueda descargar las ventas del día para cuadrar la caja.

### Criterios de aceptación
- En Reportes › Ventas hay un botón «Exportar CSV».
- El archivo trae una fila por venta: fecha y hora, folio, total y medio de pago.
- Respeta el filtro de tienda que esté elegido.
- Sin ventas, el botón queda deshabilitado.

### Fuera de alcance
Exportar a Excel; las ventas de otros días.

## Filtro por tienda en el reporte de stock

### Objetivo
Ver el stock de una tienda sin mezclarlo con el de las demás.

### Criterios de aceptación
- Un selector de tienda arriba del reporte, con «Todas» por defecto.
- Al elegir una, la tabla muestra solo su stock.
- El filtro elegido se mantiene al recargar la página.

### Fuera de alcance
Comparar tiendas lado a lado.
`;

export const PROMPT_DE_TAREAS = `# Prompt: requerimientos para la fábrica de software

Copia todo este texto en una conversación con una IA (Claude u otra) y escribe tu idea al final, donde dice «Mi idea». Lo que te devuelva lo adjuntas en la aplicación: Configuración › La fábrica de software › Requerimientos, con «Una tarea por cada sección ##».

---

Eres quien escribe los requerimientos para una fábrica de software: agentes que toman cada tarea, escriben su spec, la construyen en su propia rama, la revisan, la verifican con el build y las pruebas, y la aprueban. Cada tarea la hace un agente que no te puede preguntar nada: todo lo que necesita saber tiene que estar escrito.

Con la idea que te doy al final, escribe UN documento en Markdown con esta forma exacta:

1. Un título con \`# \`, y debajo, antes de cualquier \`## \`, el contexto común a todas las tareas: qué proyecto es, con qué está hecho, cómo se corren las pruebas y las convenciones que importan. Ese contexto viaja con cada tarea.
2. Una sección \`## \` por tarea. El título de la sección es el título de la tarea: corto, de hasta 80 caracteres, y dice qué se hace («Exportar las ventas del día a CSV»), no un número.
3. Dentro de cada tarea, estas subsecciones con \`### \` (nunca \`## \`, que abriría otra tarea):
   - \`### Objetivo\`: para qué es, en una o dos frases.
   - \`### Criterios de aceptación\`: una lista de cosas comprobables, que un revisor pueda marcar como cumplidas o no. Nada de «que sea rápido» o «que se vea bien» sin una medida.
   - \`### Archivos o zonas que toca\`: solo si lo sabes; si no, omítela. Si reutiliza algo que ya existe (un método, una clase, un archivo), dilo con la palabra «reutiliza» o «existente»: así se comprueba que esté de verdad en la rama.
   - \`### Depende de\`: solo si la tarea necesita algo que otra de este documento construye. Una viñeta por tarea, con el título exacto de su sección. No arranca hasta que esa esté terminada e integrada.
   - \`### Fuera de alcance\`: lo que se podría pensar que entra y no entra.

Reglas:

- Una tarea es un cambio chico y entregable por sí solo, que se pueda revisar en una rama: si algo tiene varias partes que se pueden entregar por separado, son varias tareas. Ordénalas de modo que ninguna dependa de una que va después, y si una necesita a otra, dilo en su \`### Depende de\`. Sin ciclos: dos tareas no pueden depender una de la otra.
- No inventes requisitos. Si a la idea le falta algo para escribir los criterios sin adivinar, NO escribas el documento todavía: hazme primero las preguntas, numeradas, y espera mis respuestas.
- Nada de código, ni de claves, contraseñas o datos de personas reales.
- Escribe en español neutro.
- Devuelve solo el documento, dentro de un bloque de código \`\`\`markdown, para que lo pueda copiar o guardar como .md.

Un ejemplo de la forma (no de su contenido):

\`\`\`markdown
${EJEMPLO_DE_REQUERIMIENTOS}\`\`\`

---

Mi idea:

[Escribe aquí lo que quieres que haga la fábrica: qué proyecto, qué problema resuelve y para quién.]
`;
