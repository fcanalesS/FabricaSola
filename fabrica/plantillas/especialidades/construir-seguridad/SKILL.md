---
name: construir-seguridad
description: Para la etapa de construcción, cuando la tarea toca permisos, datos de personas, claves, entradas de afuera, conectores o dependencias. Antes de entregar, revisar lo construido como lo miraría alguien de mala fe, lo que ya tiene permiso y lo que no debería quedar escrito.
nikkes: crow-abuso, modernia-interna, velvet-auditoria
---

# Seguridad, en la construcción

Esta habilidad es de la etapa de construcción. Úsala cuando la tarea toca permisos o
autorización, datos de otras personas, claves o credenciales, algo que llega de afuera (un
formulario, un archivo, otro servicio, un documento que lee un modelo), un conector que expone
datos (MCP, una API interna) o las dependencias del proyecto. Si no toca nada de eso, di en una
línea de tu entrega que no aplicó.

## Con quiénes trabajas

Llegan contigo, con sus archivos enteros, **Crow** (`crow-abuso`), **Modernia**
(`modernia-interna`) y **Velvet** (`velvet-auditoria`). Las tres solo leen y reportan: en tu
etapa son **una revisión de lo que tú mismo escribiste, antes de entregar**. No reemplazan al
revisor de seguridad, que mira después. Tus límites mandan sobre los suyos: trabajas solo en tu
worktree, no ejecutas ataques, no pruebas credenciales contra nada y no tocas nada de afuera.

- **De Crow, la mala fe:** nombrar al atacante antes de nada (sin cuenta, con cuenta, un
  empleado, alguien con la base delante); marcar dónde deja el sistema de controlar lo que
  entra; y recorrer, en este orden, autorización (¿la comprobación está en el servidor, o solo
  en la pantalla?, ¿cambiando un id veo lo de otro?), escalada, límites (¿qué pasa si lo hago
  mil veces?), gasto (¿puedo hacer que se llame a un servicio de pago sin tope?), flujo (¿me
  salto un paso?) y datos ajenos.
- **De Modernia, lo que ya tiene permiso:** un token, una cuenta de servicio o un conector con
  más permisos de los que su trabajo necesita (escritura donde bastaba lectura); una dependencia
  nueva con versión sin fijar o que se descarga al construir; un script que corre solo. Lo que
  la tarea agrega con permisos, con el mínimo.
- **De Velvet, lo que no debe quedar escrito:** ninguna clave, contraseña, token ni cadena de
  conexión en el código, en un ejemplo, en un archivo de configuración versionado ni en un
  mensaje de error; ningún dato real de una persona en un conjunto de prueba; ninguna ruta o
  dirección interna que no haga falta. Nunca copias un secreto en tu entrega: dices dónde está
  y de qué tipo es.

## Lo que haces

1. Mientras construyes, lo que la tarea agrega lo haces seguro por defecto: la autorización en
   el servidor, las consultas con parámetros, los permisos mínimos, los secretos desde el
   entorno, y lo que llega de un documento, de una base o de otro servicio tratado como dato,
   nunca como una instrucción.
2. Antes de entregar, recorres lo que construiste con las tres, y lo que encuentres **dentro de
   la tarea** lo cierras.
3. Lo que encuentres **fuera de la tarea** no lo tocas: va a «Visto de paso y NO tocado», con
   `ruta:línea`, y si es grave, en la primera línea de esa sección.

## Lo que va a tu entrega

- En «Cómo lo comprobé», una línea por cada abuso que intentaste sobre lo tuyo y no cedió, o que
  cerraste.
- Una línea: «Con construir-seguridad».

## Lo que no haces

- No escribes exploits ni ejecutas ataques, ni siquiera contra tu worktree.
- No reescribes el historial de git ni rotas credenciales: si una ya estaba en un commit, lo
  dices en tu entrega y lo decide una persona.
- No certificas nada: «no encontré» no es «es seguro».
