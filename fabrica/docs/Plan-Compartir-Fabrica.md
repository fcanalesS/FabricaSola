# Compartir la fábrica v2

**Qué es.** Un programa aparte, para que otras personas usen la fábrica de software v2 (varias
líneas, la planta, una línea, las tareas, la Entrada, la memoria, las habilidades y los procesos)
con su propia sesión de Claude Code, sin configurar nada para empezar. Lo que necesite algo más
queda apagado, con un mensaje que dice qué falta, hasta que esa persona lo agregue.

**Lo decidió él el 27 de octubre de 2026:**
- se comparte la fábrica v2, no la compañera;
- es más fácil un programa aparte que modificar esta aplicación: esta sigue siendo la suya, con
  Zero y todas sus piezas;
- todo corre con la sesión de Claude Code de quien lo use; lo que no se puede, queda apagado hasta
  que agregue su variable;
- la CI/CD la hace GitLab: Hermes no hace falta para desplegar (queda, si acaso, para reportería
  automatizada).

## Lo que dice el inventario (27 de octubre de 2026)

Ninguna ruta se cae por una variable que falte: todas contestan un error manejado o un motivo. Lo
que importa para la fábrica:

| Lo que falta | Hoy | En el programa compartido |
|---|---|---|
| `COMPANIA_MODO=trabajo` | La fábrica no existe: sus páginas dan 404 y sus rutas, 403 | No existe el modo: el programa es la fábrica |
| `COMPANIA_CLAUDE_CODE_BIN` | Se configura, pero no corre (409 con su motivo) | Ver la decisión 1 |
| `TYPESAFE_AI_KEY` (Jev) | Se gasta: pruebas y revisores siempre, spec siempre, modelo de siempre; toda tarea aprobada es grande | Igual: funciona entero, solo más caro y con más pruebas a mano |
| `COMPANIA_GH_BIN` / `COMPANIA_GLAB_BIN` | El push empuja y dice que el PR no se abrió; `ci` y `fusion` fallan al correr, sin aviso antes | El proceso dice antes de correr qué pasos no van a poder, y no se puede encender solo |
| `COMPANIA_FUENTE_<NOMBRE>_TOKEN` | La fuente dice «falta el token» | Igual |
| `COMPANIA_PROCESO_<LINEA>_<NOMBRE>` | Falla al correr; si lo arrancó el vigía, en silencio | Se avisa antes; lo que el vigía no pudo correr queda registrado con su motivo |
| Telnyx (el teléfono) | Configuración nombra lo que falta | Igual, sin la voz del personaje: al contestar suena el audio fijo, o nada |
| `COMPANIA_CODEX_BIN` / `COMPANIA_ANTIGRAVITY_BIN` | No se pueden encender, con su aviso | Igual |
| Una excepción en una página | La pantalla genérica de Next (no hay `error.tsx`) | Una pantalla propia que dice qué pasó y cómo seguir |

**Lo que no va al programa compartido**, porque es de Zero o usa la API con clave:
- lo que ella dice de la fábrica (sus dictámenes, «lo último que dijo», su voz en el teléfono);
- pedirle cosas a la fábrica conversando (las órdenes con Jev);
- la cuenta del gasto de la API y el informe de costos de administrador.

## Decisiones

Las cuatro primeras son suyas. Las demás son mis recomendaciones.

1. **Encontrar Claude Code sin configurar nada** (decisión suya, 27 de octubre de 2026). En el
   programa compartido, la ruta de `COMPANIA_CLAUDE_CODE_BIN` si está; si no, `claude` en el
   PATH, una sola vez al arrancar, y la ruta que encontró se muestra en «Lo que tiene este
   equipo». Esta aplicación sigue con su regla del 17 de octubre: solo por su ruta exacta.
2. **Dónde vive** (decisión suya, 27 de octubre de 2026): en `C:\proyectos\TableroZero\FactoriaSola`,
   con un repositorio git local por ahora; el remoto lo pone él después. Es un repositorio aparte,
   con el plugin `fabrica/` adentro. El código de la fábrica se copia de esta aplicación: queda
   duplicado, y por un tiempo lo que se arregle en uno hay que llevarlo al otro.
3. **Sin Jev, igual que hoy**: se gasta más y toda tarea aprobada es grande. No se cambia por
   `claude -p`: Jev contesta en 0,3 s y Claude Code tarda segundos en arrancar.
4. **Sin Jev, un issue de otra persona no pasa a una línea** (como hoy: si nadie lo pudo revisar,
   no pasa). Quien lo use lo reescribe con sus palabras. Revisarlo con Claude Code queda para
   después, si hace falta.
5. **Una pantalla, «Lo que tiene este equipo»**, con todo lo que la fábrica puede usar: Claude
   Code (y su sesión), git, `gh`, `glab`, Jev, los tokens de las fuentes, el teléfono, Codex y
   Antigravity. De cada uno: si está, qué permite, y qué agregar si falta. Hoy eso está repartido
   en cuatro pantallas.
6. **Nada se cae.** Cada pieza opcional se mira antes de usarla; las páginas tienen su
   `error.tsx`; las pruebas corren también con el entorno vacío.
7. **El plugin funciona solo.** Hoy la aplicación le arma a la corrida los agentes con
   habilidades, Label y el retrabajo. Sin la aplicación, el plugin usa sus agentes de siempre;
   en el programa compartido los arma igual que aquí.
8. **El `[ci]` después de la fusión.** Vale también para esta aplicación: después de fusionar,
   `glab` dice cuál quedó como commit de la fusión, y un `[ci]` puesto después de `[fusion]`
   espera ese pipeline, que en GitLab es el que despliega.

## Orden

1. **El `[ci]` después de la fusión,** en esta aplicación. Es chico, y el programa compartido lo
   copia con lo demás.
2. **El programa, sin la compañera:** el repositorio local en `FactoriaSola`, las pantallas de la v2, el motor, la
   Entrada, la memoria, las habilidades, los procesos y el plugin. Sin modo, sin Zero, sin la
   API.
3. **Claude Code sin configurar** (según la decisión 1) **y «Lo que tiene este equipo».**
4. **Nada se cae:** los avisos antes de correr, el vigía que registra lo que no pudo, las
   pantallas de error, y las pruebas con el entorno vacío.
5. **El plugin solo,** instalable desde el repositorio.
6. **Instalarlo:** el README para quien lo reciba (Node, git y Claude Code con su sesión; `npm i`
   y `npm run dev`), y una prueba de punta a punta en un equipo sin ninguna variable.

## 1. El `[ci]` después de la fusión: cómo quedó (27 de octubre de 2026)

- **Al fusionar**, el paso le pregunta al servicio qué commit quedó en la base
  (`argumentosDelCommitFusionado` y `commitFusionadoDe`, en `procesos/fusion.ts`): en GitHub,
  `mergeCommit`; en GitLab, el de la fusión, el aplastado o, sin commit propio, el último del MR.
  Lo dice en su nota («Fusionó el PR #8 en main (commit c1a2…)»).
- **Un `[ci]` después de `[fusion]`** espera el pipeline de ese commit y no el del empujado, y lo
  dice («La integración continua de main pasó»). Si el servicio no dijo qué commit quedó, la
  fusión vale, pero ese paso falla con el motivo: no hay nada que esperar.
- **Verificado:** las pruebas con un `gh` de mentira (espera el de main después del empujado, y el
  caso sin commit), `tsc` y `lint`. No se probó contra GitLab de verdad.

## 2. El programa, sin la compañera: cómo quedó (27 de octubre de 2026)

- **Dónde:** `C:\proyectos\TableroZero\FactoriaSola`, con su repositorio git local (rama `main`,
  sin remoto y sin commits todavía). Se llama «La fábrica» (`src/app/layout.tsx`); la portada
  lleva a la planta.
- **Lo que se copió:** las pantallas de la v2 (`src/app/fabrica/`), sus rutas
  (`src/app/api/fabrica/`), los componentes de la fábrica, la Entrada y la memoria, la parte de la
  fábrica de la configuración, `src/lib/fabrica/`, `src/lib/entrada/`, el cliente de Jev, `citar`,
  `traeInstrucciones`, el guardia de origen (`proxy.ts`), el arranque (el vigía y el lector), las
  pruebas, el plugin `fabrica/` y `scripts/fabrica/`.
- **Lo que se cortó:** el modo (las rutas ya no contestan 403 ni las páginas 404), el personaje
  (su paleta, `?personaje=` en cada enlace, «Volver con ella»), lo que ella dijo de la fábrica
  (`planta/ella.ts`, el dictamen, sus órdenes y respuestas conversando, la sesión que sigue, lo que
  cuenta de las fuentes caídas), la ruta raíz y las de cambios, historial, sesiones e informe, que
  usaba solo la columna de la compañera, y la voz del teléfono: al contestar suena
  `COMPANIA_TELNYX_AUDIO_URL` o nada.
- **Los datos:** en `datos/` (fuera del repositorio), con su propia base (`src/lib/datos.ts`) y solo
  las tablas de la Entrada (`fuentes` y `bandeja`). Lo que aquí va en `comun/fabrica/`, allá va en
  `datos/`.
- **Las variables** siguen llamándose `COMPANIA_…`, para que el código de los dos repositorios siga
  igual y un arreglo pase de uno al otro sin cambios. `.env.example` trae solo las de la fábrica.
- **La configuración** es su propia página (`/configuracion`), con la sección de la fábrica.
- **Verificado:** `tsc`, el lint y las 249 pruebas (3 saltadas, como aquí); en el navegador, cada
  pantalla vacía en un equipo sin variables, y la planta y una línea con una tarea de un
  repositorio desechable. Ninguna corrida.
- **Queda para las etapas siguientes:** Claude Code por el PATH y «Lo que tiene este equipo» (3);
  los avisos antes de correr y las pantallas de error (4). Los planes de `fabrica/docs/` viajan
  tal cual: cuentan cómo se decidió cada cosa, y todavía hablan de la compañera.

## Cómo se prueba

- Las pruebas de cada parte, sin red, como aquí, y además con el entorno vacío.
- Una corrida de verdad en un equipo limpio (o una carpeta de usuario nueva), con solo Claude Code
  y su sesión: gasta, se pregunta antes.
- En el navegador, solo mirando.
