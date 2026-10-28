"use client";

import { useId, useState } from "react";
import type { EntradaALaVista } from "@/lib/entrada/acciones";
import type { FuenteALaVista } from "@/lib/entrada/fuentes";
import { BOTON, CAMPO, enLaEntrada, ETIQUETA, PRINCIPAL } from "./pedir";

/**
 * Las fuentes de la Entrada: de dónde trae issues la fábrica. El token de
 * cada una vive en .env.local y lo cambia él a mano; aquí se escribe solo el
 * nombre de su variable, y la página dice si está o falta. Nunca muestra un
 * valor: no lo recibe.
 */

const ESTADO: Record<FuenteALaVista["estado"], { texto: string; malo: boolean }> = {
  listo: { texto: "Token presente · lee bien", malo: false },
  sin_leer: { texto: "Token presente · todavía no lee", malo: false },
  rechazado: { texto: "Rechazado al leer", malo: true },
  sin_respuesta: { texto: "No responde", malo: true },
  falta_token: { texto: "Falta la variable", malo: true },
  apagada: { texto: "Apagada", malo: false },
};
const REGLAS = [
  { id: "suyos", titulo: "Los que abras tú, con la etiqueta", detalle: "Recomendado. Nadie más puede meterle trabajo a la fábrica desde ahí." },
  { id: "etiqueta", titulo: "Cualquiera con la etiqueta", detalle: "Los que abra otra persona llegan marcados, y su texto se revisa al pasarlos a una línea." },
  { id: "todos", titulo: "Todos los abiertos del repositorio", detalle: "Solo para un repositorio privado y tuyo: en uno público cualquiera podría escribir un issue." },
] as const;
const CADA = [
  { min: 5, nombre: "Cada 5 minutos" },
  { min: 15, nombre: "Cada 15 minutos" },
  { min: 60, nombre: "Cada hora" },
  { min: 0, nombre: "Solo con «Traer ahora»" },
];

type Borrador = { proveedor: "github" | "gitlab"; servidor: string; nombre: string; variable: string; regla: string; etiqueta: string; cadaMin: number; repos: { repo: string; linea: string }[] };
const vacio = (linea: string): Borrador => ({ proveedor: "github", servidor: "", nombre: "", variable: "FACTORIA_FUENTE_GITHUB_TOKEN", regla: "suyos", etiqueta: "fabrica", cadaMin: 5, repos: [{ repo: "", linea }] });
const desde = (f: FuenteALaVista): Borrador => ({ proveedor: f.proveedor, servidor: f.servidor ?? "", nombre: f.nombre, variable: f.variable, regla: f.regla, etiqueta: f.etiqueta, cadaMin: f.cadaMin, repos: f.repos.map((r) => ({ ...r })) });

export function Fuentes({ inicial }: { inicial: EntradaALaVista }) {
  const [entrada, setEntrada] = useState(inicial);
  const [editando, setEditando] = useState<{ id: number | null; borrador: Borrador } | null>(null);
  const [ocupada, setOcupada] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; malo: boolean } | null>(null);

  async function hacer(cuerpo: Record<string, unknown>): Promise<boolean> {
    setOcupada(true);
    setAviso(null);
    const r = await enLaEntrada(cuerpo);
    if (r.entrada) setEntrada(r.entrada);
    setAviso(r.ok ? { texto: r.nota ?? "Hecho.", malo: false } : { texto: r.error ?? "No se pudo.", malo: true });
    setOcupada(false);
    return r.ok;
  }

  const primeraLinea = entrada.lineas[0]?.id ?? "";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-tenue">Cada conexión toma su token de una variable de .env.local con la forma FACTORIA_FUENTE_&lt;NOMBRE&gt;_TOKEN. La aplicación solo mira si está; para cambiarlo, edita el archivo y reinicia si no lo toma.</p>
        <div className="flex gap-2">
          <button type="button" disabled={ocupada || !entrada.fuentes.length} className={BOTON} onClick={() => void hacer({ accion: "traer" })}>
            Traer ahora
          </button>
          <button type="button" disabled={ocupada || !primeraLinea} className={PRINCIPAL} onClick={() => setEditando({ id: null, borrador: vacio(primeraLinea) })}>
            Conectar una fuente
          </button>
        </div>
      </div>
      {!primeraLinea && <p className="text-sm text-aviso">Todavía no hay líneas: elige un proyecto en la configuración de la fábrica antes de conectar una fuente.</p>}

      {aviso && (
        <p role={aviso.malo ? "alert" : "status"} className={`rounded-2xl bg-relieve px-4 py-3 text-sm ${aviso.malo ? "text-aviso" : ""}`}>
          {aviso.texto}
        </p>
      )}

      {editando && (
        <Editor
          key={editando.id ?? "nueva"}
          inicial={editando.borrador}
          nueva={editando.id === null}
          entrada={entrada}
          ocupada={ocupada}
          alGuardar={async (b) => {
            const fuente = { ...b, servidor: b.servidor.trim() || null };
            const ok = await hacer(editando.id === null ? { accion: "fuente_agregar", fuente } : { accion: "fuente_cambiar", id: editando.id, fuente });
            if (ok) setEditando(null);
          }}
          alCancelar={() => setEditando(null)}
        />
      )}

      {!entrada.fuentes.length && !editando ? (
        <section className="rounded-[28px] bg-ficha px-6 py-8 text-center text-sm text-tenue">Todavía no hay fuentes. Sin ellas, lo que entra a la fábrica es lo que escribes en una petición.</section>
      ) : (
        <ul aria-label="Conexiones" className="grid gap-3 md:grid-cols-2">
          {entrada.fuentes.map((f) => {
            const e = ESTADO[f.estado];
            return (
              <li key={f.id} className={`flex flex-col gap-2 rounded-[24px] bg-ficha p-4 ${e.malo ? "outline-2 outline-aviso outline-solid" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[15px] font-extrabold">{f.nombre}</h2>
                  <span className={`text-sm font-bold ${e.malo ? "text-aviso" : ""}`}>{e.texto}</span>
                </div>
                <p className="text-sm text-tenue">
                  {f.proveedor === "github" ? "GitHub" : "GitLab"}
                  {f.servidor ? ` en ${f.servidor}` : ""} · <code className="font-mono text-texto">{f.variable}</code>
                </p>
                <p className="text-sm">{f.repos.length ? f.repos.map((r) => `${r.repo} → ${entrada.lineas.find((l) => l.id === r.linea)?.nombre ?? r.linea}`).join(" · ") : "Sin repositorios todavía."}</p>
                {f.motivo && f.estado !== "listo" && <p className="text-sm text-aviso">{f.motivo}</p>}
                {f.estado === "falta_token" && <p className="text-sm text-tenue">Agrega {f.variable}= con el token en .env.local y reinicia la aplicación si no la ve.</p>}
                {f.leida && <p className="text-xs text-tenue">Leída por última vez {new Date(f.leida).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                <div className="mt-1 flex flex-wrap gap-2">
                  {(f.estado === "rechazado" || f.estado === "sin_respuesta") && (
                    <button type="button" disabled={ocupada} className={PRINCIPAL} onClick={() => void hacer({ accion: "fuente_reintentar", id: f.id }).then((ok) => ok && hacer({ accion: "traer", id: f.id }))}>
                      Ya lo cambié: volver a intentar
                    </button>
                  )}
                  {f.estado !== "apagada" && f.estado !== "falta_token" && f.estado !== "rechazado" && (
                    <button type="button" disabled={ocupada} className={BOTON} onClick={() => void hacer({ accion: "traer", id: f.id })}>
                      Leer ahora
                    </button>
                  )}
                  <button type="button" disabled={ocupada} className={BOTON} onClick={() => void hacer({ accion: "fuente_encender", id: f.id, encendida: f.estado === "apagada" })}>
                    {f.estado === "apagada" ? "Encender" : "Apagar"}
                  </button>
                  <button type="button" disabled={ocupada} className={BOTON} onClick={() => setEditando({ id: f.id, borrador: desde(f) })}>
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={ocupada}
                    className={BOTON}
                    onClick={() => {
                      if (window.confirm(`¿Quitar la conexión «${f.nombre}»? Lo que ya trajo sigue en la Bandeja.`)) void hacer({ accion: "fuente_quitar", id: f.id });
                    }}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Editor({ inicial, nueva, entrada, ocupada, alGuardar, alCancelar }: { inicial: Borrador; nueva: boolean; entrada: EntradaALaVista; ocupada: boolean; alGuardar: (b: Borrador) => Promise<void>; alCancelar: () => void }) {
  const id = useId();
  const [b, setB] = useState(inicial);
  const poner = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));
  const forma = /^FACTORIA_FUENTE_[A-Z0-9][A-Z0-9_]{0,60}_TOKEN$/.test(b.variable);
  const esta = entrada.variables.find((v) => v.nombre === b.variable);
  const usadaPorOtra = esta?.usadaPor && esta.usadaPor !== inicial.nombre ? esta.usadaPor : null;

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-5 rounded-[28px] bg-ficha p-5 outline-2 outline-papel outline-solid">
      <h2 id={`${id}-titulo`} className="text-lg font-extrabold">
        {nueva ? "Conectar una fuente" : `Editar «${inicial.nombre}»`}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-bold">Servicio</legend>
          {(["github", "gitlab"] as const).map((p) => (
            <label key={p} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-2xl px-3.5 text-sm font-bold ${b.proveedor === p ? "bg-realce" : "bg-relieve"}`}>
              <input type="radio" name={`${id}-proveedor`} checked={b.proveedor === p} onChange={() => poner("proveedor", p)} />
              {p === "github" ? "GitHub" : "GitLab"}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-4">
          <label className={ETIQUETA}>
            Nombre de la conexión
            <input value={b.nombre} maxLength={60} onChange={(e) => poner("nombre", e.target.value)} placeholder="GitHub · empresa" className={CAMPO} />
          </label>
          <label className={ETIQUETA}>
            Servidor propio (opcional)
            <input value={b.servidor} onChange={(e) => poner("servidor", e.target.value)} placeholder={b.proveedor === "github" ? "Vacío: github.com" : "Vacío: gitlab.com"} className={CAMPO} />
            <span className="font-normal text-tenue">Solo https://, sin usuario ni clave en la dirección.</span>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className={ETIQUETA}>
          Variable del token en .env.local
          <input value={b.variable} spellCheck={false} autoComplete="off" onChange={(e) => poner("variable", e.target.value.trim().toUpperCase())} className={`${CAMPO} font-mono`} aria-invalid={!forma || !!usadaPorOtra} aria-describedby={`${id}-variable`} />
        </label>
        <p id={`${id}-variable`} role="status" className={`text-sm font-bold ${!forma || usadaPorOtra || !esta ? "text-aviso" : ""}`}>
          {!forma
            ? "Tiene que llamarse FACTORIA_FUENTE_<NOMBRE>_TOKEN: así ninguna conexión usa una clave de IA."
            : usadaPorOtra
              ? `La usa «${usadaPorOtra}»: dos conexiones no comparten token.`
              : esta
                ? "Está en .env.local. Su valor no se lee aquí."
                : `Falta: agrega ${b.variable}= con el token en .env.local. Se puede guardar igual; no lee hasta que aparezca.`}
        </p>
        {entrada.variables.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-tenue">Encontradas:</span>
            {entrada.variables.map((v) => (
              <button key={v.nombre} type="button" onClick={() => poner("variable", v.nombre)} className="min-h-8 rounded-full bg-relieve px-3 font-mono text-xs font-bold">
                {v.nombre}
                {v.usadaPor ? <span className="font-sans font-normal text-tenue"> · {v.usadaPor}</span> : null}
              </button>
            ))}
          </div>
        )}
        <details className="rounded-2xl bg-relieve px-4 text-sm">
          <summary className="flex min-h-10 cursor-pointer items-center font-bold">Cómo crear un token que sirva</summary>
          <ul className="list-disc pb-3 pl-5 text-tenue">
            {b.proveedor === "github" ? (
              <>
                <li>GitHub › Settings › Developer settings › Fine-grained tokens › Generate new token.</li>
                <li>Repositorios: solo los que van a la fábrica. Permisos: Issues en «Read-only». Nada más.</li>
              </>
            ) : (
              <>
                <li>GitLab › Preferencias › Tokens de acceso › Agregar un token.</li>
                <li>Alcance: read_api. Nada más.</li>
              </>
            )}
            <li>La fábrica solo lee, pero un token con menos permisos hace menos daño si se filtra.</li>
          </ul>
        </details>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">Qué repositorio va a qué línea</legend>
        {b.repos.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input aria-label={`Repositorio ${i + 1}`} value={r.repo} placeholder={b.proveedor === "github" ? "dueño/repositorio" : "grupo/proyecto"} onChange={(e) => poner("repos", b.repos.map((x, j) => (j === i ? { ...x, repo: e.target.value } : x)))} className={`${CAMPO} min-w-0 flex-[2_1_200px]`} />
            <span aria-hidden="true" className="text-tenue">
              →
            </span>
            <select aria-label={`Línea del repositorio ${i + 1}`} value={r.linea} onChange={(e) => poner("repos", b.repos.map((x, j) => (j === i ? { ...x, linea: e.target.value } : x)))} className={`${CAMPO} min-w-0 flex-[1_1_150px]`}>
              {entrada.lineas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
            <button type="button" aria-label={`Quitar el repositorio ${i + 1}`} className={BOTON} onClick={() => poner("repos", b.repos.filter((_, j) => j !== i))}>
              Quitar
            </button>
          </div>
        ))}
        <button type="button" className={`${BOTON} self-start`} onClick={() => poner("repos", [...b.repos, { repo: "", linea: entrada.lineas[0]?.id ?? "" }])}>
          Agregar un repositorio
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">Qué issues entran</legend>
        {REGLAS.map((r) => (
          <label key={r.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 ${b.regla === r.id ? "bg-realce" : "bg-relieve"}`}>
            <input type="radio" name={`${id}-regla`} checked={b.regla === r.id} onChange={() => poner("regla", r.id)} className="mt-1" />
            <span>
              <span className="block text-sm font-bold">{r.titulo}</span>
              <span className="text-sm text-tenue">{r.detalle}</span>
            </span>
          </label>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          {b.regla !== "todos" && (
            <label className={ETIQUETA}>
              Etiqueta
              <input value={b.etiqueta} maxLength={50} onChange={(e) => poner("etiqueta", e.target.value)} className={CAMPO} />
              <span className="font-normal text-tenue">Como la escribas en el servicio, sin comas.</span>
            </label>
          )}
          <label className={ETIQUETA}>
            Cada cuánto lee
            <select value={b.cadaMin} onChange={(e) => poner("cadaMin", Number(e.target.value))} className={CAMPO}>
              {CADA.map((c) => (
                <option key={c.min} value={c.min}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <span className="font-normal text-tenue">La aplicación pregunta: el servicio no puede avisarle, porque corre solo en este equipo.</span>
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={ocupada || !forma || !!usadaPorOtra || !b.nombre.trim()} className={PRINCIPAL} onClick={() => void alGuardar(b)}>
          Guardar
        </button>
        <button type="button" className={BOTON} onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
