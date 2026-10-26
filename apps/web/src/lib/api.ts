import { copy, messageLocaleNow } from "./messages";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
    readonly ticket?: string,
  ) {
    super(code);
  }
}

export function explain(error: unknown): string {
  const text = copy[messageLocaleNow()].errors;
  if (!(error instanceof ApiError)) return text.failed;
  if (error.code === "token_invalid" && error.status === 422) return text.link_invalid;
  return text[error.code as keyof typeof text] ?? text.failed;
}

export async function api<T>(path: string, init: RequestInit & { org?: string } = {}, retried = false): Promise<T> {
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
  if (response.status === 401 && body.code === "token_invalid" && !retried) {
    const renewed = await refreshSession();
    if (renewed) return api<T>(path, init, true);
    accessToken = null;
  }
  if (!response.ok) throw new ApiError(body.code ?? "request_failed", response.status, body.ticket);
  if (body.accessToken) accessToken = body.accessToken;
  return body as T;
}

let refreshInflight: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  if (!refreshInflight) {
    refreshInflight = refreshOnce().finally(() => {
      refreshInflight = null;
    });
  }
  return refreshInflight;
}

async function refreshOnce(): Promise<boolean> {
  const response = await fetch(`${apiUrl}/auth/refresh`, { method: "POST", credentials: "include" });
  if (!response.ok) {
    accessToken = null;
    return false;
  }
  const body = (await response.json()) as { accessToken: string };
  accessToken = body.accessToken;
  return true;
}

export async function download(path: string, org: string): Promise<Blob> {
  const headers = new Headers();
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  if (org) headers.set("x-organization-id", org);
  const response = await fetch(`${apiUrl}${path}`, { headers, credentials: "include" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string };
    throw new ApiError(body.code ?? "request_failed", response.status);
  }
  return response.blob();
}

export function signedIn(): boolean {
  return accessToken !== null;
}

export function clearSession(): void {
  accessToken = null;
}

export function afterAuthPath(operator: boolean, organizationCount: number) {
  if (typeof window !== "undefined") {
    const next = sessionStorage.getItem("bf_after_login");
    if (next?.startsWith("/invitar")) {
      sessionStorage.removeItem("bf_after_login");
      return next;
    }
  }
  if (operator) return "/plataforma";
  return organizationCount ? "/tablero" : "/empezar";
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
    if (!buffer.includes("visit.counted") && !buffer.includes("live.destination")) continue;
    buffer = "";
    onEvent();
  }
}
