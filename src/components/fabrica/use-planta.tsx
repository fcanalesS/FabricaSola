"use client";

import { useCallback, useEffect, useState } from "react";
import type { Planta } from "@/lib/fabrica/planta/disco";

/** Cada cuánto se vuelve a leer la planta mientras la pestaña se ve. */
const CADA_MS = 5000;

/**
 * La planta al día: la que llegó del servidor y, después, la que se vuelve a leer cada pocos
 * segundos mientras la pestaña se ve. `leer` la pide ya (después de una acción). `ahora` avanza
 * cada segundo, para decir «leído hace N s».
 */
export function usePlanta(inicial: Planta) {
  const [planta, setPlanta] = useState(inicial);
  const [ahora, setAhora] = useState(() => Date.parse(inicial.leidaEn));
  const [sinRespuesta, setSinRespuesta] = useState(false);

  const leer = useCallback(async () => {
    try {
      const r = await fetch("/api/fabrica/planta", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { planta: Planta };
      setPlanta(d.planta);
      setSinRespuesta(false);
    } catch {
      setSinRespuesta(true);
    }
  }, []);

  useEffect(() => {
    const siSeVe = () => {
      if (document.visibilityState === "visible") void leer();
    };
    const t = setInterval(siSeVe, CADA_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    document.addEventListener("visibilitychange", siSeVe);
    return () => {
      clearInterval(t);
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", siSeVe);
    };
  }, [leer]);

  const segundos = Math.max(0, Math.round((ahora - Date.parse(planta.leidaEn)) / 1000));
  return { planta, ahora, sinRespuesta, segundos, leer };
}

/** «Al día · leído hace N s», o que la aplicación no responde. */
export function AlDia({ segundos, sinRespuesta }: { segundos: number; sinRespuesta: boolean }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm font-bold text-tenue">
      <span aria-hidden="true" className={`size-2 rounded-full ${sinRespuesta ? "bg-peligro" : "bg-papel"}`} />
      {sinRespuesta ? `La aplicación no responde · lo último, leído hace ${segundos} s` : `Al día · leído hace ${segundos} s`}
    </p>
  );
}
