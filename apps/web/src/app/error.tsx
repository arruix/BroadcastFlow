"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console
    console.error("Application error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Algo salió mal</h1>
      <p className="text-sm text-slate-600 max-w-sm">
        Ocurrió un error inesperado al procesar la solicitud.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
        <button
          onClick={() => reset()}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
