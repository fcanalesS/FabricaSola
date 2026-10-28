---
name: ley-21719
description: Para las etapas spec y revisión, cuando una tarea toca datos personales de personas en Chile. Marca los riesgos frente a la Ley 21.719 de protección de datos personales (principios, bases de licitud, derechos, datos sensibles y de menores, seguridad y vulneraciones, decisiones automatizadas, transferencias) y los que se pueden comprobar los vuelve criterios o hallazgos. No certifica el cumplimiento.
---

# Ley 21.719, en la fábrica

**De qué versión es este resumen.** Ley 21.719, que modifica la Ley 19.628 de protección de la
vida privada. Publicada en el Diario Oficial el 13 de diciembre de 2024; las modificaciones rigen
desde el 1 de diciembre de 2026. Resumen escrito el 26 de octubre de 2026, con palabras propias, a
partir del texto de la Biblioteca del Congreso Nacional (leychile, idNorma 1209272). Si la ley, su
reglamento o los criterios de la Agencia cambian, este archivo se revisa: una persona lo
actualiza y lo vuelve a aprobar.

**Lo que esta habilidad no hace.** No certifica que algo cumple la ley. Marca riesgos y hallazgos,
cada uno con su porqué, y decide una persona. No da asesoría legal: si un punto es dudoso, lo dice
así y lo deja como pregunta.

## Cuándo se usa

Solo si la tarea toca datos personales: cualquier dato de una persona natural identificada o
identificable (nombre, RUT, correo, teléfono, dirección, IP, ubicación, foto, voz, historial). Si
no toca ninguno, no escribas nada de esto.

## Lo que la ley pide, en corto

1. **Principios del tratamiento:** licitud y lealtad, finalidad (se usa para lo que se dijo),
   proporcionalidad (solo los datos necesarios y solo el tiempo necesario), calidad (exactos y al
   día), responsabilidad (quien trata debe poder demostrar que cumple), seguridad, transparencia e
   información, y confidencialidad.
2. **Bases de licitud.** El consentimiento tiene que ser libre, informado, específico, previo e
   inequívoco, y quien trata los datos tiene que poder probarlo. Sin consentimiento, solo con otra
   base de la ley: una obligación legal, un contrato o lo previo a él, un interés legítimo (que se
   informa), la defensa de derechos ante tribunales, entre otras. Cada tratamiento nuevo dice cuál
   es su base.
3. **Derechos de las personas:** acceso, rectificación, supresión, oposición, portabilidad y
   bloqueo temporal. Hay que responder en 30 días corridos, prorrogables una vez por 30 más; el
   bloqueo, en 2 días hábiles. Rectificar, suprimir y oponerse es gratis; el acceso, al menos una
   vez por trimestre. Si el sistema guarda datos de personas, tiene que poder cumplir cada derecho:
   encontrar todo lo de una persona, corregirlo, borrarlo o entregarlo en un formato que se pueda
   llevar.
4. **Datos sensibles** (salud, biometría, perfil biológico, origen, creencias, vida sexual, entre
   otros): necesitan consentimiento expreso, salvo las excepciones de la ley.
5. **Niños, niñas y adolescentes.** Bajo 14 años, consienten sus padres o representantes. Entre 14
   y 17, como adultos, salvo sus datos sensibles bajo 16 años, que necesitan a sus padres.
6. **Seguridad.** Medidas acordes al riesgo: seudonimización, cifrado, resiliencia y pruebas
   periódicas, y poder demostrarlas después de un incidente.
7. **Vulneraciones.** Una que traiga un riesgo razonable se reporta a la Agencia de Protección de
   Datos Personales sin dilaciones indebidas, y queda registrada. Si toca datos sensibles, de
   menores de 14 o económicos, se avisa también a las personas afectadas. El sistema tiene que
   poder saber qué se expuso y a quién.
8. **Evaluación de impacto**, antes de tratamientos de alto riesgo: perfiles con efectos
   jurídicos, tratamientos masivos, monitoreo de zonas de acceso público y datos sensibles en los
   casos de excepción.
9. **Decisiones automatizadas.** La persona puede oponerse a una decisión tomada solo por un
   sistema automático, perfiles incluidos, si le produce efectos jurídicos o le afecta de forma
   significativa. Donde la ley la permite, hay que poder explicarla, dar intervención humana, oír a
   la persona y revisar la decisión. **Un modelo de IA que decide sobre personas cae aquí.**
10. **Transferencias fuera del país.** Mandar datos personales a un servicio en otro país (un
    modelo en la nube, un proveedor de correo, un almacenamiento) es una transferencia
    internacional, y la ley la permite solo con condiciones (por ejemplo, un país con nivel
    adecuado o garantías). Las condiciones exactas se revisan en el texto oficial antes de darlas
    por cumplidas: márcalo como riesgo y que decida una persona.
11. **Sanciones.** La ley clasifica las infracciones en leves, graves y gravísimas, con multas en
    UTM que en las gravísimas llegan a 20.000 UTM, y crea un Registro Nacional de Sanciones y
    Cumplimiento. En los primeros doce meses de vigencia, a una empresa de menor tamaño la Agencia
    puede amonestarla por escrito en vez de sancionarla. No cites otros montos sin revisarlos en el
    texto oficial.

## En la spec

Si la línea tiene `spec-datos-y-contexto`, trabaja sobre su mapa del flujo de los datos; si no,
arma uno corto (dato, de dónde sale, a dónde va, si se guarda y cuánto). Para cada dato personal:

- di su **base de licitud**, o que el pedido no la dice (eso es un `PEDIDO AMBIGUO` si cambia lo
  que se construye);
- marca si es **sensible** o si puede ser de un **menor**;
- di cómo se cumple cada **derecho** que la tarea toca (si guarda datos nuevos, cómo se borran y
  cómo se entregan);
- marca cada **transferencia fuera del país** y cada **decisión automatizada** sobre personas;
- di si hace falta una **evaluación de impacto**, por los casos de arriba.

Lo comprobable va a «Criterios de aceptación», dentro del tope de diez. Por ejemplo: «borrar a un
cliente borra también sus mensajes y su historial del modelo»; «el prompt no lleva el RUT: va su
id». Lo demás va a «Riesgos y notas», bajo **Ley 21.719**, con la frase «Riesgos marcados; no es
una certificación de cumplimiento».

## En la revisión

Revisa lo que cambió contra lo que pidió la spec y contra los puntos de arriba. Busca sobre todo:
datos personales que llegan a un registro, a un mensaje de error, a un prompt o a un servicio de
fuera sin que la spec lo diga; datos que se guardan sin tiempo de borrado; un borrado que deja
copias; y una decisión automática sobre personas sin revisión humana.

- Las herramientas del validador de la Ley 21.719 (`mcp__ley21719-validator__…`: backend en
  C#, frontend, DDL de SQL) las tiene solo el revisor de seguridad. Si las tienes, pásales el
  texto de los archivos que cambiaron, nunca datos reales ni cadenas de conexión, y comprueba en
  el código lo que digan antes de volverlo hallazgo, con su ruta.
- Si eres el revisor de seguridad y no las tienes, revisa a mano y dilo en tu entrega: «sin el
  validador de la Ley 21.719». Los demás revisores revisan a mano sin decirlo.

Cada hallazgo, como en tu etapa: BLOQUEANTE si expone datos personales o deja a una persona sin un
derecho que la tarea debía cumplir; MENOR si es una mejora. Nunca escribas en un hallazgo los datos
reales que encontraste: di dónde están y de qué tipo son.
