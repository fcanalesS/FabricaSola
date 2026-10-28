"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Interruptor } from "@/components/laboratorio/piezas";
import { fijarAvisos, puedeAvisar, quiereAvisos } from "@/lib/fabrica/avisos-del-navegador";
import type { AjustesDeLaFabrica, RamaALaVista, RendimientoALaVista, TelefonoDeLaFabrica } from "@/lib/fabrica/cliente";
import { AGENTE_PROPIO, MODELOS_DE_CLAUDE, nombreDeCopia, PARALELO, revisarAgentePropio, ROLES_CON_MODELO, ROLES_DE_AGENTE, type ModeloDeRol, type RolConModelo, type RolDeAgente } from "@/lib/fabrica/modelos";
import { PROMPT_DE_TAREAS } from "@/lib/fabrica/prompt-de-tareas";
import { tareasPropuestas, tituloDelDocumento } from "@/lib/fabrica/requerimientos";
import { CLAVES_DE_REGLA, NOTAS_MAX, REGLAS, revisarReglas, type ClaveDeRegla, type DefinicionDeRegla, type Reglas } from "@/lib/fabrica/reglas";
import { sinComandos, type ComandosDelProyecto, type NombreDeComando, type PruebaDeComando } from "@/lib/fabrica/verificacion";
import { PARTES_DE_LA_FABRICA, parteDeLaFabrica } from "@/lib/configuracion/secciones";
import { BOTON, CAMPO, Fila, Partes, Seccion, useParteDeLaDireccion } from "./piezas";
import { SusProcesos } from "./procesos";

/**
 * La configuración de la fábrica de software, en el modo trabajo. La fábrica
 * vive en la aplicación: qué proyecto mira, crearle una factory/ básica, los
 * modelos de cada rol y convertir un documento de requerimientos en tareas.
 * Todo pasa por `/api/fabrica/ajustes`, y nada cambia sin un clic suyo. El mod
 * nikke no se ofrece: solo se avisa si está encendido, y se puede apagar.
 */

/** `claudeCode`: si este equipo tiene la ruta de Claude Code para lanzar las corridas. `enEsteEquipo`: si tiene las de Codex y Antigravity. */
type Estado = { ajustes?: AjustesDeLaFabrica; telefono?: TelefonoDeLaFabrica | null; motivo?: "no_responde"; claudeCode?: boolean; enEsteEquipo?: EnEsteEquipo };
type EnEsteEquipo = { codex: boolean; antigravity: boolean };
type Respuesta = Estado & { error?: string; personalizado?: { creado: boolean; nombre: string }; creadas?: { id: string; titulo: string }[]; documento?: string; avisos?: string[]; pruebas?: PruebaDeComando[]; limpieza?: { limpiadas: string[]; saltadas: { rama: string; motivo: string }[] }; memoria?: { creada: boolean; propuestas: number }; proceso?: { creado: boolean; archivo: string }; quitada?: { nombre: string; eraLaActiva: boolean } };

const FUENTE = { configuracion: "elegido aquí", ninguno: "sin elegir" } as const;
const PRINCIPAL = `${BOTON} bg-realce`;
type Parte = "rama" | "proyecto" | "comandos" | "reglas" | "agentes" | "gasto" | "nikke" | "modelos" | "requerimientos" | "telefono";
const PARTE: Record<string, Parte> = { rama_trabajo: "rama", proyecto: "proyecto", inicializar: "proyecto", crear_memoria: "proyecto", comandos: "comandos", probar_comandos: "comandos", agente_de_rol: "agentes", personalizar_agente: "agentes", agente_propio: "agentes", paralelo: "agentes", reglas: "reglas", notas: "reglas", topes: "gasto", limpiar_integrados: "proyecto", sin_nikke: "nikke", modelo: "modelos", modelo_de_rol: "modelos", agente_externo: "modelos", requerimientos: "requerimientos", probar_telefono: "telefono", llamar_sola: "telefono" };

export function SeccionDeLaFabrica() {
  const actual = parteDeLaFabrica(useParteDeLaDireccion());
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ocupada, setOcupada] = useState(false);
  // El aviso va junto a la parte donde él hizo clic: la sección es larga.
  const [aviso, setAviso] = useState<{ texto: string; malo: boolean; donde: Parte } | null>(null);

  useEffect(() => {
    fetch("/api/fabrica/ajustes")
      .then((r) => (r.ok ? (r.json() as Promise<Estado>) : null))
      .then((e) => setEstado(e ?? { motivo: "no_responde" }))
      .catch(() => setEstado({ motivo: "no_responde" }));
  }, []);

  /** Lo que él cambió. Devuelve lo que contestó la aplicación, o `null` si no salió. */
  async function ajustar(ajuste: Record<string, unknown>, bien: string | ((d: Respuesta) => string)): Promise<Respuesta | null> {
    const donde = PARTE[String(ajuste.ajuste)] ?? "proyecto";
    setOcupada(true);
    setAviso(null);
    try {
      const r = await fetch("/api/fabrica/ajustes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ajuste) });
      const d = (await r.json().catch(() => null)) as Respuesta | null;
      if (d && (d.ajustes || d.motivo)) setEstado({ ajustes: d.ajustes, telefono: d.telefono, motivo: d.motivo, claudeCode: d.claudeCode, enEsteEquipo: d.enEsteEquipo });
      if (!r.ok) {
        setAviso({ texto: d?.error && d.error !== "ajuste_desconocido" ? `La fábrica no lo hizo: ${d.error}` : "La fábrica no lo hizo.", malo: true, donde });
        return null;
      }
      setAviso({ texto: typeof bien === "string" ? bien : bien(d ?? {}), malo: false, donde });
      return d;
    } catch {
      setAviso({ texto: "La aplicación no responde.", malo: true, donde });
      return null;
    } finally {
      setOcupada(false);
    }
  }

  const bajada = "Vive en la aplicación: lee el factory/ del proyecto que elijas y lanza las corridas con Claude Code, en este equipo. Nada cambia sin un clic tuyo.";
  if (!estado)
    return (
      <Seccion titulo="La fábrica de software" bajada={bajada}>
        <p className="text-sm text-tenue">Mirando…</p>
      </Seccion>
    );
  if (!estado.ajustes)
    return (
      <Seccion titulo="La fábrica de software" bajada={bajada}>
        <Fila nombre="La fábrica" que="en la aplicación" estado="No se pudo leer su configuración" alerta detalle="Se guarda en datos/ajustes.json. Recarga la página; si sigue, mira la terminal donde corre la aplicación." />
      </Seccion>
    );

  const { ajustes, telefono } = estado;
  const avisoEn = (parte: Parte) =>
    aviso?.donde === parte && (
      <p role={aviso.malo ? "alert" : "status"} className={`rounded-2xl bg-relieve px-4 py-3 text-sm ${aviso.malo ? "text-aviso" : ""}`}>
        {aviso.texto}
      </p>
    );
  return (
    <Seccion titulo="La fábrica de software" bajada={bajada}>
      <Partes partes={PARTES_DE_LA_FABRICA} actual={actual} prefijo="fabrica-" etiqueta="Partes de la fábrica" />
      <div hidden={actual !== "proyecto"} className="flex flex-col gap-4">
      {/* Sin Claude Code (ni en COMPANIA_CLAUDE_CODE_BIN ni en el PATH) se configura y se mira, pero no se corre. */}
      {estado.claudeCode === false && (
        <Fila
          nombre="Claude Code"
          que="para las corridas"
          estado="No lo encontré"
          alerta
          detalle="No está en el PATH ni en COMPANIA_CLAUDE_CODE_BIN. Instálalo y reinicia la aplicación desde una terminal donde claude funcione, o pon su ruta en esa variable, en .env.local. Corre con tu sesión de Claude Code, no con una clave de la API. Lo que tiene este equipo, en Este equipo."
        />
      )}
      {/* Con otro proyecto (o ninguno), la ruta escrita empieza de nuevo: no se queda la de una línea quitada. */}
      <Proyecto key={`proyecto-${ajustes.raiz}`} ajustes={ajustes} ocupada={ocupada} ajustar={ajustar} />
      {ajustes.lineas.length > 0 && <Lineas lineas={ajustes.lineas} ocupada={ocupada} ajustar={ajustar} />}
      {ajustes.memoria && ajustes.proyecto.tieneFabrica && <SuMemoria memoria={ajustes.memoria} ocupada={ocupada} ajustar={ajustar} />}
      {ajustes.habilidades && ajustes.proyecto.tieneFabrica && <SusHabilidades habilidades={ajustes.habilidades} />}
      {ajustes.procesos && ajustes.proyecto.tieneFabrica && (
        <SusProcesos
          key={`procesos-${ajustes.raiz}`}
          procesos={ajustes.procesos}
          ocupada={ocupada}
          crear={(cual) =>
            void ajustar({ ajuste: "crear_proceso", cual }, (d) =>
              !d.proceso?.creado
                ? "Ya tenía ese proceso: no se tocó."
                : cual === "vigia"
                  ? `Quedó factory/procesos/${d.proceso.archivo}: haz commit y enciende «Que arranque solo» para que revise cada día.`
                  : cual === "evaluacion"
                    ? `Quedó factory/procesos/${d.proceso.archivo}, como borrador: pon el comando que corre tu conjunto de prueba y quítale «borrador».`
                    : `Quedó factory/procesos/${d.proceso.archivo}, como borrador: cambia sus comandos por los de este proyecto y quítale «borrador».`,
            )
          }
        />
      )}
      {ajustes.ramaTrabajo && <RamaDeTrabajo key={`rama-${ajustes.raiz}-${ajustes.ramaTrabajo.elegida}`} rama={ajustes.ramaTrabajo} ocupada={ocupada} ajustar={ajustar} />}
      {avisoEn("rama")}
      <RamasDeLaFabrica ramas={ajustes.ramas} ocupada={ocupada} ajustar={ajustar} />
      {avisoEn("proyecto")}
      {/* Por proyecto: al cambiar de proyecto se arma de nuevo, sin nada del anterior. */}
      {ajustes.comandos && <Comandos key={`comandos-${ajustes.raiz}`} proyecto={ajustes.raiz} comandos={ajustes.comandos} ocupada={ocupada} ajustar={ajustar} />}
      {avisoEn("comandos")}
      {ajustes.reglas && <ReglasDelProyecto key={`reglas-${ajustes.raiz}`} reglas={ajustes.reglas} ocupada={ocupada} ajustar={ajustar} />}
      {avisoEn("reglas")}
      {/* Aquí el mod nikke no se ofrece: la fábrica es para que trabaje sola, y sus guardas la detendrían esperando
          una firma. Si quedó encendido, se avisa y se puede apagar; encenderlo, no. */}
      {ajustes.corridaConNikke && (
        <div className="border-t border-relieve pt-4">
          <Fila
            nombre="El mod nikke"
            que="en las corridas"
            estado="Está encendido"
            alerta
            detalle="Sus guardas detienen la corrida cuando piden tu firma, y en una corrida sin interfaz nadie firma: la fábrica no puede trabajar sola. Quedó encendido de antes. Igual se apaga solo antes de cada corrida."
          >
            <button type="button" disabled={ocupada} onClick={() => void ajustar({ ajuste: "sin_nikke" }, "Las corridas van sin el mod nikke.")} className={PRINCIPAL}>
              Apagarlo
            </button>
          </Fila>
        </div>
      )}
      {avisoEn("nikke")}
      </div>
      <div hidden={actual !== "agentes"} className="flex flex-col gap-4">
      {ajustes.agentes && <Agentes agentes={ajustes.agentes} conGit={ajustes.proyecto.tieneGit} ocupada={ocupada} ajustar={ajustar} />}
      {avisoEn("agentes")}
      <Modelos ajustes={ajustes} ocupada={ocupada} ajustar={ajustar} enEsteEquipo={estado.enEsteEquipo ?? { codex: false, antigravity: false }} />
      {avisoEn("modelos")}
      </div>
      <div hidden={actual !== "gasto"} className="flex flex-col gap-4">
      <Topes key={`topes-${ajustes.topes.diarioUsd}-${ajustes.topes.corridaUsd}`} topes={ajustes.topes} hoyUsd={ajustes.gastoHoyUsd} porDia={ajustes.gastoPorDia} ocupada={ocupada} ajustar={ajustar} />
      {avisoEn("gasto")}
      </div>
      <div hidden={actual !== "tareas"} className="flex flex-col gap-4">
      <Fila nombre="La planta" que="Todas las líneas a la vez" estado="Lo que te espera, lo hecho hoy y las corridas, de cada línea" detalle="Cada línea con su cola por etapa, y las tareas de todas juntas. Contestar o dar tu veredicto se hace en la línea de la tarea.">
        <Link href="/fabrica" className={`${PRINCIPAL} flex items-center`}>
          Abrir la planta
        </Link>
      </Fila>
      <Fila nombre="La Entrada" que="Bandeja, peticiones y fuentes" estado="Lo que llega a la fábrica antes de volverse tarea" detalle="Issues de GitHub y GitLab, y lo que escribas en una petición. Nada pasa a una línea sin tu clic.">
        <Link href="/fabrica/bandeja" className={`${PRINCIPAL} flex items-center`}>
          Abrir la Entrada
        </Link>
      </Fila>
      <Requerimientos habilitada={ajustes.proyecto.tieneFabrica} ocupada={ocupada} ajustar={ajustar} />
      {avisoEn("requerimientos")}
      </div>
      <div hidden={actual !== "avisos"} className="flex flex-col gap-4">
      {telefono && <Telefono telefono={telefono} ocupada={ocupada} ajustar={ajustar} />}
      {avisoEn("telefono")}
      <AvisosDelNavegador />
      </div>
    </Seccion>
  );
}

type Ajustar = (ajuste: Record<string, unknown>, bien: string | ((d: Respuesta) => string)) => Promise<Respuesta | null>;

/**
 * Las líneas que conoce la fábrica: mirar otra, o quitar una. Quitarla es solo dejar de conocerla:
 * su repositorio, sus tareas y su memoria quedan como están, y vuelve si se elige su carpeta otra vez.
 */
function Lineas({ lineas, ocupada, ajustar }: { lineas: AjustesDeLaFabrica["lineas"]; ocupada: boolean; ajustar: Ajustar }) {
  const [quitando, setQuitando] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 border-t border-relieve pt-4">
      <p className="text-[15px] leading-tight">
        <span className="font-extrabold">Las líneas</span> <span className="text-tenue">· {lineas.length === 1 ? "1 proyecto" : `${lineas.length} proyectos`} en la fábrica</span>
      </p>
      <ul className="flex flex-col gap-2">
        {lineas.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-relieve px-4 py-3">
            <div className="min-w-0 flex-1 basis-56">
              <p className="font-bold">
                {l.nombre} {l.activa && <span className="ml-1 rounded-full bg-papel px-2 py-0.5 text-xs font-extrabold text-fondo">la que se mira</span>}
              </p>
              <p className="truncate font-mono text-xs text-tenue" title={l.raiz}>
                {l.raiz}
              </p>
            </div>
            {quitando === l.id ? (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Quitar ${l.nombre}`}>
                <p className="text-sm">Sale de la fábrica; su carpeta queda como está.</p>
                <button
                  type="button"
                  disabled={ocupada}
                  className={PRINCIPAL}
                  onClick={async () => {
                    await ajustar({ ajuste: "quitar_linea", linea: l.id }, (d) => `${d.quitada?.nombre ?? l.nombre} ya no es una línea de la fábrica.${d.quitada?.eraLaActiva ? " Era la que se miraba: elige otra arriba." : ""}`);
                    setQuitando(null);
                  }}
                >
                  Quitar
                </button>
                <button type="button" disabled={ocupada} className={BOTON} onClick={() => setQuitando(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex flex-none gap-2">
                {!l.activa && (
                  <button type="button" disabled={ocupada} className={BOTON} onClick={() => void ajustar({ ajuste: "proyecto", raiz: l.raiz }, `Ahora se mira ${l.nombre}.`)}>
                    Mirar esta
                  </button>
                )}
                <button type="button" disabled={ocupada} className={BOTON} onClick={() => setQuitando(l.id)}>
                  Quitar de la fábrica
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * El catálogo de habilidades del proyecto (`factory/habilidades.md`): cómo está. Se crea con la
 * memoria; se asignan y se aprueban en la pantalla Memoria, pestaña Habilidades.
 */
function SusHabilidades({ habilidades }: { habilidades: NonNullable<AjustesDeLaFabrica["habilidades"]> }) {
  if (!habilidades.existe)
    return (
      <Fila
        nombre="Sus habilidades"
        que="factory/habilidades.md"
        estado="Todavía no tiene catálogo"
        detalle="Qué habilidad de Claude Code usa cada etapa de la fábrica, y cuándo. Se crea con la memoria, con las que ya tiene el proyecto sin asignar: la fábrica no usa ninguna sin ti."
      />
    );
  const partes = [habilidades.usos === 1 ? "1 uso" : `${habilidades.usos} usos`, ...(habilidades.sinUsar ? [`${habilidades.sinUsar} del proyecto sin usar`] : [])];
  return (
    <Fila
      nombre="Sus habilidades"
      que="factory/habilidades.md"
      estado={partes.join(" · ")}
      alerta={habilidades.problemas > 0}
      detalle={
        habilidades.problemas
          ? `${habilidades.problemas} ${habilidades.problemas === 1 ? "línea no cumple" : "líneas no cumplen"} el formato o nombra una habilidad que no existe: la pestaña Habilidades de la memoria dice cuáles.`
          : "Una por línea: «- [construccion] nombre: cuándo.». Sin una línea ahí, la fábrica no usa una habilidad aunque exista. Se asignan en la pestaña Habilidades de la memoria."
      }
    >
      <Link href="/fabrica/memoria" className={`${BOTON} flex items-center`}>
        Abrir la memoria
      </Link>
    </Fila>
  );
}

/** La memoria del proyecto (`factory/memoria/`): cómo está y, si no tiene, crearla. */
function SuMemoria({ memoria, ocupada, ajustar }: { memoria: NonNullable<AjustesDeLaFabrica["memoria"]>; ocupada: boolean; ajustar: Ajustar }) {
  if (!memoria.existe)
    return (
      <Fila
        nombre="Su memoria"
        que="factory/memoria/"
        estado="Todavía no tiene"
        alerta
        detalle="Lo que la fábrica no puede olvidar de este proyecto. Se crea con lo que dicen sus manifiestos (base de datos, framework, versiones) como propuestas: a la ficha no entra nada sin ti. Queda en el repositorio, sin commit."
      >
        <button
          type="button"
          disabled={ocupada}
          className={PRINCIPAL}
          onClick={() =>
            void ajustar({ ajuste: "crear_memoria" }, (d) => (d.memoria?.creada ? `Memoria creada${d.memoria.propuestas ? `, con ${d.memoria.propuestas} ${d.memoria.propuestas === 1 ? "propuesta" : "propuestas"} para revisar` : ""}.` : "Ya tenía memoria: no se tocó."))
          }
        >
          Crear la memoria
        </button>
      </Fila>
    );
  const partes = [`${memoria.reglas} ${memoria.reglas === 1 ? "regla" : "reglas"}`, `${memoria.decisiones} ${memoria.decisiones === 1 ? "decisión" : "decisiones"}`, `${memoria.propuestas} por revisar`];
  return (
    <Fila
      nombre="Su memoria"
      que="factory/memoria/"
      estado={partes.join(" · ")}
      alerta={memoria.problemas > 0}
      detalle={memoria.problemas ? `${memoria.problemas} ${memoria.problemas === 1 ? "cosa no cumple" : "cosas no cumplen"} el formato del vault: la pantalla Memoria dice cuáles.` : "Archivos Markdown que se leen con grep y con cualquier IA. Las propuestas se aprueban o se rechazan en la pantalla Memoria."}
    >
      <Link href="/fabrica/memoria" className={`${memoria.propuestas ? PRINCIPAL : BOTON} flex items-center`}>
        Abrir la memoria
      </Link>
    </Fila>
  );
}

function Proyecto({ ajustes, ocupada, ajustar }: { ajustes: AjustesDeLaFabrica; ocupada: boolean; ajustar: Ajustar }) {
  const [ruta, setRuta] = useState(ajustes.raiz);
  const [buscando, setBuscando] = useState(false);
  const idRuta = useId();
  const p = ajustes.proyecto;
  const nombre = ajustes.raiz.split(/[\\/]/).filter(Boolean).at(-1) ?? ajustes.raiz;
  return (
    <div className="flex flex-col gap-3">
      <Fila
        nombre="El proyecto"
        que={FUENTE[ajustes.fuente]}
        estado={ajustes.fuente === "ninguno" ? "Todavía no hay uno" : !p.existe ? `${nombre} no existe` : !p.esCarpeta ? `${nombre} no es una carpeta` : nombre}
        alerta={ajustes.fuente === "ninguno" || !p.existe || !p.esCarpeta}
        detalle={
          ajustes.fuente === "ninguno"
            ? "Búscala abajo, o escribe la ruta de la carpeta del proyecto en que va a trabajar la fábrica."
            : [
                p.tieneFabrica ? "Tiene factory/config.md." : "No tiene factory/config.md todavía.",
                p.tieneGit ? "Es un repositorio git: puede trabajar en paralelo." : "No es un repositorio git: las tareas irán de una en una.",
              ].join(" ")
        }
      >
        {p.existe && p.esCarpeta && !p.tieneFabrica && (
          <button
            type="button"
            disabled={ocupada}
            onClick={() =>
              void ajustar({ ajuste: "inicializar" }, (d) =>
                [
                  "Quedó la factory/ del proyecto, con los comandos que se reconocieron: revísalos y pruébalos abajo.",
                  ...(d.avisos ?? []),
                ].join(" "),
              )
            }
            className={PRINCIPAL}
          >
            Crear factory/ básica
          </button>
        )}
        {ajustes.fuente === "configuracion" && (
          <button type="button" disabled={ocupada} onClick={() => void ajustar({ ajuste: "proyecto", raiz: null }, "Ya no mira ningún proyecto.")} className={BOTON}>
            Dejar de usar esta ruta
          </button>
        )}
      </Fila>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (ruta.trim()) void ajustar({ ajuste: "proyecto", raiz: ruta }, "Proyecto guardado: el tablero ya lo está mirando.");
        }}
      >
        <label htmlFor={idRuta} className="sr-only">
          La ruta del proyecto
        </label>
        <input id={idRuta} value={ruta} onChange={(e) => setRuta(e.target.value)} placeholder="La carpeta del proyecto, la que tiene o va a tener factory/" spellCheck={false} className={`${CAMPO} min-w-0 flex-1 basis-72 font-mono`} />
        <button type="button" onClick={() => setBuscando((b) => !b)} aria-expanded={buscando} className={BOTON}>
          {buscando ? "Cerrar" : "Buscar la carpeta"}
        </button>
        <button type="submit" disabled={ocupada || !ruta.trim()} className={PRINCIPAL}>
          Usar este proyecto
        </button>
      </form>
      {buscando && (
        <Explorador
          desde={ajustes.raiz || null}
          ocupada={ocupada}
          alElegir={async (elegida) => {
            setRuta(elegida);
            if (await ajustar({ ajuste: "proyecto", raiz: elegida }, "Proyecto guardado: el tablero ya lo está mirando.")) setBuscando(false);
          }}
        />
      )}
      <p className="-mt-1 text-sm text-tenue">Se guarda en datos/ajustes.json, solo en este equipo.</p>
    </div>
  );
}

const NOMBRE_DEL_COMANDO: Record<NombreDeComando, string> = { build: "Compilar", test: "Pruebas", lint: "Lint" };
const RESULTADO: Record<PruebaDeComando["resultado"], string> = { ok: "ok", fallo: "falló", vacio: "sin comando", omitido: "se prueba en cada tarea" };

/**
 * Los comandos con que la fábrica verifica cada tarea del proyecto elegido, de su
 * factory/config.md: se ven, se editan y se prueban aquí, antes de una corrida. Se guardan en
 * ese mismo archivo sin tocar el resto. Lo que se escribió y no se guardó no pasa a otro proyecto.
 */
function Comandos({ proyecto, comandos, ocupada, ajustar }: { proyecto: string; comandos: ComandosDelProyecto; ocupada: boolean; ajustar: Ajustar }) {
  const [valores, setValores] = useState<ComandosDelProyecto>(comandos);
  const [pruebas, setPruebas] = useState<PruebaDeComando[] | null>(null);
  const [probando, setProbando] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const nombre = proyecto.split(/[\\/]/).filter(Boolean).at(-1) ?? proyecto;
  const cambiados = (["build", "test", "lint", "ramaBase"] as const).some((k) => valores[k].trim() !== comandos[k].trim());
  const faltan = sinComandos(valores);

  // Desde el tablero se llega aquí con #comandos: la sección aparece después de leer los ajustes.
  useEffect(() => {
    if (window.location.hash === "#comandos") raiz.current?.scrollIntoView({ block: "start" });
  }, []);

  async function guardar() {
    const d = await ajustar({ ajuste: "comandos", comandos: valores }, `Guardados en factory/config.md de ${nombre}. Valen desde la próxima corrida.`);
    if (d?.ajustes?.comandos) setValores(d.ajustes.comandos);
  }
  async function probar() {
    setProbando(true);
    setPruebas(null);
    const d = await ajustar({ ajuste: "probar_comandos" }, (r) => {
      const fallaron = (r.pruebas ?? []).filter((p) => p.resultado === "fallo").length;
      return fallaron ? `${fallaron === 1 ? "Falló un comando" : `Fallaron ${fallaron} comandos`}: mira la salida abajo.` : "Los comandos corrieron bien.";
    });
    setPruebas(d?.pruebas ?? null);
    setProbando(false);
  }

  return (
    <div ref={raiz} id="comandos" className="flex scroll-mt-4 flex-col gap-3 border-t border-relieve pt-4">
      <div>
        <p className="text-[15px] leading-tight">
          <span className="font-extrabold">Los comandos del proyecto</span> <span className="text-tenue">· {nombre}</span>
        </p>
        <p className="mt-1 text-sm text-tenue">
          Con estos verifica la fábrica cada tarea, en su worktree. En lint, <span className="font-mono">{"{archivos}"}</span> se cambia por los archivos que cambió la tarea.
        </p>
      </div>
      {faltan && (
        <p role="alert" className="text-sm font-bold text-aviso">
          Sin build, test ni lint la fábrica no corre: cada tarea terminaría esperándote.
        </p>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        {(["build", "test", "lint"] as const).map((n) => (
          <label key={n} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-none basis-24 font-bold">{NOMBRE_DEL_COMANDO[n]}</span>
            <input
              value={valores[n]}
              onChange={(e) => setValores((v) => ({ ...v, [n]: e.target.value }))}
              placeholder="vacío: no se corre"
              spellCheck={false}
              className={`${CAMPO} min-w-0 flex-1 basis-64 font-mono`}
            />
          </label>
        ))}
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-none basis-24 font-bold">Rama base</span>
          <input
            value={valores.ramaBase}
            onChange={(e) => setValores((v) => ({ ...v, ramaBase: e.target.value }))}
            spellCheck={false}
            className={`${CAMPO} min-w-0 flex-1 basis-40 font-mono`}
          />
        </label>
        <p className="text-sm text-tenue">Cada tarea sale de la rama en que estés trabajando al empezarla; la rama base solo vale para las tareas de antes.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={ocupada || probando || cambiados} title={cambiados ? "Guarda primero: se prueban los que están en config.md." : undefined} onClick={() => void probar()} className={BOTON}>
            {probando ? "Probando…" : "Probar comandos"}
          </button>
          <button type="submit" disabled={ocupada || !cambiados || !valores.ramaBase.trim()} className={PRINCIPAL}>
            Guardar
          </button>
        </div>
      </form>
      {pruebas && (
        <ul aria-label="Cómo salieron los comandos" className="flex flex-col gap-2">
          {pruebas.map((p) => (
            <li key={p.nombre} className="rounded-2xl bg-fondo px-3 py-2 text-sm">
              <p>
                <span className="font-bold">{NOMBRE_DEL_COMANDO[p.nombre]}</span>{" "}
                <span className={p.resultado === "fallo" ? "font-bold text-aviso" : "text-tenue"}>
                  · {RESULTADO[p.resultado]}
                  {p.resultado === "fallo" && p.codigo !== null ? ` (código ${p.codigo})` : ""}
                  {p.ms > 0 ? ` · ${Math.max(1, Math.round(p.ms / 1000))} s` : ""}
                </span>
              </p>
              {p.salida && <pre className="mt-1.5 max-h-56 overflow-auto font-mono text-[12px] leading-snug break-words whitespace-pre-wrap text-tenue">{p.salida}</pre>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * La rama donde trabaja él: de ahí salen las tareas y ahí se integran. Sin elegir, la que tenga
 * activa la raíz. Nunca main ni master: no se ofrecen, y el plugin las frena.
 */
function RamaDeTrabajo({ rama, ocupada, ajustar }: { rama: NonNullable<AjustesDeLaFabrica["ramaTrabajo"]>; ocupada: boolean; ajustar: Ajustar }) {
  const protegida = (r: string | null) => !!r && ["main", "master"].includes(r.toLowerCase());
  const destino = rama.elegida || rama.raizEn;
  const aviso =
    !rama.elegida && protegida(rama.raizEn)
      ? `La raíz está en «${rama.raizEn}»: así la fábrica no corre. Elige tu rama de trabajo.`
      : rama.elegida && rama.raizEn && rama.raizEn !== rama.elegida
        ? `La raíz está en «${rama.raizEn}»: las tareas salen de «${rama.elegida}», pero para integrarlas la raíz tiene que estar en esa rama. Mientras, esperan.`
        : null;
  return (
    <Fila
      nombre="La rama de trabajo"
      que="de ahí salen las tareas y ahí se integran"
      estado={destino ? `Integra en «${destino}»` : "Sin rama: la raíz no está en ninguna"}
      alerta={!!aviso}
      detalle={aviso ?? "Nunca en main ni en master: lo que llega ahí lo llevas tú. Se guarda en factory/config.md."}
    >
      <select
        value={rama.elegida}
        disabled={ocupada}
        aria-label="La rama de trabajo"
        onChange={(e) => void ajustar({ ajuste: "rama_trabajo", valor: e.target.value }, e.target.value ? `Las tareas nuevas salen de «${e.target.value}» y se integran ahí.` : "Las tareas nuevas salen de la rama en que esté la raíz.")}
        className={`${SELECTOR} max-w-64`}
      >
        <option value="">La de la raíz{rama.raizEn ? ` (${rama.raizEn})` : ""}</option>
        {rama.opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {rama.elegida && !rama.opciones.includes(rama.elegida) && <option value={rama.elegida}>{rama.elegida} · ya no existe</option>}
      </select>
    </Fila>
  );
}

/** Cómo se dice una rama de la fábrica que ya no usa ninguna tarea: de qué tarea era y en qué quedó. */
function deQueEs(r: RamaALaVista): string {
  const quedo = r.estado === "hecho" ? "terminada" : r.estado === "descartada" ? "descartada" : r.estado ? r.estado : "su tarea ya no existe";
  return `${r.rama.replace(/^fabrica\//, "")} (${quedo})`;
}

/**
 * Las ramas de la fábrica que ya no sirven: las integradas se limpian todas con un clic (con su
 * worktree, si lo tienen); las que tienen commits sin integrar van aparte, y solo se borran las que
 * él elige, porque se pierde ese trabajo. Las de tareas en curso no se tocan.
 */
function RamasDeLaFabrica({ ramas, ocupada, ajustar }: { ramas: AjustesDeLaFabrica["ramas"]; ocupada: boolean; ajustar: Ajustar }) {
  const [confirmando, setConfirmando] = useState<"integradas" | "elegidas" | null>(null);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const { integradas, sinIntegrar, enCurso } = ramas;
  if (!integradas.length && !sinIntegrar.length && !enCurso.length) return null;
  const limpiar = (sinIntegrarElegidas: string[]) => {
    setConfirmando(null);
    void ajustar({ ajuste: "limpiar_ramas", sinIntegrar: sinIntegrarElegidas }, (d) => {
      const l = d.limpieza;
      if (!l) return "Listo.";
      setElegidas([]);
      return [l.limpiadas.length ? `Se ${l.limpiadas.length === 1 ? "borró" : "borraron"} ${l.limpiadas.join(", ")}.` : "No se borró ninguna.", ...l.saltadas.map((x) => `${x.rama}: ${x.motivo}.`)].join(" ");
    });
  };
  const commitsElegidos = sinIntegrar.filter((r) => elegidas.includes(r.rama)).reduce((t, r) => t + (r.commits ?? 0), 0);
  return (
    <div className="flex flex-col gap-3 border-t border-relieve pt-4">
      <div>
        <p className="text-[15px] leading-tight">
          <span className="font-extrabold">Las ramas de la fábrica</span> <span className="text-tenue">· las fabrica/* que ya no usa ninguna tarea</span>
        </p>
        <p className="mt-1 text-sm text-tenue">
          {enCurso.length ? `${enCurso.length} ${enCurso.length === 1 ? "es de una tarea en curso" : "son de tareas en curso"}, o de la rama en que estás, y no se ${enCurso.length === 1 ? "toca" : "tocan"}. ` : ""}Antes de limpiar se olvidan los worktrees cuya carpeta ya no está. Un worktree con cambios sin commit no se quita.
        </p>
      </div>
      {integradas.length > 0 && (
        <Fila
          nombre="Integradas"
          que="su código ya está en su rama"
          estado={`${integradas.length} ${integradas.length === 1 ? "rama" : "ramas"}`}
          detalle={`${integradas.slice(0, 10).map(deQueEs).join(", ")}${integradas.length > 10 ? "…" : ""}. Borrarlas no pierde nada.`}
        >
          {confirmando === "integradas" ? (
            <>
              <button type="button" onClick={() => setConfirmando(null)} className={BOTON}>
                Cancelar
              </button>
              <button type="button" disabled={ocupada} onClick={() => limpiar([])} className={PRINCIPAL}>
                Borrar {integradas.length}
              </button>
            </>
          ) : (
            <button type="button" disabled={ocupada} onClick={() => setConfirmando("integradas")} className={BOTON}>
              Limpiar las integradas
            </button>
          )}
        </Fila>
      )}
      {sinIntegrar.length > 0 && (
        <fieldset className="flex flex-col gap-2 border-t border-relieve pt-4">
          <legend className="text-[15px] leading-tight">
            <span className="font-extrabold">Sin integrar</span> <span className="text-tenue">· tienen commits que su rama no tiene: borrarlas los pierde</span>
          </legend>
          {sinIntegrar.map((r) => (
            <label key={r.rama} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm pointer-coarse:min-h-11">
              <input type="checkbox" checked={elegidas.includes(r.rama)} onChange={(e) => setElegidas((v) => (e.target.checked ? [...v, r.rama] : v.filter((x) => x !== r.rama)))} className="size-4 accent-acento" />
              <span className="min-w-0 break-all">
                <span className="font-bold">{deQueEs(r)}</span>
                <span className="text-tenue">
                  {" "}· {r.commits === null ? "no se pudo saber cuántos commits" : `${r.commits} ${r.commits === 1 ? "commit" : "commits"}`} que no están en {r.base}
                  {r.conWorktree ? " · con su worktree" : ""}
                </span>
              </span>
            </label>
          ))}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {confirmando === "elegidas" ? (
              <>
                <span className="mr-auto text-sm text-peligro">Se pierden {commitsElegidos} {commitsElegidos === 1 ? "commit" : "commits"}: no se pueden recuperar desde aquí.</span>
                <button type="button" onClick={() => setConfirmando(null)} className={BOTON}>
                  Cancelar
                </button>
                <button type="button" disabled={ocupada} onClick={() => limpiar(elegidas)} className={`${BOTON} text-peligro`}>
                  Sí, borrar {elegidas.length}
                </button>
              </>
            ) : (
              <button type="button" disabled={ocupada || !elegidas.length} onClick={() => setConfirmando("elegidas")} className={`${BOTON} text-peligro`}>
                Borrar las elegidas
              </button>
            )}
          </div>
        </fieldset>
      )}
    </div>
  );
}

/**
 * Las demás reglas de la fábrica en este proyecto (quién aprueba, si se integra sola, cuántas
 * vueltas, Jev, el lint por archivos, los .sql, los worktrees) y las notas que leen sus agentes. Se
 * guardan en su factory/config.md sin tocar el resto, para no tener que editarlo a mano.
 */
function ReglasDelProyecto({ reglas, ocupada, ajustar }: { reglas: NonNullable<AjustesDeLaFabrica["reglas"]>; ocupada: boolean; ajustar: Ajustar }) {
  const [valores, setValores] = useState<Reglas>(reglas.reglas);
  const [notas, setNotas] = useState(reglas.notas);
  const idNotas = useId();
  const cambiadas = CLAVES_DE_REGLA.filter((k) => valores[k] !== reglas.reglas[k]);
  const revision = revisarReglas(Object.fromEntries(cambiadas.map((k) => [k, valores[k]])));
  const error = "error" in revision ? revision.error : null;
  const campo = (clave: ClaveDeRegla) => {
    const d: DefinicionDeRegla = REGLAS[clave];
    const poner = (v: string) => setValores((x) => ({ ...x, [clave]: v }));
    return (
      <label key={clave} className="flex flex-col gap-1 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 basis-40 font-bold">{d.nombre}</span>
          {d.tipo === "opcion" ? (
            <select value={valores[clave]} disabled={ocupada} onChange={(e) => poner(e.target.value)} className={`${SELECTOR} min-w-0 max-w-full`}>
              {d.opciones.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </select>
          ) : d.tipo === "entero" ? (
            <input type="number" min={d.min} max={d.max} step={1} value={valores[clave]} disabled={ocupada} onChange={(e) => poner(e.target.value)} className={`${CAMPO} w-24`} />
          ) : (
            <input value={valores[clave]} disabled={ocupada} onChange={(e) => poner(e.target.value)} placeholder={d.marcador ?? "vacío"} spellCheck={false} className={`${CAMPO} min-w-0 flex-1 basis-64 font-mono`} />
          )}
        </span>
        <span className="text-[13px] text-tenue">{d.ayuda}</span>
      </label>
    );
  };
  return (
    <div className="flex flex-col gap-3 border-t border-relieve pt-4">
      <div>
        <p className="text-[15px] leading-tight">
          <span className="font-extrabold">Las reglas del proyecto</span> <span className="text-tenue">· cómo trabaja la fábrica aquí</span>
        </p>
        <p className="mt-1 text-sm text-tenue">Se guardan en factory/config.md de este proyecto, sin tocar lo demás. Valen desde la próxima corrida.</p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!("reglas" in revision)) return;
          void ajustar({ ajuste: "reglas", reglas: revision.reglas }, `Guardado: ${cambiadas.map((k) => REGLAS[k].nombre.toLowerCase()).join(", ")}.`);
        }}
      >
        {CLAVES_DE_REGLA.map(campo)}
        {error && (
          <p role="alert" className="text-sm text-aviso">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={ocupada || !cambiadas.length} onClick={() => setValores(reglas.reglas)} className={BOTON}>
            Deshacer
          </button>
          <button type="submit" disabled={ocupada || !cambiadas.length || !!error} className={PRINCIPAL}>
            Guardar las reglas
          </button>
        </div>
      </form>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ajustar({ ajuste: "notas", notas }, "Notas guardadas: las leen los agentes desde la próxima corrida.");
        }}
      >
        <label htmlFor={idNotas} className="text-sm font-bold">
          Notas para los agentes <span className="font-normal text-tenue">· convenciones, carpetas que no se tocan, skills del proyecto</span>
        </label>
        <textarea
          id={idNotas}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={6}
          maxLength={NOTAS_MAX}
          spellCheck={false}
          className="min-h-32 w-full resize-y rounded-2xl bg-relieve px-3.5 py-2.5 font-mono text-[13px] leading-relaxed outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-papel"
        />
        <div className="flex items-center justify-end gap-2">
          <span className="text-[13px] text-tenue">
            {notas.length} / {NOTAS_MAX}
          </span>
          <button type="submit" disabled={ocupada || notas.trim() === reglas.notas.trim()} className={PRINCIPAL}>
            Guardar las notas
          </button>
        </div>
      </form>
    </div>
  );
}

type Listado = { ruta: string; padre: string | null; carpetas: { nombre: string; ruta: string; git: boolean; fabrica: boolean }[]; unidades: string[]; git: boolean; fabrica: boolean };

/**
 * Para elegir la carpeta sin escribirla: se entra carpeta por carpeta desde la del usuario, y se
 * elige la que se está mirando. Dice cuáles son repositorios git y cuáles ya tienen factory/. Lo
 * lista el servidor (`/api/fabrica/carpetas`): el navegador no puede dar la ruta de una carpeta.
 */
function Explorador({ desde, ocupada, alElegir }: { desde: string | null; ocupada: boolean; alElegir: (ruta: string) => void }) {
  const [listado, setListado] = useState<Listado | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const leer = (ruta: string | null) =>
    fetch(`/api/fabrica/carpetas${ruta ? `?ruta=${encodeURIComponent(ruta)}` : ""}`)
      .then(async (r) => ({ ok: r.ok, d: (await r.json().catch(() => null)) as (Listado & { error?: string }) | null }))
      .catch(() => ({ ok: false, d: null }));
  const mostrar = ({ ok, d }: { ok: boolean; d: (Listado & { error?: string }) | null }) => {
    if (ok && d) {
      setListado(d);
      setProblema(null);
    } else setProblema(d?.error ?? "La aplicación no responde.");
  };
  const ir = (ruta: string | null) => leer(ruta).then(mostrar);
  // Parte donde está el proyecto elegido, o en la carpeta del usuario.
  useEffect(() => {
    let vivo = true;
    void leer(desde).then((r) => vivo && mostrar(r));
    return () => {
      vivo = false;
    };
  }, [desde]);
  const marcas = (c: { git: boolean; fabrica: boolean }) => [c.fabrica && "factory/", c.git && "git"].filter(Boolean) as string[];
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-fondo p-3">
      {problema && <p role="alert" className="text-sm text-aviso">{problema}</p>}
      {listado && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 basis-60 font-mono text-[13px] break-all">{listado.ruta}</p>
            {listado.unidades.length > 1 &&
              listado.unidades.map((u) => (
                <button key={u} type="button" onClick={() => void ir(u)} className={BOTON}>
                  {u}
                </button>
              ))}
            <button type="button" disabled={!listado.padre} onClick={() => void ir(listado.padre)} className={BOTON}>
              Subir
            </button>
            <button type="button" disabled={ocupada} onClick={() => alElegir(listado.ruta)} className={PRINCIPAL}>
              Usar esta carpeta
            </button>
          </div>
          {marcas(listado).length > 0 && <p className="text-sm text-tenue">Esta carpeta: {marcas(listado).join(" · ")}.</p>}
          {listado.carpetas.length === 0 ? (
            <p className="text-sm text-tenue">No tiene carpetas adentro.</p>
          ) : (
            <ul aria-label="Las carpetas de adentro" className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {listado.carpetas.map((c) => (
                <li key={c.ruta}>
                  <button type="button" onClick={() => void ir(c.ruta)} className="flex min-h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-ficha focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-papel">
                    <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                    {marcas(c).map((m) => (
                      <span key={m} className={`flex-none rounded-full px-2 text-xs font-bold ${m === "factory/" ? "bg-realce text-texto" : "bg-ficha text-tenue"}`}>
                        {m}
                      </span>
                    ))}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Qué agente hace cada etapa en este proyecto y cuántas tareas trabaja a la vez: se guarda en su
 * factory/config.md. Se elige entre los de la fábrica, los tuyos, los del proyecto y los de tus
 * plugins. Los de nikke viajan con la corrida sin sus guardas.
 */
function Agentes({ agentes, conGit, ocupada, ajustar }: { agentes: NonNullable<AjustesDeLaFabrica["agentes"]>; conGit: boolean; ocupada: boolean; ajustar: Ajustar }) {
  const origenes = [...new Set(agentes.disponibles.map((a) => a.origen))];
  const descripcion = (nombre: string) => agentes.disponibles.find((a) => a.nombre === nombre)?.descripcion ?? "";
  // La etapa cuyo agente propio se está editando: una a la vez.
  const [editando, setEditando] = useState<RolDeAgente | null>(null);
  return (
    <div className="flex flex-col gap-3 border-t border-relieve pt-4">
      <div>
        <p className="text-[15px] leading-tight">
          <span className="font-extrabold">Los agentes</span> <span className="text-tenue">· quién hace cada etapa, y cuántas tareas a la vez</span>
        </p>
        <p className="mt-1 text-sm text-tenue">Se guarda en factory/config.md de este proyecto. Los de nikke viajan con cada corrida sin sus guardas, que la frenarían esperando tu firma.</p>
        <p className="mt-1 text-sm text-tenue">
          Con «Personalizar», la etapa usa tu propia copia del agente de la fábrica, en .claude/agents/ del proyecto, y la editas aquí. La aplicación no hace commit.
        </p>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 basis-40 font-bold">
          Tareas a la vez <span className="font-normal text-tenue">· {conGit ? "cada una en su worktree" : "sin git van de a una"}</span>
        </span>
        <select
          value={agentes.paraleloMax}
          disabled={ocupada}
          onChange={(e) => void ajustar({ ajuste: "paralelo", valor: Number(e.target.value) }, `La fábrica trabaja hasta ${e.target.value} ${e.target.value === "1" ? "tarea" : "tareas"} a la vez, desde la próxima corrida.`)}
          className={SELECTOR}
        >
          {Array.from({ length: PARALELO.max - PARALELO.min + 1 }, (_, i) => PARALELO.min + i).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {(Object.entries(ROLES_DE_AGENTE) as [RolDeAgente, (typeof ROLES_DE_AGENTE)[RolDeAgente]][]).map(([rol, { nombre, defecto }]) => {
        const valor = agentes.porRol[rol];
        const elegido = valor === "auto" ? defecto : valor;
        return (
          <div key={rol} className="flex flex-col gap-1">
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 basis-40 font-bold">{nombre}</span>
              <select
                value={valor}
                disabled={ocupada}
                onChange={(e) => void ajustar({ ajuste: "agente_de_rol", rol, valor: e.target.value }, `${nombre}: ${e.target.value === "auto" ? "el de la fábrica" : e.target.value}, desde la próxima corrida.`)}
                className={`${SELECTOR} min-w-0 max-w-full basis-64`}
              >
                <option value="auto">Automático · {defecto}</option>
                {origenes.map((o) => (
                  <optgroup key={o} label={o}>
                    {agentes.disponibles
                      .filter((a) => a.origen === o)
                      .map((a) => (
                        <option key={a.nombre} value={a.nombre}>
                          {a.nombre}
                          {a.enCorridas === "inyectado" ? " · sin sus guardas" : ""}
                        </option>
                      ))}
                  </optgroup>
                ))}
                {valor !== "auto" && !agentes.disponibles.some((a) => a.nombre === valor) && <option value={valor}>{valor} · no está en este equipo</option>}
              </select>
            </label>
            {descripcion(elegido) && <p className="line-clamp-2 text-[13px] text-tenue">{descripcion(elegido)}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {valor === nombreDeCopia(rol) ? (
                <>
                  <button type="button" disabled={ocupada} aria-expanded={editando === rol} onClick={() => setEditando(editando === rol ? null : rol)} className={BOTON}>
                    {editando === rol ? "Cerrar" : "Editar"}
                  </button>
                  <button
                    type="button"
                    disabled={ocupada}
                    onClick={() => {
                      setEditando(null);
                      void ajustar({ ajuste: "agente_de_rol", rol, valor: "auto" }, `${nombre}: vuelve el de la fábrica, desde la próxima corrida. Tu copia sigue en .claude/agents/${nombreDeCopia(rol)}.md.`);
                    }}
                    className={BOTON}
                  >
                    Volver al de la fábrica
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={ocupada}
                  onClick={async () => {
                    const d = await ajustar({ ajuste: "personalizar_agente", rol }, (d) =>
                      d.personalizado?.creado
                        ? `${nombre}: tu copia quedó en .claude/agents/${nombreDeCopia(rol)}.md, y es la de esta etapa desde la próxima corrida.`
                        : `${nombre}: ya tenías una copia en .claude/agents/${nombreDeCopia(rol)}.md. No se tocó, y vuelve a ser la de esta etapa.`,
                    );
                    if (d) setEditando(rol);
                  }}
                  className={BOTON}
                >
                  Personalizar
                </button>
              )}
            </div>
            {editando === rol && valor === nombreDeCopia(rol) && <EditorDeAgente key={rol} rol={rol} nombre={nombre} ocupada={ocupada} ajustar={ajustar} />}
          </div>
        );
      })}
      <Rendimiento />
    </div>
  );
}

/** Lo que la fábrica espera de cada etapa: si se quita de las instrucciones, la corrida se traba. */
const LO_QUE_ESPERA: Record<RolDeAgente, string> = {
  spec: "escribir la sección ## Spec de la tarea, o contestar PEDIDO AMBIGUO con sus preguntas",
  construccion: "construir lo que dice la ## Spec, solo dentro del worktree de la tarea",
  revision_codigo: "escribir sus hallazgos como BLOQUEANTE o MENOR, con ruta:línea",
  revision_seguridad: "escribir sus hallazgos como BLOQUEANTE o MENOR, con ruta:línea",
  ui: "escribir sus hallazgos como BLOQUEANTE o MENOR, con ruta:línea",
  aprobacion: "registrar su veredicto con mcp__fabrica__aprobar",
};

/**
 * El agente propio de una etapa, para editarlo: su descripción y sus instrucciones. Se lee al
 * abrirlo, de .claude/agents/ del proyecto. Su nombre, sus herramientas y su modelo no se editan:
 * los pone la fábrica.
 */
function EditorDeAgente({ rol, nombre, ocupada, ajustar }: { rol: RolDeAgente; nombre: string; ocupada: boolean; ajustar: Ajustar }) {
  const [leido, setLeido] = useState<{ descripcion: string; instrucciones: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const idDescripcion = useId();
  const idInstrucciones = useId();

  useEffect(() => {
    let vigente = true;
    fetch(`/api/fabrica/ajustes?agente=${rol}`)
      .then(async (r) => {
        const d = (await r.json().catch(() => null)) as { agente?: { descripcion: string; instrucciones: string } | null; error?: string } | null;
        if (!vigente) return;
        if (!r.ok || !d) return setError(d?.error ? `No se pudo leer: ${d.error}` : "No se pudo leer tu copia.");
        if (!d.agente) return setError(`No encontré .claude/agents/${nombreDeCopia(rol)}.md: vuelve a personalizar esta etapa.`);
        setLeido(d.agente);
        setDescripcion(d.agente.descripcion);
        setInstrucciones(d.agente.instrucciones);
      })
      .catch(() => vigente && setError("La aplicación no responde."));
    return () => {
      vigente = false;
    };
  }, [rol]);

  if (error) return <p role="alert" className="rounded-2xl bg-relieve px-4 py-3 text-sm text-aviso">{error}</p>;
  if (!leido) return <p className="text-[13px] text-tenue">Leyendo tu copia…</p>;

  const revisado = revisarAgentePropio({ descripcion, instrucciones });
  const cambiado = descripcion !== leido.descripcion || instrucciones !== leido.instrucciones;
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl border border-relieve p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if ("error" in revisado) return;
        const d = await ajustar({ ajuste: "agente_propio", rol, ...revisado }, `${nombre}: tu agente quedó guardado. Vale desde la próxima corrida.`);
        if (!d) return;
        // Queda como se guardó: en una línea la descripción, y sin espacios de más.
        setLeido(revisado);
        setDescripcion(revisado.descripcion);
        setInstrucciones(revisado.instrucciones);
      }}
    >
      <p className="text-[13px] text-tenue">
        Está en .claude/agents/{nombreDeCopia(rol)}.md de este proyecto: con un commit, viaja con el repositorio. Su nombre, sus herramientas y su modelo los pone la fábrica. Esta etapa tiene que {LO_QUE_ESPERA[rol]}: si
        lo quitas de las instrucciones, la corrida se traba.
      </p>
      <label htmlFor={idDescripcion} className="text-sm font-bold">
        Descripción <span className="font-normal text-tenue">· lo que lee el orquestador para saber qué hace</span>
      </label>
      <input id={idDescripcion} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={AGENTE_PROPIO.descripcionMax} className={`${CAMPO} w-full`} />
      <label htmlFor={idInstrucciones} className="text-sm font-bold">
        Instrucciones
      </label>
      <textarea
        id={idInstrucciones}
        value={instrucciones}
        onChange={(e) => setInstrucciones(e.target.value)}
        rows={16}
        spellCheck={false}
        className="min-h-48 w-full resize-y rounded-2xl bg-relieve px-3.5 py-2.5 font-mono text-[13px] leading-relaxed outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-papel"
      />
      {cambiado && "error" in revisado && (
        <p role="alert" className="text-[13px] text-aviso">
          {revisado.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={ocupada || !cambiado}
          onClick={() => {
            setDescripcion(leido.descripcion);
            setInstrucciones(leido.instrucciones);
          }}
          className={BOTON}
        >
          Deshacer los cambios
        </button>
        <button type="submit" disabled={ocupada || !cambiado || "error" in revisado} className={PRINCIPAL}>
          Guardar el agente
        </button>
      </div>
    </form>
  );
}

const minutosTexto = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

/**
 * Cuánto rindió cada agente en este proyecto, de sus corridas: para elegir con datos quién va en
 * cada rol. Se pide al mostrar la sección, no con los ajustes: sale de leer todas las corridas.
 */
function Rendimiento() {
  const [r, setR] = useState<RendimientoALaVista | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vigente = true;
    void fetch("/api/fabrica/rendimiento")
      .then(async (x) => (x.ok ? ((await x.json()) as RendimientoALaVista) : Promise.reject(new Error(String(x.status)))))
      .then((d) => vigente && setR(d))
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, []);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold">
        Cómo les fue <span className="font-normal text-tenue">{r ? `· en ${r.corridas} ${r.corridas === 1 ? "corrida" : "corridas"} de este proyecto` : ""}</span>
      </p>
      {error && <p className="text-[13px] text-tenue">No se pudo leer cómo les fue.</p>}
      {!r && !error && <p className="text-[13px] text-tenue">Leyendo sus corridas…</p>}
      {r && !r.agentes.length && <p className="text-[13px] text-tenue">Todavía no hay corridas con actividad en este proyecto.</p>}
      {r && r.agentes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {r.agentes.map((a) => (
            <li key={a.agente} className="flex flex-col rounded-2xl bg-fondo px-3 py-2 text-[13px] leading-snug">
              <span className="font-bold break-all">{a.agente}</span>
              <span className="text-tenue">
                {a.encargos} {a.encargos === 1 ? "encargo" : "encargos"} en {a.tareas} {a.tareas === 1 ? "tarea" : "tareas"} · {minutosTexto(a.minutos)}
                {a.usd !== null && ` · ≈ ${usdTexto(a.usd)}`}
                {a.devolvio > 0 && ` · devolvió ${a.devolvio}`}
                {a.leDevolvieron > 0 && ` · le devolvieron ${a.leDevolvieron}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {r && r.agentes.length > 0 && <p className="text-xs text-tenue">El costo es aproximado: cada llamada se reparte entre los encargos abiertos a su hora, según la estimación de Claude Code.</p>}
      {r && r.habilidades.length > 0 && (
        <>
          <p className="mt-2 text-sm font-bold">Con qué habilidades</p>
          <ul className="flex flex-col gap-1.5">
            {r.habilidades.map((h) => (
              <li key={h.nombre} className="flex flex-col rounded-2xl bg-fondo px-3 py-2 text-[13px] leading-snug">
                <span className="font-bold break-all">{h.nombre}</span>
                <span className="text-tenue">
                  {h.tareas} {h.tareas === 1 ? "tarea" : "tareas"}
                  {h.etapas.length > 0 && ` en ${h.etapas.join(", ")}`}
                  {` · ${h.volvieron === 0 ? "ninguna volvió" : `${h.volvieron} ${h.volvieron === 1 ? "volvió" : "volvieron"}`} a construcción`}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-tenue">Cuenta las tareas cuyo agente de esa etapa la trajo cargada. Que una vuelva no dice que la habilidad falló: dice dónde mirar.</p>
        </>
      )}
    </div>
  );
}

const usdTexto = (v: number) => `${v.toLocaleString("es", { maximumFractionDigits: 2 })} USD`;

/**
 * Hasta cuánto gasta la fábrica: por día en el proyecto y por corrida, según la estimación de
 * Claude Code. Al llegar, la corrida en marcha se detiene sola y no se lanza otra. Vacío: sin tope.
 */
function Topes({ topes, hoyUsd, porDia, ocupada, ajustar }: { topes: AjustesDeLaFabrica["topes"]; hoyUsd: number; porDia: AjustesDeLaFabrica["gastoPorDia"]; ocupada: boolean; ajustar: Ajustar }) {
  const [diario, setDiario] = useState(topes.diarioUsd?.toString() ?? "");
  const [corrida, setCorrida] = useState(topes.corridaUsd?.toString() ?? "");
  const leer = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const valido = (v: number | null) => v === null || (Number.isFinite(v) && v > 0 && v <= 10_000);
  const d = leer(diario);
  const c = leer(corrida);
  const cambio = d !== topes.diarioUsd || c !== topes.corridaUsd;
  return (
    <form
      className="flex flex-col gap-3 border-t border-relieve pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        void ajustar({ ajuste: "topes", diarioUsd: d, corridaUsd: c }, d === null && c === null ? "Sin topes de gasto." : "Topes guardados: valen desde ahora, también para la corrida en marcha.");
      }}
    >
      <div>
        <p className="text-[15px] leading-tight">
          <span className="font-extrabold">El gasto</span> <span className="text-tenue">· hoy van {usdTexto(hoyUsd)} en este proyecto</span>
        </p>
        <p className="mt-1 text-sm text-tenue">Al llegar a un tope, la corrida en marcha se detiene sola y no se lanza otra. Es la estimación de Claude Code, no la factura. Vacío: sin tope.</p>
      </div>
      <GastoPorDia porDia={porDia} tope={topes.diarioUsd ?? null} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex min-w-0 flex-1 basis-56 items-center gap-2">
          <span className="font-bold">Por día</span>
          <input value={diario} onChange={(e) => setDiario(e.target.value)} inputMode="decimal" placeholder="sin tope" className={`${CAMPO} w-28`} aria-invalid={!valido(d)} />
          <span className="text-tenue">USD</span>
        </label>
        <label className="flex min-w-0 flex-1 basis-56 items-center gap-2">
          <span className="font-bold">Por corrida</span>
          <input value={corrida} onChange={(e) => setCorrida(e.target.value)} inputMode="decimal" placeholder="sin tope" className={`${CAMPO} w-28`} aria-invalid={!valido(c)} />
          <span className="text-tenue">USD</span>
        </label>
        <button type="submit" disabled={ocupada || !cambio || !valido(d) || !valido(c)} className={PRINCIPAL}>
          Guardar
        </button>
      </div>
      {(!valido(d) || !valido(c)) && <p className="text-sm text-aviso">Un tope va en USD, mayor que cero y hasta 10.000.</p>}
    </form>
  );
}

/**
 * Lo que costó la fábrica cada día de las últimas dos semanas, en barras: hoy resaltado, y en rojo
 * el día que llegó al tope diario. Debajo, las dos semanas comparadas.
 */
function GastoPorDia({ porDia, tope }: { porDia: AjustesDeLaFabrica["gastoPorDia"]; tope: number | null }) {
  if (!porDia.length) return null;
  const max = Math.max(...porDia.map((d) => d.usd), tope ?? 0, 0.01);
  const semana = (desde: number, hasta: number) => porDia.slice(Math.max(0, porDia.length - hasta), porDia.length - desde).reduce((t, d) => t + d.usd, 0);
  const estaSemana = semana(0, 7);
  const anterior = semana(7, 14);
  const fecha = (dia: string) => new Date(`${dia}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="flex flex-col gap-1.5">
      <div role="img" aria-label={`Gasto por día: ${porDia.map((d) => `${fecha(d.dia)}, ${usdTexto(d.usd)}`).join("; ")}`} className="flex h-16 items-end gap-1">
        {porDia.map((d, i) => (
          <span
            key={d.dia}
            title={`${fecha(d.dia)}: ${usdTexto(d.usd)}`}
            className={`min-w-0 flex-1 rounded-t-md ${tope !== null && d.usd >= tope ? "bg-acento" : i === porDia.length - 1 ? "bg-aviso" : "bg-realce"}`}
            style={{ height: `${Math.max(d.usd > 0 ? 6 : 2, (d.usd / max) * 100)}%` }}
          />
        ))}
      </div>
      <p className="text-[13px] text-tenue">
        Esta semana {usdTexto(estaSemana)}
        {porDia.length > 7 && ` · la anterior ${usdTexto(anterior)}`}
      </p>
    </div>
  );
}

/**
 * Los avisos del navegador: con la pestaña oculta, ella le avisa con su cara cuando una tarea le
 * pregunta algo o espera su veredicto. Es de este navegador: el permiso lo da él, aquí.
 */
/** Lo que dice el navegador de los avisos, en un texto: así se compara entre un render y otro. */
const estadoDeLosAvisos = () => `${quiereAvisos() ? "si" : "no"}:${puedeAvisar()}`;
const alCambiarEnOtraPestana = (avisar: () => void) => {
  window.addEventListener("storage", avisar);
  return () => window.removeEventListener("storage", avisar);
};

function AvisosDelNavegador() {
  // Lo que cambia aquí no avisa a nadie: después de cambiarlo, se vuelve a dibujar.
  const [, redibujar] = useState(0);
  // En el servidor no hay navegador: se dibuja apagado.
  const [encendido, puede] = useSyncExternalStore(alCambiarEnOtraPestana, estadoDeLosAvisos, () => "no:si").split(":") as ["si" | "no", ReturnType<typeof puedeAvisar>];
  const activo = encendido === "si";
  return (
    <div className="flex flex-col gap-2 border-t border-relieve pt-4">
      <Interruptor
        titulo="Avisarte en el navegador cuando algo te espera"
        detalle={
          puede === "no_existe"
            ? "Este navegador no deja avisar."
            : puede === "bloqueado"
              ? "El navegador tiene bloqueados los avisos de esta página: se desbloquean en sus permisos."
              : activo
                ? "Encendido: con la pestaña oculta, te avisa cuando una tarea te pregunta algo o espera tu veredicto. Solo en este navegador."
                : "Apagado. Encendido, el navegador te pide permiso una vez."
        }
        activo={activo}
        deshabilitado={puede !== "si"}
        alCambiar={(valor) => void fijarAvisos(valor).then(() => redibujar((n) => n + 1))}
      />
    </div>
  );
}

/** Lo que cuesta cada modelo por millón de tokens, entrada y salida, según la documentación de Anthropic (octubre de 2026). */
const PRECIO: Record<string, string> = { haiku: "desde 0,10 / 0,50 USD", sonnet: "2 / 10 USD", opus: "4 / 20 USD", fable: "10 / 50 USD" };
const NOMBRE_DEL_MODELO: Record<string, string> = { haiku: "Haiku", sonnet: "Sonnet", opus: "Opus", fable: "Fable" };
const NOMBRE_DEL_ROL: Record<RolConModelo, string> = { spec: "Escribir la spec", construccion: "Construir", revision: "Revisar", aprobacion: "Aprobar" };
const FUENTE_DEL_MODELO = { configuracion: "elegido aquí", claude: "el de Claude Code" } as const;
const SELECTOR = `${CAMPO} pr-8`;

/**
 * Con qué modelo trabaja cada parte: el orquestador de Claude, que reparte, y cada rol. El
 * orquestador se guarda en datos/; los roles, en factory/config.md del proyecto. En
 * construcción, Jev puede bajar a Sonnet las tareas simples.
 */
function Modelos({ ajustes, ocupada, ajustar, enEsteEquipo }: { ajustes: AjustesDeLaFabrica; ocupada: boolean; ajustar: Ajustar; enEsteEquipo: EnEsteEquipo }) {
  const opcion = (m: string) => `${NOMBRE_DEL_MODELO[m]} · ${PRECIO[m]}`;
  return (
    <div className="flex flex-col gap-3 border-t border-relieve pt-4">
      <div>
        <p className="text-[15px] leading-tight">
          <span className="font-extrabold">Los modelos</span> <span className="text-tenue">· quién hace qué, y lo que cuesta por millón de tokens</span>
        </p>
        <p className="mt-1 text-sm text-tenue">El orquestador reparte el trabajo y es lo que más gasta en cada corrida. En construcción, Jev baja a Sonnet las tareas que ve simples.</p>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 basis-40 font-bold">
          El orquestador <span className="font-normal text-tenue">· {FUENTE_DEL_MODELO[ajustes.modelo.fuente]}</span>
        </span>
        <select
          value={ajustes.modelo.fuente === "configuracion" ? (ajustes.modelo.modelo ?? "") : ""}
          disabled={ocupada}
          onChange={(e) => void ajustar({ ajuste: "modelo", modelo: e.target.value || null }, e.target.value ? `Las corridas van con ${NOMBRE_DEL_MODELO[e.target.value]}.` : "Las corridas van con el modelo de Claude Code.")}
          className={SELECTOR}
        >
          <option value="">El de Claude Code</option>
          {MODELOS_DE_CLAUDE.map((m) => (
            <option key={m} value={m}>
              {opcion(m)}
            </option>
          ))}
        </select>
      </label>
      {ajustes.modelosPorRol ? (
        ROLES_CON_MODELO.map((rol) => (
          <label key={rol} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 basis-40 font-bold">{NOMBRE_DEL_ROL[rol]}</span>
            <select
              value={ajustes.modelosPorRol?.[rol] ?? "inherit"}
              disabled={ocupada}
              onChange={(e) =>
                void ajustar({ ajuste: "modelo_de_rol", rol, modelo: e.target.value as ModeloDeRol }, `${NOMBRE_DEL_ROL[rol]}: ${e.target.value === "inherit" ? "con el modelo de la corrida" : `con ${NOMBRE_DEL_MODELO[e.target.value]}`}. Vale desde la próxima corrida.`)
              }
              className={SELECTOR}
            >
              <option value="inherit">El de la corrida</option>
              {MODELOS_DE_CLAUDE.map((m) => (
                <option key={m} value={m}>
                  {opcion(m)}
                </option>
              ))}
            </select>
          </label>
        ))
      ) : (
        <p className="text-sm text-tenue">El modelo de cada rol se elige cuando el proyecto tenga factory/.</p>
      )}
      {ajustes.externos && (
        <>
          <p className="mt-1 text-sm text-tenue">
            Otros agentes, con tu suscripción: <span className="font-bold text-aviso">mandan código de este proyecto a OpenAI o a Google</span>. Vienen apagados; enciéndelos solo donde ese código pueda salir.
          </p>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 basis-40 font-bold">Revisar el código</span>
            <select
              value={ajustes.externos.revisorCodigo}
              disabled={ocupada}
              onChange={(e) => void ajustar({ ajuste: "agente_externo", cual: "revisorCodigo", valor: e.target.value }, e.target.value === "claude" ? "El código lo revisa Claude." : `El código lo revisa ${e.target.value === "codex" ? "Codex" : "Claude y además Codex"}, desde la próxima corrida.`)}
              className={SELECTOR}
            >
              <option value="claude">Claude</option>
              <option value="codex" disabled={!enEsteEquipo.codex}>
                Codex (OpenAI){enEsteEquipo.codex ? "" : " · falta su ruta"}
              </option>
              <option value="ambos" disabled={!enEsteEquipo.codex}>
                Claude y Codex{enEsteEquipo.codex ? "" : " · falta su ruta"}
              </option>
            </select>
          </label>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 basis-40 font-bold">Escribir la spec</span>
            <select
              value={ajustes.externos.escritorSpec}
              disabled={ocupada}
              onChange={(e) => void ajustar({ ajuste: "agente_externo", cual: "escritorSpec", valor: e.target.value }, e.target.value === "claude" ? "La spec la escribe Claude." : "La spec la escribe Antigravity, desde la próxima corrida.")}
              className={SELECTOR}
            >
              <option value="claude">Claude</option>
              <option value="antigravity" disabled={!enEsteEquipo.antigravity}>
                Antigravity (Google){enEsteEquipo.antigravity ? "" : " · falta su ruta"}
              </option>
            </select>
          </label>
          {sinRuta(ajustes.externos, enEsteEquipo).map((aviso) => (
            <p key={aviso} className="text-sm text-aviso">
              {aviso}
            </p>
          ))}
          {(!enEsteEquipo.codex || !enEsteEquipo.antigravity) && (
            <p className="text-sm text-tenue">
              Se lanzan por su ruta exacta: {[!enEsteEquipo.codex && "COMPANIA_CODEX_BIN", !enEsteEquipo.antigravity && "COMPANIA_ANTIGRAVITY_BIN"].filter(Boolean).join(" y ")} en .env.local (en Windows la da where.exe), y reinicia la aplicación.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Lo que el proyecto pide y este equipo no tiene: esa etapa la hace Claude. */
function sinRuta(externos: { revisorCodigo: string; escritorSpec: string }, enEsteEquipo: EnEsteEquipo): string[] {
  return [
    externos.revisorCodigo !== "claude" && !enEsteEquipo.codex && "Este proyecto pide Codex, pero aquí falta su ruta: el código lo revisa Claude.",
    externos.escritorSpec === "antigravity" && !enEsteEquipo.antigravity && "Este proyecto pide Antigravity, pero aquí falta su ruta: la spec la escribe Claude.",
  ].filter((x): x is string => !!x);
}

const MAX_KB = 512;

/** Descarga el prompt para pedirle a una IA el documento de requerimientos. Se arma aquí: no sale nada del equipo. */
function descargarElPrompt() {
  const url = URL.createObjectURL(new Blob([PROMPT_DE_TAREAS], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "prompt-requerimientos-fabrica.md";
  a.click();
  URL.revokeObjectURL(url);
}

function Requerimientos({ habilitada, ocupada, ajustar }: { habilitada: boolean; ocupada: boolean; ajustar: Ajustar }) {
  const [texto, setTexto] = useState("");
  const [titulo, setTitulo] = useState("");
  const [porSeccion, setPorSeccion] = useState(true);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const idTitulo = useId();
  const idTexto = useId();
  const propuestas = useMemo(() => tareasPropuestas(texto, { porSeccion, titulo }), [texto, porSeccion, titulo]);

  async function cargar(f: File | undefined) {
    if (!f) return;
    if (!/\.(md|markdown|txt)$/i.test(f.name)) return setProblema("Adjunta un archivo .md, .markdown o .txt.");
    if (f.size > MAX_KB * 1024) return setProblema(`El archivo pasa de ${MAX_KB} KB: pártelo en varios.`);
    setProblema(null);
    setTexto(await f.text());
    setArchivo(f.name);
  }

  async function crear() {
    const d = await ajustar({ ajuste: "requerimientos", titulo, texto, porSeccion }, (r) =>
      r.creadas?.length ? `${r.creadas.length === 1 ? "Quedó en la cola" : `Quedaron ${r.creadas.length} tareas en la cola`}: ${r.creadas.map((c) => c.id).join(", ")}. El documento se guardó en ${r.documento || "factory/requerimientos/"}.` : "La fábrica no creó ninguna tarea.",
    );
    if (!d?.creadas) return;
    setTexto("");
    setTitulo("");
    setArchivo(null);
    setProblema(null);
  }

  return (
    <div className="flex flex-col gap-3 border-t border-relieve pt-4">
      <div>
        <p className="text-[15px] leading-tight">
          <span className="font-extrabold">Requerimientos</span> <span className="text-tenue">· de un documento a tareas</span>
        </p>
        <p className="mt-1 text-sm text-tenue">Cada sección ## puede ser una tarea; lo que va antes de la primera sección viaja como contexto en todas. El documento completo queda en factory/requerimientos/ para que la spec lo consulte.</p>
      </div>
      {/* El prompt sirve aunque todavía no haya proyecto: el documento se puede preparar antes. */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={descargarElPrompt} className={BOTON}>
          Descargar el prompt para una IA (.md)
        </button>
        <span className="min-w-0 flex-1 basis-60 text-sm text-tenue">Pégalo en Claude u otra IA con tu idea: te devuelve el documento con esta forma, listo para adjuntarlo aquí.</span>
      </div>
      {!habilitada ? (
        <p className="text-sm text-tenue">Primero elige un proyecto que tenga factory/.</p>
      ) : (
        <>
          <label htmlFor={idTitulo} className="sr-only">
            El título del documento
          </label>
          <input id={idTitulo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={texto.trim() ? `Título: ${tituloDelDocumento(texto)}` : "El título del documento"} className={CAMPO} />
          <label htmlFor={idTexto} className="sr-only">
            Los requerimientos, en Markdown o texto
          </label>
          <textarea
            id={idTexto}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              void cargar(e.dataTransfer.files[0]);
            }}
            rows={10}
            spellCheck={false}
            placeholder={"# Módulo de reportes\n\nContexto común para todas las tareas…\n\n## Exportar ventas a Excel\nEl usuario puede…"}
            className={`min-h-48 w-full resize-y rounded-2xl bg-relieve px-3.5 py-2.5 font-mono text-[13px] leading-relaxed outline-none placeholder:text-tenue focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-papel ${arrastrando ? "outline-2 outline-solid outline-acento" : ""}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => entrada.current?.click()} className={BOTON}>
              Adjuntar .md
            </button>
            <input
              ref={entrada}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                void cargar(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={porSeccion} onChange={(e) => setPorSeccion(e.target.checked)} className="size-4" />
              Una tarea por cada sección ##
            </label>
            <span className="min-w-0 flex-1 basis-40 text-right text-sm text-tenue">{archivo ? `De ${archivo}.` : "También puedes arrastrar el archivo."}</span>
          </div>
          {problema && (
            <p role="alert" className="text-sm text-aviso">
              {problema}
            </p>
          )}
          {propuestas.length > 0 && (
            <div className="rounded-2xl bg-fondo p-3">
              <p className="text-sm font-extrabold">
                Se {propuestas.length === 1 ? "creará una tarea" : `crearán ${propuestas.length} tareas`}, en la cola
              </p>
              <ol className="mt-2 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                {propuestas.map((t, i) => (
                  <li key={i} className="rounded-xl bg-ficha px-3 py-2 text-sm">
                    <p className="leading-snug font-bold break-words">{t.titulo}</p>
                    {t.resumen && <p className="line-clamp-2 text-tenue">{t.resumen}</p>}
                    {t.dependeDe.length > 0 && <p className="text-[13px] text-tenue">Depende de: {t.dependeDe.join(", ")}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" disabled={ocupada || propuestas.length === 0} onClick={() => void crear()} className={PRINCIPAL}>
              {propuestas.length > 1 ? `Crear ${propuestas.length} tareas` : "Crear la tarea"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Las variables del teléfono y para qué es cada una: se nombran, nunca se muestra su valor. */
const VARIABLES: { nombre: string; para: string }[] = [
  { nombre: "COMPANIA_TELNYX_API_KEY", para: "la clave de la API de Telnyx" },
  { nombre: "COMPANIA_TELNYX_CONNECTION_ID", para: "el id de la aplicación de voz (Voice API Application)" },
  { nombre: "COMPANIA_TELNYX_NUMERO_ORIGEN", para: "tu número de Telnyx, como +1…" },
  { nombre: "COMPANIA_TELEFONO", para: "el teléfono que suena, como +569…" },
];

/** Qué se oye al contestar: el audio fijo o nada. */
function alContestar(telefono: TelefonoDeLaFabrica): string {
  return telefono.conAudio ? "Al contestar suena tu audio (COMPANIA_TELNYX_AUDIO_URL)." : "Al contestar, silencio: con COMPANIA_TELNYX_AUDIO_URL suena ese audio.";
}

/**
 * El teléfono de la fábrica, con Telnyx: suena cuando una tarea te pregunta algo o espera tu
 * veredicto. Probarlo pide confirmar, porque cada llamada cuesta. Que suene solo se enciende
 * aquí y viene apagado; aun así, hay pausas y un tope por día.
 */
function Telefono({ telefono, ocupada, ajustar }: { telefono: TelefonoDeLaFabrica; ocupada: boolean; ajustar: Ajustar }) {
  const [confirmando, setConfirmando] = useState(false);
  const hora = (cuando: string) => new Date(cuando).toLocaleString("es", { hour12: false, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-col gap-3 border-t border-relieve pt-4">
      <Fila
        nombre="El teléfono"
        que="Telnyx"
        estado={telefono.listo ? `Suena ${telefono.destino}, desde ${telefono.origen}` : "Sin configurar"}
        alerta={!telefono.listo}
        detalle={[
          telefono.listo ? "Suena cuando una tarea te pregunta algo o espera tu veredicto." : "Faltan sus datos en .env.local (abajo, cuáles). Después, reinicia la aplicación.",
          alContestar(telefono),
        ].join(" ")}
      >
        {confirmando ? (
          <>
            <button type="button" onClick={() => setConfirmando(false)} className={BOTON}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={ocupada}
              onClick={() => {
                setConfirmando(false);
                void ajustar({ ajuste: "probar_telefono" }, `Llamando a ${telefono.destino}. Si no suena en unos segundos, mira las últimas llamadas.`);
              }}
              className={PRINCIPAL}
            >
              Llamar ahora
            </button>
          </>
        ) : (
          <button type="button" disabled={ocupada || !telefono.listo} onClick={() => setConfirmando(true)} className={BOTON}>
            Probar la llamada
          </button>
        )}
      </Fila>
      <Interruptor
        titulo="Llamarte sola cuando algo te espera"
        detalle={
          telefono.auto
            ? `Encendido: hoy van ${telefono.autoHoy} de ${telefono.topeAutoDiario}. Una vez por tarea cada media hora, y al menos dos minutos entre llamadas. Funciona aunque no tengas la página abierta.`
            : `Apagado. Encendido, suena cuando una tarea te pregunta algo o espera tu veredicto: hasta ${telefono.topeAutoDiario} veces al día.`
        }
        activo={telefono.auto}
        deshabilitado={ocupada || !telefono.listo}
        alCambiar={(valor) => void ajustar({ ajuste: "llamar_sola", valor }, valor ? "El teléfono va a sonar cuando algo te espere." : "El teléfono ya no suena solo.")}
      />
      {!telefono.listo && (
        <ul className="flex flex-col gap-1 text-sm">
          {VARIABLES.map((v) => {
            const falta = telefono.faltan.includes(v.nombre);
            return (
              <li key={v.nombre}>
                <span className={`font-mono ${falta ? "text-aviso" : ""}`}>{v.nombre}</span>
                <span className="text-tenue">
                  {" "}
                  · {v.para}: {falta ? "falta" : "está"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {telefono.recientes.length > 0 && (
        <ul aria-label="Las últimas llamadas" className="flex flex-col gap-1 text-sm">
          {telefono.recientes.map((l) => (
            <li key={l.cuando} className="flex gap-2">
              <time dateTime={l.cuando} className="flex-none text-tenue tabular-nums">
                {hora(l.cuando)}
              </time>
              <span className={`min-w-0 break-words ${l.error ? "text-aviso" : ""}`}>
                {l.auto ? "Sola · " : ""}
                {l.motivo}
                {l.error ? `: ${l.error}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
