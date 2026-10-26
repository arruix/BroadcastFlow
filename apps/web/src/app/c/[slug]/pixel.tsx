"use client";

import { useEffect } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

export function visitId(): string {
  const existing = window.localStorage.getItem("bf.visit");
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem("bf.visit", created);
  return created;
}

export type Utm = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
};

// UTM de la URL; si no hay, los guardados en la sesión (primer toque).
export function readUtm(): Utm {
  const params = new URLSearchParams(window.location.search);
  const fromUrl: Utm = {
    utmSource: params.get("utm_source")?.slice(0, 100) || undefined,
    utmMedium: params.get("utm_medium")?.slice(0, 100) || undefined,
    utmCampaign: params.get("utm_campaign")?.slice(0, 100) || undefined,
    utmContent: params.get("utm_content")?.slice(0, 100) || undefined,
  };
  try {
    if (Object.values(fromUrl).some(Boolean)) {
      window.sessionStorage.setItem("bf.utm", JSON.stringify(fromUrl));
      return fromUrl;
    }
    const saved = window.sessionStorage.getItem("bf.utm");
    return saved ? (JSON.parse(saved) as Utm) : {};
  } catch {
    return fromUrl;
  }
}

export function sendVisit(slug: string, eventType: "view" | "click" | "pay_link" | "pay_transfer") {
  void fetch(`${apiUrl}/public/campaigns/${slug}/visits`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      anonymousId: visitId(),
      eventType,
      referrer: document.referrer || undefined,
      ...readUtm(),
    }),
  });
}

export function Pixel({ slug }: { slug: string }) {
  useEffect(() => {
    sendVisit(slug, "view");
  }, [slug]);
  return null;
}
