import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://blockwild.noahhicks.chatgpt.site"),
  title: "Blockwild — Endless Browser Voxel Survival",
  description: "Explore endless streamed biomes, mine deep caves, craft tools, build, smelt, fight creatures, and survive in an original browser voxel world.",
  openGraph: {
    title: "Blockwild — Endless Browser Voxel Survival",
    description: "Explore, build, craft, and survive across an endless original voxel world.",
    type: "website",
    images: [{ url: "/og.png", width: 1527, height: 862, alt: "Blockwild title screen over an endless voxel wilderness" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blockwild — Endless Browser Voxel Survival",
    description: "Explore, build, craft, and survive across an endless original voxel world.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
