"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain } from "@/lib/api";
import { heroDefault, heroRatio, safeAccent, themes, type Frame } from "@/lib/encuadre";
import { PaginaPublica } from "@/app/c/[slug]/vista";
import { Encuadre } from "../../../encuadre";

type Organization = { id: string };
type Campaign = { id: string; name: string; slug: string; currency: string; goalMinor?: number | null };
type Share = { title: string; description: string; imageKey: string | null };
type Landing = {
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

function pesos(minor: number) {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

export default function DisenoPagina({ params }: { params: Promise<{ campaignId: string }> }) {
  const { tx } = useTx();
  const [organizationId, setOrganizationId] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [blob, setBlob] = useState("");
  const [hero, setHero] = useState<Frame>(heroDefault);
  const [accent, setAccent] = useState("#0f766e");
  const [amounts, setAmounts] = useState(["10", "25", "50", "100"]);
  const [cta, setCta] = useState("");
  const [showProgress, setShowProgress] = useState(true);
  const [thankYou, setThankYou] = useState("");
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(max-width: 700px)").matches) setMode("mobile");
  }, []);

  useEffect(() => {
    if (!file) {
      setBlob("");
      return;
    }
    const next = URL.createObjectURL(file);
    setBlob(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  useEffect(() => {
    params
      .then(async ({ campaignId }) => {
        const organizations = await api<Organization[]>("/organizations");
        const org = organizations[0]?.id ?? "";
        setOrganizationId(org);
        const campaigns = await api<Campaign[]>("/campaigns", { org });
        const current = campaigns.find((row) => row.id === campaignId) ?? null;
        setCampaign(current);
        const share = await api<Share>(`/campaigns/${campaignId}/share`, { org });
        const stored = await api<{ landing: Landing | null }>(`/campaigns/${campaignId}/landing`, { org });
        const landing = stored.landing;
        setTitle(landing?.title || share.title || current?.name || "");
        setStory(landing?.story || share.description || "");
        setImageUrl(landing?.imageKey || share.imageKey || "");
        setHero(landing?.hero ?? heroDefault);
        setAccent(landing?.accent || "#0f766e");
        setAmounts(landing ? landing.amountsMinor.map(pesos) : ["10", "25", "50", "100"]);
        setCta(landing?.cta ?? "");
        setShowProgress(landing?.showProgress ?? true);
        setThankYou(landing?.thankYou ?? "");
      })
      .catch((error) => setMessage(explain(error)));
  }, [params]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    setMessage("");
    const amountsMinor = amounts
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Math.round(Number(value) * 100));
    try {
      const stored = await api<{ landing: Landing }>(`/campaigns/${campaign.id}/landing`, {
        method: "PUT",
        org: organizationId,
        body: JSON.stringify({
          title: title.trim(),
          story,
          imageKey: imageUrl.trim() || null,
          hero,
          accent: safeAccent(accent),
          amountsMinor,
          cta,
          showProgress,
          thankYou,
        }),
      });
      setTitle(stored.landing.title);
      setStory(stored.landing.story);
      setThankYou(stored.landing.thankYou);
      setSaved(true);
      setMessage(tx("Página guardada.", "Page saved."));
    } catch (error) {
      setSaved(false);
      setMessage(explain(error));
    }
  }

  const previewImage = blob || (imageUrl.trim().startsWith("https://") ? imageUrl.trim() : "");
  const previewAmounts = amounts.map((value) => Number(value)).filter((value) => value > 0);

  return (
    <main className="console-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">{tx("Página pública", "Public page")}</p>
          <h1 className="text-4xl">{campaign?.name ?? tx("Diseñar la página", "Design the page")}</h1>
          <p className="text-sm text-[var(--muted)]">
            {tx(
              "Quien toca la publicación llega aquí para leer la historia y donar. El pago sigue el camino que ya tiene la campaña.",
              "People who tap the post land here to read the story and donate. Payment stays on the path the campaign already has.",
            )}
          </p>
        </div>
        {campaign ? (
          <Link className="chip" href={`/c/${campaign.slug}`}>
            {tx("Abrir la página", "Open the page")}
          </Link>
        ) : null}
      </header>
      {message ? <p className="note" role="status">{message}</p> : null}
      <div className="landing-designer">
        <form className="sheet flex flex-col gap-4" onSubmit={save}>
          <label className="field">
            {tx("Título", "Title")}
            <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={140} />
          </label>
          <label className="field">
            {tx("Historia", "Story")}
            <textarea rows={6} value={story} onChange={(event) => setStory(event.target.value)} required maxLength={4000} />
          </label>
          <label className="field">
            {tx("Imagen https de la portada", "Cover https image")}
            <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://" />
          </label>
          <label className="field">
            {tx("O pruébala con un archivo local (no se sube)", "Or try it with a local file (it is not uploaded)")}
            <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{tx("Encuadre de la portada", "Cover framing")}</p>
            <Encuadre
              src={previewImage}
              frame={hero}
              reset={heroDefault}
              onChange={setHero}
              label={tx("Portada", "Cover")}
              placement="hero"
              ratio={heroRatio}
              placeholder={title || campaign?.name}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">{tx("Color de acento", "Accent color")}</legend>
            <div className="theme-row">
              {themes.map(([color, es, en]) => (
                <button
                  key={color}
                  type="button"
                  className="theme-swatch"
                  style={{ background: color }}
                  aria-pressed={safeAccent(accent) === color}
                  aria-label={tx(es, en)}
                  onClick={() => setAccent(color)}
                />
              ))}
              <input type="color" value={safeAccent(accent)} aria-label={tx("Color propio", "Custom color")} onChange={(event) => setAccent(event.target.value)} />
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">{tx("Montos sugeridos", "Suggested amounts")}</legend>
            <div className="amount-edit">
              {amounts.map((value, index) => (
                <label key={index} className="field">
                  {tx(`Monto ${index + 1}`, `Amount ${index + 1}`)}
                  <input
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => {
                      const next = [...amounts];
                      next[index] = event.target.value.replace(/[^0-9.]/g, "");
                      setAmounts(next);
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {amounts.length < 6 ? (
                <button type="button" className="chip" onClick={() => setAmounts([...amounts, ""])}>
                  {tx("Agregar monto", "Add amount")}
                </button>
              ) : null}
              {amounts.length > 1 ? (
                <button type="button" className="chip" onClick={() => setAmounts(amounts.slice(0, -1))}>
                  {tx("Quitar último", "Remove last")}
                </button>
              ) : null}
            </div>
          </fieldset>
          <label className="field">
            {tx("Texto del botón", "Button text")}
            <input value={cta} onChange={(event) => setCta(event.target.value)} maxLength={80} placeholder={tx("Quiero donar", "I want to donate")} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={showProgress} onChange={(event) => setShowProgress(event.target.checked)} />
            {tx("Mostrar meta y avance", "Show goal and progress")}
          </label>
          <label className="field">
            {tx("Mensaje de agradecimiento", "Thank-you message")}
            <textarea rows={3} value={thankYou} onChange={(event) => setThankYou(event.target.value)} maxLength={400} placeholder={tx("Gracias por sumarte.", "Thank you for joining in.")} />
          </label>
          <button className="btn-primary" type="submit">
            {tx("Guardar página", "Save page")}
          </button>
          {saved && campaign ? (
            <p className="text-sm">
              <Link href={`/c/${campaign.slug}`}>{tx("Ver cómo quedó publicada", "See the published page")}</Link>
            </p>
          ) : null}
        </form>
        <div className="flex flex-col gap-3">
          <div className="preview-switch" role="group" aria-label={tx("Tamaño de la vista previa", "Preview size")}>
            <button type="button" className="chip" aria-pressed={mode === "desktop"} onClick={() => setMode("desktop")}>
              {tx("Escritorio", "Desktop")}
            </button>
            <button type="button" className="chip" aria-pressed={mode === "mobile"} onClick={() => setMode("mobile")}>
              {tx("Teléfono", "Phone")}
            </button>
          </div>
          <p className="text-sm text-[var(--muted)]">
            {tx("Vista previa. Las cifras del avance son de ejemplo.", "Preview. The progress figures are examples.")}
          </p>
          <div className={mode === "mobile" ? "landing-stage is-narrow" : "landing-stage"}>
            <PaginaPublica
              tx={tx}
              name={title || campaign?.name || tx("Tu campaña", "Your campaign")}
              story={story}
              cover={previewImage || null}
              frame={hero}
              accent={safeAccent(accent)}
              showProgress={showProgress}
              goalMinor={campaign?.goalMinor ?? 1500000}
              confirmedMinor={350000}
              confirmedCount={12}
              intentionMinor={80000}
              intentionCount={4}
              currency={campaign?.currency?.trim() || "MXN"}
              liveUrl={null}
              statusNote={null}
              measureNote={null}
              notice={null}
              donate={
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-semibold">{cta || tx("Quiero donar", "I want to donate")}</p>
                  <div className="amount-row">
                    {previewAmounts.map((value) => (
                      <span key={value} className="amount-chip">
                        ${Number.isInteger(value) ? value : value.toFixed(2)}
                      </span>
                    ))}
                  </div>
                  <p className="pago-aviso">
                    {tx(
                      "El pago va directo a la campaña. Esta vista no cobra.",
                      "Payment goes straight to the campaign. This preview does not charge.",
                    )}
                  </p>
                  {thankYou ? (
                    <p className="text-sm">
                      <strong>{tx("Después de registrar", "After they pledge")}: </strong>
                      {thankYou}
                    </p>
                  ) : null}
                </div>
              }
            />
          </div>
        </div>
      </div>
    </main>
  );
}
