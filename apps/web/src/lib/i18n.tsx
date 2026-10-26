"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { copy, fill, setMessageLocale, type Locale } from "./messages";

type LocaleValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (typeof copy)["es"];
};

const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({ initial, children }: { initial: Locale; children: React.ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initial);
  setMessageLocale(locale);

  function setLocale(next: Locale) {
    setLocaleState(next);
    setMessageLocale(next);
    document.cookie = `bf_locale=${next};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = next;
    router.refresh();
  }

  return <LocaleContext.Provider value={{ locale, setLocale, t: copy[locale] }}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("locale");
  return value;
}

export function useTx() {
  const value = useI18n();
  function tx(es: string, en: string) {
    return value.locale === "en" ? en : es;
  }
  return { ...value, tx };
}

export function Idioma() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="lang" role="group" aria-label={t.header.language}>
      <button type="button" aria-pressed={locale === "es"} onClick={() => setLocale("es")}>
        ES
      </button>
      <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
        EN
      </button>
    </div>
  );
}

export { fill };
