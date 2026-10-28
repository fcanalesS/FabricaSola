/**
 * La red, de mentira, para probar las rutas. Reemplaza `fetch` y contesta como contestarían Jev,
 * Telnyx, los servicios de issues, la salud de un entorno y OSV.dev, con lo que cada prueba diga.
 *
 * Nada sale del equipo: una dirección que esta red no conoce es un error, no una petición de
 * verdad. Y todo lo que la aplicación quiso mandar queda anotado, que es lo que las pruebas miran:
 * qué le llegó a quién.
 */

/** `instrucciones`: de cada pregunta, lo que se le preguntó con sus palabras. */
export type PedidoAJev = { estado: Record<string, unknown>; preguntas: string[]; instrucciones: Record<string, string> };

/** Un pedido a un servicio de issues: a qué servidor, qué dirección (con su consulta), con qué método y qué cabeceras. */
export type PedidoAServicio = { servidor: string; ruta: string; metodo: string; cabeceras: Record<string, string> };

const POR_DEFECTO = {
  /** Lo que contesta la fábrica (en vez del motor; ver `usarFabricaDePrueba`). `null`: no contestó. */
  fabrica: (() => null) as (pedido: { ruta: string; cuerpo: Record<string, unknown>; metodo: string }) => { estado: number; datos: unknown } | null,
  /** Lo que contesta Jev: de cada pregunta, qué tan cierto es, de 0 a 1. Lo que falte vale 0. `null`: no contesta. Puede tardar. */
  jev: (() => ({})) as (pedido: PedidoAJev) => Record<string, number> | null | Promise<Record<string, number>>,
  /** Lo que Jev elige en una pregunta de varias opciones: de cada pregunta, el peso de cada opción. La que falte vuelve sin pesos. */
  elige: (() => ({})) as (pedido: PedidoAJev) => Record<string, Record<string, number>>,
  /** Lo que contesta Telnyx al pedirle una llamada. `null`: no contesta. */
  telnyx: (() => ({ estado: 200, datos: { data: { call_control_id: "llamada-de-prueba" } } })) as (cuerpo: Record<string, unknown>) => { estado: number; datos: unknown } | null,
  /**
   * Lo que contesta un servicio de issues de la Entrada (GitHub, o un GitLab o GitHub propio en un
   * servidor `.test`). Recibe el pedido. `null`: no contesta. Por defecto, nada existe.
   */
  issues: (() => ({ estado: 404, datos: { message: "Not Found" } })) as (pedido: PedidoAServicio) => { estado: number; datos: unknown; cabeceras?: Record<string, string> } | null,
  /** Lo que contesta la salud de un entorno de un proceso (un servidor `.proceso.test`): su código. `null`: no contesta. */
  salud: (() => 200) as (pedido: { metodo: string; url: string }) => number | null,
  /** Lo que contesta OSV.dev a una consulta del vigía. Por defecto, ninguna vulnerabilidad. `null`: no contesta. */
  osv: ((cuerpo: { queries?: unknown[] }) => ({ results: (cuerpo.queries ?? []).map(() => ({})) })) as (cuerpo: { queries?: unknown[] }) => unknown,
};

export const red = {
  ...POR_DEFECTO,
  /** Lo que se le quiso mandar a la API de Claude: la dirección. La fábrica no la usa, así que tiene que quedar vacío. */
  aClaude: [] as string[],
  /** Lo que se le preguntó a Jev, en orden. */
  aJev: [] as PedidoAJev[],
  /** Las direcciones de todo lo demás que se pidió. */
  aOtros: [] as string[],
  /** Lo que se le pidió a la fábrica, en orden. */
  aLaFabrica: [] as { ruta: string; cuerpo: Record<string, unknown> }[],
  /** Las llamadas que se le pidieron a Telnyx: con qué clave y qué cuerpo. */
  aTelnyx: [] as { clave: string; cuerpo: Record<string, unknown> }[],
  /** Lo que se le pidió a los servicios de issues, en orden. */
  aServicios: [] as PedidoAServicio[],
  /** Las comprobaciones de salud de los procesos, en orden: método y dirección. */
  aSalud: [] as { metodo: string; url: string }[],
  /** Lo que se le preguntó a OSV.dev, en orden: el cuerpo entero. */
  aOsv: [] as Record<string, unknown>[],
  /** Cuántas peticiones están en camino. */
  enCamino: 0,
  ultima: 0,

  /** Deja la red como al principio: sin nada anotado y contestando lo de siempre. */
  reiniciar() {
    Object.assign(red, POR_DEFECTO);
    red.aClaude.length = 0;
    red.aJev.length = 0;
    red.aOtros.length = 0;
    red.aLaFabrica.length = 0;
    red.aTelnyx.length = 0;
    red.aServicios.length = 0;
    red.aSalud.length = 0;
    red.aOsv.length = 0;
  },

  /** Espera a que no quede nada en camino: lo que una ruta deja corriendo por detrás termina acá. */
  async calma(quietoMs = 40): Promise<void> {
    const hasta = Date.now() + 5_000;
    while (Date.now() < hasta) {
      if (red.enCamino === 0 && Date.now() - red.ultima >= quietoMs) return;
      await new Promise((listo) => setTimeout(listo, 10));
    }
    throw new Error("La red no se quedó quieta.");
  },
};

const json = (dato: unknown, estado = 200) => new Response(JSON.stringify(dato), { status: estado, headers: { "content-type": "application/json" } });

async function deJev(cuerpo: { state?: Record<string, unknown>; questions?: Record<string, { type?: string; instructions?: string; criteria?: Record<string, string> }> }): Promise<Response> {
  const preguntas = cuerpo.questions ?? {};
  const pedido = { estado: cuerpo.state ?? {}, preguntas: Object.keys(preguntas), instrucciones: Object.fromEntries(Object.entries(preguntas).map(([clave, pregunta]) => [clave, pregunta.instructions ?? ""])) };
  red.aJev.push(pedido);
  const dicho = await red.jev(pedido);
  if (!dicho) return json({ error: "Un fallo de prueba." }, 500);
  const pesos = red.elige(pedido);
  const respuestas = Object.fromEntries(
    Object.entries(preguntas).map(([clave, pregunta]) => [
      clave,
      pregunta.type === "choice" ? { choice: Object.keys(pregunta.criteria ?? {})[0], confidence: dicho[clave] ?? 0, ...(pesos[clave] ? { probabilities: pesos[clave] } : {}) } : { noul: dicho[clave] ?? 0 },
    ]),
  );
  return json({ answers: respuestas });
}

async function fetchDePrueba(entrada: RequestInfo | URL, opciones?: RequestInit): Promise<Response> {
  const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
  const texto = entrada instanceof Request ? await entrada.text() : typeof opciones?.body === "string" ? opciones.body : "";
  const cuerpo = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  const cabeceras = entrada instanceof Request ? entrada.headers : new Headers(opciones?.headers);
  const metodo = (entrada instanceof Request ? entrada.method : opciones?.method) ?? "GET";
  red.enCamino++;
  try {
    // Un respiro, como la red de verdad: lo que va en paralelo tiene que seguir yendo en paralelo.
    await new Promise((listo) => setTimeout(listo, 1));
    // La fábrica no usa la API de Claude: si algo la llama, queda anotado y falla.
    if (url.host === "api.anthropic.com") {
      red.aClaude.push(url.pathname);
      throw new TypeError("fetch failed");
    }
    // Telnyx, para que suene el teléfono: se anota con qué clave y qué se pidió.
    if (url.host === "api.telnyx.com") {
      const clave = (cabeceras.get("authorization") ?? "").replace(/^Bearer /, "");
      red.aTelnyx.push({ clave, cuerpo });
      const r = red.telnyx(cuerpo);
      if (!r) throw new TypeError("fetch failed");
      return json(r.datos, r.estado);
    }
    if (url.host === "api.typesafe.ai") return await deJev(cuerpo);
    // OSV.dev, del vigía de vulnerabilidades: se anota todo lo que se le mandó.
    if (url.host === "api.osv.dev") {
      red.aOsv.push(cuerpo);
      const respuesta = red.osv(cuerpo as { queries?: unknown[] });
      if (respuesta === null) throw new TypeError("fetch failed");
      return json(respuesta);
    }
    // La salud de un entorno, de un paso de un proceso: solo se pide la dirección.
    if (url.hostname.endsWith(".proceso.test")) {
      const pedido = { metodo, url: url.href };
      red.aSalud.push(pedido);
      const codigo = red.salud(pedido);
      if (codigo === null) throw new TypeError("fetch failed");
      return new Response(null, { status: codigo });
    }
    // Los servicios de issues de la Entrada: GitHub, o uno propio en un servidor de prueba (`.test`).
    if (url.host === "api.github.com" || url.hostname.endsWith(".test")) {
      const pedido = { servidor: url.host, ruta: `${url.pathname}${url.search}`, metodo, cabeceras: Object.fromEntries(cabeceras) };
      red.aServicios.push(pedido);
      const r = red.issues(pedido);
      if (!r) throw new TypeError("fetch failed");
      return new Response(JSON.stringify(r.datos), { status: r.estado, headers: { "content-type": "application/json", ...r.cabeceras } });
    }
    red.aOtros.push(`${url.host}${url.pathname}`);
    throw new Error(`La red de prueba no conoce ${url.host}: nada sale del equipo.`);
  } finally {
    red.enCamino--;
    red.ultima = Date.now();
  }
}

/**
 * La fábrica de mentira: atiende lo que la aplicación le pide al motor de la fábrica, con lo que
 * diga `red.fabrica`, y lo anota. El entorno la pone en lugar del motor (`usarFabricaDePrueba`).
 */
export async function aLaFabricaDePrueba(ruta: string, cuerpo: unknown, metodo: string): Promise<{ estado: number; datos: unknown } | null> {
  const pedido = { ruta: new URL(ruta, "http://fabrica.local").pathname, cuerpo: (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown> };
  red.aLaFabrica.push(pedido);
  return red.fabrica({ ...pedido, metodo });
}

/** Pone la red de mentira en el lugar de la de verdad. Va antes de cargar nada que use la red. */
export function instalarRed(): void {
  globalThis.fetch = fetchDePrueba as typeof fetch;
}
