import Link from "next/link";
import { connection } from "next/server";
import { AlDia } from "@/components/portada/al-dia";
import { ModeloLive2D } from "@/components/portada/modelo-live2d";
import { claudeCodeDeEsteEquipo } from "@/lib/fabrica/motor/claude-code";
import { leerLaPlanta } from "@/lib/fabrica/planta/disco";
import { NOMBRE_DEL_PROGRAMA } from "@/lib/nombre";
import { modeloDeLaPortada } from "@/lib/portada/modelo";

/**
 * La portada: la planta en una mirada, sobre un fondo con anillos de pantalla. Arriba, si este equipo
 * puede correr; un anillo que gira despacio mientras corre una línea; cómo está la fábrica, por dónde
 * seguir y lo que te espera. Se lee en cada visita y cada pocos segundos.
 *
 * Sin modelo, la vista simple: el estado va dentro del anillo. Con un modelo Live2D (lo indica quien
 * la usa en Configuración › Portada, o lo copia a public/live2d/), el anillo lo lleva dentro y el
 * estado va a su lado (debajo, en una pantalla angosta).
 */

const BOTON = "flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-extrabold";

/** El anillo de la portada: gira despacio mientras corre una línea. */
function Anillo({ gira, clase, children }: { gira: boolean; clase: string; children: React.ReactNode }) {
  return (
    <div className={`relative flex aspect-square items-center justify-center ${clase}`}>
      <svg aria-hidden="true" viewBox="0 0 400 400" className={`absolute inset-0 h-full w-full ${gira ? "motion-safe:animate-[spin_40s_linear_infinite]" : ""}`}>
        <circle cx="200" cy="200" r="190" fill="none" stroke="var(--color-hud)" strokeWidth="1.5" opacity=".4" />
        <circle cx="200" cy="200" r="190" fill="none" stroke="var(--color-hud)" strokeWidth="6" strokeDasharray="150 1044" transform="rotate(-70 200 200)" opacity=".85" />
        <circle cx="200" cy="200" r="190" fill="none" stroke="var(--color-hud)" strokeWidth="6" strokeDasharray="70 1124" transform="rotate(110 200 200)" opacity=".85" />
        <circle cx="200" cy="200" r="190" fill="none" stroke="var(--color-acento)" strokeWidth="4" strokeDasharray="30 1164" transform="rotate(30 200 200)" />
        <circle cx="200" cy="200" r="172" fill="none" stroke="var(--color-hud)" strokeWidth="8" strokeDasharray="1.2 8" opacity=".3" />
        <circle cx="200" cy="200" r="150" fill="none" stroke="var(--color-hud)" strokeWidth="1" strokeDasharray="2 10" opacity=".45" />
      </svg>
      {children}
    </div>
  );
}

export default async function Pagina() {
  await connection();
  const [planta, modelo] = await Promise.all([leerLaPlanta(), modeloDeLaPortada()]);
  const n = planta.numeros;
  const corre = planta.lineas.find((l) => l.estado === "corriendo");
  const conClaude = claudeCodeDeEsteEquipo() !== null;
  const titular = !planta.lineas.length ? "Todavía sin líneas" : corre ? `Corre ${corre.nombre}` : n.teEsperan ? `${n.teEsperan} te ${n.teEsperan === 1 ? "espera" : "esperan"}` : "Todo quieto";
  const detalle = planta.lineas.length
    ? `${n.lineas} ${n.lineas === 1 ? "línea" : "líneas"} · ${n.abiertas} ${n.abiertas === 1 ? "abierta" : "abiertas"} · ${n.hechasHoy} ${n.hechasHoy === 1 ? "hecha" : "hechas"} hoy`
    : "Agrega el repositorio de un proyecto en la configuración y crea su factory/.";
  const esperan = planta.teEsperan.slice(0, 3);
  const conModelo = modelo && "url" in modelo ? modelo : null;

  const estado = (
    <>
      <span className="text-xs font-extrabold tracking-[.16em] text-hud uppercase">{corre ? "Corriendo" : "La planta"}</span>
      <h1 className="text-[clamp(28px,6vw,44px)] leading-tight font-extrabold">{titular}</h1>
      <p className="text-sm text-tenue">{detalle}</p>
      {modelo && "falta" in modelo && (
        <p className="text-[13px] text-tenue">
          {modelo.falta === "core"
            ? `Hay un modelo en public/live2d/modelo/ (${modelo.nombre}), pero falta el Core de Cubism: cópialo a public/live2d/core/, o indica los dos en Configuración › Portada.`
            : `El modelo Live2D de la configuración no carga: ${modelo.motivo}. Revísalo en Configuración › Portada.`}
        </p>
      )}
    </>
  );

  const botones = (
    <div className={`flex flex-wrap gap-3 ${conModelo ? "justify-center lg:justify-start" : "justify-center"}`}>
      {planta.lineas.length ? (
        <>
          <Link href="/fabrica" className={`${BOTON} bg-acento text-papel`}>
            Ir a la planta
          </Link>
          <Link href="/fabrica/peticion" className={`${BOTON} border border-relieve bg-fondo/80 backdrop-blur-sm`}>
            Nueva petición
          </Link>
        </>
      ) : (
        <Link href="/configuracion" className={`${BOTON} bg-acento text-papel`}>
          Agregar una línea
        </Link>
      )}
    </div>
  );

  const teEsperan = esperan.length > 0 && (
    <section aria-labelledby="te-esperan" className="relative mt-2 w-[min(560px,100%)]">
      <div aria-hidden="true" className="absolute inset-0 border border-hud/60 bg-fondo/85 backdrop-blur-sm [clip-path:polygon(18px_0,100%_0,100%_calc(100%-18px),calc(100%-18px)_100%,0_100%,0_18px)]" />
      <div className="relative flex flex-col gap-2 p-4 pl-5">
        <h2 id="te-esperan" className="text-sm font-extrabold tracking-[.14em] text-hud uppercase">
          Te esperan
        </h2>
        <ul className="flex flex-col gap-1.5">
          {esperan.map((t) => (
            <li key={`${t.linea}/${t.id}`}>
              <Link href={`/fabrica/lineas/${encodeURIComponent(t.linea)}?tarea=${t.id}`} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-relieve">
                <span className="flex-none text-sm font-extrabold">{t.id}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{t.titulo}</span>
                <span className="flex-none text-xs text-tenue">
                  {t.nombreDeLinea} · {t.espera === "pregunta" ? "pregunta" : "tu veredicto"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {planta.teEsperan.length > esperan.length && (
          <Link href="/fabrica/tareas?esperan=1" className="self-start text-[13px] font-bold text-tenue underline underline-offset-2">
            Y {planta.teEsperan.length - esperan.length} más
          </Link>
        )}
      </div>
    </section>
  );

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <AlDia />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--color-acento) 14%, var(--color-escena)) 0%, var(--color-fondo) 62%)" }} />
      <svg aria-hidden="true" viewBox="0 0 1000 1000" className="pointer-events-none absolute top-[45%] left-1/2 h-[150vmin] w-[150vmin] -translate-x-1/2 -translate-y-1/2">
        <g fill="none" stroke="var(--color-hud)">
          <circle cx="500" cy="500" r="490" strokeWidth="1" opacity=".14" />
          <circle cx="500" cy="500" r="466" strokeWidth="2" strokeDasharray="70 22" opacity=".2" />
          <circle cx="500" cy="500" r="440" strokeWidth="12" strokeDasharray="1.2 10" opacity=".22" />
          <circle cx="500" cy="500" r="400" strokeWidth="1" strokeDasharray="2 14" opacity=".35" />
          <path d="M500 4 L500 40 M500 960 L500 996 M4 500 L40 500 M960 500 L996 500" strokeWidth="2" opacity=".45" />
          <path d="M118 178 L118 118 L178 118 M882 178 L882 118 L822 118 M118 822 L118 882 L178 882 M882 822 L882 882 L822 882" strokeWidth="1.5" opacity=".25" />
        </g>
      </svg>

      <header className="relative flex flex-wrap items-center justify-between gap-3 px-4 pt-4 lg:px-8 lg:pt-6">
        <div className="flex items-center gap-2.5">
          <svg width="32" height="32" viewBox="0 0 34 34" aria-hidden="true">
            <rect width="34" height="34" rx="10" className="fill-acento" />
            <path d="M17 6 L19.4 14.6 L28 17 L19.4 19.4 L17 28 L14.6 19.4 L6 17 L14.6 14.6 Z" className="fill-papel" />
          </svg>
          <span className="text-[17px] font-extrabold">{NOMBRE_DEL_PROGRAMA}</span>
        </div>
        <nav aria-label="Atajos" className="flex flex-wrap gap-2">
          <Link href="/fabrica/equipo" className="flex min-h-10 items-center gap-2 rounded-full border border-relieve bg-fondo/80 px-3.5 text-[13px] font-extrabold backdrop-blur-sm">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${conClaude ? "bg-hud" : "bg-peligro"}`} />
            {conClaude ? "Claude Code, listo" : "Falta Claude Code"}
          </Link>
          <Link href="/configuracion" className="flex min-h-10 items-center rounded-full border border-relieve bg-fondo/80 px-3.5 text-[13px] font-extrabold backdrop-blur-sm">
            Configuración
          </Link>
        </nav>
      </header>

      {conModelo ? (
        <section aria-label="Cómo está la fábrica" className="relative mx-auto grid max-w-6xl items-center gap-6 px-4 pt-4 pb-10 lg:grid-cols-2 lg:gap-10 lg:px-8 lg:pt-6">
          <Anillo gira={!!corre} clase="mx-auto w-[min(86vw,560px)]">
            <ModeloLive2D url={conModelo.url} core={conModelo.core} nombre={conModelo.nombre} />
          </Anillo>
          <div className="flex flex-col items-center gap-6 lg:items-start">
            <div className="flex flex-col items-center gap-2 text-center lg:items-start lg:text-left">{estado}</div>
            {botones}
            {teEsperan}
          </div>
        </section>
      ) : (
        <section aria-label="Cómo está la fábrica" className="relative flex flex-col items-center gap-6 px-4 pt-8 pb-10 lg:pt-12">
          <Anillo gira={!!corre} clase="w-[min(78vw,460px)]">
            <div className="relative flex max-w-[70%] flex-col items-center gap-2 text-center">{estado}</div>
          </Anillo>
          {botones}
          {teEsperan}
        </section>
      )}
    </main>
  );
}
