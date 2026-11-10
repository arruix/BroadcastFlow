"use client";

import { useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { defaultFrame, placements, type Frame, type Placement } from "@/lib/encuadre";
import { originColor, originLabel } from "@/lib/origen";
import { Encuadre } from "../../encuadre";

// Vista previa con la proporción real de cada red. El encuadre se elige aquí
// y se guarda con la campaña; el archivo sigue viviendo solo en el navegador.
export function PiezaPreview({
  file,
  imageUrl,
  text,
  title,
  frames,
  onFrame,
}: {
  file: File | null;
  imageUrl?: string;
  text: string;
  title: string;
  frames: Record<Placement, Frame>;
  onFrame: (placement: Placement, frame: Frame) => void;
}) {
  const { tx } = useTx();
  const [url, setUrl] = useState("");
  const video = Boolean(file?.type.startsWith("video/") && url);

  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const src = url || (imageUrl?.startsWith("https://") ? imageUrl : "");
  const vertical = (ratio: number) => ratio < 1;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">
        {tx("Vista previa por red", "Preview by network")}{" "}
        <span className="font-normal text-[var(--muted)]">· {tx("proporción de cada red", "each network's ratio")}</span>
      </p>
      <p className="text-sm text-[var(--muted)]">
        {tx(
          "Arrastra la foto dentro de cada marco. También puedes pellizcar, usar la rueda o el teclado.",
          "Drag the photo inside each frame. You can also pinch, use the wheel, or the keyboard.",
        )}
      </p>
      <div className="preview-grid">
        {placements.map((item) => (
          <figure key={item.id} className="preview">
            <figcaption className="preview-head">
              <i className="net-dot" style={{ background: originColor(item.network) }} />
              <strong>{originLabel(item.network, tx)}</strong>
              <span>
                {tx(item.place[0], item.place[1])} · {item.ratioLabel}
              </span>
            </figcaption>
            {vertical(item.ratio) ? null : <p className="preview-text">{text}</p>}
            <Encuadre
              src={src}
              video={video}
              frame={frames[item.id]}
              reset={defaultFrame(item.id)}
              onChange={(frame) => onFrame(item.id, frame)}
              label={`${originLabel(item.network, tx)} ${item.ratioLabel}`}
              placement={item.id}
              ratio={item.ratio}
              placeholder={title}
              overlay={vertical(item.ratio) ? text : undefined}
            />
          </figure>
        ))}
      </div>
    </div>
  );
}
