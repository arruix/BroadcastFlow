"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";

type Organization = { id: string; name: string };
type Connection = { id: string; network: string; externalAccountId: string; status: string };

export default function Conexiones() {
  const { tx } = useTx();
  const [organizationId, setOrganizationId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [showConfigHelp, setShowConfigHelp] = useState(false);

  useEffect(() => {
    if (!signedIn()) {
      setNeedsSignIn(true);
      return;
    }
    api<Organization[]>("/organizations")
      .then(async (rows) => {
        const org = rows[0]?.id ?? "";
        setOrganizationId(org);
        if (!org) return;
        setConnections(await api<Connection[]>("/connections", { org }));
      })
      .catch((error) => setMessage(explain(error)));
  }, []);

  async function connect(network: "facebook" | "youtube") {
    setMessage("");
    setLoading(network);
    try {
      sessionStorage.removeItem("bf_connect_next");
      const started = await api<{ authorizationUrl: string }>(`/connections/${network}/start`, {
        method: "POST",
        org: organizationId,
      });
      window.location.assign(started.authorizationUrl);
    } catch (error) {
      setLoading(null);
      setMessage(explain(error));
    }
  }

  async function disconnect(connectionId: string) {
    if (!confirm(tx("¿Deseas desconectar esta cuenta?", "Do you want to disconnect this account?"))) {
      return;
    }
    setMessage("");
    try {
      await api(`/connections/${connectionId}`, {
        method: "DELETE",
        org: organizationId,
      });
      setConnections((prev) => prev.filter((item) => item.id !== connectionId));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  const fbConnection = connections.find((c) => c.network === "facebook");
  const ytConnection = connections.find((c) => c.network === "youtube");

  return (
    <main className="console-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{tx("Canales oficiales", "Official channels")}</p>
          <h1 className="text-4xl">{tx("Conexiones de Redes", "Social Connections")}</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowConfigHelp(!showConfigHelp)}
          className="chip flex items-center gap-1.5"
        >
          <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {showConfigHelp ? tx("Ocultar guía", "Hide guide") : tx("Guía de configuración", "Configuration guide")}
        </button>
      </header>

      {needsSignIn ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-amber-950">
          <p className="font-semibold">{tx("Inicia sesión para gestionar las conexiones de tus redes.", "Sign in to manage your network connections.")}</p>
          <Link className="inline-flex min-h-11 w-fit items-center rounded-xl bg-neutral-900 px-4 text-white text-sm font-semibold" href="/ingresar">
            {tx("Entrar a la consola", "Sign in to console")}
          </Link>
        </div>
      ) : null}

      {message ? <p className="note text-rose-600">{message}</p> : null}

      {/* Guide Card (collapsible) */}
      {showConfigHelp ? (
        <section className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-slate-50 p-6 flex flex-col gap-4 text-sm text-slate-700 shadow-2xs">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-2xs">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-slate-900">{tx("Cómo funcionan las conexiones oficiales", "How official connections work")}</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5 p-3.5 bg-white/80 rounded-xl border border-slate-200/60">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#1877F2]" />
                Facebook Pages (Meta)
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                {tx(
                  "En producción se configura FACEBOOK_APP_ID y FACEBOOK_APP_SECRET. En desarrollo local, al hacer clic en Conectar puedes usar el botón de 'Conectar Página Demo' para pruebas instantáneas.",
                  "In production configure FACEBOOK_APP_ID and FACEBOOK_APP_SECRET. In local dev, clicking Connect provides a 'Connect Demo Page' button for instant testing."
                )}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 p-3.5 bg-white/80 rounded-xl border border-slate-200/60">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#FF0000]" />
                YouTube Channels (Google Cloud)
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                {tx(
                  "Requiere credenciales OAuth 2.0 con el scope 'youtube'. Permite retransmitir el stream RTMP directamente a tu canal cuando emites en vivo.",
                  "Requires OAuth 2.0 credentials with 'youtube' scope. Allows pushing RTMP live streams directly to your channel during live broadcasts."
                )}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Featured Networks Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* FACEBOOK CARD */}
        <article className="sheet flex flex-col justify-between gap-5 relative overflow-hidden border border-slate-200/80 hover:border-slate-300 transition">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1877F2]/10 text-[#1877F2]">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Facebook Page</h2>
                  <p className="text-xs text-slate-500">{tx("Páginas oficiales de Meta", "Official Meta Pages")}</p>
                </div>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  fbConnection?.status === "active"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {fbConnection?.status === "active" ? tx("Conectada", "Connected") : tx("No conectada", "Not connected")}
              </span>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              {tx(
                "Publica piezas y avisos como Página de Facebook con enlace oficial de donación, y transmite en vivo desde la consola.",
                "Publish pieces and notices as a Facebook Page with official donation link, and broadcast live from the console."
              )}
            </p>

            {fbConnection ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 flex flex-col gap-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">{tx("Identificador", "Account ID")}:</span>
                  <span className="font-mono font-semibold text-slate-900">{fbConnection.externalAccountId}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">{tx("Estado de permisos", "Permissions")}:</span>
                  <span className="font-medium text-emerald-700">{tx("Publicación y Live activo", "Publishing and Live active")}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
            {fbConnection ? (
              <>
                <Link className="chip" href="/campanas">
                  {tx("Crear publicación", "Create post")}
                </Link>
                <button
                  type="button"
                  onClick={() => disconnect(fbConnection.id)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition"
                >
                  {tx("Desconectar", "Disconnect")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => connect("facebook")}
                disabled={!organizationId || loading === "facebook"}
                className="w-full min-h-11 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-semibold text-sm shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading === "facebook" ? (
                  <span>{tx("Conectando...", "Connecting...")}</span>
                ) : (
                  <span>{tx("Conectar Página de Facebook", "Connect Facebook Page")}</span>
                )}
              </button>
            )}
          </div>
        </article>

        {/* YOUTUBE CARD */}
        <article className="sheet flex flex-col justify-between gap-5 relative overflow-hidden border border-slate-200/80 hover:border-slate-300 transition">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF0000]/10 text-[#FF0000]">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">YouTube Live</h2>
                  <p className="text-xs text-slate-500">{tx("Canales de YouTube", "YouTube Channels")}</p>
                </div>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  ytConnection?.status === "active"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {ytConnection?.status === "active" ? tx("Conectado", "Connected") : tx("No conectado", "Not connected")}
              </span>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              {tx(
                "Emite transmisiones en vivo sincronizadas con tu canal de YouTube utilizando el cupo de minutos incluido en tu suscripción.",
                "Broadcast live streams synchronized with your YouTube channel using the minutes quota included in your subscription."
              )}
            </p>

            {ytConnection ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 flex flex-col gap-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">{tx("Identificador", "Channel ID")}:</span>
                  <span className="font-mono font-semibold text-slate-900">{ytConnection.externalAccountId}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">{tx("Estado de emisión", "Live status")}:</span>
                  <span className="font-medium text-emerald-700">{tx("Directo habilitado", "Live streaming enabled")}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
            {ytConnection ? (
              <>
                <Link className="chip" href="/campanas">
                  {tx("Ir a estudio en vivo", "Go to live studio")}
                </Link>
                <button
                  type="button"
                  onClick={() => disconnect(ytConnection.id)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition"
                >
                  {tx("Desconectar", "Disconnect")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => connect("youtube")}
                disabled={!organizationId || loading === "youtube"}
                className="w-full min-h-11 rounded-xl bg-[#FF0000] hover:bg-[#e60000] text-white font-semibold text-sm shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading === "youtube" ? (
                  <span>{tx("Conectando...", "Connecting...")}</span>
                ) : (
                  <span>{tx("Conectar canal de YouTube", "Connect YouTube channel")}</span>
                )}
              </button>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}
