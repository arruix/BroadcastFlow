// Base del API para el servidor. El navegador sigue usando NEXT_PUBLIC_API_URL.
// API_INTERNAL_URL no lleva el prefijo NEXT_PUBLIC: no entra al bundle del cliente.

const localApi = "http://localhost:3001/v1";

export function apiBaseFrom(env: {
  internal?: string | null;
  publicUrl?: string | null;
}): string {
  const internal = trimBase(env.internal);
  if (internal) return internal;
  const pub = trimBase(env.publicUrl);
  if (pub) return pub;
  return localApi;
}

export function proxyHeaders(secret: string | null | undefined): Record<string, string> {
  const value = secret?.trim() ?? "";
  if (!value) return {};
  return { "X-BF-Proxy-Token": value };
}

function trimBase(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}
