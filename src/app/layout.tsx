import type { Metadata } from "next";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/source-serif-4/opsz.css";
import { GeistMono } from "geist/font/mono";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Toaster } from "@/shared/ui/components/sonner";
import { TooltipProvider } from "@/shared/ui/components/tooltip";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  return {
    title: { default: "GCli", template: "%s | GCli" },
    description: t("tagline"),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* Every catalog of the active language goes to the client once (ADR-028). */}
        <NextIntlClientProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="bottom-right" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
