/**
 * Las reglas de la fábrica en un proyecto: las claves de su factory/config.md que no son comandos,
 * agentes ni modelos (esas tienen su propio lugar en la configuración). Se ven y se cambian desde
 * la configuración de la aplicación, para no editar el archivo a mano. Lo pidió él el 19 de octubre
 * de 2026. Cada una se lee con el mismo valor por defecto que el plugin
 * (fabrica/hooks/tareas.ts, `leerConfig`). Va aparte del motor porque la usa también la página.
 * Es lógica pura.
 */

export type DefinicionDeRegla =
  | { tipo: "opcion"; nombre: string; ayuda: string; opciones: readonly { valor: string; texto: string }[]; defecto: string }
  | { tipo: "entero"; nombre: string; ayuda: string; min: number; max: number; defecto: number }
  | { tipo: "texto"; nombre: string; ayuda: string; defecto: string; largo: number; marcador?: string };

export const REGLAS = {
  aprobacion: {
    tipo: "opcion",
    nombre: "Quién aprueba",
    ayuda: "Con «el agente», nadie te espera: decide el agente aprobador. Con «tú» o «los dos», cada tarea espera tu veredicto.",
    opciones: [
      { valor: "agente", texto: "El agente aprobador" },
      { valor: "externa", texto: "Tú, desde la aplicación" },
      { valor: "ambas", texto: "Los dos" },
    ],
    defecto: "agente",
  },
  integracion: {
    tipo: "opcion",
    nombre: "Al terminar",
    ayuda: "Integrar sola es un fast-forward en la rama de la que salió la tarea, en este equipo. Nunca hace push.",
    opciones: [
      { valor: "auto", texto: "Se integra sola en su rama" },
      { valor: "manual", texto: "Queda la rama para integrarla yo" },
    ],
    defecto: "auto",
  },
  max_vueltas: { tipo: "entero", nombre: "Vueltas de retrabajo", ayuda: "Pasadas estas, la tarea te espera.", min: 1, max: 10, defecto: 3 },
  ui: {
    tipo: "opcion",
    nombre: "Revisión de interfaz",
    ayuda: "En automático, solo si la tarea toca vistas, estilos o JS de cliente.",
    opciones: [
      { valor: "auto", texto: "Cuando toca vistas" },
      { valor: "si", texto: "Siempre" },
      { valor: "no", texto: "Nunca" },
    ],
    defecto: "auto",
  },
  jev: {
    tipo: "opcion",
    nombre: "Jev decide qué ahorrar",
    ayuda: "Si se corren las pruebas, qué revisores hacen falta, si se escribe la spec. Le llegan el título, el pedido y los archivos cambiados, nunca el código.",
    opciones: [
      { valor: "auto", texto: "Sí, si hay clave de Jev" },
      { valor: "no", texto: "No: se hace todo siempre" },
    ],
    defecto: "auto",
  },
  jev_control: { tipo: "entero", nombre: "Muestra de control", ayuda: "Una de cada tantas veces que Jev diría «sáltalo» en pruebas o seguridad, se hace igual para medirlo. 0: nunca.", min: 0, max: 50, defecto: 4 },
  lint_extensiones: { tipo: "texto", nombre: "Lint, solo estas extensiones", ayuda: "Con {archivos} en el lint: qué archivos de la tarea lintear. Vacío: todos.", defecto: "", largo: 200, marcador: ".js, .ts" },
  sql: { tipo: "texto", nombre: "Revisar los .sql", ayuda: "Un comando con {archivos}, por ejemplo sqlcmd con SET PARSEONLY ON. Sin credenciales: las toma del entorno. Vacío: quedan «sin verificar».", defecto: "", largo: 1000, marcador: "sqlcmd -S . -d prueba -E -b -i {archivos}" },
  worktrees: { tipo: "texto", nombre: "Carpeta de los worktrees", ayuda: "Fuera del repo (dentro confundiría al build). Vacío: sin worktrees, de a una tarea en la carpeta del proyecto.", defecto: "", largo: 400, marcador: "../proyecto-fabrica" },
} as const satisfies Record<string, DefinicionDeRegla>;

export type ClaveDeRegla = keyof typeof REGLAS;
export const CLAVES_DE_REGLA = Object.keys(REGLAS) as ClaveDeRegla[];
export type Reglas = Record<ClaveDeRegla, string>;

/** Las notas para los agentes, debajo del frontmatter de config.md: hasta este largo. */
export const NOTAS_MAX = 8000;

/** Las reglas como las lee el plugin: lo que no vale queda en su valor por defecto. */
export function reglasDesde(datos: Record<string, string | undefined>): Reglas {
  return Object.fromEntries(
    CLAVES_DE_REGLA.map((clave) => {
      const d: DefinicionDeRegla = REGLAS[clave];
      const v = (datos[clave] ?? "").trim();
      if (d.tipo === "opcion") return [clave, d.opciones.some((o) => o.valor === v) ? v : d.defecto];
      if (d.tipo === "entero") {
        const n = Number.parseInt(v, 10);
        return [clave, String(Number.isFinite(n) ? Math.min(d.max, Math.max(d.min, n)) : d.defecto)];
      }
      return [clave, v];
    }),
  ) as Reglas;
}

/** Una credencial escrita en el comando: van en el entorno, nunca en config.md. */
const CON_CREDENCIAL = /(\s-P\s*\S|\bpassword\s*=|\bpwd\s*=|\buser id\s*=.*;\s*password)/i;

/**
 * Las reglas que él cambió, revisadas. Solo las que vienen; lo que no es una regla conocida no
 * pasa. Devuelve los valores limpios, o el motivo por el que alguno no vale.
 */
export function revisarReglas(dato: unknown): { reglas: Partial<Reglas> } | { error: string } {
  const d = (dato && typeof dato === "object" ? dato : {}) as Record<string, unknown>;
  const out: Partial<Reglas> = {};
  for (const [clave, valor] of Object.entries(d)) {
    if (!(CLAVES_DE_REGLA as string[]).includes(clave)) return { error: `«${clave}» no es una regla que se cambie aquí.` };
    const def: DefinicionDeRegla = REGLAS[clave as ClaveDeRegla];
    const texto = typeof valor === "number" ? String(valor) : typeof valor === "string" ? valor.trim() : null;
    if (texto === null) return { error: `${def.nombre}: no tiene forma de valor.` };
    if (def.tipo === "opcion" && !def.opciones.some((o) => o.valor === texto)) return { error: `${def.nombre}: «${texto}» no es una de sus opciones.` };
    if (def.tipo === "entero") {
      const n = Number(texto);
      if (!Number.isInteger(n) || n < def.min || n > def.max) return { error: `${def.nombre}: va de ${def.min} a ${def.max}.` };
    }
    if (def.tipo === "texto") {
      if (texto.length > def.largo) return { error: `${def.nombre}: pasa de ${def.largo} caracteres.` };
      if (/\p{Cc}/u.test(texto)) return { error: `${def.nombre}: tiene que ir en una sola línea.` };
      if (clave === "sql" && CON_CREDENCIAL.test(` ${texto}`)) return { error: "Revisar los .sql: las credenciales no van en config.md, que se lee y se puede versionar. El comando las toma del entorno (SQLCMDUSER y SQLCMDPASSWORD, o -E)." };
    }
    out[clave as ClaveDeRegla] = texto;
  }
  return { reglas: out };
}

/** Las notas para los agentes, revisadas: texto, sin pasarse de largo. */
export function revisarNotas(dato: unknown): { notas: string } | { error: string } {
  if (typeof dato !== "string") return { error: "Las notas tienen que ser texto." };
  if (dato.length > NOTAS_MAX) return { error: `Las notas pasan de ${NOTAS_MAX} caracteres.` };
  return { notas: dato.replace(/\r\n/g, "\n").trim() };
}
