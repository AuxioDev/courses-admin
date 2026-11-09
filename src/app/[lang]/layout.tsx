import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { lang } from "next/root-params";
import { locales } from "@/i18n/config";
import { getI18n } from "@/i18n";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

// Only used for numbers (times, scores), so it isn't worth delaying the first
// paint by preloading it.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
  preload: false,
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t.meta.appName, template: `%s · ${t.meta.appName}` },
    description: t.meta.description,
    applicationName: t.meta.appName,
    icons: { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#17232d" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    <html lang={await lang()} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
