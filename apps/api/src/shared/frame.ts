// Punto de enfoque por colocación. x/y son porcentajes del encuadre
// (0 arriba/izquierda, 100 abajo/derecha). zoom 1 llena el marco; más de 1 acerca.
// La misma fórmula vive en apps/web/src/lib/encuadre.ts.

export const placements = [
  'facebook',
  'instagram-feed',
  'instagram-story',
  'tiktok',
  'x',
  'linkedin',
  'whatsapp',
  'youtube',
] as const;

export type Placement = (typeof placements)[number];

export type Frame = { x: number; y: number; zoom: number };

export const zoomMin = 1;
export const zoomMax = 3;

const defaults: Record<Placement, Frame> = {
  facebook: { x: 50, y: 30, zoom: 1 },
  'instagram-feed': { x: 50, y: 42, zoom: 1 },
  'instagram-story': { x: 50, y: 50, zoom: 1 },
  tiktok: { x: 50, y: 50, zoom: 1 },
  x: { x: 50, y: 28, zoom: 1 },
  linkedin: { x: 50, y: 30, zoom: 1 },
  whatsapp: { x: 50, y: 50, zoom: 1 },
  youtube: { x: 50, y: 50, zoom: 1 },
};

export const heroDefault: Frame = { x: 50, y: 35, zoom: 1 };

export function isPlacement(value: string): value is Placement {
  return (placements as readonly string[]).includes(value);
}

export function defaultFrame(placement: Placement): Frame {
  return { ...defaults[placement] };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampFrame(input: {
  x?: unknown;
  y?: unknown;
  zoom?: unknown;
}): Frame | null {
  const x = Number(input.x);
  const y = Number(input.y);
  const zoom = Number(input.zoom);
  if (![x, y, zoom].every(Number.isFinite)) return null;
  return {
    x: round(clamp(x, 0, 100)),
    y: round(clamp(y, 0, 100)),
    zoom: round(clamp(zoom, zoomMin, zoomMax)),
  };
}

// dx/dy en píxeles del marco. Arrastrar a la derecha mueve la foto a la derecha
// y por eso baja el porcentaje horizontal del punto de enfoque.
export function panFrame(
  frame: Frame,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Frame {
  if (width <= 0 || height <= 0) return frame;
  const zoom = Math.max(frame.zoom, zoomMin);
  return (
    clampFrame({
      x: frame.x - (dx / width) * (100 / zoom),
      y: frame.y - (dy / height) * (100 / zoom),
      zoom: frame.zoom,
    }) ?? frame
  );
}

export function httpsImage(value: unknown): string | null | undefined {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const image = value.trim();
  if (!image) return null;
  if (!/^https:\/\/[^\s<>"']+$/.test(image) || image.length > 2000)
    return undefined;
  return image;
}
