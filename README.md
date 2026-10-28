# La fábrica

Una fábrica de software con Claude Code. Cada **línea** es un repositorio con git y su cola de
tareas; la **planta** las muestra todas a la vez. Cada tarea pasa por spec, construcción,
revisión, verificación y aprobación, con agentes de Claude Code que corren en este equipo con tu
sesión (tu suscripción), en worktrees aparte. Nada se integra a la rama principal sin que lo
decidas tú, salvo lo que tú mismo dejes integrarse solo.

> Estado: en construcción. Este repositorio sale de la fábrica de otra aplicación y se está
> preparando para compartir (ver «Lo que falta», abajo).

## Lo que necesitas

- Node 22.5 o más nuevo (usa `node:sqlite`).
- git.
- Claude Code, con tu sesión iniciada.

Ninguna variable de entorno hace falta para empezar. Las que suman algo están en `.env.example`,
con lo que permite cada una.

## Levantarla

```bash
npm install
npm run dev     # http://127.0.0.1:3000
npm test        # las pruebas, con el corredor de Node: sin red y sin claves de verdad
```

Las corridas usan el `claude` del PATH de la terminal desde donde levantas la aplicación. Si
quieres otro, o no está en el PATH, pon su ruta en `COMPANIA_CLAUDE_CODE_BIN`, en `.env.local`.
**Este equipo** (en el menú) dice qué encontró, si tu sesión de Claude Code está iniciada, y qué
más puede usar la fábrica: `gh` y `glab`, Jev, los tokens de las fuentes, el teléfono, Codex y
Antigravity, con qué agregar si falta.

## Qué hay

| Dónde | Qué es |
| --- | --- |
| `src/app/fabrica/` | Las pantallas: la planta, las líneas, las tareas, la Bandeja, la nueva petición, las fuentes y la memoria |
| `src/app/configuracion/` | La configuración: las líneas, los agentes y sus modelos, el gasto, las tareas y los avisos |
| `src/app/api/fabrica/` | Las rutas que usan esas pantallas |
| `src/lib/fabrica/motor/` | El motor: lee el `factory/` de cada línea, lanza las corridas con Claude Code y lleva el vigía |
| `src/lib/fabrica/procesos/` | Los procesos: comandos, salud, push con su PR, integración continua, fusión, producción, el vigía de vulnerabilidades y la evaluación |
| `src/lib/fabrica/memoria/` | La memoria de la fábrica: el vault de cada línea (`factory/memoria/`, en su repositorio) y el de la planta (`datos/memoria/`) |
| `src/lib/fabrica/habilidades/` | Las habilidades y especialidades de cada línea |
| `src/lib/entrada/` | La Entrada: el formulario de petición, la Bandeja y las fuentes (GitHub y GitLab, en solo lectura) |
| `src/lib/fabrica/equipo.ts` | «Este equipo»: qué piezas tiene este equipo, qué permite cada una y qué agregar |
| `src/lib/datos.ts` | La carpeta `datos/` de este equipo y su base SQLite |
| `src/proxy.ts` y `src/lib/servidor/` | El guardia de quién puede llamar a las rutas |
| `src/pruebas/` | Las pruebas de las rutas: una carpeta aparte, claves de mentira y una red de mentira que anota qué le llegó a quién |
| `fabrica/` | El plugin de Claude Code que usan las corridas: sus agentes, sus comandos y el mod que cuida cada paso. Ver `fabrica/README.md` |
| `datos/` | Lo de este equipo: ajustes, corridas, registros de los procesos y el vault de la planta. No entra al repositorio |

## Lo que falta

1. **Nada se cae:** avisar antes de correr un proceso qué pasos no van a poder, pantallas de error
   propias, y las pruebas también con el entorno vacío.
2. **El plugin solo,** instalable desde el repositorio.
3. **Instalarla:** este README para quien la reciba, y una prueba de punta a punta en un equipo sin
   ninguna variable.

Los documentos de `fabrica/docs/` son los planes con que se construyó la fábrica en la aplicación
de origen: cuentan por qué es como es.
