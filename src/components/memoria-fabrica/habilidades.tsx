"use client";

import { useId, useState } from "react";
import { BOTON, CAMPO, PRINCIPAL } from "@/components/entrada/pedir";
import { CEREBRO, especialidadesDe, type EtapaConEspecialidades, type HabilidadDelCerebro } from "@/lib/fabrica/habilidades/formato";
import type { DocumentoDeMemoria } from "@/lib/fabrica/memoria/formato";
import type { HabilidadesALaVista, UsoEnLaBitacora } from "@/lib/fabrica/memoria/pantalla";
import { AREA } from "./documento";
import type { ContestadoPorLaMemoria } from "./pedir";

/**
 * Las habilidades de una línea en la pantalla Memoria: qué usa cada etapa
 * (el catálogo, que él escribe), las que existen y no se usan, cuánto se usó
 * cada una, y cómo se ve la propuesta de una habilidad nueva. De un
 * `SKILL.md` que ya existe se ve solo su nombre y su descripción; los de una
 * propuesta se ven enteros, porque él los aprueba. Lo que escribe se revisa
 * en el servidor; aquí solo se arma.
 */

type Hacer = (cuerpo: Record<string, unknown>) => Promise<ContestadoPorLaMemoria & { ok: boolean }>;

export const NOMBRE_DE_ETAPA: Record<string, string> = { spec: "Spec", construccion: "Construcción", revision: "Revisión", aprobacion: "Aprobación" };
const etapasALaVista = (etapas: readonly string[]) => etapas.map((e) => NOMBRE_DE_ETAPA[e] ?? e).join(", ");
const esScript = (ruta: string) => !/\.(md|txt)$/i.test(ruta);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Cuánto se usó, según la bitácora. */
const Usada = ({ u }: { u: UsoEnLaBitacora }) => (
  <span className="text-xs text-tenue">{u.tareas ? `En ${plural(u.tareas, "tarea", "tareas")} · la última el ${u.ultima}` : "Todavía no la trajo ninguna tarea"}</span>
);

export function Habilidades({ h, nombre, ocupada, hacer, propuestas, verPropuestas }: { h: HabilidadesALaVista; nombre: string; ocupada: boolean; hacer: Hacer; propuestas: number; verPropuestas: () => void }) {
  if (!h.existe)
    return (
      <section className="flex flex-col items-center gap-3 rounded-[28px] bg-ficha px-6 py-10 text-center">
        <h2 className="text-lg font-extrabold">{nombre} todavía no tiene catálogo de habilidades</h2>
        <p className="max-w-lg text-sm text-tenue">
          Se crea en <code className="font-mono">{h.archivo}</code> con las habilidades que el proyecto ya tiene, sin asignar: la fábrica no usa ninguna hasta que la pongas en una etapa.
        </p>
        <button type="button" disabled={ocupada} className={PRINCIPAL} onClick={() => void hacer({ accion: "crear-catalogo" })}>
          Crear el catálogo
        </button>
      </section>
    );
  const delProyecto = h.sinUsar.filter((s) => s.origen === "proyecto");
  const tuyas = h.sinUsar.filter((s) => s.origen === "suya");
  return (
    <div className="flex flex-col gap-3">
      {propuestas > 0 && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[22px] bg-ficha px-5 py-3 text-sm outline-2 outline-realce outline-solid">
          <span>
            <strong>{plural(propuestas, "habilidad propuesta espera", "habilidades propuestas esperan")}</strong> que la revises.
          </span>
          <button type="button" className={BOTON} onClick={verPropuestas}>
            Ver en Propuestas
          </button>
        </p>
      )}

      <section aria-labelledby="hab-en-uso" className="flex flex-col gap-3 rounded-[22px] bg-ficha px-5 py-4">
        <h2 id="hab-en-uso" className="text-base font-extrabold">
          Lo que usa cada etapa
        </h2>
        {!h.usos.length ? (
          <p className="text-sm text-tenue">Ninguna etapa usa una habilidad todavía. Asigna una de las de abajo o escríbela en el catálogo.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {h.usos.map((u) => (
              <li key={`${u.linea}`} className="flex flex-col gap-1 border-t border-relieve pt-2.5 text-sm first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <strong className="font-mono text-[13px]">{u.nombre}</strong>
                  <ul aria-label="Etapas" className="flex flex-wrap gap-1.5">
                    {u.etapas.map((e) => (
                      <li key={e} className="rounded-full bg-relieve px-2.5 py-0.5 text-xs font-bold">
                        {NOMBRE_DE_ETAPA[e] ?? e}
                      </li>
                    ))}
                  </ul>
                  {!u.existe && <span className="text-xs font-bold text-aviso">No existe: ninguna etapa la recibe</span>}
                </div>
                <p>{u.cuando}</p>
                <Usada u={u} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Especialidades etapa="spec" h={h} ocupada={ocupada} hacer={hacer} />
      <Especialidades etapa="construccion" h={h} ocupada={ocupada} hacer={hacer} />
      <Especialidades etapa="aprobacion" h={h} ocupada={ocupada} hacer={hacer} />

      <section aria-labelledby="hab-sin-usar" className="flex flex-col gap-3 rounded-[22px] bg-ficha px-5 py-4">
        <h2 id="hab-sin-usar" className="text-base font-extrabold">
          Existen y no se usan
        </h2>
        {!delProyecto.length ? (
          <p className="text-sm text-tenue">Todas las habilidades del proyecto tienen su etapa.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {delProyecto.map((s) => (
              <li key={s.nombre}>
                <SinUsar s={s} etapas={h.etapas} ocupada={ocupada} hacer={hacer} />
              </li>
            ))}
          </ul>
        )}
        {tuyas.length > 0 && (
          <details className="rounded-2xl bg-relieve px-3.5 py-2">
            <summary className="cursor-pointer py-1 text-sm font-bold">Las tuyas · {tuyas.length}</summary>
            <p className="pt-1 text-xs text-tenue">Están en tu carpeta de Claude Code y valen en todos tus proyectos. Una tuya con el mismo nombre que una del proyecto manda.</p>
            <ul className="flex flex-col gap-2.5 pt-2.5 pb-1">
              {tuyas.map((s) => (
                <li key={s.nombre}>
                  <SinUsar s={s} etapas={h.etapas} ocupada={ocupada} hacer={hacer} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <Catalogo key={h.texto} h={h} ocupada={ocupada} hacer={hacer} />
    </div>
  );
}

/** Lo que cambia entre las especialidades de la spec y las del constructor. */
const DE_LA_ETAPA: Record<EtapaConEspecialidades, { titulo: string; texto: string; agente: string; todas: string; vez: string }> = {
  spec: {
    titulo: "Especialidades de la spec",
    texto: "Para las tareas que tocan IA o datos personales.",
    agente: "al agente de spec",
    todas: "Proponer las cuatro",
    vez: "por spec",
  },
  construccion: {
    titulo: "Especialidades del constructor",
    texto: "Código, seguridad e interfaz: cada línea enciende las que necesita. Los oficios que solo leen revisan lo construido antes de entregar.",
    agente: "al constructor",
    todas: "Proponer las tres",
    vez: "por construcción, y otra vez en cada retrabajo",
  },
  aprobacion: {
    titulo: "Especialidades del aprobador",
    texto: "Comprobación de entrega: un veredicto sin matices, lo que se coló sin querer en el diff, y que el diff haga lo que dice la tarea. No corre las pruebas: vale la verificación que ya pasó.",
    agente: "al aprobador",
    todas: "Proponerla",
    vez: "por aprobación",
  },
};

/** Cuánto pesan unos oficios en el prompt: «34 KB, unos 10 mil tokens». Se cuentan unos 3,5 caracteres por token. */
const peso = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB, unos ${Math.max(1, Math.round(bytes / 3500))} mil tokens`;

/**
 * Las especialidades de una etapa: cuáles tiene la línea, lo que pesa cada una y, las que faltan,
 * proponerlas. No se escribe nada en el repositorio hasta que él apruebe cada propuesta.
 */
function Especialidades({ etapa, h, ocupada, hacer }: { etapa: EtapaConEspecialidades; h: HabilidadesALaVista; ocupada: boolean; hacer: Hacer }) {
  const d = DE_LA_ETAPA[etapa];
  const lista = especialidadesDe(etapa);
  const enUso = new Set(h.usos.filter((u) => u.existe).map((u) => u.nombre));
  const sinEtapa = new Set(h.sinUsar.map((s) => s.nombre));
  const faltan = lista.filter((e) => !enUso.has(e.nombre) && !sinEtapa.has(e.nombre));
  const id = `hab-especialidades-${etapa}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-[22px] bg-ficha px-5 py-4">
      <h2 id={id} className="text-base font-extrabold">
        {d.titulo}
      </h2>
      <p className="text-sm text-tenue">
        {d.texto} Cada una trabaja con sus oficios: la corrida le pasa su texto {d.agente}.
      </p>
      <ul className="flex flex-col gap-2">
        {lista.map((e) => {
          const costo = h.costos.find((c) => c.nombre === e.nombre);
          return (
            <li key={e.nombre} className="flex flex-col gap-0.5 text-sm">
              <span className="flex flex-wrap items-baseline gap-x-2.5">
                <strong className="font-mono text-[13px]">{e.nombre}</strong>
                <span className={`text-xs font-bold ${enUso.has(e.nombre) ? "" : "text-tenue"}`}>{enUso.has(e.nombre) ? "En uso" : sinEtapa.has(e.nombre) ? "Existe, sin etapa" : "No la tiene"}</span>
              </span>
              <span className="text-tenue">{e.cuando}</span>
              {costo && costo.oficios.length > 0 && (
                <span className="text-xs text-tenue">
                  Con {costo.oficios.join(", ")}
                  {costo.bytes ? ` · ${peso(costo.bytes)} ${d.vez}` : " · falta la carpeta fabrica/oficios/"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {faltan.length > 0 && (
        <button type="button" disabled={ocupada} className={`${BOTON} self-start`} onClick={() => void hacer({ accion: "proponer-especialidades", etapa })}>
          {faltan.length === lista.length ? d.todas : `Proponer las que faltan (${faltan.length})`}
        </button>
      )}
      {CEREBRO.filter((c) => c.etapas.includes(etapa)).map((c) => (
        <DelCerebro key={c.nombre} habilidad={c} costo={h.costos.find((x) => x.nombre === c.nombre)} vez={d.vez} h={h} ocupada={ocupada} hacer={hacer} />
      ))}
    </section>
  );
}

/** Las etapas de una habilidad, dichas para un botón: «spec y revisión», «construcción». */
const etapasDichas = (etapas: readonly string[]) => etapas.map((e) => (NOMBRE_DE_ETAPA[e] ?? e).toLowerCase()).join(" y ");

/**
 * Una habilidad del cerebro (la de la ley, la de IA): una para toda la fábrica, que vive entre las
 * suyas. Si no existe, se propone en La planta; si existe, esta línea la usa en sus etapas con un clic.
 */
function DelCerebro({ habilidad, costo, vez, h, ocupada, hacer }: { habilidad: HabilidadDelCerebro; costo: HabilidadesALaVista["costos"][number] | undefined; vez: string; h: HabilidadesALaVista; ocupada: boolean; hacer: Hacer }) {
  const enUso = h.usos.some((u) => u.nombre === habilidad.nombre && u.existe);
  const existe = enUso || h.sinUsar.some((s) => s.nombre === habilidad.nombre);
  return (
    <div className="flex flex-col gap-1.5 border-t border-relieve pt-3 text-sm">
      <span className="flex flex-wrap items-baseline gap-x-2.5">
        <strong className="font-mono text-[13px]">{habilidad.nombre}</strong>
        <span className={`text-xs font-bold ${enUso ? "" : "text-tenue"}`}>{enUso ? "En uso" : existe ? "Existe, sin etapa" : "Todavía no existe"}</span>
      </span>
      <span className="text-tenue">
        {habilidad.resumen} {habilidad.cuando}
      </span>
      {costo && costo.oficios.length > 0 && (
        <span className="text-xs text-tenue">
          Con {costo.oficios.join(", ")}
          {costo.bytes ? ` · ${peso(costo.bytes)} ${vez}` : " · falta la carpeta fabrica/oficios/"}
        </span>
      )}
      {!existe ? (
        <button type="button" disabled={ocupada} className={`${BOTON} self-start`} onClick={() => void hacer({ accion: "proponer-cerebro", nombre: habilidad.nombre })}>
          Proponerla en La planta
        </button>
      ) : (
        !enUso && (
          <button type="button" disabled={ocupada} className={`${BOTON} self-start`} onClick={() => void hacer({ accion: "asignar", nombre: habilidad.nombre, etapas: [...habilidad.etapas], cuando: habilidad.cuando })}>
            Usarla en esta línea ({etapasDichas(habilidad.etapas)})
          </button>
        )
      )}
    </div>
  );
}

function SinUsar({ s, etapas, ocupada, hacer }: { s: HabilidadesALaVista["sinUsar"][number]; etapas: readonly string[]; ocupada: boolean; hacer: Hacer }) {
  const [abierta, setAbierta] = useState(false);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [cuando, setCuando] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 border-t border-relieve pt-2.5 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <strong className="font-mono text-[13px]">{s.nombre}</strong>
        {s.soloAMano && <span className="rounded-full bg-relieve px-2.5 py-0.5 text-xs font-bold">Solo a mano</span>}
      </div>
      {s.descripcion && <p className="text-tenue">{s.descripcion}</p>}
      <Usada u={s} />
      {s.soloAMano ? (
        <p className="text-xs text-tenue">Tiene disable-model-invocation: no se le puede dar a un agente.</p>
      ) : !abierta ? (
        <div>
          <button type="button" disabled={ocupada} className={BOTON} onClick={() => setAbierta(true)}>
            Asignar
          </button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2.5 pt-1"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await hacer({ accion: "asignar", nombre: s.nombre, etapas: elegidas, cuando });
            setError(r.ok ? null : (r.error ?? "No se pudo."));
          }}
        >
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-bold">En qué etapas</legend>
            <div className="flex flex-wrap gap-1.5">
              {etapas.map((e) => {
                const marcada = elegidas.includes(e);
                return (
                  <label key={e} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-bold ${marcada ? "bg-papel text-fondo" : "bg-relieve"}`}>
                    <input type="checkbox" className="size-4" checked={marcada} onChange={() => setElegidas((x) => (marcada ? x.filter((y) => y !== e) : [...x, e]))} />
                    {NOMBRE_DE_ETAPA[e] ?? e}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label htmlFor={id} className="text-sm font-bold">
            Cuándo usarla
          </label>
          <input id={id} className={CAMPO} value={cuando} maxLength={150} required placeholder="Antes de escribir SQL contra la base wolff." onChange={(e) => setCuando(e.target.value)} aria-describedby={`${id}-ayuda`} />
          <span id={`${id}-ayuda`} className="text-xs text-tenue">
            Es lo que lee el agente de esa etapa para decidir si la usa.
          </span>
          {error && (
            <p role="alert" className="text-sm text-aviso">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={ocupada || !elegidas.length || !cuando.trim()} className={PRINCIPAL}>
              Asignar
            </button>
            <button
              type="button"
              disabled={ocupada}
              className={BOTON}
              onClick={() => {
                setAbierta(false);
                setError(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Catalogo({ h, ocupada, hacer }: { h: HabilidadesALaVista; ocupada: boolean; hacer: Hacer }) {
  const [texto, setTexto] = useState(h.texto);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const cambio = texto !== h.texto;
  return (
    <form
      className="flex flex-col gap-3 rounded-[22px] bg-ficha px-5 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await hacer({ accion: "catalogo", texto });
        setError(r.ok ? null : (r.error ?? "No se pudo."));
      }}
    >
      <label htmlFor={id} className="text-base font-extrabold">
        El catálogo
      </label>
      <p id={`${id}-ayuda`} className="text-sm text-tenue">
        <code className="font-mono">{h.archivo}</code>, en el repositorio. Un uso por línea: <code className="font-mono">- [construccion] nombre: cuándo.</code> Etapas: {h.etapas.join(", ")}.
      </p>
      {h.problemas.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-2xl bg-relieve px-3.5 py-2.5 text-sm outline-2 outline-aviso outline-solid">
          {h.problemas.map((p, i) => (
            <li key={i}>
              {p.linea !== null && <code className="font-mono text-xs">línea {p.linea}</code>} {p.que}
            </li>
          ))}
        </ul>
      )}
      <textarea
        id={id}
        className={`${AREA} min-h-64 font-mono text-[13px] leading-relaxed`}
        spellCheck={false}
        value={texto}
        aria-describedby={`${id}-ayuda`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setTexto(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-aviso">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={ocupada || !cambio} className={PRINCIPAL}>
          Guardar el catálogo
        </button>
        <button
          type="button"
          disabled={ocupada || !cambio}
          className={BOTON}
          onClick={() => {
            setTexto(h.texto);
            setError(null);
          }}
        >
          Deshacer
        </button>
      </div>
    </form>
  );
}

/**
 * Lo que trae la propuesta de una habilidad: dónde se usaría, qué se escribe y sus archivos,
 * enteros. Si trae scripts, él marca que los leyó: sin eso no se aprueba.
 */
export function DetalleDeHabilidad({ p, leido, setLeido }: { p: DocumentoDeMemoria; leido: boolean; setLeido: (v: boolean) => void }) {
  const h = p.habilidad!;
  const scripts = h.archivos.filter((a) => esScript(a.ruta));
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-relieve px-3.5 py-2.5 text-sm">
        <span className="text-xs font-extrabold tracking-wide text-tenue uppercase">Entra al catálogo</span>
        <p className="mt-1 font-mono text-[13px] break-words">
          - [{h.etapas.join(", ")}] {h.nombre}: {h.cuando}
        </p>
        <p className="mt-1 text-tenue">
          {etapasALaVista(h.etapas)} la {h.etapas.length === 1 ? "recibe" : "reciben"}. Se escribe en <code className="font-mono break-all">.claude/skills/{h.nombre}/</code>: {h.archivos.map((a) => a.ruta).join(", ")}.
        </p>
      </div>
      {scripts.length > 0 && (
        <p role="note" className="rounded-2xl bg-relieve px-3.5 py-2.5 text-sm outline-2 outline-aviso outline-solid">
          <strong>Trae {scripts.length === 1 ? "un script" : `${scripts.length} scripts`}.</strong> Claude Code puede correrlos cuando use la habilidad: léelos enteros antes de aprobarla.
        </p>
      )}
      {h.archivos.map((a) => (
        <figure key={a.ruta} className="flex flex-col gap-1.5">
          <figcaption className="flex flex-wrap items-baseline gap-2 text-sm">
            <code className="font-mono text-xs font-bold">{a.ruta}</code>
            {esScript(a.ruta) && <span className="rounded-full bg-relieve px-2.5 py-0.5 text-xs font-bold text-aviso">Script</span>}
          </figcaption>
          <pre className="overflow-x-auto rounded-2xl bg-relieve px-3.5 py-3 font-mono text-[13px] leading-relaxed">
            <code>{a.texto}</code>
          </pre>
        </figure>
      ))}
      {scripts.length > 0 && (
        <label htmlFor={id} className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm font-bold">
          <input id={id} type="checkbox" className="size-4" checked={leido} onChange={(e) => setLeido(e.target.checked)} />
          Leí {scripts.length === 1 ? "el script entero" : `los ${scripts.length} scripts enteros`}
        </label>
      )}
    </div>
  );
}
