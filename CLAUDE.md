@AGENTS.md

## Qué es esto

La fábrica de software v2, como programa aparte para compartir: la planta, las líneas, las
tareas, la Entrada, la memoria, las habilidades y los procesos, con el plugin `fabrica/`. Sale de
la aplicación de compañía (`../compania/`), que sigue siendo otra cosa: aquí no hay personaje, ni
modo, ni la API de Claude. El plan está en `fabrica/docs/Plan-Compartir-Fabrica.md`. `README.md`
dice cómo levantarla y qué hay en cada carpeta.

Por un tiempo el código de la fábrica está en los dos repositorios: lo que se arregle en uno hay
que llevarlo al otro.

## Reglas del proyecto

- **Todo en español neutro, sin voseo y con tildes**: comentarios, interfaz, documentación y
  mensajes de commit. Los identificadores y los datos guardados van sin tilde. La interfaz le
  habla a quien la usa, de tú.
- **Todo corre con la sesión de Claude Code de quien la usa.** No se usa la API de Claude ni una
  clave suya. Lo que necesite algo más (Jev, `gh`, `glab`, un token, el teléfono) queda apagado,
  con un mensaje que dice qué falta, hasta que se agregue su variable.
- **`.env.local` no se lee ni se copia.** Si hace falta saber qué hay, se pregunta por el nombre
  de la variable.
- **`datos/` no entra al repositorio.** Es lo de cada equipo.
- **Un guardia va pegado a lo que protege, no en quien llama.**
- **Las rutas se prueban sin red** (`src/pruebas/`): cada archivo de pruebas corre en una carpeta
  recién hecha, con claves de mentira y una red de mentira que falla ante cualquier dirección que
  no conozca. Una ruta nueva, o un guardia nuevo en una ruta, lleva su prueba.
- Las reglas de la fábrica (la Entrada solo lee, nada pasa a una línea sin su clic, la memoria de
  la fábrica la escribe la persona, los procesos los corre el código, la fusión, producción con su
  clic, los tokens solo se nombran) son las mismas que en la aplicación de origen: están en los
  comentarios de cada módulo y en `fabrica/README.md`.

## Comandos

```bash
npm run dev               # Next 16, solo en 127.0.0.1
npm test                  # lógica pura y rutas, con `node --test`; sin red
npm run fabrica:e2e       # la fábrica de punta a punta con git de verdad en un repo desechable. Gasta: pregunta antes
npm run fabrica:corrida-real   # una corrida de verdad con sus agentes. Con -- --correr gasta: pregunta antes
npx tsc --noEmit
npm run lint
```
