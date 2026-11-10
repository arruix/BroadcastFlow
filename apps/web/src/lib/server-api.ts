import "server-only";
import { apiBaseFrom, proxyHeaders } from "./api-origin";

// Lectura dinámica: Next no incrusta estas variables en el build.
// En el contenedor web, API_INTERNAL_URL llega al arrancar (http://api:3001/v1).
function read(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" ? value : undefined;
}

export function serverApiBase(): string {
  return apiBaseFrom({
    internal: read("API_INTERNAL_URL"),
    publicUrl: read("NEXT_PUBLIC_API_URL"),
  });
}

// El API cree X-Forwarded-For solo si este secreto coincide con el de Caddy.
// No se reenvía la cadena del visitante: esta llamada es del propio servidor.
export function serverApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(proxyHeaders(read("PROXY_SHARED_SECRET")))) {
    headers.set(key, value);
  }
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${serverApiBase()}${suffix}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
