"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Cada cuánto se vuelve a leer la portada, con la pestaña a la vista. */
const CADA_MS = 10_000;

/** Vuelve a pedir la portada cada pocos segundos mientras se ve: lo que dice de la planta queda al día. */
export function AlDia() {
  const router = useRouter();
  useEffect(() => {
    const leer = () => {
      if (!document.hidden) router.refresh();
    };
    const reloj = setInterval(leer, CADA_MS);
    document.addEventListener("visibilitychange", leer);
    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", leer);
    };
  }, [router]);
  return null;
}
