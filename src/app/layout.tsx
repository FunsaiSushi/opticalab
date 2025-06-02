import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opticalab",
  description:
    "A virtual optics bench to test how light travels through lenses and mirrors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
