import type { Metadata } from "next";
import { Geist, Geist_Mono, Yuji_Mai } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pixelCode = localFont({
  src: "../public/fonts/PixelCode-Light.otf",
  variable: "--font-pixel-code",
  weight: "500",
});

const shogiFont = Yuji_Mai({
  variable: "--font-shogi",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shogi Teacher",
  description: "Learn and improve your Shogi skills with AI assistance",
  icons: {
    icon: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pixelCode.variable} ${shogiFont.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
