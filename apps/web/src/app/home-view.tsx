"use client";

import Link from "next/link";
import { useState } from "react";
import { fill, Idioma, useI18n, useTx } from "@/lib/i18n";

type Offer = {
  price: string | null;
  feeBps: number | null;
  campaignLimit: number | null;
  liveMinutes: number | null;
};

export function HomeView({ price, feeBps, campaignLimit, liveMinutes }: Offer) {
  const { locale, t } = useI18n();
  const { tx } = useTx();
  const numberLocale = locale === "en" ? "en-US" : "es-MX";
  const fee = feeBps == null ? null : `${(feeBps / 100).toLocaleString(numberLocale, { maximumFractionDigits: 2 })}%`;
  const money = (amount: number) =>
    amount.toLocaleString(numberLocale, { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  const home = t.home;

  // Estado interactivo de demostración (no cobra ni mide en servidor)
  const [boostCount, setBoostCount] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);

  const baseRaised = 6400;
  const goalAmount = 10000;
  const currentRaised = Math.min(goalAmount, baseRaised + boostCount * 200);
  const progressPct = Math.round((currentRaised / goalAmount) * 100);
  const totalSupporters = 48 + boostCount;

  function triggerDemoBoost() {
    setBoostCount((prev) => (prev >= 18 ? 0 : prev + 1));
    setPulseKey((prev) => prev + 1);
  }

  const steps = [
    {
      num: "01",
      title: tx("Crea tu causa o anuncio", "Create your cause or ad"),
      body: home.step1,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      ),
    },
    {
      num: "02",
      title: tx("Difunde en tus redes", "Broadcast on your networks"),
      body: home.step2,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856a9.75 9.75 0 0 1 13.788 0M12 18.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
        </svg>
      ),
    },
    {
      num: "03",
      title: tx("La audiencia dona al instante", "Audience donates instantly"),
      body: home.step3,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
      ),
    },
    {
      num: "04",
      title: tx("Pagas tu propia pauta", "Pay for your own ads"),
      body: home.step4,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      ),
    },
    {
      num: "05",
      title: tx("Mides cada clic y peso", "Measure every click & dollar"),
      body: home.step5,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      ),
    },
  ];

  const faqs = [
    { q: tx("¿El donante necesita crear una cuenta?", "Does the donor need to create an account?"), a: home.q1 },
    { q: tx("¿Dónde se procesan los pagos y tarjetas?", "Where are payments and cards processed?"), a: home.q2 },
    { q: tx("¿Cómo funciona el gasto en pauta y el CPC?", "How do ad spend and CPC work?"), a: home.q3 },
    { q: tx("¿Puedo enlazar una tienda en línea?", "Can I link an online store?"), a: home.q4 },
    { q: tx("¿El recibo del donante es un CFDI deducible?", "Is the donor receipt a tax-deductible CFDI?"), a: home.q5 },
    { q: tx("¿Qué redes publican directamente hoy?", "Which networks publish directly today?"), a: home.q6 },
    { q: tx("¿Cómo funcionan los retiros de lo recaudado?", "How do payouts of raised funds work?"), a: home.q7 },
  ];

  return (
    <main className="home">
      <header className="home-bar">
        <Link className="brand group" href="/">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-700 via-teal-600 to-teal-400 text-white shadow-md shadow-teal-500/25 transition-transform group-hover:scale-105" aria-hidden="true">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856a9.75 9.75 0 0 1 13.788 0M12 18.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
            </svg>
          </span>
          <span className="font-bold text-slate-900 tracking-tight">BroadcastFlow</span>
        </Link>
        <nav className="home-nav" aria-label={home.eyebrow}>
          <a href="#recorrido">{home.path}</a>
          <a href="#ejemplo">{home.example}</a>
          <a href="#precio">{home.price}</a>
          <a href="#tipos">{home.kinds}</a>
          <a href="#preguntas">{home.questions}</a>
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <Idioma />
          <Link className="inline-flex min-h-11 items-center px-3 text-slate-700 hover:text-teal-700" href="/ingresar">
            {home.signIn}
          </Link>
          <Link className="inline-flex min-h-11 items-center rounded bg-neutral-900 px-4 text-white" href="/registro">
            {home.start}
          </Link>
        </div>
      </header>

      {/* HERO CON SIMULADOR VISUAL DEL CICLO */}
      <section id="inicio" className="home-hero">
        <div className="home-hero-copy">
          <div className="home-badge">
            <span className="home-badge-dot" aria-hidden="true" />
            <span>{home.eyebrow}</span>
          </div>
          <h1 className="home-title">{home.display}</h1>
          <p className="home-lede">{home.hero}</p>
          <p className="text-sm text-[var(--muted)]">{home.heroNote}</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link className="inline-flex min-h-12 items-center rounded bg-neutral-900 px-6 text-base text-white" href="/registro">
              {home.start}
              <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <a className="inline-flex min-h-12 items-center rounded border px-5" href="#ejemplo">
              {home.exampleLink}
            </a>
          </div>
          <ul className="home-calls">
            <li>
              <span className="call-dot bg-teal-500" aria-hidden="true" />
              {home.call1}
            </li>
            <li>
              <span className="call-dot bg-rose-500" aria-hidden="true" />
              {home.call2}
            </li>
            <li>
              <span className="call-dot bg-sky-500" aria-hidden="true" />
              {home.call3}
            </li>
            <li className="call-highlight">
              <span className="call-dot bg-emerald-500" aria-hidden="true" />
              {home.call4}
            </li>
          </ul>
        </div>

        {/* ESCENARIO INTERACTIVO: ANUNCIO -> DONATIVO -> MÁS TIEMPO EN REDES */}
        <div className="home-stage">
          <div className="stage-glow" aria-hidden="true" />

          {/* Barra superior de difusión activa en redes */}
          <div className="stage-networks">
            <div className="flex items-center gap-2">
              <span className="live-pulse" aria-hidden="true" />
              <span className="text-xs font-semibold tracking-wide text-teal-300 uppercase">
                {tx("Publicada en", "Published on")}
              </span>
            </div>
            <div className="stage-net-pills">
              <span className="net-pill net-fb">Facebook</span>
              <span className="net-pill net-yt">{tx("YouTube en vivo", "YouTube live")}</span>
            </div>
          </div>

          {/* Tarjeta principal de la campaña */}
          <article className="home-mock" key={pulseKey}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="eyebrow text-teal-700">{home.example}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {tx(`${totalSupporters} donativos`, `${totalSupporters} donations`)}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl text-slate-900">{home.exampleTitle}</h2>

            <p className="text-xs text-teal-800 bg-teal-50/90 border border-teal-200/80 rounded-xl p-3 leading-relaxed">
              <strong>{tx("Tú decides:", "Your call:")}</strong> {home.call4}
            </p>

            {/* Barra de progreso interactiva */}
            <div className="mock-progress-box">
              <div className="flex items-baseline justify-between text-xs font-semibold">
                <span className="text-slate-900 text-sm font-bold">
                  {money(currentRaised)}{" "}
                  <span className="font-normal text-slate-500">
                    {tx("recaudados", "raised")}
                  </span>
                </span>
                <span className="text-teal-700 font-bold">{progressPct}%</span>
              </div>
              <div className="mock-progress-track" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                <span className="mock-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>
                  {totalSupporters} {tx("personas apoyando", "supporters")}
                </span>
                <span>
                  {tx("Meta:", "Goal:")} {money(goalAmount)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button type="button" onClick={triggerDemoBoost} className="home-donate">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                <span>{home.mockDonate}</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">+$200 demo</span>
              </button>
              <span className="text-xs text-slate-500">{home.exampleQuiet}</span>
            </div>
          </article>

          {/* Tarjeta flotante del Tablero en tiempo real */}
          <aside className="home-float" aria-label={home.board}>
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow text-slate-500">{home.board}</p>
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                {tx("EJEMPLO", "SAMPLE")}
              </span>
            </div>
            <p className="home-float-value">
              {(1240 + boostCount * 38).toLocaleString(numberLocale)}{" "}
              <span className="home-float-unit">
                {tx("visitas a la página", "page visits")}
              </span>
            </p>
            <div className="float-bars">
              <div className="float-bar-row">
                <span>Facebook</span>
                <div className="float-bar-track">
                  <span style={{ width: `${Math.min(95, 68 + boostCount * 2)}%`, background: "#1877F2" }} />
                </div>
              </div>
              <div className="float-bar-row">
                <span>YouTube</span>
                <div className="float-bar-track">
                  <span style={{ width: `${Math.min(90, 46 + boostCount * 2)}%`, background: "#FF0000" }} />
                </div>
              </div>
              <div className="float-bar-row">
                <span>WhatsApp</span>
                <div className="float-bar-track">
                  <span style={{ width: `${Math.min(85, 34 + boostCount)}%`, background: "#10B981" }} />
                </div>
              </div>
            </div>
            <p className="text-[11px] font-medium text-slate-600 pt-0.5">{home.call3}</p>
          </aside>
        </div>
      </section>

      {/* EL CICLO EN 5 PASOS */}
      <section id="recorrido" className="home-block">
        <div className="home-section-head">
          <p className="eyebrow text-teal-700">{tx("El motor de difusión", "The broadcast engine")}</p>
          <h2 className="text-3xl sm:text-4xl">{home.path}</h2>
          <p className="home-lede">{home.pathLead}</p>
        </div>
        <ol className="home-cycle-grid">
          {steps.map((s) => (
            <li key={s.num} className="cycle-card">
              <div className="cycle-card-top">
                <span className="cycle-icon">{s.icon}</span>
                <span className="cycle-num">{s.num}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900">{s.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* CÓMO LO VE TU AUDIENCIA Y TU TABLERO */}
      <section id="ejemplo" className="home-split">
        <article className="home-notice">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow text-teal-300">{home.example}</p>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-teal-200">
              /c/tu-campana
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl">{home.exampleTitle}</h2>
          <p>{home.exampleNote}</p>
          <ul className="notice-list">
            <li>{home.controller}</li>
            <li>{home.purpose}</li>
            <li>{home.data}</li>
            <li>{home.retention}</li>
          </ul>
          <p className="text-xs text-teal-300/90 pt-1">{home.exampleQuiet}</p>
        </article>
        <article className="home-feature-card">
          <p className="eyebrow text-teal-700">{tx("Página pública de donación", "Public donation landing")}</p>
          <h2 className="text-3xl">{home.donorView}</h2>
          <p className="text-slate-600">{home.donorBody}</p>
          <p className="text-slate-600">{home.donorAccount}</p>
          <div className="rounded-2xl border border-teal-200/80 bg-teal-50/60 p-4 text-sm text-slate-700">
            {home.draftBody}
          </div>
        </article>
      </section>

      {/* TABLERO DE MEDICIÓN Y GASTO EN PAUTA */}
      <section id="tablero" className="home-split">
        <article className="home-feature-card">
          <p className="eyebrow text-teal-700">{tx("Transparencia en pauta y alcance", "Ad spend & reach transparency")}</p>
          <h2 className="text-3xl">{home.board}</h2>
          <p className="text-slate-600">{home.boardBody}</p>
          <p className="text-slate-600">{home.liveBody}</p>
        </article>
        <div className="home-chart-card" aria-hidden="true">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 pb-2">
            <span>{tx("Alcance e impulso por red social", "Reach & boost by social network")}</span>
            <span className="text-teal-700 font-bold">{tx("Visitas · Clics · CPC", "Views · Clicks · CPC")}</span>
          </div>
          <div className="home-bars">
            <span style={{ height: "45%" }} data-net="FB" />
            <span style={{ height: "54%" }} data-net="YT" />
            <span style={{ height: "88%" }} data-net="WA" />
            <span style={{ height: "64%" }} data-net="TG" />
            <span style={{ height: "94%" }} data-net="LIVE" />
          </div>
        </div>
      </section>

      {/* TIPOS DE CAMPAÑA */}
      <section id="tipos" className="home-block">
        <div className="home-section-head">
          <p className="eyebrow text-teal-700">{tx("Para cada objetivo", "For every goal")}</p>
          <h2 className="text-3xl sm:text-4xl">{home.kinds}</h2>
        </div>
        <div className="home-kinds">
          <article className="kind kind-cause">
            <span className="kind-badge bg-teal-50 text-teal-800 border-teal-200">
              {tx("Servicio social y causas", "Social service & causes")}
            </span>
            <h3 className="text-2xl">{home.cause}</h3>
            <p>{home.causeBody}</p>
            <p className="mt-auto text-xs border-t border-slate-100 pt-3">{home.causeReceipt}</p>
          </article>
          <article className="kind kind-commercial">
            <span className="kind-badge bg-slate-100 text-slate-800 border-slate-200">
              {tx("Anuncios y productos", "Ads & products")}
            </span>
            <h3 className="text-2xl">{home.commercial}</h3>
            <p>{home.commercialBody}</p>
            <p className="mt-auto text-xs border-t border-slate-100 pt-3">{home.commercialNo}</p>
          </article>
          <article className="kind kind-electoral">
            <span className="kind-badge bg-amber-50 text-amber-800 border-amber-200">
              {tx("Cumplimiento regulado", "Regulated compliance")}
            </span>
            <h3 className="text-2xl">{home.electoral}</h3>
            <p>{home.electoralBody}</p>
            <p className="mt-auto text-xs border-t border-slate-100 pt-3">{home.electoralNo}</p>
          </article>
        </div>
      </section>

      {/* PRECIO + DOS LIBROS CONTABLES */}
      <section id="precio" className="home-block">
        <div className="home-section-head">
          <p className="eyebrow text-teal-700">{tx("Claro y sin letras chiquitas", "Clear and transparent")}</p>
          <h2 className="text-3xl sm:text-4xl">{home.price}</h2>
        </div>
        {price && campaignLimit != null && liveMinutes != null && fee ? (
          <article className="price-slab">
            <div className="flex flex-col gap-3">
              <p className="eyebrow">{home.paidPlan}</p>
              <p className="price-figure">{fill(home.perMonth, { price })}</p>
              <Link className="inline-flex min-h-11 w-fit items-center rounded bg-neutral-900 px-5 text-white mt-2" href="/registro">
                {home.start}
              </Link>
            </div>
            <ul className="price-list">
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

        <div className="home-trust-grid">
          <article className="trust-card">
            <h3 className="text-lg font-bold text-slate-900">{home.twoBooks}</h3>
            <p className="text-sm text-slate-600">{home.twoBooksBody}</p>
          </article>
          <article className="trust-card">
            <h3 className="text-lg font-bold text-slate-900">{tx("Contabilidad separada", "Separate accounting")}</h3>
            <p className="text-sm text-slate-600">{home.twoLedgers}</p>
          </article>
          <article className="trust-card">
            <h3 className="text-lg font-bold text-slate-900">{tx("Registro inmutable", "Immutable ledger")}</h3>
            <p className="text-sm text-slate-600">
              {home.noticeFirst} {home.noRewrite}
            </p>
          </article>
        </div>
      </section>

      {/* PREGUNTAS FRECUENTES EN ACORDEÓN */}
      <section id="preguntas" className="home-block">
        <div className="home-section-head">
          <p className="eyebrow text-teal-700">{tx("Resuelve tus dudas", "Common questions")}</p>
          <h2 className="text-3xl sm:text-4xl">{home.questions}</h2>
        </div>
        <div className="home-faq-grid">
          {faqs.map((item, idx) => (
            <details key={idx} className="faq-item" open={idx < 2}>
              <summary className="faq-summary">
                <span className="faq-num">0{idx + 1}</span>
                <span>{item.q}</span>
              </summary>
              <p className="faq-body">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="home-close">
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-teal-300">{tx("¿Listo para lanzar tu campaña?", "Ready to launch your campaign?")}</p>
          <h2 className="text-3xl sm:text-4xl text-white">{home.createTitle}</h2>
          <p>{home.createLead}</p>
        </div>
        <Link className="inline-flex min-h-12 w-fit items-center rounded bg-neutral-900 px-6 text-white font-semibold" href="/registro">
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
