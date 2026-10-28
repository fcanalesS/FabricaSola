---
description: "Fábrica: muestra qué agente hace cada etapa y crea copias editables de los agentes de fábrica"
argument-hint: "[copiar <rol> [usuario] | restaurar <rol>]"
---

# Fábrica — agentes por rol

Argumentos: $ARGUMENTS

Carga la herramienta con ToolSearch `select:mcp__fabrica__agentes` si no la tienes.

## Sin argumentos: mostrar

Llama a `mcp__fabrica__agentes` con `accion: "listar"`. Para cada rol, mira cuál de sus
`candidatos` existe entre **tus** tipos de agente disponibles en esta sesión (el primero que
exista es el que usará `/fabrica:correr`), y muestra una tabla:

| Rol | Config | Lo hace | De dónde viene |
|---|---|---|---|

"De dónde viene": `fabrica` (del plugin), otro plugin por su prefijo, o "proyecto /
usuario" si es un nombre sin prefijo (una copia en `.claude/agents/`).

Debajo, en dos líneas: cómo personalizar uno (`/fabrica:agentes copiar <rol>`) y que también se
pueden crear y editar en la aplicación, en Configuración › Agentes y modelos («Personalizar»).

## `copiar <rol> [usuario]`

Llama a `mcp__fabrica__agentes` con `accion: "copiar"`, el `rol` y `destino: "usuario"` si viene
esa palabra (si no, `"proyecto"`).

- **proyecto** (por defecto): `.claude/agents/` del proyecto. Viaja con el repositorio, así que
  quien clone el proyecto usa los mismos agentes. Es lo recomendable para un equipo.
- **usuario**: `~/.claude/agents/`. Vale para todos tus proyectos, solo en este equipo.

Muestra la ruta del archivo creado y recuerda que **Claude Code lee los agentes al empezar la
sesión**: la copia se usa desde la próxima sesión.

## `restaurar <rol>`

`accion: "restaurar"`. El rol vuelve a `auto`; la copia editable no se borra (dilo, por si la
quieren borrar a mano).

Roles válidos: `spec`, `construccion`, `revision_codigo`, `revision_seguridad`, `ui`,
`aprobacion`. Si el rol que escribieron no es uno de esos, muéstralos y no llames a la herramienta.
