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

