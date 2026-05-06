import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Wiki",
  description: "Compile a personal wiki into a versioned personal website."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
