// Punto de enfoque. La fórmula es la misma que en apps/api/src/shared/frame.ts.

export type Frame = { x: number; y: number; zoom: number };

export type Placement =
  | "facebook"
  | "instagram-feed"
  | "instagram-story"
  | "tiktok"
  | "x"
  | "linkedin"
  | "whatsapp"
  | "youtube";

export const zoomMin = 1;
export const zoomMax = 3;

export const placements: {
  id: Placement;
  network: string;
  ratio: number;
  ratioLabel: string;
  place: [string, string];
}[] = [
  { id: "facebook", network: "facebook", ratio: 1.91, ratioLabel: "1.91:1", place: ["Publicación", "Post"] },
  { id: "instagram-feed", network: "instagram", ratio: 4 / 5, ratioLabel: "4:5", place: ["Feed", "Feed"] },
  { id: "instagram-story", network: "instagram", ratio: 9 / 16, ratioLabel: "9:16", place: ["Historia / Reel", "Story / Reel"] },
  { id: "tiktok", network: "tiktok", ratio: 9 / 16, ratioLabel: "9:16", place: ["Video", "Video"] },
  { id: "x", network: "x", ratio: 16 / 9, ratioLabel: "16:9", place: ["Publicación", "Post"] },
  { id: "linkedin", network: "linkedin", ratio: 1.91, ratioLabel: "1.91:1", place: ["Publicación", "Post"] },
  { id: "whatsapp", network: "whatsapp", ratio: 9 / 16, ratioLabel: "9:16", place: ["Estado", "Status"] },
  { id: "youtube", network: "youtube", ratio: 9 / 16, ratioLabel: "9:16", place: ["Shorts", "Shorts"] },
];

const defaults: Record<Placement, Frame> = {
  facebook: { x: 50, y: 30, zoom: 1 },
  "instagram-feed": { x: 50, y: 42, zoom: 1 },
  "instagram-story": { x: 50, y: 50, zoom: 1 },
  tiktok: { x: 50, y: 50, zoom: 1 },
  x: { x: 50, y: 28, zoom: 1 },
  linkedin: { x: 50, y: 30, zoom: 1 },
  whatsapp: { x: 50, y: 50, zoom: 1 },
  youtube: { x: 50, y: 50, zoom: 1 },
};

export const heroRatio = 1200 / 630;
export const heroDefault: Frame = { x: 50, y: 35, zoom: 1 };

export function defaultFrame(placement: Placement): Frame {
  return { ...defaults[placement] };
}

export function initialFrames(): Record<Placement, Frame> {
  return Object.fromEntries(placements.map((item) => [item.id, defaultFrame(item.id)])) as Record<Placement, Frame>;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampFrame(input: { x?: unknown; y?: unknown; zoom?: unknown } | null | undefined): Frame | null {
  if (!input) return null;
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

export function panFrame(frame: Frame, dx: number, dy: number, width: number, height: number): Frame {
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

export function mergeFrames(saved: Record<string, { x: number; y: number; zoom: number } | undefined>): Record<Placement, Frame> {
  const next = initialFrames();
  for (const item of placements) {
    const frame = clampFrame(saved[item.id]);
    if (frame) next[item.id] = frame;
  }
  return next;
}

export function frameStyle(frame: Frame): { objectFit: "cover"; objectPosition: string; transform: string; transformOrigin: string } {
  const x = `${frame.x}%`;
  const y = `${frame.y}%`;
  return {
    objectFit: "cover",
    objectPosition: `${x} ${y}`,
    transform: `scale(${frame.zoom})`,
    transformOrigin: `${x} ${y}`,
  };
}

export function safeAccent(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : "#0f766e";
}

export const themes: [string, string, string][] = [
  ["#0f766e", "Bosque", "Forest"],
  ["#0e7490", "Agua", "Water"],
  ["#be123c", "Flor", "Flower"],
  ["#b45309", "Ámbar", "Amber"],
  ["#334155", "Pizarra", "Slate"],
];
