/**
 * El paso `fusion` de un proceso (fabrica/docs/Plan-Integracion.md, etapa 5): fusiona en `main` el PR
 * que abrió el mismo proceso, sin que nadie apriete un botón. Lo decidió él el 27 de octubre de
 * 2026. La fusión la hace el servicio (GitHub o GitLab) con el PR: la fábrica nunca empuja a `main`,
 * nunca usa `--admin` y respeta la protección de la rama. Solo fusiona si:
 *
 *   - el PR es el de la rama del proceso contra la base de su push, y está abierto;
 *   - su último commit es el que pasó la integración continua en esta misma ejecución;
 *   - cada tarea que entra fue sencilla, o grande y él la probó (su veredicto «aprobada»).
 *
 * Lo que va en el cuerpo del PR lo arma el código con lo que escribió Label en cada tarea. Es lógica
 * pura: recibe lo ya leído.
 */

export const ESTILOS_DE_FUSION = ["merge", "squash", "rebase"] as const;
export type EstiloDeFusion = (typeof ESTILOS_DE_FUSION)[number];

/** Lo que importa de un PR para fusionarlo. */
export type PRLeido = { numero: number; abierto: boolean; rama: string; base: string; commit: string; url: string | null };

/** Una tarea que entra con este commit: integrada en él y no en la salida anterior. */
export type TareaDelRango = {
  id: string;
  titulo: string;
  /** Si el título lo escribió otra persona (un issue): entonces solo va su id. */
  tituloAjeno: boolean;
  clase: "sencilla" | "grande" | null;
  /** Si él la aprobó desde la aplicación (su veredicto «aprobada»). */
  probada: boolean;
  /** Lo que escribió Label en «## Para el PR»; vacío si no escribió. */
  paraElPR: string;
};

/** Lo que se le pide a `gh` o a `glab` para leer el PR de una rama. Solo lee. */
export function argumentosDeVerPR(h: "gh" | "glab", rama: string): string[] {
  return h === "gh" ? ["pr", "view", rama, "--json", "number,state,headRefName,baseRefName,headRefOid,url"] : ["mr", "view", rama, "--output", "json"];
}

/** El PR que contestó `gh` o `glab`, o `null` si no se entiende. */
export function leerPR(h: "gh" | "glab", texto: string): PRLeido | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const url = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);
  const numero = Number(h === "gh" ? d.number : d.iid);
  const rama = h === "gh" ? d.headRefName : d.source_branch;
  const base = h === "gh" ? d.baseRefName : d.target_branch;
  const commit = h === "gh" ? d.headRefOid : d.sha;
  if (!Number.isInteger(numero) || numero <= 0 || typeof rama !== "string" || typeof base !== "string" || typeof commit !== "string" || !/^[0-9a-f]{7,40}$/i.test(commit)) return null;
  return { numero, abierto: h === "gh" ? d.state === "OPEN" : d.state === "opened", rama, base, commit, url: url(h === "gh" ? d.url : d.web_url) };
}

/**
 * Lo que se le pide a `gh` o a `glab` para fusionar. El commit va atado: si el PR avanzó desde que
 * pasó la integración continua, el servicio no lo fusiona. Nunca `--admin` ni `--auto`, y la rama
 * del proceso no se borra. `glab mr merge` deja la fusión programada por defecto si hay un pipeline
 * corriendo (`--auto-merge`, verdadero en glab 1.125): se apaga, para que fusione en ese momento o no.
 */
export function argumentosDeFusion(h: "gh" | "glab", numero: number, estilo: EstiloDeFusion, commit: string): string[] {
  return h === "gh"
    ? ["pr", "merge", String(numero), `--${estilo}`, "--match-head-commit", commit]
    : ["mr", "merge", String(numero), "--yes", "--auto-merge=false", "--sha", commit, ...(estilo === "squash" ? ["--squash"] : estilo === "rebase" ? ["--rebase"] : [])];
}

/**
 * Lo que se le pide a `gh` o a `glab` después de fusionar, para saber qué commit quedó en la base:
 * el que dispara su pipeline (en GitLab, el que despliega donde `main` despliega). Solo lee.
 */
export function argumentosDelCommitFusionado(h: "gh" | "glab", numero: number): string[] {
  return h === "gh" ? ["pr", "view", String(numero), "--json", "mergeCommit,state"] : ["mr", "view", String(numero), "-F", "json"];
}

/**
 * El commit que quedó en la base al fusionar, o `null` si no se sabe. GitHub lo da en
 * `mergeCommit`; GitLab, en `merge_commit_sha`, o en `squash_commit_sha` al aplastar, y con una
 * fusión sin commit propio (fast-forward) es el último del MR (`sha`).
 */
export function commitFusionadoDe(h: "gh" | "glab", texto: string): string | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const sha = (v: unknown) => (typeof v === "string" && /^[0-9a-f]{7,40}$/i.test(v) ? v : null);
  if (h === "gh") return sha((d.mergeCommit as { oid?: unknown } | null | undefined)?.oid);
  if (d.state !== "merged") return null;
  return sha(d.merge_commit_sha) ?? sha(d.squash_commit_sha) ?? sha(d.sha);
}

/** Lo que se le pide para poner al día el cuerpo de un PR que ya estaba abierto. Con `cuerpoEn`, lo lee de ese archivo. */
export function argumentosDeEditarPR(h: "gh" | "glab", rama: string, cuerpo: string, cuerpoEn?: string): string[] {
  return h === "gh"
    ? ["pr", "edit", rama, ...(cuerpoEn ? ["--body-file", cuerpoEn] : ["--body", cuerpo])]
    : ["mr", "update", rama, ...(cuerpoEn ? ["--description-file", cuerpoEn] : ["--description", cuerpo])];
}

/** Por qué no se fusiona, en frases; vacío si se puede. */
export function porQueNoFusionar(o: { pr: PRLeido | null; rama: string; base: string; commit: string; tareas: readonly TareaDelRango[] }): string[] {
  const no: string[] = [];
  if (!o.pr) return [`No se encontró el PR de ${o.rama}: el push de este proceso tiene que abrirlo antes.`];
  if (!o.pr.abierto) no.push(`El PR #${o.pr.numero} no está abierto.`);
  if (o.pr.rama !== o.rama || o.pr.base !== o.base) no.push(`El PR #${o.pr.numero} va de ${o.pr.rama} a ${o.pr.base}, y este proceso abre el de ${o.rama} a ${o.base}.`);
  if (o.pr.commit.toLowerCase() !== o.commit.toLowerCase()) no.push(`El PR #${o.pr.numero} está en ${o.pr.commit.slice(0, 10)}, y la integración continua pasó en ${o.commit.slice(0, 10)}: alguien empujó después.`);
  const sinClase = o.tareas.filter((t) => !t.clase && !t.probada).map((t) => t.id);
  if (sinClase.length) no.push(`${sinClase.join(", ")} ${sinClase.length === 1 ? "entró" : "entraron"} sin saber si era sencilla o grande, y sin tu veredicto: fusiónalo tú.`);
  const sinProbar = o.tareas.filter((t) => t.clase === "grande" && !t.probada).map((t) => t.id);
  if (sinProbar.length) no.push(`${sinProbar.join(", ")} ${sinProbar.length === 1 ? "es grande y no la probaste" : "son grandes y no las probaste"}.`);
  return no;
}

/** El tope del cuerpo de un PR: GitHub acepta hasta 65 536 caracteres. */
const CUERPO_MAX = 60_000;

/**
 * El cuerpo del PR: quién lo abrió, si se fusiona solo, y lo que escribió Label de cada tarea que
 * entra, con su id. Un título ajeno no va: solo el id. Sin tareas, el texto de siempre.
 */
export function cuerpoDelPR(o: { proceso: string; commit: string; seFusionaSolo: boolean; tareas: readonly TareaDelRango[] }): string {
  const cabeza = `Lo abrió la fábrica de software con el proceso ${o.proceso}, en el commit ${o.commit}. ${
    o.seFusionaSolo
      ? "Se fusiona solo si la integración continua pasa en este commit y cada tarea fue sencilla o la probó una persona."
      : "Integrarlo es una decisión de una persona."
  }`;
  if (!o.tareas.length) return cabeza;
  const partes = [cabeza, "", "## Tareas"];
  for (const t of o.tareas) {
    const clase = t.clase === "grande" ? (t.probada ? "grande, probada a mano" : "grande, sin probar") : t.clase === "sencilla" ? "sencilla" : "sin clasificar";
    partes.push("", `### ${t.id}${t.tituloAjeno ? "" : ` · ${t.titulo.replace(/\s+/g, " ").slice(0, 120)}`} (${clase})`, "", t.paraElPR.trim() || "_Label no escribió nada para esta tarea._");
  }
  const cuerpo = partes.join("\n");
  return cuerpo.length > CUERPO_MAX ? `${cuerpo.slice(0, CUERPO_MAX - 60)}\n\n_(Recortado: el resto está en cada tarea.)_` : cuerpo;
}
