"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";
import { originColor, originLabel } from "@/lib/origen";
import { PiezaPreview } from "./pieza-preview";
import { slugify, utmLink } from "@/lib/utm";

type Organization = { id: string; name: string };
type Created = { id: string; slug: string };

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const networks = ["facebook", "instagram", "tiktok", "x", "whatsapp", "youtube", "linkedin", "telegram"] as const;

// Asistente de 4 pasos: causa, cómo recibes apoyo, la pieza y dónde compartes.
// La campaña se guarda al final; la imagen o video solo se previsualiza en el navegador.
export default function NuevaCampana() {
  const { tx } = useTx();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState("");
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("causa");
  const [goal, setGoal] = useState("");
  const [story, setStory] = useState("");
  const [link, setLink] = useState("");
  const [bank, setBank] = useState("");
  const [holder, setHolder] = useState("");
  const [clabe, setClabe] = useState("");
  const [copy, setCopy] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn()) {
      setReady(true);
      return;
    }
    api<Organization[]>("/organizations")
      .then((rows) => setOrganizationId(rows[0]?.id ?? ""))
      .catch((error) => setMessage(explain(error)))
      .finally(() => setReady(true));
  }, []);

  const slug = created?.slug ?? slugify(name);
  const base = siteUrl || (typeof window === "undefined" ? "" : window.location.origin);
  const steps = [
    tx("Tu causa", "Your cause"),
    tx("Cómo recibes apoyo", "How you get support"),
    tx("Crea la pieza", "Create the piece"),
    tx("Dónde compartes", "Where you share"),
  ];
  const canNext = useMemo(() => {
    if (step === 0) return name.trim().length > 2;
    if (step === 1) return Boolean(link || (bank && holder && clabe));
    return true;
  }, [step, name, link, bank, holder, clabe]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const campaign = await api<Created>("/campaigns", {
        method: "POST",
        ...(organizationId ? { org: organizationId } : {}),
        body: JSON.stringify({
          name: name.trim(),
          currency: "MXN",
          kind,
          jurisdiction: "MX",
          timeZone: "America/Mexico_City",
          ...(goal ? { goalMinor: Math.round(Number(goal) * 100) } : {}),
          paymentLinkUrl: link || null,
          transferBank: bank || null,
          transferHolder: holder || null,
          transferClabe: clabe || null,
        }),
      });
      if (organizationId && story.trim()) {
        await api(`/campaigns/${campaign.id}/share`, {
          method: "PUT",
          org: organizationId,
          body: JSON.stringify({ title: name.trim(), description: story.trim(), imageKey: null }),
        }).catch(() => undefined);
      }
      setCreated(campaign);
    } catch (error) {
      setMessage(explain(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(network: string) {
    await navigator.clipboard?.writeText(utmLink(base, slug, network)).catch(() => undefined);
    setCopied(network);
  }

  return (
    <main className="console-page wizard">
      <header className="flex flex-col gap-1">
        <p className="eyebrow">{tx("Nueva campaña", "New campaign")}</p>
        <h1 className="text-4xl">{steps[step]}</h1>
      </header>
      <ol className="wizard-steps" aria-label={tx("Pasos", "Steps")}>
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} className={index < step ? "done" : undefined}>
            <span className="wizard-num">{index < step ? "✓" : index + 1}</span>
            <span className="wizard-label">{label}</span>
          </li>
        ))}
      </ol>
      {ready && !signedIn() ? (
        <p className="note">
          <Link className="underline" href="/ingresar">{tx("Entra para crear la campaña.", "Sign in to create the campaign.")}</Link>
        </p>
      ) : null}
      {message ? <p className="note">{message}</p> : null}

      {step === 0 ? (
        <section className="sheet flex flex-col gap-4">
          <label className="field">
            {tx("Nombre de la campaña", "Campaign name")}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={tx("Ej. Reforestemos la Sierra Norte", "E.g. Reforest the Northern Sierra")} required />
          </label>
          <label className="field">
            {tx("Tipo", "Type")}
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="causa">{tx("Causa", "Cause")}</option>
              <option value="electoral">{tx("Electoral", "Electoral")}</option>
              <option value="comercial">{tx("Comercial", "Commercial")}</option>
            </select>
          </label>
          <label className="field">
            {tx("Meta (MXN)", "Goal (MXN)")}
            <input inputMode="numeric" value={goal} onChange={(event) => setGoal(event.target.value.replace(/[^0-9]/g, ""))} placeholder="15000" />
          </label>
          <label className="field">
            {tx("¿Por qué importa? (se muestra en la página pública)", "Why it matters (shown on the public page)")}
            <textarea rows={4} value={story} onChange={(event) => setStory(event.target.value)} />
          </label>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="sheet flex flex-col gap-4">
          <p className="note">{tx("El dinero va directo a tu cuenta; BroadcastFlow no lo recibe. Usa un enlace de pago, una transferencia o ambos.", "Money goes straight to your account; BroadcastFlow never receives it. Use a payment link, a transfer, or both.")}</p>
          <label className="field">
            {tx("Enlace de pago (Mercado Pago, Stripe, PayPal…)", "Payment link (Mercado Pago, Stripe, PayPal…)")}
            <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://" />
          </label>
          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 font-semibold">{tx("Transferencia", "Bank transfer")}</legend>
            <label className="field">{tx("Banco", "Bank")}<input value={bank} onChange={(event) => setBank(event.target.value)} /></label>
            <label className="field">{tx("Titular", "Holder")}<input value={holder} onChange={(event) => setHolder(event.target.value)} /></label>
            <label className="field">CLABE<input inputMode="numeric" value={clabe} onChange={(event) => setClabe(event.target.value.replace(/[^0-9]/g, ""))} /></label>
          </fieldset>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="sheet flex flex-col gap-4">
          <p className="text-sm text-[var(--muted)]">
            {tx("Crea una sola pieza y mira cómo se vería en cada red. El archivo no se sube: la vista previa ocurre solo en tu navegador.", "Create one piece and see how it would look on each network. The file is not uploaded: the preview happens only in your browser.")}
          </p>
          <label className="field">
            {tx("Imagen o video", "Image or video")}
            <input type="file" accept="image/*,video/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="field">
            {tx("Texto de la publicación", "Post text")}
            <textarea rows={3} value={copy} onChange={(event) => setCopy(event.target.value)} placeholder={tx("Cuenta en una o dos frases por qué apoyar.", "Say in one or two sentences why to support.")} />
          </label>
          <PiezaPreview file={file} text={copy || story || name} title={name} />
        </section>
      ) : null}

      {step === 3 ? (
        <section className="sheet flex flex-col gap-4">
          <p className="text-sm text-[var(--muted)]">
            {created
              ? tx("Listo. Copia el enlace de cada red: ya trae sus UTM para medir de dónde llega la gente.", "Done. Copy each network's link: it already has UTM tags to measure where people come from.")
              : tx("Así quedarán tus enlaces con UTM automáticos. Se confirman al guardar la campaña.", "These are your links with automatic UTM tags. They are confirmed when you save the campaign.")}
          </p>
          <ul className="share-list">
            {networks.map((network) => (
              <li key={network} className="share-row">
                <span className="net-label"><i className="net-dot" style={{ background: originColor(network) }} />{originLabel(network, tx)}</span>
                <code className="share-url">{utmLink(base, slug, network)}</code>
                <button className="chip" type="button" onClick={() => copyLink(network)} disabled={!created}>
                  {copied === network ? tx("Copiado", "Copied") : tx("Copiar", "Copy")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="wizard-nav">
        {step > 0 && !created ? (
          <button className="chip" type="button" onClick={() => setStep(step - 1)}>← {tx("Atrás", "Back")}</button>
        ) : <span />}
        {step < 3 ? (
          <button className="btn-primary" type="button" disabled={!canNext} onClick={() => setStep(step + 1)}>{tx("Continuar", "Continue")} →</button>
        ) : created ? (
          <button className="btn-primary" type="button" onClick={() => router.push(`/campanas/${created.id}`)}>{tx("Ir a la campaña", "Go to the campaign")}</button>
        ) : (
          <button className="btn-primary" type="button" disabled={busy || !signedIn()} onClick={save}>{busy ? tx("Guardando…", "Saving…") : tx("Guardar campaña", "Save campaign")}</button>
        )}
      </nav>
    </main>
  );
}
