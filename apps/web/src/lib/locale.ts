import { cookies } from "next/headers";
import { copy, type Locale } from "./messages";

export async function serverLocale(): Promise<Locale> {
  const jar = await cookies();
  return jar.get("bf_locale")?.value === "en" ? "en" : "es";
}

export async function serverCopy() {
  const locale = await serverLocale();
  return { locale, t: copy[locale] };
}

export function pick(locale: Locale, es: string, en: string) {
  return locale === "en" ? en : es;
}
