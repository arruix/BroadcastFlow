import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { LocaleProvider } from "@/lib/i18n";
import { serverLocale } from "@/lib/locale";
import { AuthProvider } from "./auth-provider";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await serverLocale();
  return {
    title: "BroadcastFlow",
    description: locale === "en" ? "Campaign, landing, and console." : "Campaña, landing y consola.",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await serverLocale();
  return (
    <html lang={locale} className={`${sans.variable} ${display.variable}`}>
      <body className="antialiased">
        <LocaleProvider initial={locale}>
          <AuthProvider>{children}</AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
