"use client";

import { useEffect, useRef, useState } from "react";

/**
 * El modelo Live2D de la portada, si alguien puso uno (public/live2d/LEEME.md). Es compañía visual:
 * lo dibuja de cuerpo entero dentro de su caja, deja sonar la animación de reposo que traiga y, sin
 * el movimiento reducido del sistema, mira hacia el puntero. No habla ni tiene gestos.
 *
 * Lo que no se deduce leyendo la librería (lo aprendió la aplicación de origen):
 *  - El Core de Cubism es un script aparte que se carga antes que la librería.
 *  - El lienzo se crea nuevo en cada montaje: sobre uno cuyo WebGL ya se soltó, el siguiente no
 *    arranca (pasa en cada recarga en caliente).
 */

const CORE = "/live2d/core/live2dcubismcore.min.js";

/** Lo que se usa del modelo de la librería. */
type Modelo = {
  anchor: { set: (x: number, y: number) => void };
  scale: { set: (x: number) => void };
  position: { set: (x: number, y: number) => void };
  internalModel: { width: number; height: number };
  focus: (x: number, y: number) => void;
  destroy: (o: { children: boolean; texture: boolean; baseTexture: boolean }) => void;
};

let core: Promise<void> | null = null;

function cargarCore(): Promise<void> {
  if ("Live2DCubismCore" in window) return Promise.resolve();
  core ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CORE;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      core = null;
      reject(new Error("no se pudo cargar el Core de Cubism"));
    };
    document.head.appendChild(script);
  });
  return core;
}

/** Si el navegador puede dar WebGL ahora. Se prueba en un lienzo aparte, que se suelta enseguida. */
function hayWebGL(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    if (!gl || gl.isContextLost()) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function ModeloLive2D({ url, nombre }: { url: string; nombre: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const contenedor = caja.current;
    if (!contenedor) return;
    let vivo = true;
    const limpiezas: (() => void)[] = [];

    (async () => {
      await cargarCore();
      const [{ Application, Ticker }, { Live2DModel }] = await Promise.all([import("pixi.js"), import("pixi-live2d-display-lipsyncpatch/cubism4")]);
      if (!vivo) return;
      if (!hayWebGL()) throw new Error("el navegador no entregó WebGL");
      // La librería suscribe el modelo al ticker compartido y lo actualiza sola.
      Live2DModel.registerTicker(Ticker);

      const lienzo = document.createElement("canvas");
      lienzo.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
      contenedor.replaceChildren(lienzo);
      const app = new Application({
        view: lienzo,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        width: contenedor.clientWidth,
        height: contenedor.clientHeight,
      });
      // Con `true`, Pixi quita también su lienzo de la página.
      limpiezas.push(() => app.destroy(true, { children: true }));

      const modelo = (await Live2DModel.from(url, { autoHitTest: false, autoFocus: false })) as unknown as Modelo;
      if (!vivo) {
        modelo.destroy({ children: true, texture: true, baseTexture: true });
        return;
      }
      limpiezas.unshift(() => modelo.destroy({ children: true, texture: true, baseTexture: true }));
      modelo.anchor.set(0, 0);
      app.stage.addChild(modelo as never);

      // De cuerpo entero: cabe a lo alto y a lo ancho, centrado.
      const encuadrar = () => {
        const ancho = contenedor.clientWidth;
        const alto = contenedor.clientHeight;
        if (!ancho || !alto) return;
        app.renderer.resize(ancho, alto);
        const { width, height } = modelo.internalModel;
        const escala = Math.min(alto / height, ancho / width) * 0.96;
        modelo.scale.set(escala);
        modelo.position.set((ancho - width * escala) / 2, (alto - height * escala) / 2);
      };
      encuadrar();
      const observador = new ResizeObserver(encuadrar);
      observador.observe(contenedor);
      limpiezas.unshift(() => observador.disconnect());

      // La mirada sigue al puntero, salvo con el movimiento reducido.
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const mirar = (e: PointerEvent) => {
          const r = lienzo.getBoundingClientRect();
          modelo.focus(e.clientX - r.left, e.clientY - r.top);
        };
        window.addEventListener("pointermove", mirar);
        limpiezas.unshift(() => window.removeEventListener("pointermove", mirar));
      }
    })().catch((e: unknown) => {
      if (vivo) setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      vivo = false;
      for (const limpiar of limpiezas) limpiar();
    };
  }, [url]);

  return (
    <div className="absolute inset-0">
      <div ref={caja} role="img" aria-label={`El modelo ${nombre}`} className="absolute inset-0" />
      {error && (
        <p role="status" className="absolute inset-x-6 bottom-[18%] rounded-2xl bg-fondo/85 px-4 py-3 text-center text-[13px] backdrop-blur-sm">
          No se pudo dibujar {nombre}: {error}. Mira public/live2d/LEEME.md.
        </p>
      )}
    </div>
  );
}
