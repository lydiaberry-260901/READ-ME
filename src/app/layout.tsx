import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { tokensToCss } from "@/design/tokens";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Moca CRM", template: "%s | Moca CRM" },
  description: "Moca sales CRM for prospects, customers, deals and follow ups.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={figtree.variable}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: tokensToCss() }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
