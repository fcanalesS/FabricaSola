/**
 * Si él quiere que ella le avise en el navegador cuando una tarea de la
 * fábrica lo espera. Es una comodidad de este navegador, nada más: queda en
 * su almacenamiento local, y el permiso lo da él en el navegador. Solo para
 * la página.
 */

const CLAVE = "fabrica-avisos-del-navegador";

/** Si está encendido aquí y el navegador deja avisar. */
export function quiereAvisos(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "si" && typeof Notification !== "undefined" && Notification.permission === "granted";
  } catch {
    return false;
  }
}

/** Si este navegador puede avisar, y si él ya dijo que no (entonces solo él lo cambia, en el navegador). */
export function puedeAvisar(): "si" | "bloqueado" | "no_existe" {
  if (typeof Notification === "undefined") return "no_existe";
  return Notification.permission === "denied" ? "bloqueado" : "si";
}

/** Lo enciende pidiendo el permiso, o lo apaga. Devuelve cómo quedó. */
export async function fijarAvisos(encender: boolean): Promise<boolean> {
  try {
    if (!encender) {
      localStorage.removeItem(CLAVE);
      return false;
    }
    if (typeof Notification === "undefined") return false;
    const permiso = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permiso !== "granted") return false;
    localStorage.setItem(CLAVE, "si");
    return true;
  } catch {
    return false;
  }
}
