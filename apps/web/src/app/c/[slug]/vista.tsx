import type { CSSProperties, ReactNode } from "react";
import { frameStyle, safeAccent, type Frame } from "@/lib/encuadre";

function fillText(text: string, values: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

function amount(minor: number, currency: string) {
  return `$${(minor / 100).toLocaleString("es-MX", { maximumFractionDigits: 0 })} ${currency}`;
}

export type LandingDesign = {
  title: string;
  story: string;
  imageKey: string | null;
  hero: Frame;
  accent: string;
  amountsMinor: number[];
  cta: string;
  showProgress: boolean;
  thankYou: string;
};

type Notice = {
  controller: string;
  purpose: string;
  dataCategories: string;
  retention: string;
};

// Misma página que ve quien abre el enlace. La consola la reutiliza como vista previa.
export function PaginaPublica({
  tx,
  name,
  story,
  cover,
  frame,
  accent,
  showProgress,
  goalMinor,
  confirmedMinor,
  confirmedCount,
  intentionMinor,
  intentionCount,
  currency,
  liveUrl,
  statusNote,
  measureNote,
  donate,
  notice,
  idioma,
}: {
  tx: (es: string, en: string) => string;
  name: string;
  story: string | null;
  cover: string | null;
  frame: Frame | null;
  accent: string | null;
  showProgress: boolean;
  goalMinor: number | null;
  confirmedMinor: number;
  confirmedCount: number;
  intentionMinor: number;
  intentionCount: number;
  currency: string;
  liveUrl: string | null;
  statusNote: ReactNode;
  measureNote: ReactNode;
  donate: ReactNode;
  notice: Notice | null;
  idioma?: ReactNode;
}) {
  const goal = goalMinor;
  const share = goal ? Math.min(100, Math.round((confirmedMinor / goal) * 100)) : null;
  const color = accent ? safeAccent(accent) : null;

  return (
    <div
      className="public-page"
      style={color ? ({ ["--accent" as string]: color, ["--accent-strong" as string]: color } as CSSProperties) : undefined}
    >
      <header className="public-top">
        <p className="eyebrow flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
          {tx("Página oficial de campaña", "Official campaign page")}
        </p>
        {idioma}
      </header>
      <main className="public-grid mx-auto grid max-w-5xl items-start gap-8 px-4 pb-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex flex-col gap-6">
          <div
            className="public-cover"
            style={color ? { background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 45%, white))` } : undefined}
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" style={frame ? frameStyle(frame) : undefined} />
            ) : (
              <span aria-hidden="true">{name.slice(0, 1)}</span>
            )}
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">{name}</h1>
          {liveUrl ? (
            <figure className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500"></span>
                </span>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-rose-600">{tx("En vivo", "Live")}</span>
              </div>
              <video className="w-full rounded-xl bg-slate-950 shadow-md" controls src={liveUrl} />
            </figure>
          ) : null}
          {story ? <p className="public-story">{story}</p> : null}
          {statusNote}
          {measureNote}
        </section>
        <aside className="panel donate-card flex flex-col gap-4 p-5 lg:sticky lg:top-6">
          {showProgress ? (
            <div className="flex flex-col gap-2">
              <p className="text-3xl font-extrabold text-slate-900">{amount(confirmedMinor, currency)}</p>
              <p className="text-sm text-[var(--muted)]">
                {goal
                  ? fillText(tx("confirmados en el libro, de una meta de {goal}", "confirmed on the ledger, of a {goal} goal"), { goal: amount(goal, currency) })
                  : tx("confirmados en el libro", "confirmed on the ledger")}
              </p>
              {share !== null ? (
                <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} aria-label={tx("Avance de la meta", "Goal progress")}>
                  <span style={{ width: `${Math.max(2, share)}%` }} />
                </div>
              ) : null}
              <p className="text-sm text-slate-700">
                {share !== null ? `${share}% · ` : ""}
                {confirmedCount === 1
                  ? tx("1 pago confirmado en el libro", "1 payment confirmed on the ledger")
                  : fillText(tx("{n} pagos confirmados en el libro", "{n} payments confirmed on the ledger"), { n: String(confirmedCount) })}
              </p>
              {intentionCount > 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  {fillText(
                    tx(
                      "{amount} en {count} intenciones. No son pagos confirmados ni los cobra BroadcastFlow.",
                      "{amount} in {count} intentions. These are not confirmed payments and BroadcastFlow does not collect them.",
                    ),
                    { amount: amount(intentionMinor, currency), count: String(intentionCount) },
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
          {donate}
        </aside>
      </main>
      <footer className="public-footer">
        {notice ? (
          <details id="aviso">
            <summary>{tx("Aviso de privacidad", "Privacy notice")}</summary>
            <div className="flex flex-col gap-1 pt-2">
              <p>{tx("Responsable", "Controller")}: {notice.controller}</p>
              <p>{tx("Finalidad", "Purpose")}: {notice.purpose}</p>
              <p>{tx("Datos", "Data")}: {notice.dataCategories}</p>
              <p>{tx("Plazo", "Retention")}: {notice.retention}</p>
            </div>
          </details>
        ) : null}
        <p>BroadcastFlow</p>
      </footer>
    </div>
  );
}
