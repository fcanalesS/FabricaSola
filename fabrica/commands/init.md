---
description: "Fábrica: prepara este proyecto — crea factory/ con config.md detectando build, test y lint"
argument-hint: "[--forzar]"
---

# Fábrica — preparar el proyecto

Argumentos: $ARGUMENTS

Deja este proyecto listo para la fábrica. El estado vive en `factory/` en la raíz del proyecto
(la raíz de la sesión, no la carpeta actual de la shell).

## 1. Si ya existe

Si `factory/config.md` ya existe y los argumentos no traen `--forzar`, no lo pises: muestra su
contenido, di qué falta (comandos vacíos, rama base que no existe) y termina.

## 2. Detectar el proyecto

Mira la raíz (y un nivel abajo si la raíz no dice nada) y deduce los comandos. No inventes:
cada comando que pongas tiene que existir en el proyecto.

| Si hay | build | test | lint |
|---|---|---|---|
| `*.sln` / `*.slnx` / `*.csproj` | `dotnet build <sln> --nologo -v q` | `dotnet test <sln> --nologo -v q` **solo si hay proyectos de pruebas** (referencian xunit/nunit/mstest) | vacío |
| `package.json` | `npm run build` si existe el script | `npm test` si existe el script y no es el placeholder de npm | `npm run lint` si existe |
| `pyproject.toml` / `requirements.txt` | vacío | `pytest -q` si hay tests | `ruff check .` si ruff está configurado |
| `Cargo.toml` | `cargo build` | `cargo test` | `cargo clippy -- -D warnings` |
| `go.mod` | `go build ./...` | `go test ./...` | `go vet ./...` |

Si hay varias soluciones o no queda claro cuál es la principal, **pregunta** con AskUserQuestion.
Si no reconoces nada, pregunta los comandos una vez. Si el proyecto no tiene pruebas, dilo
claramente: la verificación quedará solo en compilar, y conviene saberlo.

Lee también `CLAUDE.md` del proyecto si existe: si fija convenciones o comandos propios, mandan
sobre la tabla.

## 3. Git y worktrees

- `git rev-parse --show-toplevel` para saber si es un repo. Si no lo es, la fábrica trabajará
  en la carpeta directamente y **sin paralelo**: déjalo escrito en `config.md` (`paralelo_max: 1`,
  `worktrees:` vacío) y avísalo.
- Si es repo: la rama base es la rama actual por defecto (`git branch --show-current`). Los
  worktrees van **fuera** del repo, en una carpeta hermana: `../<nombre-del-repo>-fabrica`
  (dentro del repo confundiría al build: .NET compila carpetas anidadas).

## 4. Escribir

Crea:

- `factory/tareas/` (vacía; pon un `.gitkeep`)
- `factory/veredictos/` (vacía; pon un `.gitkeep`)
- `factory/config.md` con este formato exacto (frontmatter plano, una clave por línea):

```markdown
---
build: <comando o vacío>
test: <comando o vacío>
lint: <comando o vacío>
rama_base: <rama>
max_vueltas: 3
paralelo_max: 2
ui: auto
aprobacion: agente
puente_url:
worktrees: <ruta relativa o absoluta, o vacío>
agente_spec: auto
agente_construccion: auto
agente_revision_codigo: auto
agente_revision_seguridad: auto
agente_ui: auto
agente_aprobacion: auto
---

# Fábrica de este proyecto

Notas para los agentes: convenciones, carpetas que no se tocan, skills del proyecto que deben
usar (por ejemplo una skill de base de datos), lo que sea útil y no esté en CLAUDE.md.
```

Significado de cada clave, por si el usuario pregunta:

- `ui`: `auto` revisa UI/UX solo si el diff toca vistas o estilos; `si` siempre; `no` nunca.
- `aprobacion`: `agente` (el agente del rol de aprobación), `externa` (un orquestador de fuera
  deja el veredicto en `factory/veredictos/<id>.json`) o `ambas`.
- `puente_url`: si se pone una URL http(s), el mod envía ahí (POST JSON) cada movimiento de tarea.
- `agente_<rol>`: qué agente hace cada etapa. `auto` usa los de nikke si están instalados y si no
  los que trae el plugin. `/fabrica:agentes` lo muestra y crea copias editables.

Al final, corre `/fabrica:agentes` (sin argumentos) para mostrar qué agente quedó en cada rol.

## 5. .gitignore

Pregunta con AskUserQuestion si `factory/` se versiona con el proyecto o no:

- **No versionar (recomendado)**: añade `factory/` al `.gitignore`.
- **Versionar**: añade solo `factory/eventos.jsonl` y `factory/veredictos/*.json`.

## 6. Cerrar

Muestra el `config.md` que quedó y di, en dos líneas, cómo seguir: `/fabrica:nueva "<pedido>"`
para crear una tarea, `/fabrica:correr` para procesar la cola, `/tablero` para verla.
