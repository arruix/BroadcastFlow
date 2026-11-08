import type { NextConfig } from "next";

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL);
const turnstile = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
const production = process.env.NODE_ENV === "production";

const connect = ["'self'"];
if (apiOrigin) connect.push(apiOrigin);
if (!production) connect.push("http://localhost:3001", "ws://localhost:3000");
if (turnstile) connect.push("https://challenges.cloudflare.com");

const media = ["'self'", "blob:"];
if (apiOrigin) media.push(apiOrigin);
if (!production) media.push("http://localhost:3001");

const script = ["'self'", "'unsafe-inline'", "'unsafe-eval'"];
if (turnstile) script.push("https://challenges.cloudflare.com");

const frame = turnstile ? "https://challenges.cloudflare.com" : "'none'";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src ${script.join(" ")}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              `media-src ${media.join(" ")}`,
              `connect-src ${connect.join(" ")}`,
              `frame-src ${frame}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
