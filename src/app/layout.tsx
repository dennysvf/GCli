import type { Metadata } from "next";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/source-serif-4/opsz.css";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/shared/ui/components/sonner";
import { TooltipProvider } from "@/shared/ui/components/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GCli", template: "%s | GCli" },
  description: "Gestão para clínicas",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
