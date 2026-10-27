"use client";

import { useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { originColor, originLabel } from "@/lib/origen";

// Vista previa por red, solo en el navegador (URL.createObjectURL). No sube nada
// ni valida medidas: los marcos son aproximados hasta confirmar las guías de cada red.
const frames = [
  { network: "facebook", shape: "feed", place: ["Publicación", "Post"] },
  { network: "instagram", shape: "square", place: ["Feed", "Feed"] },
  { network: "instagram", shape: "vertical", place: ["Historia / Reel", "Story / Reel"] },
  { network: "tiktok", shape: "vertical", place: ["Video", "Video"] },
  { network: "x", shape: "feed", place: ["Publicación", "Post"] },
  { network: "linkedin", shape: "feed", place: ["Publicación", "Post"] },
  { network: "whatsapp", shape: "vertical", place: ["Estado", "Status"] },
  { network: "youtube", shape: "vertical", place: ["Shorts", "Shorts"] },
] as const;

export function PiezaPreview({ file, text, title }: { file: File | null; text: string; title: string }) {
  const { tx } = useTx();
  const [url, setUrl] = useState("");
  const video = Boolean(file?.type.startsWith("video/"));

  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const media = url ? (
    // eslint-disable-next-line @next/next/no-img-element -- blob: local, no pasa por el optimizador
    video ? <video src={url} muted loop autoPlay playsInline /> : <img src={url} alt="" />
  ) : (
    <span className="preview-placeholder">{(title || "BF").slice(0, 1).toUpperCase()}</span>
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">
        {tx("Vista previa por red", "Preview by network")} <span className="font-normal text-[var(--muted)]">· {tx("aproximada", "approximate")}</span>
      </p>
      <div className="preview-grid">
        {frames.map((frame) => (
          <figure key={`${frame.network}-${frame.shape}`} className={`preview preview-${frame.shape}`}>
            <figcaption className="preview-head">
              <i className="net-dot" style={{ background: originColor(frame.network) }} />
              <strong>{originLabel(frame.network, tx)}</strong>
              <span>{tx(frame.place[0], frame.place[1])}</span>
            </figcaption>
            {frame.shape === "vertical" ? (
              <div className="preview-media">
                {media}
                <p className="preview-overlay">{text}</p>
              </div>
            ) : (
              <>
                <p className="preview-text">{text}</p>
                <div className="preview-media">{media}</div>
              </>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}
