"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain } from "@/lib/api";

type Connection = { id: string; externalAccountId: string; status: string };

export default function FacebookConnect() {
  const { tx } = useTx();
  const [state, setState] = useState("");
  const [pageId, setPageId] = useState("");
  const [canPublish, setCanPublish] = useState(true);
  const [saved, setSaved] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [back, setBack] = useState("/conexiones");

  useEffect(() => {
    setState(new URLSearchParams(window.location.search).get("state") ?? "");
    if (sessionStorage.getItem("bf_connect_next") === "/empezar") setBack("/empezar");
  }, []);

  async function handleConnect(customPageId?: string) {
    const targetPageId = customPageId ?? pageId;
    if (!targetPageId.trim()) return;
    setMessage("");
    setLoading(true);
    try {
      const connection = await api<Connection>("/connections/facebook/callback", {
        method: "POST",
        body: JSON.stringify({
          state,
          pageId: targetPageId,
          scopes: canPublish ? ["pages_show_list", "pages_manage_posts"] : ["pages_show_list"],
        }),
      });
      setSaved(connection);
      setPageId(targetPageId);
    } catch (error) {
      setMessage(explain(error));
    } finally {
      setLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void handleConnect();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-12">
      {/* Brand & Network Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1877F2]/10 text-[#1877F2]">
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        </div>
        <div>
          <p className="eyebrow">{tx("Conexión oficial", "Official connection")}</p>
          <h1 className="text-3xl font-extrabold text-slate-900">{tx("Página de Facebook", "Facebook Page")}</h1>
        </div>
      </div>

      <p className="text-sm text-slate-600">
        {tx(
          "Conecta tu Página de Facebook para publicar piezas de campaña automáticamente y transmitir en vivo desde la consola o tableta.",
          "Connect your Facebook Page to automatically publish campaign pieces and broadcast live from the console or tablet."
        )}
      </p>

      {/* Instant Demo Connection Button */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-violet-50/50 p-5 shadow-2xs flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-indigo-600" />
          <h2 className="text-sm font-bold text-indigo-950">
            {tx("Modo de desarrollo rápido", "Quick development mode")}
          </h2>
        </div>
        <p className="text-xs text-indigo-900/90 leading-relaxed">
          {tx(
            "¿Quieres probar la publicación y transmisión de inmediato sin configurar credenciales de Meta? Conecta una Página verificada de prueba con un solo clic.",
            "Want to test publishing and broadcasting immediately without setting up Meta credentials? Connect a verified test Page with one click."
          )}
        </p>
        <button
          type="button"
          onClick={() => handleConnect("fb_pagina_oficial_demo")}
          disabled={!state || loading}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition"
        >
          {loading ? tx("Conectando...", "Connecting...") : tx("⚡ Conectar Página Demo (Pruebas)", "⚡ Connect Demo Page (Testing)")}
        </button>
      </div>

      {/* Manual / Custom Page ID Form */}
      <form className="sheet flex flex-col gap-4" onSubmit={submit}>
        <h2 className="text-lg font-bold text-slate-900">
          {tx("O especifica un identificador", "Or specify an identifier")}
        </h2>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          {tx("Identificador de la Página (Page ID)", "Page Identifier (Page ID)")}
          <input
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-hidden"
            placeholder="ej. 10928374652"
            value={pageId}
            onChange={(event) => setPageId(event.target.value)}
            required
          />
        </label>
        <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            checked={canPublish}
            onChange={(event) => setCanPublish(event.target.checked)}
          />
          {tx("Permiso para publicar contenido y directos (pages_manage_posts)", "Permission to publish posts and live (pages_manage_posts)")}
        </label>

        {message ? <p className="text-xs text-rose-600 font-medium">{message}</p> : null}

        <button
          className="min-h-11 rounded-xl bg-neutral-900 px-4 text-white text-sm font-semibold hover:bg-neutral-800 disabled:opacity-60 transition"
          type="submit"
          disabled={!state || loading}
        >
          {loading ? tx("Guardando...", "Saving...") : tx("Guardar conexión", "Save connection")}
        </button>
      </form>

      {/* Success Banner */}
      {saved ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-emerald-950">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-bold">
              {tx("Página conectada con éxito", "Page connected successfully")}
            </p>
            <p className="text-xs text-emerald-800">
              {saved.externalAccountId} · {saved.status === "active" ? tx("Lista para publicar y emitir", "Ready to publish and broadcast") : tx("Requiere permisos de publicación", "Requires publish permissions")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <Link className="chip" href={back}>
          {back === "/empezar" ? tx("← Volver al asistente", "← Back to setup") : tx("← Volver a conexiones", "← Back to connections")}
        </Link>
        {saved ? (
          <Link className="inline-flex min-h-10 items-center rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition" href="/conexiones">
            {tx("Ver en panel de conexiones →", "View in connections dashboard →")}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
