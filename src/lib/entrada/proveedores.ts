import type { IssueLeido } from "./bandeja.ts";
import type { Fuente, Proveedor } from "./fuentes.ts";

/**
 * Cómo se lee cada servicio: GitHub y GitLab, públicos o en un servidor
 * propio. Solo se lee: todos los pedidos pasan por `pedirGet`, que no sabe
 * hacer otra cosa. Lo que interpreta las respuestas es lógica pura. El token
 * va solo en la cabecera, nunca en la dirección. Solo para el servidor.
 *
 * Para sumar otro servicio (Jira, Taiga…): una entrada más en `PROVEEDOR`.
 */

export type ResultadoDeLectura =
  | { estado: "listo"; usuario: string; issues: IssueLeido[] }
  | { estado: "rechazado" | "sin_respuesta"; motivo: string };

const ESPERA_MS = 15_000;
const POR_PAGINA = 50;

class FalloDelServicio extends Error {
  readonly estado: "rechazado" | "sin_respuesta";
  constructor(estado: "rechazado" | "sin_respuesta", mensaje: string) {
    super(mensaje);
    this.estado = estado;
  }
}

/** El único pedido que hace la Entrada a un servicio: `GET`, con el token en la cabecera. */
async function pedirGet(url: string, cabeceras: Record<string, string>, que: string): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(url, { method: "GET", headers: cabeceras, redirect: "error", signal: AbortSignal.timeout(ESPERA_MS) });
  } catch {
    throw new FalloDelServicio("sin_respuesta", "El servicio no respondió.");
  }
  if (r.status === 401) throw new FalloDelServicio("rechazado", "El servicio rechazó el token: venció, lo revocaron o está mal copiado.");
  if (r.status === 403 && r.headers.get("x-ratelimit-remaining") !== "0") throw new FalloDelServicio("rechazado", `El token no tiene acceso a ${que}.`);
  if (r.status === 404) throw new FalloDelServicio("sin_respuesta", `No encuentra ${que}: revisa el nombre o el acceso del token.`);
  if (!r.ok) throw new FalloDelServicio("sin_respuesta", `El servicio respondió ${r.status}.`);
  try {
    return await r.json();
  } catch {
    throw new FalloDelServicio("sin_respuesta", "El servicio respondió algo que no se entiende.");
  }
}

const texto = (v: unknown) => (typeof v === "string" ? v : "");

/** Los issues de una respuesta de GitHub. Los pull requests también vienen en esa lista: se dejan fuera. */
export function issuesDeGitHub(json: unknown, repo: string): IssueLeido[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((x) => x && typeof x === "object" && !("pull_request" in x) && Number.isInteger(x.number))
    .map((x) => ({
      ref: `${repo}#${x.number}`,
      repo,
      titulo: texto(x.title),
      texto: texto(x.body),
      autor: texto(x.user?.login),
      etiquetas: Array.isArray(x.labels) ? x.labels.map((l: unknown) => (typeof l === "string" ? l : texto((l as { name?: unknown })?.name))).filter(Boolean) : [],
      creado: texto(x.created_at),
      cambiado: texto(x.updated_at),
    }));
}

/** Los issues de una respuesta de GitLab. */
export function issuesDeGitLab(json: unknown, repo: string): IssueLeido[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((x) => x && typeof x === "object" && Number.isInteger(x.iid))
    .map((x) => ({
      ref: `${repo}#${x.iid}`,
      repo,
      titulo: texto(x.title),
      texto: texto(x.description),
      autor: texto(x.author?.username),
      etiquetas: Array.isArray(x.labels) ? x.labels.filter((l: unknown): l is string => typeof l === "string") : [],
      creado: texto(x.created_at),
      cambiado: texto(x.updated_at),
    }));
}

type Lector = {
  api: (servidor: string | null) => string;
  cabeceras: (token: string) => Record<string, string>;
  usuario: (api: string, cab: Record<string, string>) => Promise<string>;
  issues: (api: string, cab: Record<string, string>, f: Pick<Fuente, "regla" | "etiqueta">, repo: string, usuario: string) => Promise<IssueLeido[]>;
};

const PROVEEDOR: Record<Proveedor, Lector> = {
  github: {
    api: (s) => (s ? `${s}/api/v3` : "https://api.github.com"),
    cabeceras: (token) => ({ authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "zero-app" }),
    usuario: async (api, cab) => texto(((await pedirGet(`${api}/user`, cab, "tu usuario")) as { login?: unknown })?.login),
    issues: async (api, cab, f, repo, usuario) => {
      const q = new URLSearchParams({ state: "open", per_page: String(POR_PAGINA) });
      if (f.regla !== "todos") q.set("labels", f.etiqueta);
      if (f.regla === "suyos") q.set("creator", usuario);
      return issuesDeGitHub(await pedirGet(`${api}/repos/${repo}/issues?${q}`, cab, `«${repo}»`), repo);
    },
  },
  gitlab: {
    api: (s) => `${s ?? "https://gitlab.com"}/api/v4`,
    cabeceras: (token) => ({ "private-token": token, accept: "application/json", "user-agent": "zero-app" }),
    usuario: async (api, cab) => texto(((await pedirGet(`${api}/user`, cab, "tu usuario")) as { username?: unknown })?.username),
    issues: async (api, cab, f, repo, usuario) => {
      const q = new URLSearchParams({ state: "opened", per_page: String(POR_PAGINA) });
      if (f.regla !== "todos") q.set("labels", f.etiqueta);
      if (f.regla === "suyos") q.set("author_username", usuario);
      return issuesDeGitLab(await pedirGet(`${api}/projects/${encodeURIComponent(repo)}/issues?${q}`, cab, `«${repo}»`), repo);
    },
  },
};

/** Lee los issues abiertos de los repositorios de una fuente. Nunca lanza: un fallo vuelve como estado. */
export async function leerDelServicio(f: Pick<Fuente, "proveedor" | "servidor" | "regla" | "etiqueta" | "repos">, token: string): Promise<ResultadoDeLectura> {
  const p = PROVEEDOR[f.proveedor];
  const api = p.api(f.servidor);
  const cab = p.cabeceras(token);
  try {
    const usuario = await p.usuario(api, cab);
    if (!usuario) return { estado: "sin_respuesta", motivo: "El servicio no dijo quién eres." };
    const issues: IssueLeido[] = [];
    for (const { repo } of f.repos) issues.push(...(await p.issues(api, cab, f, repo, usuario)));
    return { estado: "listo", usuario, issues };
  } catch (e) {
    if (e instanceof FalloDelServicio) return { estado: e.estado, motivo: e.message };
    return { estado: "sin_respuesta", motivo: "No se pudo leer." };
  }
}
