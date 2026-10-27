const originNames: Record<string, [string, string]> = {
  facebook: ["Facebook", "Facebook"],
  instagram: ["Instagram", "Instagram"],
  tiktok: ["TikTok", "TikTok"],
  youtube: ["YouTube", "YouTube"],
  x: ["X", "X"],
  linkedin: ["LinkedIn", "LinkedIn"],
  whatsapp: ["WhatsApp", "WhatsApp"],
  telegram: ["Telegram", "Telegram"],
  direct: ["Directo", "Direct"],
  other: ["Otros", "Other"],
};

export function originLabel(origin: string, tx: (es: string, en: string) => string) {
  const name = originNames[origin];
  return name ? tx(name[0], name[1]) : origin;
}

// Un color por red, para barras y puntos. Lo que no es una red usa el gris de la marca.
const originColors: Record<string, string> = {
  facebook: "#1877f2",
  instagram: "#e1306c",
  tiktok: "#111111",
  youtube: "#ff0000",
  x: "#000000",
  linkedin: "#0a66c2",
  whatsapp: "#25d366",
  telegram: "#229ed9",
  direct: "#0f766e",
  other: "#94a3b8",
};

export function originColor(origin: string) {
  return originColors[origin] ?? "#94a3b8";
}
