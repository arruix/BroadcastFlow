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

export function sendVisit(slug: string, eventType: "view" | "click") {
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source");
  void fetch(`${apiUrl}/public/campaigns/${slug}/visits`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      anonymousId: visitId(),
      eventType,
      referrer: document.referrer || undefined,
      utmSource: utmSource || undefined,
    }),
  });
}

export function Pixel({ slug }: { slug: string }) {
  useEffect(() => {
    sendVisit(slug, "view");
  }, [slug]);
  return null;
}
