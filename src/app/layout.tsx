import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { tokensToCss } from "@/design/tokens";
import "./globals.css";

// One typeface for the whole app. The name must match fonts.sans in src/design/tokens.ts.
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Moca CRM", template: "%s | Moca CRM" },
  description: "Moca sales CRM for prospects, customers, deals and follow ups.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={outfit.variable}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: tokensToCss() }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
