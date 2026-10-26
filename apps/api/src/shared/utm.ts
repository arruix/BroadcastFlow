import { cleanText } from './text';

export type UtmInput = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
};

export type Utm = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
};

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return cleanText(value, 100) || null;
}

export function readUtm(input: UtmInput): Utm {
  return {
    source: clean(input.utmSource),
    medium: clean(input.utmMedium),
    campaign: clean(input.utmCampaign),
    content: clean(input.utmContent),
  };
}
