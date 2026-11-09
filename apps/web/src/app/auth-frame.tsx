import { ReactNode } from "react";
import Link from "next/link";
import { Idioma } from "@/lib/i18n";

export function AuthFrame({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <Link className="brand w-fit" href="/">
          BroadcastFlow
        </Link>
        <Idioma />
      </div>
      <div className="flex flex-col gap-2">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
      </div>
      {children}
    </main>
  );
}

export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 fill-rose-700">
        <path d="M10 1.8 1.6 17h16.8L10 1.8Zm0 5.2c.4 0 .7.3.7.7v4.1a.7.7 0 0 1-1.4 0V7.7c0-.4.3-.7.7-.7Zm0 8.2a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

export function AuthButton({
  busy,
  busyLabel,
  children,
}: {
  busy?: boolean;
  busyLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white disabled:opacity-70"
      disabled={busy}
      aria-busy={busy || undefined}
      type="submit"
    >
      {busy ? busyLabel : children}
    </button>
  );
}

export const fieldClass = "min-h-11 rounded-xl border px-3";
