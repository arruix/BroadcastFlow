const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly ticket?: string,
  ) {
    super(code);
  }
}

export const messages: Record<string, string> = {
  email_taken: "Ese correo ya tiene cuenta.",
  weak_password: "La contraseña necesita 12 caracteres.",
  token_invalid: "El enlace no sirve. Pide otro.",
  locked: "La cuenta queda bloqueada 15 minutos.",
  email_unverified: "Falta verificar el correo.",
  invalid_credentials: "Correo o clave incorrectos.",
  mfa_required: "Hace falta el código de 6 dígitos.",
  mfa_enroll_required: "Hay que activar el segundo factor.",
  store_url_invalid: "El enlace de tienda tiene que empezar por https.",
  slug_invalid: "El slug no cumple el formato.",
  slug_taken: "Ese slug ya está usado.",
  timezone_invalid: "La zona horaria no es IANA.",
  country_invalid: "Revisa el país o la moneda.",
  dates_invalid: "La fecha de fin es anterior al inicio.",
  forbidden: "No puedes ver esa organización.",
  notice_required: "El aviso necesita responsable, finalidad, datos y plazo. El texto de ejemplo no se publica.",
  not_eligible: "Esa donación no se puede iniciar.",
  commercial_has_no_donation_page: "La campaña comercial no abre página de donación.",
  electoral_without_policy: "La electoral permanece en borrador hasta que exista el paquete.",
  unbalanced: "El aviso de la pasarela no cuadra con la donación.",
  not_draft: "La campaña ya no está en borrador.",
  idempotency_required: "Falta la llave de idempotencia.",
  rate_limited: "Demasiados intentos. Espera un minuto.",
  variant_invalid: "Esa variante no cumple el límite de Facebook y no se programa.",
  connection_reauth: "La Página necesita reautorización para publicar.",
  connection_limit: "El plan ya no admite otra conexión.",
  network_unavailable: "Esa red no está disponible.",
  share_invalid: "La ficha necesita título y descripción.",
  image_invalid: "La imagen de la ficha tiene que empezar por https.",
  beacon_invalid: "La visita no trae identificador o tipo.",
  spend_invalid: "Ese gasto no se puede guardar. El directo no tiene CPC y un periodo cerrado no cambia.",
};

export function explain(error: unknown): string {
  if (error instanceof ApiError) return messages[error.code] ?? error.code;
  return "No se pudo completar.";
}

export async function api<T>(path: string, init: RequestInit & { org?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  if (init.org) headers.set("x-organization-id", init.org);
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as {
    code?: string;
    ticket?: string;
    accessToken?: string;
  };
  if (!response.ok) throw new ApiError(body.code ?? "token_invalid", body.ticket);
  if (body.accessToken) accessToken = body.accessToken;
  return body as T;
}

export async function refreshSession(): Promise<boolean> {
  const response = await fetch(`${apiUrl}/auth/refresh`, { method: "POST", credentials: "include" });
  if (!response.ok) {
    accessToken = null;
    return false;
  }
  const body = (await response.json()) as { accessToken: string };
  accessToken = body.accessToken;
  return true;
}

export function signedIn(): boolean {
  return accessToken !== null;
}

export function clearSession(): void {
  accessToken = null;
}

export async function watchEvents(organizationId: string, onEvent: () => void, signal: AbortSignal) {
  const response = await fetch(`${apiUrl}/organizations/${organizationId}/events`, {
    headers: {
      authorization: `Bearer ${accessToken ?? ""}`,
      accept: "text/event-stream",
    },
    signal,
  });
  if (!response.ok || !response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    if (!buffer.includes("visit.counted")) continue;
    buffer = "";
    onEvent();
  }
}
