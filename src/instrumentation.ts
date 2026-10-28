/**
 * Lo que arranca con el servidor: el vigía de la fábrica, que hace sonar el teléfono cuando algo
 * te espera aunque nadie tenga la página abierta (ver `lib/fabrica/motor/vigia.ts`), y el lector
 * de la Entrada, que trae los issues de las fuentes a la Bandeja (ver `lib/entrada/lector.ts`).
 * Solo en Node: los dos leen archivos.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Claude Code se busca en el PATH una sola vez, al arrancar (ver `lib/fabrica/motor/claude-code.ts`).
  const { claudeCodeDeEsteEquipo } = await import("./lib/fabrica/motor/claude-code");
  claudeCodeDeEsteEquipo();
  const { asegurarVigia } = await import("./lib/fabrica/motor/vigia");
  asegurarVigia();
  const { asegurarLector } = await import("./lib/entrada/lector");
  asegurarLector();
}
