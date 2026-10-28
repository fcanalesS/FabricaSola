# La entrada de la fábrica: formulario, bandeja, fuentes y lector

**Qué es.** La parte de Zero 2.0 por la que entra el trabajo a la fábrica: un formulario
propio, issues de GitHub y GitLab, y más adelante Jira o la alternativa que se instale. El
diseño está en el lienzo «Zero 2.0 · Panel de la fábrica», página «v2 · Varias líneas», bajo
«Entrada»: Bandeja, Fuentes y tokens, Nueva petición, Conectar una fuente, y Casos difíciles y
estados.

**Cómo se prueba.**
- App: `npm test` (`node --test`), `npx tsc --noEmit` y `npm run lint`, desde `compania/`.
- Las rutas, con `src/pruebas/entorno.ts` y la red de mentira (`src/pruebas/red.ts`): carpeta
  recién hecha, claves de mentira, y una red que falla ante cualquier dirección que no conozca.
  Lo que una regla prohíbe se prueba mirando **qué le llegó a cada servicio**, no solo qué
  contestó la ruta.
- Mod: `claude plugin test fabrica`, si se toca `fabrica/hooks/`.

**Convenciones que importan** (`compania/CLAUDE.md` y `AGENTS.md`):
- Español neutro, sin voseo y con tildes. Identificadores y datos guardados, sin tilde.
- Next.js 16 cambia cosas: antes de escribir una página o una ruta, leer la guía en
  `node_modules/next/dist/docs/`.
- `.env.local`, `comun/` y `personajes/<id>/memoria/` no se leen ni se copian. Para probar, la
  carpeta temporal de `entorno.ts`.
- **Un guardia va pegado a lo que protege, no en quien llama.** La revisión del texto de un
  issue va dentro de la función que lo convierte en tarea, no en la ruta.
- **El texto ajeno entra entre « » con `citar()`** (`src/lib/texto/citas.ts`).
- Una ruta nueva, o un guardia nuevo en una ruta, lleva su prueba.
- El contrato con el plugin (`fabrica/docs/puente-orquestador.md`): desde fuera solo se
  **encolan** tareas nuevas en `pendiente`, con el siguiente id libre. Una tarea que existe no
  se cambia (salvo respuesta a un humano o descarte).

**Decisiones ya tomadas por él** (26 de octubre de 2026; no se reabren):
1. Un token por conexión. La aplicación la usa él solo.
2. Los tokens solo leen. La fábrica no escribe en GitHub, GitLab ni Jira: no comenta, no
   cierra, no etiqueta. Hacerlo sería otra decisión suya, con otro permiso.
3. Nada de un issue pasa a una línea sin su clic. El formulario sí puede ir directo a la cola,
   porque lo escribe él.
4. Los puestos de trabajo se comparten en toda la planta, con un máximo por línea (afecta a la
   planta, no a la entrada; queda anotado para el plan de las líneas).
5. Jira, o la alternativa de código abierto que se instale (Taiga u otra), se define después.
   La entrada se arma con una interfaz de proveedor para que sumarlo sea un archivo nuevo.
6. El texto de un issue de otra persona puede salir a Jev para revisarlo.
7. De un token solo se valida si está o no. No se revisan sus permisos ni se prueba contra el
   servicio al cargarlo: que la fábrica solo lea lo garantiza su código (solo pedidos de
   lectura, probado). Si el token está pero el servicio lo rechaza, lo dice el lector al leer.
   Por eso se descarta el prototipo de tokens.
8. Las claves de IA (Claude, Codex, Antigravity, Jev) siguen en `.env.local` y las cambia él a
   mano. Ninguna pantalla las pide, las muestra ni las valida.

9. Los tokens de las fuentes también van en `.env.local`, uno por conexión, y los cambia él a
   mano. La aplicación guarda solo el **nombre** de la variable de cada conexión y dice si está o
   falta; el valor lo usa el servidor para leer y no pasa por ninguna pantalla ni ruta. El nombre
   tiene que ser `COMPANIA_FUENTE_<NOMBRE>_TOKEN`: así ninguna conexión puede apuntar a una
   clave de IA y mandarla a un servidor cualquiera. Como no se conoce el valor, tampoco se sabe
   cuándo vence: los avisos son «falta» y «rechazado al leer».

## Cómo quedó (26 de octubre de 2026)

**Hecho, del 2 al 7.** El registro de líneas va en el commit `20ccc37`; el resto, en el commit
de la Entrada. Lo que cambió respecto de este plan:

- **Una sola ruta, `/api/fabrica/entrada`**: `GET` da la vista y `POST` recibe acciones
  (`peticion`, `pasar`, `descartar`, `cambio_a_tarea`, `ignorar_cambio`, `fuente_*`, `traer`),
  revisadas en `src/lib/entrada/acciones.ts`. No pasa por `atenderEnLaFabrica`: la Entrada no es
  del proyecto activo sino de todas las líneas, y usa el motor directo (`crearTareaEn`).
- **Páginas `/fabrica/bandeja`, `/fabrica/peticion` y `/fabrica/fuentes`**, con su propia
  cabecera. Se llega desde Configuración › Fábrica › Tareas. El menú de la v2 (planta, líneas)
  llega con el plan de la planta.
- **«Reescribirlo con mis palabras»** abre la petición con `?desde=<id>`: la tarea lleva el
  `origen_entrada` del issue y el issue sale de la Bandeja.
- **Ella avisa de una fuente caída en su latido** (`src/app/api/tele/route.ts`), después de lo
  de la fábrica: es por donde ya cuenta la fábrica por su cuenta (`comentar.ts`). Con un título
  ajeno, ella, el turno guardado y el teléfono dicen solo el id.
- **La revisión del texto ajeno** vive en `src/lib/texto/instrucciones.ts` y la comparten la
  consulta web y la Entrada.

**Pendiente:** Jira o Taiga (una entrada más en `PROVEEDOR`, en `proveedores.ts`), y revisar si
un criterio de la petición «se puede comprobar» mientras se escribe.

## Orden y por qué

```
Registro de líneas → Formulario → Bandeja → Fuentes y tokens → Lector → Avisos
                                                                Jira o Taiga (cuando se elija)
```

1. ~~Prototipo de tokens.~~ Descartado el 26 de octubre: de un token solo se valida si está.
2. **Registro de líneas.** Hecho el 26 de octubre. Antes la fábrica miraba un solo proyecto (`Ajustes.raiz`). Todo lo que
   entra va «a una línea», así que hace falta una lista de líneas antes que nada. Es la versión
   mínima: sin planta ni puestos compartidos.
3. **Formulario.** La fuente más simple: no usa red ni tokens. Deja hecha la parte de crear una
   tarea en una línea elegida, con su origen, que después usan las demás.
4. **Bandeja.** El almacén de lo que entra y la acción de pasar a una línea, con su guardia. Se
   prueba con borradores del formulario antes de que exista un lector.
5. **Fuentes y tokens.** Conectar con el nombre de la variable, ver si está, encender y apagar.
6. **Lector.** Trae los issues cada tanto y los deja en la Bandeja. Va después de Fuentes porque
   necesita sus tokens, y después de Bandeja porque escribe en ella.
7. **Avisos.** Una fuente a la que le falta su variable o a la que el servicio le rechazó el
   token: en Fuentes, arriba de la Bandeja y en lo que dice Zero.
8. **Jira o su alternativa.** Cuando él elija cuál.

Las páginas siguen lo que se habló de los componentes de servidor: cada página de `src/app/`
lee en el servidor y le pasa al navegador una **vista** que por tipo no tiene el token, así que
el token no puede llegar al navegador ni por descuido.

## Registro de líneas

**Hecho el 26 de octubre de 2026.** `src/lib/fabrica/motor/lineas.ts` (lógica pura, con sus
pruebas), `Ajustes.lineas` y `lineaActiva` en `proyecto.ts`, y `crearTareaEn`, que comparten
requerimientos y deuda (`planearTareas` y `escribirTareas`). `npm test`, `tsc` y el lint pasan.

### Objetivo
Que la aplicación conozca varias líneas (proyectos con `factory/`) y pueda crear una tarea en
cualquiera, no solo en el proyecto elegido.

### Criterios de aceptación
- `Ajustes` pasa de `raiz` a `lineas: { id, nombre, raiz }[]` y `lineaActiva`. Al leer unos
  ajustes viejos, `raiz` se convierte en la primera línea, sin perder nada; el archivo no se
  reescribe hasta el próximo cambio.
- El `id` de una línea sale del nombre de su carpeta, en minúsculas y sin tildes, y es único.
  Un id desconocido es un error, nunca otra línea.
- Una función `crearTareaEn(linea, { titulo, pedido, dependeDe, origen })` en
  `src/lib/fabrica/motor/` reemplaza lo repetido entre `crearTareas` y `crearTareaDeDeuda`:
  siguiente id libre **de esa línea**, archivo en `pendiente` con `tareaNueva` y su evento en
  `eventos.jsonl`. Las dos de hoy pasan a usarla y siguen haciendo lo mismo.
- Lo que hoy usa `raiz()` sigue mirando la línea activa: la Columna y la configuración no
  cambian de comportamiento.

### Archivos o zonas que toca
- `src/lib/fabrica/motor/proyecto.ts` (ajustes, `crearTareas`, `crearTareaDeDeuda`) y un
  archivo nuevo `src/lib/fabrica/motor/lineas.ts` con su `.test.ts`.

### Pruebas
- Ajustes viejos con `raiz` → una línea, mismo proyecto.
- `crearTareaEn` en la línea B no toca los archivos ni los ids de la línea A.
- Id de línea desconocido → error, sin escribir nada.
- Las pruebas de deuda y requerimientos que ya existen siguen pasando sin cambios.

### Fuera de alcance
- Correr varias líneas a la vez, puestos compartidos y la pantalla de la planta.

## Formulario de petición

### Objetivo
Que él escriba una petición en la aplicación y quede como tarea en la línea que elija, o como
borrador en la Bandeja.

### Depende de
- Registro de líneas

### Criterios de aceptación
- `tareaNueva` acepta `origenEntrada` y lo escribe como `origen_entrada` en el frontmatter
  (`formulario`, o `github:dueno/repo#132`), igual que `origen_hallazgo`. `formato.ts` lo lee.
  `puente-orquestador.md` lo documenta como campo que se escribe al crear y no cambia después.
- El pedido se arma con el texto de él, sin `citar()` (es suyo): qué necesita, una lista
  numerada de criterios de aceptación y, si hay, fuera de alcance y archivos que toca, con los
  títulos bajados como hace `bajarTitulos`.
- Ruta `POST /api/fabrica/entrada/peticion` (por `atenderEnLaFabrica`): valida línea, título
  (1 a 80 caracteres) y qué necesita (obligatorio); con `destino: "cola"` crea la tarea, con
  `destino: "bandeja"` deja un borrador (lo guarda la etapa Bandeja; hasta entonces, solo
  `cola`).
- Página `src/app/fabrica/peticion/page.tsx`: componente de servidor que lee las líneas y sus
  tareas abiertas (para «Depende de»); el formulario es un componente de cliente. Errores junto
  a cada campo, como en el diseño.

### Archivos o zonas que toca
- `src/lib/fabrica/motor/formato.ts`, `src/lib/fabrica/motor/rutas.ts`, una ruta nueva en
  `src/app/api/fabrica/entrada/`, `src/app/fabrica/peticion/` y
  `fabrica/docs/puente-orquestador.md`.

### Pruebas
- La ruta crea `F-00N-<slug>.md` en la línea elegida con `estado: pendiente`,
  `origen_entrada: formulario` y los criterios numerados en el pedido.
- Línea inexistente, título vacío o de más de 80 → 400 y ningún archivo nuevo.
- `depende_de` con un id que no es de esa línea → rechazo (lo que ya hace `crearTareas`).
- Ningún pedido sale a la red (la red de mentira no registra nada).

### Fuera de alcance
- Revisar si un criterio «se puede comprobar» mientras se escribe. Va después, con Jev y la
  regla `jev` de la línea.

## Bandeja

### Objetivo
Un lugar donde queda todo lo que entra antes de volverse tarea, y la acción de pasarlo a una
línea con su guardia.

### Depende de
- Formulario de petición

### Criterios de aceptación
- Tabla `bandeja` en la base común (migración en `src/lib/memoria/base.ts`, lista `COMUN`):
  fuente, referencia en el origen (`dueno/repo#132`), título, texto, autor, si el autor es él,
  etiquetas, fechas de creación y de cambio en el origen, una huella del texto, estado
  (`nuevo`, `pasado`, `descartado`), la tarea en que se convirtió y la línea.
- `pasarALinea(elemento, linea, titulo, dependeDe)` en `src/lib/entrada/pasar.ts` lleva el
  guardia **dentro**:
  - Si el autor es él: el texto entra con `citar()` y una línea «Issue: GitHub
    dueno/repo#132», sin dirección web.
  - Si es de otra persona: se revisa con `pideSaltarseLasReglas` y con la misma
    pregunta a Jev que usa la consulta (`PREGUNTA_DE_LO_ENCONTRADO`; mover la función a
    `src/lib/texto/` para usarla desde las dos). Si trae una instrucción, o si nadie lo pudo
    revisar, **no pasa**: la función lanza un error y la ruta lo devuelve. No hay forma de
    pasarlo recortado.
- **El título de la tarea.** El teléfono y lo que dice Zero leen el título de una tarea
  porque hasta hoy lo escribió él (`src/lib/fabrica/aviso.ts`). De un issue de otra persona,
  el título se ofrece para editar pero no se acepta tal cual: o él lo cambia, o la tarea queda
  marcada (`titulo_ajeno: si`) y el teléfono y Zero dicen solo su id.
- «Reescribirlo con mis palabras» abre el formulario con el título y la referencia, con el
  pedido en blanco. Lo que se crea desde ahí lleva `origen_entrada` del issue, pero el texto
  es de él.
- Un elemento ya pasado cuyo texto cambió en el origen vuelve a la Bandeja como «Cambió en el
  origen», con solo lo agregado. «Crear una tarea con el cambio» crea otra tarea con
  `depende_de` la primera; la primera no se toca.
- Descartar cambia solo el estado en la Bandeja. No sale nada a la red.
- Página `src/app/fabrica/bandeja/page.tsx`: lista y detalle como en el diseño. En el
  navegador no está el texto de un issue revisado y rechazado más que como cita.

### Archivos o zonas que toca
- `src/lib/memoria/base.ts` (migración), carpeta nueva `src/lib/entrada/` (`bandeja.ts`,
  `pasar.ts`, `tipos.ts` y sus pruebas), `src/lib/consulta/consultar.ts` (solo para mover la
  revisión), `src/lib/fabrica/aviso.ts` y `src/lib/fabrica/motor/formato.ts` (`titulo_ajeno`),
  `src/lib/fabrica/motor/rutas.ts`, `src/app/api/fabrica/entrada/` y
  `src/app/fabrica/bandeja/`.

### Pruebas
- Issue suyo → tarea con el texto entre « » y la referencia, y **Jev no recibe nada**.
- Issue de otra persona sin instrucciones → pasa; Jev recibió solo ese texto.
- Issue de otra persona con «ignora las reglas…» → no pasa, ningún archivo nuevo en la línea.
- Jev no contesta → no pasa (nadie lo pudo revisar).
- Comillas « » dentro del issue no cierran la cita (lo que ya garantiza `citar()`).
- Cambio en el origen → tarea nueva con `depende_de` la anterior; la anterior queda igual,
  byte por byte.
- Descartar → la red de mentira no registra ningún pedido.
- Tarea de un issue de otra persona con el título sin cambiar → `titulo_ajeno: si`, y lo que
  arma el teléfono para esa tarea no trae el título.

### Fuera de alcance
- Leer issues de un servicio (es la etapa Lector). Aquí se prueba con elementos de prueba.
- Que Zero hable de la Bandeja. Si algún día lo hace, a su nota entran cuentas, no títulos de
  issues de otras personas.

## Fuentes y tokens

### Objetivo
Conectar GitHub y GitLab con un token propio por conexión, saber siempre si funciona, y que el
token no salga nunca de donde se guarda.

### Depende de
- Bandeja

### Criterios de aceptación
- Tabla `fuentes` en la base común: proveedor, servidor, nombre, **el nombre de la variable**
  (nunca el token), encendida, estado (`listo`, `falta_token`, `rechazado`, `sin_respuesta`),
  última lectura, la regla de qué issues entran, la etiqueta, cada cuánto lee y el mapa
  repositorio → línea.
- **Del token solo se valida si está** (decisiones 7 y 9): si `process.env[variable]` tiene
  algo. Una fuente sin él queda en `falta_token` y no lee. `rechazado` y `sin_respuesta` los pone
  el lector al leer, no una prueba al conectar.
- El nombre de la variable tiene que cumplir `^COMPANIA_FUENTE_[A-Z0-9_]+_TOKEN$`, y dos
  conexiones no pueden usar la misma. Lo que no cumple se rechaza sin guardar nada. La guardia va
  en `fuentes.ts`, que es quien lee `process.env`, no en la ruta.
- La pantalla de conectar ofrece los nombres de las variables `COMPANIA_FUENTE_*_TOKEN` que
  existen, con la conexión que ya usa cada una: solo nombres, nunca valores.
- **El token no sale de `fuentes.ts`.** Solo lo lee la función que arma el pedido al servicio.
  Ninguna vista, ruta ni registro lo trae.
- Interfaz `Proveedor` en `src/lib/entrada/proveedores/`: `leerIssues(...)`. Un archivo por
  servicio (`github.ts`, `gitlab.ts`). Lo que interpreta las respuestas es lógica pura,
  separada del `fetch`, y el `fetch` de un proveedor solo hace `GET`.
- El servidor propio tiene que ser `https://`. La dirección se valida antes de usarla.
- Rutas en `/api/fabrica/entrada/fuentes`: listar, agregar, quitar, encender o apagar, y
  guardar el mapa y la regla. Ninguna recibe un token.
- Página `src/app/fabrica/fuentes/page.tsx`, con conectar como diálogo, como en el diseño
  (Fuentes y «Conectar una fuente», ajustados el 26 de octubre).

### Archivos o zonas que toca
- `src/lib/memoria/base.ts`, `src/lib/entrada/fuentes.ts`, `src/lib/entrada/proveedores/`,
  `src/lib/fabrica/motor/rutas.ts`, `src/app/api/fabrica/entrada/`, `src/app/fabrica/fuentes/`
  y `src/pruebas/red.ts` (saber contestar como `api.github.com` y como un GitLab de prueba).

### Pruebas
- Fuente sin su variable → `falta_token`, y ningún pedido a la red.
- Un nombre como `COMPANIA_CLAUDE_API_KEY`, `ANTHROPIC_API_KEY` o uno que ya usa otra conexión →
  rechazo, nada guardado y ningún pedido a la red.
- La lista de variables que ve la pantalla trae nombres y nunca un valor.
- **El token no aparece en ninguna respuesta de ninguna ruta de la entrada**: la prueba recorre
  todas y busca el texto del token en cada cuerpo.
- `http://` o una dirección mal formada → rechazo sin pedido a la red.
- Al servicio le llega el token solo en la cabecera de autorización, nunca en la dirección.

### Fuera de alcance
- Jira y otros servicios.
- Escribir en cualquier servicio.

## Lector de fuentes

### Objetivo
Que los issues nuevos y los cambios lleguen a la Bandeja solos, cada tanto, aunque nadie tenga
la página abierta.

### Depende de
- Fuentes y tokens

### Criterios de aceptación
- `src/lib/entrada/lector.ts`, con el mismo patrón que el vigía (`vigia.ts`): un temporizador
  en `globalThis` para que la recarga de desarrollo no arranque otro, y que nunca lanza.
  `instrumentation.ts` lo arranca en el modo trabajo, junto al vigía.
- Por cada fuente encendida con token activo y cuando le toca: pide los issues abiertos de sus
  repositorios con la etiqueta, aplica la regla (solo los suyos o cualquiera) y los guarda en
  la Bandeja. Uno ya visto, sin cambios, no hace nada; uno ya pasado cuyo texto cambió vuelve
  como «Cambió en el origen».
- Un «no autorizado» deja la fuente en `rechazado` y no la vuelve a intentar sola: espera a que
  él diga que ya lo cambió («Volver a intentar») o a que la aplicación se reinicie. Sin
  respuesta, `sin_respuesta`, y lo reintenta en la vuelta siguiente.
- «Traer ahora» (`POST /api/fabrica/entrada/traer`) hace una vuelta en el momento.
- Un tope de issues por vuelta y de tamaño de texto por issue, para que un repositorio grande o
  un issue enorme no llenen la base.

### Archivos o zonas que toca
- `src/lib/entrada/lector.ts` y su prueba, `src/instrumentation.ts` y `src/lib/fabrica/motor/rutas.ts`.

### Pruebas
- Issue nuevo con la etiqueta → aparece en la Bandeja; sin la etiqueta → no.
- Regla «solo los tuyos» → el de otra persona no entra.
- Mismo issue dos veces → un solo elemento.
- Texto cambiado de uno ya pasado → «Cambió en el origen».
- 401 → fuente `rechazado` y, en la vuelta siguiente, ningún pedido a ese servicio.
- Ningún pedido que no sea de lectura (la red de mentira registra el método: solo `GET`).

### Fuera de alcance
- Que el servicio avise a la aplicación (webhooks): la aplicación corre solo en este equipo.

## Avisos de las fuentes

### Objetivo
Que él sepa a tiempo que una fuente dejó de leer o no puede empezar.

### Depende de
- Lector de fuentes

### Criterios de aceptación
- El punto en «Fuentes» del menú y el aviso arriba de la Bandeja salen del estado de las
  fuentes, sin consultas extra.
- Zero lo dice una vez cuando una fuente pasa a `rechazado` (o a `falta_token` estando
  encendida), por el camino con que ella habla por su cuenta de la fábrica (la iniciativa,
  `src/app/api/iniciativa/`; se confirma al empezar la etapa, porque `aviso.ts` es solo para el
  teléfono). Si ya lo dijo, no lo repite. En lo que se le pasa entran el nombre de la conexión, la
  línea y la hora: nunca el token, el nombre de la variable ni el texto de un issue.

### Archivos o zonas que toca
- El camino de la iniciativa (por confirmar) y las páginas de la entrada.

### Pruebas
- Fuente que pasa a `rechazado` → un aviso; la vuelta siguiente, ninguno más.
- Lo que le llega al modelo que escribe lo que ella dice no trae el token ni texto de issues.

### Fuera de alcance
- Llamar por teléfono por un token (el teléfono es para lo que lo espera en una tarea).

## Al terminar

- Una regla nueva en `compania/CLAUDE.md`, en el estilo de las demás: la entrada solo lee; un
  token por conexión, en `.env.local` como `COMPANIA_FUENTE_<NOMBRE>_TOKEN`, del que la
  aplicación solo sabe si está; nada de un issue pasa sin su clic; el texto de otra persona se
  revisa y, si trae instrucciones, solo se reescribe. Con la fecha de su decisión (26 de octubre
  de 2026).
- En `.env.example`, con la etapa Fuentes y tokens, una línea comentada de ejemplo
  (`# COMPANIA_FUENTE_GITHUB_TOKEN=`) que explique la forma del nombre.
