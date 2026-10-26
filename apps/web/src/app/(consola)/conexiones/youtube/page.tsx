"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain } from "@/lib/api";

type Connection = { id: string; externalAccountId: string; status: string };

export default function YoutubeConnect() {
  const { tx } = useTx();
  const [state, setState] = useState("");
  const [channelId, setChannelId] = useState("");
  const [canBroadcast, setCanBroadcast] = useState(true);
  const [saved, setSaved] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [back, setBack] = useState("/conexiones");

  useEffect(() => {
    setState(new URLSearchParams(window.location.search).get("state") ?? "");
    if (sessionStorage.getItem("bf_connect_next") === "/empezar") setBack("/empezar");
  }, []);

  async function handleConnect(customChannelId?: string) {
    const targetChannelId = customChannelId ?? channelId;
    if (!targetChannelId.trim()) return;
    setMessage("");
    setLoading(true);
    try {
      const connection = await api<Connection>("/connections/youtube/callback", {
        method: "POST",
        body: JSON.stringify({
          state,
          channelId: targetChannelId,
          scopes: canBroadcast ? ["youtube"] : [],
        }),
      });
      setSaved(connection);
      setChannelId(targetChannelId);
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
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF0000]/10 text-[#FF0000]">
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
        </div>
        <div>
          <p className="eyebrow">{tx("Conexión oficial", "Official connection")}</p>
          <h1 className="text-3xl font-extrabold text-slate-900">{tx("Canal de YouTube", "YouTube Channel")}</h1>
        </div>
      </div>

      <p className="text-sm text-slate-600">
        {tx(
          "Conecta tu canal de YouTube para habilitar transmisiones en vivo sincronizadas con Facebook en tus campañas.",
          "Connect your YouTube channel to enable synchronized live broadcasts with Facebook in your campaigns."
        )}
      </p>

      {/* Instant Demo Connection Button */}
      <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/80 to-amber-50/50 p-5 shadow-2xs flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-rose-600" />
          <h2 className="text-sm font-bold text-rose-950">
            {tx("Modo de desarrollo rápido", "Quick development mode")}
          </h2>
        </div>
        <p className="text-xs text-rose-950/90 leading-relaxed">
          {tx(
            "¿Quieres probar la transmisión de video en vivo de inmediato sin configurar credenciales de Google Cloud? Conecta un canal verificado de prueba con un solo clic.",
            "Want to test live video broadcasting immediately without setting up Google Cloud credentials? Connect a verified test channel with one click."
          )}
        </p>
        <button
          type="button"
          onClick={() => handleConnect("yt_canal_oficial_demo")}
          disabled={!state || loading}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60 transition"
        >
          {loading ? tx("Conectando...", "Connecting...") : tx("⚡ Conectar Canal Demo (Pruebas)", "⚡ Connect Demo Channel (Testing)")}
        </button>
      </div>

      {/* Manual Channel ID Form */}
      <form className="sheet flex flex-col gap-4" onSubmit={submit}>
        <h2 className="text-lg font-bold text-slate-900">
          {tx("O especifica un identificador", "Or specify an identifier")}
        </h2>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          {tx("Identificador del canal (Channel ID)", "Channel Identifier (Channel ID)")}
          <input
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 focus:border-rose-500 focus:outline-hidden"
            placeholder="ej. UC_x5XG1OV2P6uZZ5FSM9Ttw"
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            required
          />
        </label>
        <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
            checked={canBroadcast}
            onChange={(event) => setCanBroadcast(event.target.checked)}
          />
          {tx("Permiso para emitir en directo en el canal (scope youtube)", "Permission to live stream on channel (scope youtube)")}
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
              {tx("Canal conectado con éxito", "Channel connected successfully")}
            </p>
            <p className="text-xs text-emerald-800">
              {saved.externalAccountId} · {saved.status === "active" ? tx("Listo para emitir en vivo", "Ready to broadcast live") : tx("Requiere permisos de emisión", "Requires broadcast permissions")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <Link className="chip" href={back}>
          {back === "/empezar" ? tx("← Volver al asistente", "← Back to setup") : tx("← Volver a conexiones", "← Back to connections")}
        </Link>
        {saved ? (
          <Link className="inline-flex min-h-10 items-center rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 transition" href="/conexiones">
            {tx("Ver en panel de conexiones →", "View in connections dashboard →")}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
