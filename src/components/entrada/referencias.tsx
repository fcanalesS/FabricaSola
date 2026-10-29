"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { ReferenciaALaVista } from "@/lib/fabrica/referencias/almacen";
import { BOTON, CAMPO } from "./pedir";

/**
 * Las referencias de una tarea: archivos que se suben y links que la
 * aplicación lee una vez, para que los agentes los usen. Viven fuera del
 * repositorio. Al escribir la petición van a un lote, que pasa a la tarea al
 * crearla; en una tarea, se cambian solo mientras está pendiente.
 */

export type DestinoDeReferencias = { lote: string } | { linea: string; tarea: string };

/** Un lote nuevo para una petición: 32 cifras hexadecimales. */
export const nuevoLote = () => crypto.randomUUID().replace(/-/g, "");

const consulta = (d: DestinoDeReferencias) => ("lote" in d ? `lote=${d.lote}` : `linea=${encodeURIComponent(d.linea)}&tarea=${encodeURIComponent(d.tarea)}`);
const ACEPTA = ".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.markdown,.csv,.json,.docx,.xlsx";
const TIPO: Record<ReferenciaALaVista["tipo"], string> = { imagen: "Imagen", pdf: "PDF", texto: "Texto", word: "Word", excel: "Excel", pagina: "Página" };
const peso = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Los links https que hay en un texto, sin repetir y sin el signo que los cierra. */
function linksEn(texto: string): string[] {
  return [...new Set([...texto.matchAll(/https:\/\/[^\s<>()«»"'`]+/g)].map((m) => m[0].replace(/[.,;:!?]+$/, "")))].slice(0, 5);
}

const sitioDe = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function Referencias({ destino, editable = true, textoDelPedido = "" }: { destino: DestinoDeReferencias; editable?: boolean; /** Lo que se escribió en el pedido: si trae links, se ofrece leerlos. */ textoDelPedido?: string }) {
  const id = useId();
  const [lista, setLista] = useState<ReferenciaALaVista[]>([]);
  const [link, setLink] = useState("");
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);
  const q = consulta(destino);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/fabrica/referencias?${q}`, { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? ((await r.json()) as { referencias: ReferenciaALaVista[] }) : null;
    if (d) setLista(d.referencias);
  }, [q]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/fabrica/referencias?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ referencias: ReferenciaALaVista[] }>) : null))
      .then((d) => {
        if (vivo && d) setLista(d.referencias);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [q]);

  async function pedir(init: RequestInit, sufijo = ""): Promise<string | null> {
    try {
      const r = await fetch(`/api/fabrica/referencias${sufijo}`, init);
      const d = ((await r.json().catch(() => null)) ?? {}) as { error?: string; referencias?: ReferenciaALaVista[] };
      if (d.referencias) setLista(d.referencias);
      return r.ok ? null : (d.error ?? "No se pudo.");
    } catch {
      return "La aplicación no responde.";
    }
  }

  async function subir(archivos: FileList | File[]) {
    const lista = [...archivos];
    if (!lista.length) return;
    setAviso(null);
    const fallas: string[] = [];
    for (const [i, f] of lista.entries()) {
      setOcupada(lista.length > 1 ? `Subiendo ${i + 1} de ${lista.length}…` : "Subiendo…");
      // Siempre como bytes: un .json no puede pasar por una acción de la ruta.
      const error = await pedir({ method: "POST", headers: { "content-type": "application/octet-stream", "x-nombre": encodeURIComponent(f.name) }, body: f }, `?${q}`);
      if (error) fallas.push(`${f.name}: ${error}`);
    }
    setOcupada(null);
    if (fallas.length) setAviso(fallas.join(" "));
    else await cargar();
  }

  async function leer(url: string) {
    setAviso(null);
    setOcupada(`Leyendo ${sitioDe(url)}…`);
    const error = await pedir({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accion: "link", destino, url }) });
    setOcupada(null);
    if (error) setAviso(error);
    else setLink("");
  }

  async function quitar(n: number) {
    setAviso(null);
    const error = await pedir({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accion: "quitar", destino, n }) });
    if (error) setAviso(error);
  }

  const leidos = new Set(lista.flatMap((r) => (r.url ? [r.url.replace(/\/$/, "")] : [])));
  const enElPedido = editable ? linksEn(textoDelPedido).filter((u) => !leidos.has(u.replace(/#.*$/, "").replace(/\/$/, ""))) : [];

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-2.5">
      <div>
        <h3 id={`${id}-titulo`} className="text-sm font-bold">
          Referencias {lista.length > 0 && <span className="font-normal text-tenue">({lista.length})</span>}
        </h3>
        {editable && <p className="text-sm text-tenue">Un diseño, un documento o una página que ayude. Las leen el que escribe la spec, quien construye y quien revisa. No van al repositorio.</p>}
      </div>

      {lista.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {lista.map((r) => (
            <li key={r.n} className="flex items-start gap-3 rounded-2xl bg-relieve px-3.5 py-2.5 text-sm">
              <span className="mt-0.5 flex-none rounded-full bg-ficha px-2 py-0.5 text-xs font-bold">{TIPO[r.tipo]}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-bold" title={r.nombre}>
                  {r.nombre}
                </span>
                <span className={r.llega ? "text-tenue" : "font-bold text-aviso"}>
                  {r.tipo === "pagina" ? `${r.sitio} · ` : r.peso ? `${peso(r.peso)} · ` : ""}
                  {r.nota}
                </span>
                {r.extracto && (
                  <details className="text-tenue">
                    <summary className="cursor-pointer">Lo que se leyó</summary>
                    <p className="mt-1 whitespace-pre-wrap">
                      {r.extracto}
                      {r.extracto.length >= 280 ? "…" : ""}
                    </p>
                  </details>
                )}
              </span>
              {editable && (
                <button type="button" onClick={() => void quitar(r.n)} aria-label={`Quitar ${r.nombre}`} className={BOTON} disabled={!!ocupada}>
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <>
          {enElPedido.map((u) => (
            <p key={u} className="flex flex-col items-start gap-2 rounded-2xl bg-relieve px-3.5 py-2.5 text-sm sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1">
                Lo que escribiste trae un link a <strong>{sitioDe(u)}</strong>. Ningún agente lo abre: si importa, que la aplicación lo lea.
              </span>
              <button type="button" className={`${BOTON} bg-ficha`} disabled={!!ocupada} onClick={() => void leer(u)}>
                Leerlo como referencia
              </button>
            </p>
          ))}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setEncima(true);
            }}
            onDragLeave={() => setEncima(false)}
            onDrop={(e) => {
              e.preventDefault();
              setEncima(false);
              void subir(e.dataTransfer.files);
            }}
            className={`flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-dashed px-4 py-3 text-center text-sm ${encima ? "border-acento bg-realce" : "border-relieve"}`}
          >
            <span className="font-bold">Arrastra archivos aquí, o elígelos</span>
            <span className="text-tenue">Imágenes, PDF, texto, Word o Excel. Hasta 10 MB cada uno y 12 por tarea.</span>
            <input type="file" multiple accept={ACEPTA} className="sr-only" disabled={!!ocupada} onChange={(e) => {
              const f = e.target.files;
              if (f) void subir(f);
              e.target.value = "";
            }} />
          </label>
          <div className="flex gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (link.trim()) void leer(link.trim());
                }
              }}
              type="url"
              inputMode="url"
              placeholder="https://…"
              aria-label="Link de referencia"
              aria-describedby={`${id}-link`}
              className={CAMPO}
            />
            <button type="button" className={BOTON} disabled={!!ocupada || !link.trim()} onClick={() => void leer(link.trim())}>
              Leer el link
            </button>
          </div>
          <p id={`${id}-link`} className="text-xs text-tenue">
            La aplicación lee la página una vez y los agentes usan esa copia. Una con inicio de sesión (Figma, Drive) no se puede leer: sube una captura.
          </p>
        </>
      )}
      {!editable && lista.length === 0 && <p className="text-sm text-tenue">No tiene.</p>}
      {(ocupada || aviso) && (
        <p role={aviso ? "alert" : "status"} className={`rounded-2xl bg-relieve px-3.5 py-2 text-sm ${aviso ? "text-aviso" : ""}`}>
          {aviso ?? ocupada}
        </p>
      )}
    </section>
  );
}
