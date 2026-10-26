export const origins = [
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'x',
  'linkedin',
  'direct',
  'other',
] as const;
export type VisitOrigin = (typeof origins)[number];

const sourceNames: Record<string, VisitOrigin> = {
  facebook: 'facebook',
  fb: 'facebook',
  instagram: 'instagram',
  ig: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
  yt: 'youtube',
  x: 'x',
  twitter: 'x',
  linkedin: 'linkedin',
  direct: 'direct',
};

const previewAgent =
  /facebookexternalhit|facebot|twitterbot|tiktokspider|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|embedly|pinterestbot/i;
const botAgent = /bot|spider|crawler|preview/i;
// Navegadores automatizados, clientes HTTP y monitores: no son personas.
const automationAgent =
  /headless|phantomjs|selenium|webdriver|puppeteer|playwright|cypress|lighthouse|pagespeed|gtmetrix|pingdom|uptime|datadog|newrelic|statuscake|monitor|curl\/|wget|python-requests|python-urllib|python\/|aiohttp|httpx|scrapy|go-http-client|okhttp|java\/|apache-httpclient|libwww|node-fetch|undici|axios|got \(|postman|insomnia|httpie|feedfetcher|scraper/i;

export function visitOrigin(
  utmSource: string | undefined,
  referrer: string | undefined,
): VisitOrigin {
  const source = (utmSource ?? '').trim().toLowerCase();
  if (source) return sourceNames[source] ?? 'other';
  let host = '';
  try {
    host = new URL(referrer ?? '').hostname.toLowerCase();
  } catch {
    host = '';
  }
  if (!host) return 'direct';
  if (
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'fb.com' ||
    host.endsWith('.fb.com') ||
    host === 'fb.me'
  )
    return 'facebook';
  if (host === 'instagram.com' || host.endsWith('.instagram.com'))
    return 'instagram';
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtu.be'
  )
    return 'youtube';
  if (
    host === 'x.com' ||
    host.endsWith('.x.com') ||
    host === 'twitter.com' ||
    host.endsWith('.twitter.com') ||
    host === 't.co'
  )
    return 'x';
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com'))
    return 'linkedin';
  return 'other';
}

export function visitExclusion(
  userAgent: string | undefined,
): 'preview_ua' | 'missing_ua' | 'bot' | null {
  const agent = (userAgent ?? '').trim();
  if (!agent) return 'missing_ua';
  if (previewAgent.test(agent)) return 'preview_ua';
  if (botAgent.test(agent) || automationAgent.test(agent)) return 'bot';
  return null;
}

export function browserName(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/chrome|crios/i.test(userAgent)) return 'Chrome';
  if (/firefox|fxios/i.test(userAgent)) return 'Firefox';
  if (/safari/i.test(userAgent)) return 'Safari';
  return 'Other';
}

export function deviceClass(userAgent: string): 'phone' | 'tablet' | 'desktop' {
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  if (/mobile|iphone|android/i.test(userAgent)) return 'phone';
  return 'desktop';
}
