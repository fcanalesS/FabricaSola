// Solo servidor: «Lo que tiene este equipo», todo lo que la fábrica puede usar en un solo lugar.
// De cada pieza: si está, qué permite y
// qué agregar si falta. De las claves y los tokens se dice solo si están, nunca su valor. De los
// programas, solo la ruta de Claude Code, para que se sepa cuál encontró.

import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import os from "node:os";
import { baseDeDatos } from "../datos.ts";
import { NOMBRE_DEL_PROVEEDOR, vistaDeFuentes, type FuenteALaVista } from "../entrada/fuentes.ts";
import { claudeCodeDeEsteEquipo, type ClaudeCode } from "./motor/claude-code.ts";
import { entornoDeLaCorrida, lanzadorDeClaude } from "./motor/corridas.ts";
import { estadoTelefono, type EstadoTelefono } from "./motor/telefono.ts";

/** `falta`: sin ella no se corre. `apagada`: es opcional y no está. `revisar`: está, pero algo no cuadra. */
export type EstadoDePieza = "lista" | "falta" | "revisar" | "apagada";

export type Pieza = {
  id: string;
  nombre: string;
  estado: EstadoDePieza;
  /** Cómo está, en una frase. */
  como: string;
  /** Lo que permite tenerla. */
  permite: string;
  /** Qué hacer, si no está lista. */
  hacer?: string;
};

export type Grupo = { titulo: string; piezas: Pieza[] };

/** Lo que dice Claude Code de su sesión. Solo estos tres datos: ni el correo ni la organización. */
export type Sesion = { iniciada: boolean; metodo: string | null; plan: string | null };

/** Lo que se le pregunta al equipo. Las pruebas lo cambian por uno de mentira. */
export type Sondas = {
  claude: () => ClaudeCode | null;
  /** La primera línea de `<programa> --version`, o `null` si no contestó. */
  version: (programa: string) => Promise<string | null>;
  sesion: (claude: string) => Promise<Sesion | null>;
  existe: (ruta: string) => boolean;
  fuentes: () => FuenteALaVista[] | null;
  telefono: () => Promise<EstadoTelefono | null>;
  entorno: Record<string, string | undefined>;
};

const REINICIA = "y reinicia la aplicación";

function correr(bin: string, args: string[]): Promise<string | null> {
  const { programa, argumentos } = lanzadorDeClaude(bin, args);
  return new Promise((listo) =>
    // Con el entorno de una corrida: sin las claves de la aplicación, como la correría la fábrica.
    execFile(programa, argumentos, { cwd: os.homedir(), env: entornoDeLaCorrida(process.env), timeout: 15_000, windowsHide: true }, (err, stdout) =>
      listo(err ? null : String(stdout)),
    ),
  );
}

export const SONDAS: Sondas = {
  claude: () => claudeCodeDeEsteEquipo(),
  version: async (programa) => (await correr(programa, ["--version"]))?.trim().split(/\r?\n/)[0] || null,
  sesion: async (claude) => sesionDesde(await correr(claude, ["auth", "status", "--json"])),
  existe: (ruta) => {
    try {
      return statSync(ruta).isFile();
    } catch {
      return false;
    }
  },
  fuentes: () => {
    try {
      return vistaDeFuentes(baseDeDatos());
    } catch {
      return null;
    }
  },
  telefono: () => estadoTelefono().catch(() => null),
  entorno: process.env,
};

/** Lo que contesta `claude auth status --json`, reducido a lo que se muestra. Es lógica pura. */
export function sesionDesde(texto: string | null): Sesion | null {
  if (!texto) return null;
  try {
    const j = JSON.parse(texto) as { loggedIn?: unknown; authMethod?: unknown; subscriptionType?: unknown };
    if (typeof j.loggedIn !== "boolean") return null;
    const texto_ = (v: unknown) => (typeof v === "string" && /^[\w.\- ]{1,40}$/.test(v) ? v : null);
    return { iniciada: j.loggedIn, metodo: texto_(j.authMethod), plan: texto_(j.subscriptionType) };
  } catch {
    return null;
  }
}

async function deClaudeCode(s: Sondas): Promise<Pieza[]> {
  const permite = "Corre las tareas: spec, construcción, revisión, verificación y aprobación, con tu sesión.";
  const permiteSesion = "Que las corridas usen tu suscripción, sin una clave de la API.";
  const cc = s.claude();
  if (!cc) {
    return [
      {
        id: "claude",
        nombre: "Claude Code",
        estado: "falta",
        como: "No lo encontré: no está en el PATH ni en FACTORIA_CLAUDE_CODE_BIN.",
        permite,
        hacer: `Instálalo (claude.com/claude-code) y reinicia la aplicación desde una terminal donde \`claude\` funcione. Si está en otra parte, pon su ruta en FACTORIA_CLAUDE_CODE_BIN, en .env.local, ${REINICIA}.`,
      },
    ];
  }
  // La sesión se le pregunta solo si contestó como Claude Code: a otro programa no se le pasa `auth`.
  const version = await s.version(cc.ruta);
  const de = cc.de === "path" ? "la encontré en el PATH" : "de FACTORIA_CLAUDE_CODE_BIN";
  const claude: Pieza = version
    ? { id: "claude", nombre: "Claude Code", estado: "lista", como: `${version}, en ${cc.ruta} (${de}).`, permite }
    : {
        id: "claude",
        nombre: "Claude Code",
        estado: "revisar",
        como: `Está en ${cc.ruta} (${de}), pero no contestó a --version.`,
        permite,
        hacer: cc.de === "path" ? `Revisa que \`claude\` funcione en una terminal. Si quieres otro, pon su ruta en FACTORIA_CLAUDE_CODE_BIN ${REINICIA}.` : `Revisa la ruta de FACTORIA_CLAUDE_CODE_BIN ${REINICIA}.`,
      };
  if (!version) return [claude];
  const sesion = await s.sesion(cc.ruta);
  let laSesion: Pieza;
  if (!sesion) {
    laSesion = {
      id: "sesion",
      nombre: "Tu sesión de Claude Code",
      estado: "revisar",
      como: "No pude preguntarle a Claude Code por su sesión (necesita una versión reciente).",
      permite: permiteSesion,
      hacer: "Abre `claude` en una terminal: si te pide entrar, entra. O actualízalo.",
    };
  } else if (!sesion.iniciada) {
    laSesion = { id: "sesion", nombre: "Tu sesión de Claude Code", estado: "falta", como: "No has iniciado sesión.", permite: permiteSesion, hacer: "En una terminal, `claude auth login` (o abre `claude` y sigue los pasos)." };
  } else if (sesion.metodo === "claude.ai") {
    laSesion = { id: "sesion", nombre: "Tu sesión de Claude Code", estado: "lista", como: `Con tu cuenta de Claude${sesion.plan ? ` (plan ${sesion.plan})` : ""}.`, permite: permiteSesion };
  } else {
    laSesion = {
      id: "sesion",
      nombre: "Tu sesión de Claude Code",
      estado: "revisar",
      como: `Iniciada${sesion.metodo ? ` con «${sesion.metodo}»` : ""}, no con una cuenta de Claude: las corridas pueden gastar créditos de la API en vez de tu suscripción.`,
      permite: permiteSesion,
      hacer: "Si quieres usar tu suscripción, en una terminal: `claude auth logout` y luego `claude auth login` con tu cuenta de Claude.",
    };
  }
  return [claude, laSesion];
}

async function deGit(s: Sondas): Promise<Pieza> {
  const version = await s.version("git");
  const permite = "Cada línea es un repositorio: las tareas corren en worktrees y se integran con git.";
  return version
    ? { id: "git", nombre: "git", estado: "lista", como: `${version}.`, permite }
    : { id: "git", nombre: "git", estado: "falta", como: "No lo encontré en el PATH.", permite, hacer: "Instala git (git-scm.com) y reinicia la aplicación." };
}

/** Un programa opcional que se lanza por su ruta exacta, de su variable. */
function porSuRuta(s: Sondas, o: { id: string; nombre: string; variable: string; permite: string; sin: string; donde: string }): Pieza {
  const ruta = s.entorno[o.variable]?.trim();
  if (!ruta) return { id: o.id, nombre: o.nombre, estado: "apagada", como: `${o.sin}`, permite: o.permite, hacer: `Pon en .env.local ${o.variable} con su ruta exacta (${o.donde}) ${REINICIA}.` };
  if (!s.existe(ruta)) return { id: o.id, nombre: o.nombre, estado: "revisar", como: `${o.variable} apunta a un archivo que no existe.`, permite: o.permite, hacer: `Corrige la ruta de ${o.variable} ${REINICIA}.` };
  return { id: o.id, nombre: o.nombre, estado: "lista", como: `Está, de ${o.variable}.`, permite: o.permite };
}

function deFuentes(lista: FuenteALaVista[] | null): Pieza[] {
  const permite = "Traer a la Bandeja los issues de GitHub o GitLab, en solo lectura.";
  if (lista === null) return [{ id: "fuentes", nombre: "Fuentes", estado: "revisar", como: "No pude leer las fuentes de este equipo.", permite }];
  if (!lista.length) return [{ id: "fuentes", nombre: "Fuentes", estado: "apagada", como: "No hay ninguna: los pedidos llegan por Nueva petición.", permite, hacer: "Agrégalas en Fuentes, con un token de solo lectura en .env.local." }];
  return lista.map((f) => {
    const nombre = `${NOMBRE_DEL_PROVEEDOR[f.proveedor]} · ${f.nombre}`;
    const id = `fuente-${f.id}`;
    if (!f.tieneToken) return { id, nombre, estado: "revisar", como: `Falta ${f.variable} en .env.local.`, permite, hacer: `Pon ahí su token de solo lectura ${REINICIA}.` };
    if (f.estado === "rechazado") return { id, nombre, estado: "revisar", como: `El servicio rechazó el token de ${f.variable}.`, permite, hacer: `Cámbialo en .env.local ${REINICIA}.` };
    if (!f.encendida) return { id, nombre, estado: "apagada", como: "Tiene su token, pero está apagada.", permite, hacer: "Enciéndela en Fuentes." };
    return { id, nombre, estado: "lista", como: `Con su token (${f.variable}).`, permite };
  });
}

function deTelefono(t: EstadoTelefono | null): Pieza {
  const permite = "Que la fábrica te llame cuando una tarea te espera, aunque no tengas la página abierta.";
  if (!t) return { id: "telefono", nombre: "El teléfono (Telnyx)", estado: "revisar", como: "No pude leer cómo está.", permite };
  if (!t.listo) return { id: "telefono", nombre: "El teléfono (Telnyx)", estado: "apagada", como: `Faltan ${t.faltan.join(", ")}.`, permite, hacer: `Ponlas en .env.local (los números, con + y el código del país) ${REINICIA}.` };
  return { id: "telefono", nombre: "El teléfono (Telnyx)", estado: "lista", como: `Llama a ${t.destino}; al contestar, ${t.conAudio ? "suena tu audio" : "silencio (FACTORIA_TELNYX_AUDIO_URL pone un audio)"}.`, permite };
}

/** Todo lo que la fábrica puede usar en este equipo, en grupos. Se mira en cada visita. */
export async function loQueTieneEsteEquipo(s: Sondas = SONDAS): Promise<Grupo[]> {
  const [claude, git, telefono] = await Promise.all([deClaudeCode(s), deGit(s), s.telefono()]);
  const jev = s.entorno.TYPESAFE_AI_KEY?.trim();
  return [
    { titulo: "Para correr", piezas: [...claude, git] },
    {
      titulo: "Para integrar",
      piezas: [
        porSuRuta(s, { id: "gh", nombre: "gh (GitHub)", variable: "FACTORIA_GH_BIN", permite: "Abrir el PR al empujar, esperar la integración continua y fusionar, en GitHub.", sin: "Sin él, el push empuja, pero el PR no se abre, y los pasos ci y fusion no corren.", donde: "en Windows, where.exe gh; en Mac y Linux, command -v gh" }),
        porSuRuta(s, { id: "glab", nombre: "glab (GitLab)", variable: "FACTORIA_GLAB_BIN", permite: "Lo mismo en GitLab: el merge request, el pipeline y la fusión.", sin: "Sin él, el push empuja, pero el merge request no se abre, y los pasos ci y fusion no corren.", donde: "en Windows, where.exe glab; en Mac y Linux, command -v glab" }),
      ],
    },
    {
      titulo: "Para gastar menos",
      piezas: [
        jev
          ? { id: "jev", nombre: "Jev", estado: "lista", como: "Está su clave (TYPESAFE_AI_KEY).", permite: "Decidir qué pruebas y revisores necesita cada tarea, y revisar los issues de otras personas antes de que pasen a una línea." }
          : {
              id: "jev",
              nombre: "Jev",
              estado: "apagada",
              como: "Sin Jev todo funciona, pero gasta más: cada tarea pasa por todas las pruebas y los revisores, y toda tarea aprobada cuenta como grande. Un issue de otra persona no pasa a una línea: lo reescribes con tus palabras.",
              permite: "Decidir qué pruebas y revisores necesita cada tarea, y revisar los issues de otras personas antes de que pasen a una línea.",
              hacer: `Pon su clave en TYPESAFE_AI_KEY, en .env.local, ${REINICIA}.`,
            },
      ],
    },
    { titulo: "La Entrada", piezas: deFuentes(s.fuentes()) },
    { titulo: "Avisos", piezas: [deTelefono(telefono)] },
    {
      titulo: "Otros agentes",
      piezas: [
        porSuRuta(s, { id: "codex", nombre: "Codex", variable: "FACTORIA_CODEX_BIN", permite: "Que Codex revise el código, solo o junto a Claude, con su propia suscripción.", sin: "No está: el código lo revisa Claude Code.", donde: "en Windows, where.exe codex" }),
        porSuRuta(s, { id: "antigravity", nombre: "Antigravity", variable: "FACTORIA_ANTIGRAVITY_BIN", permite: "Que Antigravity escriba la spec, con su propia suscripción.", sin: "No está: la spec la escribe Claude Code.", donde: "en Windows, where.exe agy; tiene que ser su ejecutable, no un .cmd" }),
      ],
    },
  ];
}
