"use client";

import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useTx } from "@/lib/i18n";
import { clampFrame, panFrame, zoomMax, zoomMin, type Frame } from "@/lib/encuadre";

// Arrastre, pellizco, rueda y teclado para elegir qué parte de la foto se ve.
export function Encuadre({
  src,
  video,
  frame,
  reset,
  onChange,
  label,
  placement,
  ratio,
  placeholder,
  overlay,
}: {
  src: string;
  video?: boolean;
  frame: Frame;
  reset: Frame;
  onChange: (frame: Frame) => void;
  label: string;
  placement: string;
  ratio: number;
  placeholder?: string;
  overlay?: string;
}) {
  const { tx } = useTx();
  const box = useRef<HTMLDivElement>(null);
  const frameRef = useRef(frame);
  const onChangeRef = useRef(onChange);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  frameRef.current = frame;
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = frameRef.current;
      const next = clampFrame({ ...current, zoom: current.zoom + (event.deltaY > 0 ? -0.1 : 0.1) });
      if (next) onChangeRef.current(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function distance() {
    const points = [...pointers.current.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) pinch.current = distance();
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const nextDistance = distance();
      if (pinch.current > 0 && nextDistance > 0) {
        const zoomed = clampFrame({ ...frameRef.current, zoom: frameRef.current.zoom * (nextDistance / pinch.current) });
        if (zoomed) onChange(zoomed);
        pinch.current = nextDistance;
      }
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    onChange(panFrame(frameRef.current, event.clientX - previous.x, event.clientY - previous.y, rect.width, rect.height));
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 12 : 6;
    const current = frameRef.current;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onChange(panFrame(current, -step, 0, 100, 100));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onChange(panFrame(current, step, 0, 100, 100));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onChange(panFrame(current, 0, -step, 100, 100));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onChange(panFrame(current, 0, step, 100, 100));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      const next = clampFrame({ ...current, zoom: current.zoom + 0.1 });
      if (next) onChange(next);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      const next = clampFrame({ ...current, zoom: current.zoom - 0.1 });
      if (next) onChange(next);
    } else if (event.key === "Home" || event.key === "0") {
      event.preventDefault();
      onChange(reset);
    }
  }

  const described = tx(
    "Arrastra para mover la foto. Flechas la mueven, más y menos hacen zoom, Inicio la reinicia.",
    "Drag to move the photo. Arrows move it, plus and minus zoom, Home resets it.",
  );

  return (
    <div className="encuadre-block">
      <div
        ref={box}
        className="framed-media"
        style={{ aspectRatio: String(ratio) }}
        data-placement={placement}
        data-focus-x={frame.x}
        data-focus-y={frame.y}
        data-zoom={frame.zoom}
        role="application"
        tabIndex={0}
        aria-label={`${label}. ${Math.round(frame.x)}% ${Math.round(frame.y)}%, zoom ${frame.zoom.toFixed(2)}. ${described}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        onDoubleClick={() => onChange(reset)}
      >
        {src ? (
          video ? (
            <video src={src} muted loop autoPlay playsInline style={mediaStyle(frame)} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- blob o https de la campaña, sin pasar por el optimizador
            <img src={src} alt="" draggable={false} style={mediaStyle(frame)} />
          )
        ) : (
          <span className="preview-placeholder">{(placeholder || label).slice(0, 1).toUpperCase()}</span>
        )}
        {overlay ? <p className="preview-overlay">{overlay}</p> : null}
      </div>
      <div className="encuadre-tools">
        <button type="button" className="chip" aria-label={tx("Alejar", "Zoom out")} onClick={() => onChange(clampFrame({ ...frame, zoom: frame.zoom - 0.1 }) ?? frame)}>
          −
        </button>
        <input
          type="range"
          min={zoomMin}
          max={zoomMax}
          step={0.05}
          value={frame.zoom}
          aria-label={tx(`Zoom de ${label}`, `Zoom for ${label}`)}
          onChange={(event) => onChange(clampFrame({ ...frame, zoom: Number(event.target.value) }) ?? frame)}
        />
        <button type="button" className="chip" aria-label={tx("Acercar", "Zoom in")} onClick={() => onChange(clampFrame({ ...frame, zoom: frame.zoom + 0.1 }) ?? frame)}>
          +
        </button>
        <button type="button" className="chip" onClick={() => onChange(reset)}>
          {tx("Reiniciar", "Reset")}
        </button>
      </div>
    </div>
  );
}

function mediaStyle(frame: Frame): CSSProperties {
  const x = `${frame.x}%`;
  const y = `${frame.y}%`;
  return {
    objectPosition: `${x} ${y}`,
    transform: `scale(${frame.zoom})`,
    transformOrigin: `${x} ${y}`,
  };
}
