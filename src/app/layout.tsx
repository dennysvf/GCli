import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "@/shared/ui/components/sonner";
import { TooltipProvider } from "@/shared/ui/components/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GCli", template: "%s | GCli" },
  description: "Gestão para clínicas",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
