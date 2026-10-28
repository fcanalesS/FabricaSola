"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { Live2DIndicado, ModeloDeLaPortada as Portada } from "@/lib/portada/modelo";
import { Explorador } from "./fabrica";
import { BOTON, CAMPO, Fila } from "./piezas";

/**
 * El modelo Live2D de la portada: él indica dónde está su modelo y el Core de Cubism en este
 * equipo, y la portada lo carga desde ahí, sin copiar nada. Todo pasa por `/api/portada/live2d`.
 * Lo copiado a public/live2d/ sigue valiendo cuando no hay nada indicado aquí.
 */

type Estado = { indicado: Live2DIndicado | null; portada: Portada };
const PRINCIPAL = `${BOTON} bg-realce`;

/** Qué dice la fila según cómo está la portada. */
function comoEsta({ indicado, portada }: Estado): { estado: string; detalle: string; alerta: boolean } {
  if (portada && "falta" in portada && portada.falta === "indicado")
    return { estado: "No carga", detalle: `Lo que indicaste no está: ${portada.motivo}. Vuelve a indicarlo, o deja de usarlo.`, alerta: true };
  if (indicado && portada && "url" in portada)
    return { estado: `${portada.nombre}, indicado aquí`, detalle: `El modelo: ${indicado.carpeta} › ${indicado.archivo}. El Core: ${indicado.core}.`, alerta: false };
  if (portada && "url" in portada)
    return { estado: `${portada.nombre}, desde public/live2d/`, detalle: "Lo que indiques abajo va antes que lo copiado a public/live2d/.", alerta: false };
  if (portada && "falta" in portada)
    return { estado: `${portada.nombre} sin el Core de Cubism`, detalle: "Hay un modelo en public/live2d/modelo/, pero no el Core. Indica los dos abajo.", alerta: true };
  return { estado: "Sin modelo: la portada va con su vista simple", detalle: "Indica abajo la carpeta de tu modelo y la del Core de Cubism.", alerta: false };
}

/** Un campo de ruta con su «Buscar la carpeta». */
function CampoDeRuta({ etiqueta, valor, alCambiar, ayuda, ocupada }: { etiqueta: string; valor: string; alCambiar: (v: string) => void; ayuda: string; ocupada: boolean }) {
  const id = useId();
  const [buscando, setBuscando] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-bold">
        {etiqueta}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input id={id} value={valor} onChange={(e) => alCambiar(e.target.value)} placeholder={ayuda} spellCheck={false} className={`${CAMPO} min-w-0 flex-1 basis-72 font-mono`} />
        <button type="button" onClick={() => setBuscando((b) => !b)} aria-expanded={buscando} className={BOTON}>
          {buscando ? "Cerrar" : "Buscar la carpeta"}
        </button>
      </div>
      {buscando && (
        <Explorador
          desde={valor.trim() || null}
          ocupada={ocupada}
          alElegir={(ruta) => {
            alCambiar(ruta);
            setBuscando(false);
          }}
        />
      )}
    </div>
  );
}

export function ModeloDeLaPortada() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [noResponde, setNoResponde] = useState(false);
  const [modelo, setModelo] = useState("");
  const [core, setCore] = useState("");
  const [ocupada, setOcupada] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; malo: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/portada/live2d")
      .then((r) => (r.ok ? (r.json() as Promise<Estado>) : null))
      .then((e) => {
        if (!e) return setNoResponde(true);
        setEstado(e);
        setModelo(e.indicado?.carpeta ?? "");
        setCore(e.indicado?.core ?? "");
      })
      .catch(() => setNoResponde(true));
  }, []);

  async function enviar(cuerpo: Record<string, unknown>, bien: string) {
    setOcupada(true);
    setAviso(null);
    try {
      const r = await fetch("/api/portada/live2d", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
      const d = (await r.json().catch(() => null)) as (Estado & { error?: string }) | null;
      if (d && "portada" in d) setEstado({ indicado: d.indicado, portada: d.portada });
      if (!r.ok) return setAviso({ texto: d?.error && d.error !== "pedido_desconocido" ? d.error : "No se guardó.", malo: true });
      setAviso({ texto: bien, malo: false });
    } catch {
      setAviso({ texto: "La aplicación no responde.", malo: true });
    } finally {
      setOcupada(false);
    }
  }

  if (noResponde) return <Fila nombre="El modelo Live2D" que="en la portada" estado="No se pudo leer" alerta detalle="Recarga la página; si sigue, mira la terminal donde corre la aplicación." />;
  if (!estado) return <p className="text-sm text-tenue">Mirando…</p>;
  const fila = comoEsta(estado);
  return (
    <div className="flex flex-col gap-4">
      <Fila nombre="El modelo Live2D" que="en la portada" estado={fila.estado} detalle={fila.detalle} alerta={fila.alerta}>
        {estado.portada && "url" in estado.portada && (
          <Link href="/" className={`${BOTON} flex items-center`}>
            Ver la portada
          </Link>
        )}
        {estado.indicado && (
          <button
            type="button"
            disabled={ocupada}
            onClick={() => {
              setModelo("");
              setCore("");
              void enviar({ quitar: true }, "Ya no se usa: la portada vuelve a public/live2d/ o a su vista simple. No se borró nada.");
            }}
            className={BOTON}
          >
            Dejar de usarlo
          </button>
        )}
      </Fila>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar({ modelo, core }, "Guardado: la portada ya lo muestra.");
        }}
      >
        <CampoDeRuta etiqueta="La carpeta del modelo" valor={modelo} alCambiar={setModelo} ayuda="La que trae el *.model3.json, o el archivo mismo" ocupada={ocupada} />
        <CampoDeRuta etiqueta="El Core de Cubism" valor={core} alCambiar={setCore} ayuda="La carpeta del Cubism SDK for Web, su carpeta Core o el archivo" ocupada={ocupada} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={ocupada || !modelo.trim() || !core.trim()} className={PRINCIPAL}>
            Usar este modelo
          </button>
        </div>
      </form>
      {aviso && (
        <p role={aviso.malo ? "alert" : "status"} className={`rounded-2xl bg-relieve px-4 py-3 text-sm ${aviso.malo ? "text-aviso" : ""}`}>
          {aviso.texto}
        </p>
      )}
      <p className="text-sm text-tenue">
        Un modelo de Cubism 3 o posterior: el que trae un archivo *.model3.json. El Core viene en el Cubism SDK for Web, que se descarga de live2d.com al aceptar su licencia. Se guarda en datos/portada.json, solo en este equipo, y no se copia nada.
      </p>
    </div>
  );
}
