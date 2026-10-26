"use client";

import Link from "next/link";
import { fill, Idioma, useI18n } from "@/lib/i18n";

type Offer = {
  price: string | null;
  feeBps: number | null;
  campaignLimit: number | null;
  liveMinutes: number | null;
};

export function HomeView({ price, feeBps, campaignLimit, liveMinutes }: Offer) {
  const { locale, t } = useI18n();
  const fee = feeBps == null ? null : `${(feeBps / 100).toLocaleString(locale === "en" ? "en-US" : "es-MX", { maximumFractionDigits: 2 })}%`;
  const home = t.home;
  return (
    <main className="home">
      <header className="home-bar">
        <Link className="brand group" href="/">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/25 transition-transform group-hover:scale-105" aria-hidden="true">
            <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856a9.75 9.75 0 0 1 13.788 0M12 18.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
            </svg>
          </span>
          <span className="font-bold text-slate-900 tracking-tight">BroadcastFlow</span>
        </Link>
        <nav className="home-nav" aria-label={home.eyebrow}>
          <a href="#recorrido">{home.path}</a>
          <a href="#precio">{home.price}</a>
          <a href="#tipos">{home.kinds}</a>
          <a href="#preguntas">{home.questions}</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Idioma />
          <Link className="inline-flex min-h-11 items-center px-3" href="/ingresar">
            {home.signIn}
          </Link>
          <Link className="inline-flex min-h-11 items-center rounded bg-neutral-900 px-4 text-white" href="/registro">
            {home.start}
          </Link>
        </div>
      </header>

      <section id="inicio" className="home-hero">
        <div className="flex flex-col gap-5">
          <p className="eyebrow">{home.eyebrow}</p>
          <h1>{home.display}</h1>
          <p className="home-lede">{home.hero}</p>
          <p className="text-sm text-[var(--muted)]">{home.heroNote}</p>
          <div className="flex flex-wrap gap-3">
            <Link className="inline-flex min-h-11 items-center rounded bg-neutral-900 px-4 text-white" href="/registro">
              {home.start}
            </Link>
            <a className="inline-flex min-h-11 items-center rounded border px-4" href="#ejemplo">
              {home.exampleLink}
            </a>
          </div>
          <ul className="home-calls">
            <li>{home.call1}</li>
            <li>{home.call2}</li>
            <li>{home.call3}</li>
            <li>{home.call4}</li>
          </ul>
        </div>
        <div className="home-stage">
          <article className="home-mock">
            <p className="eyebrow">{home.example}</p>
            <h2 className="text-3xl">{home.exampleTitle}</h2>
            <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200/60 rounded-lg p-2.5 my-1">
              {home.call4}
            </p>
            <p className="text-sm text-[var(--muted)]">{home.exampleQuiet}</p>
            <span className="home-donate">{home.mockDonate}</span>
          </article>
          <aside className="home-float">
            <p className="eyebrow">{home.board}</p>
            <p className="home-float-value">—</p>
            <p className="text-sm">{home.call3}</p>
          </aside>
        </div>
      </section>

      <section id="recorrido" className="home-block">
        <h2 className="text-3xl">{home.path}</h2>
        <p className="home-lede">{home.pathLead}</p>
        <ol className="steps home-steps">
          <li>{home.step1}</li>
          <li>{home.step2}</li>
          <li>{home.step3}</li>
          <li>{home.step4}</li>
          <li>{home.step5}</li>
        </ol>
      </section>

      <section id="ejemplo" className="home-split">
        <article className="home-notice">
          <p className="eyebrow">{home.example}</p>
          <h2 className="text-4xl">{home.exampleTitle}</h2>
          <p>{home.exampleNote}</p>
          <ul>
            <li>{home.controller}</li>
            <li>{home.purpose}</li>
            <li>{home.data}</li>
            <li>{home.retention}</li>
          </ul>
          <p>{home.exampleQuiet}</p>
        </article>
        <article className="flex flex-col gap-3">
          <h2 className="text-3xl">{home.donorView}</h2>
          <p>{home.donorBody}</p>
          <p>{home.donorAccount}</p>
          <p>{home.draftBody}</p>
        </article>
      </section>

      <section id="tablero" className="home-split">
        <article className="flex flex-col gap-3">
          <h2 className="text-3xl">{home.board}</h2>
          <p>{home.boardBody}</p>
          <p>{home.liveBody}</p>
        </article>
        <div className="home-bars" aria-hidden="true">
          <span style={{ height: "42%" }} />
          <span style={{ height: "68%" }} />
          <span style={{ height: "36%" }} />
          <span style={{ height: "84%" }} />
          <span style={{ height: "55%" }} />
          <span style={{ height: "73%" }} />
        </div>
      </section>

      <section id="precio" className="home-block">
        <h2 className="text-3xl">{home.price}</h2>
        {price && campaignLimit != null && liveMinutes != null && fee ? (
          <article className="price-slab">
            <div>
              <p className="eyebrow">{home.paidPlan}</p>
              <p className="price-figure">{fill(home.perMonth, { price })}</p>
            </div>
            <ul>
              <li>{fill(home.campaignCount, { count: campaignLimit })}</li>
              <li>{fill(home.liveMinutes, { count: liveMinutes })}</li>
              <li>{fill(home.fee, { fee })}</li>
              <li>{home.notIncluded}</li>
              <li>{home.cfdi}</li>
            </ul>
          </article>
        ) : (
          <p className="note">{home.priceMissing}</p>
        )}
        <p className="text-sm text-[var(--muted)]">{home.founder}</p>
      </section>

      <section id="tipos" className="home-block">
        <h2 className="text-3xl">{home.kinds}</h2>
        <div className="home-kinds">
          <article className="kind kind-cause">
            <h3 className="text-2xl">{home.cause}</h3>
            <p>{home.causeBody}</p>
            <p>{home.causeReceipt}</p>
          </article>
          <article className="kind kind-commercial">
            <h3 className="text-2xl">{home.commercial}</h3>
            <p>{home.commercialBody}</p>
            <p>{home.commercialNo}</p>
          </article>
          <article className="kind kind-electoral">
            <h3 className="text-2xl">{home.electoral}</h3>
            <p>{home.electoralBody}</p>
            <p>{home.electoralNo}</p>
          </article>
        </div>
      </section>

      <section id="preguntas" className="home-block">
        <h2 className="text-3xl">{home.questions}</h2>
        <ol className="home-questions">
          <li>{home.q1}</li>
          <li>{home.q2}</li>
          <li>{home.q3}</li>
          <li>{home.q4}</li>
          <li>{home.q5}</li>
          <li>{home.q6}</li>
          <li>{home.q7}</li>
        </ol>
      </section>

      <section className="home-books">
        <h2 className="text-3xl">{home.twoBooks}</h2>
        <p>{home.twoBooksBody}</p>
        <p>{home.twoLedgers}</p>
        <p>{home.noticeFirst}</p>
        <p>{home.noRewrite}</p>
      </section>

      <section className="home-close">
        <h2 className="text-4xl">{home.createTitle}</h2>
        <p>{home.createLead}</p>
        <Link className="inline-flex min-h-11 w-fit items-center rounded bg-neutral-900 px-4 text-white" href="/registro">
          {home.start}
        </Link>
      </section>

      <footer className="home-foot">
        <Link href="/aviso">{home.privacy}</Link>
        <Link href="/terminos">{home.terms}</Link>
        <Link href="/ingresar">{home.signIn}</Link>
      </footer>
    </main>
  );
}
