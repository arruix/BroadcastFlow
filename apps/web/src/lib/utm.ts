export function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "mi-campana"
  );
}

// Enlace con UTM automáticos para cada red. utm_content identifica la pieza.
export function utmLink(base: string, slug: string, network: string) {
  const params = new URLSearchParams({ utm_source: network, utm_medium: "social", utm_campaign: slug, utm_content: "pieza-principal" });
  return `${base}/c/${slug}?${params.toString()}`;
}
